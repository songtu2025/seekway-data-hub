import argparse
import logging
from contextlib import contextmanager

from requests import HTTPError, RequestException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api_client import JijiaApiClient
from app.api_config_registry import load_published_api_configs, publication_records
from app.api_rate_limiter import MySqlApiRateLimiter
from app.auth import JijiaAuthClient
from app.config import (
    WEB_SCHEDULER_ONLY_API_CODES,
    enabled_web_scheduler_only_api_codes,
    load_api_configs,
    load_settings,
)
from app.db import check_db_connection, create_db_engine
from app.logger import setup_logging
from app.sync_engine import ApiRequestError, SyncEngine
from app.sync_lock import SyncTaskLockUnavailable, sync_task_lock


def parse_args() -> argparse.Namespace:
    """解析命令行参数。

    每个参数都对应一个独立的运行模式，方便部署前分步骤验证：先测数据库，
    再测 token，最后再跑 mock 或真实接口同步。
    """
    parser = argparse.ArgumentParser(description="积加开放平台到 PolarDB MySQL 同步服务")
    parser.add_argument("--check-db", action="store_true", help="只检查数据库连接")
    parser.add_argument("--mock-sync", action="store_true", help="写入一批 mock 同步数据")
    parser.add_argument("--test-token", action="store_true", help="测试获取积加 accessToken")
    parser.add_argument("--test-api", help="测试单个积加 API，并写入 raw_api_data")
    parser.add_argument("--sync-api", help="同步单个真实积加 API，并写入 raw_api_data")
    parser.add_argument("--probe-api", help="只请求单个分页 API 首页，返回总数和所需页数")
    parser.add_argument(
        "--sync-enabled",
        action="store_true",
        help="同步数据库中 legacy enabled 的真实积加 API",
    )
    parser.add_argument(
        "--validate-api-configs", action="store_true", help="校验 YAML 发布输入和官方只读证据"
    )
    parser.add_argument(
        "--publish-api-configs", action="store_true", help="原子发布 YAML 配置并补齐账号策略"
    )
    parser.add_argument(
        "--sync-api-configs", action="store_true", help="兼容旧命令；等同 --publish-api-configs"
    )
    return parser.parse_args()


def main() -> None:
    """命令行入口。

    入口层只负责选择运行模式和处理顶层异常；真正的认证、请求、入库逻辑
    分别交给 AuthClient、ApiClient 和 SyncEngine，避免主函数堆积业务细节。
    """
    args = parse_args()
    settings = load_settings()
    setup_logging(settings.log_dir, settings.log_level)
    logger = logging.getLogger(__name__)
    _reject_unscoped_legacy_write(args, settings.sync_lock_scope)

    if args.check_db:
        _check_db(settings)
        logger.info("database connection ok")
        return

    if args.test_token:
        _test_token(settings)
        return

    if getattr(args, "validate_api_configs", False):
        _validate_api_configs(settings)
        return

    if getattr(args, "publish_api_configs", False) or args.sync_api_configs:
        _publish_api_configs(settings)
        return

    if args.probe_api:
        _probe_single_api(settings, args.probe_api)
        return

    if args.sync_enabled:
        _sync_enabled(settings)
        return

    # sync-api 和 test-api 共用同一条单接口执行链路，差别只在命令语义。
    if args.sync_api:
        _run_single_api(settings, args.sync_api, "sync api")
        return

    if args.test_api:
        _run_single_api(settings, args.test_api, "test api")
        return

    if args.mock_sync:
        engine = create_db_engine(settings)
        api_configs = load_published_api_configs(engine)
        _reject_legacy_scheduler_ownership(
            enabled_web_scheduler_only_api_codes(api_configs),
        )
        try:
            with _sync_task_lock(engine):
                batch_no = SyncEngine(api_configs, engine).mock_sync()
        except SQLAlchemyError:
            logger.error("mock sync failed: check database connection, schema, and privileges")
            raise SystemExit(1) from None
        logger.info("mock sync batch created: %s", batch_no)
        return

    api_configs = load_api_configs(settings.api_config_path)
    SyncEngine(api_configs).dry_run()
    logger.info("dry-run finished; use --mock-sync to verify database writes")


def _requires_sync_lock(args: argparse.Namespace) -> bool:
    """判断当前命令是否需要同步任务互斥。"""
    return bool(
        args.mock_sync
        or args.test_api
        or args.sync_api
        or args.sync_enabled
        or getattr(args, "publish_api_configs", False)
        or args.sync_api_configs
    )


