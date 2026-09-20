from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models.audit_log import AuditLog
from backend.app.models.sync_job import (
    SYNC_JOB_RESOLUTION_OPERATOR_DISMISSED,
    SyncJob,
)
from backend.app.models.user import AppUser
from backend.app.services.m3_common import json_object, utc_iso

ACTION_BY_STATUS: dict[str, list[str]] = {
    "queued": ["cancel"],
    "running": ["pause", "stop"],
    "pause_requested": ["withdraw_pause", "stop"],
    "paused": ["resume", "stop"],
    "failed": ["retry", "dismiss"],
    "partial_failed": ["retry", "dismiss"],
}

AUDIT_EVENT_TYPES = {
    "sync_job.create": "created",
    "sync_job.schedule": "created",
    "sync_job.retry": "retried",
    "sync_job.retry_noop": "resolved",
    "sync_job.dismiss": "dismissed",
    "sync_job.restore_attention": "attention_restored",
    "sync_job.resume": "resumed",
    "sync_job.pause_request": "pause_requested",
    "sync_job.pause_withdraw": "pause_withdrawn",
    "sync_job.stop": "stop_requested",
    "sync_job.cancel": "cancelled",
}


def api_display_name(job: SyncJob, catalog: dict[str, dict[str, Any]]) -> str:
    """优先使用有效的冻结名称，旧快照只有代码时回退到当前目录。"""
    snapshot = json_object(job.api_config_snapshot_json)
    current = catalog.get(job.api_code or "", {})
    snapshot_name = str(snapshot.get("name") or "")
    current_name = str(current.get("name") or "")
    if snapshot_name and snapshot_name != job.api_code:
        return snapshot_name
    return current_name or snapshot_name or job.api_code or "未知接口"


def available_actions(job: SyncJob, *, has_batch: bool) -> list[str]:
    """返回当前任务状态允许的操作，写接口仍执行最终事务校验。"""
    if job.resolution_code == SYNC_JOB_RESOLUTION_OPERATOR_DISMISSED:
        return ["restore_attention"]
    if job.stop_after_current or job.resolution_code is not None:
        return []
    actions = list(ACTION_BY_STATUS.get(job.status, []))
    if job.status == "queued" and has_batch:
        return []
    return actions


def progress_summary(
    job: SyncJob,
    *,
    request_count: int | None,
    success_api_count: int | None,
    failed_api_count: int | None,
) -> dict[str, int | None]:
    """只暴露已有计数；未知总页数保持为空，不推算百分比。"""
    progress = json_object(job.progress_json)
    current_page = int(progress.get("currentPage") or 0) if progress else 0
    total_pages = int(progress.get("totalPages") or 0) if progress else 0
    return {
        "currentPage": current_page or None,
        "totalPages": total_pages or None,
        "requestCount": request_count,
        "successApiCount": success_api_count,
        "failedApiCount": failed_api_count,
    }


def failure_info(job: SyncJob) -> dict[str, str] | None:
    """按稳定错误码提供处理方向，不向前端复制状态判断。"""
    if job.status not in {"failed", "partial_failed"}:
        return None
    code = (job.error_code or "").upper()
    if any(marker in code for marker in ("AUTH", "TOKEN", "CREDENTIAL")):
        category = "authentication"
        recommendation = "检查账号凭证并重新验证账号，确认恢复后再重试。"
    elif any(marker in code for marker in ("RATE", "LIMIT", "THROTTLE")):
        category = "rate_limit"
        recommendation = "等待接口限流窗口结束，再重试任务。"
    elif any(marker in code for marker in ("CONFIG", "POLICY", "WINDOW", "CATALOG")):
        category = "configuration"
        recommendation = "检查接口策略与运行配置，修正后再重试。"
    elif any(marker in code for marker in ("API", "HTTP", "UPSTREAM")):
        category = "upstream"
        recommendation = "查看失败请求，确认上游接口恢复后再重试。"
    elif any(marker in code for marker in ("DATA", "PARSE", "VALIDATION")):
        category = "data"
        recommendation = "查看失败请求中的数据问题，修正处理条件后再重试。"
    else:
        category = "system"
        recommendation = "查看关联运行日志定位原因，确认问题已恢复后再重试。"
    return {"category": category, "recommendation": recommendation}


def lifecycle_events(
    db: Session,
    job: SyncJob,
    *,
    include_actor: bool = False,
) -> list[dict[str, object]]:
    """组合任务时间戳与控制审计，形成只读生命周期。"""
    executions = list(
        db.scalars(
            select(SyncJob)
            .where(SyncJob.task_no == job.task_no if job.task_no else SyncJob.id == job.id)
            .order_by(SyncJob.id)
        ).all()
    )
    execution_ids = [execution.id for execution in executions]
    audit_rows = db.execute(
        select(AuditLog, AppUser.display_name.label("actor_name"))
        .outerjoin(AppUser, AppUser.id == AuditLog.actor_user_id)
        .where(
            AuditLog.resource_type == "sync_job",
            AuditLog.resource_id.in_([str(value) for value in execution_ids]),
            AuditLog.action.in_(AUDIT_EVENT_TYPES),
        )
        .order_by(AuditLog.created_at, AuditLog.id)
    ).all()
    events: list[dict[str, object]] = []
    audited_creation_ids: set[int] = set()
    for row in audit_rows:
        audit = row[0]
        event_type = AUDIT_EVENT_TYPES[audit.action]
        try:
            execution_id = int(audit.resource_id or "")
        except ValueError:
            continue
        if event_type in {"created", "retried", "resumed"}:
            audited_creation_ids.add(execution_id)
        events.append(
            {
                "id": f"audit-{audit.id}",
                "eventType": event_type,
                "occurredAt": utc_iso(audit.created_at),
                "actorName": row.actor_name if include_actor else None,
                "executionId": execution_id,
                "status": None,
            }
        )

    for execution in executions:
        if execution.id not in audited_creation_ids:
            events.append(
                {
                    "id": f"execution-{execution.id}-created",
                    "eventType": "created",
                    "occurredAt": utc_iso(execution.created_at),
                    "actorName": None,
                    "executionId": execution.id,
                    "status": "queued",
                }
            )
        for event_type, occurred_at, status in (
            ("started", execution.started_at, "running"),
            ("paused", execution.paused_at, "paused"),
            ("finished", execution.finished_at, execution.status),
        ):
            if occurred_at is not None:
                events.append(
                    {
                        "id": f"execution-{execution.id}-{event_type}",
                        "eventType": event_type,
                        "occurredAt": utc_iso(occurred_at),
                        "actorName": None,
                        "executionId": execution.id,
                        "status": status,
                    }
                )
    return sorted(events, key=lambda item: (str(item["occurredAt"]), str(item["id"])))


def lifecycle_event_page(
    db: Session,
    job: SyncJob,
    page: int,
    limit: int,
    *,
    include_actor: bool = False,
) -> dict[str, object]:
    """按最新优先分页返回任务生命周期事件。"""
    events = list(reversed(lifecycle_events(db, job, include_actor=include_actor)))
    start = (page - 1) * limit
    return {
        "items": events[start : start + limit],
        "total": len(events),
        "page": page,
        "pageSize": limit,
    }
