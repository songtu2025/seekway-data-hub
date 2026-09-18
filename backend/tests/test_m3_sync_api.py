import math
from datetime import date, datetime, timedelta
from types import SimpleNamespace
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, event, insert, select
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import Session

from backend.app.core.security import utc_now
from backend.app.models.account_api_policy import AccountApiPolicy
from backend.app.models.audit_log import AuditLog
from backend.app.models.jijia_account import JijiaAccount, JijiaAccountStatus
from backend.app.models.sync_job import SyncJob
from backend.app.models.sync_records import (
    failed_request_log_table,
    raw_api_data_history_table,
    raw_api_data_table,
    sync_api_log_table,
    sync_batch_table,
    sync_checkpoint_table,
)
from backend.app.models.user import UserRole
from backend.app.services.m3_common import utc_iso
from backend.app.services.sync_job_read_service import available_actions
from backend.app.services.sync_job_service import (
    _active_job_id,
    _eligible_target,
    task_window_progress,
)
from backend.app.services.sync_worker import SyncWorker, WorkerResult
from backend.tests.conftest import AuthHarness
from backend.tests.test_api_policies_api import create_active_account
from backend.tests.test_auth_api import register_user


def test_utc_iso_accepts_mysql_aggregate_datetime_string() -> None:
    assert utc_iso("2026-09-18 14:58:59") == "2026-09-18T14:58:59Z"


