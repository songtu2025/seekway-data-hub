from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Path, Query, Request, Response, status
from sqlalchemy.orm import Session

from backend.app.api.deps import AuthContext, get_auth_context, require_operator_csrf
from backend.app.api.responses import success_response
from backend.app.core.config import WebSettings, get_web_settings
from backend.app.core.database import get_db
from backend.app.models.sync_job import SyncJob
from backend.app.models.user import UserRole
from backend.app.schemas.sync_job import SyncJobCreateRequest, SyncJobPreviewRequest
from backend.app.services.api_policy_service import catalog_by_code
from backend.app.services.scheduled_plan_service import list_scheduled_plans
from backend.app.services.sync_job_read_service import lifecycle_events
from backend.app.services.sync_job_service import (
    RetryJobOutcome,
    RetryJobResult,
    cancel_job,
    create_manual_job,
    current_task_job,
    get_job,
    get_task,
    job_data,
    job_run_metrics,
    list_jobs,
    market_options,
    preview_manual_job,
    request_pause_job,
    resume_job,
    retry_job,
    stop_job,
    task_context,
    task_executions,
    withdraw_pause_job,
)
from backend.app.services.worker_runtime_service import queued_job_info

router = APIRouter(prefix="/sync-jobs", tags=["sync-jobs"])
TaskNumber = Annotated[str, Path(min_length=1, max_length=64)]
DatabaseSession = Annotated[Session, Depends(get_db)]
WebConfig = Annotated[WebSettings, Depends(get_web_settings)]
AuthenticatedContext = Annotated[AuthContext, Depends(get_auth_context)]
OperatorContext = Annotated[AuthContext, Depends(require_operator_csrf)]
TaskAction = Literal["pause", "withdraw_pause", "resume", "stop", "cancel"]


def _job_detail_data(
    db: Session,
    settings: WebSettings,
    context: AuthContext,
    job: SyncJob,
    account_name: str | None,
    sync_run_id: int | None,
) -> dict[str, object]:
    """组装任务详情，并补充当前逻辑任务状态。"""
    current_job, task_created_at, last_updated_at = task_context(db, job)
    metrics = job_run_metrics(db, job)
    data = job_data(
        job,
        account_name,
        sync_run_id,
        catalog=catalog_by_code(db),
        request_count=metrics["request_count"],
        success_api_count=metrics["success_api_count"],
        failed_api_count=metrics["failed_api_count"],
        current_job=current_job,
        task_created_at=task_created_at,
        last_updated_at=last_updated_at,
    )
    data["executions"] = task_executions(db, job)
    data["queueInfo"] = queued_job_info(db, job, settings)
    data["lifecycleEvents"] = lifecycle_events(
        db,
        job,
        include_actor=context.user.role == UserRole.ADMIN,
    )
    return data


def _perform_task_action(
    db: Session,
    task_no: str,
    actor_id: int,
    request_id: str,
    action: TaskAction,
    settings: WebSettings | None = None,
) -> SyncJob:
    """锁定当前执行后复用既有任务控制规则。"""
    current = current_task_job(db, task_no, for_update=True)
    if action == "pause":
        return request_pause_job(db, current.id, actor_id, request_id)
    if action == "withdraw_pause":
        return withdraw_pause_job(db, current.id, actor_id, request_id)
    if action == "stop":
        return stop_job(db, current.id, actor_id, request_id)
    if action == "cancel":
        return cancel_job(db, current.id, actor_id, request_id)
    assert settings is not None
    return resume_job(db, current.id, actor_id, request_id, settings)


def _task_action_response(
    request: Request,
    job: SyncJob,
    *,
    include_status: bool,
) -> dict[str, object]:
    """保持任务级操作响应字段一致。"""
    data: dict[str, object] = {
        "jobId": job.id,
        "taskNo": job.task_no or job.job_no,
    }
    if include_status:
        data["status"] = job.status
    return success_response(request, data)


def _accepted_task_action_response(
    request: Request,
    db: Session,
    task_no: str,
    context: AuthContext,
    settings: WebSettings,
    action: Literal["resume"],
) -> dict[str, object]:
    """执行会创建新记录的任务操作并返回 202 响应体。"""
    job = _perform_task_action(
        db,
        task_no,
        context.user.id,
        request.state.request_id,
        action,
        settings,
    )
    return _task_action_response(request, job, include_status=False)


