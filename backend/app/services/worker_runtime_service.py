from datetime import timedelta
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.core.config import WebSettings
from backend.app.core.security import utc_now
from backend.app.models.sync_job import SyncJob
from backend.app.models.worker_runtime import WorkerRuntime
from backend.app.services.m3_common import utc_iso

WorkerAvailability = Literal["online", "busy", "offline"]
WorkerCapacityStatus = Literal["ready", "degraded", "offline"]


def start_worker_runtime(db: Session, worker_name: str, instance_id: str) -> None:
    """注册逻辑 Worker 的新启动代次，不覆盖其他逻辑 Worker。"""
    now = utc_now()
    runtime = db.get(WorkerRuntime, worker_name, with_for_update=True)
    if runtime is None:
        runtime = WorkerRuntime(
            worker_name=worker_name,
            instance_id=instance_id,
            status="idle",
            current_job_id=None,
            started_at=now,
            heartbeat_at=now,
            stopped_at=None,
        )
        db.add(runtime)
        return
    runtime.instance_id = instance_id
    runtime.status = "idle"
    runtime.current_job_id = None
    runtime.started_at = now
    runtime.heartbeat_at = now
    runtime.stopped_at = None


def touch_worker_runtime(
    db: Session,
    worker_name: str,
    instance_id: str,
    *,
    status: Literal["idle", "running"],
    current_job_id: int | None,
) -> None:
    """刷新当前实例心跳，不影响其他 Worker。"""
    runtime = db.get(WorkerRuntime, worker_name, with_for_update=True)
    if runtime is None or runtime.instance_id != instance_id:
        raise RuntimeError("WORKER_RUNTIME_OWNERSHIP_LOST")
    runtime.status = status
    runtime.current_job_id = current_job_id
    runtime.heartbeat_at = utc_now()
    runtime.stopped_at = None


def stop_worker_runtime(db: Session, worker_name: str, instance_id: str) -> None:
    """仅停止当前 Worker 实例。"""
    runtime = db.get(WorkerRuntime, worker_name, with_for_update=True)
    if runtime is None or runtime.instance_id != instance_id:
        return
    now = utc_now()
    runtime.status = "stopped"
    runtime.current_job_id = None
    runtime.heartbeat_at = now
    runtime.stopped_at = now


def worker_runtime_data(db: Session, settings: WebSettings) -> dict[str, object]:
    """聚合所有 Worker，返回页面和健康检查共用的脱敏摘要。"""
    runtimes = list(db.scalars(select(WorkerRuntime)).all())
    offline_after_seconds = max(int(settings.worker_heartbeat_seconds * 3), 1)
    runtime_availability = {
        runtime.worker_name: _availability(runtime, offline_after_seconds) for runtime in runtimes
    }
    online_runtimes = [
        runtime for runtime in runtimes if runtime_availability[runtime.worker_name] != "offline"
    ]
    busy_runtimes = [
        runtime
        for runtime in online_runtimes
        if runtime_availability[runtime.worker_name] == "busy"
    ]
    online_worker_count = len(online_runtimes)
    busy_worker_count = len(busy_runtimes)
    idle_worker_count = online_worker_count - busy_worker_count
    stale_worker_count = sum(
        runtime.stopped_at is None and runtime_availability[runtime.worker_name] == "offline"
        for runtime in runtimes
    )
    capacity_status: WorkerCapacityStatus
    if online_worker_count == 0:
        capacity_status = "offline"
    elif online_worker_count < settings.worker_processes:
        capacity_status = "degraded"
    else:
        capacity_status = "ready"
    availability: WorkerAvailability
    if idle_worker_count > 0:
        availability = "online"
    elif busy_worker_count > 0:
        availability = "busy"
    else:
        availability = "offline"
    busy_runtime = next(iter(busy_runtimes), None)
    latest_runtime = max(runtimes, key=lambda runtime: runtime.heartbeat_at, default=None)
    queue_depth = db.scalar(
        select(func.count(SyncJob.id)).where(
            SyncJob.status == "queued",
            SyncJob.attempt_count < SyncJob.max_attempts,
        )
    )
    oldest_queued_at = db.scalar(
        select(func.min(SyncJob.queued_at)).where(
            SyncJob.status == "queued",
            SyncJob.attempt_count < SyncJob.max_attempts,
        )
    )
    return {
        "availability": availability,
        "capacityStatus": capacity_status,
        "configuredWorkerCount": settings.worker_processes,
        "onlineWorkerCount": online_worker_count,
        "busyWorkerCount": busy_worker_count,
        "idleWorkerCount": idle_worker_count,
        "staleWorkerCount": stale_worker_count,
        "heartbeatAt": utc_iso(latest_runtime.heartbeat_at) if latest_runtime else None,
        "currentJobId": busy_runtime.current_job_id if busy_runtime else None,
        "queueDepth": int(queue_depth or 0),
        "oldestQueuedAt": utc_iso(oldest_queued_at),
        "pollIntervalSeconds": settings.worker_poll_seconds,
        "offlineAfterSeconds": offline_after_seconds,
    }


def queued_job_info(
    db: Session,
    job: SyncJob,
    settings: WebSettings,
) -> dict[str, object] | None:
    """为排队任务生成后端权威原因，避免前端猜测执行状态。"""
    return queued_jobs_info(db, [job], settings).get(job.id)


def queued_jobs_info(
    db: Session,
    jobs: list[SyncJob],
    settings: WebSettings,
) -> dict[int, dict[str, object]]:
    """批量返回排队位置和等待原因，列表页只查询一次队列顺序。"""
    queued_jobs = [job for job in jobs if job.status == "queued"]
    if not queued_jobs:
        return {}
    now = utc_now()
    runtime = worker_runtime_data(db, settings)
    ordered_ids = list(
        db.scalars(
            select(SyncJob.id)
            .where(
                SyncJob.status == "queued",
                SyncJob.attempt_count < SyncJob.max_attempts,
                SyncJob.queued_at <= now,
            )
            .order_by(SyncJob.queued_at, SyncJob.id)
        ).all()
    )
    queue_positions = {job_id: index for index, job_id in enumerate(ordered_ids)}
    result: dict[int, dict[str, object]] = {}
    for job in queued_jobs:
        if job.attempt_count >= job.max_attempts:
            reason_code = "ATTEMPTS_EXHAUSTED"
        elif job.queued_at > now:
            reason_code = "RETRY_BACKOFF"
        elif runtime["availability"] == "offline":
            reason_code = "WORKER_OFFLINE"
        elif runtime["availability"] == "busy":
            reason_code = "WORKER_BUSY"
        else:
            reason_code = "WAITING_FOR_CLAIM"
        result[job.id] = {
            "reasonCode": reason_code,
            "queuedAhead": queue_positions.get(job.id, 0),
            "eligibleAt": utc_iso(job.queued_at),
        }
    return result


def _availability(
    runtime: WorkerRuntime | None,
    offline_after_seconds: int,
) -> WorkerAvailability:
    if runtime is None or runtime.status == "stopped":
        return "offline"
    stale_before = utc_now() - timedelta(seconds=offline_after_seconds)
    if runtime.heartbeat_at < stale_before:
        return "offline"
    if runtime.status == "running" and runtime.current_job_id is not None:
        return "busy"
    return "online"
