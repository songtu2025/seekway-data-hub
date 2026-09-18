from typing import Any
from urllib.parse import urljoin

import requests
from requests import HTTPError

from app.api_rate_limiter import (
    RequestRateLimiter,
    rate_limit_policy,
    retry_after_seconds,
)
from app.auth import AccessToken
from app.config import AppSettings

RATE_LIMIT_HTTP_STATUS_CODES = frozenset({429, 509})


class JijiaApiClient:
    """积加业务接口客户端。

    该类只负责发请求、检查基础响应格式并返回原始 payload；分页、入库、
    重试和日志由 `SyncEngine` 统一控制，避免 HTTP 层掺入同步状态。
    """

    def __init__(
        self,
        settings: AppSettings,
        timeout_seconds: int = 30,
        auth_client: Any | None = None,
        rate_limiter: RequestRateLimiter | None = None,
    ):
        """创建可复用的 requests Session。"""
        self.settings = settings
        self.timeout_seconds = timeout_seconds
        self.session = requests.Session()
        self.auth_client = auth_client
        self.rate_limiter = rate_limiter
        self._current_token: AccessToken | None = None

    def request(
        self,
        api_config: dict[str, Any],
        token: AccessToken,
        params_override: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """执行一次真实业务接口请求。

        `params_override` 用于分页场景：同步引擎每次生成当前页参数后传进来；
        非分页接口则直接使用 YAML 配置里的默认 params。
        """
        method = str(api_config.get("method", "POST")).upper()
        url = self.request_url(api_config)
        # 分页时由调用方传入单页参数；未传入时使用 YAML 中的默认 params。
        params = params_override if params_override is not None else api_config.get("params") or {}
        timeout_seconds = int(api_config.get("timeout_seconds") or self.timeout_seconds)
        effective_token = self._current_token or token

        try:
            response = self._send(
                api_config,
                method,
                url,
                params,
                effective_token,
                timeout_seconds,
            )
            response.raise_for_status()
        except HTTPError as error:
            error_response = error.response
            if (
                error_response is not None
                and error_response.status_code in RATE_LIMIT_HTTP_STATUS_CODES
            ):
                self._defer_rate_limit(
                    api_config,
                    method,
                    error_response.headers.get("Retry-After"),
                )
            if (
                error_response is None
                or error_response.status_code != 401
                or self.auth_client is None
            ):
                raise
            # 长批次可能跨过 accessToken 生命周期；401 时强制刷新一次，避免整批后半段失败。
            effective_token = self.auth_client.get_access_token(force_refresh=True)
            self._current_token = effective_token
            response = self._send(
                api_config,
                method,
                url,
                params,
                effective_token,
                timeout_seconds,
            )
            try:
                response.raise_for_status()
            except HTTPError as refresh_error:
                refresh_response = refresh_error.response
                if (
                    refresh_response is not None
                    and refresh_response.status_code in RATE_LIMIT_HTTP_STATUS_CODES
                ):
                    self._defer_rate_limit(
                        api_config,
                        method,
                        refresh_response.headers.get("Retry-After"),
                    )
                raise

        payload = response.json()
        code = payload.get("code")
        if code not in (0, 200):
            messages = payload.get("messages") or [
                f"API request failed: {api_config.get('api_code')}"
            ]
            raise ValueError(str(messages[0]))
        return payload

    def _send(
        self,
        api_config: dict[str, Any],
        method: str,
        url: str,
        params: dict[str, Any],
        token: AccessToken,
        timeout_seconds: int,
    ) -> requests.Response:
        """发送一次业务请求；调用方负责状态码、业务 code 和重试控制。"""
        if self.rate_limiter is not None:
            self.rate_limiter.acquire(
                method,
                str(api_config["path"]),
                rate_limit_policy(api_config),
            )
        headers = {"accessToken": token.value}
        if method == "POST":
            return self.session.post(url, json=params, headers=headers, timeout=timeout_seconds)
        if method == "GET":
            return self.session.get(url, params=params, headers=headers, timeout=timeout_seconds)
        raise ValueError(f"unsupported API method: {method}")

    def _defer_rate_limit(
        self,
        api_config: dict[str, Any],
        method: str,
        retry_after: str | None,
    ) -> None:
        """把 HTTP 429 的冷却窗口传播给使用同一接口的其他 Worker。"""
        if self.rate_limiter is None:
            return
        policy = rate_limit_policy(api_config)
        rate_config = api_config.get("rate_limit") or {}
        cooldown_seconds = float(rate_config.get("cooldown_seconds") or policy.period_seconds)
        self.rate_limiter.defer(
            method,
            str(api_config["path"]),
            retry_after_seconds(retry_after, cooldown_seconds),
        )

    def request_url(self, api_config: dict[str, Any]) -> str:
        """根据单个 API 配置生成完整请求 URL。"""
        return self._open_api_url(str(api_config["path"]))

    def _open_api_url(self, path: str) -> str:
        """拼接开放平台网关 URL。

        与认证客户端保持同一套路径规则：配置可以只写业务路径，也可以写已经
        带网关前缀的路径。
        """
        prefix = self.settings.jijia_open_gateway_prefix.strip("/")
        clean_path = path.lstrip("/")
        if prefix and not clean_path.startswith(prefix + "/"):
            clean_path = f"{prefix}/{clean_path}"
        return urljoin(self.settings.jijia_base_url.rstrip("/") + "/", clean_path)
