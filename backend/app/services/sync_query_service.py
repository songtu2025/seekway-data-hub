from collections.abc import Sequence
from datetime import date, datetime
from typing import Any

from sqlalchemy import and_, case, func, select, tuple_
from sqlalchemy.orm import Session

from backend.app.core.errors import ApiError
from backend.app.models.account_api_policy import AccountApiPolicy, ScheduleMode
from backend.app.models.audit_log import AuditLog
from backend.app.models.jijia_account import JijiaAccount, JijiaAccountStatus
from backend.app.models.sync_job import SyncJob
from backend.app.models.sync_records import (
    failed_request_log_table,
    raw_api_data_history_table,
    raw_api_data_table,
    sale_return_order_table,
    sync_api_log_table,
    sync_batch_table,
)
from backend.app.models.user import AppUser, UserRole
from backend.app.services.api_policy_service import catalog_by_code
from backend.app.services.audit_service import add_audit_log
from backend.app.services.m3_common import (
    DEFAULT_PAGE_SIZE,
    cursor_before,
    decode_cursor,
    encode_cursor,
    json_value,
    page_size,
    public_history_progress,
    utc_iso,
)
from backend.app.services.sync_job_service import latest_execution_ids, task_status
from backend.app.services.sync_query_filters import (
    AuditLogFilters,
    RawDataFilters,
    SaleReturnOrderFilters,
    apply_audit_log_filters,
    apply_raw_data_filters,
    apply_sale_return_order_filters,
)

RAW_SUMMARY_COLUMNS = tuple(column for column in raw_api_data_table.c if column.name != "raw_json")
HISTORY_METADATA_COLUMNS = tuple(
    column for column in raw_api_data_history_table.c if column.name != "raw_json"
)
LEGACY_ACCOUNT_ID = 0


def _account_names(db: Session, account_ids: set[int]) -> dict[int, str]:
    if not account_ids:
        return {}
    rows = db.execute(
        select(JijiaAccount.id, JijiaAccount.name).where(JijiaAccount.id.in_(sorted(account_ids)))
    ).all()
    return {row[0]: row[1] for row in rows}


def _enrich_raw_summaries(db: Session, mappings: list[dict[str, Any]]) -> None:
    """批量补充账号名称和历史版本数量，避免逐行查询。"""
    if not mappings:
        return
    account_ids = {mapping["jijia_account_id"] for mapping in mappings}
    account_names = _account_names(db, account_ids)
    record_keys = {
        (
            mapping["jijia_account_id"],
            mapping["api_code"],
            mapping["record_identity"],
        )
        for mapping in mappings
    }
    version_rows = db.execute(
        select(
            raw_api_data_history_table.c.jijia_account_id,
            raw_api_data_history_table.c.api_code,
            raw_api_data_history_table.c.record_identity,
            func.count(raw_api_data_history_table.c.id),
        )
        .where(
            tuple_(
                raw_api_data_history_table.c.jijia_account_id,
                raw_api_data_history_table.c.api_code,
                raw_api_data_history_table.c.record_identity,
            ).in_(sorted(record_keys))
        )
        .group_by(
            raw_api_data_history_table.c.jijia_account_id,
            raw_api_data_history_table.c.api_code,
            raw_api_data_history_table.c.record_identity,
        )
    ).all()
    version_counts = {(row[0], row[1], row[2]): int(row[3]) for row in version_rows}
    for mapping in mappings:
        key = (
            mapping["jijia_account_id"],
            mapping["api_code"],
            mapping["record_identity"],
        )
        mapping["account_name"] = account_names.get(mapping["jijia_account_id"])
        mapping["version_count"] = version_counts.get(key, 0)


def _source_datetime_iso(value: datetime | None) -> str | None:
    """保留积加文档定义的无时区业务时间，不做浏览器时区换算。"""
    return value.isoformat(timespec="seconds") if value else None


