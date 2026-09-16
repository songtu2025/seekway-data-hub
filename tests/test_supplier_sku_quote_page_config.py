import unittest

import yaml


class SupplierSkuQuotePageConfigTest(unittest.TestCase):
    def test_supplier_sku_quote_page_is_default_disabled_and_sensitive(self):
        with open("config/api_config.example.yaml", encoding="utf-8") as file:
            apis = {api["api_code"]: api for api in yaml.safe_load(file)["apis"]}

        self.assertIn("supplier_sku_quote_page", apis)
        api = apis["supplier_sku_quote_page"]

        self.assertFalse(api["enabled"])
        self.assertEqual(api["method"], "POST")
        self.assertEqual(api["path"], "/purchase/srm/supplierSkuQuote/page")
        self.assertEqual(api["timeout_seconds"], 30)
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
        self.assertEqual(api["primary_key"], {"field": "id", "required": True})
        self.assertEqual(api["date_field"], "createdAt")
        self.assertTrue(api["sensitive_response"])
        self.assertEqual(api["rate_limit"], {"max_requests": 1, "period_seconds": 1})
        self.assertEqual(api["retry"], {"retries": 1, "delay_seconds": 1})
        self.assertEqual(api["params"], {"page": 1, "pagesize": 100})


if __name__ == "__main__":
    unittest.main()
