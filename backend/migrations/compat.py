from sqlalchemy.engine import Connection

MYSQL_CHECK_CONSTRAINT_MINIMUM_VERSION = (8, 0, 16)


def supports_named_check_constraints(connection: Connection) -> bool:
    """MySQL 8.0.16 之前只解析但不创建命名 CHECK 约束。"""
    dialect = connection.dialect
    if dialect.name != "mysql":
        return True
    return tuple(dialect.server_version_info or ()) >= MYSQL_CHECK_CONSTRAINT_MINIMUM_VERSION
