import logging
from io import StringIO
from pathlib import Path

from backend.app.core.service_logging import configure_service_logging

ROOT = Path(__file__).resolve().parents[2]


def test_service_logging_emits_application_info_without_exception_text() -> None:
    stream = StringIO()
    project_loggers = [logging.getLogger(name) for name in ("backend", "app")]
    original_state = [
        (list(project_logger.handlers), project_logger.level, project_logger.propagate)
        for project_logger in project_loggers
    ]
    try:
        configure_service_logging("INFO", stream=stream)

        logging.getLogger("backend.runtime").info("backend-ready")
        logging.getLogger("app.runtime").info("core-ready")
        try:
            raise RuntimeError("secret-dsn-and-token")
        except RuntimeError:
            logging.getLogger("backend.runtime").error(
                "runtime-failed error_type=RuntimeError",
                exc_info=True,
            )

        output = stream.getvalue()
        assert "backend-ready" in output
        assert "core-ready" in output
        assert "runtime-failed error_type=RuntimeError" in output
        assert "secret-dsn-and-token" not in output
        assert "Traceback" not in output
    finally:
        for project_logger, state in zip(project_loggers, original_state, strict=True):
            handlers, level, propagate = state
            project_logger.handlers = handlers
            project_logger.setLevel(level)
            project_logger.propagate = propagate


def test_docker_runtime_uses_non_root_user_and_bounded_api_workers() -> None:
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    compose = (ROOT / "compose.yaml").read_text(encoding="utf-8")

    assert "FROM python:3.11.12-slim-bookworm AS app-runtime" in dockerfile
    assert "USER seekway-datahub" in dockerfile
    assert "COPY . " not in dockerfile
    assert '--workers "$${API_WORKERS:-2}"' in compose
    assert '"127.0.0.1:${SEEKWAY_API_PORT:-8000}:8000"' in compose
    assert "stop_grace_period: 3h" in compose
    assert "read_only: true" in compose
    assert "no-new-privileges:true" in compose
