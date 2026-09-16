from __future__ import annotations

import argparse
import json
import re
import time
from collections import Counter
from pathlib import Path
from typing import Any

import requests
import yaml

DOC_TREE_URL = "https://open.gerpgo.com/api/openAdmin/doc/tree"
DOC_DETAIL_URL = "https://open.gerpgo.com/api/openAdmin/doc/detail?id={doc_id}"

READ_OPS = {"page", "list", "query", "detail", "get", "tree"}
WRITE_HINTS = {
    "update",
    "save",
    "create",
    "add",
    "delete",
    "remove",
    "import",
    "submit",
    "sync",
    "cancel",
    "approve",
    "upload",
    "confirm",
}
PAGE_FIELDS = {"page", "pagesize", "pageSize", "pageNo", "size", "current", "limit"}
OPTIONAL_QUERY_OBJECTS = {"condition", "param", "params", "query", "filter"}
SENSITIVE_WORDS = [
    "phone",
    "mobile",
    "email",
    "mail",
    "address",
    "addr",
    "token",
    "password",
    "passwd",
    "secret",
    "credential",
    "身份证",
    "电话",
    "手机",
    "邮箱",
    "地址",
    "令牌",
    "密码",
]
SENSITIVE_PATTERN = re.compile("|".join(re.escape(word) for word in SENSITIVE_WORDS), re.IGNORECASE)
HIGH_RISK_MENU_ROOTS = {"订单", "财务", "客服", "物流", "销售"}
HIGH_RISK_URL_WORDS = [
    "order",
    "fee",
    "cost",
    "payment",
    "refund",
    "asset",
    "finance",
    "delivery",
    "shipment",
    "voice",
    "review",
    "feedback",
]
HIGH_RISK_URL_PATTERN = re.compile(
    "|".join(re.escape(word) for word in HIGH_RISK_URL_WORDS), re.IGNORECASE
)
KNOWN_RISK_REVIEW_PATHS = {
    # 这些路径已有真实探测结论：编码、限流、数组入参或敏感字段边界尚未稳定，不应反复作为普通候选。
    "/middle/base/marketNames/query",
    "/purchase/inventory/purchaseSaleStorageSelf/page",
    "/operation/sts/trafficSkuAnalysis/page",
    "/purchase/store/multiTypeWarehouse/page",
    "/purchase/srm/quickInbound/query",
}
REVIEW_TERMINAL_STATUSES = {
    "framework_auth_only",
    "defer_no_param_source",
    "defer_sensitive_credentials",
    "defer_runtime_rejected",
    "defer_duplicate_or_obsolete",
    "defer_unsupported_shape",
}
TERMINAL_EXECUTION_STAGES = REVIEW_TERMINAL_STATUSES | {"defer_write_or_mutation"}


def classify_api_detail(detail: dict[str, Any]) -> dict[str, Any]:
    """按同步风险把积加文档详情归类。

    分类只使用公开文档元数据，不读取 `.env`，不请求真实业务接口。结果用于判断
    后续接入顺序：可直接读、依赖上游参数、含敏感字段、写操作或暂不适配。
    """
    op_type = str(detail.get("opType") or "").lower()
    api_url = str(detail.get("apiUrl") or "")
    request_body = detail.get("requestBody") or []
    response_body = detail.get("responseBody") or []

    required_fields = _required_body_fields(request_body)
    business_required_fields = [
        field
        for field in required_fields
        if field not in PAGE_FIELDS and field not in OPTIONAL_QUERY_OBJECTS
    ]
    has_page = _has_page_response(response_body)
    has_list = _has_list_response(response_body)
    has_sensitive = _has_sensitive_response_fields(response_body)

    if _is_write_like(op_type, api_url):
        classification = "write_or_mutation"
    elif business_required_fields:
        classification = "requires_upstream_params"
    elif has_sensitive:
        classification = "sensitive_review"
    elif has_page or has_list or op_type in READ_OPS:
        classification = "direct_read_candidate"
    else:
        classification = "unsupported_shape_review"

    return {
        "classification": classification,
        "method": str(detail.get("erpMethod") or "").upper(),
        "op_type": op_type,
        "required_body_fields": required_fields,
        "business_required_fields": business_required_fields,
        "has_page_response": has_page,
        "has_list_response": has_list,
        "has_sensitive_response_fields": has_sensitive,
        "response_fields": _response_field_contract(response_body),
    }