def enable_return_policy(
    client: TestClient,
    auth: dict,
    account_id: int,
) -> None:
    response = client.put(
        f"/api/v1/jijia-accounts/{account_id}/api-policies/sale_return_order_page",
        json={
            "enabled": True,
            "schedule_mode": "manual_only",
            "timezone": "Asia/Shanghai",
            "window_mode": "checkpoint",
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    assert response.status_code == 200


def test_scheduled_plan_view_exposes_blocker_latest_job_and_utc_time(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    response = client.put(
        f"/api/v1/jijia-accounts/{account['id']}/api-policies/sale_return_order_page",
        json={
            "enabled": True,
            "schedule_mode": "daily",
            "schedule_expr": "02:30",
            "timezone": "Asia/Shanghai",
            "window_mode": "checkpoint",
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    assert response.status_code == 200
    now = utc_now()
    with harness.session_factory() as db:
        policy = db.scalar(
            select(AccountApiPolicy).where(
                AccountApiPolicy.jijia_account_id == account["id"],
                AccountApiPolicy.api_code == "sale_return_order_page",
            )
        )
        policy.next_run_at = now - timedelta(minutes=1)
        db.add_all(
            [
                SyncJob(
                    job_no="scheduled-historical-pause",
                    task_no="TASK-30",
                    jijia_account_id=account["id"],
                    api_code="sale_return_order_page",
                    job_type="sync",
                    trigger_type="schedule",
                    status="paused",
                    queued_at=now - timedelta(hours=3),
                ),
                SyncJob(
                    job_no="scheduled-latest",
                    task_no="TASK-30",
                    jijia_account_id=account["id"],
                    api_code="sale_return_order_page",
                    job_type="sync",
                    trigger_type="schedule",
                    status="success",
                    queued_at=now - timedelta(hours=2),
                ),
                SyncJob(
                    job_no="active-blocker",
                    task_no="TASK-31",
                    jijia_account_id=account["id"],
                    api_code="sale_return_order_page",
                    job_type="sync",
                    trigger_type="manual",
                    status="paused",
                    queued_at=now - timedelta(minutes=2),
                ),
            ]
        )
        db.commit()

    result = client.get("/api/v1/sync-jobs/scheduled-plans")

    assert result.status_code == 200
    plan = result.json()["data"][0]
    assert plan["accountName"] == "策略账号"
    assert plan["apiName"] == "查询退货订单列表"
    assert plan["nextRunAt"].endswith("Z")
    assert plan["status"] == "blocked"
    assert plan["blockingJob"]["taskNo"] == "TASK-31"
    assert plan["latestScheduledJob"]["taskNo"] == "TASK-30"
    assert plan["nextWindowPreview"] == {
        "phase": "history_backfill",
        "basisLabel": "按退货时间回填",
        "nextStartDate": "2020-01-01",
        "nextEndDate": None,
        "completeThrough": None,
        "lagDays": 1,
        "maxWindowDays": 31,
        "advancesOnSuccess": True,
        "predictionStatus": "dynamic",
    }

    with harness.session_factory() as db:
        db.execute(
            insert(sync_checkpoint_table).values(
                jijia_account_id=account["id"],
                api_code="sale_return_order_page",
                checkpoint_kind="history_backfill",
                checkpoint_value={
                    "next_window_start": "2020-01-01",
                    "frozen_window_end": "2020-03-01",
                },
                checkpoint_time=now,
                created_at=now,
                updated_at=now,
            )
        )
        db.commit()
    frozen = client.get("/api/v1/sync-jobs/scheduled-plans").json()["data"][0]
    assert frozen["status"] == "blocked"
    assert frozen["nextWindowPreview"]["predictionStatus"] == "exact"
    assert frozen["nextWindowPreview"]["nextEndDate"] == "2020-01-31"

    with harness.session_factory() as db:
        blocker = db.scalar(select(SyncJob).where(SyncJob.job_no == "active-blocker"))
        blocker.status = "success"
        policy = db.scalar(
            select(AccountApiPolicy).where(
                AccountApiPolicy.jijia_account_id == account["id"],
                AccountApiPolicy.api_code == "sale_return_order_page",
            )
        )
        policy.next_run_at = now + timedelta(days=1)
        db.commit()
    normal = client.get("/api/v1/sync-jobs/scheduled-plans").json()["data"][0]
    assert normal["status"] == "normal"
    assert normal["nextWindowPreview"]["predictionStatus"] == "exact"
    assert normal["nextWindowPreview"]["nextEndDate"] == "2020-01-31"

    with harness.session_factory() as db:
        policy = db.scalar(
            select(AccountApiPolicy).where(
                AccountApiPolicy.jijia_account_id == account["id"],
                AccountApiPolicy.api_code == "sale_return_order_page",
            )
        )
        policy.next_run_at = now - timedelta(minutes=1)
        db.execute(
            delete(sync_checkpoint_table).where(
                sync_checkpoint_table.c.jijia_account_id == account["id"],
                sync_checkpoint_table.c.api_code == "sale_return_order_page",
            )
        )
        db.commit()
    unblocked = client.get("/api/v1/sync-jobs/scheduled-plans").json()["data"][0]
    assert unblocked["status"] == "overdue"
    assert unblocked["blockingJob"] is None
    assert unblocked["nextWindowPreview"]["predictionStatus"] == "dynamic"
    assert unblocked["nextWindowPreview"]["nextStartDate"] == "2020-01-01"
    assert unblocked["nextWindowPreview"]["nextEndDate"] is None

    with harness.session_factory() as db:
        db.get(JijiaAccount, account["id"]).status = JijiaAccountStatus.INACTIVE
        db.commit()
    inactive = client.get("/api/v1/sync-jobs/scheduled-plans").json()["data"][0]
    assert inactive["status"] == "account_inactive"
    assert inactive["nextWindowPreview"]["predictionStatus"] == "unavailable"


def test_scheduled_plan_previews_incremental_window_and_caught_up_state(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    fixed_now = datetime(2026, 9, 11, 0, 0, 0)
    monkeypatch.setattr(
        "backend.app.services.scheduled_plan_service.utc_now",
        lambda: fixed_now,
    )
    response = client.put(
        f"/api/v1/jijia-accounts/{account['id']}/api-policies/sale_return_order_page",
        json={
            "enabled": True,
            "schedule_mode": "daily",
            "schedule_expr": "02:30",
            "timezone": "Asia/Shanghai",
            "window_mode": "checkpoint",
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    assert response.status_code == 200
    second_policy = client.put(
        f"/api/v1/jijia-accounts/{account['id']}/api-policies/traffic_analysis_page",
        json={
            "enabled": True,
            "schedule_mode": "daily",
            "schedule_expr": "03:30",
            "timezone": "Asia/Shanghai",
            "window_mode": "checkpoint",
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    assert second_policy.status_code == 200
    with harness.session_factory() as db:
        policy = db.scalar(
            select(AccountApiPolicy).where(
                AccountApiPolicy.jijia_account_id == account["id"],
                AccountApiPolicy.api_code == "sale_return_order_page",
            )
        )
        policy.next_run_at = datetime(2026, 9, 12, 0, 0, 0)
        common = {
            "jijia_account_id": account["id"],
            "api_code": "sale_return_order_page",
            "checkpoint_time": fixed_now,
            "created_at": fixed_now,
            "updated_at": fixed_now,
        }
        db.execute(
            insert(sync_checkpoint_table),
            [
                {
                    **common,
                    "checkpoint_kind": "history_backfill",
                    "checkpoint_value": {
                        "absolute_lower_bound": "2020-01-01",
                        "next_window_start": "2026-09-01",
                        "frozen_window_end": "2026-08-31",
                        "window_end": "2026-08-31",
                        "backfill_started_at": "2026-08-01T00:00:00Z",
                    },
                },
                {
                    **common,
                    "checkpoint_kind": "update_incremental",
                    "checkpoint_value": {
                        "next_window_start": "2026-09-11",
                        "window_end": "2026-09-10",
                    },
                },
            ],
        )
        db.commit()

    statements: list[str] = []

    def capture_checkpoint_query(
        _conn,
        _cursor,
        statement: str,
        _parameters,
        _context,
        _executemany,
    ) -> None:
        if "sync_checkpoint" in statement.lower():
            statements.append(statement)

    event.listen(
        harness.session_factory.kw["bind"], "before_cursor_execute", capture_checkpoint_query
    )
    try:
        plans = client.get("/api/v1/sync-jobs/scheduled-plans").json()["data"]
    finally:
        event.remove(
            harness.session_factory.kw["bind"],
            "before_cursor_execute",
            capture_checkpoint_query,
        )

    assert len(statements) == 1
    assert len(plans) == 2
    plan = next(item for item in plans if item["apiCode"] == "sale_return_order_page")
    assert plan["nextWindowPreview"] == {
        "phase": "update_incremental",
        "basisLabel": "按修改时间增量",
        "nextStartDate": "2026-09-11",
        "nextEndDate": "2026-09-11",
        "completeThrough": "2026-09-10",
        "lagDays": 1,
        "maxWindowDays": 31,
        "advancesOnSuccess": True,
        "predictionStatus": "exact",
    }

    with harness.session_factory() as db:
        policy = db.scalar(
            select(AccountApiPolicy).where(
                AccountApiPolicy.jijia_account_id == account["id"],
                AccountApiPolicy.api_code == "sale_return_order_page",
            )
        )
        policy.next_run_at = fixed_now - timedelta(minutes=1)
        db.commit()
    overdue_plans = client.get("/api/v1/sync-jobs/scheduled-plans").json()["data"]
    overdue = next(item for item in overdue_plans if item["apiCode"] == "sale_return_order_page")
    assert overdue["status"] == "overdue"
    assert overdue["nextWindowPreview"]["predictionStatus"] == "dynamic"
    assert overdue["nextWindowPreview"]["nextStartDate"] == "2026-09-11"
    assert overdue["nextWindowPreview"]["nextEndDate"] is None
    assert overdue["nextWindowPreview"]["completeThrough"] == "2026-09-10"

    with harness.session_factory() as db:
        blocker = SyncJob(
            job_no="incremental-plan-blocker",
            task_no="incremental-plan-blocker",
            jijia_account_id=account["id"],
            api_code="sale_return_order_page",
            job_type="update_incremental",
            trigger_type="manual",
            status="paused",
            queued_at=fixed_now,
        )
        db.add(blocker)
        db.commit()
        blocker_id = blocker.id
    blocked_plans = client.get("/api/v1/sync-jobs/scheduled-plans").json()["data"]
    blocked = next(item for item in blocked_plans if item["apiCode"] == "sale_return_order_page")
    assert blocked["status"] == "blocked"
    assert blocked["nextWindowPreview"]["predictionStatus"] == "dynamic"
    assert blocked["nextWindowPreview"]["completeThrough"] == "2026-09-10"

    with harness.session_factory() as db:
        db.execute(
            sync_checkpoint_table.update()
            .where(sync_checkpoint_table.c.checkpoint_kind == "update_incremental")
            .values(
                checkpoint_value={
                    "next_window_start": "2026-09-12",
                    "window_end": "2026-09-10",
                }
            )
        )
        db.get(SyncJob, blocker_id).status = "success"
        policy = db.scalar(
            select(AccountApiPolicy).where(
                AccountApiPolicy.jijia_account_id == account["id"],
                AccountApiPolicy.api_code == "sale_return_order_page",
            )
        )
        policy.next_run_at = datetime(2026, 9, 12, 0, 0, 0)
        db.commit()
    caught_up_plans = client.get("/api/v1/sync-jobs/scheduled-plans").json()["data"]
    caught_up = next(
        item for item in caught_up_plans if item["apiCode"] == "sale_return_order_page"
    )
    assert caught_up["nextWindowPreview"]["predictionStatus"] == "caught_up"
    assert caught_up["nextWindowPreview"]["nextStartDate"] == "2026-09-12"
    assert caught_up["nextWindowPreview"]["nextEndDate"] is None
    assert caught_up["nextWindowPreview"]["completeThrough"] == "2026-09-10"


def test_stop_request_removes_further_control_actions() -> None:
    job = SyncJob(status="running", stop_after_current=True)

    assert available_actions(job, has_batch=True) == []


def create_queued_job(client: TestClient, auth: dict, account_id: int) -> int:
    response = client.post(
        "/api/v1/sync-jobs",
        json={
            "jijia_account_id": account_id,
            "api_code": "sale_return_order_page",
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    assert response.status_code == 202
    return int(response.json()["data"]["jobId"])


def test_manual_entry_ignores_historical_paused_execution(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    enable_return_policy(client, auth, account["id"])
    now = utc_now()
    with harness.session_factory() as db:
        db.add_all(
            [
                SyncJob(
                    job_no="manual-history-paused",
                    task_no="manual-history",
                    jijia_account_id=account["id"],
                    api_code="sale_return_order_page",
                    job_type="history_backfill",
                    trigger_type="manual",
                    status="paused",
                    queued_at=now - timedelta(minutes=2),
                ),
                SyncJob(
                    job_no="manual-history-success",
                    task_no="manual-history",
                    jijia_account_id=account["id"],
                    api_code="sale_return_order_page",
                    job_type="history_backfill",
                    trigger_type="retry",
                    status="success",
                    queued_at=now - timedelta(minutes=1),
                ),
            ]
        )
        db.commit()
    payload = {
        "jijia_account_id": account["id"],
        "api_code": "sale_return_order_page",
        "range_mode": "custom",
        "start_date": "2021-09-01",
        "end_date": "2021-09-30",
    }

    preview = client.post("/api/v1/sync-jobs/preview", json=payload)
    created = client.post(
        "/api/v1/sync-jobs",
        json=payload,
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert preview.status_code == 200
    assert preview.json()["data"]["activeTask"] is None
    assert created.status_code == 202


def test_custom_range_preview_and_create_do_not_advance_checkpoint(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    enable_return_policy(client, auth, account["id"])
    payload = {
        "jijia_account_id": account["id"],
        "api_code": "sale_return_order_page",
        "range_mode": "custom",
        "start_date": "2021-09-01",
        "end_date": "2021-11-01",
    }

    preview = client.post("/api/v1/sync-jobs/preview", json=payload)

    assert preview.status_code == 200
    data = preview.json()["data"]
    assert data["checkpoint"]["nextWindowStart"] == data["startDate"]
    assert data["checkpoint"]["advancesOnSuccess"] is False
    assert data["recentSuccessfulRunAt"] is None
    assert data["executionReadiness"] == {
        "workerAvailability": "offline",
        "queueDepth": 0,
    }
    assert data["windowCount"] == 2
    assert data["windows"] == [
        {"index": 1, "startDate": "2021-09-01", "endDate": "2021-10-01"},
        {"index": 2, "startDate": "2021-10-02", "endDate": "2021-11-01"},
    ]
    accepted = client.post(
        "/api/v1/sync-jobs",
        json=payload,
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    assert accepted.status_code == 202
    detail = client.get(f"/api/v1/sync-jobs/{accepted.json()['data']['jobId']}").json()["data"]
    active_preview = client.post("/api/v1/sync-jobs/preview", json=payload)
    assert active_preview.status_code == 200
    assert active_preview.json()["data"]["activeTask"] == {
        "id": accepted.json()["data"]["jobId"],
        "taskNo": detail["taskNo"],
        "status": "queued",
    }
    assert detail["taskNo"]
    assert detail["rangeMode"] == "custom"
    assert detail["advanceCheckpoint"] is False
    assert detail["taskStart"] == "2021-09-01"
    assert detail["taskEnd"] == "2021-11-01"
    assert detail["totalWindows"] == 2


def test_custom_range_retry_preserves_failed_window_and_task_context(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    enable_return_policy(client, auth, account["id"])
    payload = {
        "jijia_account_id": account["id"],
        "api_code": "sale_return_order_page",
        "range_mode": "custom",
        "start_date": "2021-09-01",
        "end_date": "2021-11-01",
    }
    accepted = client.post(
        "/api/v1/sync-jobs",
        json=payload,
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    job_id = accepted.json()["data"]["jobId"]

    with harness.session_factory() as db:
        original = db.get(SyncJob, job_id)
        original.status = "failed"
        original.window_start = date(2021, 10, 2)
        original.window_end = date(2021, 11, 1)
        original.window_index = 2
        original.progress_json = {
            **original.progress_json,
            "completedWindows": 1,
            "currentPage": 7,
            "totalPages": 8,
        }
        expected_job_type = original.job_type
        expected_task_no = original.task_no
        expected_task_start = original.task_start
        expected_task_end = original.task_end
        expected_total_windows = original.total_windows
        expected_config_hash = original.api_config_hash
        original.api_config_version = 0
        original.api_config_hash = "stale-config"
        original.api_config_snapshot_json = {"path": "/stale"}
        db.commit()

    retried = client.post(
        f"/api/v1/sync-jobs/{job_id}/retry",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert retried.status_code == 202
    with harness.session_factory() as db:
        original = db.get(SyncJob, job_id)
        retry = db.get(SyncJob, retried.json()["data"]["jobId"])
        assert original.status == "failed"
        assert retry.retry_of_job_id == job_id
        assert retry.job_type == expected_job_type
        assert retry.window_start == date(2021, 10, 2)
        assert retry.window_end == date(2021, 11, 1)
        assert retry.progress_json["completedWindows"] == 1
        assert retry.progress_json["currentPage"] == 0
        assert retry.progress_json["totalPages"] == 0
        assert retry.task_no == expected_task_no
        assert retry.task_start == expected_task_start
        assert retry.task_end == expected_task_end
        assert retry.range_mode == "custom"
        assert retry.window_index == 2
        assert retry.total_windows == expected_total_windows
        assert retry.advance_checkpoint is False
        assert retry.api_config_hash == expected_config_hash
        assert retry.api_config_snapshot_json["path"] != "/stale"


def test_market_options_are_safely_projected_and_selected_scope_is_frozen(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    enable_return_policy(client, auth, account["id"])
    now = datetime(2026, 8, 26, 8, 0, 0)
    with harness.session_factory() as db:
        db.execute(
            insert(sync_api_log_table).values(
                sync_batch_no="shop-batch-latest",
                jijia_account_id=account["id"],
                api_code="amazon_shop_page",
                status="success",
                request_count=1,
                success_count=2,
                failed_count=0,
                started_at=now,
                finished_at=now,
                created_at=now,
                updated_at=now,
            )
        )
        db.execute(
            insert(raw_api_data_table).values(
                jijia_account_id=account["id"],
                api_code="amazon_shop_page",
                source_primary_key="shop-row",
                record_identity="shop-row-identity",
                data_hash="shop-row-hash",
                raw_json={
                    "store": "店铺 A",
                    "sellerId": "sensitive-value",
                    "marketListVos": [
                        {"marketId": 202, "marketName": "加拿大站"},
                        {"marketId": 101, "marketName": "美国站"},
                    ],
                },
                sync_batch_no="shop-batch-latest",
                first_observed_at=now,
                last_observed_at=now,
                observation_count=1,
                created_at=now,
                updated_at=now,
            )
        )
        db.commit()

    options = client.get(
        "/api/v1/sync-jobs/market-options",
        params={
            "jijia_account_id": account["id"],
            "api_code": "sale_return_order_page",
        },
    )

    assert options.status_code == 200
    assert options.json()["data"] == [
        {"marketId": 101, "label": "美国站"},
        {"marketId": 202, "label": "加拿大站"},
    ]
    assert "sensitive-value" not in options.text
    payload = {
        "jijia_account_id": account["id"],
        "api_code": "sale_return_order_page",
        "market_ids": [202, 101],
    }
    preview = client.post("/api/v1/sync-jobs/preview", json=payload)
    assert preview.status_code == 200
    assert preview.json()["data"]["scopeMode"] == "selected"
    assert preview.json()["data"]["selectedMarketIds"] == [101, 202]
    payload["preview_token"] = preview.json()["data"]["previewToken"]
    accepted = client.post(
        "/api/v1/sync-jobs",
        json=payload,
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    assert accepted.status_code == 202
    detail = client.get(f"/api/v1/sync-jobs/{accepted.json()['data']['jobId']}")
    assert detail.json()["data"]["marketIds"] == [101, 202]
    invalid = client.post(
        "/api/v1/sync-jobs/preview",
        json={**payload, "market_ids": [999], "preview_token": None},
    )
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "MARKET_SCOPE_INVALID"


def test_running_job_pause_withdraw_and_resume(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    enable_return_policy(client, auth, account["id"])
    job_id = create_queued_job(client, auth, account["id"])
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        assert job is not None
        original_window_start = job.window_start.isoformat() if job.window_start else None
        job.market_ids_json = [101, 202]
        job.status = "running"
        job.worker_id = "worker-test"
        db.commit()

    paused_request = client.post(
        f"/api/v1/sync-jobs/{job_id}/pause",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    assert paused_request.json()["data"]["status"] == "pause_requested"
    withdrawn = client.post(
        f"/api/v1/sync-jobs/{job_id}/pause/withdraw",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    assert withdrawn.json()["data"]["status"] == "running"

    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        assert job is not None
        job.status = "paused"
        db.commit()
    resumed = client.post(
        f"/api/v1/sync-jobs/{job_id}/resume",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    assert resumed.status_code == 202
    resumed_id = resumed.json()["data"]["jobId"]
    assert resumed_id != job_id
    detail = client.get(f"/api/v1/sync-jobs/{resumed_id}").json()["data"]
    assert detail["status"] == "queued"
    assert detail["windowStart"] == original_window_start
    assert detail["marketIds"] == [101, 202]
    assert detail["historyProgress"]["currentPage"] == 0


def test_historical_paused_execution_cannot_resume_after_task_success(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    enable_return_policy(client, auth, account["id"])
    now = utc_now()
    with harness.session_factory() as db:
        paused = SyncJob(
            job_no="resume-history-paused",
            task_no="resume-history",
            jijia_account_id=account["id"],
            api_code="sale_return_order_page",
            job_type="history_backfill",
            trigger_type="manual",
            status="paused",
            queued_at=now - timedelta(minutes=1),
        )
        succeeded = SyncJob(
            job_no="resume-history-success",
            task_no="resume-history",
            jijia_account_id=account["id"],
            api_code="sale_return_order_page",
            job_type="history_backfill",
            trigger_type="retry",
            status="success",
            queued_at=now,
        )
        db.add_all([paused, succeeded])
        db.commit()
        paused_id = paused.id

    resumed = client.post(
        f"/api/v1/sync-jobs/{paused_id}/resume",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert resumed.status_code == 409
    assert resumed.json()["error"]["code"] == "SYNC_JOB_NOT_CURRENT"


def test_stopping_paused_job_records_actual_change_and_blocks_resume(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    enable_return_policy(client, auth, account["id"])
    job_id = create_queued_job(client, auth, account["id"])
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        assert job is not None
        job.status = "paused"
        db.commit()

    stopped = client.post(
        f"/api/v1/sync-jobs/{job_id}/stop",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert stopped.status_code == 200
    assert stopped.json()["data"]["status"] == "stopped"
    with harness.session_factory() as db:
        audit = db.scalar(
            select(AuditLog).where(
                AuditLog.action == "sync_job.stop",
                AuditLog.resource_id == str(job_id),
            )
        )
        assert audit is not None
        assert audit.changes_json == {"status": "stopped"}
        job = db.get(SyncJob, job_id)
        assert job is not None
        job.status = "paused"
        job.stop_after_current = True
        db.commit()

    resumed = client.post(
        f"/api/v1/sync-jobs/{job_id}/resume",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert resumed.status_code == 409
    assert resumed.json()["error"]["code"] == "SYNC_JOB_NOT_PAUSED"


class CapturingScalarSession:
    """捕获服务生成的查询，避免契约测试连接真实 MySQL。"""

    def __init__(self) -> None:
        self.statement: Any = None

    def scalar(self, statement: Any) -> None:
        self.statement = statement
        return None


def test_active_job_lookup_uses_mysql_locking_current_read() -> None:
    session = CapturingScalarSession()

    assert (
        _active_job_id(
            cast(Session, session),
            7,
            "sale_return_order_page",
        )
        is None
    )

    compiled = str(
        session.statement.compile(
            dialect=mysql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    ).upper()
    assert "FOR UPDATE" in compiled
    assert "MAX(SYNC_JOB.ID)" in compiled


def test_eligible_target_keeps_policy_row_as_serialization_lock(monkeypatch) -> None:
    account = SimpleNamespace(id=7, status=JijiaAccountStatus.ACTIVE)
    policy = SimpleNamespace(id=9, enabled=True)

    class CapturingPolicySession:
        statement: Any = None

        @staticmethod
        def get(_model: Any, _account_id: int) -> Any:
            return account

        def scalar(self, statement: Any) -> Any:
            self.statement = statement
            return policy

    session = CapturingPolicySession()
    api = {
        "api_code": "sale_return_order_page",
        "enabled": False,
        "_registry": {
            "platformEnabled": True,
            "readOnlyVerified": True,
        },
    }
    monkeypatch.setattr(
        "backend.app.services.sync_job_service.catalog_by_code",
        lambda _db: {"sale_return_order_page": api},
    )

    selected = _eligible_target(
        cast(Session, session),
        7,
        "sale_return_order_page",
    )

    assert selected == (account, policy, api)
    compiled = str(
        session.statement.compile(
            dialect=mysql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    ).upper()
    assert "FOR UPDATE" in compiled


def test_job_enqueue_is_non_blocking_and_viewer_is_read_only(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    disabled = client.post(
        "/api/v1/sync-jobs",
        json={
            "jijia_account_id": account["id"],
            "api_code": "sale_return_order_page",
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    assert disabled.status_code == 409
    assert disabled.json()["error"]["code"] == "API_POLICY_DISABLED"

    enable_return_policy(client, auth, account["id"])
    accepted = client.post(
        "/api/v1/sync-jobs",
        json={
            "jijia_account_id": account["id"],
            "api_code": "sale_return_order_page",
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    assert accepted.status_code == 202
    job_id = accepted.json()["data"]["jobId"]
    detail = client.get(f"/api/v1/sync-jobs/{job_id}")
    assert detail.status_code == 200
    assert detail.json()["data"]["status"] == "queued"
    assert detail.json()["data"]["jobType"] == "history_backfill"
    assert detail.json()["data"]["attemptCount"] == 0
    assert detail.json()["data"]["maxAttempts"] == 2
    assert detail.json()["data"]["availableActions"] == ["cancel"]
    assert detail.json()["data"]["apiName"] == "查询退货订单列表"
    assert detail.json()["data"]["queuedAt"].endswith("Z")
    assert detail.json()["data"]["progressSummary"]["requestCount"] is None
    assert detail.json()["data"]["lifecycleEvents"][0]["eventType"] == "created"
    assert detail.json()["data"]["syncRunId"] is None
    assert detail.json()["data"]["createdAt"].endswith("Z")
    listed = client.get("/api/v1/sync-jobs")
    assert set(listed.json()["data"]) == {"items", "nextCursor", "summary"}
    assert listed.json()["data"]["items"][0]["jobType"] == "history_backfill"
    assert listed.json()["data"]["items"][0]["queueInfo"]["queuedAhead"] == 0
    assert listed.json()["data"]["summary"] == {
        "total": 1,
        "active": 1,
        "attention": 0,
        "success": 0,
        "ended": 0,
    }
    scheduled_only = client.get("/api/v1/sync-jobs?trigger_type=schedule").json()["data"]
    assert scheduled_only["items"] == []
    assert scheduled_only["summary"]["total"] == 1
    manual_only = client.get("/api/v1/sync-jobs?trigger_type=manual").json()["data"]
    assert [item["id"] for item in manual_only["items"]] == [job_id]

    with TestClient(harness.app) as viewer_client:
        _, viewer_auth, _ = register_user(
            harness,
            "job-viewer@example.com",
            UserRole.VIEWER,
            viewer_client,
        )
        viewer_list = viewer_client.get("/api/v1/sync-jobs")
        viewer_detail = viewer_client.get(f"/api/v1/sync-jobs/{job_id}")
        forbidden = viewer_client.post(
            "/api/v1/sync-jobs",
            json={
                "jijia_account_id": account["id"],
                "api_code": "sale_return_order_page",
            },
            headers={"X-CSRF-Token": viewer_auth["csrfToken"]},
        )

    assert viewer_list.status_code == 200
    assert viewer_list.json()["data"]["items"][0]["id"] == job_id
    assert viewer_detail.status_code == 200
    assert viewer_detail.json()["data"]["lifecycleEvents"][0]["actorName"] is None
    assert forbidden.status_code == 403
    assert forbidden.json()["error"]["code"] == "PERMISSION_DENIED"

    with harness.session_factory() as db:
        assert db.get(SyncJob, job_id).max_attempts == 2

    with harness.session_factory() as db:
        original = db.get(SyncJob, job_id)
        original.status = "failed"
        now = datetime(2026, 8, 26, 8, 0, 0)
        run_id = db.execute(
            insert(sync_batch_table).values(
                sync_batch_no=f"batch-{job_id}",
                jijia_account_id=account["id"],
                sync_job_id=job_id,
                status="failed",
                started_at=now,
                finished_at=now,
                total_api_count=1,
                success_api_count=0,
                failed_api_count=1,
                created_at=now,
                updated_at=now,
            )
        ).inserted_primary_key[0]
        db.execute(
            insert(sync_api_log_table).values(
                sync_batch_no=f"batch-{job_id}",
                jijia_account_id=account["id"],
                api_code="sale_return_order_page",
                status="failed",
                request_count=4,
                success_count=0,
                failed_count=1,
                started_at=now,
                finished_at=now,
                error_message="请求失败",
                created_at=now,
                updated_at=now,
            )
        )
        db.commit()
    failed_detail = client.get(f"/api/v1/sync-jobs/{job_id}")
    assert failed_detail.json()["data"]["syncRunId"] == run_id
    assert failed_detail.json()["data"]["availableActions"] == ["retry", "dismiss"]
    assert failed_detail.json()["data"]["failureInfo"]["category"] == "system"
    assert failed_detail.json()["data"]["progressSummary"]["requestCount"] == 4
    assert failed_detail.json()["data"]["progressSummary"]["failedApiCount"] == 1
    failed_list = client.get("/api/v1/sync-jobs?status=failed")
    assert failed_list.json()["data"]["items"][0]["syncRunId"] == run_id
    assert failed_list.json()["data"]["summary"]["attention"] == 1
    unrelated_api = client.get("/api/v1/sync-jobs?api_code=amazon_shop_page")
    assert unrelated_api.json()["data"]["summary"]["total"] == 0
    attention_list = client.get("/api/v1/sync-jobs?status_group=attention")
    assert [row["id"] for row in attention_list.json()["data"]["items"]] == [job_id]
    retried = client.post(
        f"/api/v1/sync-jobs/{job_id}/retry",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    assert retried.status_code == 202
    retry_id = retried.json()["data"]["jobId"]
    retry_detail = client.get(f"/api/v1/sync-jobs/{retry_id}").json()["data"]
    assert retry_detail["triggerType"] == "retry"
    assert retry_detail["status"] == "queued"
    with harness.session_factory() as db:
        original = db.get(SyncJob, job_id)
        retry = db.get(SyncJob, retry_id)
        assert retry.window_start == original.window_start
        assert retry.window_end == original.window_end


def test_admin_can_cancel_queued_job_idempotently_and_worker_ignores_it(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    enable_return_policy(client, auth, account["id"])
    job_id = create_queued_job(client, auth, account["id"])

    cancelled = client.post(
        f"/api/v1/sync-jobs/{job_id}/cancel",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    repeated = client.post(
        f"/api/v1/sync-jobs/{job_id}/cancel",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert cancelled.status_code == 200
    assert cancelled.json()["data"] == {"jobId": job_id, "status": "cancelled"}
    assert repeated.status_code == 200
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        assert job is not None
        assert job.status == "cancelled"
        assert job.finished_at is not None
        assert job.error_code is None
        assert job.error_message is None
        audits = list(
            db.scalars(
                select(AuditLog).where(
                    AuditLog.action == "sync_job.cancel",
                    AuditLog.resource_id == str(job_id),
                )
            ).all()
        )
        assert len(audits) == 1
        assert audits[0].actor_user_id == auth["user"]["id"]
        assert audits[0].jijia_account_id == account["id"]
        assert audits[0].changes_json == {"status": "cancelled"}

    worker = SyncWorker(
        harness.session_factory,
        cast(Any, SimpleNamespace()),
        worker_id="cancel-test-worker",
    )
    assert worker.run_once() is None


def test_operator_can_cancel_but_viewer_cannot(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    enable_return_policy(client, auth, account["id"])
    operator_job_id = create_queued_job(client, auth, account["id"])

    with TestClient(harness.app) as operator_client:
        _, operator_auth, _ = register_user(
            harness,
            "cancel-operator@example.com",
            UserRole.OPERATOR,
            operator_client,
        )
        operator_response = operator_client.post(
            f"/api/v1/sync-jobs/{operator_job_id}/cancel",
            headers={"X-CSRF-Token": operator_auth["csrfToken"]},
        )
    assert operator_response.status_code == 200

    viewer_job_id = create_queued_job(client, auth, account["id"])
    with TestClient(harness.app) as viewer_client:
        _, viewer_auth, _ = register_user(
            harness,
            "cancel-viewer@example.com",
            UserRole.VIEWER,
            viewer_client,
        )
        viewer_response = viewer_client.post(
            f"/api/v1/sync-jobs/{viewer_job_id}/cancel",
            headers={"X-CSRF-Token": viewer_auth["csrfToken"]},
        )
    assert viewer_response.status_code == 403
    assert viewer_response.json()["error"]["code"] == "PERMISSION_DENIED"


@pytest.mark.parametrize("job_status", ["running", "success", "partial_failed", "failed"])
def test_non_queued_job_cannot_be_cancelled(
    harness: AuthHarness,
    monkeypatch,
    job_status: str,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    enable_return_policy(client, auth, account["id"])
    job_id = create_queued_job(client, auth, account["id"])
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        job.status = job_status
        db.commit()

    response = client.post(
        f"/api/v1/sync-jobs/{job_id}/cancel",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "SYNC_JOB_NOT_CANCELLABLE"


def test_queued_job_with_batch_cannot_be_cancelled(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    enable_return_policy(client, auth, account["id"])
    job_id = create_queued_job(client, auth, account["id"])
    now = datetime(2026, 8, 27, 8, 0, 0)
    with harness.session_factory() as db:
        db.execute(
            insert(sync_batch_table).values(
                sync_batch_no=f"cancel-batch-{job_id}",
                jijia_account_id=account["id"],
                sync_job_id=job_id,
                status="running",
                started_at=now,
                total_api_count=1,
                success_api_count=0,
                failed_api_count=0,
                created_at=now,
                updated_at=now,
            )
        )
        db.commit()

    response = client.post(
        f"/api/v1/sync-jobs/{job_id}/cancel",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "SYNC_JOB_BATCH_EXISTS"


def test_first_history_job_uses_discovered_checkpoint_baseline(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    enable_return_policy(client, auth, account["id"])
    discovered_start = date(2020, 2, 20)
    with harness.session_factory() as db:
        db.execute(
            insert(sync_checkpoint_table).values(
                jijia_account_id=account["id"],
                api_code="sale_return_order_page",
                checkpoint_kind="history_backfill",
                checkpoint_value={
                    "next_window_start": discovered_start.isoformat(),
                    "absolute_lower_bound": discovered_start.isoformat(),
                    "start_source": "earliest_date_discovery",
                },
                created_at=datetime(2026, 8, 26, 8, 0, 0),
                updated_at=datetime(2026, 8, 26, 8, 0, 0),
            )
        )
        db.commit()

    response = client.post(
        "/api/v1/sync-jobs",
        json={
            "jijia_account_id": account["id"],
            "api_code": "sale_return_order_page",
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert response.status_code == 202
    with harness.session_factory() as db:
        job = db.get(SyncJob, response.json()["data"]["jobId"])
        frozen_end = date.fromisoformat(job.progress_json["_frozenWindowEnd"])
        expected_total = math.ceil(((frozen_end - discovered_start).days + 1) / 31)
        assert job.window_start == discovered_start
        assert job.window_end == date(2020, 3, 21)
        assert job.progress_json["completedWindows"] == 0
        assert job.progress_json["totalWindows"] == expected_total


def test_same_window_retry_resets_pages_and_preserves_history_watermarks(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    enable_return_policy(client, auth, account["id"])
    accepted = client.post(
        "/api/v1/sync-jobs",
        json={
            "jijia_account_id": account["id"],
            "api_code": "sale_return_order_page",
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    job_id = accepted.json()["data"]["jobId"]

    with harness.session_factory() as db:
        original = db.get(SyncJob, job_id)
        original.status = "failed"
        original_progress = {
            **original.progress_json,
            "currentPage": 7,
            "totalPages": 20,
        }
        original.progress_json = original_progress
        db.commit()

    retried = client.post(
        f"/api/v1/sync-jobs/{job_id}/retry",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert retried.status_code == 202
    with harness.session_factory() as db:
        retry = db.get(SyncJob, retried.json()["data"]["jobId"])
        assert retry.window_start == original.window_start
        assert retry.window_end == original.window_end
        assert retry.progress_json["currentPage"] == 0
        assert retry.progress_json["totalPages"] == 0
        for key in (
            "completedWindows",
            "totalWindows",
            "historyCompleteThrough",
            "_frozenWindowEnd",
            "_backfillStartedAt",
            "_incrementalWindowDays",
            "_incrementalTimezone",
            "_incrementalLagDays",
        ):
            assert retry.progress_json[key] == original_progress[key]


def test_retry_resumes_from_history_checkpoint_after_core_commit(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    enable_return_policy(client, auth, account["id"])
    accepted = client.post(
        "/api/v1/sync-jobs",
        json={
            "jijia_account_id": account["id"],
            "api_code": "sale_return_order_page",
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    job_id = accepted.json()["data"]["jobId"]

    with harness.session_factory() as db:
        original = db.get(SyncJob, job_id)
        frozen_end = original.progress_json["_frozenWindowEnd"]
        backfill_started_at = original.progress_json["_backfillStartedAt"]
        original.status = "failed"
        db.execute(
            insert(sync_checkpoint_table).values(
                jijia_account_id=account["id"],
                api_code="sale_return_order_page",
                checkpoint_kind="history_backfill",
                checkpoint_value={
                    "next_window_start": "2020-02-01",
                    "window_end": "2020-01-31",
                    "frozen_window_end": frozen_end,
                    "backfill_started_at": backfill_started_at,
                },
                created_at=datetime(2026, 8, 26, 8, 0, 0),
                updated_at=datetime(2026, 8, 26, 8, 0, 0),
            )
        )
        db.commit()

    retried = client.post(
        f"/api/v1/sync-jobs/{job_id}/retry",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert retried.status_code == 202
    with harness.session_factory() as db:
        retry = db.get(SyncJob, retried.json()["data"]["jobId"])
        assert retry.job_type == "history_backfill"
        assert retry.window_start == date(2020, 2, 1)
        assert retry.window_end == date(2020, 3, 2)
        assert retry.progress_json["completedWindows"] == 1
        assert retry.retry_of_job_id == job_id


def test_incremental_start_uses_fixed_policy_timezone_date(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    response = client.put(
        f"/api/v1/jijia-accounts/{account['id']}/api-policies/sale_return_order_page",
        json={
            "enabled": True,
            "schedule_mode": "manual_only",
            "timezone": "Asia/Shanghai",
            "window_mode": "checkpoint",
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    assert response.status_code == 200
    fixed_utc = datetime(2026, 8, 27, 12, 0, 0)
    monkeypatch.setattr(
        "backend.app.services.sync_job_service.utc_now",
        lambda: fixed_utc,
    )
    with harness.session_factory() as db:
        db.execute(
            insert(sync_checkpoint_table).values(
                jijia_account_id=account["id"],
                api_code="sale_return_order_page",
                checkpoint_kind="history_backfill",
                checkpoint_value={
                    "next_window_start": "2026-08-27",
                    "frozen_window_end": "2026-08-26",
                    "backfill_started_at": "2026-08-26T02:30:00Z",
                },
                created_at=fixed_utc,
                updated_at=fixed_utc,
            )
        )
        db.commit()

    accepted = client.post(
        "/api/v1/sync-jobs",
        json={
            "jijia_account_id": account["id"],
            "api_code": "sale_return_order_page",
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert accepted.status_code == 202
    with harness.session_factory() as db:
        job = db.get(SyncJob, accepted.json()["data"]["jobId"])
        assert job.job_type == "update_incremental"
        assert job.window_start == date(2026, 8, 26)
        assert job.window_end == date(2026, 8, 26)


def test_retry_resumes_from_incremental_checkpoint_after_core_commit(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    enable_return_policy(client, auth, account["id"])
    fixed_utc = datetime(2026, 8, 27, 12, 0, 0)
    monkeypatch.setattr(
        "backend.app.services.sync_job_service.utc_now",
        lambda: fixed_utc,
    )
    with harness.session_factory() as db:
        db.execute(
            insert(sync_checkpoint_table),
            [
                {
                    "jijia_account_id": account["id"],
                    "api_code": "sale_return_order_page",
                    "checkpoint_kind": "history_backfill",
                    "checkpoint_value": {
                        "next_window_start": "2026-08-27",
                        "frozen_window_end": "2026-08-26",
                        "backfill_started_at": "2026-08-20T08:00:00Z",
                    },
                    "created_at": fixed_utc,
                    "updated_at": fixed_utc,
                },
                {
                    "jijia_account_id": account["id"],
                    "api_code": "sale_return_order_page",
                    "checkpoint_kind": "update_incremental",
                    "checkpoint_value": {
                        "next_window_start": "2026-08-26",
                        "window_end": "2026-08-25",
                    },
                    "created_at": fixed_utc,
                    "updated_at": fixed_utc,
                },
            ],
        )
        original = SyncJob(
            job_no="job_failed_after_incremental_commit",
            jijia_account_id=account["id"],
            api_code="sale_return_order_page",
            job_type="update_incremental",
            trigger_type="manual",
            status="failed",
            window_start=date(2026, 8, 25),
            window_end=date(2026, 8, 25),
            progress_json={"currentPage": 1, "totalPages": 1},
            attempt_count=1,
            max_attempts=2,
            queued_at=fixed_utc,
        )
        db.add(original)
        db.commit()
        original_id = original.id

    retried = client.post(
        f"/api/v1/sync-jobs/{original_id}/retry",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert retried.status_code == 202
    with harness.session_factory() as db:
        retry = db.get(SyncJob, retried.json()["data"]["jobId"])
        assert retry.job_type == "update_incremental"
        assert retry.window_start == date(2026, 8, 26)
        assert retry.window_end == date(2026, 8, 26)
        assert retry.retry_of_job_id == original_id


def test_retry_marks_caught_up_task_resolved_without_new_execution(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    enable_return_policy(client, auth, account["id"])
    fixed_utc = datetime(2026, 8, 27, 12, 0, 0)
    monkeypatch.setattr(
        "backend.app.services.sync_job_service.utc_now",
        lambda: fixed_utc,
    )
    task_no = "task_caught_up_retry"
    with harness.session_factory() as db:
        db.execute(
            insert(sync_checkpoint_table),
            [
                {
                    "jijia_account_id": account["id"],
                    "api_code": "sale_return_order_page",
                    "checkpoint_kind": "history_backfill",
                    "checkpoint_value": {
                        "next_window_start": "2026-08-27",
                        "frozen_window_end": "2026-08-26",
                        "backfill_started_at": "2026-08-20T08:00:00Z",
                    },
                    "created_at": fixed_utc,
                    "updated_at": fixed_utc,
                },
                {
                    "jijia_account_id": account["id"],
                    "api_code": "sale_return_order_page",
                    "checkpoint_kind": "update_incremental",
                    "checkpoint_value": {
                        "next_window_start": "2026-08-27",
                        "window_end": "2026-08-26",
                    },
                    "created_at": fixed_utc,
                    "updated_at": fixed_utc,
                },
            ],
        )
        original = SyncJob(
            job_no="job_caught_up_retry",
            task_no=task_no,
            jijia_account_id=account["id"],
            api_code="sale_return_order_page",
            job_type="update_incremental",
            trigger_type="manual",
            status="failed",
            window_start=date(2026, 8, 26),
            window_end=date(2026, 8, 26),
            progress_json={"currentPage": 1, "totalPages": 1},
            attempt_count=1,
            max_attempts=2,
            queued_at=fixed_utc,
            error_code="UPSTREAM_API_FAILED",
            error_message="同步接口执行失败",
        )
        db.add(original)
        db.commit()
        original_id = original.id

    resolved = client.post(
        f"/api/v1/sync-jobs/tasks/{task_no}/retry",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    repeated = client.post(
        f"/api/v1/sync-jobs/tasks/{task_no}/retry",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert resolved.status_code == 200
    assert resolved.json()["data"] == {
        "outcome": "already_caught_up",
        "jobId": original_id,
        "taskNo": task_no,
        "taskStatus": "caught_up",
    }
    assert repeated.status_code == 200
    assert repeated.json()["data"] == resolved.json()["data"]
    with harness.session_factory() as db:
        jobs = list(db.scalars(select(SyncJob).where(SyncJob.task_no == task_no)).all())
        audits = list(
            db.scalars(
                select(AuditLog).where(
                    AuditLog.action == "sync_job.retry_noop",
                    AuditLog.resource_id == str(original_id),
                )
            ).all()
        )
        assert len(jobs) == 1
        assert jobs[0].status == "failed"
        assert jobs[0].error_code == "UPSTREAM_API_FAILED"
        assert jobs[0].resolution_code == "incremental_caught_up"
        assert jobs[0].resolved_at == fixed_utc
        assert len(audits) == 1

    detail = client.get(f"/api/v1/sync-jobs/tasks/{task_no}").json()["data"]
    successful = client.get("/api/v1/sync-jobs?status_group=success").json()["data"]
    attention = client.get("/api/v1/sync-jobs?status_group=attention").json()["data"]

    assert detail["status"] == "failed"
    assert detail["taskStatus"] == "caught_up"
    assert detail["resolutionCode"] == "incremental_caught_up"
    assert detail["availableActions"] == []
    assert any(item["taskNo"] == task_no for item in successful["items"])
    assert all(item["taskNo"] != task_no for item in attention["items"])
    assert successful["summary"]["success"] == 1


def test_dismiss_and_restore_failed_task_attention(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    fixed_utc = datetime(2026, 9, 17, 9, 30, 0)
    monkeypatch.setattr(
        "backend.app.services.sync_job_service.utc_now",
        lambda: fixed_utc,
    )
    task_no = "task_operator_dismissed"
    batch_no = "batch_operator_dismissed"
    with harness.session_factory() as db:
        job = SyncJob(
            job_no="job_operator_dismissed",
            task_no=task_no,
            jijia_account_id=account["id"],
            api_code="sale_return_order_page",
            job_type="sync",
            trigger_type="manual",
            status="failed",
            sync_batch_no=batch_no,
            queued_at=fixed_utc,
            error_code="UPSTREAM_API_FAILED",
            error_message="同步接口执行失败",
        )
        db.add(job)
        db.execute(
            insert(failed_request_log_table).values(
                sync_batch_no=batch_no,
                jijia_account_id=account["id"],
                api_code="sale_return_order_page",
                request_method="POST",
                error_message="safe error",
                retry_count=1,
                created_at=fixed_utc,
                updated_at=fixed_utc,
            )
        )
        db.commit()
        job_id = job.id

    before = client.get("/api/v1/dashboard").json()["data"]
    assert before["failedJobs"] == 1
    assert before["failedRequests"] == 1

    dismissed = client.post(
        f"/api/v1/sync-jobs/tasks/{task_no}/dismiss",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    repeated_dismiss = client.post(
        f"/api/v1/sync-jobs/tasks/{task_no}/dismiss",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert dismissed.status_code == 200
    assert repeated_dismiss.status_code == 200
    detail = client.get(f"/api/v1/sync-jobs/tasks/{task_no}").json()["data"]
    attention = client.get("/api/v1/sync-jobs?status_group=attention").json()["data"]
    ended = client.get("/api/v1/sync-jobs?status_group=ended").json()["data"]
    filtered = client.get("/api/v1/sync-jobs?status=dismissed").json()["data"]
    dashboard = client.get("/api/v1/dashboard").json()["data"]
    blocked_retry = client.post(
        f"/api/v1/sync-jobs/{job_id}/retry",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert detail["status"] == "failed"
    assert detail["taskStatus"] == "dismissed"
    assert detail["resolutionCode"] == "operator_dismissed"
    assert detail["resolvedAt"] == "2026-09-17T09:30:00Z"
    assert detail["errorCode"] == "UPSTREAM_API_FAILED"
    assert detail["availableActions"] == ["restore_attention"]
    assert any(event["eventType"] == "dismissed" for event in detail["lifecycleEvents"])
    assert all(item["taskNo"] != task_no for item in attention["items"])
    assert any(item["taskNo"] == task_no for item in ended["items"])
    assert [item["taskNo"] for item in filtered["items"]] == [task_no]
    assert dashboard["failedJobs"] == 0
    assert dashboard["failedRequests"] == 0
    assert blocked_retry.status_code == 409
    assert blocked_retry.json()["error"]["code"] == "SYNC_JOB_RESOLVED"

    restored = client.post(
        f"/api/v1/sync-jobs/tasks/{task_no}/restore-attention",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    repeated_restore = client.post(
        f"/api/v1/sync-jobs/tasks/{task_no}/restore-attention",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert restored.status_code == 200
    assert repeated_restore.status_code == 200
    restored_detail = client.get(f"/api/v1/sync-jobs/tasks/{task_no}").json()["data"]
    restored_dashboard = client.get("/api/v1/dashboard").json()["data"]
    assert restored_detail["taskStatus"] == "attention"
    assert restored_detail["resolutionCode"] is None
    assert restored_detail["resolvedAt"] is None
    assert restored_detail["availableActions"] == ["retry", "dismiss"]
    assert any(
        event["eventType"] == "attention_restored" for event in restored_detail["lifecycleEvents"]
    )
    assert restored_dashboard["failedJobs"] == 1
    assert restored_dashboard["failedRequests"] == 1
    with harness.session_factory() as db:
        audits = list(
            db.scalars(
                select(AuditLog).where(
                    AuditLog.resource_id == str(job_id),
                    AuditLog.action.in_(("sync_job.dismiss", "sync_job.restore_attention")),
                )
            ).all()
        )
        assert [audit.action for audit in audits] == [
            "sync_job.dismiss",
            "sync_job.restore_attention",
        ]


def test_manual_job_uses_update_window_after_history_checkpoint_completes(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    enable_return_policy(client, auth, account["id"])
    fixed_utc = datetime(2026, 8, 25, 18, 30, 0)
    monkeypatch.setattr(
        "backend.app.services.sync_job_service.utc_now",
        lambda: fixed_utc,
    )
    local_today = date(2026, 8, 26)
    target = local_today - timedelta(days=1)
    now = fixed_utc
    with harness.session_factory() as db:
        db.execute(
            insert(sync_checkpoint_table).values(
                jijia_account_id=account["id"],
                api_code="sale_return_order_page",
                checkpoint_kind="history_backfill",
                checkpoint_value={
                    "next_window_start": local_today.isoformat(),
                    "frozen_window_end": target.isoformat(),
                    "backfill_started_at": f"{target.isoformat()}T08:00:00Z",
                },
                created_at=now,
                updated_at=now,
            )
        )
        db.commit()

    response = client.post(
        "/api/v1/sync-jobs",
        json={
            "jijia_account_id": account["id"],
            "api_code": "sale_return_order_page",
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert response.status_code == 202
    with harness.session_factory() as db:
        job = db.get(SyncJob, response.json()["data"]["jobId"])
        assert job.job_type == "update_incremental"
        assert job.window_start == target
        assert job.window_end == target
        assert job.progress_json["changeCatchup"] == "running"
        assert job.progress_json["_incrementalTargetEnd"] == target.isoformat()
        assert "_frozenWindowEnd" not in job.progress_json
    detail = client.get(f"/api/v1/sync-jobs/{response.json()['data']['jobId']}")
    assert detail.json()["data"]["jobType"] == "update_incremental"
    dashboard = client.get("/api/v1/dashboard")
    assert dashboard.json()["data"]["historyProgress"]["changeCatchup"] == "running"


def test_raw_queries_isolate_accounts_and_viewer_sql_never_selects_raw_json(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, first = create_active_account(harness, monkeypatch)
    second = client.post(
        "/api/v1/jijia-accounts",
        json={"name": "第二账号", "app_id": "second-id", "app_key": "second-key"},
        headers={"X-CSRF-Token": auth["csrfToken"]},
    ).json()["data"]
    assert (
        client.post(
            f"/api/v1/jijia-accounts/{second['id']}/verify",
            headers={"X-CSRF-Token": auth["csrfToken"]},
        ).status_code
        == 200
    )
    now = datetime(2026, 8, 26, 8, 0, 0)
    with harness.session_factory() as db:
        first_raw_id = db.execute(
            insert(raw_api_data_table).values(
                jijia_account_id=first["id"],
                api_code="sale_return_order_page",
                source_primary_key="R-1",
                record_identity="identity-1",
                data_hash="hash-current",
                raw_json={"secretBuyerNote": "only-operator"},
                data_date=date(2020, 1, 2),
                sync_batch_no="batch-new",
                first_observed_at=now,
                last_observed_at=now,
                observation_count=2,
                created_at=now,
                updated_at=now,
            )
        ).inserted_primary_key[0]
        second_raw_id = db.execute(
            insert(raw_api_data_table).values(
                jijia_account_id=second["id"],
                api_code="sale_return_order_page",
                source_primary_key="R-1",
                record_identity="identity-1",
                data_hash="hash-second",
                raw_json={"secretBuyerNote": "second-account"},
                data_date=date(2020, 1, 3),
                sync_batch_no="batch-second",
                first_observed_at=now,
                last_observed_at=now,
                observation_count=1,
                created_at=now,
                updated_at=now,
            )
        ).inserted_primary_key[0]
        legacy_raw_id = db.execute(
            insert(raw_api_data_table).values(
                jijia_account_id=0,
                api_code="sale_return_order_page",
                source_primary_key="legacy-R-1",
                record_identity="legacy-identity-1",
                data_hash="legacy-hash-current",
                raw_json={"secretBuyerNote": "legacy-account"},
                data_date=date(2020, 1, 1),
                sync_batch_no="legacy-batch",
                first_observed_at=now,
                last_observed_at=now,
                observation_count=1,
                created_at=now,
                updated_at=now,
            )
        ).inserted_primary_key[0]
        for version_id, observed_at in (
            ("old", datetime(2026, 8, 25, 8, 0, 0)),
            ("new", datetime(2026, 8, 26, 8, 0, 0)),
        ):
            db.execute(
                insert(raw_api_data_history_table).values(
                    jijia_account_id=first["id"],
                    api_code="sale_return_order_page",
                    record_identity="identity-1",
                    source_primary_key="R-1",
                    data_hash=f"hash-{version_id}",
                    raw_json={"versionSecret": version_id},
                    data_date=date(2020, 1, 2),
                    sync_batch_no=f"batch-{version_id}",
                    observed_at=observed_at,
                    created_at=now,
                    updated_at=now,
                )
            )
        db.execute(
            insert(raw_api_data_history_table).values(
                jijia_account_id=second["id"],
                api_code="sale_return_order_page",
                record_identity="identity-1",
                source_primary_key="R-1",
                data_hash="hash-second",
                raw_json={"versionSecret": "second-account"},
                data_date=date(2020, 1, 3),
                sync_batch_no="batch-second-only",
                observed_at=now,
                created_at=now,
                updated_at=now,
            )
        )
        db.commit()

    raw_list_statements: list[str] = []
    with harness.session_factory() as session:
        engine = session.get_bind()

    def capture_raw_list_sql(_conn, _cursor, statement, _params, _context, _executemany):
        raw_list_statements.append(statement)

    event.listen(engine, "before_cursor_execute", capture_raw_list_sql)
    try:
        filtered = client.get(f"/api/v1/raw-data?jijia_account_id={first['id']}")
    finally:
        event.remove(engine, "before_cursor_execute", capture_raw_list_sql)

    assert filtered.status_code == 200
    assert [item["jijiaAccountId"] for item in filtered.json()["data"]["items"]] == [first["id"]]
    assert "rawJson" not in filtered.text
    filtered_item = filtered.json()["data"]["items"][0]
    assert filtered_item["accountName"] == first["name"]
    assert filtered_item["batchNo"] == "batch-new"
    assert filtered_item["observationCount"] == 2
    assert filtered_item["versionCount"] == 2
    assert filtered_item["firstObservedAt"] is not None
    assert filtered_item["lastObservedAt"] is not None
    raw_page_selects = [
        statement
        for statement in raw_list_statements
        if statement.lstrip().upper().startswith("SELECT")
        and "FROM raw_api_data" in statement
        and "raw_api_data_history" not in statement
    ]
    assert len(raw_page_selects) == 1
    assert "JOIN jijia_account" not in raw_page_selects[0]
    assert "GROUP BY" not in raw_page_selects[0]
    version_count_selects = [
        statement
        for statement in raw_list_statements
        if "count(raw_api_data_history.id)" in statement
    ]
    assert len(version_count_selects) == 1
    assert " IN (" in version_count_selects[0]
    assert "GROUP BY" in version_count_selects[0]
    unscoped = client.get("/api/v1/raw-data")
    assert legacy_raw_id not in {item["id"] for item in unscoped.json()["data"]["items"]}
    exact_record = client.get(
        "/api/v1/raw-data",
        params={
            "jijia_account_id": first["id"],
            "source_primary_key": "R-1",
            "data_date_start": "2020-01-02",
            "data_date_end": "2020-01-02",
        },
    )
    assert [item["id"] for item in exact_record.json()["data"]["items"]] == [first_raw_id]
    invalid_date_range = client.get(
        "/api/v1/raw-data",
        params={"data_date_start": "2020-01-03", "data_date_end": "2020-01-02"},
    )
    assert invalid_date_range.status_code == 422
    assert invalid_date_range.json()["error"]["code"] == "DATA_DATE_RANGE_INVALID"
    batch_filtered = client.get(
        f"/api/v1/raw-data?jijia_account_id={first['id']}&sync_batch_no=batch-new"
    )
    assert [item["id"] for item in batch_filtered.json()["data"]["items"]] == [first_raw_id]
    wrong_batch = client.get(
        f"/api/v1/raw-data?jijia_account_id={first['id']}&sync_batch_no=batch-old"
    )
    assert wrong_batch.json()["data"]["items"] == []
    observed_old = client.get(
        f"/api/v1/raw-data?jijia_account_id={first['id']}&observed_sync_batch_no=batch-old"
    )
    assert [item["id"] for item in observed_old.json()["data"]["items"]] == [first_raw_id]
    assert observed_old.json()["data"]["items"][0]["batchNo"] == "batch-new"
    observed_current = client.get(
        f"/api/v1/raw-data?jijia_account_id={first['id']}&observed_sync_batch_no=batch-new"
    )
    assert [item["id"] for item in observed_current.json()["data"]["items"]] == [first_raw_id]
    snapshot_only = client.get(
        f"/api/v1/raw-data?jijia_account_id={second['id']}&observed_sync_batch_no=batch-second"
    )
    assert [item["id"] for item in snapshot_only.json()["data"]["items"]] == [second_raw_id]
    wrong_snapshot_account = client.get(
        f"/api/v1/raw-data?jijia_account_id={first['id']}&observed_sync_batch_no=batch-second"
    )
    assert wrong_snapshot_account.json()["data"]["items"] == []
    cross_account_observation = client.get(
        f"/api/v1/raw-data?jijia_account_id={first['id']}&observed_sync_batch_no=batch-second-only"
    )
    assert cross_account_observation.json()["data"]["items"] == []
    second_observation = client.get(
        f"/api/v1/raw-data?jijia_account_id={second['id']}&observed_sync_batch_no=batch-second-only"
    )
    assert [item["id"] for item in second_observation.json()["data"]["items"]] == [second_raw_id]
    operator_detail = client.get(f"/api/v1/raw-data/{first_raw_id}")
    assert operator_detail.json()["data"]["rawJson"]["secretBuyerNote"] == "only-operator"

    statements: list[str] = []

    def capture_sql(_conn, _cursor, statement, _params, _context, _executemany):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", capture_sql)
    try:
        with TestClient(harness.app) as viewer_client:
            register_user(
                harness,
                "raw-viewer@example.com",
                UserRole.VIEWER,
                viewer_client,
            )
            viewer_detail = viewer_client.get(f"/api/v1/raw-data/{first_raw_id}")
            viewer_observed = viewer_client.get(
                f"/api/v1/raw-data?jijia_account_id={first['id']}&observed_sync_batch_no=batch-old"
            )
            first_page = viewer_client.get(f"/api/v1/raw-data/{first_raw_id}/versions?limit=1")
            cursor = first_page.json()["data"]["nextCursor"]
            second_page = viewer_client.get(
                f"/api/v1/raw-data/{first_raw_id}/versions?limit=1&cursor={cursor}"
            )
    finally:
        event.remove(engine, "before_cursor_execute", capture_sql)

    assert "rawJson" not in viewer_detail.json()["data"]
    assert "only-operator" not in viewer_detail.text
    assert [item["id"] for item in viewer_observed.json()["data"]["items"]] == [first_raw_id]
    assert first_page.json()["data"]["items"][0]["dataHash"] == "hash-new"
    assert first_page.json()["data"]["items"][0]["batchNo"] == "batch-new"
    assert second_page.json()["data"]["items"][0]["dataHash"] == "hash-old"
    assert second_page.json()["data"]["items"][0]["batchNo"] == "batch-old"
    raw_selects = [
        statement
        for statement in statements
        if statement.lstrip().upper().startswith("SELECT") and "raw_api_data" in statement
    ]
    assert raw_selects
    assert all("raw_api_data.raw_json" not in statement for statement in raw_selects)
    assert all("raw_api_data_history.raw_json" not in statement for statement in raw_selects)


def test_run_children_use_account_and_batch_scope_and_dashboard_contract(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, _, account = create_active_account(harness, monkeypatch)
    now = datetime(2026, 8, 26, 8, 0, 0)
    with harness.session_factory() as db:
        run_id = db.execute(
            insert(sync_batch_table).values(
                sync_batch_no="batch-one",
                jijia_account_id=account["id"],
                status="failed",
                started_at=now,
                finished_at=now,
                total_api_count=1,
                success_api_count=0,
                failed_api_count=1,
                created_at=now,
                updated_at=now,
            )
        ).inserted_primary_key[0]
        db.execute(
            insert(sync_api_log_table),
            [
                {
                    "sync_batch_no": "batch-one",
                    "jijia_account_id": account["id"],
                    "api_code": "expected-api",
                    "status": "failed",
                    "request_count": 1,
                    "success_count": 0,
                    "failed_count": 1,
                    "started_at": now,
                    "finished_at": now,
                    "error_message": "safe error",
                    "created_at": now,
                    "updated_at": now,
                },
                {
                    "sync_batch_no": "batch-one",
                    "jijia_account_id": account["id"] + 999,
                    "api_code": "cross-account",
                    "status": "failed",
                    "request_count": 1,
                    "success_count": 0,
                    "failed_count": 1,
                    "started_at": now,
                    "finished_at": now,
                    "error_message": "must-not-return",
                    "created_at": now,
                    "updated_at": now,
                },
            ],
        )
        db.execute(
            insert(failed_request_log_table).values(
                sync_batch_no="batch-one",
                jijia_account_id=account["id"],
                api_code="expected-api",
                request_method="POST",
                error_message="safe error",
                retry_count=1,
                created_at=now,
                updated_at=now,
            )
        )
        db.commit()

    runs = client.get("/api/v1/sync-runs?status=failed")
    assert runs.status_code == 200
    assert runs.json()["data"]["items"][0]["id"] == run_id
    assert runs.json()["data"]["items"][0]["batchNo"] == "batch-one"
    run_detail = client.get(f"/api/v1/sync-runs/{run_id}")
    assert run_detail.status_code == 200
    assert run_detail.json()["data"] == runs.json()["data"]["items"][0]
    with TestClient(harness.app) as anonymous_client:
        unauthorized_run = anonymous_client.get(f"/api/v1/sync-runs/{run_id}")
    assert unauthorized_run.status_code == 401
    assert unauthorized_run.json()["error"]["code"] == "AUTH_REQUIRED"
    missing_run = client.get("/api/v1/sync-runs/999999")
    assert missing_run.status_code == 404
    assert missing_run.json()["error"]["code"] == "SYNC_RUN_NOT_FOUND"
    logs = client.get(f"/api/v1/sync-runs/{run_id}/logs")
    assert [item["apiCode"] for item in logs.json()["data"]["items"]] == ["expected-api"]
    failed = client.get(f"/api/v1/sync-runs/{run_id}/failed-requests")
    assert failed.json()["data"]["items"][0]["apiCode"] == "expected-api"
    dashboard = client.get("/api/v1/dashboard")
    assert set(dashboard.json()["data"]) >= {
        "queuedJobs",
        "runningJobs",
        "failedJobs",
        "failedRequests",
        "latestRun",
        "historyProgress",
    }
    assert set(dashboard.json()["data"]) >= {
        "accounts",
        "policies",
        "latestDataAt",
        "worker",
    }
    assert dashboard.json()["data"]["latestRun"]["id"] == run_id


@pytest.mark.parametrize("latest_status", ["queued", "running", "success", "partial_failed"])
def test_dashboard_counts_latest_task_execution_and_preserves_failures(
    harness: AuthHarness,
    monkeypatch,
    latest_status: str,
) -> None:
    client, _, account = create_active_account(harness, monkeypatch)
    with harness.session_factory() as db:
        for job_no, task_no, status in (
            ("execution-old", "logical-task", "failed"),
            ("execution-new", "logical-task", latest_status),
            ("legacy-failure", None, "failed"),
        ):
            db.add(
                SyncJob(
                    job_no=job_no,
                    task_no=task_no,
                    jijia_account_id=account["id"],
                    api_code="amazon_shop_page",
                    job_type="sync",
                    trigger_type="manual",
                    status=status,
                    queued_at=datetime(2026, 8, 26, 8, 0, 0),
                )
            )
        db.commit()

    dashboard = client.get("/api/v1/dashboard").json()["data"]
    attention = client.get("/api/v1/sync-jobs?status_group=attention").json()["data"]
    assert dashboard["failedJobs"] == len(attention["items"])
    assert dashboard["failedJobs"] == 1 + int(latest_status == "partial_failed")
    assert dashboard["queuedJobs"] == int(latest_status == "queued")
    assert dashboard["runningJobs"] == int(latest_status == "running")
    all_jobs = client.get("/api/v1/sync-jobs").json()["data"]
    assert all_jobs["summary"]["total"] == 2
    latest = next(row for row in all_jobs["items"] if row["taskNo"] == "logical-task")
    executions = client.get(f"/api/v1/sync-jobs/{latest['id']}").json()["data"]["executions"]
    assert [row["status"] for row in executions] == ["failed", latest_status]


def test_dashboard_counts_all_enabled_and_scheduled_policies(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    enable_return_policy(client, auth, account["id"])
    scheduled = client.put(
        f"/api/v1/jijia-accounts/{account['id']}/api-policies/traffic_analysis_page",
        json={
            "enabled": True,
            "schedule_mode": "daily",
            "schedule_expr": "02:30",
            "timezone": "Asia/Shanghai",
            "window_mode": "checkpoint",
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    assert scheduled.status_code == 200

    dashboard = client.get("/api/v1/dashboard")

    assert dashboard.status_code == 200
    policies = dashboard.json()["data"]["policies"]
    assert policies["total"] >= 2
    assert policies["enabled"] == 2
    assert policies["scheduled"] == 1


def test_completed_job_records_are_linked_by_account_and_batch(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    enable_return_policy(client, auth, account["id"])
    accepted = client.post(
        "/api/v1/sync-jobs",
        json={
            "jijia_account_id": account["id"],
            "api_code": "sale_return_order_page",
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    job_id = accepted.json()["data"]["jobId"]
    batch_no = f"batch-linked-{job_id}"
    now = datetime(2026, 8, 26, 8, 0, 0)

    class LinkedRecordExecutor:
        def execute(self, job, heartbeat) -> WorkerResult:
            heartbeat()
            with harness.session_factory() as db:
                db.execute(
                    insert(sync_batch_table).values(
                        sync_batch_no=batch_no,
                        jijia_account_id=job.jijia_account_id,
                        sync_job_id=job.id,
                        status="success",
                        started_at=now,
                        finished_at=now,
                        total_api_count=1,
                        success_api_count=1,
                        failed_api_count=0,
                        created_at=now,
                        updated_at=now,
                    )
                )
                db.execute(
                    insert(sync_api_log_table).values(
                        sync_batch_no=batch_no,
                        jijia_account_id=job.jijia_account_id,
                        api_code=job.api_code,
                        status="success",
                        request_count=1,
                        success_count=1,
                        failed_count=0,
                        started_at=now,
                        finished_at=now,
                        created_at=now,
                        updated_at=now,
                    )
                )
                db.execute(
                    insert(sync_checkpoint_table).values(
                        jijia_account_id=job.jijia_account_id,
                        api_code=job.api_code,
                        checkpoint_kind="history_backfill",
                        checkpoint_value={"next_window_start": "2020-02-01"},
                        checkpoint_time=now,
                        last_sync_batch_no=batch_no,
                        created_at=now,
                        updated_at=now,
                    )
                )
                db.execute(
                    insert(raw_api_data_table).values(
                        jijia_account_id=job.jijia_account_id,
                        api_code=job.api_code,
                        source_primary_key="linked-raw",
                        record_identity="linked-identity",
                        data_hash="linked-hash",
                        raw_json={"id": "linked-raw"},
                        data_date=date(2020, 1, 2),
                        sync_batch_no=batch_no,
                        first_observed_at=now,
                        last_observed_at=now,
                        observation_count=1,
                        created_at=now,
                        updated_at=now,
                    )
                )
                db.commit()
            return WorkerResult(status="success", sync_batch_no=batch_no)

    worker = SyncWorker(
        harness.session_factory,
        LinkedRecordExecutor(),
        "worker-linked",
        heartbeat_interval_seconds=0.1,
    )
    assert worker.run_once() == job_id

    job = client.get(f"/api/v1/sync-jobs/{job_id}").json()["data"]
    assert job["syncBatchNo"] == batch_no
    run_id = job["syncRunId"]
    assert run_id is not None
    logs = client.get(f"/api/v1/sync-runs/{run_id}/logs").json()["data"]
    assert logs["items"][0]["apiCode"] == "sale_return_order_page"
    raw = client.get(
        f"/api/v1/raw-data?jijia_account_id={account['id']}&sync_batch_no={batch_no}"
    ).json()["data"]
    assert raw["items"][0]["batchNo"] == batch_no
    observed = client.get(
        "/api/v1/raw-data",
        params={
            "jijia_account_id": account["id"],
            "api_code": job["apiCode"],
            "observed_sync_batch_no": job["syncBatchNo"],
        },
    ).json()["data"]
    assert [item["id"] for item in observed["items"]] == [item["id"] for item in raw["items"]]
    assert observed["items"][0]["versionCount"] == 0
    with harness.session_factory() as db:
        checkpoint_batch = db.scalar(
            select(sync_checkpoint_table.c.last_sync_batch_no).where(
                sync_checkpoint_table.c.jijia_account_id == account["id"],
                sync_checkpoint_table.c.api_code == "sale_return_order_page",
            )
        )
    assert checkpoint_batch == batch_no


def test_audit_logs_are_admin_only_and_filter_by_account(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    operator, _, account = create_active_account(harness, monkeypatch)
    assert operator.get("/api/v1/audit-logs").status_code == 403
    with TestClient(harness.app) as admin_client:
        register_user(
            harness,
            "audit-admin@example.com",
            UserRole.ADMIN,
            admin_client,
        )
        response = admin_client.get(f"/api/v1/audit-logs?jijia_account_id={account['id']}")
        action_response = admin_client.get(
            "/api/v1/audit-logs",
            params={
                "jijia_account_id": account["id"],
                "action": "jijia_account.verify",
                "result": "success",
            },
        )
        future_response = admin_client.get(
            "/api/v1/audit-logs",
            params={"created_from": "2999-01-01T00:00:00+00:00"},
        )
    assert response.status_code == 200
    assert set(response.json()["data"]) == {"items", "nextCursor"}
    assert action_response.status_code == 200
    assert action_response.json()["data"]["items"]
    assert {item["action"] for item in action_response.json()["data"]["items"]} == {
        "jijia_account.verify"
    }
    assert future_response.status_code == 200
    assert future_response.json()["data"]["items"] == []


def test_audit_logs_filter_by_actor_and_resource_with_cursor(
    harness: AuthHarness,
) -> None:
    operator_client, operator_auth, _ = register_user(
        harness,
        "audit-filter-operator@example.com",
        UserRole.OPERATOR,
    )
    with TestClient(harness.app) as admin_client:
        _, admin_auth, _ = register_user(
            harness,
            "audit-filter-admin@example.com",
            UserRole.ADMIN,
            admin_client,
        )
        operator_id = operator_auth["user"]["id"]
        admin_id = admin_auth["user"]["id"]
        created_at = datetime(2026, 9, 11, 10, 0, 0)
        with harness.session_factory() as db:
            db.execute(delete(AuditLog))
            db.add_all(
                [
                    AuditLog(
                        actor_user_id=admin_id,
                        action="user.role.update",
                        resource_type="user",
                        resource_id=str(operator_id),
                        result="success",
                        created_at=created_at + timedelta(minutes=4),
                    ),
                    AuditLog(
                        actor_user_id=admin_id,
                        action="user.status.update",
                        resource_type="user",
                        resource_id=str(operator_id),
                        result="success",
                        created_at=created_at + timedelta(minutes=3),
                    ),
                    AuditLog(
                        actor_user_id=operator_id,
                        action="user.role.update",
                        resource_type="user",
                        resource_id=str(admin_id),
                        result="success",
                        created_at=created_at + timedelta(minutes=2),
                    ),
                    AuditLog(
                        actor_user_id=admin_id,
                        action="invitation.resend",
                        resource_type="invitation",
                        resource_id=str(operator_id),
                        result="success",
                        created_at=created_at + timedelta(minutes=1),
                    ),
                ]
            )
            db.commit()

        filters = {
            "actor_user_id": admin_id,
            "resource_type": "user",
            "resource_id": operator_id,
            "limit": 1,
        }
        assert operator_client.get("/api/v1/audit-logs", params=filters).status_code == 403

        first_response = admin_client.get("/api/v1/audit-logs", params=filters)
        assert first_response.status_code == 200
        first_page = first_response.json()["data"]
        assert [item["action"] for item in first_page["items"]] == ["user.role.update"]
        assert first_page["nextCursor"] is not None

        second_response = admin_client.get(
            "/api/v1/audit-logs",
            params={**filters, "cursor": first_page["nextCursor"]},
        )
        assert second_response.status_code == 200
        second_page = second_response.json()["data"]
        assert [item["action"] for item in second_page["items"]] == ["user.status.update"]
        assert second_page["nextCursor"] is None


@pytest.mark.parametrize(
    ("params", "expected_status"),
    [
        ({"actor_user_id": 0}, 422),
        ({"actor_user_id": "not-an-integer"}, 422),
        ({"resource_type": "r" * 65}, 422),
        ({"resource_id": "1" * 101}, 422),
    ],
)
def test_audit_log_filter_parameters_are_validated(
    harness: AuthHarness,
    params: dict[str, object],
    expected_status: int,
) -> None:
    with TestClient(harness.app) as admin_client:
        register_user(
            harness,
            "audit-validation-admin@example.com",
            UserRole.ADMIN,
            admin_client,
        )
        response = admin_client.get("/api/v1/audit-logs", params=params)
    assert response.status_code == expected_status


@pytest.mark.parametrize("execution_status", ["queued", "running"])
def test_logical_task_status_stays_in_progress_across_window_transition(
    harness: AuthHarness,
    monkeypatch,
    execution_status: str,
) -> None:
    client, _, account = create_active_account(harness, monkeypatch)
    task_no = f"logical-transition-{execution_status}"
    first_created_at = datetime(2026, 9, 11, 1, 0, 0)
    current_updated_at = first_created_at + timedelta(minutes=1)
    with harness.session_factory() as db:
        db.add_all(
            [
                SyncJob(
                    job_no=f"{task_no}-1",
                    task_no=task_no,
                    jijia_account_id=account["id"],
                    api_code="sale_return_order_page",
                    job_type="history_backfill",
                    trigger_type="manual",
                    status="success",
                    window_index=1,
                    total_windows=3,
                    progress_json={"completedWindows": 1, "totalWindows": 3},
                    queued_at=first_created_at,
                    created_at=first_created_at,
                    updated_at=first_created_at,
                ),
                SyncJob(
                    job_no=f"{task_no}-2",
                    task_no=task_no,
                    jijia_account_id=account["id"],
                    api_code="sale_return_order_page",
                    job_type="history_backfill",
                    trigger_type="manual",
                    status=execution_status,
                    window_index=2,
                    total_windows=3,
                    progress_json={"completedWindows": 1, "totalWindows": 3},
                    queued_at=current_updated_at,
                    created_at=current_updated_at,
                    updated_at=current_updated_at,
                ),
            ]
        )
        db.commit()

    listed = client.get("/api/v1/sync-jobs").json()["data"]
    item = next(row for row in listed["items"] if row["taskNo"] == task_no)

    assert item["taskStatus"] == "in_progress"
    assert item["executionStatus"] == execution_status
    assert item["currentExecutionId"] == item["id"]
    assert item["completedWindows"] == 1
    assert item["totalWindows"] == 3
    assert item["taskCreatedAt"] == "2026-09-11T01:00:00Z"
    assert item["lastUpdatedAt"] == "2026-09-11T01:01:00Z"
    active = client.get("/api/v1/sync-jobs?status_group=active").json()["data"]
    logical = client.get("/api/v1/sync-jobs?status=in_progress").json()["data"]
    legacy = client.get(f"/api/v1/sync-jobs?status={execution_status}").json()["data"]
    assert any(row["taskNo"] == task_no for row in active["items"])
    assert any(row["taskNo"] == task_no for row in logical["items"])
    assert any(row["taskNo"] == task_no for row in legacy["items"])


def test_logical_task_is_success_only_after_last_window(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, _, account = create_active_account(harness, monkeypatch)
    now = datetime(2026, 9, 11, 2, 0, 0)
    with harness.session_factory() as db:
        db.add_all(
            [
                SyncJob(
                    job_no="logical-success-1",
                    task_no="logical-success",
                    jijia_account_id=account["id"],
                    api_code="sale_return_order_page",
                    job_type="history_backfill",
                    trigger_type="manual",
                    status="success",
                    window_index=1,
                    total_windows=2,
                    progress_json={"completedWindows": 1, "totalWindows": 2},
                    queued_at=now,
                ),
                SyncJob(
                    job_no="logical-success-2",
                    task_no="logical-success",
                    jijia_account_id=account["id"],
                    api_code="sale_return_order_page",
                    job_type="history_backfill",
                    trigger_type="manual",
                    status="success",
                    window_index=2,
                    total_windows=2,
                    progress_json={"completedWindows": 2, "totalWindows": 2},
                    queued_at=now + timedelta(minutes=1),
                ),
            ]
        )
        db.commit()

    listed = client.get("/api/v1/sync-jobs").json()["data"]
    item = next(row for row in listed["items"] if row["taskNo"] == "logical-success")
    successful = client.get("/api/v1/sync-jobs?status_group=success").json()["data"]

    assert item["taskStatus"] == "success"
    assert any(row["taskNo"] == "logical-success" for row in successful["items"])


@pytest.mark.parametrize(
    ("execution_status", "expected_task_status", "status_group"),
    [
        ("pause_requested", "pausing", "active"),
        ("paused", "paused", "attention"),
        ("failed", "attention", "attention"),
        ("partial_failed", "attention", "attention"),
        ("stopped", "terminated", "ended"),
    ],
)
def test_logical_task_status_groups_use_task_status(
    harness: AuthHarness,
    monkeypatch,
    execution_status: str,
    expected_task_status: str,
    status_group: str,
) -> None:
    client, _, account = create_active_account(harness, monkeypatch)
    task_no = f"logical-{execution_status}"
    with harness.session_factory() as db:
        db.add(
            SyncJob(
                job_no=f"{task_no}-1",
                task_no=task_no,
                jijia_account_id=account["id"],
                api_code="sale_return_order_page",
                job_type="history_backfill",
                trigger_type="manual",
                status=execution_status,
                window_index=2,
                total_windows=3,
                progress_json={"completedWindows": 1, "totalWindows": 3},
                queued_at=datetime(2026, 9, 11, 3, 0, 0),
            )
        )
        db.commit()

    listed = client.get("/api/v1/sync-jobs").json()["data"]
    item = next(row for row in listed["items"] if row["taskNo"] == task_no)
    grouped = client.get(f"/api/v1/sync-jobs?status_group={status_group}").json()["data"]
    filtered = client.get(f"/api/v1/sync-jobs?status={expected_task_status}").json()["data"]

    assert item["taskStatus"] == expected_task_status
    assert any(row["taskNo"] == task_no for row in grouped["items"])
    assert any(row["taskNo"] == task_no for row in filtered["items"])
    assert grouped["summary"][status_group] == 1


def test_task_window_progress_clamps_completed_windows_to_total() -> None:
    job = SyncJob(
        status="running",
        window_index=4,
        total_windows=3,
        progress_json={"completedWindows": 5, "totalWindows": 3},
    )

    assert task_window_progress(job) == (3, 3)


def test_stable_task_detail_resolves_latest_execution_and_legacy_job(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, _, account = create_active_account(harness, monkeypatch)
    now = datetime(2026, 9, 11, 4, 0, 0)
    with harness.session_factory() as db:
        old = SyncJob(
            job_no="stable-task-old",
            task_no="stable-task",
            jijia_account_id=account["id"],
            api_code="sale_return_order_page",
            job_type="history_backfill",
            trigger_type="manual",
            status="success",
            window_index=1,
            total_windows=2,
            progress_json={"completedWindows": 1, "totalWindows": 2},
            queued_at=now,
        )
        current = SyncJob(
            job_no="stable-task-current",
            task_no="stable-task",
            jijia_account_id=account["id"],
            api_code="sale_return_order_page",
            job_type="history_backfill",
            trigger_type="manual",
            status="running",
            window_index=2,
            total_windows=2,
            progress_json={"completedWindows": 1, "totalWindows": 2},
            queued_at=now + timedelta(minutes=1),
        )
        legacy = SyncJob(
            job_no="legacy-stable-job",
            task_no=None,
            jijia_account_id=account["id"],
            api_code="amazon_shop_page",
            job_type="sync",
            trigger_type="manual",
            status="success",
            queued_at=now,
        )
        db.add_all([old, current, legacy])
        db.commit()
        old_id = old.id
        current_id = current.id
        legacy_id = legacy.id

    stable = client.get("/api/v1/sync-jobs/tasks/stable-task")
    old_detail = client.get(f"/api/v1/sync-jobs/{old_id}")
    legacy_detail = client.get("/api/v1/sync-jobs/tasks/legacy-stable-job")
    missing = client.get("/api/v1/sync-jobs/tasks/missing-task")

    assert stable.status_code == 200
    assert stable.json()["data"]["id"] == current_id
    assert stable.json()["data"]["currentExecutionId"] == current_id
    assert old_detail.json()["data"]["id"] == old_id
    assert old_detail.json()["data"]["currentExecutionId"] == current_id
    assert old_detail.json()["data"]["executionStatus"] == "running"
    assert legacy_detail.json()["data"]["id"] == legacy_id
    assert legacy_detail.json()["data"]["taskNo"] == "legacy-stable-job"
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "SYNC_TASK_NOT_FOUND"


def test_task_cancel_targets_latest_execution(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    now = datetime(2026, 9, 11, 5, 0, 0)
    with harness.session_factory() as db:
        old = SyncJob(
            job_no="control-task-old",
            task_no="control-task",
            jijia_account_id=account["id"],
            api_code="sale_return_order_page",
            job_type="history_backfill",
            trigger_type="manual",
            status="success",
            window_index=1,
            total_windows=2,
            progress_json={"completedWindows": 1, "totalWindows": 2},
            queued_at=now,
        )
        current = SyncJob(
            job_no="control-task-current",
            task_no="control-task",
            jijia_account_id=account["id"],
            api_code="sale_return_order_page",
            job_type="history_backfill",
            trigger_type="manual",
            status="queued",
            window_index=2,
            total_windows=2,
            progress_json={"completedWindows": 1, "totalWindows": 2},
            queued_at=now + timedelta(minutes=1),
        )
        db.add_all([old, current])
        db.commit()
        old_id = old.id
        current_id = current.id

    response = client.post(
        "/api/v1/sync-jobs/tasks/control-task/cancel",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert response.status_code == 200
    assert response.json()["data"]["jobId"] == current_id
    with harness.session_factory() as db:
        assert db.get(SyncJob, old_id).status == "success"
        assert db.get(SyncJob, current_id).status == "cancelled"


def test_task_control_routes_reuse_current_execution_controls(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    enable_return_policy(client, auth, account["id"])
    now = datetime(2026, 9, 11, 6, 0, 0)
    with harness.session_factory() as db:
        job = SyncJob(
            job_no="task-control-current",
            task_no="task-control-routes",
            jijia_account_id=account["id"],
            api_code="sale_return_order_page",
            job_type="history_backfill",
            trigger_type="manual",
            status="running",
            window_index=2,
            total_windows=3,
            progress_json={"completedWindows": 1, "totalWindows": 3},
            queued_at=now,
        )
        db.add(job)
        db.commit()
        job_id = job.id

    headers = {"X-CSRF-Token": auth["csrfToken"]}
    paused = client.post("/api/v1/sync-jobs/tasks/task-control-routes/pause", headers=headers)
    withdrawn = client.post(
        "/api/v1/sync-jobs/tasks/task-control-routes/pause/withdraw",
        headers=headers,
    )
    stopped = client.post("/api/v1/sync-jobs/tasks/task-control-routes/stop", headers=headers)

    assert paused.json()["data"] == {
        "jobId": job_id,
        "taskNo": "task-control-routes",
        "status": "pause_requested",
    }
    assert withdrawn.json()["data"]["status"] == "running"
    assert stopped.json()["data"]["jobId"] == job_id
    with harness.session_factory() as db:
        current = db.get(SyncJob, job_id)
        current.status = "paused"
        current.stop_after_current = False
        db.commit()

    resumed = client.post("/api/v1/sync-jobs/tasks/task-control-routes/resume", headers=headers)

    assert resumed.status_code == 202
    assert resumed.json()["data"]["taskNo"] == "task-control-routes"
    assert resumed.json()["data"]["jobId"] != job_id


def test_task_retry_targets_latest_failed_execution(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    enable_return_policy(client, auth, account["id"])
    now = datetime(2026, 9, 11, 7, 0, 0)
    with harness.session_factory() as db:
        old = SyncJob(
            job_no="task-retry-old",
            task_no="task-retry-current",
            jijia_account_id=account["id"],
            api_code="sale_return_order_page",
            job_type="history_backfill",
            trigger_type="manual",
            status="success",
            window_index=1,
            total_windows=2,
            progress_json={"completedWindows": 1, "totalWindows": 2},
            queued_at=now,
        )
        failed = SyncJob(
            job_no="task-retry-failed",
            task_no="task-retry-current",
            jijia_account_id=account["id"],
            api_code="sale_return_order_page",
            job_type="history_backfill",
            trigger_type="manual",
            status="failed",
            window_index=2,
            total_windows=2,
            progress_json={"completedWindows": 1, "totalWindows": 2},
            queued_at=now + timedelta(minutes=1),
        )
        db.add_all([old, failed])
        db.commit()
        old_id = old.id
        failed_id = failed.id

    retried = client.post(
        "/api/v1/sync-jobs/tasks/task-retry-current/retry",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert retried.status_code == 202
    retry_id = retried.json()["data"]["jobId"]
    assert retried.json()["data"]["taskNo"] == "task-retry-current"
    assert retry_id not in {old_id, failed_id}
    stable = client.get("/api/v1/sync-jobs/tasks/task-retry-current").json()["data"]
    assert stable["id"] == retry_id
    assert stable["retryOfJobId"] == failed_id
    assert stable["taskStatus"] == "in_progress"
