import argparse
import json
from collections.abc import Sequence
from datetime import UTC, date, datetime
from importlib import import_module
from typing import cast

import requests
from sqlalchemy import insert, select, update
from sqlalchemy.engine import Engine

from app.api_config_registry import load_published_api_config
from app.api_rate_limiter import MySqlApiRateLimiter
from app.auth import JijiaAuthClient, JijiaCredentials
from app.config import load_settings
from app.sale_return_discovery import discover_earliest_date
from backend.app.core.config import get_web_settings
from backend.app.core.credentials import CredentialCipher
from backend.app.core.database import SessionLocal
from backend.app.core.errors import ApiError
from backend.app.core.product import PRODUCT_NAME
from backend.app.models.jijia_account import (
    CredentialSource,
    JijiaAccount,
    JijiaAccountStatus,
)
from backend.app.models.sync_records import sync_checkpoint_table
from backend.app.models.user import AppUser, UserRole, UserStatus
from backend.app.services.auth_service import create_invitation
from backend.app.services.m3_common import json_object
from backend.app.services.mail_service import create_mail_sender

SALE_RETURN_API_CODE = "sale_return_order_page"
SALE_RETURN_CHECKPOINT_KIND = "history_backfill"
DISCOVERY_START_SOURCE = "earliest_date_discovery"


def bootstrap_admin(email: str) -> None:
    """在系统尚无管理员时生成首个管理员邀请。"""
    settings = get_web_settings()
    mail_sender = create_mail_sender(settings)
    with SessionLocal() as db:
        existing_admin = db.scalar(
            select(AppUser).where(
                AppUser.role == UserRole.ADMIN,
                AppUser.status.in_([UserStatus.INVITED, UserStatus.ACTIVE]),
            )
        )
        if existing_admin is not None:
            raise ApiError(409, "ADMIN_ALREADY_EXISTS", "管理员已经初始化")
        create_invitation(
            db,
            email,
            UserRole.ADMIN,
            created_by=None,
            settings=settings,
            mail_sender=mail_sender,
            request_id=None,
        )
    print("首个管理员邀请已创建")


def discover_sale_return_start(
    account_id: int,
    start_date: date,
    end_date: date,
    timeout_seconds: int,
    *,
    save_backfill_start: bool = False,
) -> dict[str, object]:
    """使用 Web 账号的加密凭据只读定位退货单最早日期。"""
    web_settings = get_web_settings()
    app_settings = load_settings()
    with SessionLocal() as db:
        account = db.get(JijiaAccount, account_id)
        if account is None:
            raise ApiError(404, "ACCOUNT_NOT_FOUND", "积加账号不存在")
        if account.status != JijiaAccountStatus.ACTIVE:
            raise ApiError(409, "ACCOUNT_NOT_ACTIVE", "积加账号未处于可用状态")
        if account.credential_source != CredentialSource.ENCRYPTED:
            raise ApiError(409, "ACCOUNT_CREDENTIAL_UNSUPPORTED", "账号不是加密凭据来源")
        if not account.encrypted_app_id or not account.encrypted_app_key:
            raise ApiError(409, "ACCOUNT_CREDENTIAL_MISSING", "账号缺少加密凭据")
        cipher = CredentialCipher(web_settings.credential_encryption_key)
        credentials = JijiaCredentials(
            app_id=cipher.decrypt(account.encrypted_app_id),
            app_key=cipher.decrypt(account.encrypted_app_key),
        )
        api = load_published_api_config(db, SALE_RETURN_API_CODE)
        if api is None:
            raise ApiError(409, "API_CONFIG_MISSING", "退货订单接口配置不存在")
        rate_limiter = MySqlApiRateLimiter(
            cast(Engine, db.get_bind()),
            utilization=app_settings.jijia_rate_limit_utilization,
        )

    auth_client = JijiaAuthClient(
        app_settings,
        timeout_seconds=timeout_seconds,
        credentials=credentials,
        use_token_cache=False,
        rate_limiter=rate_limiter,
    )
    token = auth_client.get_access_token(force_refresh=True)
    # 与 Worker 保持相同边界，避免 Web 类型检查接管旧同步客户端的历史债务。
    api_client_class = import_module("app.api_client").JijiaApiClient
    api_client = api_client_class(
        app_settings,
        timeout_seconds=timeout_seconds,
        auth_client=auth_client,
        rate_limiter=rate_limiter,
    )
    result = discover_earliest_date(
        lambda params: api_client.request(api, token, params),
        start_date,
        end_date,
    )
    if save_backfill_start:
        save_result = _save_discovered_backfill_start(
            account_id,
            result,
            start_date,
            end_date,
        )
        return {"account_id": account_id, **result, **save_result}
    return {"account_id": account_id, **result}


