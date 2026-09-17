import importlib
from typing import Any

import pytest

from app.api_rate_limiter import api_rate_limit_state_table
from backend.app.models.sync_records import (
    api_config_table,
    raw_api_data_stat_table,
    sale_return_order_table,
)
from backend.app.services.migration_0003_service import (
    TARGET_COLUMN_EXTRA_FRAGMENTS,
    TARGET_COLUMN_SPECS,
    TARGET_INDEX_SPECS,
)
from backend.app.services.runtime_target_verifier import (
    API_RATE_LIMIT_REQUIRED_COLUMNS,
    API_RATE_LIMIT_REQUIRED_INDEXES,
    EXPECTED_ALEMBIC_HEAD,
    RAW_DATA_STAT_REQUIRED_COLUMNS,
    RAW_DATA_STAT_REQUIRED_INDEXES,
    SALE_RETURN_REQUIRED_COLUMNS,
    verify_runtime_target,
)

TARGET_TABLES = sorted({table_name for table_name, _column_name in TARGET_COLUMN_SPECS})
RUNTIME_TABLES = {
    api_config_table.name: api_config_table,
    api_rate_limit_state_table.name: api_rate_limit_state_table,
    raw_api_data_stat_table.name: raw_api_data_stat_table,
    sale_return_order_table.name: sale_return_order_table,
}
RUNTIME_INDEX_SPECS = {
    api_config_table.name: {
        "PRIMARY": (0, ("id",)),
        "uk_api_config_api_code": (0, ("api_code",)),
        "idx_api_config_enabled": (
            1,
            ("enabled", "platform_enabled", "read_only_verified"),
        ),
    },
    api_rate_limit_state_table.name: {
        "PRIMARY": (0, ("rate_limit_key",)),
    },
    raw_api_data_stat_table.name: {
        "PRIMARY": (0, ("jijia_account_id", "api_code")),
    },
    sale_return_order_table.name: {
        "PRIMARY": (0, ("id",)),
        "uk_sale_return_account_source": (
            0,
            ("jijia_account_id", "source_primary_key"),
        ),
        "uk_sale_return_raw_data": (0, ("raw_data_id",)),
        "idx_sale_return_account_date": (
            1,
            ("jijia_account_id", "return_date_time", "id"),
        ),
        "idx_sale_return_account_status_date": (
            1,
            ("jijia_account_id", "status", "return_date_time"),
        ),
        "idx_sale_return_account_order": (1, ("jijia_account_id", "order_id")),
        "idx_sale_return_account_sku": (1, ("jijia_account_id", "sku")),
        "idx_sale_return_created": (1, ("created_at", "id")),
    },
}
API_RATE_LIMIT_COLUMN_ROWS = {
    "rate_limit_key": {
        "data_type": "varchar",
        "is_nullable": "NO",
        "character_maximum_length": 600,
        "datetime_precision": None,
        "column_default": None,
        "extra": "",
    },
    "next_allowed_at": {
        "data_type": "datetime",
        "is_nullable": "NO",
        "character_maximum_length": None,
        "datetime_precision": 6,
        "column_default": None,
        "extra": "",
    },
    "created_at": {
        "data_type": "datetime",
        "is_nullable": "NO",
        "character_maximum_length": None,
        "datetime_precision": 6,
        "column_default": "CURRENT_TIMESTAMP(6)",
        "extra": "DEFAULT_GENERATED",
    },
    "updated_at": {
        "data_type": "datetime",
        "is_nullable": "NO",
        "character_maximum_length": None,
        "datetime_precision": 6,
        "column_default": "CURRENT_TIMESTAMP(6)",
        "extra": "DEFAULT_GENERATED on update CURRENT_TIMESTAMP(6)",
    },
}


def test_expected_alembic_head_matches_migration_and_storage_limit() -> None:
    migration = importlib.import_module("backend.migrations.versions.0010_sync_job_resolution")

    assert EXPECTED_ALEMBIC_HEAD == migration.revision
    assert len(EXPECTED_ALEMBIC_HEAD) <= 32


