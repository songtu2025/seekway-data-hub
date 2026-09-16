import smtplib
import ssl
from dataclasses import dataclass, field
from email.message import EmailMessage
from typing import Protocol

from backend.app.core.config import WebSettings
from backend.app.core.product import PRODUCT_NAME

SMTP_TIMEOUT_SECONDS = 30


class MailSender(Protocol):
    """定义身份邮件发送边界，业务逻辑不依赖具体 SMTP 实现。"""

    def send_invitation(self, email: str, role: str, invitation_url: str) -> None:
        """发送一次性邀请链接。"""

    def send_password_reset(self, email: str, reset_url: str) -> None:
        """发送一次性密码重置链接。"""


class SmtpMailSender:
    """通过标准 SMTP 发送生产身份邮件。"""

    def __init__(self, settings: WebSettings) -> None:
        self.settings = settings

    def send_invitation(self, email: str, role: str, invitation_url: str) -> None:
        message = EmailMessage()
        message["Subject"] = f"{PRODUCT_NAME}邀请"
        message["From"] = self.settings.smtp_from
        message["To"] = email
        message.set_content(
            f"你已被邀请为 {role}。请使用以下一次性链接完成注册：\n{invitation_url}"
        )

        self._send(message)

    def send_password_reset(self, email: str, reset_url: str) -> None:
        message = EmailMessage()
        message["Subject"] = f"{PRODUCT_NAME}密码重置"
        message["From"] = self.settings.smtp_from
        message["To"] = email
        message.set_content(f"请使用以下一次性链接重置登录密码：\n{reset_url}")

        self._send(message)

    def _send(self, message: EmailMessage) -> None:
        """通过当前 SMTP 配置发送邮件。"""
        tls_context = (
            ssl.create_default_context()
            if self.settings.smtp_use_ssl or self.settings.smtp_use_tls
            else None
        )
        client: smtplib.SMTP
        if self.settings.smtp_use_ssl:
            client = smtplib.SMTP_SSL(
                self.settings.smtp_host,
                self.settings.smtp_port,
                timeout=SMTP_TIMEOUT_SECONDS,
                context=tls_context,
            )
        else:
            client = smtplib.SMTP(
                self.settings.smtp_host,
                self.settings.smtp_port,
                timeout=SMTP_TIMEOUT_SECONDS,
            )
        with client:
            if self.settings.smtp_use_tls:
                client.starttls(context=tls_context)
            if self.settings.smtp_user:
                client.login(self.settings.smtp_user, self.settings.smtp_password)
            client.send_message(message)


class ConsoleMailSender:
    """只在本地终端输出身份链接，避免写入应用日志文件。"""

    def send_invitation(self, email: str, role: str, invitation_url: str) -> None:
        print(f"邀请邮箱: {email}")
        print(f"邀请角色: {role}")
        print(f"邀请链接: {invitation_url}")

    def send_password_reset(self, email: str, reset_url: str) -> None:
        print(f"重置邮箱: {email}")
        print(f"重置链接: {reset_url}")


@dataclass
class FakeMailSender:
    """在自动化测试中捕获邮件，不访问外部服务。"""

    invitations: list[dict[str, str]] = field(default_factory=list)
    password_resets: list[dict[str, str]] = field(default_factory=list)

    def send_invitation(self, email: str, role: str, invitation_url: str) -> None:
        self.invitations.append({"email": email, "role": role, "url": invitation_url})

    def send_password_reset(self, email: str, reset_url: str) -> None:
        self.password_resets.append({"email": email, "url": reset_url})


def create_mail_sender(settings: WebSettings) -> MailSender:
    """根据环境配置创建邮件适配器。"""
    if settings.mail_provider == "smtp":
        return SmtpMailSender(settings)
    if settings.mail_provider == "fake":
        return FakeMailSender()
    return ConsoleMailSender()
