from contextlib import contextmanager
from datetime import date, datetime, timedelta
from types import SimpleNamespace
from typing import Any, cast

import pytest
from sqlalchemy import event, insert, select, update
from sqlalchemy.dialects import mysql
from sqlalchemy.exc import SQLAlchemyError

from app.api_config_registry import (
    api_config_hash,
    api_config_snapshot,
    load_published_api_config,
)
from app.auth import JijiaCredentials
from app.sync_engine import SyncEngine as AppSyncEngine
from app.sync_lock import SyncTaskLockUnavailable
from backend.app.core.security import utc_now
from backend.app.models.account_api_policy import AccountApiPolicy
from backend.app.models.jijia_account import JijiaAccount, JijiaAccountStatus
from backend.app.models.sync_job import SyncJob
from backend.app.models.sync_records import (
    api_config_table,
    sync_batch_table,
    sync_checkpoint_table,
)
from backend.app.services import sync_job_service
from backend.app.services.sync_job_service import create_manual_job
from backend.app.services.sync_worker import (
    CoreSyncExecutor,
    SyncJobExecution,
    SyncWorker,
    WorkerResult,
    _ChainedJobPlan,
    _claim_candidate_statement,
)
from backend.tests.conftest import AuthHarness
from backend.tests.test_api_policies_api import create_active_account


def test_mysql_claim_query_skips_rows_locked_by_other_workers() -> None:
    statement = _claim_candidate_statement(
        datetime(2026, 9, 10, 8, 0, 0),
        skip_locked=True,
    )

    sql = str(statement.compile(dialect=mysql.dialect()))

    assert "FOR UPDATE SKIP LOCKED" in sql
    assert "ORDER BY sync_job.queued_at, sync_job.id" in sql


def test_claim_rowcount_fence_yields_after_competing_worker_update() -> None:
    job = SimpleNamespace(
        id=7,
        api_code="sale_return_order_page",
        attempt_count=0,
        api_config_version=1,
        api_config_hash="published-hash",
        api_config_snapshot_json={"path": "/sale-return"},
    )

    class CompetingSession:
        def __init__(self) -> None:
            self.select_calls = 0
            self.rollback_calls = 0

        def __enter__(self):
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        @staticmethod
        def get_bind() -> SimpleNamespace:
            return SimpleNamespace(dialect=SimpleNamespace(name="sqlite"))

        def scalar(self, _statement: object) -> object | None:
            self.select_calls += 1
            return job if self.select_calls == 1 else None

        @staticmethod
        def execute(_statement: object) -> SimpleNamespace:
            return SimpleNamespace(rowcount=0)

        def rollback(self) -> None:
            self.rollback_calls += 1

    session = CompetingSession()
    worker = SyncWorker(
        cast(Any, lambda: session),
        cast(Any, object()),
        "worker-loser",
    )

    assert worker._claim_next() is None
    assert session.select_calls == 2
    assert session.rollback_calls == 2


class BatchWritingExecutor:
    def __init__(self, harness: AuthHarness) -> None:
        self.harness = harness
        self.windows = []

    def execute(self, job, heartbeat) -> WorkerResult:
        heartbeat()
        self.windows.append((job.window_start, job.window_end))
        batch_no = f"batch-{job.id}"
        _write_batch(self.harness, job, batch_no, status="success")
        return WorkerResult(
            status="success",
            sync_batch_no=batch_no,
            progress_json=job.progress_json,
        )


class FailingExecutor:
    @staticmethod
    def execute(job, heartbeat) -> WorkerResult:
        heartbeat()
        raise ValueError("provider secret must not be stored")


class BatchThenFailingExecutor:
    def __init__(self, harness: AuthHarness) -> None:
        self.harness = harness

    def execute(self, job, heartbeat) -> WorkerResult:
        heartbeat()
        _write_batch(self.harness, job, f"batch-{job.id}")
        raise ValueError("provider secret must not be stored")


class WrongAccountBatchExecutor:
    def __init__(self, harness: AuthHarness) -> None:
        self.harness = harness

    def execute(self, job, heartbeat) -> WorkerResult:
        heartbeat()
        batch_no = f"wrong-batch-{job.id}"
        _write_batch(
            self.harness,
            job,
            batch_no,
            account_id=job.jijia_account_id + 999,
        )
        return WorkerResult(status="failed", sync_batch_no=batch_no)


def _write_batch(
    harness: AuthHarness,
    job,
    batch_no: str,
    status: str = "running",
    account_id: int | None = None,
) -> None:
    with harness.session_factory() as db:
        now = datetime(2026, 8, 26, 8, 0, 0)
        finished_at = now if status != "running" else None
        db.execute(
            insert(sync_batch_table).values(
                sync_batch_no=batch_no,
                jijia_account_id=account_id or job.jijia_account_id,
                sync_job_id=job.id,
                status=status,
                started_at=now,
                finished_at=finished_at,
                total_api_count=1,
                success_api_count=1 if status == "success" else 0,
                failed_api_count=1 if status == "failed" else 0,
                created_at=now,
                updated_at=now,
            )
        )
        db.commit()


