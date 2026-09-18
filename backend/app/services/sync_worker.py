import logging
from collections.abc import Callable
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timedelta
from importlib import import_module
from threading import Event, Thread
from typing import Any, Protocol, cast

from sqlalchemy import Engine, func, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.sql import Select

from app.api_config_registry import (
    REGISTRY_METADATA_KEY,
    api_config_hash,
    api_config_snapshot,
    load_published_api_config,
)
from app.api_rate_limiter import MySqlApiRateLimiter, normalize_rate_limit_key
from app.auth import JijiaAuthClient, JijiaCredentials
from app.config import load_settings
from app.sync_context import (
    DATE_WINDOW,
    HISTORY_BACKFILL,
    MANUAL_RANGE,
    UPDATE_INCREMENTAL,
    SyncContext,
)
from app.sync_lock import SyncLockScope, SyncTaskLockUnavailable, sync_task_lock
from backend.app.core.config import WebSettings
from backend.app.core.credentials import CredentialCipher
from backend.app.core.security import utc_now
from backend.app.models.jijia_account import (
    CredentialSource,
    JijiaAccount,
    JijiaAccountStatus,
)
from backend.app.models.sync_job import SyncJob
from backend.app.models.sync_records import raw_api_data_table, sync_batch_table
from backend.app.services.m3_common import json_object
from backend.app.services.sync_job_factory import SyncJobSpec, build_sync_job
from backend.app.services.sync_job_service import (
    incremental_target_end,
    lock_chain_target_if_eligible,
    policy_local_date,
)
from backend.app.services.worker_runtime_service import (
    start_worker_runtime,
    stop_worker_runtime,
    touch_worker_runtime,
)

logger = logging.getLogger(__name__)
LOCK_BUSY_RETRY_DELAY_SECONDS = 5
MYSQL_DIALECTS = frozenset({"mysql", "mariadb"})


class _SyncJobOwnershipLost(RuntimeError):
    """表示当前执行快照已不再拥有任务。"""


def _claim_candidate_statement(
    now: datetime,
    *,
    skip_locked: bool,
) -> Select[tuple[SyncJob]]:
    """按队列顺序构造领取查询；MySQL 跳过其他 Worker 已锁定的行。"""
    statement = (
        select(SyncJob)
        .where(
            SyncJob.status == "queued",
            SyncJob.queued_at <= now,
            SyncJob.attempt_count < SyncJob.max_attempts,
        )
        .order_by(SyncJob.queued_at, SyncJob.id)
        .limit(1)
    )
    if skip_locked:
        return statement.with_for_update(skip_locked=True)
    return statement


@dataclass(frozen=True)
class SyncJobExecution:
    """向执行器传递已领取任务的不可变快照，避免持有领取事务。"""

    id: int
    jijia_account_id: int
    api_code: str
    job_type: str
    trigger_type: str
    requested_by: int | None
    window_start: Any
    window_end: Any
    progress_json: dict[str, Any] | None
    worker_id: str
    attempt_count: int
    market_ids: tuple[int, ...] = ()
    task_no: str | None = None
    task_start: Any = None
    task_end: Any = None
    range_mode: str | None = None
    window_index: int = 1
    total_windows: int = 1
    advance_checkpoint: bool = True
    api_config_version: int | None = None
    api_config_hash: str | None = None
    api_config_snapshot_json: dict[str, Any] | None = None


@dataclass(frozen=True)
class WorkerResult:
    """执行器返回 Worker 落库所需的最小结果。"""

    status: str
    sync_batch_no: str | None = None
    progress_json: dict[str, Any] | None = None
    error_code: str | None = None
    error_message: str | None = None


@dataclass(frozen=True)
class _ChainedJobPlan:
    """描述下一个链式任务窗口。"""

    job_type: str
    window_start: Any
    window_end: Any
    progress: dict[str, Any]


class SyncJobExecutor(Protocol):
    def execute(
        self,
        job: SyncJobExecution,
        heartbeat: Callable[[], None],
    ) -> WorkerResult:
        """在领取事务之外执行一个任务窗口。"""


def _owns_execution(job: SyncJob | None, execution: SyncJobExecution) -> bool:
    """判断数据库任务是否仍属于同一领取代次。"""
    return bool(
        job is not None
        and job.jijia_account_id == execution.jijia_account_id
        and job.status in {"running", "pause_requested"}
        and job.worker_id == execution.worker_id
        and job.attempt_count == execution.attempt_count
    )


