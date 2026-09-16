import json
from collections.abc import Iterator
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from backend.app.core.security import hash_password
from backend.app.models.account_api_policy import AccountApiPolicy
from backend.app.models.audit_log import AuditLog
from backend.app.models.jijia_account import JijiaAccount, JijiaAccountStatus
from backend.app.models.user import AppUser, UserRole, UserStatus
from backend.app.schemas.jijia_account import JijiaAccountCreateRequest
from backend.app.services.audit_service import add_audit_log
from backend.app.services.jijia_account_service import create_account
from backend.tests.conftest import AuthHarness

PASSWORD = "valid-password-123"


def seed_user(
    harness: AuthHarness,
    email: str,
    role: UserRole,
) -> int:
    with harness.session_factory() as db:
        user = AppUser(
            email=email,
            display_name="合成用户",
            password_hash=hash_password(PASSWORD),
            role=role,
            status=UserStatus.ACTIVE,
        )
        db.add(user)
        db.commit()
        return user.id


def login(client: TestClient, email: str) -> tuple[dict[str, object], str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
    )
    assert response.status_code == 200
    return response.json()["data"], response.json()["requestId"]


def clear_audits(harness: AuthHarness) -> None:
    with harness.session_factory() as db:
        db.execute(delete(AuditLog))
        db.commit()


def audit_rows(harness: AuthHarness) -> list[AuditLog]:
    with harness.session_factory() as db:
        return list(db.scalars(select(AuditLog).order_by(AuditLog.id)).all())


def assert_changes_are_redacted(
    rows: Iterator[AuditLog],
    forbidden_values: set[str],
) -> None:
    for row in rows:
        serialized = json.dumps(row.changes_json, ensure_ascii=False)
        assert all(value not in serialized for value in forbidden_values)
        assert row.changes_json is None or all(
            value is None or isinstance(value, (str, bool)) for value in row.changes_json.values()
        )


def test_add_audit_log_only_adds_to_the_caller_transaction(
    harness: AuthHarness,
) -> None:
    with harness.session_factory() as db:
        add_audit_log(
            db,
            actor_user_id=None,
            jijia_account_id=None,
            action="test.pending",
            resource_type="test_resource",
            resource_id="1",
            request_id="request-pending",
            result="success",
            changes={"enabled": True},
        )

        pending = next(item for item in db.new if isinstance(item, AuditLog))
        assert pending.request_id == "request-pending"
        db.rollback()

    assert audit_rows(harness) == []


def test_auth_success_lock_and_logout_write_correlated_audits(
    harness: AuthHarness,
) -> None:
    admin_id = seed_user(harness, "audit-admin@example.com", UserRole.ADMIN)
    locked_user_id = seed_user(harness, "locked-user@example.com", UserRole.VIEWER)
    clear_audits(harness)

    auth, login_request_id = login(harness.client, "audit-admin@example.com")
    logout = harness.client.post(
        "/api/v1/auth/logout",
        headers={"X-CSRF-Token": str(auth["csrfToken"])},
    )
    assert logout.status_code == 200

    locked_response = None
    for _ in range(harness.settings.login_max_failures):
        locked_response = harness.client.post(
            "/api/v1/auth/login",
            json={"email": "locked-user@example.com", "password": "wrong-password"},
        )
        assert locked_response.status_code == 401
    assert locked_response is not None

    rows = audit_rows(harness)
    assert [row.action for row in rows] == [
        "auth.login",
        "auth.logout",
        "auth.login.lock",
    ]
    assert [row.result for row in rows] == ["success", "success", "failure"]
    assert rows[0].actor_user_id == admin_id
    assert rows[0].resource_type == "user"
    assert rows[0].resource_id == str(admin_id)
    assert rows[0].request_id == login_request_id
    assert rows[1].actor_user_id == admin_id
    assert rows[1].resource_type == "user_session"
    assert rows[1].request_id == logout.json()["requestId"]
    assert rows[2].actor_user_id is None
    assert rows[2].resource_type == "user"
    assert rows[2].resource_id == str(locked_user_id)
    assert rows[2].request_id == locked_response.json()["requestId"]
    assert rows[2].changes_json == {"locked": True}
    assert all(row.jijia_account_id is None for row in rows)