class FakeResult:
    def __init__(
        self,
        *,
        rows: list[dict[str, Any]] | None = None,
        scalar: Any = None,
        scalar_values: list[Any] | None = None,
    ) -> None:
        self.rows = rows or []
        self.scalar = scalar
        self.scalar_values = scalar_values or []

    def mappings(self):
        return self

    def __iter__(self):
        return iter(self.rows)

    def scalar_one(self):
        return self.scalar

    def scalar_one_or_none(self):
        return self.scalar

    def scalars(self):
        return self

    def all(self):
        return self.scalar_values


class FakeConnection:
    class Dialect:
        name = "mysql"

    dialect = Dialect()

    def __init__(
        self,
        *,
        read_only: int = 0,
        heads: list[str] | None = None,
        missing_index: tuple[str, str] | None = None,
        signed_column: tuple[str, str] | None = None,
        myisam_table: str | None = None,
        unexpected_column: bool = False,
        unexpected_index: bool = False,
        unexpected_unique_index: bool = False,
        api_config_ready: bool = True,
        api_rate_limit_ready: bool = True,
        projection_ready: bool = True,
        raw_data_stat_ready: bool = True,
        missing_runtime_column: tuple[str, str] | None = None,
        missing_runtime_index: tuple[str, str] | None = None,
        runtime_myisam_table: str | None = None,
        api_rate_limit_column_overrides: dict[str, dict[str, Any]] | None = None,
    ) -> None:
        self.read_only = read_only
        self.heads = heads if heads is not None else [EXPECTED_ALEMBIC_HEAD]
        self.missing_index = missing_index
        self.signed_column = signed_column
        self.myisam_table = myisam_table
        self.unexpected_column = unexpected_column
        self.unexpected_index = unexpected_index
        self.unexpected_unique_index = unexpected_unique_index
        self.api_config_ready = api_config_ready
        self.api_rate_limit_ready = api_rate_limit_ready
        self.projection_ready = projection_ready
        self.raw_data_stat_ready = raw_data_stat_ready
        self.missing_runtime_column = missing_runtime_column
        self.missing_runtime_index = missing_runtime_index
        self.runtime_myisam_table = runtime_myisam_table
        self.api_rate_limit_column_overrides = api_rate_limit_column_overrides or {}
        self.calls: list[str] = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def execute(self, statement, _params=None):
        sql = str(statement)
        self.calls.append(sql)
        if "@@GLOBAL.read_only" in sql:
            return FakeResult(scalar=self.read_only)
        if "FROM alembic_version" in sql:
            return FakeResult(scalar_values=self.heads)
        if "information_schema.columns" in sql:
            runtime_table = self._runtime_table(sql)
            if runtime_table is not None:
                if (
                    runtime_table.name == api_rate_limit_state_table.name
                    and "DATETIME_PRECISION" in sql
                ):
                    rows = []
                    for column_name, spec in API_RATE_LIMIT_COLUMN_ROWS.items():
                        row = {"column_name": column_name, **spec}
                        row.update(self.api_rate_limit_column_overrides.get(column_name, {}))
                        rows.append(row)
                    return FakeResult(rows=rows)
                ready = self._runtime_table_ready(runtime_table.name)
                values = [
                    column.name
                    for column in runtime_table.columns
                    if ready and self.missing_runtime_column != (runtime_table.name, column.name)
                ]
                rows = [
                    {
                        "table_name": runtime_table.name,
                        "column_name": column_name,
                    }
                    for column_name in values
                ]
                return FakeResult(rows=rows, scalar_values=values)
            rows = []
            for key, spec in TARGET_COLUMN_SPECS.items():
                normalized_type, is_nullable, maximum_length, default = spec
                column_type = "bigint" if key == self.signed_column else normalized_type
                rows.append(
                    {
                        "table_name": key[0],
                        "column_name": key[1],
                        "data_type": normalized_type.split()[0],
                        "column_type": column_type,
                        "is_nullable": is_nullable,
                        "character_maximum_length": maximum_length,
                        "column_default": default,
                        "extra": TARGET_COLUMN_EXTRA_FRAGMENTS.get(key, ""),
                    }
                )
            if self.unexpected_column:
                rows.append(
                    {
                        "table_name": "raw_api_data",
                        "column_name": "unexpected_column",
                        "data_type": "varchar",
                        "column_type": "varchar(10)",
                        "is_nullable": "YES",
                        "character_maximum_length": 10,
                        "column_default": None,
                        "extra": "",
                    }
                )
            return FakeResult(rows=rows)
        if "information_schema.statistics" in sql:
            runtime_table = self._runtime_table(sql)
            if runtime_table is not None:
                ready = self._runtime_table_ready(runtime_table.name)
                specs = RUNTIME_INDEX_SPECS[runtime_table.name] if ready else {}
                values = [
                    index_name
                    for index_name in specs
                    if self.missing_runtime_index != (runtime_table.name, index_name)
                ]
                rows = [
                    {
                        "table_name": runtime_table.name,
                        "index_name": index_name,
                        "non_unique": specs[index_name][0],
                        "seq_in_index": position,
                        "column_name": column_name,
                    }
                    for index_name in values
                    for position, column_name in enumerate(specs[index_name][1], start=1)
                ]
                return FakeResult(rows=rows, scalar_values=values)
            rows = []
            for key, (non_unique, columns) in TARGET_INDEX_SPECS.items():
                if key == self.missing_index:
                    continue
                rows.extend(
                    {
                        "table_name": key[0],
                        "index_name": key[1],
                        "non_unique": non_unique,
                        "seq_in_index": position,
                        "column_name": column,
                    }
                    for position, column in enumerate(columns, start=1)
                )
            if self.unexpected_index:
                rows.extend(
                    {
                        "table_name": "raw_api_data",
                        "index_name": "idx_unexpected",
                        "non_unique": 1,
                        "seq_in_index": position,
                        "column_name": column,
                    }
                    for position, column in enumerate(
                        ("api_code", "jijia_account_id"),
                        start=1,
                    )
                )
            if self.unexpected_unique_index:
                rows.append(
                    {
                        "table_name": "raw_api_data",
                        "index_name": "uk_unexpected",
                        "non_unique": 0,
                        "seq_in_index": 1,
                        "column_name": "data_hash",
                    }
                )
            return FakeResult(rows=rows)
        if "information_schema.tables" in sql:
            runtime_table = self._runtime_table(sql)
            if runtime_table is not None:
                ready = self._runtime_table_ready(runtime_table.name)
                engine = (
                    "MyISAM"
                    if ready and self.runtime_myisam_table == runtime_table.name
                    else "InnoDB"
                    if ready
                    else None
                )
                rows = [{"table_name": runtime_table.name, "engine": engine}] if ready else []
                return FakeResult(rows=rows, scalar=engine)
            return FakeResult(
                rows=[
                    {
                        "table_name": table_name,
                        "engine": "MyISAM" if table_name == self.myisam_table else "InnoDB",
                    }
                    for table_name in TARGET_TABLES
                ]
            )
        raise AssertionError(f"unexpected SQL: {sql}")

    def _runtime_table(self, sql: str):
        return next((table for name, table in RUNTIME_TABLES.items() if name in sql), None)

    def _runtime_table_ready(self, table_name: str) -> bool:
        readiness = {
            api_config_table.name: self.api_config_ready,
            api_rate_limit_state_table.name: self.api_rate_limit_ready,
            raw_api_data_stat_table.name: self.raw_data_stat_ready,
            sale_return_order_table.name: self.projection_ready,
        }
        return readiness[table_name]


