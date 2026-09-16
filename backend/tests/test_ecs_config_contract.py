import json
from pathlib import Path

import yaml

PROJECT_ROOT = Path(__file__).resolve().parents[2]
NGINX_CONFIG = PROJECT_ROOT / "config" / "ecs" / "nginx.conf.example"
FRONTEND_NGINX_CONFIG = PROJECT_ROOT / "config" / "docker" / "frontend-nginx.conf"
COMPOSE_CONFIG = PROJECT_ROOT / "compose.yaml"
DOCKERFILE = PROJECT_ROOT / "Dockerfile"
README = PROJECT_ROOT / "README.md"


def test_nginx_config_keeps_api_out_of_spa_fallback() -> None:
    text = NGINX_CONFIG.read_text(encoding="utf-8")

    for placeholder in (
        "__PUBLIC_HOST__",
        "__TLS_CERTIFICATE_PATH__",
        "__TLS_CERTIFICATE_KEY_PATH__",
    ):
        assert placeholder in text

    assert "upstream seekway_datahub_frontend" in text
    assert "server 127.0.0.1:8080;" in text
    assert "__PROJECT_ROOT__" not in text
    assert "__FRONTEND_DIST_ROOT__" not in text

    login_location = text.index("location = /api/v1/auth/login")
    reset_location = text.index("location = /api/v1/auth/password-reset/request")
    api_location = text.index("location ^~ /api/")
    health_location = text.index("location ^~ /health/")
    fallback_location = text.index("location / {")
    assert login_location < reset_location < api_location < fallback_location
    assert health_location < fallback_location
    assert text.count("limit_req zone=login_per_ip") == 2
    assert text.count("proxy_pass http://seekway_datahub_api;") == 4
    assert text.count("proxy_pass http://seekway_datahub_frontend;") == 1
    assert 'default "no-store";' in text
    assert '"public, max-age=31536000, immutable"' in text
    assert "Strict-Transport-Security" in text
    assert "Content-Security-Policy" in text

    frontend_text = FRONTEND_NGINX_CONFIG.read_text(encoding="utf-8")
    assert "listen 8080;" in frontend_text
    assert "try_files $uri $uri/ /index.html;" in frontend_text
    assert 'add_header Cache-Control "no-store" always;' in frontend_text
    assert 'add_header Cache-Control "public, max-age=31536000, immutable" always;' in (
        frontend_text
    )


def test_frontend_build_uses_pinned_node_contract_and_clean_install() -> None:
    package = json.loads((PROJECT_ROOT / "frontend" / "package.json").read_text("utf-8"))
    setup_script = (PROJECT_ROOT / "scripts" / "setup.ps1").read_text("utf-8")
    dockerfile = DOCKERFILE.read_text("utf-8")

    assert package["engines"]["node"] == "^20.19.0 || >=22.12.0"
    assert "npm ci" in setup_script
    assert "FROM node:22.22.1-bookworm-slim AS frontend-build" in dockerfile
    assert "RUN npm ci" in dockerfile
    assert "COPY --from=frontend-build /build/frontend/dist/ ./frontend/dist/" in dockerfile


def test_compose_services_use_scoped_preflight_and_safe_runtime_contract() -> None:
    compose = yaml.safe_load(COMPOSE_CONFIG.read_text("utf-8"))
    services = compose["services"]

    for service_name in ("api", "scheduler", "worker"):
        service = services[service_name]
        command = "\n".join(service["command"])
        assert (
            f"backend.app.release_preflight --confirm-read-only-database --service {service_name}"
        ) in command
        assert service["read_only"] is True
        assert service["restart"] == "on-failure"
        assert service["cap_drop"] == ["ALL"]
        assert service["security_opt"] == ["no-new-privileges:true"]

    assert services["api"]["ports"] == ["127.0.0.1:${SEEKWAY_API_PORT:-8000}:8000"]
    assert services["frontend"]["ports"] == ["127.0.0.1:${SEEKWAY_FRONTEND_PORT:-8080}:8080"]
    assert services["scheduler"]["profiles"] == ["runtime"]
    assert services["scheduler"]["container_name"] == "seekway-datahub-scheduler"
    assert services["worker"]["profiles"] == ["runtime"]
    assert services["worker"]["environment"]["WORKER_NAME"] == ""
    assert services["worker"]["stop_grace_period"] == "3h"


def test_ecs_readme_uses_compose_worker_canary_and_single_worker_rollback() -> None:
    readme = README.read_text("utf-8")

    for expected in (
        "docker compose config --quiet",
        "docker compose build frontend api",
        "docker compose up -d frontend api",
        "docker compose --profile runtime up -d --no-deps --scale worker=1 worker",
        "docker compose --profile runtime up -d --no-deps --scale worker=2 worker",
        "docker compose --profile runtime up -d --no-deps --scale worker=4 worker",
        "docker compose --profile runtime up -d scheduler",
        "/health/ready",
        "/health/worker",
        "systemctl list-unit-files 'jijia-*' --no-legend",
        "systemctl list-units 'jijia-*' --all --no-legend",
        "systemctl list-unit-files 'seekway-datahub-*' --no-legend",
        "systemctl list-units 'seekway-datahub-*' --all --no-legend",
        "docker compose --profile runtime logs --since 2h api scheduler worker",
        "== (4, 1), data",
        "== (4, 2), data",
        "== (4, 4), data",
        "docker compose --profile runtime stop scheduler worker",
        "sudo systemctl reload-or-restart nginx",
        "https://datahub.seekwaygroup.com/health/ready",
    ):
        assert expected in readme
    assert "config/ecs/seekway-datahub-api.service.example" not in readme
    assert "docker compose down -v" in readme
    assert "sudo systemctl stop jijia-" not in readme
    canary_steps = (
        "docker compose --profile runtime up -d --no-deps --scale worker=1 worker",
        "== (4, 1), data",
        "docker compose --profile runtime up -d --no-deps --scale worker=2 worker",
        "== (4, 2), data",
        "docker compose --profile runtime up -d --no-deps --scale worker=4 worker",
        "== (4, 4), data",
    )
    assert [readme.index(step) for step in canary_steps] == sorted(
        readme.index(step) for step in canary_steps
    )
    assert readme.count('data["configuredWorkerCount"]') == 3
    assert readme.count('data["onlineWorkerCount"]') == 3
    assert readme.count("curl --fail http://127.0.0.1:8000/health/ready") == 2
    assert readme.count("curl --fail --silent http://127.0.0.1:8000/health/worker") == 3
    assert readme.count("curl --fail http://127.0.0.1:8000/health/worker") == 1
