import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pydantic import ValidationError
from sqlalchemy.engine import URL

from app.config import (
    RUNTIME_SCHEDULER_PROCESS_COUNT,
    AppSettings,
    MigrationDatabaseSettings,
    load_api_configs,
    load_migration_settings,
)
from app.sync_engine import SyncEngine


class ConfigValidationTest(unittest.TestCase):
    def test_migration_credentials_have_dedicated_ignored_example(self):
        root = Path(__file__).resolve().parents[1]
        runtime_example = (root / ".env.example").read_text(encoding="utf-8")
        migration_example = (root / ".env.migration.example").read_text(encoding="utf-8")
        gitignore = (root / ".gitignore").read_text(encoding="utf-8").splitlines()

        self.assertNotIn("MIGRATION_DB_HOST", runtime_example)
        for field_name in (
            "MIGRATION_DB_HOST",
            "MIGRATION_DB_PORT",
            "MIGRATION_DB_NAME",
            "MIGRATION_DB_USER",
            "MIGRATION_DB_PASSWORD",
        ):
            self.assertIn(f"{field_name}=", migration_example)
        self.assertIn(".env.migration", gitignore)

    def test_database_url_preserves_reserved_password_characters(self):
        settings = AppSettings(
            db_host="db.example.invalid",
            db_port=3307,
            db_name="sync_db",
            db_user="sync_user",
            db_password="p@ss: /?#[]",
            _env_file=None,
        )

        database_url = settings.database_url

        self.assertIsInstance(database_url, URL)
        self.assertEqual(database_url.username, "sync_user")
        self.assertEqual(database_url.password, "p@ss: /?#[]")
        self.assertEqual(database_url.host, "db.example.invalid")
        self.assertEqual(database_url.port, 3307)
        self.assertEqual(database_url.database, "sync_db")
        self.assertEqual(database_url.query, {"charset": "utf8mb4"})

    def test_runtime_database_pool_defaults_fit_connection_budget(self):
        settings = AppSettings(_env_file=None)

        self.assertEqual(settings.api_workers, 2)
        self.assertEqual(settings.worker_processes, 1)
        self.assertEqual(settings.db_pool_size, 5)
        self.assertEqual(settings.db_max_overflow, 5)
        self.assertEqual(settings.db_pool_timeout_seconds, 30)
        self.assertEqual(settings.db_connection_budget, 40)
        self.assertEqual(RUNTIME_SCHEDULER_PROCESS_COUNT, 1)
        self.assertEqual(settings.sync_lock_scope, "global")

    def test_runtime_rejects_invalid_sync_lock_scope(self):
        with self.assertRaises(ValidationError):
            AppSettings(_env_file=None, sync_lock_scope="api")

    def test_runtime_database_pool_counts_every_worker_process(self):
        with self.assertRaises(ValidationError):
            AppSettings(
                _env_file=None,
                api_workers=2,
                worker_processes=2,
                db_pool_size=5,
                db_max_overflow=5,
                db_connection_budget=40,
            )

    def test_runtime_database_pool_rejects_capacity_over_budget(self):
        with self.assertRaises(ValidationError):
            AppSettings(
                _env_file=None,
                api_workers=3,
                db_pool_size=5,
                db_max_overflow=5,
                db_connection_budget=30,
            )

    def test_local_migration_database_settings_fall_back_to_runtime_database(self):
        settings = MigrationDatabaseSettings(
            _env_file=None,
            app_env="local",
            fallback_db_host="runtime-db.example.invalid",
            fallback_db_port=3307,
            fallback_db_name="runtime_db",
            fallback_db_user="runtime_user",
            fallback_db_password="runtime_password",
            migration_db_host=None,
            migration_db_port=None,
            migration_db_name=None,
            migration_db_user=None,
            migration_db_password=None,
        )

        database_url = settings.database_url

        self.assertEqual(database_url.host, "runtime-db.example.invalid")
        self.assertEqual(database_url.port, 3307)
        self.assertEqual(database_url.database, "runtime_db")
        self.assertEqual(database_url.username, "runtime_user")
        self.assertEqual(database_url.password, "runtime_password")

    def test_production_migration_database_rejects_runtime_fallback(self):
        with self.assertRaises(ValueError):
            MigrationDatabaseSettings(
                _env_file=None,
                app_env="production",
                fallback_db_host="runtime-db.example.invalid",
                fallback_db_port=3306,
                fallback_db_name="runtime_db",
                fallback_db_user="runtime_user",
                fallback_db_password="runtime_password",
                migration_db_host=None,
                migration_db_port=None,
                migration_db_name=None,
                migration_db_user=None,
                migration_db_password=None,
            )

    def test_production_migration_database_requires_every_explicit_field(self):
        values = {
            "migration_db_host": "migration-db.example.invalid",
            "migration_db_port": 3306,
            "migration_db_name": "migration_db",
            "migration_db_user": "migration_user",
            "migration_db_password": "migration_password",
        }

        for field_name in values:
            with self.subTest(field=field_name), self.assertRaises(ValueError):
                MigrationDatabaseSettings(
                    _env_file=None,
                    app_env="production",
                    **(values | {field_name: None}),
                )

    def test_production_migration_database_uses_explicit_credentials(self):
        settings = MigrationDatabaseSettings(
            _env_file=None,
            app_env="production",
            migration_db_host="migration-db.example.invalid",
            migration_db_port=3308,
            migration_db_name="migration_db",
            migration_db_user="migration_user",
            migration_db_password="migration_password",
            db_tls_mode="verify_identity",
            db_tls_ca_path="/run/db-certs/polardb-ca.pem",
        )

        database_url = settings.database_url

        self.assertEqual(database_url.host, "migration-db.example.invalid")
        self.assertEqual(database_url.port, 3308)
        self.assertEqual(database_url.database, "migration_db")
        self.assertEqual(database_url.username, "migration_user")
        self.assertEqual(database_url.password, "migration_password")

    def test_migration_settings_use_only_dedicated_env_file(self):
        runtime_settings = AppSettings(
            _env_file=None,
            app_env="production",
            db_host="runtime-db.example.invalid",
            db_port=3306,
            db_name="runtime_db",
            db_user="runtime_user",
            db_password="runtime_password",
            db_tls_mode="verify_identity",
            db_tls_ca_path="/run/db-certs/polardb-ca.pem",
        )
        migration_values = """\
MIGRATION_DB_HOST=migration-db.example.invalid
MIGRATION_DB_PORT=3308
MIGRATION_DB_NAME=migration_db
MIGRATION_DB_USER=migration_user
MIGRATION_DB_PASSWORD=migration_password
"""

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            (temp_path / ".env").write_text(migration_values, encoding="utf-8")
            original_cwd = Path.cwd()
            try:
                os.chdir(temp_path)
                with (
                    patch("app.config.load_settings", return_value=runtime_settings),
                    patch.dict(os.environ, {}, clear=True),
                    self.assertRaises(ValueError),
                ):
                    load_migration_settings()

                (temp_path / ".env.migration").write_text(
                    migration_values,
                    encoding="utf-8",
                )
                with (
                    patch("app.config.load_settings", return_value=runtime_settings),
                    patch.dict(os.environ, {}, clear=True),
                ):
                    settings = load_migration_settings()
            finally:
                os.chdir(original_cwd)

        self.assertEqual(settings.database_url.host, "migration-db.example.invalid")
        self.assertEqual(settings.database_url.port, 3308)
        self.assertEqual(settings.db_tls_mode, "verify_identity")
        self.assertEqual(
            settings.db_tls_ca_path,
            Path("/run/db-certs/polardb-ca.pem"),
        )

    def test_production_runtime_requires_verified_database_tls(self):
        with self.assertRaises(ValueError):
            AppSettings(_env_file=None, app_env="production")

        with self.assertRaises(ValueError):
            AppSettings(
                _env_file=None,
                app_env="production",
                db_tls_mode="verify_identity",
            )

        with self.assertRaises(ValueError):
            AppSettings(
                _env_file=None,
                app_env="production",
                db_tls_mode="verify_identity",
                db_tls_ca_path="",
            )

        settings = AppSettings(
            _env_file=None,
            app_env="production",
            db_tls_mode="verify_identity",
            db_tls_ca_path="/run/db-certs/polardb-ca.pem",
        )

        self.assertEqual(settings.db_tls_mode, "verify_identity")

    def test_production_runtime_allows_explicit_private_network_exception(self):
        settings = AppSettings(
            _env_file=None,
            app_env="production",
            db_tls_mode="disabled",
            db_allow_unencrypted_private_network=True,
        )

        self.assertTrue(settings.db_allow_unencrypted_private_network)

    def test_production_migration_still_requires_verified_database_tls(self):
        with self.assertRaises(ValueError):
            MigrationDatabaseSettings(
                _env_file=None,
                app_env="production",
                db_tls_mode="disabled",
            )

    def test_local_migration_loader_uses_runtime_database_fallback(self):
        runtime_settings = AppSettings(
            _env_file=None,
            app_env="local",
            db_host="runtime-db.example.invalid",
            db_port=3307,
            db_name="runtime_db",
            db_user="runtime_user",
            db_password="runtime_password",
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            original_cwd = Path.cwd()
            try:
                os.chdir(temp_dir)
                with (
                    patch("app.config.load_settings", return_value=runtime_settings),
                    patch.dict(os.environ, {}, clear=True),
                ):
                    settings = load_migration_settings()
            finally:
                os.chdir(original_cwd)

        self.assertEqual(settings.database_url.host, "runtime-db.example.invalid")
        self.assertEqual(settings.database_url.port, 3307)

    def test_api_config_rejects_missing_or_non_boolean_enabled(self):
        invalid_configs = {
            "missing enabled": """
apis:
  - api_code: first_api
    path: /first
""",
            "string enabled": """
apis:
  - api_code: first_api
    path: /first
    enabled: "false"
""",
        }

        for case_name, content in invalid_configs.items():
            with self.subTest(case=case_name):
                with self.assertRaises(ValueError):
                    self._load_yaml(content)

    def test_api_config_rejects_duplicate_api_code(self):
        with self.assertRaises(ValueError):
            self._load_yaml(
                """
apis:
  - api_code: duplicate_api
    path: /shared
    enabled: true
  - api_code: duplicate_api
    path: /shared
    enabled: false
"""
            )

    def test_api_config_rejects_missing_identity_or_path(self):
        invalid_configs = {
            "missing api_code": """
apis:
  - path: /first
    enabled: true
""",
            "missing path": """
apis:
  - api_code: first_api
    enabled: true
""",
        }

        for case_name, content in invalid_configs.items():
            with self.subTest(case=case_name):
                with self.assertRaises(ValueError):
                    self._load_yaml(content)

    def test_shared_path_is_valid_when_api_codes_are_unique(self):
        apis = self._load_yaml(
            """
apis:
  - api_code: first_api
    path: /shared
    enabled: true
    rate_limit:
      max_requests: 2
      period_seconds: 1
  - api_code: second_api
    path: /shared
    enabled: false
    rate_limit:
      max_requests: 2
      period_seconds: 1
"""
        )

        self.assertEqual(
            [api["api_code"] for api in apis],
            ["first_api", "second_api"],
        )

    def test_shared_path_rejects_conflicting_rate_limits(self):
        with self.assertRaisesRegex(ValueError, "must use one rate limit"):
            self._load_yaml(
                """
apis:
  - api_code: first_api
    path: /shared
    enabled: true
    rate_limit:
      max_requests: 2
      period_seconds: 1
  - api_code: second_api
    path: /shared
    enabled: false
    rate_limit:
      max_requests: 1
      period_seconds: 1
"""
            )

    def test_enabled_apis_accepts_only_explicit_true(self):
        engine = SyncEngine(
            [
                {"api_code": "enabled_api", "enabled": True},
                {"api_code": "disabled_api", "enabled": False},
                {"api_code": "missing_enabled"},
                {"api_code": "string_enabled", "enabled": "true"},
            ]
        )

        self.assertEqual(
            engine._enabled_apis(),
            [{"api_code": "enabled_api", "enabled": True}],
        )

    @staticmethod
    def _load_yaml(content):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "api.yaml"
            config_path.write_text(content, encoding="utf-8")
            return load_api_configs(config_path)


if __name__ == "__main__":
    unittest.main()