class FakeEngine:
    def __init__(self, connection: FakeConnection) -> None:
        self.connection = connection

    def connect(self):
        return self.connection


def test_runtime_target_verifier_passes_with_read_only_queries() -> None:
    connection = FakeConnection(heads=["0010_sync_job_resolution"])

    result = verify_runtime_target(FakeEngine(connection))

    assert result.status == "pass"
    assert result.code == "RUNTIME_TARGET_READY"
    assert connection.calls
    assert all(sql.lstrip().upper().startswith("SELECT") for sql in connection.calls)
    assert all("COUNT(" not in sql.upper() for sql in connection.calls)
    column_query = next(sql for sql in connection.calls if "information_schema.columns" in sql)
    assert "TABLE_NAME AS table_name" in column_query
    assert "COLUMN_NAME AS column_name" in column_query
    index_query = next(sql for sql in connection.calls if "information_schema.statistics" in sql)
    assert "INDEX_NAME AS index_name" in index_query
    table_query = next(sql for sql in connection.calls if "information_schema.tables" in sql)
    assert "ENGINE AS engine" in table_query


def test_runtime_target_verifier_blocks_read_only_mysql() -> None:
    connection = FakeConnection(read_only=1)

    result = verify_runtime_target(FakeEngine(connection))

    assert result.status == "blocked"
    assert result.code == "RUNTIME_DATABASE_READ_ONLY"
    assert len(connection.calls) == 1


