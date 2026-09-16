import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from requests import ConnectionError, HTTPError, Response

import app.main as main_module
from app.sync_engine import ApiRequestError


class MainProbeErrorLoggingTest(unittest.TestCase):
    def test_logs_wrapped_http_type_and_status_without_sensitive_details(self):
        response = Response()
        response.status_code = 400
        response._content = b"placeholder-sensitive-response"
        original_error = HTTPError(
            "placeholder-sensitive-message",
            response=response,
        )
        sync_engine = Mock()
        sync_engine.probe_api.side_effect = ApiRequestError(
            original_error,
            "https://placeholder.invalid/secret",
            "POST",
            {"secret": "placeholder-sensitive-param"},
            1,
        )
        auth_client = Mock()
        auth_client.get_access_token.return_value = object()

        with (
            patch.object(main_module, "create_db_engine", return_value=object()),
            patch.object(main_module, "load_published_api_configs", return_value=[]),
            patch.object(main_module, "JijiaAuthClient", return_value=auth_client),
            patch.object(main_module, "JijiaApiClient", return_value=object()),
            patch.object(main_module, "SyncEngine", return_value=sync_engine),
            self.assertLogs("app.main", level="ERROR") as logs,
            self.assertRaises(SystemExit) as raised,
        ):
            main_module._probe_single_api(
                SimpleNamespace(jijia_rate_limit_utilization=0.9),
                "placeholder_api",
            )

        self.assertEqual(raised.exception.code, 1)
        message = "\n".join(logs.output)
        self.assertIn("error_type=HTTPError", message)
        self.assertIn("http_status=400", message)
        self.assertNotIn("placeholder-sensitive-message", message)
        self.assertNotIn("placeholder-sensitive-response", message)
        self.assertNotIn("placeholder-sensitive-param", message)
        self.assertNotIn("placeholder.invalid", message)

    def test_logs_wrapped_error_without_response_as_unknown_status(self):
        original_error = ConnectionError("placeholder-sensitive-message")
        sync_engine = Mock()
        sync_engine.probe_api.side_effect = ApiRequestError(
            original_error,
            "https://placeholder.invalid/secret",
            "POST",
            {"secret": "placeholder-sensitive-param"},
            1,
        )
        auth_client = Mock()
        auth_client.get_access_token.return_value = object()

        with (
            patch.object(main_module, "create_db_engine", return_value=object()),
            patch.object(main_module, "load_published_api_configs", return_value=[]),
            patch.object(main_module, "JijiaAuthClient", return_value=auth_client),
            patch.object(main_module, "JijiaApiClient", return_value=object()),
            patch.object(main_module, "SyncEngine", return_value=sync_engine),
            self.assertLogs("app.main", level="ERROR") as logs,
            self.assertRaises(SystemExit) as raised,
        ):
            main_module._probe_single_api(
                SimpleNamespace(jijia_rate_limit_utilization=0.9),
                "placeholder_api",
            )

        self.assertEqual(raised.exception.code, 1)
        message = "\n".join(logs.output)
        self.assertIn("error_type=ConnectionError", message)
        self.assertIn("http_status=unknown", message)
        self.assertNotIn("placeholder-sensitive-message", message)
        self.assertNotIn("placeholder-sensitive-param", message)
        self.assertNotIn("placeholder.invalid", message)


if __name__ == "__main__":
    unittest.main()
