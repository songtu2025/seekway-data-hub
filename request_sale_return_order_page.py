import argparse
import json
import math
from collections.abc import Callable
from datetime import date
from typing import Any

from requests import RequestException

from app.api_client import JijiaApiClient
from app.api_config_registry import load_published_api_config
from app.api_rate_limiter import MySqlApiRateLimiter
from app.auth import JijiaAuthClient
from app.config import load_settings
from app.db import create_db_engine
from app.sale_return_discovery import discover_earliest_date

API_CODE = "sale_return_order_page"


def parse_args() -> argparse.Namespace:
    """解析退货订单分页接口的请求参数。"""
    parser = argparse.ArgumentParser(
        description="单独请求积加退货订单分页接口，不写入数据库",
    )
    parser.add_argument(
        "--return-start-date",
        required=True,
        help="退货开始日期，格式 YYYY-MM-DD",
    )
    parser.add_argument(
        "--return-end-date",
        required=True,
        help="退货结束日期，格式 YYYY-MM-DD",
    )
    parser.add_argument("--page", type=int, default=1, help="页码，默认 1")
    parser.add_argument("--pagesize", type=int, default=100, help="每页数量，官方上限 100")
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=30,
        help="请求超时秒数，默认 30",
    )
    parser.add_argument(
        "--all-pages",
        action="store_true",
        help="根据每页实时 total 拉取完整日期窗口，只输出汇总",
    )
    parser.add_argument(
        "--discover-earliest",
        action="store_true",
        help="按31天窗口粗扫，并在首个非空窗口内二分定位最早数据日期",
    )
    return parser.parse_args()


def build_request_body(args: argparse.Namespace) -> dict[str, Any]:
    """校验命令行参数并生成官方字段格式的请求体。"""
    start_date = date.fromisoformat(args.return_start_date)
    end_date = date.fromisoformat(args.return_end_date)
    if end_date < start_date:
        raise ValueError("return-end-date 不能早于 return-start-date")
    if args.page < 1:
        raise ValueError("page 必须大于等于 1")
    if not 1 <= args.pagesize <= 100:
        raise ValueError("pagesize 必须在 1 到 100 之间")
    if args.timeout_seconds < 1:
        raise ValueError("timeout-seconds 必须大于等于 1")

    return {
        "returnStartDate": start_date.isoformat(),
        "returnEndDate": end_date.isoformat(),
        "page": args.page,
        "pagesize": args.pagesize,
    }


def summarize_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """只保留排查所需元数据，禁止输出退货订单明细。"""
    result: dict[str, Any] = {"http_status": 200}
    result["business_code"] = payload.get("code")
    result["trace_id"] = payload.get("traceId") or payload.get("trace_id")
    messages = payload.get("messages")
    if messages:
        result["messages"] = messages

    data = payload.get("data")
    if isinstance(data, dict):
        rows = data.get("rows")
        result["data_summary"] = {
            "total": data.get("total"),
            "page": data.get("page"),
            "pagesize": data.get("pagesize"),
            "row_count": len(rows) if isinstance(rows, list) else None,
        }
    return result


def request_all_pages(
    request_page: Callable[[dict[str, Any]], dict[str, Any]],
    request_body: dict[str, Any],
) -> dict[str, Any]:
    """按实时 total 拉取完整窗口，返回不含订单明细的汇总。"""
    page_no = int(request_body["page"])
    page_size = int(request_body["pagesize"])
    request_count = 0
    row_count = 0
    total_count = 0
    first_trace_id = None
    last_trace_id = None
    last_summary: dict[str, Any] = {}

    while True:
        page_body = {**request_body, "page": page_no}
        payload = request_page(page_body)
        request_count += 1
        last_summary = summarize_payload(payload)
        if last_summary.get("business_code") not in (0, 200):
            return {
                **last_summary,
                "data_summary": {
                    "total": total_count,
                    "required_pages": None,
                    "requested_pages": request_count,
                    "row_count": row_count,
                    "complete": False,
                },
            }

        page_summary = last_summary.get("data_summary") or {}
        page_total = page_summary.get("total")
        page_row_count = page_summary.get("row_count")
        if not isinstance(page_total, int) or not isinstance(page_row_count, int):
            raise ValueError("分页响应缺少有效的 data.total 或 data.rows")

        total_count = page_total
        row_count += page_row_count
        trace_id = last_summary.get("trace_id")
        first_trace_id = first_trace_id or trace_id
        last_trace_id = trace_id
        if page_no * page_size >= total_count:
            break

        page_no += 1

    required_pages = max(1, math.ceil(total_count / page_size))
    complete = row_count == total_count and request_count == required_pages
    return {
        "http_status": last_summary.get("http_status"),
        "business_code": last_summary.get("business_code"),
        "messages": last_summary.get("messages"),
        "first_trace_id": first_trace_id,
        "last_trace_id": last_trace_id,
        "data_summary": {
            "total": total_count,
            "required_pages": required_pages,
            "requested_pages": request_count,
            "row_count": row_count,
            "complete": complete,
        },
    }


def main() -> int:
    """获取凭证并执行一次退货订单分页请求。"""
    try:
        args = parse_args()
        request_body = build_request_body(args)
        if args.all_pages and args.discover_earliest:
            raise ValueError("all-pages 和 discover-earliest 不能同时使用")
        if (args.all_pages or args.discover_earliest) and args.page != 1:
            raise ValueError("完整分页或历史发现模式必须从第 1 页开始")
        if args.discover_earliest:
            # 发现阶段只依赖 total，单条响应可以降低敏感业务数据的传输量。
            request_body["pagesize"] = 1

        settings = load_settings()
        engine = create_db_engine(settings)
        with engine.connect() as connection:
            api_config = load_published_api_config(connection, API_CODE)
        if api_config is None:
            raise ValueError("退货订单接口配置不存在")
        rate_limiter = MySqlApiRateLimiter(
            engine,
            utilization=settings.jijia_rate_limit_utilization,
        )
        auth_client = JijiaAuthClient(
            settings,
            timeout_seconds=args.timeout_seconds,
            rate_limiter=rate_limiter,
        )
        token = auth_client.get_access_token()
        api_client = JijiaApiClient(
            settings,
            timeout_seconds=args.timeout_seconds,
            auth_client=auth_client,
            rate_limiter=rate_limiter,
        )

        def request_page(body: dict[str, Any]) -> dict[str, Any]:
            return api_client.request(api_config, token, body)

        if args.discover_earliest:
            response_summary = {
                "discovery": discover_earliest_date(
                    request_page,
                    date.fromisoformat(args.return_start_date),
                    date.fromisoformat(args.return_end_date),
                )
            }
        elif args.all_pages:
            response_summary = request_all_pages(
                request_page,
                request_body,
            )
        else:
            response_summary = summarize_payload(request_page(request_body))
        result = {
            "method": "POST",
            "path": api_config["path"],
            "request_body": request_body,
            **response_summary,
        }
        # ASCII JSON 可避免 PowerShell 终端再次破坏中文错误信息。
        print(json.dumps(result, ensure_ascii=True))
        successful = result.get("business_code") in (0, 200)
        if args.discover_earliest:
            successful = bool((result.get("discovery") or {}).get("complete"))
        elif args.all_pages:
            successful = successful and bool((result.get("data_summary") or {}).get("complete"))
        return 0 if successful else 1
    except (ValueError, RequestException) as error:
        print(
            json.dumps(
                {
                    "error_type": type(error).__name__,
                    "error": "请求未完成，请检查参数、网络或本地鉴权配置",
                },
                ensure_ascii=True,
            )
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
