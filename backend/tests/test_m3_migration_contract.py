import re
from datetime import date, datetime
from pathlib import Path

import pytest
from sqlalchemy import UniqueConstraint, create_engine, insert
from sqlalchemy.dialects import mysql
from sqlalchemy.exc import IntegrityError

from app.api_rate_limiter import api_rate_limit_state_table
from backend.app.models.sync_records import (
    api_config_table,
    failed_request_log_table,
    raw_api_data_history_table,
    raw_api_data_table,
    sync_api_log_table,
    sync_batch_table,
    sync_checkpoint_table,
    sync_records_metadata,
)
from backend.app.services import migration_0003_service

ROOT = Path(__file__).resolve().parents[2]


def test_init_sql_has_account_scoped_snapshot_and_history_contract() -> None:
    sql = (ROOT / "sql" / "init_tables.sql").read_text(encoding="utf-8")
    assert "jijia_account_id INT NOT NULL DEFAULT 0" in sql
    assert "record_identity CHAR(64) NOT NULL" in sql
    assert "UNIQUE KEY uk_raw_account_api_identity" in sql
    assert "KEY idx_raw_account_api_hash" in sql
    assert "CREATE TABLE IF NOT EXISTS raw_api_data_history" in sql
    assert "uk_raw_history_version" in sql
    assert "checkpoint_kind VARCHAR(32) NOT NULL DEFAULT 'date_window'" in sql
    assert "checkpoint_value JSON NULL" in sql
    assert "uk_sync_checkpoint_scope" in sql
    assert "UNIQUE KEY uk_sync_batch_job" in sql
    assert "platform_enabled TINYINT(1) NOT NULL DEFAULT 0" in sql
    assert "config_version INT NOT NULL DEFAULT 1" in sql
    assert "config_hash CHAR(64) NOT NULL" in sql
    assert "read_only_verified TINYINT(1) NOT NULL DEFAULT 0" in sql


def test_api_config_metadata_matches_runtime_registry_contract() -> None:
    columns = set(api_config_table.c.keys())
    assert {
        "platform_enabled",
        "config_version",
        "config_hash",
        "read_only_verified",
        "official_doc_id",
        "classification",
        "execution_stage",
        "published_at",
    }.issubset(columns)


def test_api_rate_limit_state_migration_is_small_and_reversible() -> None:
    migration_dir = ROOT / "sql" / "migrations"
    upgrade_sql = (migration_dir / "0008_api_rate_limit_state.sql").read_text(encoding="utf-8")
    rollback_sql = (migration_dir / "0008_api_rate_limit_state_down.sql").read_text(
        encoding="utf-8"
    )

    assert "CREATE TABLE IF NOT EXISTS api_rate_limit_state" in upgrade_sql
    assert "rate_limit_key VARCHAR(600) NOT NULL" in upgrade_sql
    assert "next_allowed_at DATETIME(6) NOT NULL" in upgrade_sql
    assert "PRIMARY KEY (rate_limit_key)" in upgrade_sql
    assert "DROP TABLE api_rate_limit_state" in rollback_sql
    assert set(api_rate_limit_state_table.c.keys()) == {
        "rate_limit_key",
        "next_allowed_at",
        "created_at",
        "updated_at",
    }


def test_upgrade_sql_is_manual_and_requires_snapshot_rollback() -> None:
    sql = (ROOT / "sql" / "migrations" / "0003_sync_scope_and_history.sql").read_text(
        encoding="utf-8"
    )
    assert sql.startswith("SET SESSION time_zone = '+00:00';")
    assert "0003_sync_scope_and_history_preflight.sql" in sql
    assert "同一迁移会话持有 jijia_polardb_sync_task named lock" in sql
    assert "HAVING COUNT(*) > 1" not in sql
    assert "DROP INDEX idx_raw_api_data_date" in sql
    assert "DROP INDEX uk_sync_checkpoint_api_code" in sql
    assert "DROP INDEX idx_sync_batch_status_started_at" in sql
    assert "DROP INDEX idx_sync_api_log_api_status" in sql
    assert "DROP INDEX idx_failed_request_api_created_at" in sql
    assert "UPDATE raw_api_data" in sql
    assert "SHA2(" in sql
    assert "MODIFY first_observed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP" in sql
    assert "MODIFY last_observed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP" in sql
    assert "JSON_VALID(checkpoint_value)" in sql
    assert "checkpoint_kind = 'date_window'" in sql
    assert "UNIQUE KEY uk_raw_account_api_identity" in sql
    assert "UNIQUE KEY uk_raw_history_version" in sql
    assert "回滚策略：禁止执行破坏性 DDL down" in sql
    assert "DROP COLUMN jijia_account_id" not in sql
    assert "raw_api_data_history 数据" in sql


