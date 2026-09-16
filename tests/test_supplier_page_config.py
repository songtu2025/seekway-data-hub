import unittest

import yaml


class SupplierPageConfigTest(unittest.TestCase):
    def test_supplier_page_is_default_disabled_and_sensitive_raw_only(self):
        with open("config/api_config.example.yaml", encoding="utf-8") as file:
            apis = {api["api_code"]: api for api in yaml.safe_load(file)["apis"]}

        self.assertIn("supplier_page", apis)
        api = apis["supplier_page"]

        self.assertFalse(api["enabled"])
        self.assertEqual(api["method"], "POST")
        self.assertEqual(api["path"], "/purchase/srm/supplier/page")
        self.assertEqual(api["timeout_seconds"], 30)
        self.assertEqual(
            api["page"],
            {
                "enabled": True,
                "page_no_field": "page",
                "page_size_field": "pagesize",
                "page_size": 100,
                "max_pages": 1,
                "list_field": "data.rows",
                "total_field": "data.total",
            },
        )
        self.assertEqual(api["primary_key"], {"field": "", "required": False})
        self.assertEqual(api["date_field"], "createdAt")
        self.assertTrue(api["sensitive_response"])
        self.assertEqual(api["rate_limit"], {"max_requests": 2, "period_seconds": 1})
        self.assertEqual(api["retry"], {"retries": 1, "delay_seconds": 1})
        self.assertEqual(api["params"], {"page": 1, "pagesize": 100})


if __name__ == "__main__":
    unittest.main()
