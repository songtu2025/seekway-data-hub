from datetime import date, datetime
from typing import Any

from sqlalchemy import func, select, tuple_
from sqlalchemy.orm import Session

from app.api_config_registry import REGISTRY_METADATA_KEY
from app.sync_context import HISTORY_BACKFILL, UPDATE_INCREMENTAL
from backend.app.core.errors import ApiError
from backend.app.core.security import utc_now
from backend.app.models.account_api_policy import AccountApiPolicy, ScheduleMode
from backend.app.models.jijia_account import JijiaAccount, JijiaAccountStatus
from backend.app.models.sync_job import SyncJob
from backend.app.models.sync_records import sync_checkpoint_table
from backend.app.services.api_policy_service import catalog_by_code
from backend.app.services.m3_common import json_object, utc_iso
from backend.app.services.sync_job_planning import (
    BackfillState,
    IncrementalHistory,
    backfill_window_plan,
    current_backfill_state,
    incremental_target_end,
    incremental_window_plan,
    incremental_window_start,
    normalized_window_days,
    policy_local_date,
    supports_incremental_window,
    validate_incremental_window,
)
from backend.app.services.sync_job_service import ACTIVE_JOB_STATUSES, latest_execution_ids

CheckpointMap = dict[tuple[int, str, str], dict[str, Any]]


def list_scheduled_plans(db: Session, now: datetime | None = None) -> list[dict[str, object]]:
    """返回全部已启用定时策略及其当前可执行状态。"""
    current = now or utc_now()
    rows = db.execute(
        select(AccountApiPolicy, JijiaAccount)
        .join(
            JijiaAccount,
            JijiaAccount.id == AccountApiPolicy.jijia_account_id,
        )
        .where(
            AccountApiPolicy.enabled.is_(True),
            AccountApiPolicy.schedule_mode != ScheduleMode.MANUAL_ONLY,
        )
        .order_by(AccountApiPolicy.next_run_at, AccountApiPolicy.id)
    ).all()
    if not rows:
        return []

    keys = {(policy.jijia_account_id, policy.api_code) for policy, _account in rows}
    latest_ids = latest_execution_ids()
    active_jobs = _jobs_by_key(
        db,
        SyncJob.id.in_(select(latest_ids.c.id)) & SyncJob.status.in_(ACTIVE_JOB_STATUSES),
        keys,
    )
    latest_scheduled_jobs = _jobs_by_key(
        db,
        SyncJob.id.in_(
            select(func.max(SyncJob.id))
            .where(SyncJob.trigger_type == "schedule")
            .group_by(SyncJob.jijia_account_id, SyncJob.api_code)
        ),
        keys,
    )
    checkpoints = _checkpoints_by_key(db, keys)
    catalog = catalog_by_code(db)
    return [
        _scheduled_plan_data(
            policy=policy,
            account=account,
            item=catalog.get(policy.api_code),
            active_job=active_jobs.get((policy.jijia_account_id, policy.api_code)),
            latest_job=latest_scheduled_jobs.get((policy.jijia_account_id, policy.api_code)),
            checkpoints=checkpoints,
            current=current,
        )
        for policy, account in rows
    ]


def _scheduled_plan_data(
    *,
    policy: AccountApiPolicy,
    account: JijiaAccount,
    item: dict[str, Any] | None,
    active_job: SyncJob | None,
    latest_job: SyncJob | None,
    checkpoints: CheckpointMap,
    current: datetime,
) -> dict[str, object]:
    due = policy.next_run_at is None or policy.next_run_at <= current
    status = _plan_status(account, item, due, active_job)
    return {
        "id": policy.id,
        "jijiaAccountId": policy.jijia_account_id,
        "accountName": account.name,
        "apiCode": policy.api_code,
        "apiName": str(item.get("name") or policy.api_code) if item else policy.api_code,
        "scheduleMode": policy.schedule_mode.value,
        "scheduleExpr": policy.schedule_expr,
        "timezone": policy.timezone,
        "nextRunAt": utc_iso(policy.next_run_at),
        "status": status,
        "blockingJob": _job_reference(active_job),
        "latestScheduledJob": _job_reference(latest_job),
        "nextWindowPreview": _next_window_preview(
            policy,
            item,
            checkpoints,
            current,
            status,
        ),
    }


