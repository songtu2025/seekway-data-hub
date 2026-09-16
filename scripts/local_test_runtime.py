import argparse
import json
import secrets
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet
from dotenv import dotenv_values
from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import Engine

from app.config import load_migration_settings
from backend.app.services.migration_preflight_service import PreflightResult
from backend.app.services.runtime_target_verifier import verify_runtime_target

PROJECT_ROOT = Path(__file__).resolve().parents[1]
LOCAL_ENV_PATH = PROJECT_ROOT / ".env.localtest"
EXPECTED_HOSTS = frozenset({"127.0.0.1", "localhost"})
EXPECTED_PORT = 3306
EXPECTED_DATABASE = "jijia_sync_isolated_20260827"
RUNTIME_USER = "jijia_local_app"
RUNTIME_ACCOUNT_HOST = "localhost"
EXPECTED_JIJIA_TARGET = {
    "JIJIA_BASE_URL": "https://open.gerpgo.com",
    "JIJIA_OPEN_GATEWAY_PREFIX": "/api/open",
    "JIJIA_TOKEN_URL": "/api_token",
    # Web Worker 只使用数据库内加密凭证，空值用于阻止继承 legacy 环境凭证。
    "JIJIA_APP_ID": "",
    "JIJIA_APP_KEY": "",
}


@dataclass(frozen=True)
class LocalTestResult:
    """返回不含密码、密钥和连接串的本地配置状态。"""

    status: str
    code: str
    reason_code: str | None = None
    details: dict[str, int] = field(default_factory=dict)

    def payload(self) -> dict[str, object]:
        payload: dict[str, object] = {"status": self.status, "code": self.code}
        if self.reason_code is not None:
            payload["reasonCode"] = self.reason_code
        if self.details:
            payload["details"] = self.details
        return payload


