from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL

from app.sync_context import CHECKPOINT_KINDS, STORAGE_MODES
from app.sync_lock import SyncLockScope

WEB_SCHEDULER_ONLY_API_CODES = frozenset({"sale_return_order_page"})
RUNTIME_SCHEDULER_PROCESS_COUNT = 1
MAX_API_WORKERS = 8
MAX_WORKER_PROCESSES = 8
MAX_DB_POOL_SIZE = 50
MAX_DB_MAX_OVERFLOW = 50
MAX_DB_POOL_TIMEOUT_SECONDS = 300.0
DatabaseTlsMode = Literal["disabled", "verify_identity"]


def runtime_database_capacity_valid(settings: Any) -> bool:
    """校验当前 API、Scheduler 与 Worker 的数据库连接池预算。"""
    try:
        api_workers = int(settings.api_workers)
        worker_processes = int(settings.worker_processes)
        pool_size = int(settings.db_pool_size)
        max_overflow = int(settings.db_max_overflow)
        pool_timeout_seconds = float(settings.db_pool_timeout_seconds)
        connection_budget = int(settings.db_connection_budget)
    except (AttributeError, TypeError, ValueError):
        return False

    if not 1 <= api_workers <= MAX_API_WORKERS:
        return False
    if not 1 <= worker_processes <= MAX_WORKER_PROCESSES:
        return False
    if not 1 <= pool_size <= MAX_DB_POOL_SIZE:
        return False
    if not 0 <= max_overflow <= MAX_DB_MAX_OVERFLOW:
        return False
    if not 0 < pool_timeout_seconds <= MAX_DB_POOL_TIMEOUT_SECONDS:
        return False
    if connection_budget <= 0:
        return False

    process_count = api_workers + RUNTIME_SCHEDULER_PROCESS_COUNT + worker_processes
    return process_count * (pool_size + max_overflow) <= connection_budget


class AppSettings(BaseSettings):
    """集中管理运行配置。

    配置来源优先级由 pydantic-settings 处理：环境变量优先，其次读取项目根目录
    `.env`，最后才使用这里的默认值。默认值只用于本地开发或示例，真实部署时
    必须通过环境变量覆盖 API 凭证和数据库密码。
    """

    app_env: str = "local"
    log_level: str = "INFO"
    log_dir: Path = Path("logs")

    jijia_base_url: str = "https://open.gerpgo.com"
    jijia_open_gateway_prefix: str = "/api/open"
    jijia_app_id: str = "your_app_id"
    jijia_app_key: str = "your_app_key"
    jijia_token_url: str = "/api_token"
    jijia_token_cache_path: Path = Path("logs/token_cache.json")
    jijia_rate_limit_utilization: float = Field(default=0.9, gt=0, le=1)
    jijia_token_rate_limit_requests: int = Field(default=10, ge=1)
    jijia_token_rate_limit_period_seconds: float = Field(default=1, gt=0)

    db_host: str = "localhost"
    db_port: int = 3306
    db_name: str = "jijia_sync"
    db_user: str = "your_db_user"
    db_password: str = "your_db_password"
    db_tls_mode: DatabaseTlsMode = "disabled"
    db_tls_ca_path: Path | None = None
    db_pool_size: int = Field(default=5, ge=1, le=MAX_DB_POOL_SIZE)
    db_max_overflow: int = Field(default=5, ge=0, le=MAX_DB_MAX_OVERFLOW)
    db_pool_timeout_seconds: float = Field(
        default=30,
        gt=0,
        le=MAX_DB_POOL_TIMEOUT_SECONDS,
    )
    db_connection_budget: int = Field(default=40, ge=1)
    api_workers: int = Field(default=2, ge=1, le=MAX_API_WORKERS)
    worker_processes: int = Field(default=1, ge=1, le=MAX_WORKER_PROCESSES)
    sync_lock_scope: SyncLockScope = "global"

    api_config_path: Path = Field(default=Path("config/api_config.example.yaml"))
    api_catalog_path: Path = Field(default=Path("config/jijia_api_catalog.generated.json"))

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @model_validator(mode="after")
    def validate_runtime_database_capacity(self) -> "AppSettings":
        """拒绝超过当前数据库连接预算的运行时进程配置。"""
        if not runtime_database_capacity_valid(self):
            raise ValueError("Runtime database connection capacity exceeds budget")
        validate_database_tls(self.app_env, self.db_tls_mode, self.db_tls_ca_path)
        return self

    @property
    def database_url(self) -> URL:
        """生成 SQLAlchemy 使用的 MySQL 连接串。

        这里不在日志中输出连接串，因为其中包含数据库用户名和密码。
        `charset=utf8mb4` 用于保证中文、表情和其他 4 字节字符能完整写入。
        """
        return URL.create(
            "mysql+pymysql",
            username=self.db_user,
            password=self.db_password,
            host=self.db_host,
            port=self.db_port,
            database=self.db_name,
            query={"charset": "utf8mb4"},
        )


