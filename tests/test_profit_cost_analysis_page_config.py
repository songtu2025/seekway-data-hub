import unittest

import yaml


class ProfitCostAnalysisPageConfigTest(unittest.TestCase):
    def test_profit_cost_analysis_page_uses_single_day_fifo_window(self) -> None:
        with open("config/api_config.example.yaml", "r", encoding="utf-8") as file:
            apis = {item["api_code"]: item for item in yaml.safe_load(file)["apis"]}

        api = apis["profit_cost_analysis_page"]
        self.assertFalse(api["enabled"])
        self.assertEqual(api["method"], "POST")
        self.assertEqual(api["path"], "/finance/sts/profitCostAnalysis/page")
        self.assertTrue(api["commit_per_page"])
        self.assertEqual(api["data_date_param"], "beginDate")
        self.assertEqual(api["primary_key"], {"field": "id", "required": False})
        self.assertEqual(api["date_field"], "purchaseDate")

        page = api["page"]
        self.assertTrue(page["enabled"])
        self.assertEqual(page["page_no_field"], "page")
        self.assertEqual(page["page_size_field"], "pagesize")
        self.assertEqual(page["page_size"], 100)
        self.assertEqual(page["max_pages"], 190)
        self.assertEqual(page["list_field"], "data.rows")
        self.assertEqual(page["total_field"], "data.total")

        window = api["date_window"]
        self.assertTrue(window["enabled"])
        self.assertEqual(window["start_field"], "beginDate")
        self.assertEqual(window["end_field"], "endDate")
        self.assertEqual(window["days"], 1)
        self.assertEqual(window["lag_days"], 1)

        self.assertEqual(api["rate_limit"], {"max_requests": 1, "period_seconds": 5})
        self.assertEqual(api["retry"], {"retries": 1, "delay_seconds": 1})
        self.assertEqual(
            api["params"],
            {
                "currency": "YUAN",
                "platformCodes": ["AMAZON"],
                "costValues": 0,
                "page": 1,
                "pagesize": 100,
            },
        )


if __name__ == "__main__":
    unittest.main()
