from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.models.base import Base, TimestampMixin

SYNC_JOB_RESOLUTION_CAUGHT_UP = "incremental_caught_up"
SYNC_JOB_RESOLUTION_OPERATOR_DISMISSED = "operator_dismissed"


class SyncJob(TimestampMixin, Base):
    """保存 Web 入队任务、Worker 领取状态和同步批次关联。"""

    __tablename__ = "sync_job"
    __table_args__ = (
        UniqueConstraint("job_no", name="uk_sync_job_job_no"),
        UniqueConstraint("schedule_slot_key", name="uk_sync_job_schedule_slot"),
        CheckConstraint(
            "trigger_type IN ('manual', 'retry', 'schedule')",
            name="ck_sync_job_trigger_type",
        ),
        CheckConstraint(
            "status IN ('queued', 'running', 'pause_requested', 'paused', "
            "'success', 'partial_failed', 'failed', 'cancelled', 'stopped')",
            name="ck_sync_job_status",
        ),
        CheckConstraint(
            "job_type IN ('history_backfill', 'update_incremental', 'sync')",
            name="ck_sync_job_type",
        ),
        Index("idx_sync_job_status_created", "status", "created_at"),
        Index(
            "idx_sync_job_account_api_created",
            "jijia_account_id",
            "api_code",
            "created_at",
        ),
        Index("idx_sync_job_heartbeat", "status", "heartbeat_at"),
        Index("idx_sync_job_claim", "status", "queued_at", "id"),
        Index("idx_sync_job_task_execution", "task_no", "id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_no: Mapped[str] = mapped_column(String(64), nullable=False)
    task_no: Mapped[str | None] = mapped_column(String(64))
    jijia_account_id: Mapped[int] = mapped_column(ForeignKey("jijia_account.id"), nullable=False)
    api_code: Mapped[str | None] = mapped_column(String(100))
    job_type: Mapped[str] = mapped_column(String(32), nullable=False)
    trigger_type: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    schedule_slot_key: Mapped[str | None] = mapped_column(String(100))
    window_start: Mapped[date | None] = mapped_column(Date())
    window_end: Mapped[date | None] = mapped_column(Date())
    task_start: Mapped[date | None] = mapped_column(Date())
    task_end: Mapped[date | None] = mapped_column(Date())
    range_mode: Mapped[str | None] = mapped_column(String(16))
    window_index: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    total_windows: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    advance_checkpoint: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    stop_after_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    progress_json: Mapped[dict[str, Any] | None] = mapped_column(JSON())
    market_ids_json: Mapped[list[int] | None] = mapped_column(JSON())
    api_config_version: Mapped[int | None] = mapped_column(Integer)
    api_config_hash: Mapped[str | None] = mapped_column(String(64))
    api_config_snapshot_json: Mapped[dict[str, Any] | None] = mapped_column(JSON())
    worker_id: Mapped[str | None] = mapped_column(String(100))
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime())
    pause_requested_at: Mapped[datetime | None] = mapped_column(DateTime())
    paused_at: Mapped[datetime | None] = mapped_column(DateTime())
    sync_batch_no: Mapped[str | None] = mapped_column(String(64))
    retry_of_job_id: Mapped[int | None] = mapped_column(ForeignKey("sync_job.id"))
    requested_by: Mapped[int | None] = mapped_column(ForeignKey("app_user.id"))
    queued_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime())
    error_code: Mapped[str | None] = mapped_column(String(64))
    error_message: Mapped[str | None] = mapped_column(Text())
    resolution_code: Mapped[str | None] = mapped_column(String(64))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime())