def test_lock_audit_repeats_only_after_previous_lock_expires(
    harness: AuthHarness,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    current_time = [datetime(2026, 8, 27, 1, 0, 0)]
    monkeypatch.setattr(
        "backend.app.services.auth_service.utc_now",
        lambda: current_time[0],
    )
    user_id = seed_user(harness, "repeat-lock@example.com", UserRole.VIEWER)
    clear_audits(harness)

    first_lock_response = None
    for _ in range(harness.settings.login_max_failures):
        first_lock_response = harness.client.post(
            "/api/v1/auth/login",
            json={"email": "repeat-lock@example.com", "password": "wrong-password"},
        )
        assert first_lock_response.status_code == 401
    assert first_lock_response is not None
    with harness.session_factory() as db:
        user = db.get(AppUser, user_id)
        assert user is not None
        first_locked_until = user.locked_until
    assert first_locked_until is not None

    locked_response = harness.client.post(
        "/api/v1/auth/login",
        json={"email": "repeat-lock@example.com", "password": "wrong-password"},
    )
    assert locked_response.status_code == 423
    assert [row.action for row in audit_rows(harness)] == ["auth.login.lock"]

    current_time[0] = first_locked_until + timedelta(seconds=1)
    renewed_response = harness.client.post(
        "/api/v1/auth/login",
        json={"email": "repeat-lock@example.com", "password": "wrong-password"},
    )
    assert renewed_response.status_code == 401

    rows = audit_rows(harness)
    assert [row.action for row in rows] == ["auth.login.lock", "auth.login.lock"]
    assert rows[0].request_id == first_lock_response.json()["requestId"]
    assert rows[1].request_id == renewed_response.json()["requestId"]
    with harness.session_factory() as db:
        user = db.get(AppUser, user_id)
        assert user is not None
        assert user.locked_until == current_time[0] + timedelta(
            minutes=harness.settings.login_lock_minutes
        )


def test_member_actions_are_visible_in_audit_api_without_sensitive_changes(
    harness: AuthHarness,
) -> None:
    admin_id = seed_user(harness, "member-admin@example.com", UserRole.ADMIN)
    target_id = seed_user(harness, "member-target@example.com", UserRole.VIEWER)
    auth, _ = login(harness.client, "member-admin@example.com")
    headers = {"X-CSRF-Token": str(auth["csrfToken"])}
    clear_audits(harness)

    invited_email = "invited-sensitive@example.com"
    created = harness.client.post(
        "/api/v1/invitations",
        json={"email": invited_email, "role": "viewer"},
        headers=headers,
    )
    assert created.status_code == 200
    original_id = created.json()["data"]["id"]
    resent = harness.client.post(
        f"/api/v1/invitations/{original_id}/resend",
        headers=headers,
    )
    assert resent.status_code == 200
    replacement_id = resent.json()["data"]["id"]
    revoked = harness.client.post(
        f"/api/v1/invitations/{replacement_id}/revoke",
        headers=headers,
    )
    assert revoked.status_code == 200
    role_update = harness.client.patch(
        f"/api/v1/users/{target_id}",
        json={"role": "operator"},
        headers=headers,
    )
    assert role_update.status_code == 200
    disabled = harness.client.patch(
        f"/api/v1/users/{target_id}",
        json={"status": "disabled"},
        headers=headers,
    )
    assert disabled.status_code == 200
    reactivated = harness.client.patch(
        f"/api/v1/users/{target_id}",
        json={"status": "active"},
        headers=headers,
    )
    assert reactivated.status_code == 200

    rows = audit_rows(harness)
    expected = [
        ("invitation.create", "invitation", str(original_id)),
        ("invitation.resend", "invitation", str(replacement_id)),
        ("invitation.revoke", "invitation", str(replacement_id)),
        ("user.role.update", "user", str(target_id)),
        ("user.disable", "user", str(target_id)),
        ("user.status.update", "user", str(target_id)),
    ]
    assert [(row.action, row.resource_type, row.resource_id) for row in rows] == expected
    assert all(row.actor_user_id == admin_id for row in rows)
    assert all(row.result == "success" for row in rows)
    assert all(row.jijia_account_id is None for row in rows)
    assert_changes_are_redacted(
        iter(rows),
        {invited_email, "member-target@example.com", "合成用户"},
    )

    listed = harness.client.get("/api/v1/audit-logs")
    assert listed.status_code == 200
    listed_items = listed.json()["data"]["items"]
    assert {item["action"] for item in listed_items} == {item[0] for item in expected}
    assert all(item["requestId"] for item in listed_items)


def test_account_and_policy_actions_preserve_scope_and_redaction(
    harness: AuthHarness,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_id = seed_user(harness, "account-admin@example.com", UserRole.ADMIN)
    auth, _ = login(harness.client, "account-admin@example.com")
    headers = {"X-CSRF-Token": str(auth["csrfToken"])}
    clear_audits(harness)
    account_name = "敏感业务账号名称"
    app_id = "sensitive-app-id"
    app_key = "sensitive-app-key"

    created = harness.client.post(
        "/api/v1/jijia-accounts",
        json={"name": account_name, "app_id": app_id, "app_key": app_key},
        headers=headers,
    )
    assert created.status_code == 201
    account_id = created.json()["data"]["id"]
    updated = harness.client.patch(
        f"/api/v1/jijia-accounts/{account_id}",
        json={"name": "另一敏感名称", "app_key": "replacement-secret"},
        headers=headers,
    )
    assert updated.status_code == 200
    monkeypatch.setattr(
        "backend.app.services.jijia_account_service.verify_account_credentials",
        lambda _app_id, _app_key, **_kwargs: None,
    )
    verified = harness.client.post(
        f"/api/v1/jijia-accounts/{account_id}/verify",
        headers=headers,
    )
    assert verified.status_code == 200
    policy = harness.client.put(
        f"/api/v1/jijia-accounts/{account_id}/api-policies/traffic_analysis_page",
        json={
            "enabled": True,
            "schedule_mode": "daily",
            "schedule_expr": "02:30",
            "timezone": "Asia/Shanghai",
            "window_mode": "checkpoint",
        },
        headers=headers,
    )
    assert policy.status_code == 200
    deactivated = harness.client.post(
        f"/api/v1/jijia-accounts/{account_id}/deactivate",
        headers=headers,
    )
    assert deactivated.status_code == 200

    failed_created = harness.client.post(
        "/api/v1/jijia-accounts",
        json={"name": "失败账号", "app_id": "failed-app", "app_key": "failed-key"},
        headers=headers,
    )
    failed_account_id = failed_created.json()["data"]["id"]
    provider_error = "provider leaked failed-app and failed-key"

    def fail_verification(_app_id: str, _app_key: str, **_kwargs) -> None:
        raise ValueError(provider_error)

    monkeypatch.setattr(
        "backend.app.services.jijia_account_service.verify_account_credentials",
        fail_verification,
    )
    failed_verify = harness.client.post(
        f"/api/v1/jijia-accounts/{failed_account_id}/verify",
        headers=headers,
    )
    assert failed_verify.status_code == 400

    rows = audit_rows(harness)
    assert [row.action for row in rows] == [
        "jijia_account.create",
        "jijia_account.update",
        "jijia_account.verify",
        "api_policy.update",
        "jijia_account.deactivate",
        "jijia_account.create",
        "jijia_account.verify",
    ]
    assert [row.result for row in rows] == [
        "success",
        "success",
        "success",
        "success",
        "success",
        "success",
        "failure",
    ]
    assert all(row.actor_user_id == admin_id for row in rows)
    assert all(row.jijia_account_id is not None for row in rows)
    assert all(row.request_id for row in rows)
    policy_row = next(row for row in rows if row.action == "api_policy.update")
    assert policy_row.jijia_account_id == account_id
    assert policy_row.resource_type == "account_api_policy"
    assert policy_row.resource_id == str(policy.json()["data"]["id"])
    failure_row = rows[-1]
    assert failure_row.jijia_account_id == failed_account_id
    assert failure_row.resource_id == str(failed_account_id)
    assert failure_row.changes_json == {"status": "verification_failed"}
    assert_changes_are_redacted(
        iter(rows),
        {
            account_name,
            "另一敏感名称",
            app_id,
            app_key,
            "replacement-secret",
            "failed-app",
            "failed-key",
            provider_error,
            "account-admin@example.com",
        },
    )


def test_account_and_audit_roll_back_together_when_commit_fails(
    harness: AuthHarness,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_id = seed_user(harness, "rollback-admin@example.com", UserRole.ADMIN)
    with harness.session_factory() as db:
        original_commit = db.commit

        def fail_commit() -> None:
            db.rollback()
            raise RuntimeError("synthetic commit failure")

        monkeypatch.setattr(db, "commit", fail_commit)
        with pytest.raises(RuntimeError, match="synthetic commit failure"):
            create_account(
                db,
                JijiaAccountCreateRequest(
                    name="回滚账号",
                    app_id="rollback-app",
                    app_key="rollback-key",
                ),
                actor_id,
                harness.settings,
                "request-rollback",
            )
        monkeypatch.setattr(db, "commit", original_commit)

    with harness.session_factory() as db:
        assert db.scalar(select(JijiaAccount).where(JijiaAccount.name == "回滚账号")) is None
        assert db.scalar(select(AuditLog).where(AuditLog.request_id == "request-rollback")) is None


def test_last_admin_rejection_leaves_no_success_audit(harness: AuthHarness) -> None:
    admin_id = seed_user(harness, "last-admin@example.com", UserRole.ADMIN)
    auth, _ = login(harness.client, "last-admin@example.com")
    clear_audits(harness)

    response = harness.client.patch(
        f"/api/v1/users/{admin_id}",
        json={"status": "disabled"},
        headers={"X-CSRF-Token": str(auth["csrfToken"])},
    )

    assert response.status_code == 409
    assert audit_rows(harness) == []


def test_verification_failure_commits_status_and_failure_audit(
    harness: AuthHarness,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_id = seed_user(harness, "failure-admin@example.com", UserRole.ADMIN)
    auth, _ = login(harness.client, "failure-admin@example.com")
    headers = {"X-CSRF-Token": str(auth["csrfToken"])}
    created = harness.client.post(
        "/api/v1/jijia-accounts",
        json={"name": "验证失败", "app_id": "failure-app", "app_key": "failure-key"},
        headers=headers,
    ).json()["data"]
    clear_audits(harness)
    monkeypatch.setattr(
        "backend.app.services.jijia_account_service.verify_account_credentials",
        lambda _app_id, _app_key, **_kwargs: (_ for _ in ()).throw(
            ValueError("private provider error")
        ),
    )

    response = harness.client.post(
        f"/api/v1/jijia-accounts/{created['id']}/verify",
        headers=headers,
    )

    assert response.status_code == 400
    rows = audit_rows(harness)
    assert len(rows) == 1
    assert rows[0].action == "jijia_account.verify"
    assert rows[0].result == "failure"
    assert rows[0].actor_user_id == admin_id
    assert rows[0].jijia_account_id == created["id"]
    assert "private provider error" not in json.dumps(rows[0].changes_json)
    with harness.session_factory() as db:
        account = db.get(JijiaAccount, created["id"])
        assert account is not None
        assert account.status == JijiaAccountStatus.VERIFICATION_FAILED
        assert (
            db.scalar(
                select(AccountApiPolicy).where(AccountApiPolicy.jijia_account_id == created["id"])
            )
            is None
        )
