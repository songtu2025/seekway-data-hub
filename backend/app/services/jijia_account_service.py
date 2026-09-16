import secrets
from typing import cast

from requests import RequestException
from sqlalchemy import func, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.api_rate_limiter import MySqlApiRateLimiter, RequestRateLimiter
from app.auth import JijiaAuthClient, JijiaCredentials
from app.config import load_settings
from backend.app.core.config import WebSettings
from backend.app.core.credentials import CredentialCipher
from backend.app.core.errors import ApiError
from backend.app.core.security import utc_now
from backend.app.models.account_api_policy import AccountApiPolicy, ScheduleMode
from backend.app.models.jijia_account import CredentialSource, JijiaAccount, JijiaAccountStatus
from backend.app.models.sync_job import SyncJob
from backend.app.models.sync_records import raw_api_data_table
from backend.app.schemas.jijia_account import JijiaAccountCreateRequest, JijiaAccountUpdateRequest
from backend.app.services.api_policy_service import ensure_default_policies, load_catalog
from backend.app.services.audit_service import add_audit_log


def account_data(account: JijiaAccount) -> dict[str, object]:
    """返回账号脱敏视图，永不包含凭证密文或明文。"""
    return {
        "id": account.id,
        "accountCode": account.account_code,
        "name": account.name,
        "maskedAppId": account.masked_app_id,
        "credentialSource": account.credential_source.value,
        "status": account.status.value,
        "lastVerifiedAt": (
            account.last_verified_at.isoformat() if account.last_verified_at else None
        ),
        "lastVerifyError": account.last_verify_error,
        "createdAt": account.created_at.isoformat(),
        "updatedAt": account.updated_at.isoformat(),
    }


def create_account(
    db: Session,
    payload: JijiaAccountCreateRequest,
    actor_id: int,
    settings: WebSettings,
    request_id: str,
) -> JijiaAccount:
    """创建待验证账号并加密保存凭证。"""
    cipher = CredentialCipher(settings.credential_encryption_key)
    app_id = payload.app_id.strip()
    app_key = payload.app_key.strip()
    account = JijiaAccount(
        account_code=f"acct_{secrets.token_hex(6)}",
        name=payload.name.strip(),
        masked_app_id=_mask_app_id(app_id),
        encrypted_app_id=cipher.encrypt(app_id),
        encrypted_app_key=cipher.encrypt(app_key),
        credential_source=CredentialSource.ENCRYPTED,
        status=JijiaAccountStatus.PENDING_VERIFICATION,
        created_by=actor_id,
        updated_by=actor_id,
    )
    db.add(account)
    db.flush()
    add_audit_log(
        db,
        actor_user_id=actor_id,
        jijia_account_id=account.id,
        action="jijia_account.create",
        resource_type="jijia_account",
        resource_id=account.id,
        request_id=request_id,
        result="success",
        changes={"status": JijiaAccountStatus.PENDING_VERIFICATION.value},
    )
    db.commit()
    db.refresh(account)
    return account


def update_account(
    db: Session,
    account_id: int,
    payload: JijiaAccountUpdateRequest,
    actor_id: int,
    settings: WebSettings,
    request_id: str,
) -> JijiaAccount:
    """更新名称或写入新凭证，凭证变化后强制重新验证。"""
    account = get_account(db, account_id)
    if account.credential_source != CredentialSource.ENCRYPTED:
        raise ApiError(409, "LEGACY_ACCOUNT_READ_ONLY", "兼容账号不能在页面修改凭证")
    cipher = CredentialCipher(settings.credential_encryption_key)
    if payload.name is not None:
        account.name = payload.name.strip()
    credentials_changed = payload.app_id is not None or payload.app_key is not None
    if credentials_changed:
        if not account.encrypted_app_id or not account.encrypted_app_key:
            raise ApiError(409, "ACCOUNT_CREDENTIAL_MISSING", "账号缺少可更新的加密凭证")
        app_id = (
            payload.app_id.strip()
            if payload.app_id is not None
            else cipher.decrypt(account.encrypted_app_id)
        )
        app_key = (
            payload.app_key.strip()
            if payload.app_key is not None
            else cipher.decrypt(account.encrypted_app_key)
        )
        account.masked_app_id = _mask_app_id(app_id)
        account.encrypted_app_id = cipher.encrypt(app_id)
        account.encrypted_app_key = cipher.encrypt(app_key)
        account.status = JijiaAccountStatus.PENDING_VERIFICATION
        account.last_verify_error = None
    account.updated_by = actor_id
    changes: dict[str, str | bool | None] = {
        "nameChanged": payload.name is not None,
        "credentialsChanged": credentials_changed,
    }
    if credentials_changed:
        changes["status"] = JijiaAccountStatus.PENDING_VERIFICATION.value
    add_audit_log(
        db,
        actor_user_id=actor_id,
        jijia_account_id=account.id,
        action="jijia_account.update",
        resource_type="jijia_account",
        resource_id=account.id,
        request_id=request_id,
        result="success",
        changes=changes,
    )
    db.commit()
    db.refresh(account)
    return account


