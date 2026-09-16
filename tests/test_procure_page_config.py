import unittest

import yaml


class ProcurePageConfigTest(unittest.TestCase):
    def test_procure_page_is_default_disabled_with_nested_pagination(self):
        with open("config/api_config.example.yaml", encoding="utf-8") as file:
            apis = {api["api_code"]: api for api in yaml.safe_load(file)["apis"]}

        self.assertIn("procure_page", apis)
        api = apis["procure_page"]

        self.assertFalse(api["enabled"])
        self.assertEqual(api["method"], "POST")
        self.assertEqual(api["path"], "/purchase/srm/procure/page")
        self.assertEqual(
            api["page"],
            {
                "enabled": True,
                "page_no_field": "pageInfo.page",
                "page_size_field": "pageInfo.pagesize",
                "page_size": 100,
                "max_pages": 1,
                "list_field": "data.rows",
                "total_field": "data.total",
            },
        )
        self.assertEqual(api["primary_key"], {"field": "id", "required": True})
        self.assertEqual(api["date_field"], "updateTime")
        self.assertFalse(api["sensitive_response"])
        self.assertEqual(api["rate_limit"], {"max_requests": 2, "period_seconds": 1})
        self.assertEqual(api["retry"], {"retries": 1, "delay_seconds": 1})
        self.assertEqual(api["timeout_seconds"], 30)
        self.assertEqual(api["params"], {"pageInfo": {"page": 1, "pagesize": 100}})


if __name__ == "__main__":
    unittest.main()
