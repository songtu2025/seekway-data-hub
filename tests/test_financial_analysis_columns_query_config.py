import unittest

import yaml


class FinancialAnalysisColumnsQueryConfigTest(unittest.TestCase):
    def test_financial_analysis_columns_query_uses_market_column_list(self) -> None:
        with open("config/api_config.example.yaml", "r", encoding="utf-8") as file:
            apis = {item["api_code"]: item for item in yaml.safe_load(file)["apis"]}

        api = apis["financial_analysis_columns_query"]
        self.assertFalse(api["enabled"])
        self.assertEqual(api["method"], "GET")
        self.assertEqual(api["path"], "/finance/sts/colData/query")
        self.assertTrue(api["commit_per_page"])
        self.assertNotIn("data_date_param", api)
        self.assertNotIn("date_window", api)
        self.assertEqual(api["primary_key"], {"field": "colCode", "required": False})
        self.assertEqual(api["date_field"], "")

        page = api["page"]
        self.assertFalse(page["enabled"])
        self.assertEqual(page["list_field"], "data")
        self.assertNotIn("total_field", page)

        self.assertEqual(api["rate_limit"], {"max_requests": 3, "period_seconds": 1})
        self.assertEqual(api["retry"], {"retries": 1, "delay_seconds": 1})
        self.assertEqual(api["params"], {"dimension": "market"})


if __name__ == "__main__":
    unittest.main()
