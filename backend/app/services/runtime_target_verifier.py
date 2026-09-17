from typing import Any

from sqlalchemy import Table, UniqueConstraint, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.api_rate_limiter import api_rate_limit_state_table
from backend.app.models.sync_records import (
    api_config_table,
    raw_api_data_stat_table,
    sale_return_order_table,
)
from backend.app.services._migration_schema import (
    IndexSpec,
    build_index_specs,
    read_information_schema_columns,
    read_information_schema_indexes,
    read_information_schema_tables,
)
from backend.app.services.migration_0003_service import (
    collect_target_schema_snapshot,
    evaluate_runtime_schema,
)
from backend.app.services.migration_preflight_service import PreflightResult

EXPECTED_ALEMBIC_HEAD = "0010_sync_job_resolution"


def _model_index_specs(table: Table) -> dict[tuple[str, str], IndexSpec]:
    """从运行模型生成 MySQL 应具备的索引列序规格。"""
    specs = {
        (table.name, "PRIMARY"): (
            0,
            tuple(column.name for column in table.primary_key.columns),
        )
    }
    for constraint in table.constraints:
        if isinstance(constraint, UniqueConstraint) and isinstance(constraint.name, str):
            specs[(table.name, constraint.name)] = (
                0,
                tuple(column.name for column in constraint.columns),
            )
    for index in table.indexes:
        if isinstance(index.name, str):
            specs[(table.name, index.name)] = (
                0 if index.unique else 1,
                tuple(column.name for column in index.columns),
            )
    return specs


def _index_names(specs: dict[tuple[str, str], IndexSpec]) -> frozenset[str]:
    return frozenset(index_name for _table_name, index_name in specs)


API_CONFIG_REQUIRED_COLUMNS = frozenset(api_config_table.c.keys())
API_CONFIG_REQUIRED_INDEX_SPECS = _model_index_specs(api_config_table)
API_CONFIG_REQUIRED_INDEXES = _index_names(API_CONFIG_REQUIRED_INDEX_SPECS)

SALE_RETURN_REQUIRED_COLUMNS = frozenset(sale_return_order_table.c.keys())
SALE_RETURN_REQUIRED_INDEX_SPECS = _model_index_specs(sale_return_order_table)
SALE_RETURN_REQUIRED_INDEXES = _index_names(SALE_RETURN_REQUIRED_INDEX_SPECS)

RAW_DATA_STAT_REQUIRED_COLUMNS = frozenset(raw_api_data_stat_table.c.keys())
RAW_DATA_STAT_REQUIRED_INDEX_SPECS = _model_index_specs(raw_api_data_stat_table)
RAW_DATA_STAT_REQUIRED_INDEXES = _index_names(RAW_DATA_STAT_REQUIRED_INDEX_SPECS)

API_RATE_LIMIT_REQUIRED_COLUMNS = frozenset(api_rate_limit_state_table.c.keys())
API_RATE_LIMIT_REQUIRED_INDEX_SPECS = _model_index_specs(api_rate_limit_state_table)
API_RATE_LIMIT_REQUIRED_INDEXES = _index_names(API_RATE_LIMIT_REQUIRED_INDEX_SPECS)


def verify_runtime_target(engine: Engine) -> PreflightResult:
    """用只读查询验证实例非只读、Web 迁移 head 和同步核心目标结构。"""
    schema_details: dict[str, int] = {}
    try:
        with engine.connect() as connection:
            if connection.dialect.name != "mysql":
                return PreflightResult(
                    status="blocked",
                    code="RUNTIME_DATABASE_NOT_MYSQL",
                )
            read_only = connection.execute(text("SELECT @@GLOBAL.read_only")).scalar_one()
            if read_only is None or int(read_only) != 0:
                return PreflightResult(
                    status="blocked",
                    code="RUNTIME_DATABASE_READ_ONLY",
                )
            heads = [
                str(value)
                for value in connection.execute(text("SELECT version_num FROM alembic_version"))
                .scalars()
                .all()
            ]
            if len(heads) != 1 or heads[0] != EXPECTED_ALEMBIC_HEAD:
                return PreflightResult(
                    status="blocked",
                    code="RUNTIME_ALEMBIC_HEAD_MISMATCH",
                )
            schema_result = evaluate_runtime_schema(collect_target_schema_snapshot(connection))
            if schema_result.status != "pass":
                return PreflightResult(
                    status="blocked",
                    code="RUNTIME_CORE_SCHEMA_MISMATCH",
                    details=schema_result.details,
                )
            schema_details = schema_result.details
            if not _api_config_registry_ready(connection):
                return PreflightResult(
                    status="blocked",
                    code="RUNTIME_API_CONFIG_SCHEMA_MISMATCH",
                )
            if not _sale_return_projection_ready(connection):
                return PreflightResult(
                    status="blocked",
                    code="RUNTIME_SALE_RETURN_SCHEMA_MISMATCH",
                )
            if not _raw_data_stat_ready(connection):
                return PreflightResult(
                    status="blocked",
                    code="RUNTIME_RAW_DATA_STAT_SCHEMA_MISMATCH",
                )
            if not _api_rate_limit_ready(connection):
                return PreflightResult(
                    status="blocked",
                    code="RUNTIME_API_RATE_LIMIT_SCHEMA_MISMATCH",
                )
    except SQLAlchemyError:
        return PreflightResult(
            status="blocked",
            code="RUNTIME_DATABASE_CHECK_FAILED",
        )
    return PreflightResult(
        status="pass",
        code="RUNTIME_TARGET_READY",
        details=schema_details,
    )