@pytest.mark.parametrize(
    "heads",
    [
        [],
        ["0002_jijia_account_and_policy"],
        ["0008_sync_job_market_scope"],
        [EXPECTED_ALEMBIC_HEAD, "other_head"],
    ],
)
def test_runtime_target_verifier_requires_one_exact_alembic_head(heads) -> None:
    result = verify_runtime_target(FakeEngine(FakeConnection(heads=heads)))

    assert result.status == "blocked"
    assert result.code == "RUNTIME_ALEMBIC_HEAD_MISMATCH"


def test_runtime_target_verifier_blocks_missing_required_index() -> None:
    result = verify_runtime_target(
        FakeEngine(
            FakeConnection(
                missing_index=("sync_batch", "idx_sync_batch_account_status"),
            )
        )
    )

    assert result.status == "blocked"
    assert result.code == "RUNTIME_CORE_SCHEMA_MISMATCH"


def test_runtime_target_verifier_requires_sale_return_projection() -> None:
    result = verify_runtime_target(FakeEngine(FakeConnection(projection_ready=False)))

    assert result.status == "blocked"
    assert result.code == "RUNTIME_SALE_RETURN_SCHEMA_MISMATCH"


def test_sale_return_contract_covers_every_runtime_model_column() -> None:
    assert SALE_RETURN_REQUIRED_COLUMNS == frozenset(sale_return_order_table.c.keys())


def test_runtime_target_verifier_requires_sale_return_created_index() -> None:
    result = verify_runtime_target(
        FakeEngine(
            FakeConnection(
                missing_runtime_index=(sale_return_order_table.name, "idx_sale_return_created")
            )
        )
    )

    assert result.status == "blocked"
    assert result.code == "RUNTIME_SALE_RETURN_SCHEMA_MISMATCH"


def test_runtime_target_verifier_blocks_missing_sale_return_runtime_column() -> None:
    result = verify_runtime_target(
        FakeEngine(
            FakeConnection(missing_runtime_column=(sale_return_order_table.name, "market_id"))
        )
    )

    assert result.status == "blocked"
    assert result.code == "RUNTIME_SALE_RETURN_SCHEMA_MISMATCH"


def test_raw_data_stat_contract_covers_runtime_model_and_primary_key() -> None:
    assert RAW_DATA_STAT_REQUIRED_COLUMNS == frozenset(raw_api_data_stat_table.c.keys())
    assert RAW_DATA_STAT_REQUIRED_INDEXES == frozenset({"PRIMARY"})


def test_api_rate_limit_contract_covers_runtime_model_and_primary_key() -> None:
    assert API_RATE_LIMIT_REQUIRED_COLUMNS == frozenset(api_rate_limit_state_table.c.keys())
    assert API_RATE_LIMIT_REQUIRED_INDEXES == frozenset({"PRIMARY"})


def test_runtime_target_verifier_requires_api_rate_limit_schema() -> None:
    result = verify_runtime_target(FakeEngine(FakeConnection(api_rate_limit_ready=False)))

    assert result.status == "blocked"
    assert result.code == "RUNTIME_API_RATE_LIMIT_SCHEMA_MISMATCH"


@pytest.mark.parametrize(
    ("column_name", "overrides"),
    [
        ("rate_limit_key", {"data_type": "text"}),
        ("rate_limit_key", {"character_maximum_length": 599}),
        ("rate_limit_key", {"is_nullable": "YES"}),
        ("next_allowed_at", {"data_type": "timestamp"}),
        ("created_at", {"datetime_precision": 0}),
        ("updated_at", {"is_nullable": "YES"}),
        ("created_at", {"column_default": None}),
        ("updated_at", {"column_default": None}),
        ("updated_at", {"extra": "DEFAULT_GENERATED"}),
    ],
)
def test_runtime_target_verifier_rejects_api_rate_limit_column_drift(
    column_name: str,
    overrides: dict[str, Any],
) -> None:
    result = verify_runtime_target(
        FakeEngine(FakeConnection(api_rate_limit_column_overrides={column_name: overrides}))
    )

    assert result.status == "blocked"
    assert result.code == "RUNTIME_API_RATE_LIMIT_SCHEMA_MISMATCH"


