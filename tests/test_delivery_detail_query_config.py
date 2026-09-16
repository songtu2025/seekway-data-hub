import unittest

from app.config import load_api_configs


class DeliveryDetailQueryConfigTest(unittest.TestCase):
    def setUp(self):
        self.apis = {
            api["api_code"]: api for api in load_api_configs("config/api_config.example.yaml")
        }

    def test_delivery_detail_query_uses_one_real_delivery_code(self):
        self.assertIn("delivery_detail_query", self.apis)
        api = self.apis["delivery_detail_query"]

        self.assertFalse(api["enabled"])
        self.assertEqual(api["method"], "POST")
        self.assertEqual(api["path"], "/fulfillment/ship/delivery/query")
        self.assertEqual(api["page"], {"enabled": False})
        self.assertEqual(api["response"], {"item_field": "data"})
        self.assertEqual(
            api["primary_key"],
            {"field": "deliveryCode", "required": False},
        )
        self.assertEqual(api["date_field"], "updateTime")
        self.assertTrue(api["sensitive_response"])
        self.assertEqual(api["rate_limit"], {"max_requests": 5, "period_seconds": 1})
        self.assertEqual(api["retry"], {"retries": 1, "delay_seconds": 1})
        self.assertEqual(
            api["param_source"],
            {
                "source_api_code": "delivery_page",
                "limit": 1,
                "auto_advance": True,
                "exclude_existing_target": True,
                "fields": [
                    {
                        "source_field": "raw_json.code",
                        "target_field": "deliveryCodes",
                        "wrap_in_list": True,
                    }
                ],
            },
        )
        self.assertEqual(api["params"], {"needItem": True})
        self.assertNotIn("commit_per_page", api)
        self.assertNotIn("date_window", api)
        self.assertNotIn("max_pages", api["page"])


if __name__ == "__main__":
    unittest.main()
