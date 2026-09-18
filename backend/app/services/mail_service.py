import smtplib
import ssl
from dataclasses import dataclass, field
from email.message import EmailMessage
from html import escape
from typing import Protocol

from backend.app.core.config import WebSettings
from backend.app.core.product import PRODUCT_NAME

SMTP_TIMEOUT_SECONDS = 30
ROLE_LABELS = {
    "admin": "管理员",
    "operator": "操作员",
    "viewer": "只读成员",
}
ACTION_EMAIL_HTML_TEMPLATE = """\
<!doctype html>
<html lang="zh-CN">
  <body
    style="margin:0;background:#f3f6f5;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;"
  >
    <table
      role="presentation" width="100%" cellspacing="0" cellpadding="0"
      style="background:#f3f6f5;padding:32px 12px;"
    >
      <tr>
        <td align="center">
          <table
            role="presentation" width="100%" cellspacing="0" cellpadding="0"
            style="max-width:560px;background:#ffffff;border:1px solid #dce5e2;
              border-radius:12px;overflow:hidden;"
          >
            <tr>
              <td
                style="border-top:4px solid #0b6b57;padding:24px 28px 12px;
                  color:#0b6b57;font-size:14px;font-weight:700;letter-spacing:.02em;"
              >
                {product_name}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 28px;">
                <h1
                  style="margin:0 0 18px;color:#172321;font-size:24px;line-height:1.35;"
                >{heading}</h1>
                {paragraphs}
                <table
                  role="presentation" cellspacing="0" cellpadding="0"
                  style="margin:24px 0;"
                >
                  <tr>
                    <td style="border-radius:8px;background:#0b6b57;">
                      <a
                        href="{action_url}"
                        style="display:inline-block;padding:12px 22px;color:#ffffff;
                          font-size:15px;font-weight:700;text-decoration:none;"
                      >{action_label}</a>
                    </td>
                  </tr>
                </table>
                <p
                  style="margin:0 0 8px;color:#62706d;font-size:13px;line-height:1.65;"
                >若按钮无法打开，请复制以下链接到浏览器：</p>
                <p
                  style="margin:0 0 20px;color:#0b6b57;font-size:12px;
                    line-height:1.6;word-break:break-all;"
                >{action_url}</p>
                <div style="background:#f3f7f6;border-radius:8px;padding:14px 16px;">
                  <p
                    style="margin:0 0 6px;color:#465552;font-size:13px;line-height:1.65;"
                  >{expiry_text}</p>
                  <p
                    style="margin:0;color:#465552;font-size:13px;line-height:1.65;"
                  >{security_note}</p>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def _set_action_email_content(
    message: EmailMessage,
    *,
    heading: str,
    paragraphs: tuple[str, ...],
    action_label: str,
    action_url: str,
    expiry_text: str,
    security_note: str,
) -> None:
    """生成带纯文本备用版本的品牌操作邮件。"""
    plain_text = "\n\n".join(
        (
            *paragraphs,
            f"{action_label}：\n{action_url}",
            expiry_text,
            security_note,
            PRODUCT_NAME,
        )
    )
    paragraph_html = "".join(
        f'<p style="margin:0 0 12px;color:#33413f;font-size:15px;line-height:1.7;">'
        f"{escape(paragraph)}</p>"
        for paragraph in paragraphs
    )
    safe_url = escape(action_url, quote=True)
    message.set_content(plain_text)
    message.add_alternative(
        ACTION_EMAIL_HTML_TEMPLATE.format(
            product_name=escape(PRODUCT_NAME),
            heading=escape(heading),
            paragraphs=paragraph_html,
            action_url=safe_url,
            action_label=escape(action_label),
            expiry_text=escape(expiry_text),
            security_note=escape(security_note),
        ),
        subtype="html",
    )


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
        message["Subject"] = f"你已被邀请加入 {PRODUCT_NAME}"
        message["From"] = self.settings.smtp_from
        message["To"] = email
        role_label = ROLE_LABELS.get(role, role)
        _set_action_email_content(
            message,
            heading=f"加入 {PRODUCT_NAME}",
            paragraphs=(
                f"你收到了一份成员邀请，账号角色为「{role_label}」。",
                "点击下方按钮设置姓名和登录密码，完成加入。",
            ),
            action_label="接受邀请",
            action_url=invitation_url,
            expiry_text=(
                f"此邀请链接将在 {self.settings.invitation_ttl_hours} 小时后失效，且只能使用一次。"
            ),
            security_note="请勿转发邀请链接。如果你不认识这份邀请，可以忽略此邮件。",
        )

        self._send(message)

    def send_password_reset(self, email: str, reset_url: str) -> None:
        message = EmailMessage()
        message["Subject"] = f"重置 {PRODUCT_NAME}登录密码"
        message["From"] = self.settings.smtp_from
        message["To"] = email
        _set_action_email_content(
            message,
            heading="重置登录密码",
            paragraphs=(
                "我们收到了此邮箱的密码重置请求。",
                "点击下方按钮设置新的登录密码。",
            ),
            action_label="重置密码",
            action_url=reset_url,
            expiry_text=(
                f"此链接将在 {self.settings.password_reset_ttl_minutes} 分钟后失效，"
                "且只能使用一次。"
            ),
            security_note=("如果不是你发起的请求，忽略此邮件即可，当前密码不会改变。"),
        )

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
