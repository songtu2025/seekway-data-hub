import os
import threading
import time
from collections import Counter, defaultdict
from collections.abc import Callable
from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy import delete, event, func, inspect, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

from app.api_rate_limiter import (
    MySqlApiRateLimiter,
    RateLimitPolicy,
    api_rate_limit_state_table,
    normalize_rate_limit_key,
)
from app.config import load_settings
from app.db import create_db_engine
from app.sync_lock import sync_task_lock
from backend.app.core.security import utc_now
from backend.app.models.jijia_account import (
    CredentialSource,
    JijiaAccount,
    JijiaAccountStatus,
)
from backend.app.models.sync_job import SyncJob
from backend.app.services import sync_worker as sync_worker_module
from backend.app.services.sync_worker import (
    SyncJobExecution,
    SyncWorker,
    WorkerResult,
)

EXPECTED_DATABASE = "jijia_sync_isolated_20260827"


def _mysql_engine() -> Engine:
    """只为显式启用的本机隔离数据库测试创建连接池。"""
    if os.getenv("RUN_MYSQL_INTEGRATION") != "1":
        pytest.skip("未启用本地隔离 MySQL 集成测试")

    settings = load_settings()
    if settings.db_host not in {"127.0.0.1", "localhost"}:
        pytest.fail("MySQL 集成测试只允许连接本机隔离数据库")
    if settings.db_name != EXPECTED_DATABASE:
        pytest.fail("MySQL 集成测试数据库名称不符合隔离约束")

    engine = create_db_engine(settings)
    if not inspect(engine).has_table(api_rate_limit_state_table.name):
        pytest.fail("隔离数据库尚未执行 0008_api_rate_limit_state.sql")
    return engine


def _delete_rate_limit_states(engine: Engine, *rate_limit_keys: str) -> None:
    """删除本次测试产生的随机限流状态。"""
    with engine.begin() as connection:
        connection.execute(
            delete(api_rate_limit_state_table).where(
                api_rate_limit_state_table.c.rate_limit_key.in_(rate_limit_keys)
            )
        )


def test_mysql_coordinates_same_endpoint_across_worker_threads() -> None:
    """验证同一接口在多个 Worker 线程间共享请求时间线。"""
    engine = _mysql_engine()

    path = f"/__codex_test__/api-rate-limit/{uuid4().hex}"
    rate_limit_key = normalize_rate_limit_key("POST", path)
    policy = RateLimitPolicy(max_requests=5, period_seconds=1)
    barrier = threading.Barrier(4)
    acquired_at: list[float] = []
    acquired_lock = threading.Lock()

    def acquire_once() -> None:
        limiter = MySqlApiRateLimiter(engine, utilization=1)
        barrier.wait()
        limiter.acquire("POST", path, policy)
        with acquired_lock:
            acquired_at.append(time.perf_counter())

    threads = [threading.Thread(target=acquire_once) for _ in range(4)]
    started_at = time.perf_counter()
    try:
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=10)
        elapsed = time.perf_counter() - started_at
        assert all(not thread.is_alive() for thread in threads)
        assert len(acquired_at) == 4
        expected_elapsed = policy.minimum_interval(1) * (len(acquired_at) - 1)
        assert elapsed >= expected_elapsed * 0.9
    finally:
        _delete_rate_limit_states(engine, rate_limit_key)
        engine.dispose()


def test_mysql_allows_different_endpoints_to_advance_in_parallel() -> None:
    """验证不同接口使用不同数据库行，不形成全局串行。"""
    engine = _mysql_engine()
    paths = [f"/__codex_test__/parallel/{uuid4().hex}" for _ in range(2)]
    rate_limit_keys = [normalize_rate_limit_key("POST", path) for path in paths]
    policy = RateLimitPolicy(max_requests=5, period_seconds=1)
    limiter = MySqlApiRateLimiter(engine, utilization=1)
    for path in paths:
        limiter.acquire("POST", path, policy)

    barrier = threading.Barrier(2)
    acquired_at: list[float] = []
    acquired_lock = threading.Lock()

    def acquire_once(path: str) -> None:
        worker_limiter = MySqlApiRateLimiter(engine, utilization=1)
        barrier.wait()
        worker_limiter.acquire("POST", path, policy)
        with acquired_lock:
            acquired_at.append(time.perf_counter())

    threads = [threading.Thread(target=acquire_once, args=(path,)) for path in paths]
    started_at = time.perf_counter()
    try:
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=5)
        elapsed = time.perf_counter() - started_at

        assert all(not thread.is_alive() for thread in threads)
        assert len(acquired_at) == 2
        assert elapsed < 0.38
        assert max(acquired_at) - min(acquired_at) < 0.12
    finally:
        _delete_rate_limit_states(engine, *rate_limit_keys)
        engine.dispose()