def execution_plan_for_api(
    item: dict[str, Any], review_override: dict[str, str] | None = None
) -> dict[str, str]:
    """给覆盖矩阵中的单个 API 标记下一步执行层级。

    `classification` 只说明公开文档形态；这里再结合是否已配置、是否启用、
    菜单域和 URL 风险，给后续阶段一个可执行分流，避免把订单、财务、
    客服、物流费用等高风险接口误当成普通低风险候选。
    """
    if item.get("configured_enabled"):
        return {
            "execution_bucket": "configured",
            "execution_stage": "configured_enabled",
            "execution_reason": "已进入 enabled 批量同步。",
        }

    if item.get("configured_api_code"):
        return {
            "execution_bucket": "configured",
            "execution_stage": "configured_disabled",
            "execution_reason": "已配置但默认关闭，需按数据量、窗口和批量耗时评估后再启用。",
        }

    if review_override:
        return {
            "execution_bucket": "terminal_deferred",
            "execution_stage": review_override["status"],
            "execution_reason": review_override["reason"],
        }

    classification = item.get("classification")
    if classification == "requires_upstream_params":
        return {
            "execution_bucket": "needs_upstream_params",
            "execution_stage": "needs_param_source",
            "execution_reason": "公开文档显示存在业务必填参数，需先证明真实上游参数来源。",
        }
    if classification == "sensitive_review":
        return {
            "execution_bucket": "needs_sensitive_review",
            "execution_stage": "needs_sensitive_review",
            "execution_reason": (
                "公开文档响应或接口域可能包含敏感信息，需先做字段审查和脱敏边界确认。"
            ),
        }
    if classification == "write_or_mutation":
        return {
            "execution_bucket": "defer_or_review",
            "execution_stage": "defer_write_or_mutation",
            "execution_reason": "写入或确认类接口不属于当前只读备份同步范围，默认暂缓。",
        }
    if classification == "direct_read_candidate":
        if item.get("api_url") in KNOWN_RISK_REVIEW_PATHS:
            return {
                "execution_bucket": "defer_or_review",
                "execution_stage": "known_risk_review",
                "execution_reason": "该接口已有真实探测风险记录，需有新证据后再重新评估。",
            }
        if _needs_domain_risk_review(item):
            return {
                "execution_bucket": "defer_or_review",
                "execution_stage": "risk_review_before_probe",
                "execution_reason": (
                    "接口位于订单、财务、客服、物流或销售等高风险域，需先人工确认字段和调用边界。"
                ),
            }
        return {
            "execution_bucket": "can_probe",
            "execution_stage": "can_probe_next",
            "execution_reason": "未配置的低风险直读候选，可按默认 disabled 小窗口探测。",
        }

    return {
        "execution_bucket": "defer_or_review",
        "execution_stage": "unsupported_shape_review",
        "execution_reason": "公开文档形态暂不适配当前同步引擎，需单独确认请求和响应结构。",
    }


def _verified_request_contract(
    detail: dict[str, Any],
    configured_api: dict[str, Any] | None,
    doc_id: int | None,
) -> list[dict[str, Any]]:
    """保存已核验请求字段，避免接口配置与官方契约静默漂移。"""
    if not configured_api:
        return []
    window = configured_api.get("update_window") or {}
    market_scope = configured_api.get("market_scope") or {}
    field_names = []
    if window.get("verified_doc_id") == doc_id:
        field_names.extend([window.get("start_field"), window.get("end_field")])
    if market_scope.get("verified_doc_id") == doc_id:
        field_names.append(market_scope.get("request_field"))
    fields_by_name = {
        field.get("name"): field
        for field in detail.get("requestBody") or []
        if isinstance(field, dict)
    }
    contract = []
    for field_name in dict.fromkeys(field_names):
        field = fields_by_name.get(field_name)
        if field is None:
            continue
        contract.append(
            {
                "name": field_name,
                "type": field.get("type"),
                "must": bool(field.get("must")),
                "description": field.get("description") or "",
            }
        )
    return contract


