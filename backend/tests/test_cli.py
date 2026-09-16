from datetime import date, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from cryptography.fernet import Fernet
from sqlalchemy import create_engine, insert, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app import cli
from backend.app.core.credentials import CredentialCipher
from backend.app.core.errors import ApiError
from backend.app.models import (
    AppUser,
    AuditLog,
    Base,
    CredentialSource,
    JijiaAccount,
    JijiaAccountStatus,
)
from backend.app.models.sync_records import sync_checkpoint_table, sync_records_metadata
from backend.app.services.mail_service import FakeMailSender
from backend.tests.conftest import AuthHarness


def test_bootstrap_admin_only_creates_first_invitation(
    harness: AuthHarness, monkeypatch: pytest.MonkeyPatch
) -> None:
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)
    fake_mail = FakeMailSender()
    monkeypatch.setattr(cli, "SessionLocal", session_factory)
    monkeypatch.setattr(cli, "get_web_settings", lambda: harness.settings)
    monkeypatch.setattr(cli, "create_mail_sender", lambda _: fake_mail)

    cli.bootstrap_admin("first-admin@example.com")
    assert fake_mail.invitations[0]["role"] == "admin"
    with session_factory() as db:
        audit = db.scalar(select(AuditLog))
        assert audit is not None
        assert audit.action == "invitation.create"
        assert audit.actor_user_id is None
        assert audit.request_id is None
    with pytest.raises(ApiError) as error:
        cli.bootstrap_admin("second-admin@example.com")
    assert error.value.code == "ADMIN_ALREADY_EXISTS"
    engine.dispose()


def test_bootstrap_admin_mail_failure_rolls_back_and_can_retry(
    harness: AuthHarness, monkeypatch: pytest.MonkeyPatch
) -> None:
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)

    class FailingMailSender:
        def send_invitation(self, email: str, role: str, invitation_url: str) -> None:
            raise RuntimeError("mail unavailable")

    monkeypatch.setattr(cli, "SessionLocal", session_factory)
    monkeypatch.setattr(cli, "get_web_settings", lambda: harness.settings)
    monkeypatch.setattr(cli, "create_mail_sender", lambda _: FailingMailSender())

    with pytest.raises(RuntimeError):
        cli.bootstrap_admin("retry-admin@example.com")

    with session_factory() as db:
        assert db.scalar(select(AppUser)) is None

    successful_mail = FakeMailSender()
    monkeypatch.setattr(cli, "create_mail_sender", lambda _: successful_mail)
    cli.bootstrap_admin("retry-admin@example.com")
    assert successful_mail.invitations[0]["email"] == "retry-admin@example.com"
    engine.dispose()


def test_discover_sale_return_start_uses_selected_web_account_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)
    key = Fernet.generate_key().decode("ascii")
    cipher = CredentialCipher(key)
    with session_factory() as db:
        account = JijiaAccount(
            account_code="acct_real_test",
            name="真实账号测试替身",
            masked_app_id="•••• test",
            encrypted_app_id=cipher.encrypt("selected-app-id"),
            encrypted_app_key=cipher.encrypt("selected-app-key"),
            credential_source=CredentialSource.ENCRYPTED,
            status=JijiaAccountStatus.ACTIVE,
        )
        db.add(account)
        db.commit()
        account_id = account.id

    captured: dict[str, object] = {}

    class FakeAuthClient:
        def __init__(self, _settings, **kwargs):
            captured["credentials"] = kwargs["credentials"]
            assert kwargs["use_token_cache"] is False

        def get_access_token(self, *, force_refresh: bool):
            assert force_refresh is True
            return SimpleNamespace(value="synthetic-token")

    class FakeApiClient:
        def __init__(self, _settings, **_kwargs):
            pass

        def request_url(self, api):
            assert api["api_code"] == "sale_return_order_page"
            return "https://placeholder.invalid/api"

    monkeypatch.setattr(cli, "SessionLocal", session_factory)
    monkeypatch.setattr(
        cli,
        "get_web_settings",
        lambda: SimpleNamespace(
            credential_encryption_key=key,
            api_config_path=Path("config/api_config.example.yaml"),
        ),
    )
    monkeypatch.setattr(
        cli,
        "load_settings",
        lambda: SimpleNamespace(jijia_rate_limit_utilization=0.9),
    )
    monkeypatch.setattr(
        cli,
        "load_published_api_config",
        lambda _db, api_code: {"api_code": api_code},
    )
    monkeypatch.setattr(cli, "JijiaAuthClient", FakeAuthClient)
    monkeypatch.setattr(
        cli,
        "import_module",
        lambda name: (
            SimpleNamespace(JijiaApiClient=FakeApiClient) if name == "app.api_client" else None
        ),
    )
    monkeypatch.setattr(
        cli,
        "discover_earliest_date",
        lambda *_args, **_kwargs: {
            "complete": True,
            "earliest_data_date": "2020-02-20",
        },
    )

    result = cli.discover_sale_return_start(
        account_id,
        date(2020, 1, 1),
        date(2026, 8, 26),
        30,
    )

    credentials = captured["credentials"]
    assert credentials.app_id == "selected-app-id"
    assert credentials.app_key == "selected-app-key"
    assert result == {
        "account_id": account_id,
        "complete": True,
        "earliest_data_date": "2020-02-20",
    }
    engine.dispose()


