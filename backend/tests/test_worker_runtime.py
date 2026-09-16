from collections.abc import Callable
from datetime import timedelta
from typing import Any, cast

import pytest

from backend.app.core.security import utc_now
from backend.app.models.jijia_account import (
    CredentialSource,
    JijiaAccount,
    JijiaAccountStatus,
)
from backend.app.models.sync_job import SyncJob
from backend.app.models.user import UserRole
from backend.app.models.worker_runtime import WorkerRuntime
from backend.app.services.sync_worker import SyncJobExecution, SyncWorker, WorkerResult
from backend.app.services.worker_runtime_service import (
    start_worker_runtime,
    stop_worker_runtime,
    touch_worker_runtime,
    worker_runtime_data,
)
from backend.tests.conftest import AuthHarness
from backend.tests.test_auth_api import register_user


def _queued_job(harness: AuthHarness) -> int:
    with harness.session_factory() as db:
        account = JijiaAccount(
            account_code="runtime_test",
            name="运行状态测试账号",
            masked_app_id="•••• test",
            credential_source=CredentialSource.ENCRYPTED,
            status=JijiaAccountStatus.ACTIVE,
        )
        db.add(account)
        db.flush()
        now = utc_now()
        job = SyncJob(
            job_no="job_runtime_test",
            task_no="task_runtime_test",
            jijia_account_id=account.id,
            api_code="sale_return_order_page",
            job_type="sync",
            trigger_type="manual",
            status="queued",
            queued_at=now,
        )
        db.add(job)
        db.commit()
        return job.id


def test_worker_runtime_transitions_and_stale_detection(harness: AuthHarness) -> None:
    job_id = _queued_job(harness)
    with harness.session_factory() as db:
        start_worker_runtime(db, "worker-test", "instance-test")
        db.commit()
        online = worker_runtime_data(db, harness.settings)
        assert online["availability"] == "online"
        assert online["capacityStatus"] == "ready"
        assert online["configuredWorkerCount"] == 1
        assert online["onlineWorkerCount"] == 1
        assert online["busyWorkerCount"] == 0
        assert online["idleWorkerCount"] == 1
        assert online["staleWorkerCount"] == 0

        touch_worker_runtime(
            db,
            "worker-test",
            "instance-test",
            status="running",
            current_job_id=job_id,
        )
        db.commit()
        busy = worker_runtime_data(db, harness.settings)
        assert busy["availability"] == "busy"
        assert busy["currentJobId"] == job_id

        runtime = db.get(WorkerRuntime, "worker-test")
        assert runtime is not None
        runtime.heartbeat_at = utc_now() - timedelta(seconds=91)
        db.commit()
        stale = worker_runtime_data(db, harness.settings)
        assert stale["availability"] == "offline"
        assert stale["capacityStatus"] == "offline"
        assert stale["onlineWorkerCount"] == 0
        assert stale["staleWorkerCount"] == 1


def test_sync_worker_updates_runtime_during_complete_queue_flow(
    harness: AuthHarness,
) -> None:
    job_id = _queued_job(harness)
    observed: list[tuple[object, object]] = []

    class InspectingExecutor:
        def execute(
            self,
            job: SyncJobExecution,
            heartbeat: Callable[[], None],
        ) -> WorkerResult:
            with harness.session_factory() as db:
                runtime = worker_runtime_data(db, harness.settings)
                observed.append((runtime["availability"], runtime["currentJobId"]))
            heartbeat()
            return WorkerResult(
                status="failed",
                error_code="MOCK_FAILURE",
                error_message="Mock 执行结束",
            )

    worker = SyncWorker(
        harness.session_factory,
        InspectingExecutor(),
        "worker-flow",
        track_runtime=True,
    )
    worker.start_runtime()

    assert worker.run_once() == job_id
    assert observed == [("busy", job_id)]
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        assert job is not None
        assert job.status == "failed"
        assert worker_runtime_data(db, harness.settings)["availability"] == "online"

    worker.stop_runtime()
    with harness.session_factory() as db:
        assert worker_runtime_data(db, harness.settings)["availability"] == "offline"

        stop_worker_runtime(db, "worker-test", "instance-test")
        db.commit()
        assert worker_runtime_data(db, harness.settings)["availability"] == "offline"


def test_lost_job_attempt_does_not_overwrite_worker_runtime(
    harness: AuthHarness,
) -> None:
    job_id = _queued_job(harness)
    worker = SyncWorker(
        harness.session_factory,
        cast(Any, object()),
        "worker-stale-attempt",
        track_runtime=True,
    )
    worker.start_runtime()
    execution = worker._claim_next()
    assert execution is not None
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        runtime = db.get(WorkerRuntime, "worker-stale-attempt")
        assert job is not None
        assert runtime is not None
        job.worker_id = "replacement-worker"
        job.attempt_count += 1
        runtime.status = "idle"
        runtime.current_job_id = None
        db.commit()

    with pytest.raises(RuntimeError, match="领取状态已变化"):
        worker._heartbeat(execution)

    with harness.session_factory() as db:
        runtime = db.get(WorkerRuntime, "worker-stale-attempt")
        assert runtime is not None
        assert runtime.status == "idle"
        assert runtime.current_job_id is None