def _sale_return_order_data(mapping: Any) -> dict[str, object]:
    return {
        "id": mapping["id"],
        "jijiaAccountId": mapping["jijia_account_id"],
        "accountName": mapping.get("account_name"),
        "rawDataId": mapping["raw_data_id"],
        "sourcePrimaryKey": mapping["source_primary_key"],
        "marketId": mapping.get("market_id"),
        "returnDateTime": _source_datetime_iso(mapping.get("return_date_time")),
        "orderId": mapping.get("order_id"),
        "sellerOrderId": mapping.get("seller_order_id"),
        "asin": mapping.get("asin"),
        "msku": mapping.get("msku"),
        "fnsku": mapping.get("fnsku"),
        "sku": mapping.get("sku"),
        "productName": mapping.get("product_name"),
        "quantity": mapping.get("quantity"),
        "fulfillmentCenterId": mapping.get("fulfillment_center_id"),
        "disposition": mapping.get("disposition"),
        "reason": mapping.get("reason"),
        "status": mapping.get("status"),
        "sourceCreatedAt": _source_datetime_iso(mapping.get("source_created_at")),
        "sourceUpdatedAt": _source_datetime_iso(mapping.get("source_updated_at")),
        "dataHash": mapping["data_hash"],
        "syncBatchNo": mapping["sync_batch_no"],
    }


def sync_run_data(row: Any) -> dict[str, object]:
    mapping = row._mapping if hasattr(row, "_mapping") else row
    return {
        "id": mapping["id"],
        "batchNo": mapping["sync_batch_no"],
        "jijiaAccountId": mapping["jijia_account_id"],
        "accountName": mapping.get("account_name"),
        "status": mapping["status"],
        "startedAt": utc_iso(mapping.get("started_at")),
        "finishedAt": utc_iso(mapping.get("finished_at")),
        "jobId": mapping.get("sync_job_id"),
        "totalApis": mapping.get("total_api_count", 0),
        "failedApis": mapping.get("failed_api_count", 0),
    }


def list_sync_runs(
    db: Session,
    cursor_value: str | None,
    limit: int = DEFAULT_PAGE_SIZE,
    account_id: int | None = None,
    status: str | None = None,
) -> dict[str, object]:
    cursor = decode_cursor(cursor_value)
    size = page_size(limit)
    statement = select(
        *sync_batch_table.c,
        JijiaAccount.name.label("account_name"),
    ).join(JijiaAccount, JijiaAccount.id == sync_batch_table.c.jijia_account_id)
    if account_id is not None:
        statement = statement.where(sync_batch_table.c.jijia_account_id == account_id)
    if status:
        statement = statement.where(sync_batch_table.c.status == status)
    if cursor:
        statement = statement.where(
            cursor_before(sync_batch_table.c.created_at, sync_batch_table.c.id, cursor)
        )
    rows = db.execute(
        statement.order_by(
            sync_batch_table.c.created_at.desc(),
            sync_batch_table.c.id.desc(),
        ).limit(size + 1)
    ).all()
    visible = rows[:size]
    return _child_page(
        visible,
        rows,
        [sync_run_data(row) for row in visible],
        size,
    )


def get_sync_run(db: Session, run_id: int) -> dict[str, object]:
    """按运行 ID 返回带账号名称的单个同步批次。"""
    row = db.execute(
        select(
            *sync_batch_table.c,
            JijiaAccount.name.label("account_name"),
        )
        .join(JijiaAccount, JijiaAccount.id == sync_batch_table.c.jijia_account_id)
        .where(sync_batch_table.c.id == run_id)
    ).first()
    if row is None:
        raise ApiError(404, "SYNC_RUN_NOT_FOUND", "同步运行不存在")
    return sync_run_data(row)


def list_run_logs(
    db: Session,
    run_id: int,
    cursor_value: str | None,
    limit: int = DEFAULT_PAGE_SIZE,
) -> dict[str, object]:
    visible, rows, size = _run_child_rows(
        db,
        run_id,
        cursor_value,
        limit,
        sync_api_log_table,
    )
    items = [
        {
            "id": row._mapping["id"],
            "apiCode": row._mapping["api_code"],
            "status": row._mapping["status"],
            "message": row._mapping["error_message"],
            "startedAt": utc_iso(row._mapping["started_at"]),
            "finishedAt": utc_iso(row._mapping["finished_at"]),
        }
        for row in visible
    ]
    return _child_page(visible, rows, items, size)