def verify_account(
    db: Session,
    account_id: int,
    actor_id: int,
    settings: WebSettings,
    request_id: str,
) -> JijiaAccount:
    """只验证官方 Token，成功后补齐默认接口策略。"""
    account = get_account(db, account_id)
    if not account.encrypted_app_id or not account.encrypted_app_key:
        raise ApiError(409, "ACCOUNT_CREDENTIAL_MISSING", "账号没有可验证的加密凭证")
    frozen_app_id = account.encrypted_app_id
    frozen_app_key = account.encrypted_app_key
    frozen_status = account.status
    # 外部 Token 请求不能占用数据库事务；返回后再用锁定读确认验证对象未变化。
    db.rollback()
    cipher = CredentialCipher(settings.credential_encryption_key)
    app_id = cipher.decrypt(frozen_app_id)
    app_key = cipher.decrypt(frozen_app_key)
    verification_error: RequestException | ValueError | None = None
    try:
        runtime_settings = load_settings()
        verify_account_credentials(
            app_id,
            app_key,
            rate_limiter=MySqlApiRateLimiter(
                cast(Engine, db.get_bind()),
                utilization=runtime_settings.jijia_rate_limit_utilization,
            ),
        )
    except (RequestException, ValueError) as error:
        verification_error = error

    current_account = db.scalar(
        select(JijiaAccount).where(JijiaAccount.id == account_id).with_for_update()
    )
    if (
        current_account is None
        or current_account.encrypted_app_id != frozen_app_id
        or current_account.encrypted_app_key != frozen_app_key
        or current_account.status != frozen_status
    ):
        db.rollback()
        raise ApiError(
            409,
            "ACCOUNT_VERIFY_STALE",
            "账号在验证期间已发生变化，请重新验证",
        )
    account = current_account

    if verification_error is not None:
        account.status = JijiaAccountStatus.VERIFICATION_FAILED
        account.last_verify_error = "积加账号验证失败"
        account.updated_by = actor_id
        add_audit_log(
            db,
            actor_user_id=actor_id,
            jijia_account_id=account.id,
            action="jijia_account.verify",
            resource_type="jijia_account",
            resource_id=account.id,
            request_id=request_id,
            result="failure",
            changes={"status": JijiaAccountStatus.VERIFICATION_FAILED.value},
        )
        db.commit()
        raise ApiError(
            400,
            "ACCOUNT_CREDENTIAL_INVALID",
            "积加账号验证失败",
        ) from verification_error

    account.status = JijiaAccountStatus.ACTIVE
    account.last_verified_at = utc_now()
    account.last_verify_error = None
    account.updated_by = actor_id
    ensure_default_policies(db, account, actor_id)
    add_audit_log(
        db,
        actor_user_id=actor_id,
        jijia_account_id=account.id,
        action="jijia_account.verify",
        resource_type="jijia_account",
        resource_id=account.id,
        request_id=request_id,
        result="success",
        changes={"status": JijiaAccountStatus.ACTIVE.value},
    )
    db.commit()
    db.refresh(account)
    return account


def verify_account_credentials(
    app_id: str,
    app_key: str,
    *,
    rate_limiter: RequestRateLimiter | None = None,
) -> None:
    """使用显式凭证请求一次官方 Token，且不写本地 Token 缓存。"""
    client = JijiaAuthClient(
        load_settings(),
        credentials=JijiaCredentials(app_id=app_id, app_key=app_key),
        use_token_cache=False,
        rate_limiter=rate_limiter,
    )
    client.get_access_token(force_refresh=True)