def test_mysql_propagates_cooldown_between_limiter_instances() -> None:
    """验证一个 Worker 写入的冷却时间会约束另一个 Worker。"""
    engine = _mysql_engine()
    path = f"/__codex_test__/cooldown/{uuid4().hex}"
    rate_limit_key = normalize_rate_limit_key("POST", path)
    policy = RateLimitPolicy(max_requests=100, period_seconds=1)
    cooldown_seconds = 0.25

    try:
        first_worker = MySqlApiRateLimiter(engine, utilization=1)
        second_worker = MySqlApiRateLimiter(engine, utilization=1)
        first_worker.defer("POST", path, cooldown_seconds)

        started_at = time.perf_counter()
        second_worker.acquire("POST", path, policy)
        elapsed = time.perf_counter() - started_at

        assert elapsed >= 0.22
        assert elapsed < 0.75
    finally:
        _delete_rate_limit_states(engine, rate_limit_key)
        engine.dispose()


class SyntheticExecutionRecorder:
    """记录合成任务的并发度、重复执行和 Worker 分布。"""

    def __init__(self, engine: Engine, execution_seconds: float) -> None:
        self.engine = engine
        self.execution_seconds = execution_seconds
        self.lock = threading.Lock()
        self.execution_counts: Counter[int] = Counter()
        self.worker_ids: set[str] = set()
        self.active_by_account: defaultdict[int, int] = defaultdict(int)
        self.max_active_by_account: defaultdict[int, int] = defaultdict(int)
        self.active_global = 0
        self.max_active_global = 0

    def execute(
        self,
        job: SyncJobExecution,
        heartbeat: Callable[[], None],
    ) -> WorkerResult:
        """按生产账号锁执行纯等待任务，不调用积加 API 或写业务数据。"""
        del heartbeat
        with sync_task_lock(
            self.engine,
            scope="account",
            account_id=job.jijia_account_id,
        ):
            with self.lock:
                self.execution_counts[job.id] += 1
                self.worker_ids.add(job.worker_id)
                self.active_by_account[job.jijia_account_id] += 1
                self.max_active_by_account[job.jijia_account_id] = max(
                    self.max_active_by_account[job.jijia_account_id],
                    self.active_by_account[job.jijia_account_id],
                )
                self.active_global += 1
                self.max_active_global = max(
                    self.max_active_global,
                    self.active_global,
                )
            try:
                time.sleep(self.execution_seconds)
            finally:
                with self.lock:
                    self.active_by_account[job.jijia_account_id] -= 1
                    self.active_global -= 1
        return WorkerResult(
            status="failed",
            error_code="SYNTHETIC_TEST_COMPLETE",
            error_message="合成并发验收任务已完成",
        )


