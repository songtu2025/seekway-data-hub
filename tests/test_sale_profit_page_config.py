import unittest

import yaml


class SaleProfitPageConfigTest(unittest.TestCase):
    def test_sale_profit_page_uses_market_dimension_single_day_window(self) -> None:
        with open("config/api_config.example.yaml", "r", encoding="utf-8") as file:
            apis = {item["api_code"]: item for item in yaml.safe_load(file)["apis"]}

        api = apis["sale_profit_page"]
        self.assertFalse(api["enabled"])
        self.assertEqual(api["method"], "POST")
        self.assertEqual(api["path"], "/operation/sts/saleProfit/page")
        self.assertTrue(api["commit_per_page"])
        self.assertEqual(api["data_date_param"], "beginDate")
        self.assertEqual(api["primary_key"], {"field": "", "required": False})
        self.assertEqual(api["date_field"], "statisticsDate")

        page = api["page"]
        self.assertTrue(page["enabled"])
        self.assertEqual(page["page_no_field"], "page")
        self.assertEqual(page["page_size_field"], "pagesize")
        self.assertEqual(page["page_size"], 100)
        self.assertEqual(page["max_pages"], 5)
        self.assertEqual(page["list_field"], "data.rows")
        self.assertEqual(page["total_field"], "data.total")

        window = api["date_window"]
        self.assertTrue(window["enabled"])
        self.assertEqual(window["start_field"], "beginDate")
        self.assertEqual(window["end_field"], "endDate")
        self.assertEqual(window["days"], 1)
        self.assertEqual(window["lag_days"], 1)

        self.assertEqual(api["rate_limit"], {"max_requests": 1, "period_seconds": 1})
        self.assertEqual(api["retry"], {"retries": 1, "delay_seconds": 1})
        self.assertEqual(
            api["params"],
            {
                "showCurrencyType": "YUAN",
                "type": "MARKET",
                "page": 1,
                "pagesize": 100,
            },
        )


if __name__ == "__main__":
    unittest.main()
