import unittest

from app.config import load_api_configs


class SalesAnalysisGroupConfigsTest(unittest.TestCase):
    def setUp(self):
        self.apis = {
            api["api_code"]: api for api in load_api_configs("config/api_config.example.yaml")
        }

    def test_sales_analysis_groups_are_configured_as_disabled_date_windows(self):
        expected_groups = {
            "sales_analysis_seller_sku_page": ("seller_sku", "2026-07-02"),
            "sales_analysis_asin_page": ("asin", "2026-07-02"),
            "sales_analysis_variation_asin_page": ("variation_asin", "2021-08-01"),
            "sales_analysis_sku_page": ("sku", "2026-07-02"),
            "sales_analysis_spu_page": ("spu", "2026-07-02"),
            "sales_analysis_country_page": ("country", "2026-07-02"),
            "sales_analysis_market_page": ("market", "2026-07-02"),
        }

        for api_code, (group_by_type, default_start) in expected_groups.items():
            with self.subTest(api_code=api_code):
                self.assertIn(api_code, self.apis)
                api = self.apis[api_code]

                self.assertFalse(api["enabled"])
                self.assertEqual(api["method"], "POST")
                self.assertEqual(api["path"], "/operation/sts/salesAnalysis/page")
                self.assertTrue(api["page"]["enabled"])
                self.assertEqual(api["page"]["page_no_field"], "page")
                self.assertEqual(api["page"]["page_size_field"], "pagesize")
                self.assertEqual(api["page"]["page_size"], 200)
                self.assertEqual(api["page"]["max_pages"], 500)
                self.assertEqual(api["page"]["list_field"], "data.rows")
                self.assertEqual(api["page"]["total_field"], "data.total")
                self.assertEqual(api["write_batch_size"], 10)
                self.assertTrue(api["commit_per_page"])
                self.assertEqual(api["data_date_param"], "beginDate")
                self.assertEqual(api["primary_key"]["field"], "")
                self.assertFalse(api["primary_key"]["required"])
                self.assertEqual(api["date_field"], "dateLine")
                self.assertTrue(api["date_window"]["enabled"])
                self.assertEqual(api["date_window"]["start_field"], "beginDate")
                self.assertEqual(api["date_window"]["end_field"], "endDate")
                self.assertEqual(api["date_window"]["default_start"], default_start)
                self.assertEqual(api["date_window"]["days"], 1)
                self.assertEqual(api["date_window"]["lag_days"], 1)
                self.assertEqual(
                    api["rate_limit"],
                    {"max_requests": 1, "period_seconds": 5},
                )
                self.assertEqual(api["retry"]["retries"], 1)
                self.assertEqual(api["params"]["groupByType"], group_by_type)
                self.assertEqual(api["params"]["showCurrencyType"], "YUAN")
                self.assertEqual(api["params"]["page"], 1)
                self.assertEqual(api["params"]["pagesize"], 200)


if __name__ == "__main__":
    unittest.main()
