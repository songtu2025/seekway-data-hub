import unittest

from app.config import load_api_configs


class TrafficSkuAnalysisPageConfigTest(unittest.TestCase):
    def setUp(self):
        self.apis = {
            api["api_code"]: api for api in load_api_configs("config/api_config.example.yaml")
        }

    def test_traffic_sku_analysis_page_is_a_disabled_single_day_candidate(self):
        self.assertIn("traffic_sku_analysis_page", self.apis)
        api = self.apis["traffic_sku_analysis_page"]

        self.assertFalse(api["enabled"])
        self.assertTrue(api.get("commit_per_page"))
        self.assertEqual(api["method"], "POST")
        self.assertEqual(api["path"], "/operation/sts/trafficSkuAnalysis/page")
        self.assertTrue(api["page"]["enabled"])
        self.assertEqual(api["page"]["page_no_field"], "page")
        self.assertEqual(api["page"]["page_size_field"], "pagesize")
        self.assertEqual(api["page"]["page_size"], 100)
        self.assertEqual(api["page"]["max_pages"], 20)
        self.assertEqual(api["page"]["list_field"], "data.rows")
        self.assertEqual(api["page"]["total_field"], "data.total")
        self.assertEqual(api["primary_key"]["field"], "")
        self.assertFalse(api["primary_key"]["required"])
        self.assertEqual(api["date_field"], "recordDate")
        self.assertTrue(api["date_window"]["enabled"])
        self.assertEqual(api["date_window"]["start_field"], "beginDate")
        self.assertEqual(api["date_window"]["end_field"], "endDate")
        self.assertEqual(api["date_window"]["default_start"], "2026-07-02")
        self.assertEqual(api["date_window"]["days"], 1)
        self.assertEqual(api["date_window"]["lag_days"], 1)
        self.assertEqual(api["rate_limit"], {"max_requests": 1, "period_seconds": 1})
        self.assertEqual(api["retry"]["retries"], 1)
        self.assertEqual(api["params"]["currency"], "CNY")
        self.assertEqual(api["params"]["viewType"], "day")
        self.assertEqual(api["params"]["page"], 1)
        self.assertEqual(api["params"]["pagesize"], 100)


if __name__ == "__main__":
    unittest.main()
