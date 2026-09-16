import logging
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from typing import Any, Protocol

from sqlalchemy import (
    Column,
    DateTime,
    MetaData,
    String,
    Table,
    insert,
    select,
    text,
    update,
)
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.engine import Connection, Engine

logger = logging.getLogger(__name__)

api_rate_limit_metadata = MetaData()
api_rate_limit_state_table = Table(
    "api_rate_limit_state",
    api_rate_limit_metadata,
    Column("rate_limit_key", String(600), primary_key=True),
    Column("next_allowed_at", DateTime, nullable=False),
    Column("created_at", DateTime, nullable=False),
    Column("updated_at", DateTime, nullable=False),
)


@dataclass(frozen=True)
class RateLimitPolicy:
    """保存官方单接口请求次数和周期。"""

    max_requests: int
    period_seconds: float

    def __post_init__(self) -> None:
        if isinstance(self.max_requests, bool) or self.max_requests <= 0:
            raise ValueError("max_requests must be greater than zero")
        if isinstance(self.period_seconds, bool) or self.period_seconds <= 0:
            raise ValueError("period_seconds must be greater than zero")

    def minimum_interval(self, utilization: float) -> float:
        """按保守利用率换算均匀请求间隔，主动避免突发。"""
        if not 0 < utilization <= 1:
            raise ValueError("rate limit utilization must be in (0, 1]")
        return self.period_seconds / self.max_requests / utilization


class RequestRateLimiter(Protocol):
    """定义 HTTP 客户端需要的最小限流能力。"""

    def acquire(self, method: str, path: str, policy: RateLimitPolicy) -> None: ...

    def defer(self, method: str, path: str, seconds: float) -> None: ...


def normalize_rate_limit_key(method: str, path: str) -> str:
    """用 HTTP 方法和规范路径标识积加单接口，不使用本地 api_code。"""
    normalized_method = method.strip().upper()
    normalized_path = "/" + path.strip().lstrip("/")
    if not normalized_method or normalized_path == "/":
        raise ValueError("rate limit key requires method and path")
    return f"{normalized_method} {normalized_path}"


def rate_limit_policy(config: Mapping[str, Any]) -> RateLimitPolicy:
    """从已核对的接口配置读取官方限额，缺失时拒绝无约束请求。"""
    rate_config = config.get("rate_limit")
    if not isinstance(rate_config, Mapping):
        raise ValueError("API config must define rate_limit")
    max_requests = rate_config.get("max_requests")
    period_seconds = rate_config.get("period_seconds")
    if isinstance(max_requests, bool) or not isinstance(max_requests, int) or max_requests <= 0:
        raise ValueError("rate_limit.max_requests must be a positive integer")
    if (
        isinstance(period_seconds, bool)
        or not isinstance(period_seconds, (int, float))
        or period_seconds <= 0
    ):
        raise ValueError("rate_limit.period_seconds must be greater than zero")
    return RateLimitPolicy(max_requests=max_requests, period_seconds=float(period_seconds))


def retry_after_seconds(value: str | None, default_seconds: float) -> float:
    """解析 Retry-After 秒数或 HTTP 日期，无法解析时使用官方周期。"""
    if value:
        try:
            return max(float(value), 0.0)
        except ValueError:
            try:
                retry_at = parsedate_to_datetime(value)
                if retry_at.tzinfo is None:
                    retry_at = retry_at.replace(tzinfo=UTC)
                return max((retry_at - datetime.now(UTC)).total_seconds(), 0.0)
            except (TypeError, ValueError, OverflowError):
                pass
    return max(default_seconds, 0.0)


