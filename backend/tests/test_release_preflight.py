import inspect
import json
import socket
from pathlib import Path
from types import SimpleNamespace

import pytest

from backend.app import release_preflight
from backend.app.services.migration_preflight_service import PreflightResult


class FakeEngine:
    def __init__(self, *, dispose_error: Exception | None = None) -> None:
        self.disposed = False
        self.dispose_error = dispose_error

    def dispose(self) -> None:
        self.disposed = True
        if self.dispose_error is not None:
            raise self.dispose_error


def _settings(tmp_path: Path):
    api_config_path = tmp_path / "api.yaml"
    api_config_path.write_text(
        """apis:
  - api_code: sale_return_order_page
    enabled: false
    path: /operation/sale/returnOrder/page
""",
        encoding="utf-8",
    )
    app_settings = SimpleNamespace(
        app_env="production",
        api_config_path=api_config_path,
        db_host="runtime-db.example.invalid",
        db_port=3306,
        db_name="runtime_db",
        db_user="runtime_user",
        db_password="runtime_password",
        db_tls_mode="verify_identity",
        db_tls_ca_path="/run/db-certs/polardb-ca.pem",
        db_allow_unencrypted_private_network=False,
        db_pool_size=3,
        db_max_overflow=2,
        db_pool_timeout_seconds=30,
        db_connection_budget=40,
        api_workers=2,
        worker_processes=4,
        sync_lock_scope="account",
        jijia_base_url="https://open.gerpgo.com",
        jijia_app_id="your_app_id",
        jijia_app_key="your_app_key",
    )
    web_settings = SimpleNamespace(
        app_env="production",
        public_web_url="https://sync.example.invalid",
        worker_processes=4,
        sync_lock_scope="account",
    )
    return app_settings, web_settings


def _build_frontend(tmp_path: Path) -> None:
    dist = tmp_path / "frontend" / "dist"
    assets = dist / "assets"
    assets.mkdir(parents=True)
    (assets / "app.js").write_text("console.log('ready')", encoding="utf-8")
    (assets / "app.css").write_text("body {}", encoding="utf-8")
    (dist / "index.html").write_text(
        """<!doctype html>
        <script src="/assets/app.js" crossorigin type="module"></script>
        <link rel="stylesheet" href="/assets/app.css">
        """,
        encoding="utf-8",
    )


def test_release_preflight_requires_confirmation_before_loading_anything(tmp_path) -> None:
    calls: list[str] = []

    def settings_loader(name):
        calls.append(name)
        raise AssertionError("确认前不能加载配置")

    exit_code = release_preflight.main(
        [],
        project_root=tmp_path,
        app_settings_loader=lambda: settings_loader("app"),
        web_settings_loader=lambda: settings_loader("web"),
        engine_factory=lambda _settings: settings_loader("engine"),
    )

    assert exit_code == 2
    assert calls == []


def test_release_preflight_confirmation_failure_is_stable_json(tmp_path, capsys) -> None:
    exit_code = release_preflight.main([], project_root=tmp_path)

    assert exit_code == 2
    assert json.loads(capsys.readouterr().out) == {
        "status": "blocked",
        "code": "RELEASE_CONFIRMATION_REQUIRED",
    }


def test_release_preflight_has_no_migration_settings_dependency() -> None:
    assert "migration_settings_loader" not in inspect.signature(release_preflight.main).parameters
    assert not hasattr(release_preflight, "load_migration_settings")


def test_release_preflight_passes_and_disposes_runtime_engine(tmp_path, capsys) -> None:
    _build_frontend(tmp_path)
    app_settings, web_settings = _settings(tmp_path)
    engine = FakeEngine()

    exit_code = release_preflight.main(
        ["--confirm-read-only-database"],
        project_root=tmp_path,
        app_settings_loader=lambda: app_settings,
        web_settings_loader=lambda: web_settings,
        engine_factory=lambda received: engine if received is app_settings else None,
        verifier=lambda received: PreflightResult(
            status="pass" if received is engine else "blocked",
            code="RUNTIME_TARGET_READY",
        ),
        published_configs_loader=lambda received: (
            [{"api_code": "sale_return_order_page"}] if received is engine else []
        ),
    )

    assert exit_code == 0
    assert json.loads(capsys.readouterr().out) == {
        "status": "pass",
        "code": "RELEASE_PREFLIGHT_PASSED",
    }
    assert engine.disposed is True


