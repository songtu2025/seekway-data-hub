import hashlib
import json
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.api_rate_limiter import rate_limit_policy

REGISTRY_METADATA_KEY = "_registry"


def canonical_api_config(api_config: dict[str, Any]) -> str:
    """生成稳定配置文本，供版本发布和任务快照计算摘要。"""
    payload = {key: value for key, value in api_config.items() if key != REGISTRY_METADATA_KEY}
    return json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )


def api_config_hash(api_config: dict[str, Any]) -> str:
    """返回不含运行时元数据的接口配置摘要。"""
    return hashlib.sha256(canonical_api_config(api_config).encode("utf-8")).hexdigest()


def api_config_snapshot(api_config: dict[str, Any]) -> dict[str, Any]:
    """复制可写入任务的纯配置，避免把数据库元数据混入执行参数。"""
    return json.loads(canonical_api_config(api_config))


def load_official_catalog(path: str | Path) -> list[dict[str, Any]]:
    """读取已生成的积加官方接口目录，不在 Web 请求中访问外网。"""
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    apis = payload.get("apis")
    if not isinstance(apis, list):
        raise ValueError("Official API catalog field 'apis' must be a list")
    if not all(isinstance(item, dict) for item in apis):
        raise ValueError("Official API catalog items must be mappings")
    return apis


def publication_records(
    api_configs: list[dict[str, Any]],
    official_catalog_path: str | Path,
) -> list[dict[str, Any]]:
    """把 YAML 发布输入与官方目录证据合并为可落库记录。"""
    official_by_path = {
        str(item.get("api_url") or ""): item
        for item in load_official_catalog(official_catalog_path)
        if item.get("api_url")
    }
    records = []
    for api_config in api_configs:
        path = str(api_config["path"])
        official = official_by_path.get(path)
        classification = str((official or {}).get("classification") or "") or None
        execution_stage = str((official or {}).get("execution_stage") or "") or None
        read_only_verified = bool(
            official
            and classification != "write_or_mutation"
            and execution_stage != "defer_write_or_mutation"
        )
        if official is not None:
            official_rate = official.get("rate_limit")
            if not isinstance(official_rate, dict):
                raise ValueError(f"Official rate limit is missing: {api_config['api_code']}")
            if official_rate.get("dimension") != "接口维度":
                raise ValueError(
                    f"Official rate limit is not endpoint-scoped: {api_config['api_code']}"
                )
            configured_policy = rate_limit_policy(api_config)
            if configured_policy.max_requests != official_rate.get(
                "max_requests"
            ) or configured_policy.period_seconds != float(
                official_rate.get("period_seconds") or 0
            ):
                raise ValueError(
                    f"API rate limit does not match official catalog: {api_config['api_code']}"
                )
        platform_enabled = bool(api_config.get("platform_enabled", read_only_verified))
        if api_config["enabled"] is True and not read_only_verified:
            raise ValueError(
                f"Enabled API config is not verified read-only: {api_config['api_code']}"
            )
        if platform_enabled and not read_only_verified:
            raise ValueError(
                f"Platform-enabled API config is not verified read-only: {api_config['api_code']}"
            )
        records.append(
            {
                "api_code": str(api_config["api_code"]),
                "api_name": str(api_config.get("name") or api_config["api_code"]),
                "enabled": bool(api_config["enabled"]),
                "platform_enabled": platform_enabled,
                "method": str(api_config.get("method") or "POST").upper(),
                "path": path,
                "config_json": api_config_snapshot(api_config),
                "config_hash": api_config_hash(api_config),
                "read_only_verified": read_only_verified,
                "official_doc_id": (official or {}).get("doc_id"),
                "classification": classification,
                "execution_stage": execution_stage,
            }
        )
    return records


def load_published_api_configs(
    source: Any,
    *,
    enabled_only: bool = False,
) -> list[dict[str, Any]]:
    """从数据库唯一运行时配置源读取接口配置。"""
    statement = """
        SELECT api_code, enabled, platform_enabled, config_json,
               config_version, config_hash,
               read_only_verified, official_doc_id, classification,
               execution_stage, published_at
        FROM api_config
    """
    if enabled_only:
        statement += " WHERE enabled = 1"
    statement += " ORDER BY id"

    if isinstance(source, Engine):
        with source.connect() as connection:
            rows = list(connection.execute(text(statement)).mappings())
    else:
        rows = list(source.execute(text(statement)).mappings())
    return [_published_row_config(row) for row in rows]


def load_published_api_config(
    source: Any,
    api_code: str,
    *,
    require_platform_enabled: bool = False,
) -> dict[str, Any] | None:
    """按编码读取单个已发布配置，并可要求平台全局启用。"""
    statement = """
        SELECT api_code, enabled, platform_enabled, config_json,
               config_version, config_hash,
               read_only_verified, official_doc_id, classification,
               execution_stage, published_at
        FROM api_config
        WHERE api_code = :api_code
    """
    if require_platform_enabled:
        statement += " AND platform_enabled = 1"
    row = source.execute(text(statement), {"api_code": api_code}).mappings().one_or_none()
    return _published_row_config(row) if row is not None else None


def _published_row_config(row: Any) -> dict[str, Any]:
    value = row["config_json"]
    config = json.loads(value) if isinstance(value, str) else dict(value)
    if str(config.get("api_code") or "") != str(row["api_code"]):
        raise ValueError("Published API config api_code does not match registry row")
    if bool(config.get("enabled")) != bool(row["enabled"]):
        raise ValueError("Published API config enabled state does not match registry row")
    if api_config_hash(config) != str(row["config_hash"]):
        raise ValueError("Published API config hash does not match registry row")
    config["enabled"] = bool(row["enabled"])
    published_at = row["published_at"]
    config[REGISTRY_METADATA_KEY] = {
        "configVersion": int(row["config_version"]),
        "configHash": str(row["config_hash"]),
        "readOnlyVerified": bool(row["read_only_verified"]),
        "platformEnabled": bool(row["platform_enabled"]),
        "officialDocId": row["official_doc_id"],
        "classification": row["classification"],
        "executionStage": row["execution_stage"],
        "publishedAt": (
            published_at.isoformat()
            if hasattr(published_at, "isoformat")
            else str(published_at)
            if published_at
            else None
        ),
    }
    return config
