import unittest
from argparse import Namespace
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import Mock, patch

import app.main as main_module
from app.config import enabled_web_scheduler_only_api_codes, load_api_configs


class SchedulerOwnershipTest(unittest.TestCase):
    def test_legacy_mock_blocks_web_owned_api_before_database(self):
        args = Namespace(
            check_db=False,
            mock_sync=True,
            test_token=False,
            test_api=None,
            sync_api=None,
            probe_api=None,
            sync_enabled=False,
            sync_api_configs=False,
        )
        settings = Mock(
            log_dir="logs",
            log_level="INFO",
            api_config_path="config/api_config.example.yaml",
        )
        api_configs = [
            {
                "api_code": "sale_return_order_page",
                "enabled": True,
            }
        ]

        with (
            patch.object(main_module, "parse_args", return_value=args),
            patch.object(main_module, "load_settings", return_value=settings),
            patch.object(main_module, "setup_logging"),
            patch.object(main_module, "load_published_api_configs", return_value=api_configs),
            patch.object(main_module, "create_db_engine", return_value=object()) as create_engine,
            self.assertLogs("app.main", level="ERROR") as logs,
            self.assertRaises(SystemExit) as raised,
        ):
            main_module.main()

        self.assertEqual(raised.exception.code, 2)
        create_engine.assert_called_once()
        self.assertIn("LEGACY_SCHEDULER_OWNERSHIP_CONFLICT", "\n".join(logs.output))

    def test_legacy_single_writes_block_web_owned_api_before_database(self):
        for action_label in ("sync api", "test api"):
            with self.subTest(action_label=action_label):
                with (
                    patch.object(main_module, "create_db_engine") as create_engine,
                    self.assertLogs("app.main", level="ERROR") as logs,
                    self.assertRaises(SystemExit) as raised,
                ):
                    main_module._run_single_api(
                        object(),
                        "sale_return_order_page",
                        action_label,
                    )

                self.assertEqual(raised.exception.code, 2)
                create_engine.assert_not_called()
                self.assertIn(
                    "LEGACY_SCHEDULER_OWNERSHIP_CONFLICT",
                    "\n".join(logs.output),
                )

    def test_legacy_enabled_sync_blocks_web_owned_api_before_database(self):
        api_configs = [
            {
                "api_code": "sale_return_order_page",
                "enabled": True,
            }
        ]
        with (
            patch.object(main_module, "create_db_engine", return_value=object()) as create_engine,
            patch.object(main_module, "load_published_api_configs", return_value=api_configs),
            self.assertLogs("app.main", level="ERROR") as logs,
            self.assertRaises(SystemExit) as raised,
        ):
            main_module._sync_enabled(SimpleNamespace(jijia_rate_limit_utilization=0.9))

        self.assertEqual(raised.exception.code, 2)
        create_engine.assert_called_once()
        self.assertIn("LEGACY_SCHEDULER_OWNERSHIP_CONFLICT", "\n".join(logs.output))

    def test_legacy_enabled_sync_keeps_other_apis_unchanged(self):
        api_configs = [{"api_code": "amazon_shop_page", "enabled": True}]
        sync_engine = Mock()
        sync_engine.sync_enabled_apis.return_value = {
            "batch_no": "batch-safe",
            "failed_count": 0,
            "api_count": 1,
            "item_count": 1,
            "request_count": 1,
        }
        auth_client = Mock()
        auth_client.get_access_token.return_value = object()

        with (
            patch.object(main_module, "create_db_engine", return_value=object()),
            patch.object(main_module, "load_published_api_configs", return_value=api_configs),
            patch.object(
                main_module,
                "_sync_task_lock",
                side_effect=lambda _engine: nullcontext(),
            ),
            patch.object(main_module, "JijiaAuthClient", return_value=auth_client),
            patch.object(main_module, "JijiaApiClient", return_value=object()),
            patch.object(main_module, "SyncEngine", return_value=sync_engine),
        ):
            main_module._sync_enabled(SimpleNamespace(jijia_rate_limit_utilization=0.9))

        sync_engine.sync_enabled_apis.assert_called_once()

    def test_legacy_single_sync_keeps_other_api_unchanged(self):
        sync_engine = Mock()
        sync_engine.test_api_once.return_value = {
            "api_code": "amazon_shop_page",
            "batch_no": "batch-safe",
            "failed_count": 0,
            "item_count": 1,
            "request_count": 1,
        }
        auth_client = Mock()
        auth_client.get_access_token.return_value = object()

        with (
            patch.object(main_module, "create_db_engine", return_value=object()),
            patch.object(
                main_module,
                "load_published_api_configs",
                return_value=[{"api_code": "amazon_shop_page", "enabled": True}],
            ),
            patch.object(
                main_module,
                "_sync_task_lock",
                side_effect=lambda _engine: nullcontext(),
            ),
            patch.object(main_module, "JijiaAuthClient", return_value=auth_client),
            patch.object(main_module, "JijiaApiClient", return_value=object()),
            patch.object(main_module, "SyncEngine", return_value=sync_engine),
        ):
            main_module._run_single_api(
                SimpleNamespace(jijia_rate_limit_utilization=0.9),
                "amazon_shop_page",
                "sync api",
            )

        sync_engine.test_api_once.assert_called_once()

    def test_real_config_only_reports_web_owned_api_when_enabled(self):
        api_configs = load_api_configs("config/api_config.example.yaml")

        self.assertEqual(enabled_web_scheduler_only_api_codes(api_configs), ())
        target = next(api for api in api_configs if api["api_code"] == "sale_return_order_page")
        target["enabled"] = True

        self.assertEqual(
            enabled_web_scheduler_only_api_codes(api_configs),
            ("sale_return_order_page",),
        )

    def test_read_only_probe_keeps_web_owned_api_available(self):
        sync_engine = Mock()
        sync_engine.probe_api.return_value = {
            "api_code": "sale_return_order_page",
            "total_count": 0,
            "page_size": 100,
            "required_pages": 0,
            "request_count": 1,
        }
        auth_client = Mock()
        auth_client.get_access_token.return_value = object()

        with (
            patch.object(main_module, "create_db_engine", return_value=object()),
            patch.object(
                main_module,
                "load_published_api_configs",
                return_value=[{"api_code": "sale_return_order_page", "enabled": False}],
            ),
            patch.object(main_module, "JijiaAuthClient", return_value=auth_client),
            patch.object(main_module, "JijiaApiClient", return_value=object()),
            patch.object(main_module, "SyncEngine", return_value=sync_engine),
        ):
            main_module._probe_single_api(
                SimpleNamespace(jijia_rate_limit_utilization=0.9),
                "sale_return_order_page",
            )

        sync_engine.probe_api.assert_called_once()


if __name__ == "__main__":
    unittest.main()
