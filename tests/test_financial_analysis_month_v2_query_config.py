import unittest

import yaml


class FinancialAnalysisMonthV2QueryConfigTest(unittest.TestCase):
    def test_financial_analysis_month_v2_query_preserves_month_axis_and_tree(self) -> None:
        with open("config/api_config.example.yaml", "r", encoding="utf-8") as file:
            apis = {item["api_code"]: item for item in yaml.safe_load(file)["apis"]}

        api = apis["financial_analysis_month_v2_query"]
        self.assertFalse(api["enabled"])
        self.assertEqual(api["method"], "POST")
        self.assertEqual(api["path"], "/finance/sts/financialAnalysisMonth/query/V2")
        self.assertTrue(api["commit_per_page"])
        self.assertEqual(api["data_date_param"], "startDate")
        self.assertNotIn("date_window", api)
        self.assertEqual(api["response"], {"item_field": "data"})
        self.assertEqual(api["primary_key"], {"field": "", "required": False})
        self.assertEqual(api["date_field"], "")

        page = api["page"]
        self.assertFalse(page["enabled"])
        self.assertNotIn("list_field", page)
        self.assertNotIn("total_field", page)

        self.assertEqual(api["rate_limit"], {"max_requests": 1, "period_seconds": 1})
        self.assertEqual(api["retry"], {"retries": 1, "delay_seconds": 1})
        self.assertEqual(
            api["params"],
            {
                "costValues": 0,
                "startDate": "2026-06-01",
                "endDate": "2026-06-30",
                "currency": "YUAN",
            },
        )


if __name__ == "__main__":
    unittest.main()
