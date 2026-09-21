import argparse
import json
import socket
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from html.parser import HTMLParser
from ipaddress import IPv4Address, IPv4Network, ip_address
from pathlib import Path
from typing import Any

from app.api_config_registry import load_published_api_configs
from app.config import (
    enabled_web_scheduler_only_api_codes,
    load_api_configs,
    load_settings,
    runtime_database_capacity_valid,
)
from app.db import create_db_engine
from backend.app.core.config import WebSettings
from backend.app.services.migration_preflight_service import PreflightResult
from backend.app.services.runtime_target_verifier import verify_runtime_target

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PRODUCTION_ENVIRONMENTS = {"prod", "production"}
PRODUCTION_WORKER_PROCESSES = 4
PRODUCTION_SYNC_LOCK_SCOPE = "account"
PRIVATE_DATABASE_NETWORKS: tuple[IPv4Network, ...] = (
    IPv4Network("10.0.0.0/8"),
    IPv4Network("172.16.0.0/12"),
    IPv4Network("192.168.0.0/16"),
)
PRIVATE_NETWORK_UNENCRYPTED_DATABASE = "PRIVATE_NETWORK_UNENCRYPTED_DATABASE"


class _ViteAssetParser(HTMLParser):
    """提取 Vite 本地资源，并区分真正的模块脚本入口。"""

    def __init__(self) -> None:
        super().__init__()
        self.references: list[str] = []
        self.module_entries: list[str] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        attributes = {name.lower(): value for name, value in attrs}
        for attribute_name in ("src", "href"):
            value = attributes.get(attribute_name)
            if value and value.startswith("/assets/"):
                self.references.append(value)
        source = attributes.get("src")
        if (
            tag.lower() == "script"
            and str(attributes.get("type") or "").lower() == "module"
            and source
            and source.startswith("/assets/")
        ):
            self.module_entries.append(source)


@dataclass(frozen=True)
class ReleasePreflightResult:
    """发布前检查的稳定脱敏结果。"""

    status: str
    code: str
    reason_code: str | None = None

    def payload(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "status": self.status,
            "code": self.code,
        }
        if self.reason_code is not None:
            payload["reasonCode"] = self.reason_code
        return payload


def main(
    argv: Sequence[str] | None = None,
    *,
    project_root: Path = PROJECT_ROOT,
    app_settings_loader: Callable[[], Any] = load_settings,
    web_settings_loader: Callable[[], Any] = WebSettings,
    engine_factory: Callable[[Any], Any] = create_db_engine,
    verifier: Callable[[Any], PreflightResult] = verify_runtime_target,
    published_configs_loader: Callable[[Any], list[dict[str, Any]]] = (load_published_api_configs),
) -> int:
    """执行不含写操作的本地发布门禁并输出单行 JSON。"""
    parser = argparse.ArgumentParser(description="ECS 发布前只读数据库与构建检查")
    parser.add_argument(
        "--confirm-read-only-database",
        action="store_true",
        help="确认本命令只允许执行数据库 SELECT 检查",
    )
    parser.add_argument(
        "--service",
        choices=("api", "scheduler", "worker"),
        default="api",
        help="按服务范围执行检查；只有 API 依赖前端产物",
    )
    args = parser.parse_args(argv)
    if not args.confirm_read_only_database:
        result = ReleasePreflightResult(
            "blocked",
            "RELEASE_CONFIRMATION_REQUIRED",
        )
        print(json.dumps(result.payload(), ensure_ascii=False, separators=(",", ":")))
        return 2

    engine = None
    try:
        try:
            app_settings = app_settings_loader()
            web_settings = web_settings_loader()
        except Exception:
            result = ReleasePreflightResult("blocked", "RELEASE_CONFIG_INVALID")
        else:
            if not _production_settings_valid(
                app_settings,
                web_settings,
            ):
                result = ReleasePreflightResult(
                    "blocked",
                    "RELEASE_CONFIG_INVALID",
                )
            elif args.service == "api" and not _frontend_build_valid(
                project_root / "frontend" / "dist" / "index.html"
            ):
                result = ReleasePreflightResult(
                    "blocked",
                    "RELEASE_FRONTEND_MISSING",
                )
            else:
                try:
                    api_configs = load_api_configs(
                        _resolve_path(project_root, app_settings.api_config_path)
                    )
                except Exception:
                    result = ReleasePreflightResult(
                        "blocked",
                        "RELEASE_API_CONFIG_INVALID",
                    )
                else:
                    if enabled_web_scheduler_only_api_codes(api_configs):
                        result = ReleasePreflightResult(
                            "blocked",
                            "RELEASE_SCHEDULER_OWNERSHIP_CONFLICT",
                        )
                    else:
                        engine = engine_factory(app_settings)
                        target_result = verifier(engine)
                        if target_result.status != "pass":
                            result = ReleasePreflightResult(
                                "blocked",
                                "RELEASE_RUNTIME_TARGET_BLOCKED",
                                target_result.code,
                            )
                        else:
                            try:
                                published_configs = published_configs_loader(engine)
                            except Exception:
                                published_configs = []
                            if not published_configs:
                                result = ReleasePreflightResult(
                                    "blocked",
                                    "RELEASE_PUBLISHED_API_CONFIG_INVALID",
                                )
                            else:
                                result = ReleasePreflightResult(
                                    "pass",
                                    "RELEASE_PREFLIGHT_PASSED",
                                    _database_transport_reason(app_settings),
                                )
    except Exception:
        result = ReleasePreflightResult("error", "RELEASE_PREFLIGHT_RUNTIME_ERROR")
    finally:
        if engine is not None:
            try:
                engine.dispose()
            except Exception:
                result = ReleasePreflightResult(
                    "error",
                    "RELEASE_PREFLIGHT_DISPOSE_FAILED",
                )

    print(json.dumps(result.payload(), ensure_ascii=False, separators=(",", ":")))
    if result.status == "pass":
        return 0
    if result.status == "blocked":
        return 2
    return 1