def test_mysql_four_workers_claim_once_and_lock_per_account(monkeypatch: Any) -> None:
    """验证四个 Worker 的领取唯一性、账号串行和跨账号并行。"""
    engine = _mysql_engine()
    session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
    )
    run_id = uuid4().hex
    account_ids: list[int] = []
    job_ids: list[int] = []
    connection_lock = threading.Lock()
    checked_out_connections = 0
    peak_connections = 0

    def connection_checked_out(
        _dbapi_connection: Any,
        _connection_record: Any,
        _connection_proxy: Any,
    ) -> None:
        nonlocal checked_out_connections, peak_connections
        with connection_lock:
            checked_out_connections += 1
            peak_connections = max(peak_connections, checked_out_connections)

    def connection_checked_in(
        _dbapi_connection: Any,
        _connection_record: Any,
    ) -> None:
        nonlocal checked_out_connections
        with connection_lock:
            checked_out_connections -= 1

    event.listen(engine, "checkout", connection_checked_out)
    event.listen(engine, "checkin", connection_checked_in)
    monkeypatch.setattr(sync_worker_module, "LOCK_BUSY_RETRY_DELAY_SECONDS", 0.05)
    soak_seconds = max(float(os.getenv("MYSQL_WORKER_SOAK_SECONDS", "0.8")), 0.2)
    execution_seconds = soak_seconds / 2
    recorder = SyntheticExecutionRecorder(engine, execution_seconds)

    try:
        with session_factory() as db:
            accounts = [
                JijiaAccount(
                    account_code=f"codex{index}{run_id}",
                    name=f"Codex Synthetic Account {index}",
                    masked_app_id="synthetic",
                    credential_source=CredentialSource.ENVIRONMENT_LEGACY,
                    status=JijiaAccountStatus.INACTIVE,
                )
                for index in range(4)
            ]
            db.add_all(accounts)
            db.flush()
            account_ids = [account.id for account in accounts]
            jobs = [
                SyncJob(
                    job_no=f"codex-{run_id}-{round_index}-{account_index}",
                    jijia_account_id=account.id,
                    api_code="__codex_worker_concurrency_test__",
                    job_type="sync",
                    trigger_type="manual",
                    status="queued",
                    api_config_version=1,
                    api_config_hash="0" * 64,
                    api_config_snapshot_json={"api_code": "synthetic"},
                    queued_at=utc_now(),
                )
                for round_index in range(2)
                for account_index, account in enumerate(accounts)
            ]
            db.add_all(jobs)
            db.commit()
            job_ids = [job.id for job in jobs]

        workers = [
            SyncWorker(
                session_factory,
                recorder,
                f"codex-worker-{index}-{run_id[:8]}",
                heartbeat_interval_seconds=min(max(execution_seconds / 4, 0.1), 10),
                sync_lock_scope="account",
            )
            for index in range(4)
        ]
        start_barrier = threading.Barrier(len(workers))
        worker_errors: list[BaseException] = []
        worker_error_lock = threading.Lock()
        deadline = time.monotonic() + soak_seconds + 30

        def all_jobs_finished() -> bool:
            with session_factory() as db:
                unfinished = db.scalar(
                    select(func.count())
                    .select_from(SyncJob)
                    .where(
                        SyncJob.id.in_(job_ids),
                        SyncJob.status.in_(("queued", "running", "pause_requested")),
                    )
                )
                return unfinished == 0

        def run_worker(worker: SyncWorker) -> None:
            try:
                start_barrier.wait()
                while time.monotonic() < deadline:
                    claimed_job_id = worker.run_once()
                    if all_jobs_finished():
                        return
                    if claimed_job_id is None:
                        time.sleep(0.01)
                raise TimeoutError("四 Worker 合成并发验收超时")
            except BaseException as error:
                with worker_error_lock:
                    worker_errors.append(error)

        threads = [threading.Thread(target=run_worker, args=(worker,)) for worker in workers]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=soak_seconds + 35)

        assert all(not thread.is_alive() for thread in threads)
        assert worker_errors == []
        with session_factory() as db:
            jobs = list(db.scalars(select(SyncJob).where(SyncJob.id.in_(job_ids))).all())
        assert len(jobs) == 8
        assert all(job.status == "failed" for job in jobs)
        assert all(job.error_code == "SYNTHETIC_TEST_COMPLETE" for job in jobs)
        assert all(job.attempt_count == 1 for job in jobs)
        assert recorder.execution_counts == Counter({job_id: 1 for job_id in job_ids})
        assert recorder.max_active_global == 4
        assert set(recorder.max_active_by_account.values()) == {1}
        assert len(recorder.worker_ids) == 4
        assert peak_connections <= 35
    finally:
        with session_factory() as db:
            if job_ids:
                db.execute(delete(SyncJob).where(SyncJob.id.in_(job_ids)))
            if account_ids:
                db.execute(delete(JijiaAccount).where(JijiaAccount.id.in_(account_ids)))
            db.commit()
        event.remove(engine, "checkout", connection_checked_out)
        event.remove(engine, "checkin", connection_checked_in)
        engine.dispose()