def test_raw_query_index_migration_is_reversible_and_data_preserving() -> None:
    migration_dir = ROOT / "sql" / "migrations"
    upgrade_sql = (migration_dir / "0005_raw_query_indexes.sql").read_text(encoding="utf-8")
    rollback_sql = (migration_dir / "0005_raw_query_indexes_down.sql").read_text(encoding="utf-8")
    index_names = {
        "idx_raw_created",
        "idx_raw_account_api_created",
        "idx_raw_last_observed",
        "idx_raw_account_last_observed",
    }

    assert "ALGORITHM=INPLACE" in upgrade_sql
    assert "LOCK=NONE" in upgrade_sql
    assert "ALGORITHM=INPLACE" in rollback_sql
    assert "LOCK=NONE" in rollback_sql
    for index_name in index_names:
        assert f"ADD KEY {index_name}" in upgrade_sql
        assert f"DROP INDEX {index_name}" in rollback_sql
    for sql in (upgrade_sql, rollback_sql):
        upper_sql = sql.upper()
        assert "INSERT INTO" not in upper_sql
        assert "UPDATE " not in upper_sql
        assert "DELETE FROM" not in upper_sql


def test_each_legacy_update_preserves_updated_at() -> None:
    statements = migration_0003_service.load_migration_statements()
    normalized_statements = [
        " ".join(re.sub(r"^\s*--[^\n]*(?:\n|$)", "", statement, flags=re.MULTILINE).upper().split())
        for statement in statements
    ]
    updates = [statement for statement in normalized_statements if statement.startswith("UPDATE ")]

    assert len(updates) == 6
    assert all("UPDATED_AT = UPDATED_AT" in statement for statement in updates)


def test_upgrade_preflight_is_read_only_and_checks_projected_identity() -> None:
    sql = (ROOT / "sql" / "migrations" / "0003_sync_scope_and_history_preflight.sql").read_text(
        encoding="utf-8"
    )
    upper_sql = sql.upper()
    assert "SELECT" in upper_sql
    assert "SHA2(" in upper_sql
    assert "HAVING COUNT(*) > 1" in upper_sql
    for mutating_statement in (
        "ALTER TABLE",
        "CREATE TABLE",
        "DROP TABLE",
        "INSERT INTO",
        "UPDATE ",
        "DELETE FROM",
    ):
        assert mutating_statement not in upper_sql


def test_alembic_online_connections_apply_utc_contract() -> None:
    source = (ROOT / "backend" / "migrations" / "env.py").read_text(encoding="utf-8")
    assert "set_connection_session_utc(external_connection)" in source
    assert "configure_engine_session_timezone(connectable)" in source
    assert "load_migration_settings().database_url" in source


def test_alembic_0003_declares_worker_and_audit_fields() -> None:
    source = (
        ROOT / "backend" / "migrations" / "versions" / "0003_sync_job_and_audit.py"
    ).read_text(encoding="utf-8")
    for field in (
        '"trigger_type"',
        '"worker_id"',
        '"attempt_count"',
        '"max_attempts"',
        '"heartbeat_at"',
        '"sync_batch_no"',
        '"error_code"',
        '"queued_at"',
        '"progress_json"',
        '"resource_type"',
        '"resource_id"',
        '"result"',
        '"changes_json"',
    ):
        assert field in source
    assert 'sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="2")' in source


def _metadata_named_index_specs(table) -> dict[str, tuple[int, tuple[str, ...]]]:
    specs = {
        "PRIMARY": (0, tuple(column.name for column in table.primary_key.columns)),
    }
    specs.update(
        {
            constraint.name: (0, tuple(column.name for column in constraint.columns))
            for constraint in table.constraints
            if isinstance(constraint, UniqueConstraint) and constraint.name
        }
    )
    specs.update(
        {
            index.name: (
                0 if index.unique else 1,
                tuple(column.name for column in index.columns),
            )
            for index in table.indexes
            if index.name
        }
    )
    return specs


