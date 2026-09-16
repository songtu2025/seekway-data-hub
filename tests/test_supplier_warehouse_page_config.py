import unittest

from app.config import load_api_configs


class SupplierWarehousePageConfigTest(unittest.TestCase):
    def test_supplier_warehouse_page_is_raw_only_and_stays_disabled(self):
        apis = {api["api_code"]: api for api in load_api_configs("config/api_config.example.yaml")}

        self.assertIn("supplier_warehouse_page", apis)
        api = apis["supplier_warehouse_page"]

        self.assertFalse(api["enabled"])
        self.assertEqual(api["method"], "POST")
        self.assertEqual(api["path"], "/purchase/inventory/supplierWarehouse/page")
        self.assertEqual(
            api["page"],
            {
                "enabled": True,
                "page_no_field": "page",
                "page_size_field": "pagesize",
                "page_size": 100,
                "max_pages": 20,
                "list_field": "data.rows",
                "total_field": "data.total",
            },
        )
        self.assertEqual(api["primary_key"], {"field": "id", "required": True})
        self.assertEqual(api["date_field"], "createDate")
        self.assertTrue(api["sensitive_response"])
        self.assertEqual(api["rate_limit"], {"max_requests": 2, "period_seconds": 1})
        self.assertEqual(api["retry"], {"retries": 3, "delay_seconds": 1})
        self.assertEqual(api["params"], {"page": 1, "pagesize": 100})


if __name__ == "__main__":
    unittest.main()
