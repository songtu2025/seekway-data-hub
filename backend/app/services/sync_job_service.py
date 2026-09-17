import hashlib
import json
import secrets
from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import and_, case, func, select
from sqlalchemy.orm import Session, aliased

from app.api_config_registry import REGISTRY_METADATA_KEY
from app.sync_context import HISTORY_BACKFILL, UPDATE_INCREMENTAL
from backend.app.core.config import WebSettings
from backend.app.core.errors import ApiError
from backend.app.core.security import utc_now
from backend.app.models.account_api_policy import AccountApiPolicy
from backend.app.models.jijia_account import JijiaAccount, JijiaAccountStatus
from backend.app.models.sync_job import SyncJob
from backend.app.models.sync_records import (
    raw_api_data_table,
    sync_api_log_table,
    sync_batch_table,
    sync_checkpoint_table,
)
from backend.app.services.api_policy_service import catalog_by_code
from backend.app.services.audit_service import add_audit_log
from backend.app.services.m3_common import (
    DEFAULT_PAGE_SIZE,
    cursor_before,
    decode_cursor,
    encode_cursor,
    json_object,
    json_value,
    page_size,
    public_history_progress,
    utc_iso,
)
from backend.app.services.sync_job_factory import SyncJobSpec, build_sync_job
from backend.app.services.sync_job_planning import (
    IncrementalHistory,
    ManualPreviewRequest,
    WindowPlan,
    backfill_state,
    backfill_window_plan,
    checkpoint_preview,
    incremental_target_end,
    incremental_window_plan,
    incremental_window_start,
    manual_range_preview,
    no_date_window_plan,
    normalized_window_days,
    validate_incremental_window,
)
from backend.app.services.sync_job_planning import policy_local_date as policy_local_date
from backend.app.services.sync_job_read_service import (
    api_display_name,
    available_actions,
    failure_info,
    progress_summary,
)
from backend.app.services.worker_runtime_service import queued_jobs_info, worker_runtime_data

ACTIVE_JOB_STATUSES = ("queued", "running", "pause_requested", "paused")
RETRYABLE_JOB_STATUSES = ("failed", "partial_failed")
CAUGHT_UP_RESOLUTION = "incremental_caught_up"
TASK_STATUS_GROUPS = {
    "active": ("in_progress", "pausing"),
    "attention": ("paused", "attention"),
    "success": ("success", "caught_up"),
    "ended": ("terminated",),
}
LOGICAL_TASK_STATUSES = frozenset(
    {"in_progress", "pausing", "paused", "attention", "success", "caught_up", "terminated"}
)


class ScheduledJobOutcome(StrEnum):
    """区分计划槽位已消费和暂时被活动任务阻塞。"""

    CREATED = "created"
    EXISTING = "existing"
    BLOCKED = "blocked"


class RetryJobOutcome(StrEnum):
    """区分实际入队和检查点已覆盖的幂等结果。"""

    QUEUED = "queued"
    ALREADY_CAUGHT_UP = "already_caught_up"


@dataclass(frozen=True)
class RetryJobResult:
    """返回重试动作的业务结果及对应执行记录。"""

    outcome: RetryJobOutcome
    job: SyncJob


def task_window_progress(job: SyncJob) -> tuple[int, int]:
    """返回逻辑任务已完成窗口数和冻结窗口总数。"""
    progress = json_object(job.progress_json)
    total_windows = _positive_int(progress.get("totalWindows")) or max(job.total_windows, 1)
    completed_value = progress.get("completedWindows")
    if completed_value is None:
        completed_windows = min(job.window_index, total_windows) if job.status == "success" else 0
    else:
        try:
            completed_windows = int(completed_value)
        except (TypeError, ValueError):
            completed_windows = (
                min(job.window_index, total_windows) if job.status == "success" else 0
            )
    return min(max(completed_windows, 0), total_windows), total_windows


def task_status(job: SyncJob) -> str:
    """把当前执行状态折叠为面向用户的逻辑任务状态。"""
    if job.resolution_code == CAUGHT_UP_RESOLUTION:
        return "caught_up"
    if job.status in {"queued", "running"}:
        return "in_progress"
    if job.status == "pause_requested":
        return "pausing"
    if job.status == "paused":
        return "paused"
    if job.status in {"failed", "partial_failed"}:
        return "attention"
    if job.status in {"cancelled", "stopped"}:
        return "terminated"
    if job.status == "success" and job.window_index >= max(job.total_windows, 1):
        return "success"
    return "in_progress"


def job_data(
    job: SyncJob,
    account_name: str | None,
    sync_run_id: int | None = None,
    *,
    catalog: dict[str, dict[str, Any]] | None = None,
    request_count: int | None = None,
    success_api_count: int | None = None,
    failed_api_count: int | None = None,
    current_job: SyncJob | None = None,
    task_created_at: datetime | None = None,
    last_updated_at: datetime | None = None,
) -> dict[str, object]:
    """序列化冻结的任务契约并明确所有时间为 UTC。"""
    current = current_job or job
    completed_windows, total_windows = task_window_progress(current)
    return {
        "id": job.id,
        "jobNo": job.job_no,
        "taskNo": job.task_no or job.job_no,
        "jijiaAccountId": job.jijia_account_id,
        "accountName": account_name,
        "apiCode": job.api_code or "",
        "apiName": api_display_name(job, catalog or {}),
        "jobType": job.job_type,
        "triggerType": job.trigger_type,
        "status": job.status,
        "taskStatus": task_status(current),
        "executionStatus": current.status,
        "currentExecutionId": current.id,
        "taskCreatedAt": utc_iso(task_created_at or current.created_at),
        "lastUpdatedAt": utc_iso(last_updated_at or current.updated_at),
        "completedWindows": completed_windows,
        "rangeMode": job.range_mode or "checkpoint",
        "taskStart": job.task_start.isoformat() if job.task_start else None,
        "taskEnd": job.task_end.isoformat() if job.task_end else None,
        "windowStart": job.window_start.isoformat() if job.window_start else None,
        "windowEnd": job.window_end.isoformat() if job.window_end else None,
        "windowIndex": job.window_index,
        "totalWindows": total_windows,
        "advanceCheckpoint": job.advance_checkpoint,
        "marketIds": list(job.market_ids_json or []),
        "stopAfterCurrent": job.stop_after_current,
        "pauseRequestedAt": utc_iso(job.pause_requested_at),
        "pausedAt": utc_iso(job.paused_at),
        "syncBatchNo": job.sync_batch_no,
        "syncRunId": sync_run_id,
        "attemptCount": job.attempt_count,
        "maxAttempts": job.max_attempts,
        "queuedAt": utc_iso(job.queued_at),
        "heartbeatAt": utc_iso(job.heartbeat_at),
        "retryOfJobId": job.retry_of_job_id,
        "apiConfigVersion": job.api_config_version,
        "apiConfigHash": job.api_config_hash,
        "createdAt": utc_iso(job.created_at),
        "startedAt": utc_iso(job.started_at),
        "finishedAt": utc_iso(job.finished_at),
        "errorCode": job.error_code,
        "errorMessage": job.error_message,
        "resolutionCode": job.resolution_code,
        "resolvedAt": utc_iso(job.resolved_at),
        "historyProgress": public_history_progress(job.progress_json),
        "progressSummary": progress_summary(
            job,
            request_count=request_count,
            success_api_count=success_api_count,
            failed_api_count=failed_api_count,
        ),
        "availableActions": available_actions(job, has_batch=sync_run_id is not None),
        "failureInfo": failure_info(job),
    }


