import base64
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import URL

from backend.app.services.migration_preflight_service import PreflightResult
from scripts import dev_local_system, local_test_runtime


class FakeMigrationConnection:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, str] | None]] = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def execution_options(self, **_kwargs):
        return self

    def execute(self, statement, params=None) -> None:
        self.calls.append((str(statement), params))


class FakeEngine:
    def __init__(self, url: URL, connection=None) -> None:
        self.url = url
        self.connection = connection
        self.disposed = False

    def connect(self):
        if self.connection is None:
            raise AssertionError("没有配置测试连接")
        return self.connection

    def dispose(self) -> None:
        self.disposed = True


def migration_settings() -> SimpleNamespace:
    return SimpleNamespace(
        database_url=URL.create(
            "mysql+pymysql",
            username="root",
            password="fictional-root-password",
            host="127.0.0.1",
            port=3306,
            database=local_test_runtime.EXPECTED_DATABASE,
        )
    )


def test_setup_creates_least_privilege_runtime_config(tmp_path: Path) -> None:
    migration_connection = FakeMigrationConnection()
    migration_engine = FakeEngine(migration_settings().database_url, migration_connection)
    runtime_engines: list[FakeEngine] = []

    def runtime_engine_factory(url: URL) -> FakeEngine:
        engine = FakeEngine(url)
        runtime_engines.append(engine)
        return engine

    result = local_test_runtime.setup_local_test(
        project_root=tmp_path,
        settings_loader=migration_settings,
        migration_engine_factory=lambda _url: migration_engine,
        runtime_engine_factory=runtime_engine_factory,
        verifier=lambda _engine: PreflightResult("pass", "RUNTIME_TARGET_READY"),
        password_factory=lambda _length: "fictional-runtime-password",
        key_factory=lambda: base64.urlsafe_b64encode(b"0" * 32),
    )

    assert result.code == "LOCAL_RUNTIME_CONFIG_CREATED"
    assert migration_engine.disposed is True
    assert runtime_engines[0].disposed is True
    statements = [statement for statement, _params in migration_connection.calls]
    assert any(statement.startswith("CREATE USER") for statement in statements)
    grant = next(statement for statement in statements if statement.startswith("GRANT"))
    assert "SELECT, INSERT, UPDATE, DELETE" in grant
    assert all(privilege not in grant for privilege in ("CREATE", "ALTER", "DROP"))
    env_text = (tmp_path / ".env.localtest").read_text(encoding="utf-8")
    assert "DB_HOST=127.0.0.1" in env_text
    assert f"DB_NAME={local_test_runtime.EXPECTED_DATABASE}" in env_text
    assert f"DB_USER={local_test_runtime.RUNTIME_USER}" in env_text
    assert "DB_POOL_SIZE=3" in env_text
    assert "DB_MAX_OVERFLOW=2" in env_text
    assert "SYNC_LOCK_SCOPE=account" in env_text
    assert "SESSION_COOKIE_NAME=jijia_local_session" in env_text
    for key, value in local_test_runtime.EXPECTED_JIJIA_TARGET.items():
        assert f"{key}={value}\n" in env_text


def test_setup_refuses_to_overwrite_existing_env(tmp_path: Path) -> None:
    (tmp_path / ".env.localtest").write_text("existing", encoding="utf-8")

    result = local_test_runtime.setup_local_test(
        project_root=tmp_path,
        settings_loader=lambda: (_ for _ in ()).throw(AssertionError()),
    )

    assert result.code == "LOCAL_ENV_ALREADY_EXISTS"


def test_check_rejects_non_local_target_without_connecting(tmp_path: Path) -> None:
    (tmp_path / ".env.localtest").write_text("placeholder", encoding="utf-8")
    values: dict[str, str | None] = {
        "DB_HOST": "remote.invalid",
        "DB_PORT": "3306",
        "DB_NAME": local_test_runtime.EXPECTED_DATABASE,
        "DB_USER": local_test_runtime.RUNTIME_USER,
        "DB_PASSWORD": "fictional-runtime-password",
        "CREDENTIAL_ENCRYPTION_KEY": base64.urlsafe_b64encode(b"0" * 32).decode("ascii"),
    }

    result = local_test_runtime.check_local_test(
        project_root=tmp_path,
        values_loader=lambda _path: values,
        engine_factory=lambda _url: (_ for _ in ()).throw(AssertionError()),
    )

    assert result.code == "LOCAL_TARGET_MISMATCH"