def test_runtime_target_verifier_accepts_mysql_timestamp_metadata_variants() -> None:
    result = verify_runtime_target(
        FakeEngine(
            FakeConnection(
                api_rate_limit_column_overrides={
                    "created_at": {"column_default": "current_timestamp(6)"},
                    "updated_at": {
                        "column_default": "current_timestamp(6)",
                        "extra": "on update current_timestamp(6)",
                    },
                }
            )
        )
    )

    assert result.status == "pass"


def test_runtime_target_verifier_requires_raw_data_stat_schema() -> None:
    result = verify_runtime_target(FakeEngine(FakeConnection(raw_data_stat_ready=False)))

    assert result.status == "blocked"
    assert result.code == "RUNTIME_RAW_DATA_STAT_SCHEMA_MISMATCH"


def test_runtime_target_verifier_requires_raw_data_stat_primary_key() -> None:
    result = verify_runtime_target(
        FakeEngine(FakeConnection(missing_runtime_index=(raw_api_data_stat_table.name, "PRIMARY")))
    )

    assert result.status == "blocked"
    assert result.code == "RUNTIME_RAW_DATA_STAT_SCHEMA_MISMATCH"


def test_runtime_target_verifier_requires_raw_data_stat_record_count() -> None:
    result = verify_runtime_target(
        FakeEngine(
            FakeConnection(missing_runtime_column=(raw_api_data_stat_table.name, "record_count"))
        )
    )

    assert result.status == "blocked"
    assert result.code == "RUNTIME_RAW_DATA_STAT_SCHEMA_MISMATCH"


def test_runtime_target_verifier_requires_raw_data_stat_innodb() -> None:
    result = verify_runtime_target(
        FakeEngine(FakeConnection(runtime_myisam_table=raw_api_data_stat_table.name))
    )

    assert result.status == "blocked"
    assert result.code == "RUNTIME_RAW_DATA_STAT_SCHEMA_MISMATCH"


def test_runtime_target_verifier_requires_api_config_runtime_schema() -> None:
    result = verify_runtime_target(FakeEngine(FakeConnection(api_config_ready=False)))

    assert result.status == "blocked"
    assert result.code == "RUNTIME_API_CONFIG_SCHEMA_MISMATCH"


def test_runtime_target_verifier_blocks_signed_bigint() -> None:
    result = verify_runtime_target(FakeEngine(FakeConnection(signed_column=("raw_api_data", "id"))))

    assert result.status == "blocked"
    assert result.code == "RUNTIME_CORE_SCHEMA_MISMATCH"


@pytest.mark.parametrize("table_name", TARGET_TABLES)
def test_runtime_target_verifier_blocks_each_non_innodb_table(table_name: str) -> None:
    result = verify_runtime_target(FakeEngine(FakeConnection(myisam_table=table_name)))

    assert result.status == "blocked"
    assert result.code == "RUNTIME_CORE_SCHEMA_MISMATCH"


def test_runtime_target_verifier_blocks_unexpected_column() -> None:
    result = verify_runtime_target(
        FakeEngine(FakeConnection(unexpected_column=True)),
    )

    assert result.status == "blocked"
    assert result.code == "RUNTIME_CORE_SCHEMA_MISMATCH"


def test_runtime_target_verifier_warns_for_unexpected_non_unique_index() -> None:
    result = verify_runtime_target(FakeEngine(FakeConnection(unexpected_index=True)))

    assert result.status == "pass"
    assert result.code == "RUNTIME_TARGET_READY"
    assert result.details == {"unexpectedNonUniqueIndexCount": 1}


def test_runtime_target_verifier_blocks_unexpected_unique_index() -> None:
    result = verify_runtime_target(
        FakeEngine(FakeConnection(unexpected_unique_index=True)),
    )

    assert result.status == "blocked"
    assert result.code == "RUNTIME_CORE_SCHEMA_MISMATCH"
    assert result.details["unexpectedUniqueIndexCount"] == 1
