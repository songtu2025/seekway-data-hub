import ssl
from typing import Any

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Connection, Engine

from app.config import AppSettings, MigrationDatabaseSettings

MYSQL_UTC_STATEMENT = "SET SESSION time_zone = '+00:00'"


def _set_dbapi_mysql_session_utc(
    dbapi_connection: Any,
    _connection_record: Any,
) -> None:
    """把新建 MySQL DBAPI 连接固定为 UTC Session。"""
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute(MYSQL_UTC_STATEMENT)
    finally:
        cursor.close()


def configure_engine_session_timezone(engine: Engine) -> Engine:
    """仅为 MySQL 引擎注册 UTC Session 初始化，SQLite 等方言保持原样。"""
    if engine.dialect.name == "mysql":
        event.listen(engine, "connect", _set_dbapi_mysql_session_utc)
    return engine


def set_connection_session_utc(connection: Connection) -> None:
    """为外部传入的在线 MySQL 连接设置 UTC Session。"""
    if connection.dialect.name == "mysql":
        connection.exec_driver_sql(MYSQL_UTC_STATEMENT)


def create_db_engine(settings: AppSettings | MigrationDatabaseSettings) -> Engine:
    """创建 SQLAlchemy 数据库引擎。

    `pool_pre_ping=True` 会在连接复用前做轻量探活，降低 ECS 长时间运行后
    复用失效连接的概率；`pool_recycle` 用于主动回收老连接。
    """
    engine_options: dict[str, Any] = {
        "pool_pre_ping": True,
        "pool_recycle": 3600,
    }
    if isinstance(settings, AppSettings):
        engine_options.update(
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_timeout=settings.db_pool_timeout_seconds,
        )
    if settings.db_tls_mode == "verify_identity":
        tls_context = ssl.create_default_context(
            ssl.Purpose.SERVER_AUTH,
            cafile=str(settings.db_tls_ca_path),
        )
        tls_context.minimum_version = ssl.TLSVersion.TLSv1_2
        engine_options["connect_args"] = {"ssl": tls_context}
    engine = create_engine(settings.database_url, **engine_options)
    return configure_engine_session_timezone(engine)


def check_db_connection(engine: Engine) -> None:
    """执行最小 SQL 验证数据库可连接。"""
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
