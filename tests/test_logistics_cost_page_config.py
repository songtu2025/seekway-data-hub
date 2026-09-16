import unittest

import yaml


class LogisticsCostPageConfigTest(unittest.TestCase):
    def test_logistics_cost_page_stays_disabled_without_required_filter_source(self):
        with open("config/api_config.example.yaml", encoding="utf-8") as file:
            apis = {api["api_code"]: api for api in yaml.safe_load(file)["apis"]}

        self.assertIn("logistics_cost_page", apis)
        api = apis["logistics_cost_page"]

        self.assertFalse(api["enabled"])
        self.assertEqual(api["method"], "POST")
        self.assertEqual(api["path"], "/fulfillment/ship/cost/page")
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
        self.assertNotIn("max_pages", api["page"])
        self.assertNotIn("commit_per_page", api)
        self.assertNotIn("date_window", api)
        self.assertNotIn("param_source", api)
        self.assertEqual(api["primary_key"], {"field": "id", "required": False})
        self.assertEqual(api["date_field"], "updateAt")
        self.assertTrue(api["sensitive_response"])
        self.assertEqual(api["rate_limit"], {"max_requests": 2, "period_seconds": 1})
        self.assertEqual(api["retry"], {"retries": 1, "delay_seconds": 1})
        self.assertEqual(api["params"], {"page": 1, "pagesize": 100})


if __name__ == "__main__":
    unittest.main()