def _production_settings_valid(
    app_settings: Any,
    web_settings: Any,
) -> bool:
    environments = {
        str(app_settings.app_env).lower(),
        str(web_settings.app_env).lower(),
    }
    if not environments <= PRODUCTION_ENVIRONMENTS:
        return False
    if (
        app_settings.worker_processes != PRODUCTION_WORKER_PROCESSES
        or web_settings.worker_processes != PRODUCTION_WORKER_PROCESSES
        or app_settings.sync_lock_scope != PRODUCTION_SYNC_LOCK_SCOPE
        or web_settings.sync_lock_scope != PRODUCTION_SYNC_LOCK_SCOPE
    ):
        return False
    runtime_values = (
        app_settings.db_host,
        app_settings.db_port,
        app_settings.db_name,
        app_settings.db_user,
        app_settings.db_password,
    )
    if not all(_configured(value) for value in runtime_values):
        return False
    if not runtime_database_capacity_valid(app_settings):
        return False
    if not _database_transport_valid(app_settings):
        return False
    if not str(web_settings.public_web_url).lower().startswith("https://"):
        return False
    return str(app_settings.jijia_base_url).lower().startswith("https://")


def _database_transport_valid(app_settings: Any) -> bool:
    """校验生产数据库传输模式，明文例外只能指向 RFC1918 私网地址。"""
    if app_settings.db_tls_mode == "verify_identity":
        return _configured(app_settings.db_tls_ca_path)
    if app_settings.db_tls_mode != "disabled" or not bool(
        app_settings.db_allow_unencrypted_private_network
    ):
        return False
    return _host_resolves_only_private_ipv4(str(app_settings.db_host))


def _host_resolves_only_private_ipv4(host: str) -> bool:
    """确认数据库主机的全部解析结果均属于 RFC1918 私网。"""
    try:
        records = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
        addresses = {ip_address(record[4][0]) for record in records}
    except (OSError, ValueError):
        return False
    return bool(addresses) and all(
        isinstance(address, IPv4Address)
        and any(address in network for network in PRIVATE_DATABASE_NETWORKS)
        for address in addresses
    )


def _database_transport_reason(app_settings: Any) -> str | None:
    if app_settings.db_tls_mode == "disabled":
        return PRIVATE_NETWORK_UNENCRYPTED_DATABASE
    return None


def _frontend_build_valid(index_path: Path) -> bool:
    """确认 Vite 入口和本地静态资源完整，避免发布空壳页面。"""
    try:
        html = index_path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return False
    parser = _ViteAssetParser()
    parser.feed(html)
    if not parser.module_entries:
        return False
    dist = index_path.parent.resolve()
    assets: dict[str, Path] = {}
    for reference in parser.references:
        clean_reference = reference.split("?", 1)[0].split("#", 1)[0]
        asset = (dist / clean_reference.lstrip("/")).resolve()
        try:
            asset.relative_to(dist)
        except ValueError:
            return False
        if not asset.is_file():
            return False
        assets[reference] = asset
    return all(
        entry in assets
        and Path(entry.split("?", 1)[0].split("#", 1)[0]).suffix.lower() == ".js"
        and assets[entry].stat().st_size > 0
        for entry in parser.module_entries
    )


def _configured(value: Any) -> bool:
    normalized = str(value or "").strip().lower()
    return bool(normalized) and not normalized.startswith(("your_", "your-"))


def _resolve_path(project_root: Path, value: str | Path) -> Path:
    path = Path(value)
    return path if path.is_absolute() else project_root / path


if __name__ == "__main__":
    raise SystemExit(main())