def _save_discovered_backfill_start(
    account_id: int,
    discovery: dict[str, object],
    scan_start: date,
    scan_end: date,
) -> dict[str, object]:
    """显式把完整发现结果写为尚未启动的历史回填基线。"""
    earliest_value = discovery.get("earliest_data_date")
    if discovery.get("complete") is not True or earliest_value is None:
        return {
            "backfill_start_saved": False,
            "backfill_start_status": "no_data",
        }
    try:
        earliest = date.fromisoformat(str(earliest_value))
    except ValueError as error:
        raise ApiError(409, "DISCOVERY_RESULT_INVALID", "历史起点发现结果无效") from error
    if earliest < scan_start or earliest > scan_end:
        raise ApiError(409, "DISCOVERY_RESULT_INVALID", "历史起点超出本次扫描范围")

    with SessionLocal() as db:
        account = db.get(JijiaAccount, account_id)
        if account is None:
            raise ApiError(404, "ACCOUNT_NOT_FOUND", "积加账号不存在")
        if account.status != JijiaAccountStatus.ACTIVE:
            raise ApiError(409, "ACCOUNT_NOT_ACTIVE", "积加账号未处于可用状态")
        row = (
            db.execute(
                select(sync_checkpoint_table)
                .where(
                    sync_checkpoint_table.c.jijia_account_id == account_id,
                    sync_checkpoint_table.c.api_code == SALE_RETURN_API_CODE,
                    sync_checkpoint_table.c.checkpoint_kind == SALE_RETURN_CHECKPOINT_KIND,
                )
                .with_for_update()
            )
            .mappings()
            .one_or_none()
        )
        checkpoint_value = {
            "next_window_start": earliest.isoformat(),
            "absolute_lower_bound": earliest.isoformat(),
            "start_source": DISCOVERY_START_SOURCE,
            "discovery_scan_lower_bound": scan_start.isoformat(),
            "discovery_scan_upper_bound": scan_end.isoformat(),
        }
        if row is None:
            now = datetime.now(UTC).replace(tzinfo=None)
            db.execute(
                insert(sync_checkpoint_table).values(
                    jijia_account_id=account_id,
                    api_code=SALE_RETURN_API_CODE,
                    checkpoint_kind=SALE_RETURN_CHECKPOINT_KIND,
                    checkpoint_value=checkpoint_value,
                    created_at=now,
                    updated_at=now,
                )
            )
            status = "created"
        else:
            existing = json_object(row["checkpoint_value"])
            same_start = (
                existing.get("next_window_start") == earliest.isoformat()
                and existing.get("absolute_lower_bound") == earliest.isoformat()
            )
            if same_start:
                return {
                    "backfill_start_saved": False,
                    "backfill_start_status": "unchanged",
                }
            progressed = bool(
                row["last_sync_batch_no"]
                or existing.get("window_start")
                or existing.get("window_end")
                or existing.get("frozen_window_end")
                or existing.get("backfill_started_at")
            )
            if progressed or existing.get("start_source") != DISCOVERY_START_SOURCE:
                raise ApiError(
                    409,
                    "BACKFILL_CHECKPOINT_ALREADY_STARTED",
                    "历史回填检查点已经存在，发现结果未覆盖现有进度",
                )
            db.execute(
                update(sync_checkpoint_table)
                .where(sync_checkpoint_table.c.id == row["id"])
                .values(checkpoint_value={**existing, **checkpoint_value})
            )
            status = "updated"
        db.commit()
    return {
        "backfill_start_saved": True,
        "backfill_start_status": status,
    }


def main(argv: Sequence[str] | None = None) -> None:
    """解析 Web 服务运维命令。"""
    parser = argparse.ArgumentParser(description=f"{PRODUCT_NAME}运维命令")
    subparsers = parser.add_subparsers(dest="command", required=True)
    bootstrap_parser = subparsers.add_parser("bootstrap-admin", help="创建首个管理员邀请")
    bootstrap_parser.add_argument("--email", required=True, help="管理员邮箱")
    discovery_parser = subparsers.add_parser(
        "discover-sale-return-start",
        help="只读定位指定 Web 账号的最早退货单日期",
    )
    discovery_parser.add_argument("--account-id", required=True, type=int)
    discovery_parser.add_argument("--start-date", required=True, type=date.fromisoformat)
    discovery_parser.add_argument("--end-date", required=True, type=date.fromisoformat)
    discovery_parser.add_argument("--timeout-seconds", type=int, default=30)
    discovery_parser.add_argument(
        "--confirm-read-only-api",
        action="store_true",
        help="确认允许调用指定账号的真实积加只读接口",
    )
    discovery_parser.add_argument(
        "--save-backfill-start",
        action="store_true",
        help="显式将发现日保存为该账号首次历史回填起点",
    )
    args = parser.parse_args(argv)

    try:
        if args.command == "bootstrap-admin":
            bootstrap_admin(args.email)
        elif args.command == "discover-sale-return-start":
            if not args.confirm_read_only_api:
                parser.error("discover-sale-return-start requires --confirm-read-only-api")
            if args.account_id <= 0:
                parser.error("account-id 必须大于 0")
            if args.timeout_seconds <= 0:
                parser.error("timeout-seconds 必须大于 0")
            result = discover_sale_return_start(
                args.account_id,
                args.start_date,
                args.end_date,
                args.timeout_seconds,
                save_backfill_start=args.save_backfill_start,
            )
            print(json.dumps(result, ensure_ascii=True, separators=(",", ":")))
    except ApiError as error:
        parser.error(error.message)
    except requests.RequestException:
        parser.error("历史起点发现请求失败")
    except ValueError as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