def test_check_preserves_runtime_schema_warning_details(tmp_path: Path) -> None:
    (tmp_path / ".env.localtest").write_text("placeholder", encoding="utf-8")
    values: dict[str, str | None] = {
        "DB_HOST": "127.0.0.1",
        "DB_PORT": "3306",
        "DB_NAME": local_test_runtime.EXPECTED_DATABASE,
        "DB_USER": local_test_runtime.RUNTIME_USER,
        "DB_PASSWORD": "fictional-runtime-password",
        "CREDENTIAL_ENCRYPTION_KEY": base64.urlsafe_b64encode(b"0" * 32).decode("ascii"),
        **local_test_runtime.EXPECTED_JIJIA_TARGET,
    }

    result = local_test_runtime.check_local_test(
        project_root=tmp_path,
        values_loader=lambda _path: values,
        engine_factory=lambda url: FakeEngine(url),
        verifier=lambda _engine: PreflightResult(
            "pass",
            "RUNTIME_TARGET_READY",
            {"unexpectedNonUniqueIndexCount": 1},
        ),
    )

    assert result.status == "pass"
    assert result.code == "LOCAL_RUNTIME_READY"
    assert result.payload()["details"] == {"unexpectedNonUniqueIndexCount": 1}


def test_ensure_jijia_target_only_appends_missing_fixed_fields(tmp_path: Path) -> None:
    env_path = tmp_path / ".env.localtest"
    original = "DB_PASSWORD=fictional-runtime-password\n"
    env_path.write_text(original, encoding="utf-8")

    result = local_test_runtime.ensure_local_jijia_target(project_root=tmp_path)

    assert result.code == "LOCAL_JIJIA_TARGET_PINNED"
    env_text = env_path.read_text(encoding="utf-8")
    assert env_text.startswith(original)
    for key, value in local_test_runtime.EXPECTED_JIJIA_TARGET.items():
        assert env_text.count(f"{key}={value}\n") == 1


def test_ensure_jijia_target_rejects_existing_mismatch(tmp_path: Path) -> None:
    env_path = tmp_path / ".env.localtest"
    original = "JIJIA_BASE_URL=https://example.invalid\n"
    env_path.write_text(original, encoding="utf-8")

    result = local_test_runtime.ensure_local_jijia_target(project_root=tmp_path)

    assert result.code == "LOCAL_JIJIA_TARGET_MISMATCH"
    assert env_path.read_text(encoding="utf-8") == original


def test_check_rejects_unpinned_jijia_target_without_connecting(tmp_path: Path) -> None:
    (tmp_path / ".env.localtest").write_text("placeholder", encoding="utf-8")
    values: dict[str, str | None] = {
        "DB_HOST": "127.0.0.1",
        "DB_PORT": "3306",
        "DB_NAME": local_test_runtime.EXPECTED_DATABASE,
        "DB_USER": local_test_runtime.RUNTIME_USER,
        "DB_PASSWORD": "fictional-runtime-password",
        "CREDENTIAL_ENCRYPTION_KEY": base64.urlsafe_b64encode(b"0" * 32).decode("ascii"),
        **local_test_runtime.EXPECTED_JIJIA_TARGET,
        "JIJIA_BASE_URL": "https://example.invalid",
    }

    result = local_test_runtime.check_local_test(
        project_root=tmp_path,
        values_loader=lambda _path: values,
        engine_factory=lambda _url: (_ for _ in ()).throw(AssertionError()),
    )

    assert result.code == "LOCAL_JIJIA_TARGET_MISMATCH"


def test_local_worker_processes_at_most_one_queued_job() -> None:
    class FakeWorker:
        def __init__(self) -> None:
            self.run_calls = 0

        def run_once(self) -> int:
            self.run_calls += 1
            return 7

    class FakeWorkerEntry:
        def __init__(self) -> None:
            self.engine = FakeEngine(URL.create("sqlite"))
            self.worker = FakeWorker()
            self.startup_calls = 0

        @staticmethod
        def get_web_settings() -> SimpleNamespace:
            return SimpleNamespace(log_level="INFO")

        @staticmethod
        def configure_service_logging(_log_level: str) -> None:
            return None

        def validate_runtime_startup(self, _settings, _engine) -> None:
            self.startup_calls += 1

        def build_worker(self) -> FakeWorker:
            return self.worker

    worker_entry = FakeWorkerEntry()

    result = local_test_runtime.run_local_worker_once(worker_entry=worker_entry)

    assert result.code == "LOCAL_WORKER_RAN_ONCE"
    assert worker_entry.worker.run_calls == 1
    assert worker_entry.startup_calls == 1
    assert worker_entry.engine.disposed is True


