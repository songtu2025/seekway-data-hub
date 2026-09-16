import unittest

import yaml


class DeliveryPageConfigTest(unittest.TestCase):
    def test_delivery_page_is_enabled_after_verified_sync(self):
        with open("config/api_config.example.yaml", encoding="utf-8") as file:
            apis = {api["api_code"]: api for api in yaml.safe_load(file)["apis"]}

        self.assertIn("delivery_page", apis)
        api = apis["delivery_page"]

        self.assertTrue(api["enabled"])
        self.assertEqual(api["method"], "POST")
        self.assertEqual(api["path"], "/fulfillment/ship/delivery/page")
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
        self.assertNotIn("date_window", api)
        self.assertEqual(api["primary_key"], {"field": "id", "required": False})
        self.assertEqual(api["date_field"], "updateTime")
        self.assertTrue(api["sensitive_response"])
        self.assertEqual(api["rate_limit"], {"max_requests": 2, "period_seconds": 1})
        self.assertEqual(api["retry"], {"retries": 1, "delay_seconds": 1})
        self.assertEqual(api["params"], {"page": 1, "pagesize": 100})


if __name__ == "__main__":
    unittest.main()