def test_worker_runtime_instances_are_isolated_and_aggregated(harness: AuthHarness) -> None:
    job_id = _queued_job(harness)
    settings = harness.settings.model_copy(update={"worker_processes": 2})
    with harness.session_factory() as db:
        start_worker_runtime(db, "worker-a", "instance-a")
        start_worker_runtime(db, "worker-b", "instance-b")
        db.commit()

        touch_worker_runtime(
            db,
            "worker-a",
            "instance-a",
            status="running",
            current_job_id=job_id,
        )
        db.commit()
        runtime = worker_runtime_data(db, settings)
        assert runtime["availability"] == "online"
        assert runtime["capacityStatus"] == "ready"
        assert runtime["onlineWorkerCount"] == 2
        assert runtime["busyWorkerCount"] == 1
        assert runtime["idleWorkerCount"] == 1

        stop_worker_runtime(db, "worker-a", "instance-a")
        db.commit()
        worker_b = db.get(WorkerRuntime, "worker-b")
        assert worker_b is not None
        assert worker_b.status == "idle"
        runtime = worker_runtime_data(db, settings)
        assert runtime["availability"] == "online"
        assert runtime["capacityStatus"] == "degraded"
        assert runtime["onlineWorkerCount"] == 1
        assert runtime["busyWorkerCount"] == 0
        assert runtime["idleWorkerCount"] == 1
        assert runtime["staleWorkerCount"] == 0


def test_restarted_worker_rejects_previous_instance_heartbeat(harness: AuthHarness) -> None:
    with harness.session_factory() as db:
        start_worker_runtime(db, "worker-a", "instance-old")
        db.commit()
        start_worker_runtime(db, "worker-a", "instance-new")
        db.commit()

        with pytest.raises(RuntimeError, match="WORKER_RUNTIME_OWNERSHIP_LOST"):
            touch_worker_runtime(
                db,
                "worker-a",
                "instance-old",
                status="idle",
                current_job_id=None,
            )
        db.rollback()

        runtime = db.get(WorkerRuntime, "worker-a")
        assert runtime is not None
        assert runtime.instance_id == "instance-new"


def test_runtime_api_requires_login_and_does_not_expose_process_details(
    harness: AuthHarness,
) -> None:
    assert harness.client.get("/api/v1/runtime/worker").status_code == 401
    client, _, _ = register_user(harness, "runtime-viewer@example.com", UserRole.VIEWER)

    response = client.get("/api/v1/runtime/worker")

    assert response.status_code == 200
    assert response.json()["data"]["availability"] == "offline"
    assert "instanceId" not in response.text
    assert "worker-test" not in response.text


def test_queued_job_detail_explains_worker_offline(harness: AuthHarness) -> None:
    job_id = _queued_job(harness)
    client, _, _ = register_user(harness, "queue-viewer@example.com", UserRole.VIEWER)

    response = client.get(f"/api/v1/sync-jobs/{job_id}")

    assert response.status_code == 200
    queue_info = response.json()["data"]["queueInfo"]
    assert queue_info["reasonCode"] == "WORKER_OFFLINE"
    assert queue_info["queuedAhead"] == 0
    assert queue_info["eligibleAt"].endswith("Z")


def test_worker_health_is_independent_from_api_readiness(harness: AuthHarness) -> None:
    harness.settings.worker_processes = 2
    assert harness.client.get("/health/ready").status_code == 200
    offline = harness.client.get("/health/worker")
    assert offline.status_code == 503
    assert offline.json()["error"]["code"] == "WORKER_NOT_READY"

    with harness.session_factory() as db:
        start_worker_runtime(db, "worker-health", "instance-health")
        db.commit()

    online = harness.client.get("/health/worker")
    assert online.status_code == 200
    assert online.json()["data"] == {
        "status": "degraded",
        "configuredWorkerCount": 2,
        "onlineWorkerCount": 1,
        "busyWorkerCount": 0,
        "idleWorkerCount": 1,
        "staleWorkerCount": 0,
    }

    with harness.session_factory() as db:
        start_worker_runtime(db, "worker-health-2", "instance-health-2")
        db.commit()

    ready = harness.client.get("/health/worker")
    assert ready.status_code == 200
    assert ready.json()["data"]["status"] == "online"
    assert ready.json()["data"]["onlineWorkerCount"] == 2
