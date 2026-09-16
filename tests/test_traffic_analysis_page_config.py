import unittest

from app.config import load_api_configs


class TrafficAnalysisPageConfigTest(unittest.TestCase):
    def setUp(self):
        self.apis = {
            api["api_code"]: api for api in load_api_configs("config/api_config.example.yaml")
        }

    def test_traffic_analysis_page_uses_full_date_window_with_lag_and_is_enabled(self):
        self.assertIn("traffic_analysis_page", self.apis)
        api = self.apis["traffic_analysis_page"]

        self.assertTrue(api["enabled"])
        self.assertEqual(api["method"], "POST")
        self.assertEqual(api["path"], "/operation/sts/trafficAnalysis/page")
        self.assertTrue(api["page"]["enabled"])
        self.assertEqual(api["page"]["page_no_field"], "page")
        self.assertEqual(api["page"]["page_size_field"], "pagesize")
        self.assertEqual(api["page"]["page_size"], 500)
        self.assertEqual(api["page"]["max_pages"], 8)
        self.assertEqual(api["page"]["list_field"], "data.rows")
        self.assertEqual(api["page"]["total_field"], "data.total")
        self.assertEqual(api["primary_key"]["field"], "")
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
        self.assertEqual(api["params"]["page"], 1)
        self.assertEqual(api["params"]["pagesize"], 500)


if __name__ == "__main__":
    unittest.main()
