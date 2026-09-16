import unittest

import yaml


class AllocationDetailPageConfigTest(unittest.TestCase):
    def test_allocation_detail_page_uses_bounded_month_and_official_id(self) -> None:
        with open("config/api_config.example.yaml", "r", encoding="utf-8") as file:
            apis = {item["api_code"]: item for item in yaml.safe_load(file)["apis"]}

        api = apis["allocation_detail_page"]
        self.assertFalse(api["enabled"])
        self.assertEqual(api["method"], "GET")
        self.assertEqual(api["path"], "/finance/sts/allocationDetail/page")
        self.assertTrue(api["commit_per_page"])
        self.assertNotIn("data_date_param", api)
        self.assertEqual(api["primary_key"], {"field": "id", "required": False})
        self.assertEqual(api["date_field"], "createTime")
        self.assertNotIn("date_window", api)

        page = api["page"]
        self.assertTrue(page["enabled"])
        self.assertEqual(page["page_no_field"], "page")
        self.assertEqual(page["page_size_field"], "pagesize")
        self.assertEqual(page["page_size"], 100)
        self.assertEqual(page["max_pages"], 20)
        self.assertEqual(page["list_field"], "data.rows")
        self.assertEqual(page["total_field"], "data.total")

        self.assertEqual(api["rate_limit"], {"max_requests": 1, "period_seconds": 2})
        self.assertEqual(api["retry"], {"retries": 1, "delay_seconds": 1})
        self.assertEqual(
            api["params"],
            {"marketDate": "2026-06", "page": 1, "pagesize": 100},
        )


if __name__ == "__main__":
    unittest.main()