def list_failed_requests(
    db: Session,
    run_id: int,
    cursor_value: str | None,
    limit: int = DEFAULT_PAGE_SIZE,
) -> dict[str, object]:
    visible, rows, size = _run_child_rows(
        db,
        run_id,
        cursor_value,
        limit,
        failed_request_log_table,
    )
    items = [
        {
            "id": row._mapping["id"],
            "apiCode": row._mapping["api_code"],
            "errorCode": None,
            "errorMessage": row._mapping["error_message"],
            "attemptCount": row._mapping["retry_count"],
            "createdAt": utc_iso(row._mapping["created_at"]),
        }
        for row in visible
    ]
    return _child_page(visible, rows, items, size)


def list_raw_data(
    db: Session,
    cursor_value: str | None,
    limit: int = DEFAULT_PAGE_SIZE,
    account_id: int | None = None,
    api_code: str | None = None,
    sync_batch_no: str | None = None,
    observed_sync_batch_no: str | None = None,
    source_primary_key: str | None = None,
    data_date_start: date | None = None,
    data_date_end: date | None = None,
) -> dict[str, object]:
    if data_date_start and data_date_end and data_date_start > data_date_end:
        raise ApiError(422, "DATA_DATE_RANGE_INVALID", "数据开始日期不能晚于结束日期")
    cursor = decode_cursor(cursor_value)
    size = page_size(limit)
    filters = RawDataFilters(
        cursor=cursor,
        account_id=account_id,
        api_code=api_code,
        sync_batch_no=sync_batch_no,
        observed_sync_batch_no=observed_sync_batch_no,
        source_primary_key=source_primary_key,
        data_date_start=data_date_start,
        data_date_end=data_date_end,
    )
    statement = apply_raw_data_filters(
        select(*RAW_SUMMARY_COLUMNS).where(
            raw_api_data_table.c.jijia_account_id > LEGACY_ACCOUNT_ID
        ),
        filters,
    )
    rows = db.execute(
        statement.order_by(
            raw_api_data_table.c.created_at.desc(),
            raw_api_data_table.c.id.desc(),
        ).limit(size + 1)
    ).all()
    visible = rows[:size]
    visible_mappings = [dict(row._mapping) for row in visible]
    _enrich_raw_summaries(db, visible_mappings)
    return _child_page(
        visible,
        rows,
        [_raw_summary(mapping) for mapping in visible_mappings],
        size,
    )


def list_sale_return_orders(
    db: Session,
    cursor_value: str | None,
    actor_id: int,
    request_id: str,
    limit: int = DEFAULT_PAGE_SIZE,
    account_id: int | None = None,
    status: str | None = None,
    return_date_start: date | None = None,
    return_date_end: date | None = None,
    order_id: str | None = None,
    sku: str | None = None,
    reason: str | None = None,
    disposition: str | None = None,
    fulfillment_center_id: str | None = None,
) -> dict[str, object]:
    """查询退货订单当前投影，完整原文仍通过 raw 详情页查看。"""
    if return_date_start and return_date_end and return_date_start > return_date_end:
        raise ApiError(422, "RETURN_DATE_RANGE_INVALID", "退货开始日期不能晚于结束日期")

    cursor = decode_cursor(cursor_value)
    size = page_size(limit)
    filters = SaleReturnOrderFilters(
        cursor=cursor,
        account_id=account_id,
        status=status,
        return_date_start=return_date_start,
        return_date_end=return_date_end,
        order_id=order_id,
        sku=sku,
        reason=reason,
        disposition=disposition,
        fulfillment_center_id=fulfillment_center_id,
    )
    statement = apply_sale_return_order_filters(
        select(sale_return_order_table).where(
            sale_return_order_table.c.jijia_account_id > LEGACY_ACCOUNT_ID
        ),
        filters,
    )
    rows = db.execute(
        statement.order_by(
            sale_return_order_table.c.created_at.desc(),
            sale_return_order_table.c.id.desc(),
        ).limit(size + 1)
    ).all()
    visible = rows[:size]
    visible_mappings = [dict(row._mapping) for row in visible]
    account_names = _account_names(
        db,
        {mapping["jijia_account_id"] for mapping in visible_mappings},
    )
    for mapping in visible_mappings:
        mapping["account_name"] = account_names.get(mapping["jijia_account_id"])
    add_audit_log(
        db,
        actor_user_id=actor_id,
        jijia_account_id=account_id,
        action="sale_return_order.list",
        resource_type="sale_return_order",
        resource_id="list",
        request_id=request_id,
        result="success",
        changes={"resultCount": len(visible_mappings), "filtered": filters.has_filters()},
    )
    db.commit()
    return _child_page(
        visible,
        rows,
        [_sale_return_order_data(mapping) for mapping in visible_mappings],
        size,
    )