def create_manual_job(
    db: Session,
    account_id: int,
    api_code: str,
    actor_id: int,
    request_id: str,
    settings: WebSettings,
    range_mode: str = "checkpoint",
    start_date: date | None = None,
    end_date: date | None = None,
    preview_token: str | None = None,
    market_ids: list[int] | None = None,
) -> SyncJob:
    """校验账号、策略和只读目录后，仅创建队列记录。"""
    account, policy, api = _eligible_target(
        db,
        account_id,
        api_code,
    )
    normalized_market_ids = _validate_market_ids(db, account.id, api, market_ids)
    _ensure_no_active_job(db, account_id, api_code)
    preview = _manual_job_preview(
        db,
        account,
        policy,
        api,
        ManualPreviewRequest(
            range_mode=range_mode,
            start_date=start_date,
            end_date=end_date,
        ),
    )
    current_preview_token = _preview_token(
        account.id,
        api_code,
        range_mode,
        preview,
        normalized_market_ids,
    )
    if preview_token is not None and preview_token != current_preview_token:
        raise ApiError(
            409,
            "SYNC_WINDOW_CHANGED",
            "系统检查点或可用日期已变化，请重新确认执行预览",
        )
    first_window = preview["windows"][0]
    job_type = str(preview["jobType"])
    window_start = first_window[0]
    window_end = first_window[1]
    progress = dict(preview["progress"] or {}) or None
    task_no = f"task_{secrets.token_hex(12)}"
    job = build_sync_job(
        SyncJobSpec(
            account_id=account.id,
            api_code=api_code,
            job_type=job_type,
            trigger_type="manual",
            requested_by=actor_id,
            window_start=window_start,
            window_end=window_end,
            progress=progress,
            task_no=task_no,
            task_start=preview["startDate"],
            task_end=preview["endDate"],
            range_mode=range_mode,
            total_windows=len(preview["windows"]),
            advance_checkpoint=range_mode == "checkpoint",
            api_config=api,
            market_ids=normalized_market_ids,
        ),
        queued_at=utc_now(),
    )
    db.add(job)
    db.flush()
    add_audit_log(
        db,
        actor_user_id=actor_id,
        jijia_account_id=account.id,
        action="sync_job.create",
        resource_type="sync_job",
        resource_id=job.id,
        request_id=request_id,
        result="success",
        changes={
            "apiCode": api_code,
            "triggerType": "manual",
            "rangeMode": range_mode,
            "startDate": preview["startDate"].isoformat() if preview["startDate"] else None,
            "endDate": preview["endDate"].isoformat() if preview["endDate"] else None,
            "scopeMode": "selected" if normalized_market_ids else "all",
            "marketCount": len(normalized_market_ids or []),
        },
    )
    db.commit()
    db.refresh(job)
    return job


def preview_manual_job(
    db: Session,
    account_id: int,
    api_code: str,
    settings: WebSettings,
    range_mode: str = "checkpoint",
    start_date: date | None = None,
    end_date: date | None = None,
    market_ids: list[int] | None = None,
) -> dict[str, object]:
    """在不入队的前提下返回服务端实际拆窗结果。"""
    account, policy, api = _read_eligible_target(db, account_id, api_code)
    normalized_market_ids = _validate_market_ids(db, account.id, api, market_ids)
    preview = _manual_job_preview(
        db,
        account,
        policy,
        api,
        ManualPreviewRequest(
            range_mode=range_mode,
            start_date=start_date,
            end_date=end_date,
        ),
    )
    windows = preview["windows"]
    active_job = _active_job(db, account_id, api_code)
    worker = worker_runtime_data(db, settings)
    progress = json_object(preview["progress"])
    recent_success_at = db.scalar(
        select(
            func.max(
                func.coalesce(
                    sync_api_log_table.c.finished_at,
                    sync_api_log_table.c.created_at,
                )
            )
        ).where(
            sync_api_log_table.c.jijia_account_id == account.id,
            sync_api_log_table.c.api_code == api_code,
            sync_api_log_table.c.status == "success",
        )
    )
    return {
        "rangeMode": range_mode,
        "supportsDateWindow": bool((api.get("date_window") or {}).get("enabled")),
        "scopeMode": "selected" if normalized_market_ids else "all",
        "selectedMarketIds": list(normalized_market_ids or []),
        "scopeMessage": _market_scope_message(api, normalized_market_ids),
        "startDate": preview["startDate"].isoformat() if preview["startDate"] else None,
        "endDate": preview["endDate"].isoformat() if preview["endDate"] else None,
        "windowDays": preview["windowDays"],
        "windowCount": len(windows),
        "windows": [
            {
                "index": index,
                "startDate": start.isoformat() if start else None,
                "endDate": end.isoformat() if end else None,
            }
            for index, (start, end) in enumerate(windows, start=1)
        ],
        "previewToken": _preview_token(
            account.id,
            api_code,
            range_mode,
            preview,
            normalized_market_ids,
        ),
        "activeTask": (
            {
                "id": active_job.id,
                "taskNo": active_job.task_no or active_job.job_no,
                "status": active_job.status,
            }
            if active_job is not None
            else None
        ),
        "checkpoint": (
            {
                "completeThrough": progress.get("historyCompleteThrough"),
                "nextWindowStart": preview["startDate"].isoformat()
                if preview["startDate"]
                else None,
                "advancesOnSuccess": range_mode == "checkpoint",
            }
            if bool((api.get("date_window") or {}).get("enabled"))
            else None
        ),
        "recentSuccessfulRunAt": utc_iso(recent_success_at),
        "executionReadiness": {
            "workerAvailability": worker["availability"],
            "queueDepth": worker["queueDepth"],
        },
    }