def deactivate_account(
    db: Session,
    account_id: int,
    actor_id: int,
    request_id: str,
) -> JijiaAccount:
    """停用账号但保留策略和未来历史关联。"""
    account = get_account(db, account_id)
    account.status = JijiaAccountStatus.INACTIVE
    account.updated_by = actor_id
    add_audit_log(
        db,
        actor_user_id=actor_id,
        jijia_account_id=account.id,
        action="jijia_account.deactivate",
        resource_type="jijia_account",
        resource_id=account.id,
        request_id=request_id,
        result="success",
        changes={"status": JijiaAccountStatus.INACTIVE.value},
    )
    db.commit()
    db.refresh(account)
    return account


def get_account(db: Session, account_id: int) -> JijiaAccount:
    account = db.get(JijiaAccount, account_id)
    if account is None:
        raise ApiError(404, "ACCOUNT_NOT_FOUND", "积加账号不存在")
    return account


def list_accounts(db: Session) -> list[JijiaAccount]:
    return list(db.scalars(select(JijiaAccount).order_by(JijiaAccount.id)).all())


def list_account_data(
    db: Session,
) -> list[dict[str, object]]:
    """用单次查询返回账号及同步就绪摘要，避免页面逐账号补查。"""
    return _query_account_data(db)


def get_account_data(
    db: Session,
    account_id: int,
) -> dict[str, object]:
    """返回单个账号及其同步就绪摘要。"""
    rows = _query_account_data(db, account_id)
    if not rows:
        raise ApiError(404, "ACCOUNT_NOT_FOUND", "积加账号不存在")
    return rows[0]


def _query_account_data(
    db: Session,
    account_id: int | None = None,
) -> list[dict[str, object]]:
    """复用账号列表和工作台所需的摘要查询，保持资源字段一致。"""
    enabled_catalog_codes = tuple(
        str(item["api_code"]) for item in load_catalog(db) if bool(item.get("enabled"))
    )
    enabled_policies = (
        select(func.count(AccountApiPolicy.id))
        .where(
            AccountApiPolicy.jijia_account_id == JijiaAccount.id,
            AccountApiPolicy.enabled.is_(True),
            AccountApiPolicy.api_code.in_(enabled_catalog_codes),
        )
        .correlate(JijiaAccount)
        .scalar_subquery()
    )
    scheduled_policies = (
        select(func.count(AccountApiPolicy.id))
        .where(
            AccountApiPolicy.jijia_account_id == JijiaAccount.id,
            AccountApiPolicy.enabled.is_(True),
            AccountApiPolicy.api_code.in_(enabled_catalog_codes),
            AccountApiPolicy.schedule_mode != ScheduleMode.MANUAL_ONLY,
        )
        .correlate(JijiaAccount)
        .scalar_subquery()
    )
    latest_job_status = (
        select(SyncJob.status)
        .where(SyncJob.jijia_account_id == JijiaAccount.id)
        .order_by(SyncJob.created_at.desc(), SyncJob.id.desc())
        .limit(1)
        .correlate(JijiaAccount)
        .scalar_subquery()
    )
    latest_job_at = (
        select(SyncJob.created_at)
        .where(SyncJob.jijia_account_id == JijiaAccount.id)
        .order_by(SyncJob.created_at.desc(), SyncJob.id.desc())
        .limit(1)
        .correlate(JijiaAccount)
        .scalar_subquery()
    )
    latest_data_at = (
        select(raw_api_data_table.c.last_observed_at)
        .where(raw_api_data_table.c.jijia_account_id == JijiaAccount.id)
        .order_by(raw_api_data_table.c.last_observed_at.desc())
        .limit(1)
        .correlate(JijiaAccount)
        .scalar_subquery()
    )
    statement = select(
        JijiaAccount,
        enabled_policies.label("enabled_policies"),
        scheduled_policies.label("scheduled_policies"),
        latest_job_status.label("latest_job_status"),
        latest_job_at.label("latest_job_at"),
        latest_data_at.label("latest_data_at"),
    )
    if account_id is not None:
        statement = statement.where(JijiaAccount.id == account_id)
    rows = db.execute(statement.order_by(JijiaAccount.id)).all()
    return [
        {
            **account_data(row[0]),
            "enabledPolicyCount": int(row.enabled_policies or 0),
            "scheduledPolicyCount": int(row.scheduled_policies or 0),
            "latestJobStatus": row.latest_job_status,
            "latestJobAt": row.latest_job_at.isoformat() if row.latest_job_at else None,
            "latestDataAt": row.latest_data_at.isoformat() if row.latest_data_at else None,
        }
        for row in rows
    ]


def _mask_app_id(app_id: str) -> str:
    tail = app_id[-4:] if len(app_id) > 4 else app_id
    return f"•••• {tail}"