def test_release_preflight_blocks_nonproduction_configuration(tmp_path, capsys) -> None:
    _build_frontend(tmp_path)
    app_settings, web_settings = _settings(tmp_path)
    app_settings.app_env = "local"

    exit_code = release_preflight.main(
        ["--confirm-read-only-database"],
        project_root=tmp_path,
        app_settings_loader=lambda: app_settings,
        web_settings_loader=lambda: web_settings,
        engine_factory=lambda _settings: pytest.fail("配置不合格时不能创建引擎"),
    )

    assert exit_code == 2
    assert json.loads(capsys.readouterr().out)["code"] == "RELEASE_CONFIG_INVALID"


@pytest.mark.parametrize(
    ("field_name", "value"),
    [
        ("db_tls_mode", "disabled"),
        ("db_tls_ca_path", None),
    ],
)
def test_release_preflight_requires_verified_database_tls(
    tmp_path,
    capsys,
    field_name,
    value,
) -> None:
    _build_frontend(tmp_path)
    app_settings, web_settings = _settings(tmp_path)
    setattr(app_settings, field_name, value)

    exit_code = release_preflight.main(
        ["--confirm-read-only-database"],
        project_root=tmp_path,
        app_settings_loader=lambda: app_settings,
        web_settings_loader=lambda: web_settings,
        engine_factory=lambda _settings: pytest.fail("TLS 配置不合格时不能创建引擎"),
    )

    assert exit_code == 2
    assert json.loads(capsys.readouterr().out)["code"] == "RELEASE_CONFIG_INVALID"


def test_release_preflight_allows_explicit_private_network_exception(
    tmp_path,
    capsys,
    monkeypatch,
) -> None:
    _build_frontend(tmp_path)
    app_settings, web_settings = _settings(tmp_path)
    app_settings.db_tls_mode = "disabled"
    app_settings.db_tls_ca_path = None
    app_settings.db_allow_unencrypted_private_network = True
    engine = FakeEngine()
    monkeypatch.setattr(
        release_preflight.socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.8", 0))],
    )

    exit_code = release_preflight.main(
        ["--confirm-read-only-database"],
        project_root=tmp_path,
        app_settings_loader=lambda: app_settings,
        web_settings_loader=lambda: web_settings,
        engine_factory=lambda _settings: engine,
        verifier=lambda _engine: PreflightResult(
            status="pass",
            code="RUNTIME_TARGET_READY",
        ),
        published_configs_loader=lambda _engine: [{"api_code": "sale_return_order_page"}],
    )

    assert exit_code == 0
    assert json.loads(capsys.readouterr().out) == {
        "status": "pass",
        "code": "RELEASE_PREFLIGHT_PASSED",
        "reasonCode": "PRIVATE_NETWORK_UNENCRYPTED_DATABASE",
    }
    assert engine.disposed is True


@pytest.mark.parametrize("resolved_ip", ["203.0.113.8", "10.0.0.8"])
def test_release_preflight_rejects_public_or_mixed_database_resolution(
    tmp_path,
    capsys,
    monkeypatch,
    resolved_ip,
) -> None:
    _build_frontend(tmp_path)
    app_settings, web_settings = _settings(tmp_path)
    app_settings.db_tls_mode = "disabled"
    app_settings.db_tls_ca_path = None
    app_settings.db_allow_unencrypted_private_network = True
    addresses = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (resolved_ip, 0))]
    if resolved_ip == "10.0.0.8":
        addresses.append((socket.AF_INET, socket.SOCK_STREAM, 6, "", ("198.51.100.9", 0)))
    monkeypatch.setattr(
        release_preflight.socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: addresses,
    )

    exit_code = release_preflight.main(
        ["--confirm-read-only-database"],
        project_root=tmp_path,
        app_settings_loader=lambda: app_settings,
        web_settings_loader=lambda: web_settings,
        engine_factory=lambda _settings: pytest.fail("公网解析结果不能创建引擎"),
    )

    assert exit_code == 2
    assert json.loads(capsys.readouterr().out)["code"] == "RELEASE_CONFIG_INVALID"


