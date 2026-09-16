import json
import unittest
from datetime import date
from unittest.mock import Mock

from app.sale_return_discovery import discover_earliest_date
from request_sale_return_order_page import (
    request_all_pages,
)


def build_payload(page: int, total: int, row_count: int) -> dict:
    """生成不含真实业务字段的分页响应。"""
    return {
        "code": 200,
        "traceId": f"placeholder-trace-{page}",
        "messages": ["request.success"],
        "data": {
            "total": total,
            "page": page,
            "pagesize": 100,
            "rows": [{"id": f"placeholder-{index}"} for index in range(row_count)],
        },
    }


class RequestSaleReturnOrderPageTest(unittest.TestCase):
    def test_all_pages_uses_total_and_only_returns_summary(self):
        request_page = Mock(
            side_effect=[
                build_payload(1, 250, 100),
                build_payload(2, 250, 100),
                build_payload(3, 250, 50),
            ]
        )
        body = {
            "returnStartDate": "2026-08-04",
            "returnEndDate": "2026-08-10",
            "page": 1,
            "pagesize": 100,
        }

        result = request_all_pages(
            request_page,
            body,
        )

        self.assertEqual(request_page.call_count, 3)
        self.assertEqual(
            result["data_summary"],
            {
                "total": 250,
                "required_pages": 3,
                "requested_pages": 3,
                "row_count": 250,
                "complete": True,
            },
        )
        self.assertNotIn("rows", json.dumps(result))

    def test_discovery_skips_empty_windows_and_refines_first_nonempty_date(
        self,
    ):
        earliest = date(2020, 2, 20)

        def respond(body):
            window_start = date.fromisoformat(body["returnStartDate"])
            window_end = date.fromisoformat(body["returnEndDate"])
            total = 1 if window_start <= earliest <= window_end else 0
            return build_payload(1, total, min(total, 1))

        request_page = Mock(side_effect=respond)

        result = discover_earliest_date(
            request_page,
            date(2020, 1, 1),
            date(2020, 3, 15),
        )

        self.assertEqual(result["earliest_data_date"], "2020-02-20")
        self.assertEqual(result["earliest_day_total"], 1)
        self.assertEqual(result["coarse_windows_checked"], 2)
        self.assertEqual(result["request_count"], request_page.call_count)
        self.assertTrue(all(call.args[0]["pagesize"] == 1 for call in request_page.call_args_list))

    def test_discovery_reports_no_data_without_returning_rows(self):
        request_page = Mock(return_value=build_payload(1, 0, 0))

        result = discover_earliest_date(
            request_page,
            date(2020, 1, 1),
            date(2020, 2, 15),
        )

        self.assertEqual(result["earliest_data_date"], None)
        self.assertEqual(result["coarse_windows_checked"], 2)
        self.assertEqual(result["request_count"], 2)
        self.assertNotIn("rows", json.dumps(result))

    def test_discovery_rejects_invalid_total_without_exposing_response(self):
        request_page = Mock(return_value={"code": 200, "data": {"total": "invalid", "rows": []}})

        with self.assertRaisesRegex(ValueError, "缺少有效的 data.total"):
            discover_earliest_date(
                request_page,
                date(2020, 1, 1),
                date(2020, 1, 31),
            )

    def test_discovery_rejects_inconsistent_final_day(self):
        responses = [build_payload(1, 1, 1)]
        responses.extend(build_payload(1, 1, 1) for _ in range(5))
        responses.append(build_payload(1, 0, 0))
        request_page = Mock(side_effect=responses)

        with self.assertRaisesRegex(ValueError, "结果前后不一致"):
            discover_earliest_date(
                request_page,
                date(2020, 1, 1),
                date(2020, 1, 31),
            )


if __name__ == "__main__":
    unittest.main()
