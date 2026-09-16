import logging
import uuid
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.app.api.v1 import (
    api_catalog,
    api_policies,
    audit_logs,
    auth,
    dashboard,
    invitations,
    jijia_accounts,
    parsed_data,
    raw_data,
    runtime,
    sale_return_orders,
    sync_jobs,
    sync_runs,
    users,
)
from backend.app.core.config import WebSettings, get_web_settings
from backend.app.core.database import engine, get_db
from backend.app.core.errors import ApiError
from backend.app.core.service_logging import configure_service_logging
from backend.app.services.runtime_startup_service import (
    PRODUCTION_ENVIRONMENTS,
    validate_runtime_startup,
)
from backend.app.services.worker_runtime_service import worker_runtime_data

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    """启动时验证生产安全配置，配置错误时拒绝提供服务。"""
    configure_service_logging()
    settings = get_web_settings()
    configure_service_logging(settings.log_level)
    validate_runtime_startup(settings, engine)
    yield


async def _request_context(
    request: Request,
    call_next: Callable[[Request], Awaitable[Any]],
) -> Any:
    """为请求补充追踪标识，并统一处理未捕获异常。"""
    request.state.request_id = uuid.uuid4().hex
    try:
        response = await call_next(request)
    except Exception as error:
        logger.error(
            "未处理请求异常: request_id=%s error_type=%s",
            request.state.request_id,
            type(error).__name__,
        )
        response = JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "服务暂时不可用",
                    "details": None,
                },
                "requestId": request.state.request_id,
            },
        )
    response.headers["X-Request-ID"] = request.state.request_id
    if request.url.path.startswith("/api/v1/auth"):
        response.headers["Cache-Control"] = "no-store"
    return response


async def _handle_api_error(request: Request, error: ApiError) -> JSONResponse:
    """将业务错误转换为统一响应。"""
    return JSONResponse(
        status_code=error.status_code,
        content={
            "error": {
                "code": error.code,
                "message": error.message,
                "details": error.details,
            },
            "requestId": request.state.request_id,
        },
    )


async def _handle_validation_error(request: Request, error: RequestValidationError) -> JSONResponse:
    """返回不包含输入值的参数校验错误。"""
    safe_details = [
        {key: value for key, value in item.items() if key not in {"input", "ctx"}}
        for item in error.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "请求参数不正确",
                "details": safe_details,
            },
            "requestId": request.state.request_id,
        },
    )


def _health_live(request: Request) -> dict[str, object]:
    return {"data": {"status": "ok"}, "requestId": request.state.request_id}


def _health_ready(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[WebSettings, Depends(get_web_settings)],
) -> dict[str, object]:
    """只有数据库可用且生产实例未全局只读时才允许上游导流。"""
    try:
        if settings.app_env.lower() in PRODUCTION_ENVIRONMENTS:
            read_only = db.execute(text("SELECT @@GLOBAL.read_only")).scalar_one()
            if read_only is None or int(read_only) != 0:
                raise ValueError("runtime database is read only")
        else:
            db.execute(text("SELECT 1"))
    except (SQLAlchemyError, TypeError, ValueError) as error:
        raise ApiError(503, "SERVICE_NOT_READY", "服务暂未就绪") from error
    return {"data": {"status": "ready"}, "requestId": request.state.request_id}


def _health_worker(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[WebSettings, Depends(get_web_settings)],
) -> dict[str, object]:
    """独立报告 Worker 健康，不影响 API 和数据库就绪状态。"""
    runtime = worker_runtime_data(db, settings)
    availability = runtime["availability"]
    if availability == "offline":
        raise ApiError(503, "WORKER_NOT_READY", "任务执行服务暂未就绪")
    status = "degraded" if runtime["capacityStatus"] == "degraded" else availability
    return {
        "data": {
            "status": status,
            "configuredWorkerCount": runtime["configuredWorkerCount"],
            "onlineWorkerCount": runtime["onlineWorkerCount"],
            "busyWorkerCount": runtime["busyWorkerCount"],
            "idleWorkerCount": runtime["idleWorkerCount"],
            "staleWorkerCount": runtime["staleWorkerCount"],
        },
        "requestId": request.state.request_id,
    }


def _register_routes(app: FastAPI) -> None:
    """按稳定顺序注册健康检查和业务路由。"""
    app.get("/health/live", name="health_live")(_health_live)
    app.get("/health/ready", name="health_ready")(_health_ready)
    app.get("/health/worker", name="health_worker")(_health_worker)
    app.include_router(auth.router, prefix="/api/v1")
    app.include_router(invitations.router, prefix="/api/v1")
    app.include_router(users.router, prefix="/api/v1")
    app.include_router(jijia_accounts.router, prefix="/api/v1")
    app.include_router(api_catalog.router, prefix="/api/v1")
    app.include_router(api_policies.router, prefix="/api/v1")
    app.include_router(sync_jobs.router, prefix="/api/v1")
    app.include_router(sync_runs.router, prefix="/api/v1")
    app.include_router(raw_data.router, prefix="/api/v1")
    app.include_router(parsed_data.router, prefix="/api/v1")
    app.include_router(runtime.router, prefix="/api/v1")
    app.include_router(sale_return_orders.router, prefix="/api/v1")
    app.include_router(dashboard.router, prefix="/api/v1")
    app.include_router(audit_logs.router, prefix="/api/v1")


def create_app(validate_settings: bool = True) -> FastAPI:
    """创建不执行同步任务的 FastAPI 管理服务。"""
    app = FastAPI(
        title="积加数据同步 Web 服务",
        version="0.1.0",
        lifespan=lifespan if validate_settings else None,
    )
    app.middleware("http")(_request_context)
    app.exception_handler(ApiError)(_handle_api_error)
    app.exception_handler(RequestValidationError)(_handle_validation_error)
    _register_routes(app)
    return app


app = create_app()