@pytest.mark.parametrize(
    ("settings_name", "field_name", "value"),
    [
        ("app", "worker_processes", 1),
        ("web", "worker_processes", 1),
        ("app", "sync_lock_scope", "global"),
        ("web", "sync_lock_scope", "global"),
    ],
)
def test_release_preflight_requires_production_concurrency_configuration(
    tmp_path,
    capsys,
    settings_name,
    field_name,
    value,
) -> None:
    _build_frontend(tmp_path)
    app_settings, web_settings = _settings(tmp_path)
    target = app_settings if settings_name == "app" else web_settings
    setattr(target, field_name, value)

    exit_code = release_preflight.main(
        ["--confirm-read-only-database"],
        project_root=tmp_path,
        app_settings_loader=lambda: app_settings,
        web_settings_loader=lambda: web_settings,
        engine_factory=lambda _settings: pytest.fail("并发配置不合格时不能创建引擎"),
    )

    assert exit_code == 2
    assert json.loads(capsys.readouterr().out) == {
        "status": "blocked",
        "code": "RELEASE_CONFIG_INVALID",
    }


@pytest.mark.parametrize("field_name", ["db_host", "db_name", "db_user", "db_password"])
def test_release_preflight_blocks_placeholder_production_credentials(
    tmp_path,
    capsys,
    field_name,
) -> None:
    _build_frontend(tmp_path)
    app_settings, web_settings = _settings(tmp_path)
    setattr(app_settings, field_name, "your_placeholder")

    exit_code = release_preflight.main(
        ["--confirm-read-only-database"],
        project_root=tmp_path,
        app_settings_loader=lambda: app_settings,
        web_settings_loader=lambda: web_settings,
        engine_factory=lambda _settings: pytest.fail("配置不合格时不能创建引擎"),
    )

    assert exit_code == 2
    assert json.loads(capsys.readouterr().out)["code"] == "RELEASE_CONFIG_INVALID"


@pytest.mark.parametrize(
    ("field_name", "value"),
    [
        ("api_workers", 0),
        ("worker_processes", 0),
        ("db_pool_size", 0),
        ("db_max_overflow", -1),
        ("db_pool_timeout_seconds", 0),
        ("db_connection_budget", 29),
    ],
)
def test_release_preflight_blocks_invalid_runtime_database_capacity(
    tmp_path,
    capsys,
    field_name,
    value,
) -> None:
    _build_frontend(tmp_path)
    app_settings, web_settings = _settings(tmp_path)
    setattr(app_settings, field_name, value)

    exit_code = release_preflight.main(
        ["--confirm-read-only-database"],
        project_root=tmp_path,
        app_settings_loader=lambda: app_settings,
        web_settings_loader=lambda: web_settings,
        engine_factory=lambda _settings: pytest.fail("容量配置不合格时不能创建引擎"),
    )

    assert exit_code == 2
    assert json.loads(capsys.readouterr().out)["code"] == "RELEASE_CONFIG_INVALID"


def test_release_preflight_blocks_missing_frontend_before_engine(tmp_path, capsys) -> None:
    app_settings, web_settings = _settings(tmp_path)

    exit_code = release_preflight.main(
        ["--confirm-read-only-database"],
        project_root=tmp_path,
        app_settings_loader=lambda: app_settings,
        web_settings_loader=lambda: web_settings,
        engine_factory=lambda _settings: pytest.fail("前端未构建时不能创建引擎"),
    )

    assert exit_code == 2
    assert json.loads(capsys.readouterr().out)["code"] == "RELEASE_FRONTEND_MISSING"


@pytest.mark.parametrize("service", ["scheduler", "worker"])
def test_background_service_preflight_does_not_require_frontend(
    tmp_path,
    capsys,
    service,
) -> None:
    app_settings, web_settings = _settings(tmp_path)
    engine = FakeEngine()

    exit_code = release_preflight.main(
        ["--confirm-read-only-database", "--service", service],
        project_root=tmp_path,
        app_settings_loader=lambda: app_settings,
        web_settings_loader=lambda: web_settings,
        engine_factory=lambda _settings: engine,
        verifier=lambda _engine: PreflightResult(
            status="pass",
            code="RUNTIME_TARGET_READY",
        ),
        published_configs_loader=lambda _engine: [{"api_code": "sale_return_order_page"}],
    )

    assert exit_code == 0
    assert json.loads(capsys.readouterr().out) == {
        "status": "pass",
        "code": "RELEASE_PREFLIGHT_PASSED",
    }
    assert engine.disposed is True


