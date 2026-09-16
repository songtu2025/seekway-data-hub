import os
import sys
from pathlib import Path
from types import ModuleType
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from fastapi import FastAPI


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def create_e2e_app() -> "FastAPI":
    """创建只使用合成数据和内存 SQLite 的浏览器测试应用。"""
    password = _prepare_safe_environment()
    _require_fresh_process()

    from cryptography.fernet import Fernet
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
    )

    def default_get_db() -> Any:
        with session_factory() as session:
            yield session

    # 生产入口导入前先放入 SQLite 数据库模块，避免创建任何 MySQL 引擎。
    database_module = ModuleType("backend.app.core.database")
    database_module.engine = engine  # type: ignore[attr-defined]
    database_module.SessionLocal = session_factory  # type: ignore[attr-defined]
    database_module.get_db = default_get_db  # type: ignore[attr-defined]
    sys.modules[database_module.__name__] = database_module

    from backend.app.api.deps import get_mail_sender
    from backend.app.core.config import WebSettings, get_web_settings
    from backend.app.models import Base
    from backend.app.models.sync_records import sync_records_metadata
    from backend.app.services import jijia_account_service
    from backend.app.services.mail_service import FakeMailSender

    credential_key = Fernet.generate_key().decode("ascii")
    settings = WebSettings(
        _env_file=None,  # type: ignore[call-arg]
        app_env="test",
        log_level="WARNING",
        public_web_url="http://127.0.0.1:5173",
        session_cookie_name="jijia_e2e_session",
        session_cookie_secure=False,
        api_config_path=PROJECT_ROOT / "config" / "api_config.example.yaml",
        api_catalog_path=PROJECT_ROOT / "config" / "jijia_api_catalog.generated.json",
        credential_encryption_key=credential_key,
        mail_provider="fake",
    )
    mail_sender = FakeMailSender()

    def verify_credentials_locally(app_id: str, app_key: str, **_kwargs) -> None:
        """浏览器测试只确认本地凭据链路，禁止请求积加 Token。"""
        del app_id, app_key

    jijia_account_service.verify_account_credentials = verify_credentials_locally

    from backend.app.main import create_app

    Base.metadata.create_all(engine)
    sync_records_metadata.create_all(engine)
    _seed_e2e_data(session_factory, password, settings)
    _publish_e2e_api_configs(session_factory, settings)

    app = create_app(validate_settings=False)

    def override_get_db() -> Any:
        with session_factory() as session:
            yield session

    def override_settings() -> WebSettings:
        return settings

    def override_mail_sender() -> FakeMailSender:
        return mail_sender

    app.dependency_overrides[default_get_db] = override_get_db
    app.dependency_overrides[get_web_settings] = override_settings
    app.dependency_overrides[get_mail_sender] = override_mail_sender
    app.state.e2e_engine = engine
    app.state.e2e_mail_sender = mail_sender
    app.state.e2e_session_factory = session_factory
    return app


def _publish_e2e_api_configs(session_factory: Any, settings: Any) -> None:
    """发布真实结构的本地配置，但不触发任何外部接口调用。"""
    from app.config import load_api_configs
    from backend.app.services.api_config_publish_service import publish_api_configs

    with session_factory() as db:
        publish_api_configs(
            db,
            load_api_configs(settings.api_config_path),
            settings.api_catalog_path,
        )


def _prepare_safe_environment() -> str:
    """先关闭真实配置来源，再允许导入生产模块。"""
    if os.environ.get("JIJIA_E2E_ENABLED") != "1":
        raise RuntimeError("E2E factory requires JIJIA_E2E_ENABLED=1")
    password = os.environ.get("JIJIA_E2E_PASSWORD", "")
    if len(password) < 12:
        raise RuntimeError("JIJIA_E2E_PASSWORD must contain at least 12 characters")
    os.environ.update(
        {
            "APP_ENV": "test",
            "DB_HOST": "e2e-database.invalid",
            "DB_PORT": "9",
            "DB_NAME": "e2e_synthetic",
            "DB_USER": "e2e_synthetic",
            "DB_PASSWORD": "e2e-synthetic-password",
            "JIJIA_BASE_URL": "https://example.invalid",
            "JIJIA_OPEN_GATEWAY_PREFIX": "/api/open",
            "JIJIA_APP_ID": "e2e-synthetic-app-id",
            "JIJIA_APP_KEY": "e2e-synthetic-app-key",
            "JIJIA_TOKEN_URL": "/never-requested",
        }
    )
    return password


