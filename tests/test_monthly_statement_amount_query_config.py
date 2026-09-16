import unittest

from app.config import load_api_configs


class MonthlyStatementAmountQueryConfigTest(unittest.TestCase):
    def setUp(self):
        self.apis = {
            api["api_code"]: api for api in load_api_configs("config/api_config.example.yaml")
        }

    def test_monthly_statement_amount_query_uses_single_day_read_window(self):
        self.assertIn("monthly_statement_amount_query", self.apis)
        api = self.apis["monthly_statement_amount_query"]

        self.assertFalse(api["enabled"])
        self.assertEqual(api["method"], "POST")
        self.assertEqual(api["path"], "/finance/asset/monthlyStatementAmount/query")
        self.assertFalse(api["page"]["enabled"])
        self.assertEqual(api["page"]["list_field"], "data")
        self.assertNotIn("total_field", api["page"])
        self.assertTrue(api["commit_per_page"])
        self.assertEqual(api["data_date_param"], "beginDate")
        self.assertEqual(api["primary_key"]["field"], "")
        self.assertFalse(api["primary_key"]["required"])
        self.assertEqual(api["date_field"], "")
        self.assertTrue(api["date_window"]["enabled"])
        self.assertEqual(api["date_window"]["start_field"], "beginDate")
        self.assertEqual(api["date_window"]["end_field"], "endDate")
        self.assertEqual(api["date_window"]["default_start"], "2026-07-02")
        self.assertEqual(api["date_window"]["days"], 1)
        self.assertEqual(api["date_window"]["lag_days"], 1)
        self.assertEqual(api["rate_limit"], {"max_requests": 1, "period_seconds": 1})
        self.assertEqual(api["retry"]["retries"], 1)
        self.assertEqual(api["params"]["typeCode"], 0)
        self.assertEqual(api["params"]["viewType"], "day")
        self.assertEqual(api["params"]["showCurrencyType"], "YUAN")
        self.assertNotIn("marketIds", api["params"])


if __name__ == "__main__":
    unittest.main()