def setup_local_test(
    *,
    project_root: Path = PROJECT_ROOT,
    settings_loader: Callable[[], Any] = load_migration_settings,
    migration_engine_factory: Callable[[URL], Engine] = create_engine,
    runtime_engine_factory: Callable[[URL], Engine] = create_engine,
    verifier: Callable[[Engine], PreflightResult] = verify_runtime_target,
    password_factory: Callable[[int], str] = secrets.token_urlsafe,
    key_factory: Callable[[], bytes] = Fernet.generate_key,
) -> LocalTestResult:
    """为固定本地库创建最小权限账号并生成不回显的运行配置。"""
    env_path = project_root / LOCAL_ENV_PATH.name
    if env_path.exists():
        return LocalTestResult("blocked", "LOCAL_ENV_ALREADY_EXISTS")

    try:
        migration_url = settings_loader().database_url
    except Exception:
        return LocalTestResult("blocked", "LOCAL_MIGRATION_CONFIG_INVALID")
    if not _migration_target_valid(migration_url):
        return LocalTestResult("blocked", "LOCAL_TARGET_MISMATCH")

    runtime_password = password_factory(32)
    try:
        encryption_key = key_factory().decode("ascii")
        Fernet(encryption_key.encode("ascii"))
    except (UnicodeDecodeError, UnicodeEncodeError, ValueError):
        return LocalTestResult("error", "LOCAL_SECRET_GENERATION_FAILED")

    migration_engine = None
    try:
        migration_engine = migration_engine_factory(migration_url)
        with migration_engine.connect() as connection:
            connection = connection.execution_options(isolation_level="AUTOCOMMIT")
            account = f"'{RUNTIME_USER}'@'{RUNTIME_ACCOUNT_HOST}'"
            connection.execute(
                text(f"CREATE USER IF NOT EXISTS {account} IDENTIFIED BY :password"),
                {"password": runtime_password},
            )
            connection.execute(
                text(f"ALTER USER {account} IDENTIFIED BY :password"),
                {"password": runtime_password},
            )
            connection.execute(
                text(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {EXPECTED_DATABASE}.* TO {account}")
            )
    except Exception:
        return LocalTestResult("error", "LOCAL_RUNTIME_USER_SETUP_FAILED")
    finally:
        if migration_engine is not None:
            migration_engine.dispose()

    runtime_url = _runtime_database_url(runtime_password)
    target_result = _verify_runtime_url(runtime_url, runtime_engine_factory, verifier)
    if target_result.status != "pass":
        return LocalTestResult(
            "blocked",
            "LOCAL_RUNTIME_TARGET_BLOCKED",
            target_result.code,
            target_result.details,
        )

    try:
        env_path.write_text(
            _render_env(runtime_password, encryption_key),
            encoding="utf-8",
        )
    except OSError:
        return LocalTestResult("error", "LOCAL_ENV_WRITE_FAILED")
    return LocalTestResult("success", "LOCAL_RUNTIME_CONFIG_CREATED")


def check_local_test(
    *,
    project_root: Path = PROJECT_ROOT,
    values_loader: Callable[[Path], Mapping[str, str | None]] = dotenv_values,
    engine_factory: Callable[[URL], Engine] = create_engine,
    verifier: Callable[[Engine], PreflightResult] = verify_runtime_target,
) -> LocalTestResult:
    """启动前只读确认本地配置仍指向固定隔离库且结构完整。"""
    env_path = project_root / LOCAL_ENV_PATH.name
    if not env_path.is_file():
        return LocalTestResult("blocked", "LOCAL_ENV_MISSING")
    try:
        values = values_loader(env_path)
        runtime_url = URL.create(
            "mysql+pymysql",
            username=values.get("DB_USER"),
            password=values.get("DB_PASSWORD"),
            host=values.get("DB_HOST"),
            port=int(values.get("DB_PORT") or 0),
            database=values.get("DB_NAME"),
            query={"charset": "utf8mb4"},
        )
        encryption_key = values.get("CREDENTIAL_ENCRYPTION_KEY") or ""
        Fernet(encryption_key.encode("ascii"))
    except (TypeError, ValueError, UnicodeEncodeError):
        return LocalTestResult("blocked", "LOCAL_ENV_INVALID")
    if not _runtime_target_valid(runtime_url):
        return LocalTestResult("blocked", "LOCAL_TARGET_MISMATCH")
    if not _jijia_target_valid(values):
        return LocalTestResult("blocked", "LOCAL_JIJIA_TARGET_MISMATCH")

    target_result = _verify_runtime_url(runtime_url, engine_factory, verifier)
    if target_result.status != "pass":
        return LocalTestResult(
            "blocked",
            "LOCAL_RUNTIME_TARGET_BLOCKED",
            target_result.code,
            target_result.details,
        )
    return LocalTestResult(
        "pass",
        "LOCAL_RUNTIME_READY",
        details=target_result.details,
    )


def ensure_local_jijia_target(
    *,
    project_root: Path = PROJECT_ROOT,
    values_loader: Callable[[Path], Mapping[str, str | None]] = dotenv_values,
) -> LocalTestResult:
    """只补充缺失的固定积加目标，不改写或回显已有凭据。"""
    env_path = project_root / LOCAL_ENV_PATH.name
    if not env_path.is_file():
        return LocalTestResult("blocked", "LOCAL_ENV_MISSING")
    try:
        values = values_loader(env_path)
    except (OSError, UnicodeError, ValueError):
        return LocalTestResult("blocked", "LOCAL_ENV_INVALID")

    for key, expected_value in EXPECTED_JIJIA_TARGET.items():
        if key in values and values.get(key) != expected_value:
            return LocalTestResult("blocked", "LOCAL_JIJIA_TARGET_MISMATCH")

    missing_items = [
        (key, value) for key, value in EXPECTED_JIJIA_TARGET.items() if key not in values
    ]
    if not missing_items:
        return LocalTestResult("pass", "LOCAL_JIJIA_TARGET_READY")

    try:
        with env_path.open("a", encoding="utf-8") as env_file:
            env_file.write("\n")
            for key, value in missing_items:
                env_file.write(f"{key}={value}\n")
    except OSError:
        return LocalTestResult("error", "LOCAL_ENV_WRITE_FAILED")
    return LocalTestResult("success", "LOCAL_JIJIA_TARGET_PINNED")


def run_local_worker_once(*, worker_entry: Any | None = None) -> LocalTestResult:
    """校验运行目标后只领取一个已排队任务，不启动连续轮询或调度。"""
    entry = worker_entry
    if entry is None:
        from backend.app import worker

        entry = worker

    try:
        settings = entry.get_web_settings()
        entry.configure_service_logging(settings.log_level)
        entry.validate_runtime_startup(settings, entry.engine)
        job_id = entry.build_worker().run_once()
    except Exception:
        return LocalTestResult("error", "LOCAL_WORKER_FAILED")
    finally:
        entry.engine.dispose()
    if job_id is None:
        return LocalTestResult("pass", "LOCAL_WORKER_NO_JOB")
    return LocalTestResult("success", "LOCAL_WORKER_RAN_ONCE")


def _verify_runtime_url(
    runtime_url: URL,
    engine_factory: Callable[[URL], Engine],
    verifier: Callable[[Engine], PreflightResult],
) -> PreflightResult:
    engine = None
    try:
        engine = engine_factory(runtime_url)
        return verifier(engine)
    except Exception:
        return PreflightResult("blocked", "RUNTIME_DATABASE_CHECK_FAILED")
    finally:
        if engine is not None:
            engine.dispose()


def _migration_target_valid(url: URL) -> bool:
    return (
        url.host in EXPECTED_HOSTS
        and url.port == EXPECTED_PORT
        and url.database == EXPECTED_DATABASE
        and bool(url.username)
        and bool(url.password)
    )


def _runtime_target_valid(url: URL) -> bool:
    return (
        url.host == "127.0.0.1"
        and url.port == EXPECTED_PORT
        and url.database == EXPECTED_DATABASE
        and url.username == RUNTIME_USER
        and bool(url.password)
    )


def _jijia_target_valid(values: Mapping[str, str | None]) -> bool:
    return all(values.get(key) == value for key, value in EXPECTED_JIJIA_TARGET.items())


def _runtime_database_url(password: str) -> URL:
    return URL.create(
        "mysql+pymysql",
        username=RUNTIME_USER,
        password=password,
        host="127.0.0.1",
        port=EXPECTED_PORT,
        database=EXPECTED_DATABASE,
        query={"charset": "utf8mb4"},
    )


def _render_env(runtime_password: str, encryption_key: str) -> str:
    return "\n".join(
        (
            "APP_ENV=local",
            "LOG_LEVEL=INFO",
            "LOG_DIR=logs/localtest",
            *(f"{key}={value}" for key, value in EXPECTED_JIJIA_TARGET.items()),
            "JIJIA_TOKEN_CACHE_PATH=logs/localtest_token_cache.json",
            "DB_HOST=127.0.0.1",
            f"DB_PORT={EXPECTED_PORT}",
            f"DB_NAME={EXPECTED_DATABASE}",
            f"DB_USER={RUNTIME_USER}",
            f"DB_PASSWORD={runtime_password}",
            "DB_POOL_SIZE=3",
            "DB_MAX_OVERFLOW=2",
            "API_CONFIG_PATH=config/api_config.example.yaml",
            "PUBLIC_WEB_URL=http://127.0.0.1:5183",
            "SESSION_COOKIE_NAME=jijia_local_session",
            "SESSION_COOKIE_SECURE=false",
            "MAIL_PROVIDER=console",
            f"CREDENTIAL_ENCRYPTION_KEY={encryption_key}",
            "WORKER_POLL_SECONDS=3",
            "WORKER_HEARTBEAT_SECONDS=30",
            "WORKER_STALE_MINUTES=10",
            "SYNC_LOCK_SCOPE=account",
            "",
        )
    )


def main(argv: Sequence[str] | None = None) -> int:
    """执行本地测试运行配置的初始化或只读检查。"""
    parser = argparse.ArgumentParser(description="本地隔离测试运行配置")
    subparsers = parser.add_subparsers(dest="command", required=True)
    setup_parser = subparsers.add_parser("setup")
    setup_parser.add_argument("--confirm-local-isolated", action="store_true")
    subparsers.add_parser("check")
    subparsers.add_parser("ensure-jijia-target")
    subparsers.add_parser("worker-once")
    args = parser.parse_args(argv)

    if args.command == "setup" and not args.confirm_local_isolated:
        result = LocalTestResult("blocked", "LOCAL_CONFIRMATION_REQUIRED")
    elif args.command == "setup":
        result = setup_local_test()
    elif args.command == "ensure-jijia-target":
        result = ensure_local_jijia_target()
    elif args.command == "worker-once":
        result = run_local_worker_once()
    else:
        result = check_local_test()
    print(json.dumps(result.payload(), ensure_ascii=True, separators=(",", ":")))
    if result.status in {"success", "pass"}:
        return 0
    if result.status == "blocked":
        return 2
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