def _require_fresh_process() -> None:
    """拒绝在已经加载生产模块的进程中补做隔离。"""
    loaded = next(
        (
            name
            for name in sys.modules
            if name == "app"
            or name.startswith("app.")
            or name == "backend.app"
            or name.startswith("backend.app.")
        ),
        None,
    )
    if loaded is not None:
        raise RuntimeError("E2E factory requires a dedicated fresh process")


def _seed_e2e_data(
    session_factory: Any,
    password: str,
    settings: Any,
) -> None:
    """种入浏览器验证角色、同步入口和原始数据权限所需的数据。"""
    import hashlib
    import json
    from datetime import date, datetime

    from backend.app.core.credentials import CredentialCipher
    from backend.app.core.security import hash_password, utc_now
    from backend.app.models import (
        AccountApiPolicy,
        AppUser,
        CredentialSource,
        JijiaAccount,
        JijiaAccountStatus,
        ScheduleMode,
        SyncJob,
        UserRole,
        UserStatus,
        WindowMode,
    )
    from backend.app.models.sync_records import (
        raw_api_data_history_table,
        raw_api_data_table,
        sync_api_log_table,
        sync_batch_table,
        sync_checkpoint_table,
    )

    password_hash = hash_password(password)
    users = [
        AppUser(
            email=f"{role.value}@e2e.example.com",
            display_name=f"E2E {role.value}",
            password_hash=password_hash,
            role=role,
            status=UserStatus.ACTIVE,
            failed_login_count=0,
        )
        for role in (UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
    ]
    with session_factory() as db:
        db.add_all(users)
        db.flush()
        cipher = CredentialCipher(settings.credential_encryption_key)
        account = JijiaAccount(
            account_code="acct_e2e_synthetic",
            name="E2E 合成账号",
            masked_app_id="•••• e2e1",
            encrypted_app_id=cipher.encrypt("e2e-app-id"),
            encrypted_app_key=cipher.encrypt("e2e-app-key"),
            credential_source=CredentialSource.ENCRYPTED,
            status=JijiaAccountStatus.ACTIVE,
            last_verified_at=utc_now(),
            last_verify_error=None,
            created_by=users[0].id,
            updated_by=users[0].id,
        )
        second_account = JijiaAccount(
            account_code="acct_e2e_synthetic_second",
            name="E2E 第二合成账号",
            masked_app_id="•••• e2e2",
            encrypted_app_id=cipher.encrypt("e2e-second-app-id"),
            encrypted_app_key=cipher.encrypt("e2e-second-app-key"),
            credential_source=CredentialSource.ENCRYPTED,
            status=JijiaAccountStatus.ACTIVE,
            last_verified_at=utc_now(),
            last_verify_error=None,
            created_by=users[0].id,
            updated_by=users[0].id,
        )
        db.add_all([account, second_account])
        db.flush()
        db.add_all(
            [
                AccountApiPolicy(
                    jijia_account_id=account.id,
                    api_code="sale_return_order_page",
                    enabled=True,
                    schedule_mode=ScheduleMode.MANUAL_ONLY,
                    schedule_expr=None,
                    timezone="Asia/Shanghai",
                    window_mode=WindowMode.START_DATE,
                    lookback_days=None,
                    start_date=date(2020, 1, 1),
                    next_run_at=None,
                    created_by=users[0].id,
                    updated_by=users[0].id,
                ),
                AccountApiPolicy(
                    jijia_account_id=second_account.id,
                    api_code="sale_return_order_page",
                    enabled=True,
                    schedule_mode=ScheduleMode.MANUAL_ONLY,
                    schedule_expr=None,
                    timezone="Asia/Shanghai",
                    window_mode=WindowMode.START_DATE,
                    lookback_days=None,
                    start_date=date(2020, 1, 1),
                    next_run_at=None,
                    created_by=users[0].id,
                    updated_by=users[0].id,
                ),
            ]
        )
        observed_at = datetime(2026, 8, 26, 0, 0)
        first_batch_no = "e2e-batch-raw-001"
        second_batch_no = "e2e-batch-raw-002"
        backfill_started_at = "2026-08-26T00:00:00Z"
        history_progress = {
            "completedWindows": 79,
            "totalWindows": 79,
            "currentWindow": {
                "startDate": "2026-08-15",
                "endDate": "2026-08-25",
            },
            "currentPage": 1,
            "totalPages": 1,
            "earliestObservedDataDate": "2026-08-24",
            "historyCompleteThrough": "2026-08-25",
            "changeCatchup": "incremental_ready",
            "_frozenWindowEnd": "2026-08-25",
            "_backfillStartedAt": backfill_started_at,
            "_incrementalWindowDays": 31,
            "_incrementalTimezone": "Asia/Shanghai",
            "_incrementalLagDays": 1,
        }
        jobs = [
            SyncJob(
                job_no=f"job-e2e-success-{index}",
                jijia_account_id=target_account.id,
                api_code="sale_return_order_page",
                job_type="history_backfill",
                trigger_type="manual",
                status="success",
                schedule_slot_key=None,
                window_start=date(2026, 8, 15),
                window_end=date(2026, 8, 25),
                progress_json=history_progress,
                worker_id=None,
                attempt_count=1,
                max_attempts=2,
                heartbeat_at=observed_at,
                sync_batch_no=batch_no,
                retry_of_job_id=None,
                requested_by=users[0].id,
                queued_at=observed_at,
                started_at=observed_at,
                finished_at=observed_at,
                error_code=None,
                error_message=None,
                created_at=observed_at,
                updated_at=observed_at,
            )
            for index, target_account, batch_no in (
                (1, account, first_batch_no),
                (2, second_account, second_batch_no),
            )
        ]
        db.add_all(jobs)
        db.flush()
        db.execute(
            sync_batch_table.insert(),
            [
                {
                    "sync_batch_no": batch_no,
                    "jijia_account_id": target_account.id,
                    "sync_job_id": job.id,
                    "status": "success",
                    "started_at": observed_at,
                    "finished_at": observed_at,
                    "total_api_count": 1,
                    "success_api_count": 1,
                    "failed_api_count": 0,
                    "message": None,
                    "created_at": observed_at,
                    "updated_at": observed_at,
                }
                for job, target_account, batch_no in (
                    (jobs[0], account, first_batch_no),
                    (jobs[1], second_account, second_batch_no),
                )
            ],
        )
        normal_logs = [
            {
                "sync_batch_no": batch_no,
                "jijia_account_id": target_account.id,
                "api_code": "sale_return_order_page",
                "status": "success",
                "request_count": 1,
                "success_count": 1,
                "failed_count": 0,
                "started_at": observed_at,
                "finished_at": observed_at,
                "error_message": None,
                "created_at": observed_at,
                "updated_at": observed_at,
            }
            for target_account, batch_no in (
                (account, first_batch_no),
                (second_account, second_batch_no),
            )
        ]
        poison_log = {
            **normal_logs[1],
            "sync_batch_no": first_batch_no,
        }
        db.execute(sync_api_log_table.insert(), [*normal_logs, poison_log])
        db.execute(
            sync_checkpoint_table.insert(),
            [
                {
                    "jijia_account_id": target_account.id,
                    "api_code": "sale_return_order_page",
                    "checkpoint_kind": "history_backfill",
                    "checkpoint_value": {
                        "window_start": "2026-08-15",
                        "window_end": "2026-08-25",
                        "next_window_start": "2026-08-26",
                        "frozen_window_end": "2026-08-25",
                        "backfill_started_at": "2026-08-26T00:00:00",
                        "window_days": 31,
                        "absolute_lower_bound": "2020-01-01",
                    },
                    "checkpoint_time": observed_at,
                    "last_sync_batch_no": batch_no,
                    "created_at": observed_at,
                    "updated_at": observed_at,
                }
                for target_account, batch_no in (
                    (account, first_batch_no),
                    (second_account, second_batch_no),
                )
            ],
        )
        raw_marker = {
            "synthetic": True,
            "returnOrderId": "E2E-RETURN-001",
        }
        source_primary_key = "E2E-RETURN-001"
        record_identity = hashlib.sha256(f"pk:{source_primary_key}".encode()).hexdigest()
        data_hash = hashlib.sha256(
            json.dumps(
                raw_marker,
                ensure_ascii=False,
                sort_keys=True,
                default=str,
            ).encode("utf-8")
        ).hexdigest()
        current_raw = {
            "jijia_account_id": account.id,
            "api_code": "sale_return_order_page",
            "source_primary_key": source_primary_key,
            "record_identity": record_identity,
            "data_hash": data_hash,
            "raw_json": raw_marker,
            "data_date": date(2026, 8, 24),
            "sync_batch_no": first_batch_no,
            "first_observed_at": observed_at,
            "last_observed_at": observed_at,
            "observation_count": 1,
            "created_at": observed_at,
            "updated_at": observed_at,
        }
        second_raw_marker = {
            "synthetic": True,
            "returnOrderId": "E2E-RETURN-001",
            "accountMarker": "SECOND",
        }
        second_current_raw = {
            **current_raw,
            "jijia_account_id": second_account.id,
            "data_hash": hashlib.sha256(
                json.dumps(
                    second_raw_marker,
                    ensure_ascii=False,
                    sort_keys=True,
                    default=str,
                ).encode("utf-8")
            ).hexdigest(),
            "raw_json": second_raw_marker,
            "sync_batch_no": second_batch_no,
        }
        parsed_payloads = [
            (
                "amazon_shop_page",
                "E2E-STORE-001",
                {
                    "sellerId": "E2E-SENSITIVE-SELLER",
                    "marketListVos": [
                        {
                            "marketId": 70,
                            "store": "北美旗舰店",
                            "marketName": "Amazon.com",
                            "countryName": "美国",
                            "areaName": "北美",
                            "apiState": "Normal",
                            "adsState": "Successfully",
                            "warehouseName": "ONT8",
                            "authType": "SP-API",
                            "recordDate": "2026-09-05 12:00:00",
                            "refreshToken": "E2E-SENSITIVE-TOKEN",
                        }
                    ],
                },
            ),
            (
                "product_page",
                "E2E-PRODUCT-001",
                {
                    "sku": "E2E-SKU-001",
                    "name": "65W 快充充电器",
                    "briefName": "65W 快充",
                    "brandName": "E2E 品牌",
                    "categoryName": "电子配件",
                    "productTypeName": "标准品",
                    "state": 0,
                    "unit": "件",
                    "lastDate": "2026-09-06 09:00:00",
                },
            ),
            (
                "fba_inventory_v2_page",
                "E2E-INVENTORY-001",
                {
                    "sku": "E2E-SKU-001",
                    "msku": "E2E-MSKU-001",
                    "fnsku": "E2E-FNSKU-001",
                    "asin": "E2E-ASIN-001",
                    "productName": "65W 快充充电器",
                    "warehouseName": "ONT8",
                    "afnFulfillableQuantity": 120,
                    "reserved": 8,
                    "inTransitQty": 24,
                    "totalInventoryQty": 152,
                    "availableTurnoverDays": 30.4,
                    "updateTime": "2026-09-06 09:00:00",
                },
            ),
            (
                "fba_warehouse_page",
                "E2E-WAREHOUSE-001",
                {
                    "name": "ONT8",
                    "marketName": "北美旗舰店",
                    "country": "美国",
                    "stateStr": "加利福尼亚州",
                    "statusName": "启用",
                    "typeName": "FBA",
                    "fbaProcurementMethodName": "平台采购",
                    "transferWarehouseName": "洛杉矶中转仓",
                    "createDate": "2026-08-01 10:00:00",
                },
            ),
        ]
        parsed_rows = []
        for api_code, source_key, payload in parsed_payloads:
            parsed_rows.append(
                {
                    **current_raw,
                    "api_code": api_code,
                    "source_primary_key": source_key,
                    "record_identity": hashlib.sha256(f"pk:{source_key}".encode()).hexdigest(),
                    "data_hash": hashlib.sha256(
                        json.dumps(
                            payload,
                            ensure_ascii=False,
                            sort_keys=True,
                        ).encode("utf-8")
                    ).hexdigest(),
                    "raw_json": payload,
                }
            )
        db.execute(
            raw_api_data_table.insert(),
            [current_raw, second_current_raw, *parsed_rows],
        )
        db.execute(
            raw_api_data_history_table.insert(),
            [
                {
                    "jijia_account_id": raw["jijia_account_id"],
                    "api_code": raw["api_code"],
                    "record_identity": raw["record_identity"],
                    "source_primary_key": raw["source_primary_key"],
                    "data_hash": raw["data_hash"],
                    "raw_json": raw["raw_json"],
                    "data_date": raw["data_date"],
                    "sync_batch_no": raw["sync_batch_no"],
                    "observed_at": observed_at,
                    "created_at": observed_at,
                    "updated_at": observed_at,
                }
                for raw in (current_raw, second_current_raw)
            ],
        )
        db.commit()