class SyncWorker:
    """用数据库队列串行领取任务，并在外部执行期间维持心跳。"""

    def __init__(
        self,
        session_factory: sessionmaker[Session],
        executor: SyncJobExecutor,
        worker_id: str,
        heartbeat_interval_seconds: float = 30,
        stale_after_seconds: float = 600,
        recovery_lock_engine: Engine | None = None,
        track_runtime: bool = False,
        worker_name: str | None = None,
        sync_lock_scope: SyncLockScope = "global",
    ) -> None:
        self.session_factory = session_factory
        self.executor = executor
        self.worker_id = worker_id
        self.worker_name = worker_name or worker_id
        self.heartbeat_interval_seconds = max(heartbeat_interval_seconds, 0.1)
        self.stale_after_seconds = max(stale_after_seconds, 0.1)
        self.recovery_lock_engine = recovery_lock_engine
        self.track_runtime = track_runtime
        self.sync_lock_scope = sync_lock_scope

    def start_runtime(self) -> None:
        """注册常驻进程，使空闲 Worker 也能被页面识别。"""
        if not self.track_runtime:
            return
        with self.session_factory() as db:
            start_worker_runtime(db, self.worker_name, self.worker_id)
            db.commit()

    def heartbeat_runtime(self) -> None:
        """在未领取任务时刷新空闲心跳。"""
        if not self.track_runtime:
            return
        with self.session_factory() as db:
            touch_worker_runtime(
                db,
                self.worker_name,
                self.worker_id,
                status="idle",
                current_job_id=None,
            )
            db.commit()

    def stop_runtime(self) -> None:
        """正常退出时明确标记离线，不等待心跳过期。"""
        if not self.track_runtime:
            return
        with self.session_factory() as db:
            stop_worker_runtime(db, self.worker_name, self.worker_id)
            db.commit()

    def run_once(self) -> int | None:
        """领取一个 queued 任务；没有任务时立即返回。"""
        execution = self._claim_next()
        if execution is None:
            return None

        stop = Event()
        heartbeat_thread = Thread(
            target=self._heartbeat_loop,
            args=(execution, stop),
            daemon=True,
        )
        heartbeat_thread.start()
        result: WorkerResult | None = None
        ownership_lost = False
        try:
            result = self.executor.execute(
                execution,
                lambda: self._heartbeat(execution),
            )
        except _SyncJobOwnershipLost:
            ownership_lost = True
            logger.info("同步任务所有权已变化，放弃旧执行: job_id=%s", execution.id)
        except SyncTaskLockUnavailable:
            logger.info("同步锁忙，任务延后重试: job_id=%s", execution.id)
        except Exception as error:
            logger.error(
                "同步任务执行失败: job_id=%s error_type=%s",
                execution.id,
                type(error).__name__,
            )
            result = WorkerResult(
                status="failed",
                error_code="EXECUTION_FAILED",
                error_message="同步任务执行失败",
            )
        finally:
            stop.set()
            heartbeat_thread.join(timeout=self.heartbeat_interval_seconds + 1)

        if ownership_lost:
            return execution.id
        if result is None:
            try:
                self._requeue_lock_busy(execution)
            except _SyncJobOwnershipLost:
                logger.info("同步任务所有权已变化，跳过重新排队: job_id=%s", execution.id)
            return execution.id
        try:
            self._finish(execution, result)
        except _SyncJobOwnershipLost:
            logger.info("同步任务所有权已变化，跳过旧执行收口: job_id=%s", execution.id)
        return execution.id

    def recover_stale_jobs(self) -> int:
        """确认没有存活同步执行后，再恢复心跳超时任务。"""
        if self.recovery_lock_engine is None:
            return self._recover_stale_jobs()
        if self.sync_lock_scope == "global":
            with sync_task_lock(self.recovery_lock_engine, logger, scope="global"):
                return self._recover_stale_jobs()

        recovered = 0
        for account_id in self._stale_account_ids():
            try:
                with sync_task_lock(
                    self.recovery_lock_engine,
                    logger,
                    scope="account",
                    account_id=account_id,
                ):
                    recovered += self._recover_stale_jobs(account_id)
            except SyncTaskLockUnavailable:
                logger.info("账号同步锁忙，跳过本轮失联恢复: account_id=%s", account_id)
        return recovered

    def _stale_account_ids(self) -> list[int]:
        """读取失联任务账号候选；取得账号锁后仍会再次校验。"""
        stale_before = utc_now() - timedelta(seconds=self.stale_after_seconds)
        with self.session_factory() as db:
            return list(
                db.scalars(
                    select(SyncJob.jijia_account_id)
                    .where(
                        SyncJob.status.in_(("running", "pause_requested")),
                        func.coalesce(
                            SyncJob.heartbeat_at,
                            SyncJob.started_at,
                            SyncJob.queued_at,
                        )
                        < stale_before,
                    )
                    .distinct()
                    .order_by(SyncJob.jijia_account_id)
                ).all()
            )

    def _recover_stale_jobs(self, account_id: int | None = None) -> int:
        """避免重跑已经创建批次的失联任务。"""
        now = utc_now()
        stale_before = now - timedelta(seconds=self.stale_after_seconds)
        recovered = 0
        with self.session_factory() as db:
            statement = (
                select(SyncJob)
                .where(
                    SyncJob.status.in_(("running", "pause_requested")),
                    func.coalesce(
                        SyncJob.heartbeat_at,
                        SyncJob.started_at,
                        SyncJob.queued_at,
                    )
                    < stale_before,
                )
                .order_by(SyncJob.id)
                .with_for_update()
            )
            if account_id is not None:
                statement = statement.where(SyncJob.jijia_account_id == account_id)
            jobs = list(db.scalars(statement).all())
            for job in jobs:
                batch = self._batch_for_job(
                    db,
                    job.id,
                    job.jijia_account_id,
                )
                has_other_batch = (
                    batch is None
                    and db.scalar(
                        select(sync_batch_table.c.id).where(
                            sync_batch_table.c.sync_job_id == job.id
                        )
                    )
                    is not None
                )
                job.worker_id = None
                if job.status == "pause_requested" and batch is not None:
                    job.status = "paused"
                    job.paused_at = now
                    job.heartbeat_at = now
                    job.finished_at = now
                    job.sync_batch_no = str(batch["sync_batch_no"])
                    db.execute(
                        update(sync_batch_table)
                        .where(sync_batch_table.c.id == batch["id"])
                        .values(status="paused", finished_at=now, updated_at=now)
                    )
                elif batch is not None or has_other_batch or job.attempt_count >= job.max_attempts:
                    job.status = "failed"
                    job.heartbeat_at = now
                    job.finished_at = now
                    if batch is not None:
                        job.sync_batch_no = str(batch["sync_batch_no"])
                        job.error_code = "WORKER_STALE_BATCH_FOUND"
                        job.error_message = "同步任务失联且已经创建批次"
                        self._close_failed_batch(
                            db,
                            job.id,
                            job.jijia_account_id,
                            job.sync_batch_no,
                            now,
                        )
                    elif has_other_batch:
                        job.error_code = "BATCH_LINK_INVALID"
                        job.error_message = "同步批次关联无效"
                    else:
                        job.error_code = "WORKER_STALE_MAX_ATTEMPTS"
                        job.error_message = "同步任务失联且已达到最大尝试次数"
                else:
                    job.status = "queued"
                    job.started_at = None
                    job.heartbeat_at = None
                    job.finished_at = None
                    job.error_code = "WORKER_STALE_REQUEUED"
                    job.error_message = "同步任务失联，已重新排队"
                recovered += 1
                logger.warning(
                    "失联同步任务已恢复: job_id=%s status=%s",
                    job.id,
                    job.status,
                )
            db.commit()
        return recovered

    def _claim_next(self) -> SyncJobExecution | None:
        """领取事务只更新状态并立即提交，不执行任何外部请求。"""
        with self.session_factory() as db:
            skip_locked = db.get_bind().dialect.name in MYSQL_DIALECTS
            while True:
                now = utc_now()
                job = db.scalar(_claim_candidate_statement(now, skip_locked=skip_locked))
                if job is None:
                    db.rollback()
                    return None
                expected_attempt = job.attempt_count
                claim_conditions = (
                    SyncJob.id == job.id,
                    SyncJob.status == "queued",
                    SyncJob.queued_at <= now,
                    SyncJob.attempt_count == expected_attempt,
                    SyncJob.attempt_count < SyncJob.max_attempts,
                )
                if not job.api_code:
                    failed_result = cast(
                        CursorResult[Any],
                        db.execute(
                            update(SyncJob)
                            .where(*claim_conditions)
                            .values(
                                status="failed",
                                worker_id=None,
                                heartbeat_at=now,
                                finished_at=now,
                                error_code="SYNC_JOB_API_MISSING",
                                error_message="任务缺少接口标识",
                            )
                            .execution_options(synchronize_session=False)
                        ),
                    )
                    if failed_result.rowcount != 1:
                        db.rollback()
                        continue
                    if self.track_runtime:
                        touch_worker_runtime(
                            db,
                            self.worker_name,
                            self.worker_id,
                            status="idle",
                            current_job_id=None,
                        )
                    db.commit()
                    logger.warning(
                        "同步任务领取失败: job_id=%s error_code=SYNC_JOB_API_MISSING",
                        job.id,
                    )
                    return None

                config_version = job.api_config_version
                config_hash = job.api_config_hash
                config_snapshot = json_object(job.api_config_snapshot_json) or None
                if config_snapshot is None:
                    config = load_published_api_config(
                        db,
                        job.api_code,
                        require_platform_enabled=True,
                    )
                    if config is not None:
                        registry = config.get(REGISTRY_METADATA_KEY) or {}
                        config_version = int(registry["configVersion"])
                        config_hash = str(registry["configHash"])
                        config_snapshot = api_config_snapshot(config)
                attempt_count = expected_attempt + 1
                claim_result = cast(
                    CursorResult[Any],
                    db.execute(
                        update(SyncJob)
                        .where(*claim_conditions)
                        .values(
                            status="running",
                            worker_id=self.worker_id,
                            attempt_count=attempt_count,
                            started_at=now,
                            heartbeat_at=now,
                            api_config_version=config_version,
                            api_config_hash=config_hash,
                            api_config_snapshot_json=config_snapshot,
                        )
                        .execution_options(synchronize_session=False)
                    ),
                )
                if claim_result.rowcount != 1:
                    db.rollback()
                    continue
                execution = SyncJobExecution(
                    id=job.id,
                    jijia_account_id=job.jijia_account_id,
                    api_code=job.api_code,
                    job_type=job.job_type,
                    trigger_type=job.trigger_type,
                    requested_by=job.requested_by,
                    window_start=job.window_start,
                    window_end=job.window_end,
                    progress_json=json_object(job.progress_json) or None,
                    worker_id=self.worker_id,
                    attempt_count=attempt_count,
                    market_ids=tuple(job.market_ids_json or ()),
                    task_no=job.task_no,
                    task_start=job.task_start,
                    task_end=job.task_end,
                    range_mode=job.range_mode,
                    window_index=job.window_index,
                    total_windows=job.total_windows,
                    advance_checkpoint=job.advance_checkpoint,
                    api_config_version=config_version,
                    api_config_hash=config_hash,
                    api_config_snapshot_json=config_snapshot,
                )
                if self.track_runtime:
                    touch_worker_runtime(
                        db,
                        self.worker_name,
                        self.worker_id,
                        status="running",
                        current_job_id=job.id,
                    )
                db.commit()
                return execution

    def _requeue_lock_busy(self, execution: SyncJobExecution) -> None:
        """同步锁忙表示尚未开始执行，退还尝试次数并短暂退避。"""
        with self.session_factory() as db:
            job = db.get(SyncJob, execution.id, with_for_update=True)
            if not _owns_execution(job, execution):
                raise _SyncJobOwnershipLost("同步任务领取状态已变化")
            assert job is not None
            if job.status == "pause_requested":
                job.status = "paused"
                job.worker_id = None
                job.paused_at = utc_now()
                job.finished_at = job.paused_at
                if self.track_runtime:
                    touch_worker_runtime(
                        db,
                        self.worker_name,
                        self.worker_id,
                        status="idle",
                        current_job_id=None,
                    )
                db.commit()
                return
            job.status = "queued"
            job.worker_id = None
            job.attempt_count = max(job.attempt_count - 1, 0)
            job.queued_at = utc_now() + timedelta(seconds=LOCK_BUSY_RETRY_DELAY_SECONDS)
            job.started_at = None
            job.heartbeat_at = None
            job.finished_at = None
            job.error_code = None
            job.error_message = None
            if self.track_runtime:
                touch_worker_runtime(
                    db,
                    self.worker_name,
                    self.worker_id,
                    status="idle",
                    current_job_id=None,
                )
            db.commit()

    def _heartbeat_loop(self, execution: SyncJobExecution, stop: Event) -> None:
        while not stop.wait(self.heartbeat_interval_seconds):
            try:
                self._heartbeat(execution)
            except _SyncJobOwnershipLost:
                logger.info(
                    "同步任务所有权已变化，停止旧执行心跳: job_id=%s",
                    execution.id,
                )
                return
            except SQLAlchemyError as error:
                logger.error(
                    "同步任务心跳写入失败: job_id=%s error_type=%s",
                    execution.id,
                    type(error).__name__,
                )

    def _heartbeat(self, execution: SyncJobExecution) -> None:
        with self.session_factory() as db:
            now = utc_now()
            heartbeat_result = cast(
                CursorResult[Any],
                db.execute(
                    update(SyncJob)
                    .where(
                        SyncJob.id == execution.id,
                        SyncJob.jijia_account_id == execution.jijia_account_id,
                        SyncJob.status.in_(("running", "pause_requested")),
                        SyncJob.worker_id == execution.worker_id,
                        SyncJob.attempt_count == execution.attempt_count,
                    )
                    .values(heartbeat_at=now)
                ),
            )
            if heartbeat_result.rowcount != 1:
                db.rollback()
                raise _SyncJobOwnershipLost("同步任务领取状态已变化")
            if self.track_runtime:
                touch_worker_runtime(
                    db,
                    self.worker_name,
                    execution.worker_id,
                    status="running",
                    current_job_id=execution.id,
                )
            db.commit()

    def _finish(self, execution: SyncJobExecution, result: WorkerResult) -> None:
        if result.status not in {"success", "partial_failed", "failed", "paused"}:
            raise ValueError(f"unsupported worker result: {result.status}")
        with self.session_factory() as db:
            chain_allowed = self._lock_chain_target_if_needed(db, execution, result)
            # 与任务入口保持 policy -> job 锁序，避免并发停用策略时形成反向等待。
            job = self._locked_owned_job(db, execution)
            now = utc_now()
            result = self._validate_batch_link(db, execution, result)
            if result.status == "failed" and result.sync_batch_no:
                self._close_failed_batch(
                    db,
                    execution.id,
                    execution.jijia_account_id,
                    result.sync_batch_no,
                    now,
                )
            final_status = (
                "stopped"
                if result.status in {"success", "paused"} and job.stop_after_current
                else result.status
            )
            job.status = final_status
            job.sync_batch_no = result.sync_batch_no
            progress = self._finished_progress(execution, result)
            if progress is not None:
                job.progress_json = progress
            job.error_code = result.error_code
            job.error_message = result.error_message
            job.heartbeat_at = now
            job.finished_at = now
            if final_status == "paused":
                job.paused_at = now
            self._enqueue_next_window_if_allowed(
                db,
                execution,
                progress,
                chain_allowed and not job.stop_after_current and result.status == "success",
            )
            if self.track_runtime:
                touch_worker_runtime(
                    db,
                    self.worker_name,
                    self.worker_id,
                    status="idle",
                    current_job_id=None,
                )
            db.commit()

    @staticmethod
    def _lock_chain_target_if_needed(
        db: Session,
        execution: SyncJobExecution,
        result: WorkerResult,
    ) -> bool:
        """仅为成功且需要续接窗口的任务锁定策略和账号。"""
        should_chain = result.status == "success" and (
            execution.job_type in {HISTORY_BACKFILL, UPDATE_INCREMENTAL}
            or execution.range_mode == "custom"
        )
        if not should_chain:
            return False
        return bool(
            lock_chain_target_if_eligible(
                db,
                execution.jijia_account_id,
                execution.api_code,
            )
        )

    @staticmethod
    def _locked_owned_job(db: Session, execution: SyncJobExecution) -> SyncJob:
        """锁定当前 Worker 已领取且仍可结束的任务。"""
        job = db.get(SyncJob, execution.id, with_for_update=True)
        if not _owns_execution(job, execution):
            raise _SyncJobOwnershipLost("同步任务领取状态已变化")
        assert job is not None
        return job

    def _finished_progress(
        self,
        execution: SyncJobExecution,
        result: WorkerResult,
    ) -> dict[str, Any] | None:
        """根据成功任务类型生成最终进度。"""
        progress = result.progress_json or execution.progress_json
        if result.status != "success":
            return progress
        if execution.job_type == HISTORY_BACKFILL:
            return self._history_success_progress(execution, progress)
        if execution.job_type == UPDATE_INCREMENTAL:
            return self._incremental_success_progress(execution, progress)
        if execution.range_mode == "custom":
            progress = dict(progress or {})
            progress["completedWindows"] = execution.window_index
            progress["totalWindows"] = execution.total_windows
        return progress

    def _enqueue_next_window_if_allowed(
        self,
        db: Session,
        execution: SyncJobExecution,
        progress: dict[str, Any] | None,
        allowed: bool,
    ) -> None:
        """按既有优先级续接历史、增量或自定义窗口。"""
        if not allowed:
            return
        if execution.job_type == HISTORY_BACKFILL:
            self._enqueue_next_history_window(db, execution, progress)
        elif execution.job_type == UPDATE_INCREMENTAL:
            self._enqueue_next_incremental_window(db, execution, progress)
        elif execution.range_mode == "custom":
            self._enqueue_next_custom_window(db, execution, progress)

    @staticmethod
    def _validate_batch_link(
        db: Session,
        execution: SyncJobExecution,
        result: WorkerResult,
    ) -> WorkerResult:
        """只接受同账号、同任务的批次，失败时也补齐实际批次。"""
        batch = SyncWorker._batch_for_job(
            db,
            execution.id,
            execution.jijia_account_id,
        )
        if result.sync_batch_no and (
            batch is None or batch["sync_batch_no"] != result.sync_batch_no
        ):
            return WorkerResult(
                status="failed",
                sync_batch_no=(str(batch["sync_batch_no"]) if batch is not None else None),
                progress_json=result.progress_json,
                error_code="BATCH_LINK_INVALID",
                error_message="同步批次关联无效",
            )
        if batch is not None:
            return WorkerResult(
                status=result.status,
                sync_batch_no=str(batch["sync_batch_no"]),
                progress_json=result.progress_json,
                error_code=result.error_code,
                error_message=result.error_message,
            )
        if result.status in {"success", "partial_failed"}:
            return WorkerResult(
                status="failed",
                progress_json=result.progress_json,
                error_code="BATCH_LINK_INVALID",
                error_message="同步批次关联无效",
            )
        return result

    @staticmethod
    def _batch_for_job(
        db: Session,
        job_id: int,
        account_id: int,
    ) -> dict[str, Any] | None:
        row = (
            db.execute(
                select(
                    sync_batch_table.c.id,
                    sync_batch_table.c.sync_batch_no,
                ).where(
                    sync_batch_table.c.sync_job_id == job_id,
                    sync_batch_table.c.jijia_account_id == account_id,
                )
            )
            .mappings()
            .one_or_none()
        )
        return dict(row) if row is not None else None

    @staticmethod
    def _close_failed_batch(
        db: Session,
        job_id: int,
        account_id: int,
        batch_no: str,
        now: datetime,
    ) -> None:
        """闭合当前任务自己的批次，不触碰其他账号的数据。"""
        db.execute(
            update(sync_batch_table)
            .where(
                sync_batch_table.c.sync_job_id == job_id,
                sync_batch_table.c.jijia_account_id == account_id,
                sync_batch_table.c.sync_batch_no == batch_no,
            )
            .values(
                status="failed",
                finished_at=now,
                message="同步任务失败",
                updated_at=now,
            )
        )

    @staticmethod
    def _history_success_progress(
        execution: SyncJobExecution,
        value: dict[str, Any] | None,
    ) -> dict[str, Any]:
        progress = dict(value or {})
        original = dict(execution.progress_json or {})
        previous_completed = int(original.get("completedWindows") or 0)
        reported_completed = int(progress.get("completedWindows") or 0)
        progress["completedWindows"] = max(
            reported_completed,
            previous_completed + 1,
        )
        progress["historyCompleteThrough"] = (
            execution.window_end.isoformat() if execution.window_end else None
        )
        return progress

    @staticmethod
    def _enqueue_next_history_window(
        db: Session,
        execution: SyncJobExecution,
        progress: dict[str, Any] | None,
    ) -> None:
        if not progress or execution.window_start is None or execution.window_end is None:
            return
        completed = int(progress.get("completedWindows") or 0)
        total = int(progress.get("totalWindows") or 0)
        if completed >= total:
            SyncWorker._enqueue_first_incremental_window(db, execution, progress)
            return
        frozen_end = _parse_date(progress.get("_frozenWindowEnd"))
        if frozen_end is None:
            raise RuntimeError("历史任务缺少冻结截止日")
        next_start = execution.window_end + timedelta(days=1)
        if next_start > frozen_end:
            return
        window_days = (execution.window_end - execution.window_start).days + 1
        next_end = min(
            next_start + timedelta(days=max(window_days, 1) - 1),
            frozen_end,
        )
        next_progress = dict(progress)
        next_progress.update(
            {
                "currentWindow": {
                    "startDate": next_start.isoformat(),
                    "endDate": next_end.isoformat(),
                },
                "currentPage": 0,
                "totalPages": 0,
            }
        )
        SyncWorker._add_chained_job(
            db,
            execution,
            _ChainedJobPlan(
                job_type=execution.job_type,
                window_start=next_start,
                window_end=next_end,
                progress=next_progress,
            ),
        )

    @staticmethod
    def _enqueue_first_incremental_window(
        db: Session,
        execution: SyncJobExecution,
        progress: dict[str, Any],
    ) -> None:
        """历史回填完成后从 T0 开始追赶修改时间，避免漏掉回填期间变化。"""
        started_at = _parse_datetime(progress.get("_backfillStartedAt"))
        if started_at is None:
            raise RuntimeError("历史任务缺少增量起点")
        policy_timezone = progress.get("_incrementalTimezone")
        incremental_lag_days = progress.get("_incrementalLagDays")
        if not policy_timezone or incremental_lag_days is None:
            raise RuntimeError("历史任务缺少增量窗口策略")
        start = policy_local_date(started_at, str(policy_timezone))
        target = incremental_target_end(
            str(policy_timezone),
            int(incremental_lag_days),
            utc_now(),
        )
        if start > target:
            progress["changeCatchup"] = "incremental_ready"
            return
        window_days = max(int(progress.get("_incrementalWindowDays") or 1), 1)
        end = min(start + timedelta(days=window_days - 1), target)
        progress["changeCatchup"] = "running"
        next_progress = dict(progress)
        # 增量任务只携带自己的冻结目标，不能继承历史回填截止日。
        next_progress.pop("_frozenWindowEnd", None)
        next_progress["_incrementalTargetEnd"] = target.isoformat()
        next_progress["currentWindow"] = {
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
        }
        SyncWorker._add_chained_job(
            db,
            execution,
            _ChainedJobPlan(
                job_type=UPDATE_INCREMENTAL,
                window_start=start,
                window_end=end,
                progress=next_progress,
            ),
        )

    @staticmethod
    def _incremental_success_progress(
        execution: SyncJobExecution,
        value: dict[str, Any] | None,
    ) -> dict[str, Any]:
        progress = dict(value or {})
        progress["currentWindow"] = {
            "startDate": execution.window_start.isoformat(),
            "endDate": execution.window_end.isoformat(),
        }
        return progress

    @staticmethod
    def _enqueue_next_incremental_window(
        db: Session,
        execution: SyncJobExecution,
        progress: dict[str, Any] | None,
    ) -> None:
        if not progress or execution.window_end is None:
            return
        target = _parse_date(progress.get("_incrementalTargetEnd"))
        if target is None:
            progress["changeCatchup"] = "incremental_ready"
            return
        next_start = execution.window_end + timedelta(days=1)
        if next_start > target:
            progress["changeCatchup"] = "incremental_ready"
            return
        window_days = max(int(progress.get("_incrementalWindowDays") or 1), 1)
        next_end = min(next_start + timedelta(days=window_days - 1), target)
        next_progress = dict(progress)
        next_progress["currentWindow"] = {
            "startDate": next_start.isoformat(),
            "endDate": next_end.isoformat(),
        }
        SyncWorker._add_chained_job(
            db,
            execution,
            _ChainedJobPlan(
                job_type=UPDATE_INCREMENTAL,
                window_start=next_start,
                window_end=next_end,
                progress=next_progress,
            ),
        )

    @staticmethod
    def _add_chained_job(
        db: Session,
        execution: SyncJobExecution,
        plan: _ChainedJobPlan,
    ) -> None:
        db.add(
            build_sync_job(
                SyncJobSpec(
                    account_id=execution.jijia_account_id,
                    api_code=execution.api_code,
                    job_type=plan.job_type,
                    trigger_type=execution.trigger_type,
                    requested_by=execution.requested_by,
                    window_start=plan.window_start,
                    window_end=plan.window_end,
                    progress=dict(plan.progress),
                    task_no=execution.task_no,
                    task_start=execution.task_start,
                    task_end=execution.task_end,
                    range_mode=cast(str, execution.range_mode),
                    window_index=execution.window_index + 1,
                    total_windows=execution.total_windows,
                    advance_checkpoint=execution.advance_checkpoint,
                    api_config_version=execution.api_config_version,
                    api_config_hash=execution.api_config_hash,
                    api_config_snapshot_json=execution.api_config_snapshot_json,
                    market_ids=list(execution.market_ids) or None,
                ),
                queued_at=utc_now(),
            )
        )

    @staticmethod
    def _enqueue_next_custom_window(
        db: Session,
        execution: SyncJobExecution,
        progress: dict[str, Any] | None,
    ) -> None:
        """自定义补数只推进逻辑任务窗口，不推进主检查点。"""
        if execution.window_end is None or execution.task_end is None:
            return
        next_start = execution.window_end + timedelta(days=1)
        if next_start > execution.task_end:
            return
        window_days = max(
            (execution.window_end - execution.window_start).days + 1,
            1,
        )
        next_end = min(
            next_start + timedelta(days=window_days - 1),
            execution.task_end,
        )
        next_progress = dict(progress or {})
        next_progress["completedWindows"] = execution.window_index
        next_progress["totalWindows"] = execution.total_windows
        next_progress["currentWindow"] = {
            "startDate": next_start.isoformat(),
            "endDate": next_end.isoformat(),
        }
        next_progress["currentPage"] = 0
        next_progress["totalPages"] = 0
        SyncWorker._add_chained_job(
            db,
            execution,
            _ChainedJobPlan(
                job_type="sync",
                window_start=next_start,
                window_end=next_end,
                progress=next_progress,
            ),
        )


