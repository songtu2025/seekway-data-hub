import unittest

import yaml


class ShipTransportListConfigTest(unittest.TestCase):
    def test_ship_transport_list_matches_current_official_contract(self):
        with open("config/api_config.example.yaml", encoding="utf-8") as file:
            apis = {api["api_code"]: api for api in yaml.safe_load(file)["apis"]}

        self.assertIn("ship_transport_list", apis)
        api = apis["ship_transport_list"]

        self.assertTrue(api["enabled"])
        self.assertEqual(api["method"], "GET")
        self.assertEqual(api["path"], "/fulfillment/ship/transport/list")
        self.assertEqual(
            api["page"],
            {
                "enabled": True,
                "page_no_field": "page",
                "page_size_field": "pagesize",
                "page_size": 100,
                "list_field": "data.rows",
                "total_field": "data.total",
            },
        )
        self.assertEqual(api["primary_key"], {"field": "id", "required": False})
        self.assertEqual(api["date_field"], "")
        self.assertEqual(api["rate_limit"], {"max_requests": 1, "period_seconds": 1})
        self.assertEqual(api["params"], {"page": 1, "pagesize": 100})


if __name__ == "__main__":
    unittest.main()
