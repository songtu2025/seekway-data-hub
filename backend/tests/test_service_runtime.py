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


def test_native_ecs_service_templates_use_bounded_api_workers_and_journal_only() -> None:
    api = (ROOT / "config" / "ecs" / "seekway-datahub-api.service.example").read_text(
        encoding="utf-8"
    )
    scheduler = (ROOT / "config" / "ecs" / "seekway-datahub-scheduler.service.example").read_text(
        encoding="utf-8"
    )
    worker = (ROOT / "config" / "ecs" / "seekway-datahub-worker@.service.example").read_text(
        encoding="utf-8"
    )

    for service in (api, scheduler, worker):
        assert "User=__SERVICE_USER__" in service
        assert "WorkingDirectory=__PROJECT_ROOT__" in service
        assert "EnvironmentFile=__ENV_FILE__" in service
        assert "StandardOutput=journal" in service
        assert "StandardError=journal" in service
        assert "Restart=on-failure" in service
        assert "backend.app.release_preflight --confirm-read-only-database" in service
        assert "Docker" not in service

    assert "--host 127.0.0.1" in api
    assert "--port 8000" in api
    assert "Environment=API_WORKERS=2" in api
    assert api.index("Environment=API_WORKERS=2") < api.index("EnvironmentFile=__ENV_FILE__")
    assert "--workers ${API_WORKERS}" in api
    assert "--reload" not in api
    assert "RuntimeDirectory=seekway-data-hub" in scheduler
    assert "/usr/bin/flock --no-fork --nonblock" in scheduler
    assert "python -m backend.app.scheduler" in scheduler
    assert "scheduler.lock" in scheduler
    assert "TimeoutStopSec=30" in scheduler
    assert "python -m backend.app.worker" in worker
    assert "Description=SEEKWAY Data Hub Worker %i" in worker
    assert "Environment=WORKER_PROCESSES=__WORKER_PROCESSES__" in worker
    assert "Environment=WORKER_NAME=%i" in worker
    assert "worker.lock" not in worker
    assert "TimeoutStopSec=3h" in worker
    assert "TimeoutStopSec=infinity" not in worker


def test_windows_worker_script_uses_worker_module() -> None:
    script = (ROOT / "scripts" / "dev-worker.ps1").read_text(encoding="utf-8")

    assert '".\\.venv\\Scripts\\python.exe" -m backend.app.worker' in script


def test_windows_scheduler_script_uses_scheduler_module() -> None:
    script = (ROOT / "scripts" / "dev-scheduler.ps1").read_text(encoding="utf-8")

    assert '".\\.venv\\Scripts\\python.exe" -m backend.app.scheduler' in script