def _checkpoints_by_key(db: Session, keys: set[tuple[int, str]]) -> CheckpointMap:
    """一次读取计划所需的历史和增量检查点。"""
    rows = db.execute(
        select(
            sync_checkpoint_table.c.jijia_account_id,
            sync_checkpoint_table.c.api_code,
            sync_checkpoint_table.c.checkpoint_kind,
            sync_checkpoint_table.c.checkpoint_value,
        ).where(
            tuple_(
                sync_checkpoint_table.c.jijia_account_id,
                sync_checkpoint_table.c.api_code,
            ).in_(keys),
            sync_checkpoint_table.c.checkpoint_kind.in_((HISTORY_BACKFILL, UPDATE_INCREMENTAL)),
        )
    ).all()
    return {
        (int(account_id), str(api_code), str(checkpoint_kind)): json_object(value)
        for account_id, api_code, checkpoint_kind, value in rows
    }


def _next_window_preview(
    policy: AccountApiPolicy,
    item: dict[str, Any] | None,
    checkpoints: CheckpointMap,
    current: datetime,
    status: str,
) -> dict[str, object]:
    """按真实计划时点解释下一次数据窗口。"""
    if item is None:
        return _unavailable_preview("no_date_window", "接口配置不可用")
    window_config = item.get("date_window") or {}
    checkpoint_kind = str(item.get("checkpoint_kind") or "date_window")
    if not window_config.get("enabled") or checkpoint_kind != HISTORY_BACKFILL:
        prediction = "unavailable" if status in {"account_inactive", "api_disabled"} else "exact"
        return _preview_data(
            phase="no_date_window",
            basis_label="接口不使用日期窗口",
            start=None,
            end=None,
            complete_through=None,
            lag_days=0,
            max_window_days=None,
            advances_on_success=False,
            prediction_status=prediction,
        )
    return _checkpoint_window_preview(policy, item, checkpoints, current, status)


def _checkpoint_window_preview(
    policy: AccountApiPolicy,
    item: dict[str, Any],
    checkpoints: CheckpointMap,
    current: datetime,
    status: str,
) -> dict[str, object]:
    window_config = item.get("date_window") or {}
    history = checkpoints.get((policy.jijia_account_id, policy.api_code, HISTORY_BACKFILL), {})
    prediction_at = policy.next_run_at if status == "normal" and policy.next_run_at else current
    try:
        update_window = item.get("update_window") or {}
        state = current_backfill_state(
            window_config,
            history,
            update_window,
            normalized_window_days(window_config),
            lambda: policy_local_date(prediction_at, policy.timezone),
        )
        if state.start <= state.frozen_end:
            return _history_preview(policy, item, history, state, status, prediction_at)
        if not supports_incremental_window(update_window):
            return _preview_data(
                phase="history_backfill",
                basis_label=_history_basis(item),
                start=state.start,
                end=None,
                complete_through=_checkpoint_date(history.get("window_end")),
                lag_days=max(int(window_config.get("lag_days") or 0), 0),
                max_window_days=state.window_days,
                advances_on_success=True,
                prediction_status=(
                    "unavailable" if status in {"account_inactive", "api_disabled"} else "caught_up"
                ),
            )
    except (ApiError, KeyError, TypeError, ValueError):
        return _unavailable_preview("history_backfill", _history_basis(item))
    try:
        return _incremental_preview(
            policy, item, checkpoints, history, state, status, prediction_at
        )
    except (ApiError, KeyError, TypeError, ValueError):
        return _unavailable_preview("update_incremental", "按修改时间增量")


def _history_preview(
    policy: AccountApiPolicy,
    item: dict[str, Any],
    history: dict[str, Any],
    state: BackfillState,
    status: str,
    prediction_at: datetime,
) -> dict[str, object]:
    update_window = item.get("update_window") or {}
    plan = backfill_window_plan(
        state,
        history,
        update_window,
        history.get("backfill_started_at") or utc_iso(prediction_at),
        policy.timezone,
    )
    target_is_dynamic = status in {"blocked", "overdue"} and not history.get("frozen_window_end")
    prediction_status = (
        "unavailable"
        if status in {"account_inactive", "api_disabled"}
        else "dynamic"
        if target_is_dynamic
        else "exact"
    )
    return _preview_data(
        phase="history_backfill",
        basis_label=_history_basis(item),
        start=plan.start,
        end=None if target_is_dynamic else plan.end,
        complete_through=_checkpoint_date(history.get("window_end")),
        lag_days=max(int((item.get("date_window") or {}).get("lag_days") or 0), 0),
        max_window_days=state.window_days,
        advances_on_success=True,
        prediction_status=prediction_status,
    )