def test_local_scripts_keep_api_and_web_on_isolated_ports() -> None:
    root = local_test_runtime.PROJECT_ROOT
    setup_script = (root / "scripts" / "setup-local-test.ps1").read_text(encoding="utf-8")
    api_script = (root / "scripts" / "dev-local-api.ps1").read_text(encoding="utf-8")
    web_script = (root / "scripts" / "dev-local-web.ps1").read_text(encoding="utf-8")
    lan_script = (root / "scripts" / "dev-lan.ps1").read_text(encoding="utf-8")
    worker_script = (root / "scripts" / "dev-local-worker.ps1").read_text(encoding="utf-8")
    scheduler_script = (root / "scripts" / "dev-local-scheduler.ps1").read_text(encoding="utf-8")
    worker_once_script = (root / "scripts" / "dev-local-worker-once.ps1").read_text(
        encoding="utf-8"
    )
    system_script = (root / "scripts" / "dev-local.ps1").read_text(encoding="utf-8")

    assert "--confirm-local-isolated" in setup_script
    assert "-m scripts.local_test_runtime check" in api_script
    assert "-f .env.localtest run" in api_script
    assert "--port 8004" in api_script
    assert "backend.app.worker" not in api_script
    assert "http://127.0.0.1:8004" in web_script
    assert "DEV_WEB_HOST" in web_script
    assert "--port 5183 --strictPort" in web_script
    assert "HardwareInterface" in lan_script
    assert "LAN_PUBLIC_WEB_URL" in lan_script
    assert '"dev-local.ps1"' in lan_script
    assert "ensure-jijia-target" in worker_script
    assert "-m scripts.local_test_runtime check" in worker_script
    assert "-f .env.localtest run --override" in worker_script
    assert "-m backend.app.worker" in worker_script
    assert "ensure-jijia-target" in scheduler_script
    assert "-m scripts.local_test_runtime check" in scheduler_script
    assert "-f .env.localtest run --override" in scheduler_script
    assert "-m backend.app.scheduler" in scheduler_script
    assert "-m scripts.local_test_runtime worker-once" in worker_once_script
    assert "-m scripts.dev_local_system" in system_script
    assert "$env:DB_POOL_SIZE = 3" in system_script
    assert "$env:DB_MAX_OVERFLOW = 2" in system_script
    assert '$env:SYNC_LOCK_SCOPE = "account"' in system_script

    supervisor = (root / "scripts" / "dev_local_system.py").read_text(encoding="utf-8")
    assert 'os.getenv("WORKER_PROCESSES", "1")' in supervisor

    cold_start_canary = (root / "scripts" / "worker-cold-start-canary.ps1").read_text(
        encoding="utf-8"
    )
    assert "scripts.local_test_runtime check" in cold_start_canary
    assert "LOCAL_QUEUE_NOT_EMPTY" in cold_start_canary
    assert "CANARY_RUNTIME_CLEANUP_FAILED" in cold_start_canary
    assert "canary-worker-%" in cold_start_canary
    assert 'WORKER_PROCESSES = "4"' in cold_start_canary
    assert 'SYNC_LOCK_SCOPE = "account"' in cold_start_canary
    assert '[ValidateSet("canary", "burst")]' in cold_start_canary
    assert "backend.app.scheduler" not in cold_start_canary
    assert '"dev-local-scheduler.ps1"' in supervisor
    assert '"-WorkerName", f"local-worker-{index}"' in supervisor


def test_local_supervisor_builds_one_named_process_per_worker(monkeypatch) -> None:
    monkeypatch.setenv("WORKER_PROCESSES", "2")

    specs = dev_local_system._process_specs()

    assert [name for name, _script, _arguments in specs] == [
        "API",
        "Scheduler",
        "Worker 1",
        "Worker 2",
        "Web",
    ]
    assert specs[2][2] == ("-WorkerName", "local-worker-1")
    assert specs[3][2] == ("-WorkerName", "local-worker-2")