def test_discovery_cli_requires_explicit_read_only_confirmation() -> None:
    with pytest.raises(SystemExit) as error:
        cli.main(
            [
                "discover-sale-return-start",
                "--account-id",
                "1",
                "--start-date",
                "2020-01-01",
                "--end-date",
                "2026-08-26",
            ]
        )
    assert error.value.code == 2


def test_discovery_cli_requires_explicit_save_option_for_checkpoint(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    captured: dict[str, object] = {}

    def fake_discovery(*args, **kwargs):
        captured["save_backfill_start"] = kwargs["save_backfill_start"]
        return {"complete": True, "earliest_data_date": "2020-02-20"}

    monkeypatch.setattr(cli, "discover_sale_return_start", fake_discovery)

    cli.main(
        [
            "discover-sale-return-start",
            "--account-id",
            "1",
            "--start-date",
            "2020-01-01",
            "--end-date",
            "2026-08-26",
            "--confirm-read-only-api",
            "--save-backfill-start",
        ]
    )

    assert captured["save_backfill_start"] is True
    assert '"earliest_data_date":"2020-02-20"' in capsys.readouterr().out


def _checkpoint_test_database(
    monkeypatch: pytest.MonkeyPatch,
) -> tuple[Engine, sessionmaker[Session], int]:
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    sync_records_metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)
    with session_factory() as db:
        account = JijiaAccount(
            account_code="acct_discovery_checkpoint",
            name="发现起点测试账号",
            masked_app_id="•••• test",
            encrypted_app_id="synthetic",
            encrypted_app_key="synthetic",
            credential_source=CredentialSource.ENCRYPTED,
            status=JijiaAccountStatus.ACTIVE,
        )
        db.add(account)
        db.commit()
        account_id = account.id
    monkeypatch.setattr(cli, "SessionLocal", session_factory)
    return engine, session_factory, account_id


def test_save_discovered_backfill_start_creates_idempotent_checkpoint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engine, session_factory, account_id = _checkpoint_test_database(monkeypatch)
    discovery = {"complete": True, "earliest_data_date": "2020-02-20"}

    created = cli._save_discovered_backfill_start(
        account_id,
        discovery,
        date(2020, 1, 1),
        date(2026, 8, 26),
    )
    unchanged = cli._save_discovered_backfill_start(
        account_id,
        discovery,
        date(2020, 1, 1),
        date(2026, 8, 26),
    )

    assert created == {
        "backfill_start_saved": True,
        "backfill_start_status": "created",
    }
    assert unchanged == {
        "backfill_start_saved": False,
        "backfill_start_status": "unchanged",
    }
    with session_factory() as db:
        checkpoint = db.execute(select(sync_checkpoint_table.c.checkpoint_value)).scalar_one()
        assert checkpoint["next_window_start"] == "2020-02-20"
        assert checkpoint["absolute_lower_bound"] == "2020-02-20"
        assert checkpoint["start_source"] == "earliest_date_discovery"
    engine.dispose()


def test_save_discovered_backfill_start_does_not_write_without_data(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        cli,
        "SessionLocal",
        lambda: pytest.fail("无数据结果不应打开数据库会话"),
    )

    result = cli._save_discovered_backfill_start(
        1,
        {"complete": True, "earliest_data_date": None},
        date(2020, 1, 1),
        date(2026, 8, 26),
    )

    assert result == {
        "backfill_start_saved": False,
        "backfill_start_status": "no_data",
    }


def test_save_discovered_backfill_start_never_rewinds_progress(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engine, session_factory, account_id = _checkpoint_test_database(monkeypatch)
    original = {
        "next_window_start": "2020-03-01",
        "absolute_lower_bound": "2020-01-01",
        "window_end": "2020-02-29",
        "frozen_window_end": "2026-08-25",
        "backfill_started_at": "2026-08-26T08:00:00Z",
    }
    with session_factory() as db:
        db.execute(
            insert(sync_checkpoint_table).values(
                jijia_account_id=account_id,
                api_code="sale_return_order_page",
                checkpoint_kind="history_backfill",
                checkpoint_value=original,
                last_sync_batch_no="synthetic-batch",
                created_at=datetime(2026, 8, 26, 8, 0, 0),
                updated_at=datetime(2026, 8, 26, 8, 0, 0),
            )
        )
        db.commit()

    with pytest.raises(ApiError) as error:
        cli._save_discovered_backfill_start(
            account_id,
            {"complete": True, "earliest_data_date": "2020-02-20"},
            date(2020, 1, 1),
            date(2026, 8, 26),
        )

    assert error.value.code == "BACKFILL_CHECKPOINT_ALREADY_STARTED"
    with session_factory() as db:
        checkpoint = db.execute(select(sync_checkpoint_table.c.checkpoint_value)).scalar_one()
        assert checkpoint == original
    engine.dispose()
