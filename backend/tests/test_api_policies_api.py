import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app.models.audit_log import AuditLog
from backend.app.models.user import UserRole
from backend.tests.conftest import AuthHarness
from backend.tests.test_auth_api import register_user


def create_active_account(harness: AuthHarness, monkeypatch) -> tuple[object, dict, dict]:
    client, auth, _ = register_user(harness, "operator@example.com", UserRole.OPERATOR)
    created = client.post(
        "/api/v1/jijia-accounts",
        json={"name": "策略账号", "app_id": "policy-app", "app_key": "policy-key"},
        headers={"X-CSRF-Token": auth["csrfToken"]},
    ).json()["data"]
    monkeypatch.setattr(
        "backend.app.services.jijia_account_service.verify_account_credentials",
        lambda app_id, app_key, **_kwargs: None,
    )
    verified = client.post(
        f"/api/v1/jijia-accounts/{created['id']}/verify",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    assert verified.status_code == 200
    return client, auth, created


def test_operator_updates_daily_policy_and_viewer_reads_it(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    response = client.put(
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

    assert response.status_code == 200
    policy = response.json()["data"]
    assert policy["enabled"] is True
    assert policy["scheduleMode"] == "daily"
    assert policy["nextRunAt"].endswith("Z")
    listed = client.get(f"/api/v1/jijia-accounts/{account['id']}/api-policies")
    assert any(item["apiCode"] == "traffic_analysis_page" for item in listed.json()["data"])


def test_policy_rejects_timezone_outside_first_release_contract(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)

    response = client.put(
        f"/api/v1/jijia-accounts/{account['id']}/api-policies/traffic_analysis_page",
        json={
            "enabled": True,
            "schedule_mode": "daily",
            "schedule_expr": "02:30",
            "timezone": "UTC",
            "window_mode": "checkpoint",
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "TIMEZONE_UNSUPPORTED"


def test_viewer_can_read_policy_but_cannot_update_it(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, _, account = create_active_account(harness, monkeypatch)

    with TestClient(harness.app) as viewer_client:
        _, viewer_auth, _ = register_user(
            harness,
            "policy-viewer@example.com",
            UserRole.VIEWER,
            viewer_client,
        )
        listed = viewer_client.get(f"/api/v1/jijia-accounts/{account['id']}/api-policies")
        updated = viewer_client.put(
            f"/api/v1/jijia-accounts/{account['id']}/api-policies/traffic_analysis_page",
            json={
                "enabled": True,
                "schedule_mode": "daily",
                "schedule_expr": "02:30",
                "timezone": "Asia/Shanghai",
                "window_mode": "checkpoint",
            },
            headers={"X-CSRF-Token": viewer_auth["csrfToken"]},
        )

    assert listed.status_code == 200
    assert updated.status_code == 403
    assert updated.json()["error"]["code"] == "PERMISSION_DENIED"


def test_policy_rejects_invalid_cron_and_unsupported_window(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    headers = {"X-CSRF-Token": auth["csrfToken"]}
    invalid_cron = client.put(
        f"/api/v1/jijia-accounts/{account['id']}/api-policies/traffic_analysis_page",
        json={
            "enabled": True,
            "schedule_mode": "cron",
            "schedule_expr": "* * * * *",
            "timezone": "Asia/Shanghai",
            "window_mode": "checkpoint",
        },
        headers=headers,
    )
    unsupported_window = client.put(
        f"/api/v1/jijia-accounts/{account['id']}/api-policies/amazon_shop_page",
        json={
            "enabled": True,
            "schedule_mode": "manual_only",
            "timezone": "Asia/Shanghai",
            "window_mode": "lookback_days",
            "lookback_days": 7,
        },
        headers=headers,
    )

    assert invalid_cron.status_code == 422
    assert invalid_cron.json()["error"]["code"] == "CRON_TOO_FREQUENT"
    assert unsupported_window.status_code == 422
    assert unsupported_window.json()["error"]["code"] == "WINDOW_NOT_SUPPORTED"
    with harness.session_factory() as db:
        assert db.scalar(select(AuditLog).where(AuditLog.action == "api_policy.update")) is None


@pytest.mark.parametrize(
    ("window_mode", "window_fields"),
    [
        ("lookback_days", {"lookback_days": 7}),
        ("start_date", {"start_date": "2020-01-01"}),
        ("checkpoint", {"lookback_days": 7}),
        ("checkpoint", {"start_date": "2020-01-01"}),
    ],
)
def test_policy_rejects_unsupported_window_payloads_without_mutation(
    harness: AuthHarness,
    monkeypatch,
    window_mode: str,
    window_fields: dict[str, object],
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    url = f"/api/v1/jijia-accounts/{account['id']}/api-policies/traffic_analysis_page"
    before = next(
        item
        for item in client.get(f"/api/v1/jijia-accounts/{account['id']}/api-policies").json()[
            "data"
        ]
        if item["apiCode"] == "traffic_analysis_page"
    )

    response = client.put(
        url,
        json={
            "enabled": True,
            "schedule_mode": "daily",
            "schedule_expr": "02:30",
            "timezone": "Asia/Shanghai",
            "window_mode": window_mode,
            **window_fields,
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "WINDOW_MODE_UNSUPPORTED"
    after = next(
        item
        for item in client.get(f"/api/v1/jijia-accounts/{account['id']}/api-policies").json()[
            "data"
        ]
        if item["apiCode"] == "traffic_analysis_page"
    )
    assert after == before


def test_policy_request_cannot_replace_catalog_contract_or_create_unknown_api(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    list_url = f"/api/v1/jijia-accounts/{account['id']}/api-policies"
    original = next(
        item
        for item in client.get(list_url).json()["data"]
        if item["apiCode"] == "traffic_analysis_page"
    )
    headers = {"X-CSRF-Token": auth["csrfToken"]}
    payload = {
        "enabled": True,
        "schedule_mode": "manual_only",
        "timezone": "Asia/Shanghai",
        "window_mode": "checkpoint",
        "path": "/unsafe/override",
        "method": "DELETE",
        "pagination": {"page_size": 1},
    }

    accepted = client.put(
        f"{list_url}/traffic_analysis_page",
        json=payload,
        headers=headers,
    )

    assert accepted.status_code == 200
    assert accepted.json()["data"]["path"] == original["path"]
    assert accepted.json()["data"]["method"] == original["method"]
    before_unknown = client.get(list_url).json()["data"]
    unknown = client.put(
        f"{list_url}/unknown_api",
        json=payload,
        headers=headers,
    )
    assert unknown.status_code == 404
    assert unknown.json()["error"]["code"] == "API_CATALOG_NOT_FOUND"
    assert client.get(list_url).json()["data"] == before_unknown


def test_same_api_policy_is_isolated_between_accounts(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, first_account = create_active_account(harness, monkeypatch)
    second_account = client.post(
        "/api/v1/jijia-accounts",
        json={"name": "第二策略账号", "app_id": "policy-app-2", "app_key": "policy-key-2"},
        headers={"X-CSRF-Token": auth["csrfToken"]},
    ).json()["data"]
    second_verified = client.post(
        f"/api/v1/jijia-accounts/{second_account['id']}/verify",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    assert second_verified.status_code == 200

    first_update = client.put(
        f"/api/v1/jijia-accounts/{first_account['id']}/api-policies/traffic_analysis_page",
        json={
            "enabled": True,
            "schedule_mode": "daily",
            "schedule_expr": "02:30",
            "timezone": "Asia/Shanghai",
            "window_mode": "checkpoint",
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    second_update = client.put(
        f"/api/v1/jijia-accounts/{second_account['id']}/api-policies/traffic_analysis_page",
        json={
            "enabled": False,
            "schedule_mode": "manual_only",
            "timezone": "Asia/Shanghai",
            "window_mode": "checkpoint",
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert first_update.status_code == 200
    assert second_update.status_code == 200
    first_policy = next(
        item
        for item in client.get(f"/api/v1/jijia-accounts/{first_account['id']}/api-policies").json()[
            "data"
        ]
        if item["apiCode"] == "traffic_analysis_page"
    )
    second_policy = next(
        item
        for item in client.get(
            f"/api/v1/jijia-accounts/{second_account['id']}/api-policies"
        ).json()["data"]
        if item["apiCode"] == "traffic_analysis_page"
    )
    assert first_policy["enabled"] is True
    assert first_policy["scheduleMode"] == "daily"
    assert second_policy["enabled"] is False
    assert second_policy["scheduleMode"] == "manual_only"


def test_operator_batch_updates_policies_in_one_transaction(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    response = client.put(
        f"/api/v1/jijia-accounts/{account['id']}/api-policies/batch",
        json={
            "items": [
                {
                    "api_code": "amazon_shop_page",
                    "enabled": True,
                    "schedule_mode": "manual_only",
                    "timezone": "Asia/Shanghai",
                },
                {
                    "api_code": "traffic_analysis_page",
                    "enabled": True,
                    "schedule_mode": "daily",
                    "schedule_expr": "03:30",
                    "timezone": "Asia/Shanghai",
                    "window_mode": "checkpoint",
                },
            ]
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert response.status_code == 200
    assert [item["apiCode"] for item in response.json()["data"]] == [
        "amazon_shop_page",
        "traffic_analysis_page",
    ]
    with harness.session_factory() as db:
        audit = db.scalar(select(AuditLog).where(AuditLog.action == "api_policy.batch_update"))
        assert audit is not None
        assert audit.changes_json["itemCount"] == 2


def test_batch_policy_validation_failure_keeps_every_policy_unchanged(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    list_url = f"/api/v1/jijia-accounts/{account['id']}/api-policies"
    before = {item["apiCode"]: item for item in client.get(list_url).json()["data"]}

    response = client.put(
        f"{list_url}/batch",
        json={
            "items": [
                {
                    "api_code": "amazon_shop_page",
                    "enabled": True,
                    "schedule_mode": "manual_only",
                    "timezone": "Asia/Shanghai",
                },
                {
                    "api_code": "traffic_analysis_page",
                    "enabled": True,
                    "schedule_mode": "cron",
                    "schedule_expr": "* * * * *",
                    "timezone": "Asia/Shanghai",
                    "window_mode": "checkpoint",
                },
            ]
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert response.status_code == 422
    after = {item["apiCode"]: item for item in client.get(list_url).json()["data"]}
    assert after["amazon_shop_page"] == before["amazon_shop_page"]
    assert after["traffic_analysis_page"] == before["traffic_analysis_page"]
    with harness.session_factory() as db:
        assert (
            db.scalar(select(AuditLog).where(AuditLog.action == "api_policy.batch_update")) is None
        )