def get_raw_data(
    db: Session,
    raw_data_id: int,
    role: UserRole,
    actor_id: int,
    request_id: str,
) -> dict[str, object]:
    include_raw = role in {UserRole.ADMIN, UserRole.OPERATOR}
    row = _raw_scope(db, raw_data_id, include_raw=include_raw)
    data = _raw_summary(row)
    data.update(
        {
            "sensitive": _is_sensitive(db, row["api_code"]),
            "createdAt": utc_iso(row["created_at"]),
        }
    )
    if include_raw:
        data["rawJson"] = json_value(row["raw_json"])
        _audit_raw_access(db, actor_id, row, request_id, "raw_data.view")
    return data


def list_raw_versions(
    db: Session,
    raw_data_id: int,
    role: UserRole,
    actor_id: int,
    request_id: str,
    cursor_value: str | None,
    limit: int = DEFAULT_PAGE_SIZE,
) -> dict[str, object]:
    include_raw = role in {UserRole.ADMIN, UserRole.OPERATOR}
    raw = _raw_scope(db, raw_data_id, include_raw=False)
    cursor = decode_cursor(cursor_value)
    size = page_size(limit)
    history_columns = (
        tuple(raw_api_data_history_table.c) if include_raw else HISTORY_METADATA_COLUMNS
    )
    statement = select(*history_columns).where(
        raw_api_data_history_table.c.jijia_account_id == raw["jijia_account_id"],
        raw_api_data_history_table.c.api_code == raw["api_code"],
        raw_api_data_history_table.c.record_identity == raw["record_identity"],
    )
    if cursor:
        statement = statement.where(
            cursor_before(
                raw_api_data_history_table.c.observed_at,
                raw_api_data_history_table.c.id,
                cursor,
            )
        )
    rows = db.execute(
        statement.order_by(
            raw_api_data_history_table.c.observed_at.desc(),
            raw_api_data_history_table.c.id.desc(),
        ).limit(size + 1)
    ).all()
    visible = rows[:size]
    items = []
    for row in visible:
        mapping = row._mapping
        item = {
            "id": mapping["id"],
            "batchNo": mapping["sync_batch_no"],
            "dataHash": mapping["data_hash"],
            "dataDate": _date_iso(mapping["data_date"]),
            "observedAt": utc_iso(mapping["observed_at"]),
        }
        if include_raw:
            item["rawJson"] = json_value(mapping["raw_json"])
        items.append(item)
    if include_raw:
        _audit_raw_access(db, actor_id, raw, request_id, "raw_data.versions_view")
    return _child_page(
        visible,
        rows,
        items,
        size,
        cursor_time_key="observed_at",
    )