def _running_copy(
    source: SyncJob,
    job_no: str,
    heartbeat_at: datetime,
    attempt_count: int,
    max_attempts: int,
) -> SyncJob:
    return SyncJob(
        job_no=job_no,
        jijia_account_id=source.jijia_account_id,
        api_code=source.api_code,
        job_type=source.job_type,
        trigger_type=source.trigger_type,
        status="running",
        window_start=source.window_start,
        window_end=source.window_end,
        progress_json=source.progress_json,
        worker_id="old-worker",
        attempt_count=attempt_count,
        max_attempts=max_attempts,
        requested_by=source.requested_by,
        queued_at=heartbeat_at,
        started_at=heartbeat_at,
        heartbeat_at=heartbeat_at,
    )


def _queue_two_window_job(harness: AuthHarness, monkeypatch) -> int:
    client, auth, account = create_active_account(harness, monkeypatch)
    policy = client.put(
        f"/api/v1/jijia-accounts/{account['id']}/api-policies/sale_return_order_page",
        json={
            "enabled": True,
            "schedule_mode": "manual_only",
            "timezone": "Asia/Shanghai",
            "window_mode": "checkpoint",
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    assert policy.status_code == 200
    response = client.post(
        "/api/v1/sync-jobs",
        json={
            "jijia_account_id": account["id"],
            "api_code": "sale_return_order_page",
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    job_id = response.json()["data"]["jobId"]
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        job.window_start = date(2020, 1, 1)
        job.window_end = date(2020, 1, 31)
        job.progress_json = {
            "completedWindows": 0,
            "totalWindows": 2,
            "currentWindow": {
                "startDate": "2020-01-01",
                "endDate": "2020-01-31",
            },
            "currentPage": 0,
            "totalPages": 0,
            "earliestObservedDataDate": None,
            "historyCompleteThrough": None,
            "changeCatchup": "pending",
            "_frozenWindowEnd": "2020-03-02",
            "_backfillStartedAt": "2026-08-26T08:00:00Z",
            "_incrementalWindowDays": 31,
            "_incrementalTimezone": "Asia/Shanghai",
            "_incrementalLagDays": 1,
        }
        db.commit()
    return job_id


def test_worker_chains_two_continuous_windows_and_links_one_batch_each(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    fixed_now = datetime(2026, 8, 26, 8, 0, 0)
    current_now = [fixed_now]
    monkeypatch.setattr(
        "backend.app.services.sync_worker.utc_now",
        lambda: current_now[0],
    )
    first_id = _queue_two_window_job(harness, monkeypatch)
    with harness.session_factory() as db:
        first = db.get(SyncJob, first_id)
        first.queued_at = fixed_now
        first.market_ids_json = [101, 202]
        db.commit()
    executor = BatchWritingExecutor(harness)
    worker = SyncWorker(
        harness.session_factory,
        executor,
        "worker-test",
        heartbeat_interval_seconds=0.1,
    )

    assert worker.run_once() == first_id
    with harness.session_factory() as db:
        first = db.get(SyncJob, first_id)
        queued = db.scalar(select(SyncJob).where(SyncJob.status == "queued"))
        assert first.status == "success"
        assert first.max_attempts == 2
        assert first.sync_batch_no == f"batch-{first_id}"
        assert queued.window_start == date(2020, 2, 1)
        assert queued.window_end == date(2020, 3, 2)
        assert queued.market_ids_json == [101, 202]
        assert queued.max_attempts == 2
        assert queued.queued_at == fixed_now
        second_id = queued.id

    assert worker.run_once() == second_id
    with harness.session_factory() as db:
        jobs = db.scalars(select(SyncJob).order_by(SyncJob.id)).all()
        batches = db.execute(
            select(
                sync_batch_table.c.sync_job_id,
                sync_batch_table.c.jijia_account_id,
            ).order_by(sync_batch_table.c.id)
        ).all()
        assert [job.status for job in jobs] == ["success", "success"]
        assert [job.market_ids_json for job in jobs] == [[101, 202], [101, 202]]
        assert db.scalar(select(SyncJob.id).where(SyncJob.status == "queued")) is None
        assert [row.sync_job_id for row in batches] == [first_id, second_id]
        assert [row.jijia_account_id for row in batches] == [
            jobs[0].jijia_account_id,
            jobs[1].jijia_account_id,
        ]
    assert executor.windows == [
        (date(2020, 1, 1), date(2020, 1, 31)),
        (date(2020, 2, 1), date(2020, 3, 2)),
    ]


def test_worker_uses_published_config_for_chaining(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    first_id = _queue_two_window_job(harness, monkeypatch)
    executor = BatchWritingExecutor(harness)
    worker = SyncWorker(
        harness.session_factory,
        executor,
        "worker-configured-path",
        heartbeat_interval_seconds=0.1,
    )

    assert worker.run_once() == first_id

    with harness.session_factory() as db:
        queued = db.scalar(select(SyncJob).where(SyncJob.status == "queued"))
        assert queued.window_start == date(2020, 2, 1)
        assert queued.window_end == date(2020, 3, 2)


def test_chained_job_is_immediately_eligible_because_http_client_limits_requests(
    monkeypatch,
) -> None:
    fixed_now = datetime(2026, 9, 11, 8, 0, 0)
    monkeypatch.setattr("backend.app.services.sync_worker.utc_now", lambda: fixed_now)
    added_jobs: list[SyncJob] = []
    db = SimpleNamespace(add=added_jobs.append)
    execution = SyncJobExecution(
        id=1,
        jijia_account_id=2,
        api_code="rate_limited_api",
        job_type="history_backfill",
        trigger_type="manual",
        requested_by=3,
        window_start=date(2026, 9, 9),
        window_end=date(2026, 9, 9),
        progress_json=None,
        worker_id="worker-rate-limit",
        attempt_count=1,
        range_mode="checkpoint",
    )

    SyncWorker._add_chained_job(
        cast(Any, db),
        execution,
        _ChainedJobPlan(
            job_type="history_backfill",
            window_start=date(2026, 9, 10),
            window_end=date(2026, 9, 10),
            progress={},
        ),
    )

    assert added_jobs[0].queued_at == fixed_now


def test_final_history_window_chains_update_catchup_without_gaps(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    job_id = _queue_two_window_job(harness, monkeypatch)
    # UTC 18:30 对应上海次日 02:30，截止日必须按上海自然日计算。
    fixed_now = datetime(2026, 8, 25, 18, 30, 0)
    current_now = [fixed_now]
    monkeypatch.setattr(
        "backend.app.services.sync_worker.utc_now",
        lambda: current_now[0],
    )
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        job.progress_json = {
            **job.progress_json,
            "totalWindows": 1,
            "_backfillStartedAt": "2026-08-20T08:00:00Z",
            "_incrementalWindowDays": 31,
        }
        job.queued_at = fixed_now - timedelta(seconds=1)
        db.commit()
    executor = BatchWritingExecutor(harness)
    worker = SyncWorker(
        harness.session_factory,
        executor,
        "worker-catchup",
        heartbeat_interval_seconds=0.1,
    )

    assert worker.run_once() == job_id
    with harness.session_factory() as db:
        incremental = db.scalar(select(SyncJob).where(SyncJob.status == "queued"))
        incremental_id = incremental.id
        current_now[0] = incremental.queued_at
    assert worker.run_once() == incremental_id
    assert worker.run_once() is None

    with harness.session_factory() as db:
        jobs = db.scalars(select(SyncJob).order_by(SyncJob.id)).all()
        assert len(jobs) == 2
        assert jobs[0].job_type == "history_backfill"
        assert all(job.job_type == "update_incremental" for job in jobs[1:])
        assert jobs[1].window_start == date(2026, 8, 20)
        assert jobs[1].window_end == date(2026, 8, 25)
        assert "_frozenWindowEnd" in jobs[0].progress_json
        assert "_frozenWindowEnd" not in jobs[1].progress_json
        assert jobs[1].progress_json["_incrementalTargetEnd"] == "2026-08-25"
        assert jobs[-1].progress_json["changeCatchup"] == "incremental_ready"
        assert all(job.status == "success" for job in jobs)


def test_final_history_window_uses_policy_local_t0_date(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    job_id = _queue_two_window_job(harness, monkeypatch)
    fixed_now = datetime(2026, 8, 27, 12, 0, 0)
    monkeypatch.setattr(
        "backend.app.services.sync_worker.utc_now",
        lambda: fixed_now,
    )
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        job.progress_json = {
            **job.progress_json,
            "totalWindows": 1,
            "_backfillStartedAt": "2026-08-26T02:30:00Z",
            "_incrementalWindowDays": 31,
            "_incrementalTimezone": "America/Los_Angeles",
        }
        job.queued_at = fixed_now - timedelta(seconds=1)
        db.commit()
    worker = SyncWorker(
        harness.session_factory,
        BatchWritingExecutor(harness),
        "worker-local-t0",
        heartbeat_interval_seconds=0.1,
    )

    assert worker.run_once() == job_id

    with harness.session_factory() as db:
        incremental = db.scalar(select(SyncJob).where(SyncJob.job_type == "update_incremental"))
        assert incremental.window_start == date(2026, 8, 25)
        assert incremental.window_end == date(2026, 8, 26)


def test_successful_window_does_not_chain_after_policy_is_disabled(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    job_id = _queue_two_window_job(harness, monkeypatch)
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        policy = db.scalar(
            select(AccountApiPolicy).where(
                AccountApiPolicy.jijia_account_id == job.jijia_account_id,
                AccountApiPolicy.api_code == job.api_code,
            )
        )
        policy.enabled = False
        db.commit()
    executor = BatchWritingExecutor(harness)
    worker = SyncWorker(
        harness.session_factory,
        executor,
        "worker-disabled-policy",
        heartbeat_interval_seconds=0.1,
    )

    assert worker.run_once() == job_id

    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        assert job.status == "success"
        assert db.scalar(select(SyncJob.id).where(SyncJob.status == "queued")) is None
    assert executor.windows == [(date(2020, 1, 1), date(2020, 1, 31))]


def test_successful_window_does_not_chain_after_account_is_inactive(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    job_id = _queue_two_window_job(harness, monkeypatch)
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        account = db.get(JijiaAccount, job.jijia_account_id)
        account.status = JijiaAccountStatus.INACTIVE
        db.commit()
    worker = SyncWorker(
        harness.session_factory,
        BatchWritingExecutor(harness),
        "worker-inactive-account-chain",
        heartbeat_interval_seconds=0.1,
    )

    assert worker.run_once() == job_id

    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        assert job.status == "success"
        assert db.scalar(select(SyncJob.id).where(SyncJob.status == "queued")) is None


def test_successful_window_does_not_chain_when_read_only_catalog_is_invalid(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    job_id = _queue_two_window_job(harness, monkeypatch)
    with harness.session_factory() as db:
        db.execute(
            update(api_config_table)
            .where(api_config_table.c.api_code == "sale_return_order_page")
            .values(read_only_verified=False)
        )
        db.commit()
    worker = SyncWorker(
        harness.session_factory,
        BatchWritingExecutor(harness),
        "worker-invalid-catalog-chain",
        heartbeat_interval_seconds=0.1,
    )

    assert worker.run_once() == job_id

    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        assert job.status == "success"
        assert db.scalar(select(SyncJob.id).where(SyncJob.status == "queued")) is None


@pytest.mark.parametrize(
    "api_config",
    [
        "apis: [",
        "- api_code: sale_return_order_page\n  enabled: false\n",
    ],
)
def test_successful_window_closes_when_published_config_is_malformed(
    harness: AuthHarness,
    monkeypatch,
    api_config: str,
) -> None:
    job_id = _queue_two_window_job(harness, monkeypatch)
    with harness.session_factory() as db:
        db.execute(
            update(api_config_table)
            .where(api_config_table.c.api_code == "sale_return_order_page")
            .values(config_json=api_config)
        )
        db.commit()
    worker = SyncWorker(
        harness.session_factory,
        BatchWritingExecutor(harness),
        "worker-malformed-catalog",
        heartbeat_interval_seconds=0.1,
    )

    assert worker.run_once() == job_id

    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        batch_status = db.scalar(
            select(sync_batch_table.c.status).where(sync_batch_table.c.sync_job_id == job_id)
        )
        assert job.status == "success"
        assert batch_status == "success"
        assert db.scalar(select(SyncJob.id).where(SyncJob.status == "queued")) is None


def test_chain_target_database_error_is_not_suppressed(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    def fail_with_database_error(*_args):
        raise SQLAlchemyError("database unavailable")

    monkeypatch.setattr(sync_job_service, "_eligible_target", fail_with_database_error)

    with harness.session_factory() as db:
        with pytest.raises(SQLAlchemyError):
            sync_job_service.lock_chain_target_if_eligible(
                db,
                1,
                "sale_return_order_page",
            )


def test_disabled_chain_resumes_from_checkpoint_after_reenable(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    job_id = _queue_two_window_job(harness, monkeypatch)

    class CheckpointThenDisableExecutor(BatchWritingExecutor):
        def execute(self, job, heartbeat) -> WorkerResult:
            result = super().execute(job, heartbeat)
            now = datetime(2026, 8, 26, 8, 0, 0)
            with self.harness.session_factory() as db:
                db.execute(
                    insert(sync_checkpoint_table).values(
                        jijia_account_id=job.jijia_account_id,
                        api_code=job.api_code,
                        checkpoint_kind="history_backfill",
                        checkpoint_value={
                            "window_start": "2020-01-01",
                            "window_end": "2020-01-31",
                            "next_window_start": "2020-02-01",
                            "window_days": 31,
                            "absolute_lower_bound": "2020-01-01",
                            "frozen_window_end": "2020-03-02",
                            "backfill_started_at": "2026-08-26T08:00:00",
                        },
                        checkpoint_time=now,
                        last_sync_batch_no=result.sync_batch_no,
                        created_at=now,
                        updated_at=now,
                    )
                )
                policy = db.scalar(
                    select(AccountApiPolicy).where(
                        AccountApiPolicy.jijia_account_id == job.jijia_account_id,
                        AccountApiPolicy.api_code == job.api_code,
                    )
                )
                policy.enabled = False
                db.commit()
            return result

    worker = SyncWorker(
        harness.session_factory,
        CheckpointThenDisableExecutor(harness),
        "worker-checkpoint-disabled",
        heartbeat_interval_seconds=0.1,
    )

    assert worker.run_once() == job_id

    with harness.session_factory() as db:
        completed = db.get(SyncJob, job_id)
        checkpoint = db.scalar(
            select(sync_checkpoint_table.c.checkpoint_value).where(
                sync_checkpoint_table.c.jijia_account_id == completed.jijia_account_id,
                sync_checkpoint_table.c.api_code == completed.api_code,
            )
        )
        assert completed.status == "success"
        assert checkpoint["next_window_start"] == "2020-02-01"
        assert db.scalar(select(SyncJob.id).where(SyncJob.status == "queued")) is None
        policy = db.scalar(
            select(AccountApiPolicy).where(
                AccountApiPolicy.jijia_account_id == completed.jijia_account_id,
                AccountApiPolicy.api_code == completed.api_code,
            )
        )
        policy.enabled = True
        account_id = completed.jijia_account_id
        api_code = completed.api_code
        actor_id = completed.requested_by
        db.commit()
        assert actor_id is not None
        resumed = create_manual_job(
            db,
            account_id,
            api_code,
            actor_id,
            "request-resume-after-enable",
            harness.settings,
        )

    assert resumed.window_start == date(2020, 2, 1)
    assert resumed.window_end == date(2020, 3, 2)
    assert resumed.progress_json["completedWindows"] == 1


def test_worker_failure_is_sanitized_and_does_not_chain(
    harness: AuthHarness,
    monkeypatch,
    caplog,
) -> None:
    job_id = _queue_two_window_job(harness, monkeypatch)
    worker = SyncWorker(
        harness.session_factory,
        FailingExecutor(),
        "worker-failure",
        heartbeat_interval_seconds=0.1,
    )

    assert worker.run_once() == job_id
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        assert job.status == "failed"
        assert job.error_code == "EXECUTION_FAILED"
        assert job.error_message == "同步任务执行失败"
        assert "provider secret" not in job.error_message
        assert job.heartbeat_at is not None
        assert db.scalar(select(SyncJob.id).where(SyncJob.status == "queued")) is None
    assert "provider secret" not in caplog.text


def test_worker_does_not_claim_queued_job_at_max_attempts(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    job_id = _queue_two_window_job(harness, monkeypatch)
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        job.attempt_count = job.max_attempts
        db.commit()
    executor = BatchWritingExecutor(harness)
    worker = SyncWorker(
        harness.session_factory,
        executor,
        "worker-exhausted",
        heartbeat_interval_seconds=0.1,
    )

    assert worker.run_once() is None

    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        assert job.status == "queued"
        assert job.attempt_count == job.max_attempts
        assert job.worker_id is None
    assert executor.windows == []


def test_recovery_requeues_stale_job_without_batch_and_leaves_fresh_job(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    stale_id = _queue_two_window_job(harness, monkeypatch)
    now = utc_now()
    with harness.session_factory() as db:
        stale = db.get(SyncJob, stale_id)
        stale.status = "running"
        stale.worker_id = "old-worker"
        stale.attempt_count = 1
        assert stale.max_attempts == 2
        stale.started_at = now - timedelta(minutes=30)
        stale.heartbeat_at = now - timedelta(minutes=30)
        fresh = _running_copy(stale, "job-fresh", now, 1, 2)
        db.add(fresh)
        db.commit()
        fresh_id = fresh.id

    worker = SyncWorker(
        harness.session_factory,
        FailingExecutor(),
        "worker-recovery",
        stale_after_seconds=600,
    )

    assert worker.recover_stale_jobs() == 1
    with harness.session_factory() as db:
        stale = db.get(SyncJob, stale_id)
        fresh = db.get(SyncJob, fresh_id)
        assert stale.status == "queued"
        assert stale.worker_id is None
        assert stale.attempt_count == 1
        assert stale.error_code == "WORKER_STALE_REQUEUED"
        assert fresh.status == "running"
        assert fresh.worker_id == "old-worker"

    execution = worker._claim_next()
    assert execution is not None
    assert execution.id == stale_id
    with harness.session_factory() as db:
        stale = db.get(SyncJob, stale_id)
        assert stale.attempt_count == 2
        stale.started_at = now - timedelta(minutes=30)
        stale.heartbeat_at = now - timedelta(minutes=30)
        db.commit()

    assert worker.recover_stale_jobs() == 1
    with harness.session_factory() as db:
        stale = db.get(SyncJob, stale_id)
        assert stale.status == "failed"
        assert stale.error_code == "WORKER_STALE_MAX_ATTEMPTS"


def test_worker_abandons_execution_after_claim_attempt_changes(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    job_id = _queue_two_window_job(harness, monkeypatch)
    continued_after_heartbeat = False

    class ReassignedExecutor:
        @staticmethod
        def execute(job: SyncJobExecution, heartbeat) -> WorkerResult:
            nonlocal continued_after_heartbeat
            with harness.session_factory() as db:
                current = db.get(SyncJob, job.id)
                assert current is not None
                current.worker_id = "replacement-worker"
                current.attempt_count = job.attempt_count + 1
                db.commit()
            heartbeat()
            continued_after_heartbeat = True
            return WorkerResult(status="success")

    worker = SyncWorker(
        harness.session_factory,
        ReassignedExecutor(),
        "stale-worker",
        heartbeat_interval_seconds=60,
    )

    assert worker.run_once() == job_id
    assert continued_after_heartbeat is False
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        assert job is not None
        assert job.status == "running"
        assert job.worker_id == "replacement-worker"
        assert job.attempt_count == 2
        assert job.error_code is None


def test_stop_request_closes_paused_worker_result_as_stopped(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    job_id = _queue_two_window_job(harness, monkeypatch)
    worker = SyncWorker(harness.session_factory, FailingExecutor(), "worker-stop")
    execution = worker._claim_next()
    assert execution is not None
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        assert job is not None
        job.status = "pause_requested"
        job.stop_after_current = True
        db.commit()

    worker._finish(execution, WorkerResult(status="paused"))

    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        assert job is not None
        assert job.status == "stopped"
        assert job.stop_after_current is True
        assert job.paused_at is None
        assert db.scalar(select(SyncJob.id).where(SyncJob.status == "queued")) is None


def test_recovery_does_not_touch_jobs_while_shared_lock_is_busy(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    job_id = _queue_two_window_job(harness, monkeypatch)
    now = utc_now() - timedelta(minutes=30)
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        job.status = "running"
        job.worker_id = "old-worker"
        job.started_at = now
        job.heartbeat_at = now
        db.commit()

    def deny_lock(*_args, **_kwargs):
        raise SyncTaskLockUnavailable("busy")

    monkeypatch.setattr("backend.app.services.sync_worker.sync_task_lock", deny_lock)
    worker = SyncWorker(
        harness.session_factory,
        FailingExecutor(),
        "worker-recovery",
        recovery_lock_engine=object(),
    )

    with pytest.raises(SyncTaskLockUnavailable):
        worker.recover_stale_jobs()
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        assert job.status == "running"
        assert job.worker_id == "old-worker"


def test_account_scope_recovery_locks_each_stale_account_and_skips_busy_one(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    first_job_id = _queue_two_window_job(harness, monkeypatch)
    stale_at = utc_now() - timedelta(minutes=30)
    with harness.session_factory() as db:
        first_job = db.get(SyncJob, first_job_id)
        assert first_job is not None
        first_job.status = "running"
        first_job.worker_id = "old-worker"
        first_job.started_at = stale_at
        first_job.heartbeat_at = stale_at
        source_account = db.get(JijiaAccount, first_job.jijia_account_id)
        assert source_account is not None
        second_account = JijiaAccount(
            account_code="account-recovery-second",
            name="第二恢复账号",
            masked_app_id=source_account.masked_app_id,
            encrypted_app_id=source_account.encrypted_app_id,
            encrypted_app_key=source_account.encrypted_app_key,
            credential_source=source_account.credential_source,
            status=source_account.status,
            created_by=source_account.created_by,
            updated_by=source_account.updated_by,
        )
        db.add(second_account)
        db.flush()
        second_job = _running_copy(
            first_job,
            "job-recovery-second-account",
            stale_at,
            1,
            2,
        )
        second_job.jijia_account_id = second_account.id
        db.add(second_job)
        db.commit()
        first_account_id = first_job.jijia_account_id
        second_account_id = second_account.id
        second_job_id = second_job.id

    lock_calls: list[int] = []

    @contextmanager
    def account_lock(_engine, _logger, *, scope, account_id=None):
        assert scope == "account"
        assert account_id is not None
        lock_calls.append(account_id)
        if account_id == first_account_id:
            raise SyncTaskLockUnavailable("busy")
        yield

    monkeypatch.setattr("backend.app.services.sync_worker.sync_task_lock", account_lock)
    worker = SyncWorker(
        harness.session_factory,
        FailingExecutor(),
        "worker-account-recovery",
        stale_after_seconds=600,
        recovery_lock_engine=object(),
        sync_lock_scope="account",
    )

    assert worker.recover_stale_jobs() == 1
    assert lock_calls == [first_account_id, second_account_id]
    with harness.session_factory() as db:
        assert db.get(SyncJob, first_job_id).status == "running"
        assert db.get(SyncJob, second_job_id).status == "queued"


def test_recovery_fails_stale_job_with_batch_or_exhausted_attempts(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    batch_job_id = _queue_two_window_job(harness, monkeypatch)
    now = utc_now() - timedelta(minutes=30)
    with harness.session_factory() as db:
        batch_job = db.get(SyncJob, batch_job_id)
        batch_job.status = "running"
        batch_job.worker_id = "old-worker"
        batch_job.attempt_count = 1
        batch_job.max_attempts = 2
        batch_job.started_at = now
        batch_job.heartbeat_at = now
        exhausted = _running_copy(batch_job, "job-exhausted", now, 1, 1)
        db.add(exhausted)
        db.commit()
        exhausted_id = exhausted.id
    _write_batch(harness, batch_job, f"batch-{batch_job_id}")

    worker = SyncWorker(
        harness.session_factory,
        FailingExecutor(),
        "worker-recovery",
        stale_after_seconds=600,
    )

    assert worker.recover_stale_jobs() == 2
    with harness.session_factory() as db:
        batch_job = db.get(SyncJob, batch_job_id)
        exhausted = db.get(SyncJob, exhausted_id)
        batch = (
            db.execute(
                select(sync_batch_table).where(sync_batch_table.c.sync_job_id == batch_job_id)
            )
            .mappings()
            .one()
        )
        assert batch_job.status == "failed"
        assert batch_job.sync_batch_no == f"batch-{batch_job_id}"
        assert batch_job.error_code == "WORKER_STALE_BATCH_FOUND"
        assert batch["status"] == "failed"
        assert batch["finished_at"] is not None
        assert exhausted.status == "failed"
        assert exhausted.error_code == "WORKER_STALE_MAX_ATTEMPTS"


def test_executor_exception_links_and_closes_existing_batch(
    harness: AuthHarness,
    monkeypatch,
    caplog,
) -> None:
    job_id = _queue_two_window_job(harness, monkeypatch)
    worker = SyncWorker(
        harness.session_factory,
        BatchThenFailingExecutor(harness),
        "worker-batch-failure",
        heartbeat_interval_seconds=0.1,
    )

    assert worker.run_once() == job_id
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        batch = (
            db.execute(select(sync_batch_table).where(sync_batch_table.c.sync_job_id == job_id))
            .mappings()
            .one()
        )
        assert job.status == "failed"
        assert job.sync_batch_no == f"batch-{job_id}"
        assert batch["status"] == "failed"
        assert batch["finished_at"] is not None
        assert "provider secret" not in (batch["message"] or "")
    assert "provider secret" not in caplog.text


def test_failed_result_rejects_batch_from_another_account(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    job_id = _queue_two_window_job(harness, monkeypatch)
    worker = SyncWorker(
        harness.session_factory,
        WrongAccountBatchExecutor(harness),
        "worker-wrong-batch",
        heartbeat_interval_seconds=0.1,
    )

    assert worker.run_once() == job_id
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        batch = (
            db.execute(select(sync_batch_table).where(sync_batch_table.c.sync_job_id == job_id))
            .mappings()
            .one()
        )
        assert job.status == "failed"
        assert job.sync_batch_no is None
        assert job.error_code == "BATCH_LINK_INVALID"
        assert batch["status"] == "running"


def test_core_executor_rechecks_account_active_before_loading_api_settings(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    job_id = _queue_two_window_job(harness, monkeypatch)
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        account = db.get(JijiaAccount, job.jijia_account_id)
        account.status = JijiaAccountStatus.INACTIVE
        db.commit()
    monkeypatch.setattr(
        "backend.app.services.sync_worker.load_settings",
        lambda: pytest.fail("账号停用后不应加载 API 配置或调用外部服务"),
    )
    engine = harness.session_factory.kw["bind"]
    worker = SyncWorker(
        harness.session_factory,
        CoreSyncExecutor(engine, harness.settings),
        "worker-inactive-account",
        heartbeat_interval_seconds=0.1,
    )

    assert worker.run_once() == job_id
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        assert job.status == "failed"
        assert job.error_code == "EXECUTION_FAILED"
        assert (
            db.scalar(select(sync_batch_table.c.id).where(sync_batch_table.c.sync_job_id == job_id))
            is None
        )


def test_core_executor_does_not_call_provider_without_shared_lock(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    job_id = _queue_two_window_job(harness, monkeypatch)

    def deny_lock(*_args, **_kwargs):
        raise SyncTaskLockUnavailable("busy")

    monkeypatch.setattr("backend.app.services.sync_worker.sync_task_lock", deny_lock)
    monkeypatch.setattr(
        "backend.app.services.sync_worker.load_settings",
        lambda: pytest.fail("拿不到互斥锁时不能加载配置或调用上游"),
    )
    engine = harness.session_factory.kw["bind"]
    worker = SyncWorker(
        harness.session_factory,
        CoreSyncExecutor(engine, harness.settings),
        "worker-lock-busy",
        heartbeat_interval_seconds=0.1,
    )

    assert worker.run_once() == job_id
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        assert job.status == "queued"
        assert job.worker_id is None
        assert job.attempt_count == 0
        assert job.queued_at > utc_now()
        assert job.started_at is None
        assert job.heartbeat_at is None
        assert job.error_code is None
        assert job.error_message is None
        assert (
            db.scalar(select(sync_batch_table.c.id).where(sync_batch_table.c.sync_job_id == job_id))
            is None
        )

    # 退避到期前不能热循环重领；人工推进仅用于证明到期后仍可重试且不消耗次数。
    assert worker.run_once() is None
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        job.queued_at = utc_now() - timedelta(seconds=1)
        db.commit()
    assert worker.run_once() == job_id
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        assert job.status == "queued"
        assert job.attempt_count == 0


def test_core_executor_uses_current_runtime_policies_and_propagates_rate_limit(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    captured = {}

    class FakeAuthClient:
        def __init__(self, *_args, **_kwargs) -> None:
            pass

        @staticmethod
        def get_access_token(*_args, **_kwargs):
            return object()

    class FakeApiClient:
        def __init__(self, *_args, **_kwargs) -> None:
            pass

    class CapturingSyncEngine:
        def __init__(
            self,
            api_configs,
            _engine,
            context,
            progress_callback=None,
            pause_callback=None,
        ) -> None:
            captured["context"] = context
            self.api_configs = api_configs
            self.context = context
            self.progress_callback = progress_callback
            self.pause_callback = pause_callback

        def test_api_once(self, api_code, _api_client, _token):
            api = next(item for item in self.api_configs if item["api_code"] == api_code)
            captured["rate_limit"] = api["rate_limit"]
            captured["retry"] = api["retry"]
            engine = AppSyncEngine([api], sync_context=self.context)
            engine._ensure_execution_allowed(api)
            captured["params"] = engine._request_params(api)
            return {
                "batch_no": "batch-incremental",
                "failed_count": 1,
                "request_count": 1,
                "error_code": "UPSTREAM_RATE_LIMIT",
                "error_message": "上游接口限流（HTTP 509，业务码 90008），已达到调用频率限制",
            }

    def fake_import_module(module_name: str):
        if module_name == "app.api_client":
            return SimpleNamespace(JijiaApiClient=FakeApiClient)
        return SimpleNamespace(SyncEngine=CapturingSyncEngine)

    lock_calls: list[dict[str, object]] = []

    @contextmanager
    def account_lock(_engine, _logger, **kwargs):
        lock_calls.append(kwargs)
        yield

    executor = CoreSyncExecutor(
        harness.session_factory.kw["bind"],
        harness.settings.model_copy(update={"sync_lock_scope": "account"}),
    )
    monkeypatch.setattr("backend.app.services.sync_worker.sync_task_lock", account_lock)
    monkeypatch.setattr(
        executor,
        "_credentials",
        lambda _account_id: (
            captured.update(heartbeats_before_credentials=len(heartbeat_calls))
            or JijiaCredentials("app-id", "app-key")
        ),
    )
    monkeypatch.setattr(
        "backend.app.services.sync_worker.load_settings",
        lambda: SimpleNamespace(jijia_rate_limit_utilization=0.9),
    )
    monkeypatch.setattr(
        "backend.app.services.sync_worker.JijiaAuthClient",
        FakeAuthClient,
    )
    monkeypatch.setattr(
        "backend.app.services.sync_worker.import_module",
        fake_import_module,
    )
    with harness.session_factory() as db:
        current_config = load_published_api_config(db, "sale_return_order_page")
    frozen_config = api_config_snapshot(current_config)
    frozen_config["rate_limit"] = {"max_requests": 1, "period_seconds": 9}
    frozen_config["retry"] = {"retries": 1, "delay_seconds": 9}
    job = SyncJobExecution(
        id=99,
        jijia_account_id=7,
        api_code="sale_return_order_page",
        job_type="update_incremental",
        trigger_type="schedule",
        requested_by=None,
        window_start=date(2026, 8, 25),
        window_end=date(2026, 8, 25),
        progress_json={
            "_frozenWindowEnd": "2020-03-02",
            "_incrementalTargetEnd": "2026-08-25",
        },
        worker_id="worker-test",
        attempt_count=1,
        market_ids=(101, 202),
        api_config_hash=api_config_hash(frozen_config),
        api_config_snapshot_json=frozen_config,
    )

    heartbeat_calls: list[None] = []
    result = executor.execute(job, lambda: heartbeat_calls.append(None))

    assert result.status == "failed"
    assert result.error_code == "UPSTREAM_RATE_LIMIT"
    assert result.error_message == ("上游接口限流（HTTP 509，业务码 90008），已达到调用频率限制")
    assert captured["heartbeats_before_credentials"] == 2
    assert captured["context"].frozen_window_end is None
    assert captured["context"].target_window_end == date(2026, 8, 25)
    assert captured["params"]["updateTimeBegin"] == "2026-08-25 00:00:00"
    assert captured["params"]["updateTimeEnd"] == "2026-08-25 23:59:59"
    assert captured["params"]["marketIds"] == [101, 202]
    assert captured["rate_limit"] == {"max_requests": 5, "period_seconds": 1}
    assert captured["retry"] == {"retries": 1, "delay_seconds": 1}
    assert lock_calls == [{"scope": "account", "account_id": 7}]


def test_core_executor_persists_live_page_progress(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    job_id = _queue_two_window_job(harness, monkeypatch)
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        job.status = "running"
        job.worker_id = "worker-progress"
        job.attempt_count = 1
        db.commit()
        execution = SyncJobExecution(
            id=job.id,
            jijia_account_id=job.jijia_account_id,
            api_code=job.api_code,
            job_type=job.job_type,
            trigger_type=job.trigger_type,
            requested_by=job.requested_by,
            window_start=job.window_start,
            window_end=job.window_end,
            progress_json=dict(job.progress_json),
            worker_id=job.worker_id,
            attempt_count=job.attempt_count,
        )
    progress = dict(execution.progress_json or {})
    executor = CoreSyncExecutor(
        harness.session_factory.kw["bind"],
        harness.settings,
    )

    executed_sql: list[str] = []

    def record_sql(_conn, _cursor, statement, _parameters, _context, _executemany) -> None:
        executed_sql.append(statement)

    engine = harness.session_factory.kw["bind"]
    event.listen(engine, "before_cursor_execute", record_sql)
    try:
        executor._persist_page_progress(execution, progress, 12, 416)
    finally:
        event.remove(engine, "before_cursor_execute", record_sql)
    progress_sql = [sql for sql in executed_sql if "sync_job" in sql]
    assert len(progress_sql) == 1
    assert progress_sql[0].lstrip().upper().startswith("UPDATE")
    for column in ("jijia_account_id", "status", "worker_id", "attempt_count"):
        assert column in progress_sql[0]
    assert executor._pause_requested(execution) is False

    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        assert job.progress_json["currentPage"] == 12
        assert job.progress_json["totalPages"] == 416
        assert progress["currentPage"] == 12
        assert progress["totalPages"] == 416
        job.status = "pause_requested"
        db.commit()

    assert executor._pause_requested(execution) is True
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        assert job is not None
        job.worker_id = "replacement-worker"
        job.attempt_count += 1
        db.commit()

    with pytest.raises(RuntimeError, match="运行状态已变化"):
        executor._persist_page_progress(execution, progress, 13, 416)
    with pytest.raises(RuntimeError, match="领取状态已变化"):
        executor._pause_requested(execution)

    assert progress["currentPage"] == 12
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        assert job.progress_json["currentPage"] == 12
        assert job.progress_json["totalPages"] == 416