def build_catalog(
    api_config_path: str | Path = "config/api_config.example.yaml",
    review_config_path: str | Path = "config/api_review_overrides.yaml",
) -> dict[str, Any]:
    """拉取公开文档目录和详情，生成当前 API 覆盖矩阵。"""
    configured_by_path = _load_configured_apis(api_config_path)
    review_by_doc_id = load_review_overrides(review_config_path)
    tree = _get_json(DOC_TREE_URL).get("data") or []
    api_nodes = list(_walk_menu(tree))
    catalog = []
    errors = []

    for menu_path, api in api_nodes:
        doc_id = api.get("id")
        try:
            detail = _get_json(DOC_DETAIL_URL.format(doc_id=doc_id)).get("data") or {}
            classified = classify_api_detail(detail)
            detail_path = str(detail.get("apiUrl") or "")
            configured_apis = configured_by_path.get(detail_path, [])
            configured_api = configured_apis[0] if configured_apis else None
            configured_codes = [str(item["api_code"]) for item in configured_apis]
            enabled_codes = [
                str(item["api_code"]) for item in configured_apis if bool(item.get("enabled"))
            ]
            item = {
                "doc_id": doc_id,
                "menu_path": " > ".join(menu_path),
                "api_name": detail.get("apiName") or api.get("name") or "",
                "api_url": detail.get("apiUrl") or api.get("url") or "",
                "method": classified["method"],
                "op_type": classified["op_type"],
                "classification": classified["classification"],
                "required_body_fields": classified["required_body_fields"],
                "business_required_fields": classified["business_required_fields"],
                "has_page_response": classified["has_page_response"],
                "has_list_response": classified["has_list_response"],
                "has_sensitive_response_fields": classified["has_sensitive_response_fields"],
                "response_fields": classified["response_fields"],
                "rate_limit": official_rate_limit(detail),
                "configured_api_code": configured_api.get("api_code") if configured_api else "",
                "configured_api_codes": configured_codes,
                "configured_enabled": bool(enabled_codes),
                "configured_enabled_api_codes": enabled_codes,
            }
            verified_contract = _verified_request_contract(detail, configured_api, doc_id)
            if verified_contract:
                item["verified_request_contract"] = verified_contract
            item.update(execution_plan_for_api(item, review_by_doc_id.get(doc_id)))
            catalog.append(item)
        except requests.RequestException as error:
            errors.append({"doc_id": doc_id, "error": str(error)})
        time.sleep(0.02)

    return {
        "source": {
            "tree_url": DOC_TREE_URL,
            "detail_url_template": DOC_DETAIL_URL,
        },
        "summary": _summarize_catalog(catalog, errors, configured_by_path),
        "apis": sorted(catalog, key=lambda item: (item["menu_path"], item["doc_id"] or 0)),
        "errors": errors,
    }


def official_rate_limit(detail: dict[str, Any]) -> dict[str, Any] | None:
    """提取官方接口当前生效或默认的单接口限额。"""
    max_requests = detail.get("limitTimes")
    period_seconds = detail.get("limitPeriod")
    limit_type_name = detail.get("limitTypeName")
    if max_requests is None:
        max_requests = detail.get("defaultLimitTimes")
    if period_seconds is None:
        period_seconds = detail.get("defaultLimitPeriod")
    if not limit_type_name:
        limit_type_name = detail.get("defaultLimitTypeName")
    if (
        isinstance(max_requests, bool)
        or not isinstance(max_requests, int)
        or max_requests < 1
        or isinstance(period_seconds, bool)
        or not isinstance(period_seconds, (int, float))
        or period_seconds <= 0
    ):
        return None
    if str(limit_type_name) != "秒":
        return None
    return {
        "max_requests": max_requests,
        "period_seconds": period_seconds,
        "dimension": str(detail.get("dimensionTypeName") or ""),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="生成积加开放平台公开文档 API 覆盖矩阵")
    parser.add_argument(
        "--api-config", default="config/api_config.example.yaml", help="本地 API YAML 配置路径"
    )
    parser.add_argument(
        "--review-config",
        default="config/api_review_overrides.yaml",
        help="本地 API 审核终态 YAML 路径",
    )
    parser.add_argument("--output", help="输出 JSON 文件路径；不传则只打印摘要")
    parser.add_argument("--summary", action="store_true", help="打印摘要")
    args = parser.parse_args()

    catalog = build_catalog(args.api_config, args.review_config)
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")

    if args.summary or not args.output:
        print(json.dumps(catalog["summary"], ensure_ascii=False, indent=2))