def retry_job(
    db: Session,
    job_id: int,
    actor_id: int,
    request_id: str,
    settings: WebSettings,
) -> RetryJobResult:
    """失败任务重试会创建新任务，保留旧任务作为不可变执行证据。"""
    original = db.get(SyncJob, job_id, with_for_update=True)
    if original is None:
        raise ApiError(404, "SYNC_JOB_NOT_FOUND", "同步任务不存在")
    if original.status not in RETRYABLE_JOB_STATUSES:
        raise ApiError(409, "SYNC_JOB_NOT_RETRYABLE", "只有失败任务可以重试")
    if original.resolution_code == CAUGHT_UP_RESOLUTION:
        return RetryJobResult(RetryJobOutcome.ALREADY_CAUGHT_UP, original)
    if not original.api_code:
        raise ApiError(409, "SYNC_JOB_API_MISSING", "任务缺少接口标识")
    account, policy, api = _eligible_target(
        db,
        original.jijia_account_id,
        original.api_code,
    )
    _ensure_no_active_job(db, original.jijia_account_id, original.api_code)
    if original.range_mode == "custom":
        window_plan = WindowPlan(
            job_type=original.job_type,
            start=original.window_start,
            end=original.window_end,
            progress=json_object(original.progress_json) or None,
        )
    else:
        try:
            window_plan = _job_window(
                db,
                account,
                policy,
                api,
            )
        except ApiError as error:
            if error.code != "INCREMENTAL_CAUGHT_UP":
                raise
            original.resolution_code = CAUGHT_UP_RESOLUTION
            original.resolved_at = utc_now()
            add_audit_log(
                db,
                actor_user_id=actor_id,
                jijia_account_id=original.jijia_account_id,
                action="sync_job.retry_noop",
                resource_type="sync_job",
                resource_id=original.id,
                request_id=request_id,
                result="success",
                changes={"resolutionCode": CAUGHT_UP_RESOLUTION},
            )
            db.commit()
            db.refresh(original)
            return RetryJobResult(RetryJobOutcome.ALREADY_CAUGHT_UP, original)
    if window_plan.job_type == original.job_type and window_plan.start == original.window_start:
        window_plan = WindowPlan(
            job_type=window_plan.job_type,
            start=window_plan.start,
            end=original.window_end,
            progress=json_object(original.progress_json) or None,
        )
        progress = window_plan.progress
        if progress is not None:
            # 同窗口重试会从第一页重新执行，旧页码不能继续对外展示。
            progress["currentPage"] = 0
            progress["totalPages"] = 0
    job = build_sync_job(
        SyncJobSpec(
            account_id=original.jijia_account_id,
            api_code=original.api_code,
            job_type=window_plan.job_type,
            trigger_type="retry",
            requested_by=actor_id,
            window_start=window_plan.start,
            window_end=window_plan.end,
            progress=window_plan.progress,
            retry_of_job_id=original.id,
            task_no=original.task_no,
            task_start=original.task_start,
            task_end=original.task_end,
            range_mode=original.range_mode or "checkpoint",
            window_index=original.window_index,
            total_windows=original.total_windows,
            advance_checkpoint=original.advance_checkpoint,
            api_config=api,
            market_ids=list(original.market_ids_json or []) or None,
        ),
        queued_at=utc_now(),
    )
    db.add(job)
    db.flush()
    add_audit_log(
        db,
        actor_user_id=actor_id,
        jijia_account_id=original.jijia_account_id,
        action="sync_job.retry",
        resource_type="sync_job",
        resource_id=job.id,
        request_id=request_id,
        result="success",
        changes={"retryOfJobId": original.id},
    )
    db.commit()
    db.refresh(job)
    return RetryJobResult(RetryJobOutcome.QUEUED, job)


def request_pause_job(db: Session, job_id: int, actor_id: int, request_id: str) -> SyncJob:
    """请求 Worker 在当前页提交成功后暂停。"""
    job = db.get(SyncJob, job_id, with_for_update=True)
    if job is None:
        raise ApiError(404, "SYNC_JOB_NOT_FOUND", "同步任务不存在")
    if job.status == "pause_requested":
        return job
    if job.status != "running":
        raise ApiError(409, "SYNC_JOB_NOT_PAUSABLE", "只有运行中的任务可以暂停")
    job.status = "pause_requested"
    job.pause_requested_at = utc_now()
    add_audit_log(
        db,
        actor_user_id=actor_id,
        jijia_account_id=job.jijia_account_id,
        action="sync_job.pause_request",
        resource_type="sync_job",
        resource_id=job.id,
        request_id=request_id,
        result="success",
        changes={"status": "pause_requested"},
    )
    db.commit()
    db.refresh(job)
    return job


def withdraw_pause_job(db: Session, job_id: int, actor_id: int, request_id: str) -> SyncJob:
    """仅在 Worker 尚未落实暂停时撤销请求。"""
    job = db.get(SyncJob, job_id, with_for_update=True)
    if job is None:
        raise ApiError(404, "SYNC_JOB_NOT_FOUND", "同步任务不存在")
    if job.status != "pause_requested":
        raise ApiError(409, "SYNC_JOB_PAUSE_NOT_PENDING", "当前没有可撤销的暂停请求")
    job.status = "running"
    job.pause_requested_at = None
    add_audit_log(
        db,
        actor_user_id=actor_id,
        jijia_account_id=job.jijia_account_id,
        action="sync_job.pause_withdraw",
        resource_type="sync_job",
        resource_id=job.id,
        request_id=request_id,
        result="success",
        changes={"status": "running"},
    )
    db.commit()
    db.refresh(job)
    return job