def _retry_action_response(
    request: Request,
    response: Response,
    result: RetryJobResult,
) -> dict[str, object]:
    """按重试业务结果返回真实 HTTP 语义。"""
    data: dict[str, object] = {
        "outcome": result.outcome.value,
        "jobId": result.job.id,
        "taskNo": result.job.task_no or result.job.job_no,
    }
    if result.outcome == RetryJobOutcome.ALREADY_CAUGHT_UP:
        response.status_code = status.HTTP_200_OK
        data["taskStatus"] = "caught_up"
    return success_response(request, data)


@router.post("", status_code=status.HTTP_202_ACCEPTED)
def create_sync_job(
    payload: SyncJobCreateRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[WebSettings, Depends(get_web_settings)],
    context: Annotated[AuthContext, Depends(require_operator_csrf)],
) -> dict[str, object]:
    job = create_manual_job(
        db,
        payload.jijia_account_id,
        payload.api_code,
        context.user.id,
        request.state.request_id,
        settings,
        payload.range_mode,
        payload.start_date,
        payload.end_date,
        payload.preview_token,
        payload.market_ids,
    )
    return success_response(request, {"jobId": job.id, "taskNo": job.task_no})


@router.post("/preview")
def preview_sync_job(
    payload: SyncJobPreviewRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[WebSettings, Depends(get_web_settings)],
    _: Annotated[AuthContext, Depends(get_auth_context)],
) -> dict[str, object]:
    return success_response(
        request,
        preview_manual_job(
            db,
            payload.jijia_account_id,
            payload.api_code,
            settings,
            payload.range_mode,
            payload.start_date,
            payload.end_date,
            payload.market_ids,
        ),
    )


@router.get("/market-options")
def get_sync_job_market_options(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[AuthContext, Depends(get_auth_context)],
    jijia_account_id: Annotated[int, Query(gt=0)],
    api_code: Annotated[str, Query(min_length=1, max_length=100)],
) -> dict[str, object]:
    return success_response(
        request,
        market_options(db, jijia_account_id, api_code),
    )


@router.get("/tasks/{task_no}")
def get_sync_task(
    task_no: TaskNumber,
    request: Request,
    db: DatabaseSession,
    settings: WebConfig,
    context: AuthenticatedContext,
) -> dict[str, object]:
    job, account_name, sync_run_id = get_task(db, task_no)
    return success_response(
        request,
        _job_detail_data(db, settings, context, job, account_name, sync_run_id),
    )


@router.post("/tasks/{task_no}/pause")
def pause_sync_task(
    task_no: TaskNumber,
    request: Request,
    db: DatabaseSession,
    context: OperatorContext,
) -> dict[str, object]:
    job = _perform_task_action(db, task_no, context.user.id, request.state.request_id, "pause")
    return _task_action_response(
        request,
        job,
        include_status=True,
    )


@router.post("/tasks/{task_no}/pause/withdraw")
def withdraw_sync_task_pause(
    task_no: TaskNumber,
    request: Request,
    db: DatabaseSession,
    context: OperatorContext,
) -> dict[str, object]:
    job = _perform_task_action(
        db, task_no, context.user.id, request.state.request_id, "withdraw_pause"
    )
    return _task_action_response(
        request,
        job,
        include_status=True,
    )


@router.post("/tasks/{task_no}/resume", status_code=status.HTTP_202_ACCEPTED)
def resume_sync_task(
    task_no: TaskNumber,
    request: Request,
    db: DatabaseSession,
    settings: WebConfig,
    context: OperatorContext,
) -> dict[str, object]:
    return _accepted_task_action_response(request, db, task_no, context, settings, "resume")


@router.post("/tasks/{task_no}/stop")
def stop_sync_task(
    task_no: TaskNumber,
    request: Request,
    db: DatabaseSession,
    context: OperatorContext,
) -> dict[str, object]:
    job = _perform_task_action(db, task_no, context.user.id, request.state.request_id, "stop")
    return _task_action_response(
        request,
        job,
        include_status=True,
    )