def _sql_named_index_specs(
    sql: str,
    table_name: str,
) -> dict[str, tuple[int, tuple[str, ...]]]:
    table_match = re.search(
        rf"CREATE TABLE IF NOT EXISTS {table_name} \((.*?)\)\s*ENGINE=",
        sql,
        flags=re.DOTALL,
    )
    assert table_match is not None
    specs: dict[str, tuple[int, tuple[str, ...]]] = {}
    pattern = re.compile(
        r"^\s*(PRIMARY KEY|UNIQUE KEY\s+(\w+)|KEY\s+(\w+))\s*\(([^)]+)\)",
        flags=re.MULTILINE,
    )
    for match in pattern.finditer(table_match.group(1)):
        declaration = match.group(1)
        index_name = (
            "PRIMARY" if declaration == "PRIMARY KEY" else (match.group(2) or match.group(3))
        )
        columns = tuple(part.strip().strip("`") for part in match.group(4).split(","))
        specs[index_name] = (
            0 if declaration == "PRIMARY KEY" or declaration.startswith("UNIQUE KEY") else 1,
            columns,
        )
    return specs


def test_core_metadata_matches_full_sql_and_postflight_index_contract() -> None:
    sql = (ROOT / "sql" / "init_tables.sql").read_text(encoding="utf-8")
    tables = (
        sync_batch_table,
        sync_api_log_table,
        raw_api_data_table,
        raw_api_data_history_table,
        sync_checkpoint_table,
        failed_request_log_table,
    )

    for table in tables:
        metadata_specs = _metadata_named_index_specs(table)
        sql_specs = _sql_named_index_specs(sql, table.name)
        target_specs = {
            index_name: spec
            for (table_name, index_name), spec in migration_0003_service.CURRENT_INDEX_SPECS.items()
            if table_name == table.name
        }
        assert metadata_specs == sql_specs
        assert metadata_specs == target_specs


def test_core_metadata_uses_mysql_unsigned_bigints() -> None:
    dialect = mysql.dialect()
    tables = (
        sync_batch_table,
        sync_api_log_table,
        raw_api_data_table,
        raw_api_data_history_table,
        sync_checkpoint_table,
        failed_request_log_table,
    )

    for table in tables:
        assert str(table.c.id.type.compile(dialect=dialect)).upper() == "BIGINT UNSIGNED"
    assert (
        str(raw_api_data_table.c.observation_count.type.compile(dialect=dialect)).upper()
        == "BIGINT UNSIGNED"
    )


def _raw_values(account_id: int) -> dict[str, object]:
    now = datetime(2026, 8, 26, 8, 0, 0)
    return {
        "jijia_account_id": account_id,
        "api_code": "sale_return_order_page",
        "source_primary_key": "R-1",
        "record_identity": "identity-1",
        "data_hash": "hash-1",
        "raw_json": {"id": "R-1"},
        "data_date": date(2020, 1, 1),
        "sync_batch_no": f"batch-{account_id}",
        "first_observed_at": now,
        "last_observed_at": now,
        "observation_count": 1,
        "created_at": now,
        "updated_at": now,
    }


def _history_values(account_id: int) -> dict[str, object]:
    now = datetime(2026, 8, 26, 8, 0, 0)
    return {
        "jijia_account_id": account_id,
        "api_code": "sale_return_order_page",
        "record_identity": "identity-1",
        "source_primary_key": "R-1",
        "data_hash": "hash-1",
        "raw_json": {"id": "R-1"},
        "data_date": date(2020, 1, 1),
        "sync_batch_no": f"batch-{account_id}",
        "observed_at": now,
        "created_at": now,
        "updated_at": now,
    }


def _checkpoint_values(account_id: int) -> dict[str, object]:
    now = datetime(2026, 8, 26, 8, 0, 0)
    return {
        "jijia_account_id": account_id,
        "api_code": "sale_return_order_page",
        "checkpoint_kind": "history_backfill",
        "checkpoint_value": {"next_window_start": "2020-02-01"},
        "created_at": now,
        "updated_at": now,
    }


@pytest.mark.parametrize(
    ("table", "values_factory"),
    [
        (raw_api_data_table, _raw_values),
        (raw_api_data_history_table, _history_values),
        (sync_checkpoint_table, _checkpoint_values),
    ],
)
def test_core_metadata_allows_cross_account_identity_but_rejects_same_account_duplicate(
    table,
    values_factory,
) -> None:
    engine = create_engine("sqlite+pysqlite://")
    sync_records_metadata.create_all(engine)

    with engine.begin() as connection:
        connection.execute(
            insert(table),
            [values_factory(1), values_factory(2)],
        )

    with pytest.raises(IntegrityError), engine.begin() as connection:
        connection.execute(insert(table).values(**values_factory(1)))