class MigrationDatabaseSettings(BaseSettings):
    """隔离迁移凭据；生产环境禁止回退到运行时数据库账号。"""

    app_env: str = "local"
    fallback_db_host: str = "localhost"
    fallback_db_port: int = 3306
    fallback_db_name: str = "jijia_sync"
    fallback_db_user: str = "your_db_user"
    fallback_db_password: str = "your_db_password"
    db_tls_mode: DatabaseTlsMode = "disabled"
    db_tls_ca_path: Path | None = None

    migration_db_host: str | None = None
    migration_db_port: int | None = None
    migration_db_name: str | None = None
    migration_db_user: str | None = None
    migration_db_password: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env.migration",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_production_migration_database(self) -> "MigrationDatabaseSettings":
        """生产迁移必须显式提供完整的 MIGRATION_DB_* 配置。"""
        validate_database_tls(self.app_env, self.db_tls_mode, self.db_tls_ca_path)
        if self.app_env.lower() not in {"prod", "production"}:
            return self
        values = {
            "MIGRATION_DB_HOST": self.migration_db_host,
            "MIGRATION_DB_PORT": self.migration_db_port,
            "MIGRATION_DB_NAME": self.migration_db_name,
            "MIGRATION_DB_USER": self.migration_db_user,
            "MIGRATION_DB_PASSWORD": self.migration_db_password,
        }
        missing = [
            name
            for name, value in values.items()
            if value is None or (isinstance(value, str) and not value.strip())
        ]
        if missing:
            raise ValueError(
                "Production requires explicit migration database settings: " + ", ".join(missing)
            )
        return self

    @property
    def database_url(self) -> URL:
        """生产使用迁移专用账号，本地允许回退现有 DB_* 方便开发。"""
        return URL.create(
            "mysql+pymysql",
            username=self.migration_db_user or self.fallback_db_user,
            password=self.migration_db_password or self.fallback_db_password,
            host=self.migration_db_host or self.fallback_db_host,
            port=(
                self.migration_db_port
                if self.migration_db_port is not None
                else self.fallback_db_port
            ),
            database=self.migration_db_name or self.fallback_db_name,
            query={"charset": "utf8mb4"},
        )


def load_settings() -> AppSettings:
    """读取项目运行配置。

    调用方不需要知道 `.env` 或环境变量的读取细节，只依赖返回的
    `AppSettings` 对象即可。
    """
    return AppSettings()


def load_migration_settings() -> MigrationDatabaseSettings:
    """读取迁移专用数据库配置。"""
    runtime_settings = load_settings()
    return MigrationDatabaseSettings(
        app_env=runtime_settings.app_env,
        fallback_db_host=runtime_settings.db_host,
        fallback_db_port=runtime_settings.db_port,
        fallback_db_name=runtime_settings.db_name,
        fallback_db_user=runtime_settings.db_user,
        fallback_db_password=runtime_settings.db_password,
        db_tls_mode=runtime_settings.db_tls_mode,
        db_tls_ca_path=runtime_settings.db_tls_ca_path,
    )


def validate_database_tls(
    app_env: str,
    tls_mode: DatabaseTlsMode,
    ca_path: Path | None,
) -> None:
    """生产数据库必须校验 CA 与服务端身份，禁止明文或降级连接。"""
    if tls_mode == "verify_identity" and (ca_path is None or str(ca_path).strip() in {"", "."}):
        raise ValueError("DB_TLS_CA_PATH is required when DB_TLS_MODE=verify_identity")
    if app_env.lower() in {"prod", "production"} and tls_mode != "verify_identity":
        raise ValueError("Production requires DB_TLS_MODE=verify_identity")


