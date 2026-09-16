import logging
from collections.abc import Generator
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from backend.app import main as main_module
from backend.app.core.config import get_web_settings
from backend.app.core.database import get_db
from backend.app.core.product import PRODUCT_NAME
from backend.app.main import create_app
from backend.tests.conftest import AuthHarness


def test_app_metadata_uses_product_name() -> None:
    assert create_app(validate_settings=False).title == f"{PRODUCT_NAME} API"


def test_liveness_and_readiness_are_public(harness: AuthHarness) -> None:
    live = harness.client.get("/health/live")
    ready = harness.client.get("/health/ready")

    assert live.status_code == 200
    assert live.json()["data"] == {"status": "ok"}
    assert ready.status_code == 200
    assert ready.json()["data"] == {"status": "ready"}


def test_readiness_returns_sanitized_503_when_database_is_unavailable(
    harness: AuthHarness,
) -> None:
    class FailingSession:
        def execute(self, _statement: object) -> None:
            raise SQLAlchemyError("secret-database-location")

    def failing_db() -> Generator[FailingSession, None, None]:
        yield FailingSession()

    harness.app.dependency_overrides[get_db] = failing_db

    response = harness.client.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "SERVICE_NOT_READY"
    assert response.json()["error"]["message"] == "服务暂未就绪"
    assert "secret-database-location" not in response.text


def test_readiness_returns_503_when_production_database_is_read_only(
    harness: AuthHarness,
) -> None:
    class ScalarResult:
        def scalar_one(self) -> int:
            return 1

    class ReadOnlySession:
        def execute(self, _statement: object) -> ScalarResult:
            return ScalarResult()

    def read_only_db() -> Generator[ReadOnlySession, None, None]:
        yield ReadOnlySession()

    harness.app.dependency_overrides[get_db] = read_only_db
    harness.app.dependency_overrides[get_web_settings] = lambda: SimpleNamespace(
        app_env="production"
    )

    response = harness.client.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "SERVICE_NOT_READY"
    assert "read only" not in response.text


def test_unhandled_error_response_and_log_are_sanitized(caplog) -> None:
    secret = "mysql://user:password@example.invalid/db?token=secret"
    app = create_app(validate_settings=False)

    @app.get("/_test/unhandled")
    def fail() -> None:
        raise RuntimeError(secret)

    with caplog.at_level(logging.ERROR, logger="backend.app.main"):
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get("/_test/unhandled")

    assert response.status_code == 500
    assert response.json()["error"] == {
        "code": "INTERNAL_SERVER_ERROR",
        "message": "服务暂时不可用",
        "details": None,
    }
    assert response.json()["requestId"]
    assert response.headers["X-Request-ID"] == response.json()["requestId"]
    assert "error_type=RuntimeError" in caplog.text
    assert secret not in response.text
    assert secret not in caplog.text


def test_api_stops_before_serving_when_startup_gate_fails(monkeypatch) -> None:
    settings = SimpleNamespace(log_level="INFO")
    startup_validation_calls: list[tuple[object, object]] = []

    def reject_startup(actual_settings: object, actual_engine: object) -> None:
        startup_validation_calls.append((actual_settings, actual_engine))
        raise RuntimeError("RUNTIME_API_CONFIG_INVALID")

    monkeypatch.setattr(main_module, "get_web_settings", lambda: settings)
    monkeypatch.setattr(main_module, "configure_service_logging", lambda _level="INFO": None)
    monkeypatch.setattr(main_module, "validate_runtime_startup", reject_startup)

    with pytest.raises(RuntimeError, match="^RUNTIME_API_CONFIG_INVALID$"):
        with TestClient(main_module.create_app()):
            pass

    assert startup_validation_calls == [(settings, main_module.engine)]