def resume_job(
    db: Session,
    job_id: int,
    actor_id: int,
    request_id: str,
    settings: WebSettings,
) -> SyncJob:
    """从暂停窗口第一页创建新执行，保留原批次证据。"""
    original, api_code = _resumable_job(db.get(SyncJob, job_id))
    account_id = original.jijia_account_id
    _eligible_target(db, account_id, api_code)
    original, locked_api_code = _resumable_job(
        db.scalar(
            select(SyncJob)
            .where(SyncJob.id == job_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    )
    if original.jijia_account_id != account_id or locked_api_code != api_code:
        raise RuntimeError("同步任务身份已变化")
    current = current_task_job(db, original.task_no or original.job_no, for_update=True)
    if current.id != original.id:
        raise ApiError(409, "SYNC_JOB_NOT_CURRENT", "只能继续当前执行")
    _eligible_account(db, account_id, refresh=True)
    active = _active_job_id(db, original.jijia_account_id, api_code)
    if active is not None and active != original.id:
        raise ApiError(409, "SYNC_JOB_ALREADY_ACTIVE", "该账号接口已有进行中任务")
    progress = json_object(original.progress_json) or {}
    progress["currentPage"] = 0
    progress["totalPages"] = 0
    job = build_sync_job(
        SyncJobSpec(
            account_id=original.jijia_account_id,
            api_code=api_code,
            job_type=original.job_type,
            trigger_type="retry",
            requested_by=actor_id,
            window_start=original.window_start,
            window_end=original.window_end,
            progress=progress,
            retry_of_job_id=original.id,
            task_no=original.task_no or original.job_no,
            task_start=original.task_start,
            task_end=original.task_end,
            range_mode=original.range_mode or "checkpoint",
            window_index=original.window_index,
            total_windows=original.total_windows,
            advance_checkpoint=original.advance_checkpoint,
            api_config_version=original.api_config_version,
            api_config_hash=original.api_config_hash,
            api_config_snapshot_json=original.api_config_snapshot_json,
            market_ids=list(original.market_ids_json or []) or None,
        ),
        queued_at=utc_now(),
    )
    db.add(job)
    db.flush()
    add_audit_log(
        db,
        actor_user_id=actor_id,
        jijia_account_id=job.jijia_account_id,
        action="sync_job.resume",
        resource_type="sync_job",
        resource_id=job.id,
        request_id=request_id,
        result="success",
        changes={"resumeOfJobId": original.id},
    )
    db.commit()
    db.refresh(job)
    return job


def stop_job(db: Session, job_id: int, actor_id: int, request_id: str) -> SyncJob:
    """停止当前逻辑任务的后续窗口，不改变定时策略。"""
    job = db.get(SyncJob, job_id, with_for_update=True)
    if job is None:
        raise ApiError(404, "SYNC_JOB_NOT_FOUND", "同步任务不存在")
    if job.status == "paused":
        job.status = "stopped"
        job.finished_at = utc_now()
        changes: dict[str, object] = {"status": "stopped"}
    elif job.status in {"running", "pause_requested"}:
        job.stop_after_current = True
        changes = {"stopAfterCurrent": True}
    else:
        raise ApiError(409, "SYNC_JOB_NOT_STOPPABLE", "当前状态不能停止后续窗口")
    add_audit_log(
        db,
        actor_user_id=actor_id,
        jijia_account_id=job.jijia_account_id,
        action="sync_job.stop",
        resource_type="sync_job",
        resource_id=job.id,
        request_id=request_id,
        result="success",
        changes=changes,
    )
    db.commit()
    db.refresh(job)
    return job


def cancel_job(
    db: Session,
    job_id: int,
    actor_id: int,
    request_id: str,
) -> SyncJob:
    """取消尚未被 Worker 领取且没有创建批次的排队任务。"""
    job = db.get(SyncJob, job_id, with_for_update=True)
    if job is None:
        raise ApiError(404, "SYNC_JOB_NOT_FOUND", "同步任务不存在")
    if job.status == "cancelled":
        return job
    if job.status != "queued":
        raise ApiError(409, "SYNC_JOB_NOT_CANCELLABLE", "只有排队中的任务可以取消")
    batch_id = db.scalar(
        select(sync_batch_table.c.id).where(sync_batch_table.c.sync_job_id == job.id).limit(1)
    )
    if batch_id is not None:
        raise ApiError(409, "SYNC_JOB_BATCH_EXISTS", "任务已经创建同步批次，不能取消")

    job.status = "cancelled"
    job.finished_at = utc_now()
    job.error_code = None
    job.error_message = None
    add_audit_log(
        db,
        actor_user_id=actor_id,
        jijia_account_id=job.jijia_account_id,
        action="sync_job.cancel",
        resource_type="sync_job",
        resource_id=job.id,
        request_id=request_id,
        result="success",
        changes={"status": "cancelled"},
    )
    db.commit()
    db.refresh(job)
    return job


def create_scheduled_job(
    db: Session,
    policy: AccountApiPolicy,
    scheduled_for: datetime,
    settings: WebSettings,
) -> ScheduledJobOutcome:
    """创建或确认计划槽位；活动任务阻塞时保留原到期时间。"""
    account, current_policy, api = _eligible_target(
        db,
        policy.jijia_account_id,
        policy.api_code,
    )
    if current_policy.id != policy.id:
        raise RuntimeError("同步策略身份不一致")
    schedule_slot_key = f"policy:{policy.id}:{scheduled_for:%Y%m%dT%H%M%S}"
    existing = db.scalar(
        select(SyncJob.id).where(
            SyncJob.schedule_slot_key == schedule_slot_key,
            SyncJob.jijia_account_id == account.id,
            SyncJob.api_code == policy.api_code,
        )
    )
    if existing is not None:
        return ScheduledJobOutcome.EXISTING
    if _active_job_id(db, account.id, policy.api_code) is not None:
        return ScheduledJobOutcome.BLOCKED
    window_plan = _job_window(
        db,
        account,
        current_policy,
        api,
    )
    job = build_sync_job(
        SyncJobSpec(
            account_id=account.id,
            api_code=policy.api_code,
            job_type=window_plan.job_type,
            trigger_type="schedule",
            requested_by=policy.updated_by or policy.created_by,
            window_start=window_plan.start,
            window_end=window_plan.end,
            progress=window_plan.progress,
            schedule_slot_key=schedule_slot_key,
            task_no=f"task_{secrets.token_hex(12)}",
            api_config=api,
        ),
        queued_at=utc_now(),
    )
    db.add(job)
    db.flush()
    add_audit_log(
        db,
        actor_user_id=None,
        jijia_account_id=account.id,
        action="sync_job.schedule",
        resource_type="sync_job",
        resource_id=job.id,
        request_id="worker-scheduler",
        result="success",
        changes={"apiCode": policy.api_code, "scheduledFor": utc_iso(scheduled_for)},
    )
    return ScheduledJobOutcome.CREATED


def get_job(db: Session, job_id: int) -> tuple[SyncJob, str | None, int | None]:
    row = db.execute(
        select(
            SyncJob,
            JijiaAccount.name.label("account_name"),
            _sync_run_id_column(),
        )
        .join(JijiaAccount, JijiaAccount.id == SyncJob.jijia_account_id)
        .where(SyncJob.id == job_id)
    ).first()
    if row is None:
        raise ApiError(404, "SYNC_JOB_NOT_FOUND", "同步任务不存在")
    return row[0], row.account_name, row.sync_run_id


def current_task_job(db: Session, task_no: str, *, for_update: bool = False) -> SyncJob:
    """按任务号读取最新执行；旧数据使用唯一 job_no 作为稳定任务号。"""
    statement = (
        select(SyncJob).where(SyncJob.task_no == task_no).order_by(SyncJob.id.desc()).limit(1)
    )
    if for_update:
        statement = statement.with_for_update()
    job = db.scalar(statement)
    if job is None:
        legacy_statement = select(SyncJob).where(
            SyncJob.task_no.is_(None),
            SyncJob.job_no == task_no,
        )
        if for_update:
            legacy_statement = legacy_statement.with_for_update()
        job = db.scalar(legacy_statement)
    if job is None:
        raise ApiError(404, "SYNC_TASK_NOT_FOUND", "同步任务不存在")
    return job


def get_task(db: Session, task_no: str) -> tuple[SyncJob, str | None, int | None]:
    """通过稳定任务号返回当前执行详情。"""
    return get_job(db, current_task_job(db, task_no).id)


def task_context(db: Session, job: SyncJob) -> tuple[SyncJob, datetime, datetime]:
    """读取指定执行所属逻辑任务的当前执行和时间边界。"""
    if job.task_no:
        condition = SyncJob.task_no == job.task_no
    else:
        condition = SyncJob.id == job.id
    current = db.scalar(select(SyncJob).where(condition).order_by(SyncJob.id.desc()).limit(1))
    timestamps = db.execute(
        select(
            func.min(SyncJob.created_at),
            func.max(SyncJob.updated_at),
        ).where(condition)
    ).one()
    assert current is not None
    assert timestamps[0] is not None
    assert timestamps[1] is not None
    return current, timestamps[0], timestamps[1]


def task_executions(db: Session, job: SyncJob) -> list[dict[str, object]]:
    """按逻辑任务返回不可变执行窗口和批次证据。"""
    statement = select(SyncJob, _sync_run_id_column())
    if job.task_no:
        statement = statement.where(SyncJob.task_no == job.task_no)
    else:
        statement = statement.where(SyncJob.id == job.id)
    rows = db.execute(statement.order_by(SyncJob.id)).all()
    return [
        {
            "id": row[0].id,
            "jobNo": row[0].job_no,
            "triggerType": row[0].trigger_type,
            "windowIndex": row[0].window_index,
            "windowStart": row[0].window_start.isoformat() if row[0].window_start else None,
            "windowEnd": row[0].window_end.isoformat() if row[0].window_end else None,
            "status": row[0].status,
            "syncBatchNo": row[0].sync_batch_no,
            "syncRunId": row.sync_run_id,
            "createdAt": utc_iso(row[0].created_at),
            "startedAt": utc_iso(row[0].started_at),
            "pausedAt": utc_iso(row[0].paused_at),
            "finishedAt": utc_iso(row[0].finished_at),
        }
        for row in rows
    ]


def list_jobs(
    db: Session,
    cursor_value: str | None,
    settings: WebSettings,
    limit: int = DEFAULT_PAGE_SIZE,
    account_id: int | None = None,
    api_code: str | None = None,
    status: str | None = None,
    status_group: str | None = None,
    trigger_type: str | None = None,
) -> dict[str, object]:
    cursor = decode_cursor(cursor_value)
    size = page_size(limit)
    statement = select(
        SyncJob,
        JijiaAccount.name.label("account_name"),
        _sync_run_id_column(),
        _sync_api_metric_column(sync_api_log_table.c.request_count, "request_count"),
        _sync_api_metric_column(sync_api_log_table.c.success_count, "success_api_count"),
        _sync_api_metric_column(sync_api_log_table.c.failed_count, "failed_api_count"),
        _task_timestamp_column("created_at", func.min, "task_created_at"),
        _task_timestamp_column("updated_at", func.max, "task_updated_at"),
    ).join(JijiaAccount, JijiaAccount.id == SyncJob.jijia_account_id)
    latest_ids = latest_execution_ids()
    statement = statement.where(SyncJob.id.in_(select(latest_ids.c.id)))
    if account_id is not None:
        statement = statement.where(SyncJob.jijia_account_id == account_id)
    if api_code:
        statement = statement.where(SyncJob.api_code == api_code)
    if trigger_type:
        statement = statement.where(SyncJob.trigger_type == trigger_type)
    if status:
        if status in LOGICAL_TASK_STATUSES:
            statement = statement.where(_task_status_column() == status)
        else:
            statement = statement.where(SyncJob.status == status)
    elif status_group:
        statement = statement.where(_task_status_column().in_(TASK_STATUS_GROUPS[status_group]))
    if cursor:
        statement = statement.where(cursor_before(SyncJob.created_at, SyncJob.id, cursor))
    rows = db.execute(
        statement.order_by(SyncJob.created_at.desc(), SyncJob.id.desc()).limit(size + 1)
    ).all()
    visible = rows[:size]
    next_cursor = None
    if len(rows) > size and visible:
        next_cursor = encode_cursor(visible[-1][0].created_at, visible[-1][0].id)
    catalog = catalog_by_code(db)
    queue_info = queued_jobs_info(db, [row[0] for row in visible], settings)
    items = [
        {
            **job_data(
                row[0],
                row.account_name,
                row.sync_run_id,
                catalog=catalog,
                request_count=row.request_count,
                success_api_count=row.success_api_count,
                failed_api_count=row.failed_api_count,
                current_job=row[0],
                task_created_at=row.task_created_at,
                last_updated_at=row.task_updated_at,
            ),
            "queueInfo": queue_info.get(row[0].id),
        }
        for row in visible
    ]
    return {
        "items": items,
        "nextCursor": next_cursor,
        "summary": job_summary(db, account_id, api_code),
    }


def job_summary(
    db: Session,
    account_id: int | None = None,
    api_code: str | None = None,
) -> dict[str, int]:
    """按逻辑任务最新执行状态汇总任务工作台数量。"""
    latest_ids = latest_execution_ids()
    logical_status = _task_status_column().label("task_status")
    statement = (
        select(logical_status, func.count(SyncJob.id))
        .where(SyncJob.id.in_(select(latest_ids.c.id)))
        .group_by(logical_status)
    )
    if account_id is not None:
        statement = statement.where(SyncJob.jijia_account_id == account_id)
    if api_code:
        statement = statement.where(SyncJob.api_code == api_code)
    counts = {str(status): int(count) for status, count in db.execute(statement).all()}
    return {
        "total": sum(counts.values()),
        **{
            group: sum(counts.get(status, 0) for status in statuses)
            for group, statuses in TASK_STATUS_GROUPS.items()
        },
    }


def latest_execution_ids() -> Any:
    """每个逻辑任务只保留最新执行记录参与列表和汇总。"""
    return (
        select(func.max(SyncJob.id).label("id"))
        .group_by(func.coalesce(SyncJob.task_no, SyncJob.job_no))
        .subquery()
    )


def _task_status_column() -> Any:
    """生成可用于筛选和汇总的逻辑任务状态表达式。"""
    final_success = and_(
        SyncJob.status == "success",
        SyncJob.window_index >= SyncJob.total_windows,
    )
    return case(
        (SyncJob.resolution_code == CAUGHT_UP_RESOLUTION, "caught_up"),
        (SyncJob.status.in_(("queued", "running")), "in_progress"),
        (SyncJob.status == "pause_requested", "pausing"),
        (SyncJob.status == "paused", "paused"),
        (SyncJob.status.in_(("failed", "partial_failed")), "attention"),
        (SyncJob.status.in_(("cancelled", "stopped")), "terminated"),
        (final_success, "success"),
        else_="in_progress",
    )


def _task_timestamp_column(column_name: str, aggregate: Any, label: str) -> Any:
    """按逻辑任务聚合时间，同时兼容 task_no 为空的旧任务。"""
    candidate = aliased(SyncJob)
    return (
        select(aggregate(getattr(candidate, column_name)))
        .where(
            func.coalesce(candidate.task_no, candidate.job_no)
            == func.coalesce(SyncJob.task_no, SyncJob.job_no)
        )
        .correlate(SyncJob)
        .scalar_subquery()
        .label(label)
    )


def _sync_run_id_column() -> Any:
    """按任务和账号关联运行批次，拒绝跨账号误关联。"""
    return (
        select(sync_batch_table.c.id)
        .where(
            sync_batch_table.c.sync_job_id == SyncJob.id,
            sync_batch_table.c.jijia_account_id == SyncJob.jijia_account_id,
        )
        .correlate(SyncJob)
        .scalar_subquery()
        .label("sync_run_id")
    )


def _sync_api_metric_column(column: Any, label: str) -> Any:
    """按任务冻结批次返回可靠运行计数，没有批次时保持空值。"""
    return (
        select(func.sum(column))
        .where(
            sync_api_log_table.c.sync_batch_no
            == func.coalesce(SyncJob.sync_batch_no, _sync_batch_no_column()),
            sync_api_log_table.c.jijia_account_id == SyncJob.jijia_account_id,
            sync_api_log_table.c.api_code == SyncJob.api_code,
        )
        .correlate(SyncJob)
        .scalar_subquery()
        .label(label)
    )


def job_run_metrics(db: Session, job: SyncJob) -> dict[str, int | None]:
    """读取详情页当前执行批次的接口计数。"""
    batch_no = job.sync_batch_no or db.scalar(
        select(sync_batch_table.c.sync_batch_no).where(
            sync_batch_table.c.sync_job_id == job.id,
            sync_batch_table.c.jijia_account_id == job.jijia_account_id,
        )
    )
    if not batch_no or not job.api_code:
        return {"request_count": None, "success_api_count": None, "failed_api_count": None}
    row = db.execute(
        select(
            func.sum(sync_api_log_table.c.request_count).label("request_count"),
            func.sum(sync_api_log_table.c.success_count).label("success_api_count"),
            func.sum(sync_api_log_table.c.failed_count).label("failed_api_count"),
        ).where(
            sync_api_log_table.c.sync_batch_no == batch_no,
            sync_api_log_table.c.jijia_account_id == job.jijia_account_id,
            sync_api_log_table.c.api_code == job.api_code,
        )
    ).one()
    return {
        "request_count": row.request_count,
        "success_api_count": row.success_api_count,
        "failed_api_count": row.failed_api_count,
    }


def _sync_batch_no_column() -> Any:
    """兼容尚未回填任务字段但已有批次证据的历史记录。"""
    return (
        select(sync_batch_table.c.sync_batch_no)
        .where(
            sync_batch_table.c.sync_job_id == SyncJob.id,
            sync_batch_table.c.jijia_account_id == SyncJob.jijia_account_id,
        )
        .correlate(SyncJob)
        .scalar_subquery()
    )


def _manual_job_preview(
    db: Session,
    account: JijiaAccount,
    policy: AccountApiPolicy,
    api: dict[str, Any],
    request: ManualPreviewRequest,
) -> dict[str, Any]:
    """用接口官方窗口上限生成连续、无重叠的闭区间。"""
    if request.range_mode == "checkpoint":
        return checkpoint_preview(_job_window(db, account, policy, api))
    return manual_range_preview(api, policy.timezone, request)


def _preview_token(
    account_id: int,
    api_code: str,
    range_mode: str,
    preview: dict[str, Any],
    market_ids: list[int] | None = None,
) -> str:
    """绑定服务端实际窗口，提交时可发现检查点变化。"""
    payload = {
        "accountId": account_id,
        "apiCode": api_code,
        "rangeMode": range_mode,
        "marketIds": list(market_ids or []),
        "startDate": str(preview.get("startDate") or ""),
        "endDate": str(preview.get("endDate") or ""),
        "windows": [
            [str(start or ""), str(end or "")] for start, end in preview.get("windows", [])
        ],
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def market_options(
    db: Session,
    account_id: int,
    api_code: str,
) -> list[dict[str, object]]:
    """只返回任务选择所需的站点 ID 和安全显示名。"""
    account, _, api = _read_eligible_target(db, account_id, api_code)
    return _market_options_for_api(db, account.id, api)


def _validate_market_ids(
    db: Session,
    account_id: int,
    api: dict[str, Any],
    market_ids: list[int] | None,
) -> list[int] | None:
    """冻结已验证且仍属于当前账号的店铺站点范围。"""
    normalized = sorted(set(market_ids or []))
    if not normalized:
        return None
    scope = api.get("market_scope") or {}
    if not scope.get("enabled"):
        raise ApiError(409, "MARKET_SCOPE_UNSUPPORTED", "该接口不支持指定店铺站点")
    available_ids: set[int] = set()
    for option in _market_options_for_api(db, account_id, api):
        market_id = _positive_int(option.get("marketId"))
        if market_id is not None:
            available_ids.add(market_id)
    if not set(normalized).issubset(available_ids):
        raise ApiError(
            422,
            "MARKET_SCOPE_INVALID",
            "所选店铺站点已不可用，请重新选择",
        )
    return normalized


def _market_options_for_api(
    db: Session,
    account_id: int,
    api: dict[str, Any],
) -> list[dict[str, object]]:
    scope = api.get("market_scope") or {}
    if not scope.get("enabled"):
        raise ApiError(409, "MARKET_SCOPE_UNSUPPORTED", "该接口不支持指定店铺站点")
    source_api_code = str(scope.get("source_api_code") or "")
    source_array_field = str(scope.get("source_array_field") or "")
    id_field = str(scope.get("id_field") or "")
    if not source_api_code or not source_array_field or not id_field:
        raise ApiError(500, "MARKET_SCOPE_CONFIG_INVALID", "店铺范围配置不完整")
    latest_batch_no = db.scalar(
        select(sync_api_log_table.c.sync_batch_no)
        .where(
            sync_api_log_table.c.jijia_account_id == account_id,
            sync_api_log_table.c.api_code == source_api_code,
            sync_api_log_table.c.status == "success",
        )
        .order_by(
            func.coalesce(
                sync_api_log_table.c.finished_at,
                sync_api_log_table.c.started_at,
            ).desc(),
            sync_api_log_table.c.id.desc(),
        )
        .limit(1)
    )
    if not latest_batch_no:
        return []
    options: dict[int, str] = {}
    raw_rows = db.scalars(
        select(raw_api_data_table.c.raw_json).where(
            raw_api_data_table.c.jijia_account_id == account_id,
            raw_api_data_table.c.api_code == source_api_code,
            raw_api_data_table.c.sync_batch_no == latest_batch_no,
        )
    ).all()
    label_fields = [str(value) for value in scope.get("label_fields") or []]
    for raw_value in raw_rows:
        parent = json_value(raw_value)
        if not isinstance(parent, dict):
            continue
        children = parent.get(source_array_field)
        if not isinstance(children, list):
            continue
        for child in children:
            if not isinstance(child, dict):
                continue
            market_id = _positive_int(child.get(id_field))
            if market_id is None:
                continue
            options.setdefault(
                market_id,
                _market_option_label(parent, child, label_fields, market_id),
            )
    return [{"marketId": market_id, "label": options[market_id]} for market_id in sorted(options)]


def _positive_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        return None
    return normalized if normalized > 0 else None


def _market_option_label(
    parent: dict[str, Any],
    child: dict[str, Any],
    label_fields: list[str],
    market_id: int,
) -> str:
    values = []
    for field in label_fields:
        value = child.get(field, parent.get(field))
        if isinstance(value, (str, int)) and not isinstance(value, bool):
            text = str(value).strip()
            if text and text not in values:
                values.append(text)
    return " · ".join(values) or f"站点 {market_id}"


def _market_scope_message(
    api: dict[str, Any],
    market_ids: list[int] | None,
) -> str:
    if market_ids:
        return f"已按官方 marketIds 参数冻结 {len(market_ids)} 个店铺站点。"
    if (api.get("market_scope") or {}).get("enabled"):
        return "未传 marketIds，按官方契约同步此账号可访问的全部店铺。"
    return "该接口未声明已验证的店铺筛选参数，将同步账号可访问的全部数据。"


def _read_eligible_target(
    db: Session,
    account_id: int,
    api_code: str,
) -> tuple[JijiaAccount, AccountApiPolicy, dict[str, Any]]:
    """只读校验账号、策略和受控接口，不占用策略行锁。"""
    return _load_eligible_target(db, account_id, api_code, lock_policy=False)


def _eligible_target(
    db: Session,
    account_id: int,
    api_code: str,
) -> tuple[JijiaAccount, AccountApiPolicy, dict[str, Any]]:
    """保留既有锁定校验入口，避免写链路绕过策略串行锁。"""
    return _load_eligible_target(db, account_id, api_code, lock_policy=True)


def _load_eligible_target(
    db: Session,
    account_id: int,
    api_code: str,
    *,
    lock_policy: bool,
) -> tuple[JijiaAccount, AccountApiPolicy, dict[str, Any]]:
    account = _eligible_account(db, account_id)

    policy_statement = select(AccountApiPolicy).where(
        AccountApiPolicy.jijia_account_id == account_id,
        AccountApiPolicy.api_code == api_code,
    )
    if lock_policy:
        policy_statement = policy_statement.with_for_update()
    policy = db.scalar(policy_statement)
    if policy is None or not policy.enabled:
        raise ApiError(409, "API_POLICY_DISABLED", "账号接口策略未启用")
    api = catalog_by_code(db).get(api_code)
    if api is None:
        raise ApiError(404, "API_CATALOG_NOT_FOUND", "接口不在受控目录中")
    registry = api.get(REGISTRY_METADATA_KEY) or {}
    if not bool(registry.get("platformEnabled")):
        raise ApiError(409, "API_CONFIG_DISABLED", "接口已被平台全局停用")
    if not bool(registry.get("readOnlyVerified")):
        raise ApiError(409, "API_READ_ONLY_UNCONFIRMED", "接口只读属性未确认")
    return account, policy, api


def _eligible_account(
    db: Session,
    account_id: int,
    *,
    refresh: bool = False,
) -> JijiaAccount:
    account = (
        db.get(JijiaAccount, account_id, populate_existing=True)
        if refresh
        else db.get(JijiaAccount, account_id)
    )
    if account is None:
        raise ApiError(404, "ACCOUNT_NOT_FOUND", "积加账号不存在")
    if account.status != JijiaAccountStatus.ACTIVE:
        raise ApiError(409, "ACCOUNT_NOT_ACTIVE", "账号未处于可同步状态")
    return account


def _resumable_job(job: SyncJob | None) -> tuple[SyncJob, str]:
    """按既有优先级校验可继续任务。"""
    if job is None:
        raise ApiError(404, "SYNC_JOB_NOT_FOUND", "同步任务不存在")
    if job.status != "paused" or job.stop_after_current:
        raise ApiError(409, "SYNC_JOB_NOT_PAUSED", "只有已暂停任务可以继续")
    if not job.api_code:
        raise ApiError(409, "SYNC_JOB_API_MISSING", "任务缺少接口标识")
    return job, job.api_code


def lock_chain_target_if_eligible(
    db: Session,
    account_id: int,
    api_code: str,
) -> bool:
    """复用任务入口校验并锁定策略；失效时只停止自动衔接。"""
    try:
        _eligible_target(db, account_id, api_code)
    except (ApiError, OSError, ValueError, TypeError, AttributeError):
        return False
    return True


def _ensure_no_active_job(db: Session, account_id: int, api_code: str) -> None:
    active = _active_job_id(db, account_id, api_code)
    if active is not None:
        raise ApiError(409, "SYNC_JOB_ALREADY_ACTIVE", "该账号接口已有进行中任务")


def _active_job_id(db: Session, account_id: int, api_code: str) -> int | None:
    """使用锁定读查看最新活动任务，避免 MySQL RR 复用旧快照。"""
    latest_ids = latest_execution_ids()
    return db.scalar(
        select(SyncJob.id)
        .where(
            SyncJob.id.in_(select(latest_ids.c.id)),
            SyncJob.jijia_account_id == account_id,
            SyncJob.api_code == api_code,
            SyncJob.status.in_(ACTIVE_JOB_STATUSES),
        )
        .with_for_update()
    )


def _active_job(db: Session, account_id: int, api_code: str) -> SyncJob | None:
    """只读预览当前活动任务，创建时仍由锁定读做最终校验。"""
    latest_ids = latest_execution_ids()
    return db.scalar(
        select(SyncJob)
        .where(
            SyncJob.id.in_(select(latest_ids.c.id)),
            SyncJob.jijia_account_id == account_id,
            SyncJob.api_code == api_code,
            SyncJob.status.in_(ACTIVE_JOB_STATUSES),
        )
        .order_by(SyncJob.id.desc())
        .limit(1)
    )


def _job_window(
    db: Session,
    account: JijiaAccount,
    policy: AccountApiPolicy,
    api: dict[str, Any],
) -> WindowPlan:
    window_config = api.get("date_window") or {}
    checkpoint_kind = str(api.get("checkpoint_kind") or "date_window")
    if not window_config.get("enabled") or checkpoint_kind != HISTORY_BACKFILL:
        return no_date_window_plan()

    window_days = normalized_window_days(window_config)
    checkpoint = db.execute(
        select(sync_checkpoint_table.c.checkpoint_value).where(
            sync_checkpoint_table.c.jijia_account_id == account.id,
            sync_checkpoint_table.c.api_code == api["api_code"],
            sync_checkpoint_table.c.checkpoint_kind == checkpoint_kind,
        )
    ).scalar_one_or_none()
    checkpoint_data = json_object(checkpoint)
    state = backfill_state(
        window_config,
        checkpoint_data,
        window_days,
        lambda: datetime.now(ZoneInfo(policy.timezone)).date(),
    )
    if state.start > state.frozen_end:
        return _incremental_job_window(
            db,
            account,
            api,
            IncrementalHistory(
                checkpoint=checkpoint_data,
                end=state.frozen_end,
                window_count=state.total_windows,
                policy_timezone=policy.timezone,
            ),
        )
    backfill_started_at = checkpoint_data.get("backfill_started_at") or utc_iso(utc_now())
    update_window = api.get("update_window") or {}
    return backfill_window_plan(
        state,
        checkpoint_data,
        update_window,
        backfill_started_at,
        policy.timezone,
    )


def _incremental_job_window(
    db: Session,
    account: JijiaAccount,
    api: dict[str, Any],
    history: IncrementalHistory,
) -> WindowPlan:
    """历史完成后按官方 updateTime 字段生成连续自然日增量窗口。"""
    update_window = api.get("update_window") or {}
    validate_incremental_window(update_window)
    checkpoint = db.execute(
        select(sync_checkpoint_table.c.checkpoint_value).where(
            sync_checkpoint_table.c.jijia_account_id == account.id,
            sync_checkpoint_table.c.api_code == api["api_code"],
            sync_checkpoint_table.c.checkpoint_kind == UPDATE_INCREMENTAL,
        )
    ).scalar_one_or_none()
    checkpoint_data = json_object(checkpoint)
    start, backfill_started_at = incremental_window_start(
        checkpoint_data,
        history.checkpoint,
        history.policy_timezone,
    )
    incremental_lag_days = max(int(update_window.get("lag_days") or 0), 0)
    target = incremental_target_end(
        history.policy_timezone,
        incremental_lag_days,
        utc_now(),
    )
    return incremental_window_plan(
        update_window,
        start,
        target,
        history,
        backfill_started_at,
    )