@pytest.mark.parametrize(
    "index_html",
    [
        "<!doctype html>",
        '<!doctype html><script type="module" src="/assets/missing.js"></script>',
    ],
)
def test_release_preflight_blocks_incomplete_frontend_before_engine(
    tmp_path,
    capsys,
    index_html,
) -> None:
    dist = tmp_path / "frontend" / "dist"
    dist.mkdir(parents=True)
    (dist / "index.html").write_text(index_html, encoding="utf-8")
    app_settings, web_settings = _settings(tmp_path)

    exit_code = release_preflight.main(
        ["--confirm-read-only-database"],
        project_root=tmp_path,
        app_settings_loader=lambda: app_settings,
        web_settings_loader=lambda: web_settings,
        engine_factory=lambda _settings: pytest.fail("前端产物不完整时不能创建引擎"),
    )

    assert exit_code == 2
    assert json.loads(capsys.readouterr().out)["code"] == "RELEASE_FRONTEND_MISSING"


@pytest.mark.parametrize(
    ("entry_tag", "entry_name", "entry_content"),
    [
        ('<link href="/assets/not-entry.js">', "not-entry.js", "export {}"),
        ('<img src="/assets/not-entry.js">', "not-entry.js", "export {}"),
        (
            '<script src="/assets/empty.js" type="module"></script>',
            "empty.js",
            "",
        ),
    ],
)
def test_release_preflight_rejects_fake_or_empty_javascript_entry(
    tmp_path,
    capsys,
    entry_tag,
    entry_name,
    entry_content,
) -> None:
    dist = tmp_path / "frontend" / "dist"
    assets = dist / "assets"
    assets.mkdir(parents=True)
    (assets / entry_name).write_text(entry_content, encoding="utf-8")
    (dist / "index.html").write_text(entry_tag, encoding="utf-8")
    app_settings, web_settings = _settings(tmp_path)

    exit_code = release_preflight.main(
        ["--confirm-read-only-database"],
        project_root=tmp_path,
        app_settings_loader=lambda: app_settings,
        web_settings_loader=lambda: web_settings,
        engine_factory=lambda _settings: pytest.fail("前端入口无效时不能创建引擎"),
    )

    assert exit_code == 2
    assert json.loads(capsys.readouterr().out)["code"] == "RELEASE_FRONTEND_MISSING"


def test_release_preflight_blocks_invalid_api_yaml_before_engine(tmp_path, capsys) -> None:
    _build_frontend(tmp_path)
    app_settings, web_settings = _settings(tmp_path)
    app_settings.api_config_path.write_text("apis: not-a-list\n", encoding="utf-8")

    exit_code = release_preflight.main(
        ["--confirm-read-only-database"],
        project_root=tmp_path,
        app_settings_loader=lambda: app_settings,
        web_settings_loader=lambda: web_settings,
        engine_factory=lambda _settings: pytest.fail("API YAML 无效时不能创建引擎"),
    )

    assert exit_code == 2
    assert json.loads(capsys.readouterr().out)["code"] == "RELEASE_API_CONFIG_INVALID"


def test_release_preflight_blocks_scheduler_ownership_conflict_before_engine(
    tmp_path,
    capsys,
) -> None:
    _build_frontend(tmp_path)
    app_settings, web_settings = _settings(tmp_path)
    app_settings.api_config_path.write_text(
        """apis:
  - api_code: sale_return_order_page
    enabled: true
    path: /operation/sale/returnOrder/page
    rate_limit:
      max_requests: 5
      period_seconds: 1
""",
        encoding="utf-8",
    )

    exit_code = release_preflight.main(
        ["--confirm-read-only-database"],
        project_root=tmp_path,
        app_settings_loader=lambda: app_settings,
        web_settings_loader=lambda: web_settings,
        engine_factory=lambda _settings: pytest.fail("调度所有者冲突时不能创建引擎"),
    )

    assert exit_code == 2
    assert json.loads(capsys.readouterr().out) == {
        "status": "blocked",
        "code": "RELEASE_SCHEDULER_OWNERSHIP_CONFLICT",
    }


