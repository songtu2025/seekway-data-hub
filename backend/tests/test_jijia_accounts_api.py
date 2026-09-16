from datetime import datetime
from pathlib import Path
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, insert, select
from sqlalchemy.orm import Session, sessionmaker

from backend.app.core.credentials import CredentialCipher
from backend.app.core.errors import ApiError
from backend.app.models.account_api_policy import AccountApiPolicy, ScheduleMode
from backend.app.models.audit_log import AuditLog
from backend.app.models.base import Base
from backend.app.models.jijia_account import (
    CredentialSource,
    JijiaAccount,
    JijiaAccountStatus,
)
from backend.app.models.sync_records import raw_api_data_table
from backend.app.models.user import AppUser, UserRole, UserStatus
from backend.app.services.jijia_account_service import verify_account
from backend.tests.conftest import AuthHarness
from backend.tests.test_auth_api import mysql_sql, register_user


def test_account_credentials_are_encrypted_and_response_is_masked(
    harness: AuthHarness,
) -> None:
    client, auth, _ = register_user(harness, "operator@example.com", UserRole.OPERATOR)
    response = client.post(
        "/api/v1/jijia-accounts",
        json={"name": "北美业务账号", "app_id": "app-12345678", "app_key": "secret-key"},
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert response.status_code == 201
    body = response.json()["data"]
    assert body["maskedAppId"] == "•••• 5678"
    assert body["status"] == "pending_verification"
    assert "appKey" not in body
    assert "encryptedAppKey" not in body
    with harness.session_factory() as db:
        account = db.scalar(select(JijiaAccount))
        assert account is not None
        assert account.encrypted_app_id != "app-12345678"
        assert account.encrypted_app_key != "secret-key"
        assert account.created_by is not None
        assert account.updated_by == account.created_by


def test_account_detail_includes_workspace_readiness_summary(
    harness: AuthHarness,
) -> None:
    client, auth, _ = register_user(harness, "workspace@example.com", UserRole.OPERATOR)
    created = client.post(
        "/api/v1/jijia-accounts",
        json={"name": "工作台账号", "app_id": "workspace-id", "app_key": "workspace-key"},
        headers={"X-CSRF-Token": auth["csrfToken"]},
    ).json()["data"]

    response = client.get(f"/api/v1/jijia-accounts/{created['id']}")

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["enabledPolicyCount"] == 0
    assert body["scheduledPolicyCount"] == 0
    assert body["latestJobStatus"] is None
    assert body["latestJobAt"] is None
    assert body["latestDataAt"] is None
    assert "appKey" not in body


def test_account_detail_uses_index_ordered_latest_data_query(
    harness: AuthHarness,
) -> None:
    client, auth, _ = register_user(harness, "latest-data@example.com", UserRole.OPERATOR)
    created = client.post(
        "/api/v1/jijia-accounts",
        json={"name": "最新数据账号", "app_id": "latest-id", "app_key": "latest-key"},
        headers={"X-CSRF-Token": auth["csrfToken"]},
    ).json()["data"]
    older = datetime(2026, 8, 25, 8, 0, 0)
    latest = datetime(2026, 8, 26, 9, 0, 0)
    with harness.session_factory() as db:
        db.execute(
            insert(raw_api_data_table),
            [
                {
                    "jijia_account_id": created["id"],
                    "api_code": "sale_return_order_page",
                    "source_primary_key": source_key,
                    "record_identity": f"identity-{source_key}",
                    "data_hash": f"hash-{source_key}",
                    "raw_json": {"id": source_key},
                    "sync_batch_no": f"batch-{source_key}",
                    "first_observed_at": observed_at,
                    "last_observed_at": observed_at,
                    "observation_count": 1,
                    "created_at": observed_at,
                    "updated_at": observed_at,
                }
                for source_key, observed_at in (("older", older), ("latest", latest))
            ],
        )
        db.commit()
        engine = db.get_bind()

    statements: list[str] = []

    def capture_sql(_conn, _cursor, statement, _params, _context, _executemany):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", capture_sql)
    try:
        response = client.get(f"/api/v1/jijia-accounts/{created['id']}")
    finally:
        event.remove(engine, "before_cursor_execute", capture_sql)

    assert response.status_code == 200
    assert response.json()["data"]["latestDataAt"] == latest.isoformat()
    account_summary_selects = [
        statement
        for statement in statements
        if "raw_api_data.last_observed_at" in statement and "FROM jijia_account" in statement
    ]
    assert len(account_summary_selects) == 1
    account_summary_sql = account_summary_selects[0]
    assert "max(raw_api_data.last_observed_at)" not in account_summary_sql.lower()
    assert "ORDER BY raw_api_data.last_observed_at DESC" in account_summary_sql
    assert "LIMIT" in account_summary_sql


def test_account_summary_excludes_catalog_disabled_policies(
    harness: AuthHarness,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, auth, _ = register_user(harness, "summary@example.com", UserRole.OPERATOR)
    created = client.post(
        "/api/v1/jijia-accounts",
        json={"name": "统计账号", "app_id": "summary-id", "app_key": "summary-key"},
        headers={"X-CSRF-Token": auth["csrfToken"]},
    ).json()["data"]
    monkeypatch.setattr(
        "backend.app.services.jijia_account_service.load_catalog",
        lambda _path: [
            {"api_code": "available_api", "enabled": True},
            {"api_code": "placeholder_api", "enabled": False},
        ],
    )
    with harness.session_factory() as db:
        db.add_all(
            [
                AccountApiPolicy(
                    jijia_account_id=created["id"],
                    api_code=api_code,
                    enabled=True,
                    schedule_mode=ScheduleMode.DAILY,
                    schedule_expr="02:00",
                    timezone="Asia/Shanghai",
                )
                for api_code in ("available_api", "placeholder_api")
            ]
        )
        db.commit()

    response = client.get(f"/api/v1/jijia-accounts/{created['id']}")

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["enabledPolicyCount"] == 1
    assert body["scheduledPolicyCount"] == 1


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.OPERATOR])
@pytest.mark.parametrize("headers", [{}, {"X-CSRF-Token": "wrong-token"}])
def test_account_write_requires_valid_csrf(
    harness: AuthHarness,
    role: UserRole,
    headers: dict[str, str],
) -> None:
    client, _, _ = register_user(harness, f"{role.value}@example.com", role)

    response = client.post(
        "/api/v1/jijia-accounts",
        json={"name": "未授权账号", "app_id": "blocked-id", "app_key": "blocked-key"},
        headers=headers,
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "CSRF_INVALID"


def test_validation_error_does_not_echo_credentials(harness: AuthHarness) -> None:
    client, auth, _ = register_user(harness, "admin@example.com", UserRole.ADMIN)
    app_id = "sensitive-app-id"
    app_key = "sensitive-app-key"

    response = client.patch(
        "/api/v1/jijia-accounts/1",
        json={"app_id": app_id, "app_key": app_key * 60},
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert response.status_code == 422
    response_text = response.text
    assert app_id not in response_text
    assert app_key not in response_text


def test_verify_account_creates_default_policies_without_starting_sync(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, _ = register_user(harness, "admin@example.com", UserRole.ADMIN)
    created = client.post(
        "/api/v1/jijia-accounts",
        json={"name": "欧洲业务账号", "app_id": "app-europe", "app_key": "safe-key"},
        headers={"X-CSRF-Token": auth["csrfToken"]},
    ).json()["data"]
    calls: list[tuple[str, str]] = []
    monkeypatch.setattr(
        "backend.app.services.jijia_account_service.verify_account_credentials",
        lambda app_id, app_key, **_kwargs: calls.append((app_id, app_key)),
    )

    verified = client.post(
        f"/api/v1/jijia-accounts/{created['id']}/verify",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert verified.status_code == 200
    assert verified.json()["data"]["status"] == "active"
    assert calls == [("app-europe", "safe-key")]
    with harness.session_factory() as db:
        policies = db.scalars(
            select(AccountApiPolicy).where(AccountApiPolicy.jijia_account_id == created["id"])
        ).all()
        assert policies
        assert all(not policy.enabled for policy in policies)
        assert all(policy.next_run_at is None for policy in policies)


def test_verify_failure_does_not_echo_credentials_or_provider_error(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, _ = register_user(harness, "verify-failure@example.com", UserRole.OPERATOR)
    account = client.post(
        "/api/v1/jijia-accounts",
        json={
            "name": "验证失败账号",
            "app_id": "sensitive-app-id",
            "app_key": "sensitive-app-key",
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    ).json()["data"]
    provider_error = "provider rejected sensitive-app-id sensitive-app-key"

    def raise_provider_error(app_id: str, app_key: str, **_kwargs) -> None:
        raise ValueError(provider_error)

    monkeypatch.setattr(
        "backend.app.services.jijia_account_service.verify_account_credentials",
        raise_provider_error,
    )

    response = client.post(
        f"/api/v1/jijia-accounts/{account['id']}/verify",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "ACCOUNT_CREDENTIAL_INVALID"
    assert "sensitive-app-id" not in response.text
    assert "sensitive-app-key" not in response.text
    assert provider_error not in response.text
    with harness.session_factory() as db:
        account_row = db.get(JijiaAccount, account["id"])
        assert account_row is not None
        assert account_row.last_verify_error == "积加账号验证失败"
        assert "sensitive-app-id" not in account_row.last_verify_error
        assert "sensitive-app-key" not in account_row.last_verify_error
        assert provider_error not in account_row.last_verify_error


def test_updating_credentials_resets_status_and_deactivate_is_inactive(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, _ = register_user(harness, "update-account@example.com", UserRole.OPERATOR)
    created = client.post(
        "/api/v1/jijia-accounts",
        json={"name": "待更新账号", "app_id": "initial-id", "app_key": "initial-key"},
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
    assert verified.json()["data"]["status"] == "active"

    updated = client.patch(
        f"/api/v1/jijia-accounts/{created['id']}",
        json={"app_id": "updated-app-id", "app_key": "updated-app-key"},
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert updated.status_code == 200
    updated_data = updated.json()["data"]
    assert updated_data["status"] == "pending_verification"
    assert updated_data["maskedAppId"] == "•••• p-id"
    assert "updated-app-id" not in updated.text
    assert "updated-app-key" not in updated.text
    assert "encryptedAppId" not in updated_data
    assert "encryptedAppKey" not in updated_data

    deactivated = client.post(
        f"/api/v1/jijia-accounts/{created['id']}/deactivate",
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )

    assert deactivated.status_code == 200
    assert deactivated.json()["data"]["status"] == "inactive"


def test_viewer_can_read_accounts_but_cannot_change_them(harness: AuthHarness) -> None:
    admin_client, admin_auth, _ = register_user(harness, "admin@example.com", UserRole.ADMIN)
    admin_client.post(
        "/api/v1/jijia-accounts",
        json={"name": "只读可见账号", "app_id": "visible-id", "app_key": "hidden-key"},
        headers={"X-CSRF-Token": admin_auth["csrfToken"]},
    )

    with TestClient(harness.app) as viewer_client:
        _, viewer_auth, _ = register_user(
            harness,
            "viewer@example.com",
            UserRole.VIEWER,
            viewer_client,
        )
        listed = viewer_client.get("/api/v1/jijia-accounts")
        forbidden = viewer_client.post(
            "/api/v1/jijia-accounts",
            json={"name": "禁止创建", "app_id": "blocked", "app_key": "blocked"},
            headers={"X-CSRF-Token": viewer_auth["csrfToken"]},
        )

    assert listed.status_code == 200
    assert listed.json()["data"][0]["name"] == "只读可见账号"
    assert forbidden.status_code == 403
    assert forbidden.json()["error"]["code"] == "PERMISSION_DENIED"


def _seed_verification_race_store(
    tmp_path: Path,
    harness: AuthHarness,
) -> tuple[Any, sessionmaker[Session], int, int]:
    engine = create_engine(
        f"sqlite+pysqlite:///{tmp_path / 'verification-race.sqlite'}",
        connect_args={"check_same_thread": False},
    )
    with engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA journal_mode=WAL")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    cipher = CredentialCipher(harness.settings.credential_encryption_key)
    with session_factory() as db:
        actor = AppUser(
            email="verification-race@example.com",
            role=UserRole.ADMIN,
            status=UserStatus.ACTIVE,
            failed_login_count=0,
        )
        db.add(actor)
        db.flush()
        account = JijiaAccount(
            account_code="acct_verification_race",
            name="并发验证账号",
            masked_app_id="•••• tial",
            encrypted_app_id=cipher.encrypt("initial-app-id"),
            encrypted_app_key=cipher.encrypt("initial-app-key"),
            credential_source=CredentialSource.ENCRYPTED,
            status=JijiaAccountStatus.PENDING_VERIFICATION,
            created_by=actor.id,
            updated_by=actor.id,
        )
        db.add(account)
        db.commit()
        return engine, session_factory, account.id, actor.id


@pytest.mark.parametrize("provider_succeeds", [True, False])
@pytest.mark.parametrize("concurrent_change", ["credentials", "deactivate"])
def test_verify_account_rejects_state_changed_during_external_call(
    tmp_path: Path,
    harness: AuthHarness,
    monkeypatch: pytest.MonkeyPatch,
    provider_succeeds: bool,
    concurrent_change: str,
) -> None:
    engine, session_factory, account_id, actor_id = _seed_verification_race_store(
        tmp_path,
        harness,
    )
    cipher = CredentialCipher(harness.settings.credential_encryption_key)

    def verify_with_concurrent_change(_app_id: str, _app_key: str, **_kwargs) -> None:
        with session_factory() as concurrent_db:
            account = concurrent_db.get(JijiaAccount, account_id)
            assert account is not None
            if concurrent_change == "credentials":
                account.encrypted_app_id = cipher.encrypt("replacement-app-id")
                account.encrypted_app_key = cipher.encrypt("replacement-app-key")
                account.masked_app_id = "•••• p-id"
                account.status = JijiaAccountStatus.PENDING_VERIFICATION
            else:
                account.status = JijiaAccountStatus.INACTIVE
            account.updated_by = actor_id
            concurrent_db.commit()
        if not provider_succeeds:
            raise ValueError("synthetic provider failure")

    monkeypatch.setattr(
        "backend.app.services.jijia_account_service.verify_account_credentials",
        verify_with_concurrent_change,
    )

    with session_factory() as db:
        with pytest.raises(ApiError) as stale:
            verify_account(
                db,
                account_id,
                actor_id,
                harness.settings,
                "request-stale-verification",
            )

    assert stale.value.status_code == 409
    assert stale.value.code == "ACCOUNT_VERIFY_STALE"
    with session_factory() as db:
        account = db.get(JijiaAccount, account_id)
        assert account is not None
        expected_status = (
            JijiaAccountStatus.PENDING_VERIFICATION
            if concurrent_change == "credentials"
            else JijiaAccountStatus.INACTIVE
        )
        assert account.status == expected_status
        if concurrent_change == "credentials":
            assert cipher.decrypt(account.encrypted_app_id or "") == "replacement-app-id"
            assert cipher.decrypt(account.encrypted_app_key or "") == "replacement-app-key"
        assert (
            db.scalar(
                select(AccountApiPolicy).where(AccountApiPolicy.jijia_account_id == account_id)
            )
            is None
        )
        assert (
            db.scalar(
                select(AuditLog).where(
                    AuditLog.action == "jijia_account.verify",
                    AuditLog.jijia_account_id == account_id,
                )
            )
            is None
        )
    engine.dispose()


def test_verify_account_uses_mysql_current_locking_read(
    harness: AuthHarness,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cipher = CredentialCipher(harness.settings.credential_encryption_key)
    initial = JijiaAccount(
        id=7,
        account_code="acct_lock_contract",
        name="锁契约账号",
        masked_app_id="•••• tial",
        encrypted_app_id=cipher.encrypt("initial-app-id"),
        encrypted_app_key=cipher.encrypt("initial-app-key"),
        credential_source=CredentialSource.ENCRYPTED,
        status=JijiaAccountStatus.PENDING_VERIFICATION,
    )
    current = JijiaAccount(
        id=7,
        account_code=initial.account_code,
        name=initial.name,
        masked_app_id=initial.masked_app_id,
        encrypted_app_id=initial.encrypted_app_id,
        encrypted_app_key=initial.encrypted_app_key,
        credential_source=CredentialSource.ENCRYPTED,
        status=JijiaAccountStatus.INACTIVE,
    )

    class CapturingSession:
        statement: Any = None

        def get(self, _model: Any, _identity: int) -> JijiaAccount:
            return initial

        def rollback(self) -> None:
            return None

        def get_bind(self) -> Any:
            return object()

        def scalar(self, statement: Any) -> JijiaAccount:
            self.statement = statement
            return current

    session = CapturingSession()
    monkeypatch.setattr(
        "backend.app.services.jijia_account_service.verify_account_credentials",
        lambda _app_id, _app_key, **_kwargs: None,
    )

    with pytest.raises(ApiError) as stale:
        verify_account(
            cast(Session, session),
            initial.id,
            actor_id=11,
            settings=harness.settings,
            request_id="request-lock-contract",
        )

    assert stale.value.code == "ACCOUNT_VERIFY_STALE"
    assert session.statement is not None
    statement = mysql_sql(session.statement)
    assert "FROM JIJIA_ACCOUNT" in statement
    assert "WHERE JIJIA_ACCOUNT.ID = 7" in statement
    assert "FOR UPDATE" in statement
