import unittest
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import Mock, patch

from sqlalchemy.exc import SQLAlchemyError

import app.main as main_module


class MainErrorLoggingTest(unittest.TestCase):
    def test_single_api_logs_only_safe_exception_context(self):
        secret = "token=token-value appKey=app-key mysql://user:pass@db/private"
        sync_engine = Mock()
        sync_engine.test_api_once.side_effect = ValueError(secret)
        auth_client = Mock()
        auth_client.get_access_token.return_value = object()

        with (
            patch.object(main_module, "create_db_engine", return_value=object()),
            patch.object(main_module, "_sync_task_lock", side_effect=lambda engine: nullcontext()),
            patch.object(main_module, "JijiaAuthClient", return_value=auth_client),
            patch.object(main_module, "JijiaApiClient", return_value=object()),
            patch.object(main_module, "load_published_api_configs", return_value=[]),
            patch.object(main_module, "SyncEngine", return_value=sync_engine),
            self.assertLogs("app.main", level="ERROR") as logs,
            self.assertRaises(SystemExit) as raised,
        ):
            main_module._run_single_api(
                SimpleNamespace(jijia_rate_limit_utilization=0.9),
                "inventory_adjustments_page",
                "sync api",
            )

        self.assertEqual(raised.exception.code, 1)
        message = "\n".join(logs.output)
        self.assertIn("error_type=ValueError", message)
        self.assertNotIn("token-value", message)
        self.assertNotIn("app-key", message)
        self.assertNotIn("mysql://", message)

    def test_sync_enabled_logs_only_safe_exception_context(self):
        secret = "token=token-value appKey=app-key mysql://user:pass@db/private"
        sync_engine = Mock()
        sync_engine.sync_enabled_apis.side_effect = SQLAlchemyError(secret)
        auth_client = Mock()
        auth_client.get_access_token.return_value = object()

        with (
            patch.object(main_module, "create_db_engine", return_value=object()),
            patch.object(main_module, "_sync_task_lock", side_effect=lambda engine: nullcontext()),
            patch.object(main_module, "JijiaAuthClient", return_value=auth_client),
            patch.object(main_module, "JijiaApiClient", return_value=object()),
            patch.object(main_module, "load_published_api_configs", return_value=[]),
            patch.object(main_module, "SyncEngine", return_value=sync_engine),
            self.assertLogs("app.main", level="ERROR") as logs,
            self.assertRaises(SystemExit) as raised,
        ):
            main_module._sync_enabled(SimpleNamespace(jijia_rate_limit_utilization=0.9))

        self.assertEqual(raised.exception.code, 1)
        message = "\n".join(logs.output)
        self.assertIn("error_type=SQLAlchemyError", message)
        self.assertNotIn("token-value", message)
        self.assertNotIn("app-key", message)
        self.assertNotIn("mysql://", message)

    def test_token_validation_logs_only_error_type(self):
        secret = "token=token-value appKey=app-key mysql://user:pass@db/private"
        auth_client = Mock()
        auth_client.get_access_token.side_effect = ValueError(secret)

        with (
            patch.object(main_module, "create_db_engine", return_value=object()),
            patch.object(main_module, "JijiaAuthClient", return_value=auth_client),
            self.assertLogs("app.main", level="ERROR") as logs,
            self.assertRaises(SystemExit) as raised,
        ):
            main_module._test_token(
                SimpleNamespace(jijia_rate_limit_utilization=0.9)
            )

        self.assertEqual(raised.exception.code, 1)
        message = "\n".join(logs.output)
        self.assertIn("error_type=ValueError", message)
        self.assertNotIn("token-value", message)
        self.assertNotIn("app-key", message)
        self.assertNotIn("mysql://", message)


if __name__ == "__main__":
    unittest.main()