def dashboard_summary(db: Session) -> dict[str, object]:
    latest_ids = latest_execution_ids()
    unresolved_failure = and_(
        SyncJob.status.in_(("failed", "partial_failed")),
        SyncJob.resolution_code.is_(None),
    )
    count_rows = db.execute(
        select(SyncJob.status, func.count(SyncJob.id))
        .where(
            SyncJob.id.in_(select(latest_ids.c.id)),
            (SyncJob.status.not_in(("failed", "partial_failed"))) | unresolved_failure,
        )
        .group_by(SyncJob.status)
    ).all()
    counts: dict[str, int] = {row[0]: int(row[1]) for row in count_rows}
    unresolved_batches = (
        select(
            SyncJob.sync_batch_no.label("sync_batch_no"),
            SyncJob.jijia_account_id.label("jijia_account_id"),
        )
        .where(
            SyncJob.id.in_(select(latest_ids.c.id)),
            unresolved_failure,
            SyncJob.sync_batch_no.is_not(None),
        )
        .subquery()
    )
    failed_requests = db.scalar(
        select(func.count(failed_request_log_table.c.id)).join(
            unresolved_batches,
            and_(
                unresolved_batches.c.sync_batch_no == failed_request_log_table.c.sync_batch_no,
                unresolved_batches.c.jijia_account_id
                == failed_request_log_table.c.jijia_account_id,
            ),
        )
    )
    latest_run_row = db.execute(
        select(*sync_batch_table.c, JijiaAccount.name.label("account_name"))
        .join(JijiaAccount, JijiaAccount.id == sync_batch_table.c.jijia_account_id)
        .order_by(sync_batch_table.c.created_at.desc(), sync_batch_table.c.id.desc())
        .limit(1)
    ).first()
    latest_progress_job = db.scalar(
        select(SyncJob)
        .where(SyncJob.job_type.in_(("history_backfill", "update_incremental")))
        .order_by(SyncJob.created_at.desc(), SyncJob.id.desc())
        .limit(1)
    )
    account_rows = db.execute(
        select(JijiaAccount.status, func.count(JijiaAccount.id)).group_by(JijiaAccount.status)
    ).all()
    account_counts = {str(row[0]): int(row[1]) for row in account_rows}
    policy_rows = db.execute(
        select(
            func.count(AccountApiPolicy.id),
            func.sum(case((AccountApiPolicy.enabled.is_(True), 1), else_=0)),
            func.sum(
                case(
                    (
                        AccountApiPolicy.enabled.is_(True)
                        & (AccountApiPolicy.schedule_mode != ScheduleMode.MANUAL_ONLY),
                        1,
                    ),
                    else_=0,
                )
            ),
        )
    ).one()
    latest_data_at = db.scalar(select(func.max(raw_api_data_table.c.last_observed_at)))
    return {
        "queuedJobs": counts.get("queued", 0),
        "runningJobs": counts.get("running", 0),
        "failedJobs": counts.get("failed", 0) + counts.get("partial_failed", 0),
        "failedRequests": failed_requests or 0,
        "latestRun": sync_run_data(latest_run_row) if latest_run_row else None,
        "historyProgress": (
            public_history_progress(latest_progress_job.progress_json)
            if latest_progress_job
            else None
        ),
        "historyJobType": latest_progress_job.job_type if latest_progress_job else None,
        "historyTaskStatus": task_status(latest_progress_job) if latest_progress_job else None,
        "accounts": {
            "total": sum(account_counts.values()),
            "active": account_counts.get(JijiaAccountStatus.ACTIVE.value, 0),
            "attention": account_counts.get(JijiaAccountStatus.PENDING_VERIFICATION.value, 0)
            + account_counts.get(JijiaAccountStatus.VERIFICATION_FAILED.value, 0),
            "inactive": account_counts.get(JijiaAccountStatus.INACTIVE.value, 0),
        },
        "policies": {
            "total": int(policy_rows[0] or 0),
            "enabled": int(policy_rows[1] or 0),
            "scheduled": int(policy_rows[2] or 0),
        },
        "latestDataAt": utc_iso(latest_data_at),
    }


def list_audit_logs(
    db: Session,
    cursor_value: str | None,
    limit: int = DEFAULT_PAGE_SIZE,
    account_id: int | None = None,
    action: str | None = None,
    result: str | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    actor_user_id: int | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
) -> dict[str, object]:
    cursor = decode_cursor(cursor_value)
    size = page_size(limit)
    filters = AuditLogFilters(
        cursor=cursor,
        account_id=account_id,
        actor_user_id=actor_user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        result=result,
        created_from=created_from,
        created_to=created_to,
    )
    statement = apply_audit_log_filters(
        select(
            AuditLog,
            AppUser.display_name.label("actor_name"),
        ).outerjoin(AppUser, AppUser.id == AuditLog.actor_user_id),
        filters,
    )
    rows = db.execute(
        statement.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(size + 1)
    ).all()
    visible = rows[:size]
    next_cursor = None
    if len(rows) > size and visible:
        next_cursor = encode_cursor(visible[-1][0].created_at, visible[-1][0].id)
    return {
        "items": [
            {
                "id": row[0].id,
                "actorUserId": row[0].actor_user_id,
                "actorName": row.actor_name,
                "action": row[0].action,
                "resourceType": row[0].resource_type,
                "resourceId": row[0].resource_id,
                "requestId": row[0].request_id,
                "result": row[0].result,
                "createdAt": utc_iso(row[0].created_at),
                "changes": row[0].changes_json,
            }
            for row in visible
        ],
        "nextCursor": next_cursor,
    }