class CoreSyncExecutor:
    """使用账号显式凭证调用现有同步核心，一次只执行一个 API 窗口。"""

    def __init__(self, engine: Engine, settings: WebSettings) -> None:
        self.engine = engine
        self.settings = settings

    def execute(
        self,
        job: SyncJobExecution,
        heartbeat: Callable[[], None],
    ) -> WorkerResult:
        heartbeat()
        with sync_task_lock(
            self.engine,
            logger,
            scope=self.settings.sync_lock_scope,
            account_id=job.jijia_account_id,
        ):
            heartbeat()
            return self._execute_locked(job, heartbeat)

    def _execute_locked(
        self,
        job: SyncJobExecution,
        heartbeat: Callable[[], None],
    ) -> WorkerResult:
        """持有 CLI/Web 共用互斥锁后执行一次同步窗口。"""
        credentials = self._credentials(job.jijia_account_id)
        app_settings = load_settings()
        rate_limiter = MySqlApiRateLimiter(
            self.engine,
            utilization=app_settings.jijia_rate_limit_utilization,
        )
        with Session(self.engine) as db:
            current_api_config = load_published_api_config(
                db,
                job.api_code,
                require_platform_enabled=True,
            )
        api_config = job.api_config_snapshot_json
        if api_config is None and current_api_config is not None:
            api_config = api_config_snapshot(current_api_config)
        if api_config is None:
            raise RuntimeError("同步任务缺少已发布接口配置")
        if str(api_config.get("api_code") or "") != job.api_code:
            raise RuntimeError("同步任务接口配置与 api_code 不一致")
        if job.api_config_hash and api_config_hash(api_config) != job.api_config_hash:
            raise RuntimeError("同步任务接口配置摘要校验失败")
        if current_api_config is None:
            raise RuntimeError("同步任务接口当前未启用")
        frozen_endpoint = normalize_rate_limit_key(
            str(api_config.get("method") or "POST"),
            str(api_config.get("path") or ""),
        )
        current_endpoint = normalize_rate_limit_key(
            str(current_api_config.get("method") or "POST"),
            str(current_api_config.get("path") or ""),
        )
        if frozen_endpoint != current_endpoint:
            raise RuntimeError("同步任务接口地址已变更，请重新创建任务")
        api_config = deepcopy(api_config)
        api_config["rate_limit"] = deepcopy(current_api_config["rate_limit"])
        api_config["retry"] = deepcopy(current_api_config.get("retry") or {})
        if job.market_ids:
            scope = api_config.get("market_scope") or {}
            request_field = str(scope.get("request_field") or "")
            if not scope.get("enabled") or not request_field:
                raise RuntimeError("同步任务店铺范围配置无效")
            # 配置摘要校验通过后再复制并注入任务输入，避免改变已发布配置事实。
            params = dict(api_config.get("params") or {})
            params[request_field] = list(job.market_ids)
            api_config["params"] = params
        progress = dict(job.progress_json or {})
        if job.range_mode == "custom":
            checkpoint_kind = MANUAL_RANGE
        else:
            checkpoint_kind = (
                job.job_type
                if job.job_type in {HISTORY_BACKFILL, UPDATE_INCREMENTAL}
                else DATE_WINDOW
            )
        context = SyncContext(
            jijia_account_id=job.jijia_account_id,
            checkpoint_kind=checkpoint_kind,
            sync_job_id=job.id,
            window_start=job.window_start,
            window_end=job.window_end,
            frozen_window_end=(
                _parse_date(progress.get("_frozenWindowEnd"))
                if checkpoint_kind == HISTORY_BACKFILL
                else None
            ),
            target_window_end=(
                _parse_date(progress.get("_incrementalTargetEnd"))
                if checkpoint_kind == UPDATE_INCREMENTAL
                else None
            ),
            backfill_started_at=_parse_datetime(progress.get("_backfillStartedAt")),
            advance_checkpoint=job.advance_checkpoint,
        )
        auth_client = JijiaAuthClient(
            app_settings,
            credentials=credentials,
            use_token_cache=False,
            rate_limiter=rate_limiter,
        )
        token = auth_client.get_access_token(force_refresh=True)
        # 旧同步核心仍是独立 app 包，运行时加载可避免 Web 类型检查接管其历史债务。
        api_client_class = import_module("app.api_client").JijiaApiClient
        sync_engine_class = import_module("app.sync_engine").SyncEngine
        api_client = api_client_class(
            app_settings,
            auth_client=auth_client,
            rate_limiter=rate_limiter,
        )

        def page_progress(current: int, total: int | None) -> None:
            self._persist_page_progress(
                job,
                progress,
                current,
                total,
            )

        heartbeat()
        result = sync_engine_class(
            [api_config],
            self.engine,
            context,
            progress_callback=page_progress,
            pause_callback=lambda: self._pause_requested(job),
        ).test_api_once(job.api_code, api_client, token)
        heartbeat()
        failed = int(result.get("failed_count") or 0)
        if result.get("paused"):
            return WorkerResult(
                status="paused",
                sync_batch_no=str(result.get("batch_no") or "") or None,
                progress_json=progress or None,
            )
        if failed:
            return WorkerResult(
                status="failed",
                sync_batch_no=str(result.get("batch_no") or "") or None,
                progress_json=progress or None,
                error_code=str(result.get("error_code") or "SYNC_API_FAILED"),
                error_message=str(result.get("error_message") or "同步接口执行失败"),
            )
        if job.job_type == "history_backfill":
            progress = self._complete_history_progress(job, result, progress)
        elif job.job_type == UPDATE_INCREMENTAL:
            request_count = int(result.get("request_count") or 0)
            if not int(progress.get("currentPage") or 0):
                progress["currentPage"] = request_count
                progress["totalPages"] = request_count
        return WorkerResult(
            status="success",
            sync_batch_no=str(result.get("batch_no") or "") or None,
            progress_json=progress or None,
        )

    def _credentials(self, account_id: int) -> JijiaCredentials:
        with Session(self.engine) as db:
            account = db.get(JijiaAccount, account_id)
            if account is None:
                raise RuntimeError("积加账号不存在")
            if account.status != JijiaAccountStatus.ACTIVE:
                raise RuntimeError("积加账号未处于可同步状态")
            if account.credential_source != CredentialSource.ENCRYPTED:
                raise RuntimeError("Web Worker 只执行加密凭证账号")
            if not account.encrypted_app_id or not account.encrypted_app_key:
                raise RuntimeError("积加账号缺少加密凭证")
            cipher = CredentialCipher(self.settings.credential_encryption_key)
            return JijiaCredentials(
                app_id=cipher.decrypt(account.encrypted_app_id),
                app_key=cipher.decrypt(account.encrypted_app_key),
            )

    def _complete_history_progress(
        self,
        job: SyncJobExecution,
        result: dict[str, Any],
        progress: dict[str, Any],
    ) -> dict[str, Any]:
        completed = int(progress.get("completedWindows") or 0) + 1
        progress["completedWindows"] = min(
            completed,
            int(progress.get("totalWindows") or completed),
        )
        progress["historyCompleteThrough"] = job.window_end.isoformat() if job.window_end else None
        request_count = int(result.get("request_count") or 0)
        if not int(progress.get("currentPage") or 0):
            progress["currentPage"] = request_count
            progress["totalPages"] = request_count
        with self.engine.connect() as connection:
            earliest = connection.scalar(
                select(func.min(raw_api_data_table.c.data_date)).where(
                    raw_api_data_table.c.jijia_account_id == job.jijia_account_id,
                    raw_api_data_table.c.api_code == job.api_code,
                )
            )
        progress["earliestObservedDataDate"] = earliest.isoformat() if earliest else None
        return progress

    def _persist_page_progress(
        self,
        job: SyncJobExecution,
        progress: dict[str, Any],
        current_page: int,
        total_pages: int | None,
    ) -> None:
        """短事务保存已成功落库的分页进度，供任务详情轮询。"""
        next_progress = dict(progress)
        next_progress["currentPage"] = current_page
        next_progress["totalPages"] = total_pages or current_page
        with Session(self.engine) as db:
            progress_result = cast(
                CursorResult[Any],
                db.execute(
                    update(SyncJob)
                    .where(
                        SyncJob.id == job.id,
                        SyncJob.jijia_account_id == job.jijia_account_id,
                        SyncJob.status.in_(("running", "pause_requested")),
                        SyncJob.worker_id == job.worker_id,
                        SyncJob.attempt_count == job.attempt_count,
                    )
                    .values(progress_json=next_progress)
                ),
            )
            if progress_result.rowcount != 1:
                db.rollback()
                raise _SyncJobOwnershipLost("同步任务运行状态已变化")
            db.commit()
        progress.update(next_progress)

    def _pause_requested(self, job: SyncJobExecution) -> bool:
        """读取暂停状态，并拒绝已不属于当前代次的旧执行。"""
        with Session(self.engine) as db:
            current = db.get(SyncJob, job.id)
            if not _owns_execution(current, job):
                raise _SyncJobOwnershipLost("同步任务领取状态已变化")
            assert current is not None
            return current.status == "pause_requested"


def _parse_date(value: Any) -> Any:
    if not value:
        return None
    return datetime.fromisoformat(str(value)).date()


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed.replace(tzinfo=None)
