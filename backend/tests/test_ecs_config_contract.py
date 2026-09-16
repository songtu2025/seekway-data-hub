import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
NGINX_CONFIG = PROJECT_ROOT / "config" / "ecs" / "nginx.conf.example"
README = PROJECT_ROOT / "README.md"


def test_nginx_config_keeps_api_out_of_spa_fallback() -> None:
    text = NGINX_CONFIG.read_text(encoding="utf-8")

    for placeholder in (
        "__PUBLIC_HOST__",
        "__TLS_CERTIFICATE_PATH__",
        "__TLS_CERTIFICATE_KEY_PATH__",
    ):
        assert placeholder in text

    assert "root __PROJECT_ROOT__/frontend/dist;" in text
    assert "__FRONTEND_DIST_ROOT__" not in text

    login_location = text.index("location = /api/v1/auth/login")
    reset_location = text.index("location = /api/v1/auth/password-reset/request")
    api_location = text.index("location ^~ /api/")
    health_location = text.index("location ^~ /health/")
    fallback_location = text.index("location / {")
    assert login_location < reset_location < api_location < fallback_location
    assert health_location < fallback_location
    assert text.count("limit_req zone=login_per_ip") == 2
    assert text.count("proxy_pass http://jijia_web_api;") == 4
    assert "try_files $uri $uri/ /index.html;" in text
    assert 'default "no-store";' in text
    assert '"public, max-age=31536000, immutable"' in text
    assert "Strict-Transport-Security" in text
    assert "Content-Security-Policy" in text


def test_frontend_build_uses_pinned_node_contract_and_clean_install() -> None:
    package = json.loads((PROJECT_ROOT / "frontend" / "package.json").read_text("utf-8"))
    setup_script = (PROJECT_ROOT / "scripts" / "setup.ps1").read_text("utf-8")

    assert package["engines"]["node"] == "^20.19.0 || >=22.12.0"
    assert "npm ci" in setup_script


def test_ecs_services_use_scoped_preflight_and_worker_template_contract() -> None:
    service_scopes = {
        "jijia-api.service.example": "api",
        "jijia-scheduler.service.example": "scheduler",
        "jijia-worker@.service.example": "worker",
    }

    for file_name, service_scope in service_scopes.items():
        service = (PROJECT_ROOT / "config" / "ecs" / file_name).read_text("utf-8")
        assert (
            f"backend.app.release_preflight --confirm-read-only-database --service {service_scope}"
        ) in service

    worker = (PROJECT_ROOT / "config" / "ecs" / "jijia-worker@.service.example").read_text("utf-8")
    assert "Environment=WORKER_NAME=%i" in worker


def test_ecs_readme_uses_one_two_four_worker_canary_and_single_worker_rollback() -> None:
    readme = README.read_text("utf-8")

    assert "jijia-worker.service.example" not in readme
    for expected in (
        "jijia-api.service",
        "jijia-scheduler.service",
        "jijia-worker@.service",
        "jijia-worker@worker-1",
        "jijia-worker@worker-{1..4}",
        "jijia-worker@worker-{2..4}",
        "--service api",
        "--service scheduler",
        "--service worker",
        "/health/ready",
        "/health/worker",
        "journalctl -u jijia-api -u jijia-scheduler -u 'jijia-worker@worker-*'",
        "sudo systemctl enable jijia-api jijia-scheduler jijia-worker@worker-1 nginx",
        "sudo systemctl start jijia-scheduler jijia-worker@worker-1",
        "sudo systemctl start jijia-worker@worker-2",
        "sudo systemctl start jijia-worker@worker-{3..4}",
        "sudo systemctl enable jijia-worker@worker-{2..4}",
        "== (4, 1), data",
        "== (4, 2), data",
        "== (4, 4), data",
        "sudo systemctl stop jijia-worker@worker-{1..4} jijia-scheduler jijia-api",
        "sudo systemctl reload-or-restart nginx",
    ):
        assert expected in readme
    assert (
        "sudo systemctl enable jijia-api jijia-scheduler jijia-worker@worker-{1..4}" not in readme
    )
    assert "sudo systemctl start jijia-scheduler jijia-worker@worker-{1..4}" not in readme
    canary_steps = (
        "sudo systemctl enable jijia-api jijia-scheduler jijia-worker@worker-1 nginx",
        "sudo systemctl start jijia-scheduler jijia-worker@worker-1",
        "== (4, 1), data",
        "sudo systemctl start jijia-worker@worker-2",
        "== (4, 2), data",
        "sudo systemctl start jijia-worker@worker-{3..4}",
        "== (4, 4), data",
        "sudo systemctl enable jijia-worker@worker-{2..4}",
    )
    assert [readme.index(step) for step in canary_steps] == sorted(
        readme.index(step) for step in canary_steps
    )
    assert readme.count('data["configuredWorkerCount"]') == 3
    assert readme.count('data["onlineWorkerCount"]') == 3
    assert readme.count("curl --fail http://127.0.0.1:8000/health/ready") == 2
    assert readme.count("curl --fail --silent http://127.0.0.1:8000/health/worker") == 3
    assert readme.count("curl --fail http://127.0.0.1:8000/health/worker") == 1