def test_release_preflight_propagates_runtime_target_block_without_secret(
    tmp_path,
    capsys,
) -> None:
    _build_frontend(tmp_path)
    app_settings, web_settings = _settings(tmp_path)
    engine = FakeEngine()

    exit_code = release_preflight.main(
        ["--confirm-read-only-database"],
        project_root=tmp_path,
        app_settings_loader=lambda: app_settings,
        web_settings_loader=lambda: web_settings,
        engine_factory=lambda _settings: engine,
        verifier=lambda _engine: PreflightResult(
            status="blocked",
            code="RUNTIME_CORE_SCHEMA_MISMATCH",
        ),
    )

    payload = json.loads(capsys.readouterr().out)
    assert exit_code == 2
    assert payload == {
        "status": "blocked",
        "code": "RELEASE_RUNTIME_TARGET_BLOCKED",
        "reasonCode": "RUNTIME_CORE_SCHEMA_MISMATCH",
    }
    assert engine.disposed is True


@pytest.mark.parametrize("service", ["api", "scheduler", "worker"])
def test_release_preflight_blocks_empty_published_api_configs(
    tmp_path,
    capsys,
    service,
) -> None:
    _build_frontend(tmp_path)
    app_settings, web_settings = _settings(tmp_path)
    engine = FakeEngine()

    exit_code = release_preflight.main(
        ["--confirm-read-only-database", "--service", service],
        project_root=tmp_path,
        app_settings_loader=lambda: app_settings,
        web_settings_loader=lambda: web_settings,
        engine_factory=lambda _settings: engine,
        verifier=lambda _engine: PreflightResult(
            status="pass",
            code="RUNTIME_TARGET_READY",
        ),
        published_configs_loader=lambda _engine: [],
    )

    assert exit_code == 2
    assert json.loads(capsys.readouterr().out) == {
        "status": "blocked",
        "code": "RELEASE_PUBLISHED_API_CONFIG_INVALID",
    }
    assert engine.disposed is True


def test_release_preflight_redacts_runtime_error(tmp_path, capsys) -> None:
    _build_frontend(tmp_path)
    app_settings, web_settings = _settings(tmp_path)
    engine = FakeEngine()
    secret = "mysql://user:password@database/private"

    exit_code = release_preflight.main(
        ["--confirm-read-only-database"],
        project_root=tmp_path,
        app_settings_loader=lambda: app_settings,
        web_settings_loader=lambda: web_settings,
        engine_factory=lambda _settings: engine,
        verifier=lambda _engine: (_ for _ in ()).throw(RuntimeError(secret)),
    )

    output = capsys.readouterr().out
    assert exit_code == 1
    assert json.loads(output)["code"] == "RELEASE_PREFLIGHT_RUNTIME_ERROR"
    assert "password" not in output
    assert "mysql://" not in output


def test_release_preflight_dispose_failure_cannot_report_success(tmp_path, capsys) -> None:
    _build_frontend(tmp_path)
    app_settings, web_settings = _settings(tmp_path)
    engine = FakeEngine(dispose_error=RuntimeError("mysql://user:password@database/private"))

    exit_code = release_preflight.main(
        ["--confirm-read-only-database"],
        project_root=tmp_path,
        app_settings_loader=lambda: app_settings,
        web_settings_loader=lambda: web_settings,
        engine_factory=lambda _settings: engine,
        verifier=lambda _engine: PreflightResult(
            status="pass",
            code="RUNTIME_TARGET_READY",
        ),
        published_configs_loader=lambda _engine: [{"api_code": "sale_return_order_page"}],
    )

    output = capsys.readouterr().out
    assert exit_code == 1
    assert json.loads(output) == {
        "status": "error",
        "code": "RELEASE_PREFLIGHT_DISPOSE_FAILED",
    }
    assert "password" not in output