class MySqlApiRateLimiter:
    """通过数据库行锁为全部 Worker 分配单接口请求槽位。"""

    def __init__(
        self,
        engine: Engine,
        utilization: float = 0.9,
        sleeper: Callable[[float], None] = time.sleep,
        now_provider: Callable[[Connection], datetime] | None = None,
    ) -> None:
        if not 0 < utilization <= 1:
            raise ValueError("rate limit utilization must be in (0, 1]")
        self.engine = engine
        self.utilization = utilization
        self.sleeper = sleeper
        self.now_provider = now_provider

    def acquire(self, method: str, path: str, policy: RateLimitPolicy) -> None:
        """等待并竞争下一个请求槽位，事务外等待且不预占未来多个槽位。"""
        rate_limit_key = normalize_rate_limit_key(method, path)
        interval = policy.minimum_interval(self.utilization)
        while True:
            with self.engine.begin() as connection:
                now = self._now(connection)
                next_allowed_at = self._locked_next_allowed_at(
                    connection,
                    rate_limit_key,
                    now,
                )
                if next_allowed_at <= now:
                    connection.execute(
                        update(api_rate_limit_state_table)
                        .where(api_rate_limit_state_table.c.rate_limit_key == rate_limit_key)
                        .values(
                            next_allowed_at=now + timedelta(seconds=interval),
                            updated_at=now,
                        )
                    )
                    return
                wait_seconds = (next_allowed_at - now).total_seconds()
            self.sleeper(max(wait_seconds, 0.001))

    def defer(self, method: str, path: str, seconds: float) -> None:
        """把上游限流冷却传播给使用同一接口的全部 Worker。"""
        rate_limit_key = normalize_rate_limit_key(method, path)
        cooldown_seconds = max(seconds, 0.0)
        with self.engine.begin() as connection:
            now = self._now(connection)
            next_allowed_at = self._locked_next_allowed_at(
                connection,
                rate_limit_key,
                now,
            )
            deferred_until = now + timedelta(seconds=cooldown_seconds)
            if deferred_until > next_allowed_at:
                connection.execute(
                    update(api_rate_limit_state_table)
                    .where(api_rate_limit_state_table.c.rate_limit_key == rate_limit_key)
                    .values(next_allowed_at=deferred_until, updated_at=now)
                )
        normalized_method, normalized_path = rate_limit_key.split(" ", 1)
        logger.warning(
            "积加接口返回 HTTP 429: method=%s path=%s cooldown_seconds=%.3f",
            normalized_method,
            normalized_path,
            cooldown_seconds,
        )

    @staticmethod
    def _locked_next_allowed_at(
        connection: Connection,
        rate_limit_key: str,
        now: datetime,
    ) -> datetime:
        """确保限流状态存在，并锁定当前接口状态直到事务结束。"""
        MySqlApiRateLimiter._ensure_state(connection, rate_limit_key, now)
        next_allowed_at = connection.scalar(
            select(api_rate_limit_state_table.c.next_allowed_at)
            .where(api_rate_limit_state_table.c.rate_limit_key == rate_limit_key)
            .with_for_update()
        )
        if next_allowed_at is None:
            raise RuntimeError("rate limit state missing after initialization")
        return next_allowed_at

    @staticmethod
    def _database_now(connection: Connection) -> datetime:
        """生产使用数据库 UTC 时间；SQLite 只服务于隔离单元测试。"""
        if connection.dialect.name == "mysql":
            value = connection.scalar(text("SELECT UTC_TIMESTAMP(6)"))
            if not isinstance(value, datetime):
                raise RuntimeError("database did not return current UTC time")
            return value
        return datetime.now(UTC).replace(tzinfo=None)

    def _now(self, connection: Connection) -> datetime:
        if self.now_provider is not None:
            return self.now_provider(connection)
        return self._database_now(connection)

    @staticmethod
    def _ensure_state(connection: Connection, rate_limit_key: str, now: datetime) -> None:
        values = {
            "rate_limit_key": rate_limit_key,
            "next_allowed_at": now,
            "created_at": now,
            "updated_at": now,
        }
        if connection.dialect.name == "mysql":
            mysql_statement = mysql_insert(api_rate_limit_state_table).values(**values)
            mysql_statement = mysql_statement.on_duplicate_key_update(
                rate_limit_key=mysql_statement.inserted.rate_limit_key
            )
            connection.execute(mysql_statement)
            return
        if connection.dialect.name == "sqlite":
            sqlite_statement = sqlite_insert(api_rate_limit_state_table).values(**values)
            sqlite_statement = sqlite_statement.on_conflict_do_nothing(
                index_elements=["rate_limit_key"]
            )
            connection.execute(sqlite_statement)
            return
        connection.execute(insert(api_rate_limit_state_table).values(**values))