def _api_config_registry_ready(connection: Any) -> bool:
    """确认运行时配置表已执行 0004，避免服务启动后才因缺列失败。"""
    return _runtime_table_ready(
        connection,
        api_config_table,
        API_CONFIG_REQUIRED_INDEX_SPECS,
    )


def _sale_return_projection_ready(connection: Any) -> bool:
    return _runtime_table_ready(
        connection,
        sale_return_order_table,
        SALE_RETURN_REQUIRED_INDEX_SPECS,
    )


def _raw_data_stat_ready(connection: Any) -> bool:
    """确认精确统计表已执行 0007，并保留复合主键。"""
    return _runtime_table_ready(
        connection,
        raw_api_data_stat_table,
        RAW_DATA_STAT_REQUIRED_INDEX_SPECS,
    )


def _api_rate_limit_ready(connection: Any) -> bool:
    """确认已执行 0008，避免并发请求绕过共享限流。"""
    return _runtime_table_ready(
        connection,
        api_rate_limit_state_table,
        API_RATE_LIMIT_REQUIRED_INDEX_SPECS,
    ) and _api_rate_limit_columns_ready(connection)


def _api_rate_limit_columns_ready(connection: Any) -> bool:
    """精确校验共享限流状态列，兼容 MySQL 对默认值大小写的差异。"""
    rows = {
        str(row["column_name"]): row
        for row in connection.execute(
            text(
                """
                SELECT
                  COLUMN_NAME AS column_name,
                  DATA_TYPE AS data_type,
                  IS_NULLABLE AS is_nullable,
                  CHARACTER_MAXIMUM_LENGTH AS character_maximum_length,
                  DATETIME_PRECISION AS datetime_precision,
                  COLUMN_DEFAULT AS column_default,
                  EXTRA AS extra
                FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = 'api_rate_limit_state'
                """
            )
        ).mappings()
    }
    rate_limit_key = rows.get("rate_limit_key")
    if not rate_limit_key or not (
        str(rate_limit_key["data_type"]).lower() == "varchar"
        and rate_limit_key["character_maximum_length"] == 600
        and str(rate_limit_key["is_nullable"]).upper() == "NO"
    ):
        return False

    for column_name in ("next_allowed_at", "created_at", "updated_at"):
        column = rows.get(column_name)
        if not column or not (
            str(column["data_type"]).lower() == "datetime"
            and column["datetime_precision"] == 6
            and str(column["is_nullable"]).upper() == "NO"
        ):
            return False

    expected_default = "current_timestamp(6)"
    if _normalize_schema_expression(rows["created_at"]["column_default"]) != expected_default:
        return False
    if _normalize_schema_expression(rows["updated_at"]["column_default"]) != expected_default:
        return False
    return "onupdatecurrent_timestamp(6)" in _normalize_schema_expression(
        rows["updated_at"]["extra"]
    )


def _normalize_schema_expression(value: Any) -> str:
    """忽略 information_schema 表达式的大小写与空白差异。"""
    if value is None:
        return ""
    return "".join(str(value).lower().split())


def _runtime_table_ready(
    connection: Any,
    table: Table,
    required_index_specs: dict[tuple[str, str], IndexSpec],
) -> bool:
    """复用统一结构读取器，验证运行模型所需列、索引和 InnoDB。"""
    table_names = (table.name,)
    columns = frozenset(
        str(row["column_name"]) for row in read_information_schema_columns(connection, table_names)
    )
    indexes = build_index_specs(read_information_schema_indexes(connection, table_names))
    engines = {
        str(row["table_name"]): str(row["engine"] or "").lower()
        for row in read_information_schema_tables(connection, table_names)
    }
    return (
        frozenset(table.c.keys()).issubset(columns)
        and all(indexes.get(key) == spec for key, spec in required_index_specs.items())
        and engines.get(table.name) == "innodb"
    )