def _reject_unscoped_legacy_write(args: argparse.Namespace, sync_lock_scope: str) -> None:
    """账号锁模式禁止无法映射 Web 账号的 legacy 写入口。"""
    if sync_lock_scope != "account" or not _requires_sync_lock(args):
        return
    logging.getLogger(__name__).error("legacy sync blocked: code=LEGACY_ACCOUNT_SCOPE_REQUIRED")
    raise SystemExit(2)


@contextmanager
def _sync_task_lock(engine):
    """保持原 CLI 语义：拿不到共享同步锁时立即退出。"""
    logger = logging.getLogger(__name__)
    try:
        with sync_task_lock(engine, logger):
            yield
    except SyncTaskLockUnavailable:
        logger.error("sync task is already running")
        raise SystemExit(1) from None


def _check_db(settings) -> None:
    """检查数据库连接是否可用。

    这是上线前最小验证命令，只执行 `SELECT 1`，不会写入任何业务表。
    """
    engine = create_db_engine(settings)
    try:
        check_db_connection(engine)
    except SQLAlchemyError:
        logging.getLogger(__name__).error(
            "database connection failed: check .env credentials, network allowlist, "
            "and user privileges"
        )
        raise SystemExit(1) from None


def _test_token(settings) -> None:
    """测试积加 accessToken 获取流程。

    成功时只打印过期信息，不打印 token 本身，避免在终端或日志里泄露凭证。
    """
    logger = logging.getLogger(__name__)
    try:
        engine = create_db_engine(settings)
        rate_limiter = MySqlApiRateLimiter(
            engine,
            utilization=settings.jijia_rate_limit_utilization,
        )
        token = JijiaAuthClient(settings, rate_limiter=rate_limiter).get_access_token()
    except HTTPError as error:
        status_code = error.response.status_code if error.response is not None else "unknown"
        logger.error("access token request failed: http_status=%s", status_code)
        raise SystemExit(1) from None
    except ValueError as error:
        logger.error(
            "access token request failed: error_type=%s",
            type(error).__name__,
        )
        raise SystemExit(1) from None
    except RequestException:
        logger.error("access token request failed: check API host and network")
        raise SystemExit(1) from None

    logger.info(
        "access token ok; expires_in=%s expires_out=%s", token.expires_in, token.expires_out
    )


def _validate_api_configs(settings) -> None:
    """离线校验 YAML 发布输入与本地官方目录。"""
    api_configs = load_api_configs(settings.api_config_path)
    records = publication_records(api_configs, settings.api_catalog_path)
    enabled_count = sum(bool(record["enabled"]) for record in records)
    logging.getLogger(__name__).info(
        "api configs valid: count=%s enabled=%s",
        len(records),
        enabled_count,
    )


def _publish_api_configs(settings) -> None:
    """把 YAML API 配置原子发布到数据库并补齐账号策略。

    该命令只同步配置元数据，不获取 token，也不请求任何真实业务接口。
    """
    logger = logging.getLogger(__name__)
    api_configs = load_api_configs(settings.api_config_path)
    engine = create_db_engine(settings)
    try:
        with _sync_task_lock(engine):
            from backend.app.services.api_config_publish_service import publish_api_configs

            with Session(engine) as db:
                result = publish_api_configs(
                    db,
                    api_configs,
                    settings.api_catalog_path,
                )
    except (SQLAlchemyError, ValueError):
        logger.error("publish api configs failed: check schema and official catalog")
        raise SystemExit(1) from None

    logger.info(
        "api configs published: count=%s created=%s disabled=%s policies=%s",
        result["published"],
        result["created"],
        result["disabled"],
        result["policiesCreated"],
    )


def _sync_enabled(settings) -> None:
    """同步数据库中所有 legacy enabled 接口。

    这是生产定时任务应使用的主入口：一次运行创建一个 sync_batch，并为每个
    API 写入独立的 sync_api_log。
    """
    logger = logging.getLogger(__name__)
    engine = create_db_engine(settings)
    api_configs = load_published_api_configs(engine)
    _reject_legacy_scheduler_ownership(
        enabled_web_scheduler_only_api_codes(api_configs),
    )
    try:
        with _sync_task_lock(engine):
            rate_limiter = MySqlApiRateLimiter(
                engine,
                utilization=settings.jijia_rate_limit_utilization,
            )
            auth_client = JijiaAuthClient(settings, rate_limiter=rate_limiter)
            token = auth_client.get_access_token()
            result = SyncEngine(api_configs, engine).sync_enabled_apis(
                JijiaApiClient(
                    settings,
                    auth_client=auth_client,
                    rate_limiter=rate_limiter,
                ),
                token,
            )
    except HTTPError as error:
        status_code = error.response.status_code if error.response is not None else "unknown"
        logger.error(
            "sync enabled failed: http_status=%s error_type=%s",
            status_code,
            type(error).__name__,
        )
        raise SystemExit(1) from None
    except (RequestException, SQLAlchemyError, ValueError) as error:
        logger.error(
            "sync enabled failed: error_type=%s",
            type(error).__name__,
        )
        raise SystemExit(1) from None

    if result["failed_count"]:
        logger.error(
            "sync enabled finished with failed APIs: batch=%s failed=%s",
            result["batch_no"],
            result["failed_count"],
        )
        raise SystemExit(1) from None
    logger.info(
        "sync enabled ok: batch=%s apis=%s rows=%s requests=%s",
        result["batch_no"],
        result["api_count"],
        result["item_count"],
        result["request_count"],
    )


