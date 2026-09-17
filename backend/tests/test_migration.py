from importlib import import_module
from pathlib import Path
from types import SimpleNamespace
from typing import cast
from unittest.mock import MagicMock

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Connection

from backend.migrations.compat import supports_named_check_constraints

SYNC_JOB_CONTROL_COLUMNS = {
    "task_no",
    "task_start",
    "task_end",
    "range_mode",
    "window_index",
    "total_windows",
    "advance_checkpoint",
    "stop_after_current",
    "pause_requested_at",
    "paused_at",
}
SYNC_JOB_RESOLUTION_COLUMNS = {"resolution_code", "resolved_at"}


def _run_migration_action(
    monkeypatch: pytest.MonkeyPatch,
    revision: str,
    action: str,
    server_version: tuple[int, ...],
) -> tuple[MagicMock, MagicMock]:
    """运行真实迁移函数并记录 Alembic 操作。"""
    connection = SimpleNamespace(
        dialect=SimpleNamespace(name="mysql", server_version_info=server_version),
        execute=MagicMock(
            return_value=SimpleNamespace(scalar_one_or_none=lambda: None),
        ),
    )
    batch_operation = MagicMock()
    operation = MagicMock()
    operation.get_bind.return_value = connection
    operation.batch_alter_table.return_value.__enter__.return_value = batch_operation

    migration = import_module(f"backend.migrations.versions.{revision}")
    monkeypatch.setattr(migration, "op", operation)
    getattr(migration, action)()
    return operation, batch_operation


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
    """按数据库类型和版本判断命名 CHECK 约束支持情况。"""
    connection = cast(
        Connection,
        SimpleNamespace(
            dialect=SimpleNamespace(
                name=dialect_name,
                server_version_info=server_version,
            )
        ),
    )
    assert supports_named_check_constraints(connection) is expected


@pytest.mark.parametrize(
    ("server_version", "expected_constraint_changes"),
    [
        ((8, 0, 13), 0),
        ((8, 0, 16), 2),
    ],
)
@pytest.mark.parametrize("action", ["upgrade", "downgrade"])
def test_0004_runs_without_unsupported_check_operations(
    monkeypatch: pytest.MonkeyPatch,
    server_version: tuple[int, ...],
    expected_constraint_changes: int,
    action: str,
) -> None:
    """0004 在旧 MySQL 跳过约束操作，在支持版本保留约束变更。"""
    operation, batch_operation = _run_migration_action(
        monkeypatch,
        "0004_sync_job_cancelled",
        action,
        server_version,
    )

    assert batch_operation.drop_constraint.call_count == expected_constraint_changes // 2
    assert batch_operation.create_check_constraint.call_count == (expected_constraint_changes // 2)
    if server_version < (8, 0, 16):
        operation.batch_alter_table.assert_not_called()
    else:
        operation.batch_alter_table.assert_called_once_with("sync_job")


@pytest.mark.parametrize(
    ("server_version", "expected_constraint_changes"),
    [
        ((8, 0, 13), 0),
        ((8, 0, 16), 2),
    ],
)
def test_0005_preserves_schema_changes_without_unsupported_checks(
    monkeypatch: pytest.MonkeyPatch,
    server_version: tuple[int, ...],
    expected_constraint_changes: int,
) -> None:
    """0005 无论是否支持 CHECK，都完整升级和降级控制字段及索引。"""
    upgrade_operation, upgrade_batch = _run_migration_action(
        monkeypatch,
        "0005_sync_job_control",
        "upgrade",
        server_version,
    )

    added_columns = {call.args[0].name for call in upgrade_batch.add_column.call_args_list}
    assert added_columns == SYNC_JOB_CONTROL_COLUMNS
    upgrade_operation.create_index.assert_called_once_with(
        "idx_sync_job_task_no",
        "sync_job",
        ["task_no", "id"],
    )
    assert upgrade_batch.drop_constraint.call_count == expected_constraint_changes // 2
    assert upgrade_batch.create_check_constraint.call_count == (expected_constraint_changes // 2)

    downgrade_operation, downgrade_batch = _run_migration_action(
        monkeypatch,
        "0005_sync_job_control",
        "downgrade",
        server_version,
    )
    dropped_columns = {call.args[0] for call in downgrade_batch.drop_column.call_args_list}
    assert dropped_columns == SYNC_JOB_CONTROL_COLUMNS
    downgrade_operation.drop_index.assert_called_once_with(
        "idx_sync_job_task_no",
        table_name="sync_job",
    )
    assert downgrade_batch.drop_constraint.call_count == expected_constraint_changes // 2
    assert downgrade_batch.create_check_constraint.call_count == (expected_constraint_changes // 2)


def test_alembic_revision_ids_fit_version_table_column() -> None:
    """所有迁移版本号必须能写入 Alembic 版本列。"""
    config = Config("backend/alembic.ini")
    revisions = ScriptDirectory.from_config(config).walk_revisions()

    assert {revision.revision for revision in revisions if len(revision.revision) > 32} == set()


def test_0010_adds_and_removes_resolution_columns(monkeypatch: pytest.MonkeyPatch) -> None:
    """0010 只增加可空解决状态字段，并提供对应回滚。"""
    _, upgrade_batch = _run_migration_action(
        monkeypatch,
        "0010_sync_job_resolution",
        "upgrade",
        (8, 0, 36),
    )
    assert {call.args[0].name for call in upgrade_batch.add_column.call_args_list} == (
        SYNC_JOB_RESOLUTION_COLUMNS
    )

    _, downgrade_batch = _run_migration_action(
        monkeypatch,
        "0010_sync_job_resolution",
        "downgrade",
        (8, 0, 36),
    )
    assert {call.args[0] for call in downgrade_batch.drop_column.call_args_list} == (
        SYNC_JOB_RESOLUTION_COLUMNS
    )


def test_identity_and_account_migrations_on_empty_database(tmp_path: Path) -> None:
    """空库可以完成身份域迁移并保留同步域表。"""
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
        "resolution_code",
        "resolved_at",
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
    """0004 允许取消状态，并在已有取消任务时阻止降级。"""
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