@router.post("/tasks/{task_no}/cancel")
def cancel_sync_task(
    task_no: TaskNumber,
    request: Request,
    db: DatabaseSession,
    context: OperatorContext,
) -> dict[str, object]:
    job = _perform_task_action(db, task_no, context.user.id, request.state.request_id, "cancel")
    return _task_action_response(
        request,
        job,
        include_status=True,
    )


@router.post("/tasks/{task_no}/retry", status_code=status.HTTP_202_ACCEPTED)
def retry_sync_task(
    task_no: TaskNumber,
    request: Request,
    response: Response,
    db: DatabaseSession,
    settings: WebConfig,
    context: OperatorContext,
) -> dict[str, object]:
    current = current_task_job(db, task_no, for_update=True)
    result = retry_job(
        db,
        current.id,
        context.user.id,
        request.state.request_id,
        settings,
    )
    return _retry_action_response(request, response, result)


@router.post("/{job_id}/pause")
def pause_sync_job(
    job_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    context: Annotated[AuthContext, Depends(require_operator_csrf)],
) -> dict[str, object]:
    job = request_pause_job(db, job_id, context.user.id, request.state.request_id)
    return success_response(request, {"jobId": job.id, "status": job.status})


@router.post("/{job_id}/pause/withdraw")
def withdraw_sync_job_pause(
    job_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    context: Annotated[AuthContext, Depends(require_operator_csrf)],
) -> dict[str, object]:
    job = withdraw_pause_job(db, job_id, context.user.id, request.state.request_id)
    return success_response(request, {"jobId": job.id, "status": job.status})


@router.post("/{job_id}/resume", status_code=status.HTTP_202_ACCEPTED)
def resume_sync_job(
    job_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[WebSettings, Depends(get_web_settings)],
    context: Annotated[AuthContext, Depends(require_operator_csrf)],
) -> dict[str, object]:
    job = resume_job(db, job_id, context.user.id, request.state.request_id, settings)
    return success_response(request, {"jobId": job.id, "taskNo": job.task_no})


@router.post("/{job_id}/stop")
def stop_sync_job(
    job_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    context: Annotated[AuthContext, Depends(require_operator_csrf)],
) -> dict[str, object]:
    job = stop_job(db, job_id, context.user.id, request.state.request_id)
    return success_response(request, {"jobId": job.id, "status": job.status})


@router.post("/{job_id}/cancel")
def cancel_sync_job(
    job_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    context: Annotated[AuthContext, Depends(require_operator_csrf)],
) -> dict[str, object]:
    job = cancel_job(
        db,
        job_id,
        context.user.id,
        request.state.request_id,
    )
    return success_response(request, {"jobId": job.id, "status": job.status})


@router.get("")
def get_sync_jobs(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[WebSettings, Depends(get_web_settings)],
    _: Annotated[AuthContext, Depends(get_auth_context)],
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    jijia_account_id: int | None = None,
    api_code: str | None = None,
    job_status: Annotated[str | None, Query(alias="status")] = None,
    status_group: Literal["active", "attention", "success", "ended"] | None = None,
    trigger_type: Literal["manual", "retry", "schedule"] | None = None,
) -> dict[str, object]:
    return success_response(
        request,
        list_jobs(
            db,
            cursor,
            settings,
            limit,
            account_id=jijia_account_id,
            api_code=api_code,
            status=job_status,
            status_group=status_group,
            trigger_type=trigger_type,
        ),
    )


@router.get("/scheduled-plans")
def get_scheduled_plans(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[AuthContext, Depends(get_auth_context)],
) -> dict[str, object]:
    return success_response(request, list_scheduled_plans(db))


@router.get("/{job_id}")
def get_sync_job(
    job_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[WebSettings, Depends(get_web_settings)],
    context: Annotated[AuthContext, Depends(get_auth_context)],
) -> dict[str, object]:
    job, account_name, sync_run_id = get_job(db, job_id)
    return success_response(
        request,
        _job_detail_data(db, settings, context, job, account_name, sync_run_id),
    )


@router.post("/{job_id}/retry", status_code=status.HTTP_202_ACCEPTED)
def retry_sync_job(
    job_id: int,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[WebSettings, Depends(get_web_settings)],
    context: Annotated[AuthContext, Depends(require_operator_csrf)],
) -> dict[str, object]:
    result = retry_job(
        db,
        job_id,
        context.user.id,
        request.state.request_id,
        settings,
    )
    return _retry_action_response(request, response, result)