def _probe_single_api(settings, api_code: str) -> None:
    """只读预检单个普通分页 API 的总数和最小页数。"""
    logger = logging.getLogger(__name__)
    engine = create_db_engine(settings)
    api_configs = load_published_api_configs(engine)
    try:
        rate_limiter = MySqlApiRateLimiter(
            engine,
            utilization=settings.jijia_rate_limit_utilization,
        )
        auth_client = JijiaAuthClient(settings, rate_limiter=rate_limiter)
        token = auth_client.get_access_token()
        result = SyncEngine(api_configs).probe_api(
            api_code,
            JijiaApiClient(
                settings,
                auth_client=auth_client,
                rate_limiter=rate_limiter,
            ),
            token,
        )
    except HTTPError as error:
        status_code = error.response.status_code if error.response is not None else "unknown"
        logger.error("pagination probe failed: http_status=%s", status_code)
        raise SystemExit(1) from None
    except ApiRequestError as error:
        original_error = error.original_error
        response = getattr(original_error, "response", None)
        original_status_code = getattr(response, "status_code", None)
        logger.error(
            "pagination probe failed: error_type=%s http_status=%s",
            type(original_error).__name__,
            original_status_code if original_status_code is not None else "unknown",
        )
        raise SystemExit(1) from None
    except (RequestException, ValueError) as error:
        logger.error("pagination probe failed: error_type=%s", type(error).__name__)
        raise SystemExit(1) from None

    logger.info(
        "pagination probe ok: api_code=%s total_count=%s page_size=%s "
        "required_pages=%s requests=%s",
        result["api_code"],
        result["total_count"],
        result["page_size"],
        result["required_pages"],
        result["request_count"],
    )


def _run_single_api(settings, api_code: str, action_label: str) -> None:
    """同步单个指定 API。

    主要用于接入新接口时小范围验证配置、分页和入库结果，避免一上来跑完整
    API 列表导致排查范围过大。
    """
    logger = logging.getLogger(__name__)
    _reject_legacy_scheduler_ownership(
        (api_code,) if api_code in WEB_SCHEDULER_ONLY_API_CODES else (),
    )
    engine = create_db_engine(settings)
    api_configs = load_published_api_configs(engine)
    try:
        with _sync_task_lock(engine):
            rate_limiter = MySqlApiRateLimiter(
                engine,
                utilization=settings.jijia_rate_limit_utilization,
            )
            auth_client = JijiaAuthClient(settings, rate_limiter=rate_limiter)
            token = auth_client.get_access_token()
            result = SyncEngine(api_configs, engine).test_api_once(
                api_code,
                JijiaApiClient(
                    settings,
                    auth_client=auth_client,
                    rate_limiter=rate_limiter,
                ),
                token,
            )
    except HTTPError as error:
        status_code = error.response.status_code if error.response is not None else "unknown"
        logger.error(
            "%s failed: http_status=%s error_type=%s",
            action_label,
            status_code,
            type(error).__name__,
        )
        raise SystemExit(1) from None
    except (RequestException, SQLAlchemyError, ValueError) as error:
        logger.error(
            "%s failed: error_type=%s",
            action_label,
            type(error).__name__,
        )
        raise SystemExit(1) from None

    if result["failed_count"]:
        logger.error("%s failed: batch=%s", action_label, result["batch_no"])
        raise SystemExit(1)
    logger.info(
        "%s ok: api_code=%s batch=%s rows=%s requests=%s",
        action_label,
        api_code,
        result["batch_no"],
        result["item_count"],
        result["request_count"],
    )


def _reject_legacy_scheduler_ownership(api_codes: tuple[str, ...]) -> None:
    """阻止 Web 独占接口再次从 legacy 入口写入账号 0。"""
    if not api_codes:
        return
    logging.getLogger(__name__).error(
        "legacy sync blocked: code=LEGACY_SCHEDULER_OWNERSHIP_CONFLICT api_code_count=%s",
        len(api_codes),
    )
    raise SystemExit(2)


if __name__ == "__main__":
    main()
