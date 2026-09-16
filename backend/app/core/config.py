from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from cryptography.fernet import Fernet
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.sync_lock import SyncLockScope


class WebSettings(BaseSettings):
    """集中管理身份认证和邮件配置。"""

    app_env: str = "local"
    log_level: str = "INFO"
    public_web_url: str = "http://localhost:5173"
    lan_public_web_url: str = ""
    session_cookie_name: str = "jijia_session"
    session_cookie_secure: bool = False
    session_absolute_hours: int = 12
    session_idle_minutes: int = 120
    invitation_ttl_hours: int = 24
    password_reset_ttl_minutes: int = Field(default=30, gt=0)
    password_min_length: int = 12
    login_max_failures: int = 5
    login_lock_minutes: int = 15
    api_config_path: Path = Path("config/api_config.example.yaml")
    api_catalog_path: Path = Path("config/jijia_api_catalog.generated.json")
    credential_encryption_key: str = ""
    worker_poll_seconds: float = 3
    worker_heartbeat_seconds: float = 30
    worker_stale_minutes: float = 10
    worker_name: str = Field(default="", max_length=50)
    worker_processes: int = Field(default=1, ge=1)
    sync_lock_scope: SyncLockScope = "global"

    mail_provider: Literal["smtp", "console", "fake"] = "console"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_use_tls: bool = True

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @model_validator(mode="after")
    def validate_production_settings(self) -> "WebSettings":
        """拒绝会导致运行异常或降低生产安全性的配置。"""
        environment = self.app_env.lower()
        _apply_lan_public_url(self, environment)
        _validate_worker_timing(self)
        if environment in {"prod", "production"}:
            _validate_production_web_and_mail(self)
            _validate_production_credentials(self)
        return self


def _apply_lan_public_url(settings: WebSettings, environment: str) -> None:
    """校验局域网地址并将其设为本地公开地址。"""
    if not settings.lan_public_web_url:
        return
    if environment != "local":
        raise ValueError("LAN_PUBLIC_WEB_URL is only allowed in local mode")
    lan_url = urlsplit(settings.lan_public_web_url)
    if lan_url.scheme.lower() not in {"http", "https"} or not lan_url.hostname:
        raise ValueError("LAN_PUBLIC_WEB_URL requires an HTTP(S) URL")
    settings.public_web_url = settings.lan_public_web_url.rstrip("/")


def _validate_worker_timing(settings: WebSettings) -> None:
    """校验 Worker 轮询、心跳和失联判定时间。"""
    if settings.worker_poll_seconds <= 0:
        raise ValueError("WORKER_POLL_SECONDS must be greater than zero")
    if settings.worker_heartbeat_seconds <= 0:
        raise ValueError("WORKER_HEARTBEAT_SECONDS must be greater than zero")
    if settings.worker_stale_minutes <= 0:
        raise ValueError("WORKER_STALE_MINUTES must be greater than zero")
    if settings.worker_stale_minutes * 60 < settings.worker_heartbeat_seconds * 3:
        raise ValueError("Worker stale window must cover at least three heartbeats")


def _validate_production_web_and_mail(settings: WebSettings) -> None:
    """校验生产公开地址和邮件传输配置。"""
    if settings.mail_provider != "smtp":
        raise ValueError("Production requires MAIL_PROVIDER=smtp")
    public_url = urlsplit(settings.public_web_url)
    if public_url.scheme.lower() != "https" or not public_url.hostname:
        raise ValueError("Production requires HTTPS PUBLIC_WEB_URL")
    if not settings.smtp_host.strip():
        raise ValueError("Production requires SMTP_HOST")
    if not settings.smtp_from.strip():
        raise ValueError("Production requires SMTP_FROM")
    if not settings.smtp_use_tls:
        raise ValueError("Production requires SMTP_USE_TLS=true")


def _validate_production_credentials(settings: WebSettings) -> None:
    """校验生产会话 Cookie 和凭据加密密钥。"""
    if not settings.session_cookie_secure:
        raise ValueError("Production requires SESSION_COOKIE_SECURE=true")
    if not settings.session_cookie_name.startswith("__Host-"):
        raise ValueError("Production session cookie must use the __Host- prefix")
    if not settings.credential_encryption_key:
        raise ValueError("Production requires CREDENTIAL_ENCRYPTION_KEY")
    try:
        Fernet(settings.credential_encryption_key.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as error:
        raise ValueError("Production requires a valid CREDENTIAL_ENCRYPTION_KEY") from error


@lru_cache
def get_web_settings() -> WebSettings:
    """加载并缓存 Web 服务配置。"""
    return WebSettings()
