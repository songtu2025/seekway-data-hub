import unittest

import yaml


class DateRangeReportsPageConfigTest(unittest.TestCase):
    def test_date_range_reports_page_uses_market_day_backfill(self) -> None:
        with open("config/api_config.example.yaml", encoding="utf-8") as file:
            apis = {item["api_code"]: item for item in yaml.safe_load(file)["apis"]}

        api = apis["date_range_reports_page"]
        self.assertFalse(api["enabled"])
        self.assertEqual(api["method"], "POST")
        self.assertEqual(api["path"], "/finance/asset/dateRangeReports/page")
        self.assertTrue(api["commit_per_page"])
        self.assertEqual(api["data_date_param"], "purchaseStartDate")
        self.assertEqual(api["primary_key"], {"field": "id", "required": False})
        self.assertEqual(api["date_field"], "marketDate")
        self.assertTrue(api["sensitive_response"])

        page = api["page"]
        self.assertTrue(page["enabled"])
        self.assertEqual(page["page_no_field"], "page")
        self.assertEqual(page["page_size_field"], "pagesize")
        self.assertEqual(page["page_size"], 100)
        self.assertEqual(page["list_field"], "data.rows")
        self.assertEqual(page["total_field"], "data.total")
        self.assertNotIn("max_pages", page)

        window = api["date_window"]
        self.assertTrue(window["enabled"])
        self.assertEqual(window["start_field"], "purchaseStartDate")
        self.assertEqual(window["end_field"], "purchaseEndDate")
        self.assertEqual(window["default_start"], "2021-08-01")
        self.assertEqual(window["days"], 1)
        self.assertEqual(window["lag_days"], 1)

        self.assertEqual(
            api["rate_limit"],
            {
                "max_requests": 1,
                "period_seconds": 1,
                "cooldown_seconds": 65,
            },
        )
        self.assertEqual(api["retry"], {"retries": 3, "delay_seconds": 1})
        self.assertEqual(api["params"], {"queryDateType": 0, "page": 1, "pagesize": 100})


if __name__ == "__main__":
    unittest.main()