def _incremental_preview(
    policy: AccountApiPolicy,
    item: dict[str, Any],
    checkpoints: CheckpointMap,
    history: dict[str, Any],
    state: BackfillState,
    status: str,
    prediction_at: datetime,
) -> dict[str, object]:
    update_window = item.get("update_window") or {}
    validate_incremental_window(update_window)
    incremental = checkpoints.get(
        (policy.jijia_account_id, policy.api_code, UPDATE_INCREMENTAL),
        {},
    )
    start, started_at = incremental_window_start(incremental, history, policy.timezone)
    lag_days = max(int(update_window.get("lag_days") or 0), 0)
    target = incremental_target_end(policy.timezone, lag_days, prediction_at)
    if status in {"account_inactive", "api_disabled"}:
        return _open_incremental_preview(
            incremental,
            history,
            update_window,
            start,
            lag_days,
            prediction_status="unavailable",
        )
    if status in {"blocked", "overdue"}:
        return _open_incremental_preview(
            incremental,
            history,
            update_window,
            start,
            lag_days,
            prediction_status="dynamic",
        )
    if start > target:
        return _open_incremental_preview(
            incremental,
            history,
            update_window,
            start,
            lag_days,
            prediction_status="caught_up",
        )
    plan = incremental_window_plan(
        update_window,
        start,
        target,
        IncrementalHistory(
            checkpoint=history,
            end=state.frozen_end,
            window_count=state.total_windows,
            policy_timezone=policy.timezone,
        ),
        started_at,
    )
    return _preview_data(
        phase="update_incremental",
        basis_label="按修改时间增量",
        start=plan.start,
        end=plan.end,
        complete_through=_incremental_complete_through(incremental, history),
        lag_days=lag_days,
        max_window_days=normalized_window_days(update_window),
        advances_on_success=True,
        prediction_status="exact",
    )


def _open_incremental_preview(
    incremental: dict[str, Any],
    history: dict[str, Any],
    update_window: dict[str, Any],
    start: date,
    lag_days: int,
    *,
    prediction_status: str,
) -> dict[str, object]:
    return _preview_data(
        phase="update_incremental",
        basis_label="按修改时间增量",
        start=start,
        end=None,
        complete_through=_incremental_complete_through(incremental, history),
        lag_days=lag_days,
        max_window_days=normalized_window_days(update_window),
        advances_on_success=True,
        prediction_status=prediction_status,
    )


def _incremental_complete_through(
    incremental: dict[str, Any],
    history: dict[str, Any],
) -> str | None:
    return _checkpoint_date(incremental.get("window_end") or history.get("window_end"))


def _history_basis(item: dict[str, Any]) -> str:
    if item.get("api_code") == "sale_return_order_page":
        return "按退货时间回填"
    return "按业务日期回填"


def _checkpoint_date(value: Any) -> str | None:
    return str(value)[:10] if value else None


def _unavailable_preview(phase: str, basis_label: str) -> dict[str, object]:
    return _preview_data(
        phase=phase,
        basis_label=basis_label,
        start=None,
        end=None,
        complete_through=None,
        lag_days=0,
        max_window_days=None,
        advances_on_success=False,
        prediction_status="unavailable",
    )


def _preview_data(
    *,
    phase: str,
    basis_label: str,
    start: date | None,
    end: date | None,
    complete_through: str | None,
    lag_days: int,
    max_window_days: int | None,
    advances_on_success: bool,
    prediction_status: str,
) -> dict[str, object]:
    return {
        "phase": phase,
        "basisLabel": basis_label,
        "nextStartDate": start.isoformat() if start else None,
        "nextEndDate": end.isoformat() if end else None,
        "completeThrough": complete_through,
        "lagDays": lag_days,
        "maxWindowDays": max_window_days,
        "advancesOnSuccess": advances_on_success,
        "predictionStatus": prediction_status,
    }


def _jobs_by_key(
    db: Session,
    condition: Any,
    keys: set[tuple[int, str]],
) -> dict[tuple[int, str], SyncJob]:
    jobs = db.scalars(select(SyncJob).where(condition).order_by(SyncJob.id.desc())).all()
    result: dict[tuple[int, str], SyncJob] = {}
    for job in jobs:
        if job.api_code is None:
            continue
        key = (job.jijia_account_id, job.api_code)
        if key in keys:
            result.setdefault(key, job)
    return result


def _plan_status(
    account: JijiaAccount,
    item: dict[str, Any] | None,
    due: bool,
    active_job: SyncJob | None,
) -> str:
    if account.status != JijiaAccountStatus.ACTIVE:
        return "account_inactive"
    registry = item.get(REGISTRY_METADATA_KEY) if item else None
    if not registry or not bool(registry.get("platformEnabled")):
        return "api_disabled"
    if due and active_job is not None:
        return "blocked"
    if due:
        return "overdue"
    return "normal"


def _job_reference(job: SyncJob | None) -> dict[str, object] | None:
    if job is None:
        return None
    return {
        "id": job.id,
        "taskNo": job.task_no or job.job_no,
        "status": job.status,
    }
