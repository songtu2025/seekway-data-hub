from collections.abc import Callable
from datetime import date, timedelta
from typing import Any


def discover_earliest_date(
    request_page: Callable[[dict[str, Any]], dict[str, Any]],
    start_date: date,
    end_date: date,
    *,
    window_days: int = 31,
) -> dict[str, Any]:
    """只读扫描日期总量，并定位账号可返回的最早业务日期。"""
    if end_date < start_date:
        raise ValueError("扫描结束日期不能早于开始日期")
    if window_days < 1:
        raise ValueError("window-days 必须大于等于 1")

    request_count = 0
    coarse_windows_checked = 0

    def probe_total(window_start: date, window_end: date) -> int:
        nonlocal request_count
        payload = request_page(
            {
                "returnStartDate": window_start.isoformat(),
                "returnEndDate": window_end.isoformat(),
                "page": 1,
                "pagesize": 1,
            }
        )
        request_count += 1
        return _payload_total(payload)

    cursor = start_date
    while cursor <= end_date:
        coarse_end = min(cursor + timedelta(days=window_days - 1), end_date)
        coarse_windows_checked += 1
        if probe_total(cursor, coarse_end) > 0:
            # 固定窗口左边界后，前缀 total 是否大于 0 是单调条件，可以安全二分。
            low = cursor
            high = coarse_end
            while low < high:
                middle = low + (high - low) // 2
                if probe_total(cursor, middle) > 0:
                    high = middle
                else:
                    low = middle + timedelta(days=1)
            earliest_total = probe_total(low, low)
            if earliest_total < 1:
                raise ValueError("历史起点扫描结果前后不一致")
            return {
                "complete": True,
                "lower_bound": start_date.isoformat(),
                "upper_bound": end_date.isoformat(),
                "earliest_data_date": low.isoformat(),
                "earliest_day_total": earliest_total,
                "coarse_windows_checked": coarse_windows_checked,
                "request_count": request_count,
            }
        cursor = coarse_end + timedelta(days=1)

    return {
        "complete": True,
        "lower_bound": start_date.isoformat(),
        "upper_bound": end_date.isoformat(),
        "earliest_data_date": None,
        "earliest_day_total": 0,
        "coarse_windows_checked": coarse_windows_checked,
        "request_count": request_count,
    }


def _payload_total(payload: dict[str, Any]) -> int:
    """只解析业务状态和 total，不保留或返回退货单明细。"""
    if payload.get("code") not in (0, 200):
        raise ValueError("历史起点扫描请求失败")
    data = payload.get("data")
    total = data.get("total") if isinstance(data, dict) else None
    if isinstance(total, bool) or not isinstance(total, int) or total < 0:
        raise ValueError("历史起点扫描响应缺少有效的 data.total")
    return total
