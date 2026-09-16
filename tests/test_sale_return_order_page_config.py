import json
import unittest
from pathlib import Path

from app.config import load_api_configs
from app.doc_catalog import load_review_overrides


class SaleReturnOrderPageConfigTest(unittest.TestCase):
    def test_sale_return_order_page_uses_verified_read_only_contract(self):
        api_configs = load_api_configs("config/api_config.example.yaml")
        reviews = load_review_overrides("config/api_review_overrides.yaml")
        api = next(item for item in api_configs if item["api_code"] == "sale_return_order_page")

        self.assertFalse(api["enabled"])
        self.assertEqual(api["method"], "POST")
        self.assertEqual(api["path"], "/operation/sale/returnOrder/page")
        self.assertEqual(api["storage_mode"], "history_on_change")
        self.assertEqual(api["checkpoint_kind"], "history_backfill")
        self.assertEqual(
            api["page"],
            {
                "enabled": True,
                "page_no_field": "page",
                "page_size_field": "pagesize",
                "page_size": 100,
                "list_field": "data.rows",
                "total_field": "data.total",
            },
        )
        self.assertTrue(api["commit_per_page"])
        self.assertEqual(api["primary_key"], {"field": "id", "required": False})
        self.assertEqual(api["date_field"], "returnDateTime")
        self.assertEqual(
            api["date_window"],
            {
                "enabled": True,
                "start_field": "returnStartDate",
                "end_field": "returnEndDate",
                "default_start": "2020-01-01",
                "days": 31,
                "lag_days": 1,
            },
        )
        self.assertEqual(
            api["update_window"],
            {
                "enabled": True,
                "verified_doc_id": 9,
                "start_field": "updateTimeBegin",
                "end_field": "updateTimeEnd",
                "default_start": "2020-01-01",
                "days": 31,
                "lag_days": 1,
                "value_format": "datetime",
            },
        )
        self.assertEqual(
            api["market_scope"],
            {
                "enabled": True,
                "verified_doc_id": 9,
                "request_field": "marketIds",
                "source_api_code": "amazon_shop_page",
                "source_array_field": "marketListVos",
                "id_field": "marketId",
                "label_fields": ["marketName"],
            },
        )
        self.assertTrue(api["sensitive_response"])
        self.assertEqual(api["rate_limit"], {"max_requests": 5, "period_seconds": 1})
        self.assertEqual(api["params"], {"page": 1, "pagesize": 100})
        self.assertNotIn(9, reviews)

        catalog = json.loads(
            Path("config/jijia_api_catalog.generated.json").read_text(encoding="utf-8")
        )
        documented = next(item for item in catalog["apis"] if item["doc_id"] == 9)
        self.assertEqual(
            documented["verified_request_contract"],
            [
                {
                    "name": "updateTimeBegin",
                    "type": "datetime",
                    "must": False,
                    "description": "修改开始时间 [yyyy-MM-dd HH:mm:ss]",
                },
                {
                    "name": "updateTimeEnd",
                    "type": "datetime",
                    "must": False,
                    "description": "修改结束时间 [yyyy-MM-dd HH:mm:ss]",
                },
                {
                    "name": "marketIds",
                    "type": "array<int>",
                    "must": False,
                    "description": "站点ID集合",
                },
            ],
        )


if __name__ == "__main__":
    unittest.main()