def _summarize_catalog(
    catalog: list[dict[str, Any]],
    errors: list[dict[str, Any]],
    configured_by_path: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    classification_counts = Counter(item["classification"] for item in catalog)
    execution_bucket_counts = Counter(item["execution_bucket"] for item in catalog)
    execution_stage_counts = Counter(item["execution_stage"] for item in catalog)
    menu_counts = Counter(item["menu_path"].split(" > ")[0] for item in catalog)
    menu_progress = {}
    for menu_name in sorted(menu_counts):
        menu_items = [item for item in catalog if item["menu_path"].split(" > ")[0] == menu_name]
        configured = sum(item["execution_stage"].startswith("configured_") for item in menu_items)
        enabled = sum(item["execution_stage"] == "configured_enabled" for item in menu_items)
        terminal_deferred = sum(
            item["execution_stage"] in TERMINAL_EXECUTION_STAGES for item in menu_items
        )
        pending_review = len(menu_items) - configured - terminal_deferred
        menu_progress[menu_name] = {
            "total": len(menu_items),
            "configured": configured,
            "enabled": enabled,
            "terminal_deferred": terminal_deferred,
            "pending_review": pending_review,
            "closed": pending_review == 0,
        }
    return {
        "tree_api_count": len(catalog) + len(errors),
        "detail_success_count": len(catalog),
        "detail_error_count": len(errors),
        "configured_real_api_count": sum(len(apis) for apis in configured_by_path.values()),
        "configured_enabled_real_api_count": sum(
            bool(api.get("enabled")) for apis in configured_by_path.values() for api in apis
        ),
        "classification_counts": dict(sorted(classification_counts.items())),
        "execution_bucket_counts": dict(sorted(execution_bucket_counts.items())),
        "execution_stage_counts": dict(sorted(execution_stage_counts.items())),
        "menu_counts": dict(sorted(menu_counts.items())),
        "menu_progress": menu_progress,
    }


def load_review_overrides(review_config_path: str | Path) -> dict[int, dict[str, str]]:
    """读取人工审核终态，并按公开文档 ID 建立稳定索引。

    审核文件允许缺省，保证旧命令仍能生成 catalog；状态只接受白名单，
    避免拼写错误把仍待审核的接口误计为板块已收口。
    """
    path = Path(review_config_path)
    if not path.exists():
        return {}

    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    reviews = data.get("reviews") or []
    if not isinstance(reviews, list):
        raise ValueError("API review config field 'reviews' must be a list")

    review_by_doc_id = {}
    for review in reviews:
        doc_id = int(review.get("doc_id"))
        status = str(review.get("status") or "")
        reason = str(review.get("reason") or "")
        if status not in REVIEW_TERMINAL_STATUSES:
            raise ValueError(f"Unsupported API review status: {status}")
        review_by_doc_id[doc_id] = {"status": status, "reason": reason}
    return review_by_doc_id


def _load_configured_apis(
    api_config_path: str | Path,
) -> dict[str, list[dict[str, Any]]]:
    path = Path(api_config_path)
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    configured: dict[str, list[dict[str, Any]]] = {}
    for api in data.get("apis") or []:
        api_path = str(api.get("path") or "")
        if api_path and not api_path.startswith("/replace/"):
            configured.setdefault(api_path, []).append(api)
    return configured


def _get_json(url: str) -> dict[str, Any]:
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    return response.json()


def _walk_menu(nodes: list[dict[str, Any]], path: tuple[str, ...] = ()):
    for node in nodes or []:
        menu_name = node.get("menuName") or node.get("menuCode") or ""
        current_path = path + (menu_name,)
        for api in node.get("apiList") or []:
            yield current_path, api
        yield from _walk_menu(node.get("subMenu") or [], current_path)


def _flatten_fields(
    fields: list[dict[str, Any]], prefix: str = ""
) -> list[tuple[str, dict[str, Any]]]:
    result = []
    for field in fields or []:
        name = str(field.get("name") or "")
        full_name = f"{prefix}.{name}" if prefix and name else name or prefix
        result.append((full_name, field))
        result.extend(_flatten_fields(field.get("children") or [], full_name))
    return result


def _required_body_fields(fields: list[dict[str, Any]]) -> list[str]:
    return [str(field.get("name") or "") for field in fields or [] if field.get("must") is True]


def _has_page_response(fields: list[dict[str, Any]]) -> bool:
    names = {name for name, _ in _flatten_fields(fields)}
    return "data.rows" in names or any(name.endswith(".rows") for name in names)


def _has_list_response(fields: list[dict[str, Any]]) -> bool:
    for name, field in _flatten_fields(fields):
        if name == "data" and "array" in str(field.get("type") or "").lower():
            return True
    return False


def _has_sensitive_response_fields(fields: list[dict[str, Any]]) -> bool:
    for name, field in _flatten_fields(fields):
        text = f"{name} {field.get('description') or ''}"
        if SENSITIVE_PATTERN.search(text):
            return True
    return False


def _response_field_contract(
    fields: list[dict[str, Any]],
) -> list[dict[str, str]]:
    """保存接口中心需要的字段路径、类型和官方说明。"""
    return [
        {
            "name": name,
            "type": str(field.get("type") or ""),
            "description": str(field.get("description") or ""),
        }
        for name, field in _flatten_fields(fields)
        if name
    ]


def _is_write_like(op_type: str, api_url: str) -> bool:
    url = api_url.lower()
    return (
        op_type in WRITE_HINTS
        or any(hint in op_type for hint in WRITE_HINTS)
        or any(
            fragment in url
            for fragment in [
                "/update",
                "/delete",
                "/save",
                "/create",
                "/add",
                "/import",
                "/upload",
                "/confirm",
            ]
        )
    )


def _needs_domain_risk_review(item: dict[str, Any]) -> bool:
    menu_root = str(item.get("menu_path") or "").split(" > ")[0]
    if menu_root in HIGH_RISK_MENU_ROOTS:
        return True
    text = f"{item.get('api_url') or ''} {item.get('api_name') or ''}"
    return bool(HIGH_RISK_URL_PATTERN.search(text))


if __name__ == "__main__":
    main()
