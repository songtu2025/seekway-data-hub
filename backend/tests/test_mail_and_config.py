import ssl
from email.message import EmailMessage

import pytest
from cryptography.fernet import Fernet
from pydantic import ValidationError

from backend.app.core.config import WebSettings
from backend.app.core.product import PRODUCT_NAME
from backend.app.services import mail_service
from backend.app.services.mail_service import (
    ConsoleMailSender,
    FakeMailSender,
    SmtpMailSender,
    create_mail_sender,
)


class FakeSmtpClient:
    def __init__(self, events: list[str]) -> None:
        self.events = events
        self.messages: list[EmailMessage] = []
        self.tls_context: ssl.SSLContext | None = None

    def __enter__(self) -> "FakeSmtpClient":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def starttls(self, *, context: ssl.SSLContext) -> None:
        self.tls_context = context
        self.events.append("starttls")

    def login(self, _user: str, _password: str) -> None:
        self.events.append("login")

    def send_message(self, message: EmailMessage) -> None:
        self.messages.append(message)
        self.events.append("send")


def test_smtp_starttls_uses_verified_default_context_before_login_and_send(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[str] = []
    connection: dict[str, object] = {}
    client = FakeSmtpClient(events)

    def fake_smtp(
        host: str,
        port: int,
        *,
        timeout: float | None = None,
    ) -> FakeSmtpClient:
        connection.update(host=host, port=port, timeout=timeout)
        return client

    monkeypatch.setattr(mail_service.smtplib, "SMTP", fake_smtp)
    settings = WebSettings(
        _env_file=None,
        mail_provider="smtp",
        smtp_host="smtp.example.com",
        smtp_from="no-reply@example.com",
        smtp_user="mailer",
        smtp_password="placeholder-password",
        smtp_use_tls=True,
    )

    SmtpMailSender(settings).send_invitation(
        "user@example.com",
        "viewer",
        "https://sync.example.com/register#synthetic",
    )
    SmtpMailSender(settings).send_password_reset(
        "user@example.com",
        "https://sync.example.com/reset-password#synthetic",
    )

    assert client.tls_context is not None
    assert client.tls_context.verify_mode == ssl.CERT_REQUIRED
    assert client.tls_context.check_hostname is True
    assert connection == {
        "host": "smtp.example.com",
        "port": 587,
        "timeout": 30,
    }
    assert events == ["starttls", "login", "send"] * 2


def test_smtp_ssl_uses_verified_context_without_starttls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """隐式 SSL 使用证书校验上下文，且不再升级 STARTTLS。"""
    events: list[str] = []
    connection: dict[str, object] = {}
    client = FakeSmtpClient(events)

    def fake_smtp_ssl(
        host: str,
        port: int,
        *,
        timeout: float | None = None,
        context: ssl.SSLContext | None = None,
    ) -> FakeSmtpClient:
        connection.update(host=host, port=port, timeout=timeout, context=context)
        client.tls_context = context
        return client

    monkeypatch.setattr(mail_service.smtplib, "SMTP_SSL", fake_smtp_ssl)
    monkeypatch.setattr(
        mail_service.smtplib,
        "SMTP",
        lambda *_args, **_kwargs: pytest.fail("隐式 SSL 分支不得创建普通 SMTP 连接"),
    )
    settings = WebSettings(
        _env_file=None,
        mail_provider="smtp",
        smtp_host="smtp.example.com",
        smtp_port=465,
        smtp_from="no-reply@example.com",
        smtp_user="mailer",
        smtp_password="placeholder-password",
        smtp_use_tls=False,
        smtp_use_ssl=True,
    )

    SmtpMailSender(settings).send_invitation(
        "user@example.com",
        "viewer",
        "https://sync.example.com/register#synthetic",
    )

    assert client.tls_context is not None
    assert client.tls_context.verify_mode == ssl.CERT_REQUIRED
    assert client.tls_context.check_hostname is True
    assert connection == {
        "host": "smtp.example.com",
        "port": 465,
        "timeout": 30,
        "context": client.tls_context,
    }
    assert events == ["login", "send"]


def test_smtp_mail_subjects_use_product_name(monkeypatch: pytest.MonkeyPatch) -> None:
    client = FakeSmtpClient([])
    monkeypatch.setattr(mail_service.smtplib, "SMTP", lambda *_args, **_kwargs: client)
    settings = WebSettings(
        _env_file=None,
        mail_provider="smtp",
        smtp_host="smtp.example.com",
        smtp_from="no-reply@example.com",
        smtp_use_tls=False,
    )
    sender = SmtpMailSender(settings)

    sender.send_invitation("user@example.com", "viewer", "http://localhost/register#synthetic")
    sender.send_password_reset("user@example.com", "http://localhost/reset#synthetic")

    assert [message["Subject"] for message in client.messages] == [
        f"{PRODUCT_NAME}邀请",
        f"{PRODUCT_NAME}密码重置",
    ]


def test_smtp_without_tls_never_creates_or_uses_ssl_context(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[str] = []
    client = FakeSmtpClient(events)
    monkeypatch.setattr(mail_service.smtplib, "SMTP", lambda *_args, **_kwargs: client)
    monkeypatch.setattr(
        mail_service.ssl,
        "create_default_context",
        lambda: pytest.fail("非 TLS 分支不得创建 SSL context"),
    )
    settings = WebSettings(
        _env_file=None,
        mail_provider="smtp",
        smtp_host="smtp.example.com",
        smtp_from="no-reply@example.com",
        smtp_user="mailer",
        smtp_password="placeholder-password",
        smtp_use_tls=False,
    )

    SmtpMailSender(settings).send_invitation(
        "user@example.com",
        "viewer",
        "http://localhost/register#synthetic",
    )

    assert client.tls_context is None
    assert events == ["login", "send"]


def test_fake_and_console_mail_adapters(capsys: pytest.CaptureFixture[str]) -> None:
    fake = FakeMailSender()
    fake.send_invitation("user@example.com", "viewer", "http://example/register#token=secret")
    fake.send_password_reset("user@example.com", "http://example/reset-password#token=secret")
    assert fake.invitations[0]["email"] == "user@example.com"
    assert fake.password_resets[0]["email"] == "user@example.com"

    console = ConsoleMailSender()
    console.send_invitation("user@example.com", "viewer", "http://example/register#token=secret")
    console.send_password_reset("user@example.com", "http://example/reset-password#token=secret")
    captured = capsys.readouterr()
    assert "邀请链接" in captured.out
    assert "重置链接" in captured.out
    assert captured.err == ""


def test_mail_sender_factory_supports_all_adapters() -> None:
    assert isinstance(
        create_mail_sender(WebSettings(_env_file=None, mail_provider="console")),
        ConsoleMailSender,
    )
    assert isinstance(
        create_mail_sender(WebSettings(_env_file=None, mail_provider="fake")),
        FakeMailSender,
    )
    assert isinstance(
        create_mail_sender(WebSettings(_env_file=None, mail_provider="smtp")),
        SmtpMailSender,
    )


def test_production_rejects_console_mail_and_insecure_cookie() -> None:
    with pytest.raises(ValidationError):
        WebSettings(_env_file=None, app_env="production", mail_provider="console")
    with pytest.raises(ValidationError):
        WebSettings(
            _env_file=None,
            app_env="production",
            mail_provider="smtp",
            session_cookie_secure=False,
        )


def test_web_settings_default_and_validate_sync_lock_scope() -> None:
    settings = WebSettings(_env_file=None)
    assert settings.sync_lock_scope == "global"
    assert settings.password_reset_ttl_minutes == 30
    with pytest.raises(ValidationError):
        WebSettings(_env_file=None, sync_lock_scope="api")


@pytest.mark.parametrize("ttl_minutes", [0, -1])
def test_password_reset_ttl_must_be_positive(ttl_minutes: int) -> None:
    with pytest.raises(ValidationError):
        WebSettings(_env_file=None, password_reset_ttl_minutes=ttl_minutes)


@pytest.mark.parametrize(
    "overrides",
    [
        {"public_web_url": "http://sync.example.com"},
        {"public_web_url": "https://"},
        {"smtp_host": ""},
        {"smtp_from": ""},
        {"credential_encryption_key": "not-a-fernet-key"},
    ],
)
def test_production_rejects_incomplete_runtime_settings(
    overrides: dict[str, str],
) -> None:
    values = {
        "app_env": "production",
        "public_web_url": "https://sync.example.com",
        "mail_provider": "smtp",
        "smtp_host": "smtp.example.com",
        "smtp_from": "no-reply@example.com",
        "session_cookie_name": "__Host-jijia_session",
        "session_cookie_secure": True,
        "credential_encryption_key": Fernet.generate_key().decode("ascii"),
    }
    values.update(overrides)

    with pytest.raises(ValidationError):
        WebSettings.model_validate(values)


def test_production_accepts_complete_runtime_settings() -> None:
    settings = WebSettings.model_validate(
        {
            "app_env": "production",
            "public_web_url": "https://sync.example.com",
            "mail_provider": "smtp",
            "smtp_host": "smtp.example.com",
            "smtp_from": "no-reply@example.com",
            "session_cookie_name": "__Host-jijia_session",
            "session_cookie_secure": True,
            "credential_encryption_key": Fernet.generate_key().decode("ascii"),
        }
    )

    assert settings.app_env == "production"


def test_production_accepts_smtp_ssl() -> None:
    """生产环境允许使用隐式 SSL 作为唯一加密方式。"""
    settings = WebSettings.model_validate(
        {
            "app_env": "production",
            "public_web_url": "https://sync.example.com",
            "mail_provider": "smtp",
            "smtp_host": "smtp.example.com",
            "smtp_port": 465,
            "smtp_from": "no-reply@example.com",
            "smtp_use_tls": False,
            "smtp_use_ssl": True,
            "session_cookie_name": "__Host-jijia_session",
            "session_cookie_secure": True,
            "credential_encryption_key": Fernet.generate_key().decode("ascii"),
        }
    )

    assert settings.smtp_use_ssl is True


def test_local_lan_url_overrides_invitation_base_url() -> None:
    settings = WebSettings(
        _env_file=None,
        app_env="local",
        public_web_url="http://127.0.0.1:5183",
        lan_public_web_url="http://192.168.6.31:5183/",
    )

    assert settings.public_web_url == "http://192.168.6.31:5183"


def test_lan_url_is_rejected_outside_local_mode() -> None:
    with pytest.raises(ValidationError, match="LAN_PUBLIC_WEB_URL"):
        WebSettings(
            _env_file=None,
            app_env="production",
            lan_public_web_url="http://192.168.6.31:5183",
        )


def test_production_rejects_smtp_without_encryption() -> None:
    """生产环境拒绝未启用任何传输加密的 SMTP。"""
    with pytest.raises(ValidationError):
        WebSettings.model_validate(
            {
                "app_env": "production",
                "public_web_url": "https://sync.example.com",
                "mail_provider": "smtp",
                "smtp_host": "smtp.example.com",
                "smtp_from": "no-reply@example.com",
                "smtp_use_tls": False,
                "session_cookie_name": "__Host-jijia_session",
                "session_cookie_secure": True,
                "credential_encryption_key": Fernet.generate_key().decode("ascii"),
            }
        )


def test_smtp_rejects_ssl_and_starttls_together() -> None:
    """同一连接不能同时配置隐式 SSL 和 STARTTLS。"""
    with pytest.raises(ValidationError):
        WebSettings.model_validate(
            {
                "smtp_use_tls": True,
                "smtp_use_ssl": True,
            }
        )


@pytest.mark.parametrize(
    "overrides",
    [
        {"worker_poll_seconds": 0},
        {"worker_poll_seconds": -1},
        {"worker_heartbeat_seconds": 0},
        {"worker_heartbeat_seconds": -1},
        {"worker_stale_minutes": 0},
        {"worker_stale_minutes": -1},
    ],
)
def test_worker_timing_rejects_non_positive_values(
    overrides: dict[str, float],
) -> None:
    with pytest.raises(ValidationError):
        WebSettings.model_validate(overrides)


def test_worker_stale_window_requires_three_heartbeats() -> None:
    with pytest.raises(ValidationError):
        WebSettings.model_validate(
            {
                "worker_heartbeat_seconds": 30,
                "worker_stale_minutes": 1.49,
            }
        )

    settings = WebSettings.model_validate(
        {
            "worker_heartbeat_seconds": 30,
            "worker_stale_minutes": 1.5,
        }
    )
    assert settings.worker_stale_minutes == 1.5
