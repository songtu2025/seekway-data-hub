from pathlib import Path
from types import SimpleNamespace

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

from backend.migrations.compat import supports_named_check_constraints


@pytest.mark.parametrize(
    ("dialect_name", "server_version", "expected"),
    [
        ("mysql", (8, 0, 13), False),
        ("mysql", (8, 0, 16), True),
        ("sqlite", (3, 40, 0), True),
    ],
)
def test_sync_job_check_constraint_compatibility(
    dialect_name: str,
    server_version: tuple[int, ...],
    expected: bool,
) -> None:
    connection = SimpleNamespace(
        dialect=SimpleNamespace(
            name=dialect_name,
            server_version_info=server_version,
        )
    )
    assert supports_named_check_constraints(connection) is expected


def test_alembic_revision_ids_fit_version_table_column() -> None:
    config = Config("backend/alembic.ini")
    revisions = ScriptDirectory.from_config(config).walk_revisions()

    assert {revision.revision for revision in revisions if len(revision.revision) > 32} == set()


def test_identity_and_account_migrations_on_empty_database(tmp_path: Path) -> None:
    database_path = tmp_path / "identity.db"
    engine = create_engine(f"sqlite:///{database_path.as_posix()}")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE sync_batch (id INTEGER PRIMARY KEY)"))

    config = Config("backend/alembic.ini")
    config.set_main_option("sqlalchemy.url", f"sqlite:///{database_path.as_posix()}")

    command.upgrade(config, "head")
    inspector = inspect(engine)
    assert {
        "app_user",
        "auth_action_token",
        "user_session",
        "jijia_account",
        "account_api_policy",
        "sync_job",
        "audit_log",
    }.issubset(inspector.get_table_names())
    assert {column["name"] for column in inspector.get_columns("user_session")} >= {
        "session_hash",
        "csrf_hash",
        "expires_at",
        "idle_expires_at",
    }
    assert {column["name"] for column in inspector.get_columns("jijia_account")} >= {
        "masked_app_id",
        "encrypted_app_id",
        "encrypted_app_key",
        "status",
    }
    account_columns = {column["name"]: column for column in inspector.get_columns("jijia_account")}
    assert account_columns["created_by"]["nullable"] is True
    assert account_columns["updated_by"]["nullable"] is True
    policy_uniques = inspector.get_unique_constraints("account_api_policy")
    assert any(
        set(unique["column_names"]) == {"jijia_account_id", "api_code"} for unique in policy_uniques
    )
    job_columns = {column["name"] for column in inspector.get_columns("sync_job")}
    assert {
        "trigger_type",
        "worker_id",
        "attempt_count",
        "max_attempts",
        "heartbeat_at",
        "sync_batch_no",
        "error_code",
        "queued_at",
        "progress_json",
        "market_ids_json",
        "api_config_version",
        "api_config_hash",
        "api_config_snapshot_json",
    }.issubset(job_columns)
    audit_columns = {column["name"] for column in inspector.get_columns("audit_log")}
    assert {"resource_type", "resource_id", "result", "changes_json"}.issubset(audit_columns)

    with engine.begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO jijia_account (
                    account_code, name, masked_app_id, credential_source, status
                ) VALUES (
                    'acct_migration_test', '迁移测试账号', '•••• test',
                    'environment_legacy', 'inactive'
                )
                """
            )
        )
        account_id = connection.execute(
            text("SELECT id FROM jijia_account WHERE account_code = 'acct_migration_test'")
        ).scalar_one()
        connection.execute(
            text(
                """
                INSERT INTO sync_job (
                    job_no, jijia_account_id, job_type, trigger_type, status
                ) VALUES (
                    'job_migration_test', :account_id, 'sync', 'manual', 'success'
                )
                """
            ),
            {"account_id": account_id},
        )
        connection.execute(
            text(
                """
                INSERT INTO audit_log (
                    jijia_account_id, action, resource_type, result
                ) VALUES (
                    :account_id, 'migration.test', 'sync_job', 'success'
                )
                """
            ),
            {"account_id": account_id},
        )

    with pytest.raises(RuntimeError, match="0003 downgrade is not supported"):
        command.downgrade(config, "base")

    remaining_tables = inspect(engine).get_table_names()
    assert {"app_user", "sync_job", "audit_log", "sync_batch"}.issubset(remaining_tables)
    with engine.connect() as connection:
        assert connection.execute(text("SELECT COUNT(*) FROM sync_job")).scalar_one() == 1
        assert connection.execute(text("SELECT COUNT(*) FROM audit_log")).scalar_one() == 1
    engine.dispose()


def test_0004_allows_cancelled_and_blocks_unsafe_downgrade(tmp_path: Path) -> None:
    database_path = tmp_path / "cancelled.db"
    engine = create_engine(f"sqlite:///{database_path.as_posix()}")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE sync_batch (id INTEGER PRIMARY KEY)"))

    config = Config("backend/alembic.ini")
    config.set_main_option("sqlalchemy.url", f"sqlite:///{database_path.as_posix()}")
    command.upgrade(config, "head")

    with engine.begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO jijia_account (
                    account_code, name, masked_app_id, credential_source, status
                ) VALUES (
                    'acct_cancel_test', '取消迁移测试账号', '•••• test',
                    'environment_legacy', 'inactive'
                )
                """
            )
        )
        account_id = connection.execute(
            text("SELECT id FROM jijia_account WHERE account_code = 'acct_cancel_test'")
        ).scalar_one()
        connection.execute(
            text(
                """
                INSERT INTO sync_job (
                    job_no, jijia_account_id, job_type, trigger_type, status
                ) VALUES (
                    'job_cancel_test', :account_id, 'sync', 'manual', 'cancelled'
                )
                """
            ),
            {"account_id": account_id},
        )

    with pytest.raises(RuntimeError, match="cancelled sync jobs exist"):
        command.downgrade(config, "0003_sync_job_and_audit")

    with engine.connect() as connection:
        assert (
            connection.execute(
                text("SELECT status FROM sync_job WHERE job_no = 'job_cancel_test'")
            ).scalar_one()
            == "cancelled"
        )
    engine.dispose()