def load_api_configs(path: str | Path) -> list[dict[str, Any]]:
    """读取 YAML 中的接口同步配置。

    YAML 顶层必须包含 `apis` 列表，每项显式声明唯一 api_code、path 和布尔
    enabled，避免缺失或字符串值被同步引擎误判为启用。
    """
    config_path = Path(path)
    if not config_path.exists():
        raise FileNotFoundError(f"API config file not found: {config_path}")

    with config_path.open("r", encoding="utf-8") as file:
        data = yaml.safe_load(file) or {}

    apis = data.get("apis", [])
    if not isinstance(apis, list):
        raise ValueError("API config field 'apis' must be a list")

    seen_api_codes = set()
    endpoint_rate_limits: dict[str, tuple[int, float, float | None]] = {}
    for index, api in enumerate(apis):
        if not isinstance(api, dict):
            raise ValueError(f"API config item at index {index} must be a mapping")

        api_code = api.get("api_code")
        if not isinstance(api_code, str) or not api_code.strip():
            raise ValueError(f"API config item at index {index} must define api_code")
        if api_code in seen_api_codes:
            raise ValueError(f"Duplicate API config api_code: {api_code}")
        seen_api_codes.add(api_code)

        path_value = api.get("path")
        if not isinstance(path_value, str) or not path_value.strip():
            raise ValueError(f"API config {api_code} must define path")
        if "enabled" not in api or type(api["enabled"]) is not bool:
            raise ValueError(f"API config {api_code} enabled must be a boolean")

        storage_mode = api.get("storage_mode", "latest_snapshot")
        if storage_mode not in STORAGE_MODES:
            raise ValueError(f"API config {api_code} has unsupported storage_mode: {storage_mode}")

        checkpoint_kind = api.get("checkpoint_kind", "date_window")
        if checkpoint_kind not in CHECKPOINT_KINDS:
            raise ValueError(
                f"API config {api_code} has unsupported checkpoint_kind: {checkpoint_kind}"
            )

        rate_config = api.get("rate_limit")
        if rate_config is None and api.get("enabled") is False:
            continue
        if not isinstance(rate_config, dict):
            raise ValueError(f"API config {api_code} must define rate_limit")
        max_requests = rate_config.get("max_requests")
        period_seconds = rate_config.get("period_seconds")
        if isinstance(max_requests, bool) or not isinstance(max_requests, int) or max_requests <= 0:
            raise ValueError(
                f"API config {api_code} rate_limit.max_requests must be a positive integer"
            )
        if (
            isinstance(period_seconds, bool)
            or not isinstance(period_seconds, (int, float))
            or period_seconds <= 0
        ):
            raise ValueError(
                f"API config {api_code} rate_limit.period_seconds must be greater than zero"
            )
        cooldown_seconds = rate_config.get("cooldown_seconds")
        if cooldown_seconds is not None and (
            isinstance(cooldown_seconds, bool)
            or not isinstance(cooldown_seconds, (int, float))
            or cooldown_seconds <= 0
        ):
            raise ValueError(
                f"API config {api_code} rate_limit.cooldown_seconds must be greater than zero"
            )
        method = str(api.get("method") or "POST").strip().upper()
        endpoint_key = f"{method} /{path_value.strip().lstrip('/')}"
        endpoint_policy = (
            max_requests,
            float(period_seconds),
            float(cooldown_seconds) if cooldown_seconds is not None else None,
        )
        existing_policy = endpoint_rate_limits.setdefault(endpoint_key, endpoint_policy)
        if existing_policy != endpoint_policy:
            raise ValueError(f"API configs sharing endpoint {endpoint_key} must use one rate limit")

    return apis


def enabled_web_scheduler_only_api_codes(
    api_configs: list[dict[str, Any]],
) -> tuple[str, ...]:
    """返回被错误加入 legacy 批量的 Web 独占接口。"""
    return tuple(
        sorted(
            str(api["api_code"])
            for api in api_configs
            if api.get("enabled") is True and api.get("api_code") in WEB_SCHEDULER_ONLY_API_CODES
        )
    )
