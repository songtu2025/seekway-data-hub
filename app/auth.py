import json
import time
from dataclasses import dataclass, field
from urllib.parse import urljoin

import requests
from requests import HTTPError

from app.api_rate_limiter import (
    RateLimitPolicy,
    RequestRateLimiter,
    retry_after_seconds,
)
from app.config import AppSettings


@dataclass(frozen=True)
class AccessToken:
    """积加开放平台返回的访问令牌。

    `value` 是后续业务接口请求头里的 accessToken。过期字段按接口原样保存，
    日志只打印过期信息，不打印 token 本身。
    """

    value: str
    expires_in: int | None = None
    expires_out: int | None = None


@dataclass(frozen=True)
class JijiaCredentials:
    """只在请求执行期间保存一组积加账号凭证。"""

    app_id: str = field(repr=False)
    app_key: str = field(repr=False)


class JijiaAuthClient:
    """负责向积加开放平台换取 accessToken。"""

    def __init__(
        self,
        settings: AppSettings,
        timeout_seconds: int = 30,
        credentials: JijiaCredentials | None = None,
        use_token_cache: bool = True,
        rate_limiter: RequestRateLimiter | None = None,
    ):
        """保存认证所需配置和 HTTP 超时时间。"""
        self.settings = settings
        self.timeout_seconds = timeout_seconds
        self.credentials = credentials
        # Web 账号凭据不得与旧 CLI 共享磁盘 Token，显式凭据始终禁用缓存。
        self.use_token_cache = use_token_cache and credentials is None
        self.rate_limiter = rate_limiter

    def get_access_token(self, force_refresh: bool = False) -> AccessToken:
        """获取积加开放平台 accessToken。

        先读取本地缓存，缓存不存在或快过期时再请求 token 接口。
        认证接口返回 HTTP 200 不代表业务成功，所以除了 `raise_for_status`
        还要检查响应体里的 code，并从 data.accessToken 提取真正的令牌。
        """
        self._validate_settings()
        cached_token = (
            None if force_refresh or not self.use_token_cache else self._read_cached_token()
        )
        if cached_token is not None:
            return cached_token

        url = self._open_api_url(self.settings.jijia_token_url)
        policy: RateLimitPolicy | None = None
        if self.rate_limiter is not None:
            policy = RateLimitPolicy(
                max_requests=self.settings.jijia_token_rate_limit_requests,
                period_seconds=self.settings.jijia_token_rate_limit_period_seconds,
            )
            self.rate_limiter.acquire("POST", self.settings.jijia_token_url, policy)
        response = requests.post(url, json=self._token_payload(), timeout=self.timeout_seconds)
        try:
            response.raise_for_status()
        except HTTPError:
            if response.status_code == 429 and self.rate_limiter is not None:
                assert policy is not None
                self.rate_limiter.defer(
                    "POST",
                    self.settings.jijia_token_url,
                    retry_after_seconds(
                        response.headers.get("Retry-After"),
                        policy.period_seconds,
                    ),
                )
            raise

        payload = response.json()
        code = payload.get("code")
        if code not in (0, 200):
            messages = payload.get("messages") or ["failed to get access token"]
            raise ValueError(str(messages[0]))

        data = payload.get("data") or {}
        token = data.get("accessToken")
        if not token:
            raise ValueError("accessToken missing in response")

        access_token = AccessToken(
            value=token,
            expires_in=data.get("expiresIn"),
            expires_out=data.get("expiresOut"),
        )
        if self.use_token_cache:
            self._write_cached_token(access_token)
        return access_token

    def _read_cached_token(self) -> AccessToken | None:
        """读取本地 token 缓存。

        提前 60 秒视为过期，避免业务请求刚好撞上 token 失效。
        """
        cache_path = self.settings.jijia_token_cache_path
        if not cache_path.exists():
            return None

        try:
            with cache_path.open("r", encoding="utf-8") as file:
                data = json.load(file)
        except (OSError, json.JSONDecodeError):
            return None

        value = data.get("accessToken")
        expires_at = float(data.get("expiresAt") or 0)
        if not value or expires_at <= time.time() + 60:
            return None

        return AccessToken(
            value=value,
            expires_in=max(int(expires_at - time.time()), 0),
            expires_out=max(int(expires_at - time.time()), 0),
        )

    def _write_cached_token(self, token: AccessToken) -> None:
        """写入本地 token 缓存文件。

        缓存文件包含敏感 accessToken，必须由 .gitignore 排除。
        """
        expires_seconds = token.expires_out or token.expires_in
        if not expires_seconds:
            return

        cache_path = self.settings.jijia_token_cache_path
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "accessToken": token.value,
            "expiresAt": int(time.time() + int(expires_seconds)),
        }
        with cache_path.open("w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False)

    def _validate_settings(self) -> None:
        """在发起请求前检查必要凭证是否仍是占位符。"""
        app_id = self.credentials.app_id if self.credentials else self.settings.jijia_app_id
        app_key = self.credentials.app_key if self.credentials else self.settings.jijia_app_key
        if not app_id or app_id == "your_app_id":
            raise ValueError("JIJIA_APP_ID is not configured")
        if not app_key or app_key == "your_app_key":
            raise ValueError("JIJIA_APP_KEY is not configured")

    def _token_payload(self) -> dict[str, str]:
        """构造 token 接口请求体。

        当前积加 token 接口只发送文档要求的 appId 和 appKey。
        """
        if self.credentials:
            return {"appId": self.credentials.app_id, "appKey": self.credentials.app_key}
        return {"appId": self.settings.jijia_app_id, "appKey": self.settings.jijia_app_key}

    def _open_api_url(self, path: str) -> str:
        """拼接开放平台完整 URL。

        配置里既允许写 `/api_token`，也允许直接写带 `/api/open` 前缀的路径。
        这里统一补齐网关前缀，避免每个调用方重复处理。
        """
        prefix = self.settings.jijia_open_gateway_prefix.strip("/")
        clean_path = path.lstrip("/")
        if prefix and not clean_path.startswith(prefix + "/"):
            clean_path = f"{prefix}/{clean_path}"
        return urljoin(self.settings.jijia_base_url.rstrip("/") + "/", clean_path)