def _run_scope(db: Session, run_id: int) -> Any:
    row = (
        db.execute(select(sync_batch_table).where(sync_batch_table.c.id == run_id))
        .mappings()
        .first()
    )
    if row is None or db.get(JijiaAccount, row["jijia_account_id"]) is None:
        raise ApiError(404, "SYNC_RUN_NOT_FOUND", "同步运行不存在")
    return row


def _run_child_rows(
    db: Session,
    run_id: int,
    cursor_value: str | None,
    limit: int,
    table: Any,
) -> tuple[Sequence[Any], Sequence[Any], int]:
    """按运行所属账号、批次和游标读取子记录。"""
    run = _run_scope(db, run_id)
    cursor = decode_cursor(cursor_value)
    size = page_size(limit)
    statement = select(table).where(
        table.c.sync_batch_no == run["sync_batch_no"],
        table.c.jijia_account_id == run["jijia_account_id"],
    )
    if cursor:
        statement = statement.where(cursor_before(table.c.created_at, table.c.id, cursor))
    rows = db.execute(
        statement.order_by(table.c.created_at.desc(), table.c.id.desc()).limit(size + 1)
    ).all()
    return rows[:size], rows, size


def _raw_scope(db: Session, raw_data_id: int, include_raw: bool) -> Any:
    version_count = (
        select(func.count(raw_api_data_history_table.c.id))
        .where(
            raw_api_data_history_table.c.jijia_account_id == raw_api_data_table.c.jijia_account_id,
            raw_api_data_history_table.c.api_code == raw_api_data_table.c.api_code,
            raw_api_data_history_table.c.record_identity == raw_api_data_table.c.record_identity,
        )
        .scalar_subquery()
    )
    raw_columns = tuple(raw_api_data_table.c) if include_raw else RAW_SUMMARY_COLUMNS
    row = (
        db.execute(
            select(
                *raw_columns,
                JijiaAccount.name.label("account_name"),
                version_count.label("version_count"),
            )
            .join(JijiaAccount, JijiaAccount.id == raw_api_data_table.c.jijia_account_id)
            .where(raw_api_data_table.c.id == raw_data_id)
        )
        .mappings()
        .first()
    )
    if row is None:
        raise ApiError(404, "RAW_DATA_NOT_FOUND", "原始数据不存在")
    return row


def _raw_summary(mapping: Any) -> dict[str, object]:
    return {
        "id": mapping["id"],
        "jijiaAccountId": mapping["jijia_account_id"],
        "accountName": mapping.get("account_name"),
        "apiCode": mapping["api_code"],
        "sourcePrimaryKey": mapping["source_primary_key"],
        "dataDate": _date_iso(mapping["data_date"]),
        "dataHash": mapping["data_hash"],
        "batchNo": mapping["sync_batch_no"],
        "firstObservedAt": utc_iso(mapping.get("first_observed_at")),
        "lastObservedAt": utc_iso(mapping.get("last_observed_at")),
        "observationCount": mapping.get("observation_count", 0) or 0,
        "versionCount": mapping.get("version_count", 0) or 0,
        "updatedAt": utc_iso(mapping["updated_at"]),
    }


def _child_page(
    visible: Sequence[Any],
    rows: Sequence[Any],
    items: list[dict[str, object]],
    size: int,
    cursor_time_key: str = "created_at",
) -> dict[str, object]:
    next_cursor = None
    if len(rows) > size and visible:
        mapping = visible[-1]._mapping
        next_cursor = encode_cursor(mapping[cursor_time_key], mapping["id"])
    return {"items": items, "nextCursor": next_cursor}


def _audit_raw_access(
    db: Session,
    actor_id: int,
    raw: Any,
    request_id: str,
    action: str,
) -> None:
    add_audit_log(
        db,
        actor_user_id=actor_id,
        jijia_account_id=raw["jijia_account_id"],
        action=action,
        resource_type="raw_api_data",
        resource_id=raw["id"],
        request_id=request_id,
        result="success",
    )
    db.commit()


def _is_sensitive(db: Session, api_code: str) -> bool:
    item = catalog_by_code(db).get(api_code) or {}
    return bool(item.get("sensitive_response"))


def _date_iso(value: Any) -> str | None:
    return value.isoformat() if value is not None else None
