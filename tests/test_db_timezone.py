import ssl
from types import SimpleNamespace
from unittest.mock import Mock, patch

from app.config import AppSettings, MigrationDatabaseSettings
from app.db import (
    MYSQL_UTC_STATEMENT,
    configure_engine_session_timezone,
    create_db_engine,
    set_connection_session_utc,
)


def _engine(dialect_name: str) -> SimpleNamespace:
    return SimpleNamespace(dialect=SimpleNamespace(name=dialect_name))


def test_mysql_engine_registers_utc_session_initializer() -> None:
    engine = _engine("mysql")
    cursor = Mock()
    dbapi_connection = Mock()
    dbapi_connection.cursor.return_value = cursor

    with patch("app.db.event.listen") as listen:
        assert configure_engine_session_timezone(engine) is engine

    listen.assert_called_once()
    _, event_name, initializer = listen.call_args.args
    assert event_name == "connect"
    initializer(dbapi_connection, object())
    cursor.execute.assert_called_once_with(MYSQL_UTC_STATEMENT)
    cursor.close.assert_called_once_with()


def test_sqlite_engine_does_not_register_mysql_initializer() -> None:
    engine = _engine("sqlite")

    with patch("app.db.event.listen") as listen:
        assert configure_engine_session_timezone(engine) is engine

    listen.assert_not_called()


def test_online_connection_sets_utc_only_for_mysql() -> None:
    mysql_connection = Mock()
    mysql_connection.dialect.name = "mysql"
    sqlite_connection = Mock()
    sqlite_connection.dialect.name = "sqlite"

    set_connection_session_utc(mysql_connection)
    set_connection_session_utc(sqlite_connection)

    mysql_connection.exec_driver_sql.assert_called_once_with(MYSQL_UTC_STATEMENT)
    sqlite_connection.exec_driver_sql.assert_not_called()


def test_runtime_engine_uses_explicit_pool_settings() -> None:
    settings = AppSettings(
        _env_file=None,
        db_pool_size=4,
        db_max_overflow=2,
        db_pool_timeout_seconds=15,
    )
    engine = _engine("sqlite")

    with patch("app.db.create_engine", return_value=engine) as factory:
        assert create_db_engine(settings) is engine

    assert factory.call_args.kwargs == {
        "pool_pre_ping": True,
        "pool_recycle": 3600,
        "pool_size": 4,
        "max_overflow": 2,
        "pool_timeout": 15,
    }


def test_migration_engine_does_not_inherit_runtime_pool_settings() -> None:
    settings = MigrationDatabaseSettings(_env_file=None)
    engine = _engine("sqlite")

    with patch("app.db.create_engine", return_value=engine) as factory:
        assert create_db_engine(settings) is engine

    assert factory.call_args.kwargs == {
        "pool_pre_ping": True,
        "pool_recycle": 3600,
    }


def test_mysql_engine_uses_verified_tls_context() -> None:
    settings = AppSettings(
        _env_file=None,
        db_tls_mode="verify_identity",
        db_tls_ca_path="/run/db-certs/polardb-ca.pem",
    )
    engine = _engine("mysql")
    tls_context = Mock(spec=ssl.SSLContext)

    with (
        patch("app.db.ssl.create_default_context", return_value=tls_context) as context_factory,
        patch("app.db.create_engine", return_value=engine) as engine_factory,
        patch("app.db.event.listen"),
    ):
        assert create_db_engine(settings) is engine

    context_factory.assert_called_once_with(
        ssl.Purpose.SERVER_AUTH,
        cafile=str(settings.db_tls_ca_path),
    )
    assert tls_context.minimum_version == ssl.TLSVersion.TLSv1_2
    assert engine_factory.call_args.kwargs["connect_args"] == {"ssl": tls_context}
