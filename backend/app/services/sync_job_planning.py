import math
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from app.sync_context import UPDATE_INCREMENTAL, closed_date_windows
from backend.app.core.errors import ApiError


@dataclass(frozen=True, kw_only=True)
class ManualPreviewRequest:
    """保存手动任务预览的日期范围输入。"""

    range_mode: str
    start_date: date | None
    end_date: date | None


@dataclass(frozen=True, kw_only=True)
class BackfillState:
    """保存一次历史回填窗口计算所需的冻结状态。"""

    window_days: int
    floor: date
    start: date
    frozen_end: date
    total_windows: int


@dataclass(frozen=True, kw_only=True)
class IncrementalHistory:
    """保存从历史回填切换到增量同步所需的水位。"""

    checkpoint: dict[str, Any]
    end: date
    window_count: int
    policy_timezone: str


@dataclass(frozen=True, kw_only=True)
class ProgressSpec:
    """保存任务进度公共字段的构造参数。"""

    completed_windows: int
    total_windows: int
    start: date
    end: date
    history_complete_through: Any
    change_catchup: str


@dataclass(frozen=True, kw_only=True)
class WindowPlan:
    """表示一个可直接冻结到同步任务的窗口计划。"""

    job_type: str
    start: date | None
    end: date | None
    progress: dict[str, Any] | None


def policy_local_date(value: datetime, policy_timezone: str) -> date:
    """把 UTC 时刻转换为策略时区的本地自然日。"""
    current = value
    if current.tzinfo is None:
        current = current.replace(tzinfo=UTC)
    return current.astimezone(ZoneInfo(policy_timezone)).date()


def incremental_target_end(
    policy_timezone: str,
    lag_days: int,
    now: datetime,
) -> date:
    """按策略时区计算并冻结增量任务的完整数据截止日。"""
    local_today = policy_local_date(now, policy_timezone)
    return local_today - timedelta(days=max(lag_days, 0))


def no_date_window_plan() -> WindowPlan:
    """返回无需日期窗口的普通同步计划。"""
    return WindowPlan(job_type="sync", start=None, end=None, progress=None)


def checkpoint_preview(plan: WindowPlan) -> dict[str, Any]:
    """把检查点窗口计划展开为手动执行预览。"""
    if plan.start is None or plan.end is None:
        return {
            "jobType": plan.job_type,
            "startDate": None,
            "endDate": None,
            "windowDays": 1,
            "windows": [(None, None)],
            "progress": plan.progress,
        }
    target_value = (plan.progress or {}).get("_frozenWindowEnd") or (plan.progress or {}).get(
        "_incrementalTargetEnd"
    )
    target_end = date.fromisoformat(str(target_value)) if target_value else plan.end
    window_days = max((plan.end - plan.start).days + 1, 1)
    return {
        "jobType": plan.job_type,
        "startDate": plan.start,
        "endDate": target_end,
        "windowDays": window_days,
        "windows": closed_date_windows(plan.start, target_end, window_days),
        "progress": plan.progress,
    }


def manual_range_preview(
    api: dict[str, Any],
    policy_timezone: str,
    request: ManualPreviewRequest,
) -> dict[str, Any]:
    """校验指定日期范围并生成连续、无重叠的闭区间。"""
    window_config = api.get("date_window") or {}
    if not window_config.get("enabled"):
        raise ApiError(409, "DATE_WINDOW_UNSUPPORTED", "该接口不支持指定数据时间范围")
    if request.start_date is None or request.end_date is None:
        raise ApiError(422, "DATE_RANGE_REQUIRED", "请同时选择开始和结束日期")

    configured_floor = date.fromisoformat(str(window_config["default_start"])[:10])
    local_today = datetime.now(ZoneInfo(policy_timezone)).date()
    latest = local_today - timedelta(days=max(int(window_config.get("lag_days") or 0), 0))
    if request.start_date < configured_floor:
        raise ApiError(
            422,
            "DATE_RANGE_BEFORE_LOWER_BOUND",
            f"开始日期不能早于 {configured_floor.isoformat()}",
        )
    if request.end_date > latest:
        raise ApiError(
            422,
            "DATE_RANGE_AFTER_AVAILABLE_DATE",
            f"结束日期不能晚于 {latest.isoformat()}",
        )
    if request.start_date > request.end_date:
        raise ApiError(422, "DATE_RANGE_INVALID", "开始日期不能晚于结束日期")

    window_days = normalized_window_days(window_config)
    windows = closed_date_windows(request.start_date, request.end_date, window_days)
    progress = _progress(
        ProgressSpec(
            completed_windows=0,
            total_windows=len(windows),
            start=windows[0][0],
            end=windows[0][1],
            history_complete_through=None,
            change_catchup="pending",
        )
    )
    return {
        "jobType": "sync",
        "startDate": request.start_date,
        "endDate": request.end_date,
        "windowDays": window_days,
        "windows": windows,
        "progress": progress,
    }


def normalized_window_days(window_config: dict[str, Any]) -> int:
    """把配置窗口天数收敛为至少一天。"""
    return max(int(window_config.get("days") or 1), 1)


def supports_incremental_window(update_window: dict[str, Any]) -> bool:
    """判断接口是否具备已验证的修改时间增量契约。"""
    return bool(
        update_window.get("enabled")
        and update_window.get("verified_doc_id")
        and update_window.get("start_field")
        and update_window.get("end_field")
    )


def backfill_state(
    window_config: dict[str, Any],
    checkpoint: dict[str, Any],
    window_days: int,
    local_today: Callable[[], date],
) -> BackfillState:
    """解析并验证历史检查点，保留原有错误顺序。"""
    configured_floor = datetime.fromisoformat(str(window_config["default_start"])).date()
    try:
        floor = datetime.fromisoformat(
            str(checkpoint.get("absolute_lower_bound") or configured_floor.isoformat())
        ).date()
        start = datetime.fromisoformat(
            str(checkpoint.get("next_window_start") or floor.isoformat())
        ).date()
    except ValueError as error:
        raise ApiError(409, "BACKFILL_CHECKPOINT_INVALID", "历史回填检查点日期无效") from error
    if floor < configured_floor or start < floor:
        raise ApiError(409, "BACKFILL_CHECKPOINT_INVALID", "历史回填检查点早于允许下限")

    frozen_value = checkpoint.get("frozen_window_end")
    if frozen_value:
        frozen_end = datetime.fromisoformat(str(frozen_value)).date()
    else:
        lag_days = max(int(window_config.get("lag_days") or 0), 0)
        frozen_end = local_today() - timedelta(days=lag_days)
    total_windows = max(math.ceil(((frozen_end - floor).days + 1) / window_days), 0)
    return BackfillState(
        window_days=window_days,
        floor=floor,
        start=start,
        frozen_end=frozen_end,
        total_windows=total_windows,
    )


def current_backfill_state(
    window_config: dict[str, Any],
    checkpoint: dict[str, Any],
    update_window: dict[str, Any],
    window_days: int,
    local_today: Callable[[], date],
) -> BackfillState:
    """历史型接口追平旧冻结范围后，为下一次运行刷新可用截止日。"""
    state = backfill_state(window_config, checkpoint, window_days, local_today)
    if state.start <= state.frozen_end or supports_incremental_window(update_window):
        return state
    refreshed_checkpoint = dict(checkpoint)
    refreshed_checkpoint.pop("frozen_window_end", None)
    return backfill_state(window_config, refreshed_checkpoint, window_days, local_today)


def backfill_window_plan(
    state: BackfillState,
    history_checkpoint: dict[str, Any],
    update_window: dict[str, Any],
    backfill_started_at: Any,
    policy_timezone: str,
) -> WindowPlan:
    """生成尚未完成的历史回填窗口和公开进度。"""
    end = min(
        state.start + timedelta(days=state.window_days - 1),
        state.frozen_end,
    )
    completed_windows = min(
        max((state.start - state.floor).days // state.window_days, 0),
        state.total_windows,
    )
    incremental_enabled = supports_incremental_window(update_window)
    progress = _progress(
        ProgressSpec(
            completed_windows=completed_windows,
            total_windows=state.total_windows,
            start=state.start,
            end=end,
            history_complete_through=history_checkpoint.get("window_end"),
            change_catchup="pending",
        )
    )
    progress.update(
        {
            "_frozenWindowEnd": state.frozen_end.isoformat(),
            "_backfillStartedAt": backfill_started_at,
            "_incrementalEnabled": incremental_enabled,
        }
    )
    if incremental_enabled:
        progress.update(
            {
                "_incrementalWindowDays": normalized_window_days(update_window),
                "_incrementalTimezone": policy_timezone,
                "_incrementalLagDays": max(int(update_window.get("lag_days") or 0), 0),
            }
        )
    return WindowPlan(
        job_type="history_backfill",
        start=state.start,
        end=end,
        progress=progress,
    )


def validate_incremental_window(update_window: dict[str, Any]) -> None:
    """确认修改时间增量契约已经由官方文档验证。"""
    if not supports_incremental_window(update_window):
        raise ApiError(409, "UPDATE_WINDOW_UNVERIFIED", "修改时间增量契约尚未确认")


def incremental_window_start(
    checkpoint: dict[str, Any],
    history_checkpoint: dict[str, Any],
    policy_timezone: str,
) -> tuple[date, Any]:
    """按增量检查点或历史启动水位解析下一个起始日。"""
    next_value = checkpoint.get("next_window_start")
    backfill_started_at = history_checkpoint.get("backfill_started_at")
    if next_value:
        start = datetime.fromisoformat(str(next_value)[:10]).date()
    elif backfill_started_at:
        started_at = datetime.fromisoformat(str(backfill_started_at).replace("Z", "+00:00"))
        start = policy_local_date(started_at, policy_timezone)
    else:
        raise ApiError(409, "BACKFILL_WATERMARK_MISSING", "历史回填缺少增量起点")
    return start, backfill_started_at


def incremental_window_plan(
    update_window: dict[str, Any],
    start: date,
    target: date,
    history: IncrementalHistory,
    backfill_started_at: Any,
) -> WindowPlan:
    """生成历史完成后的修改时间增量窗口。"""
    if start > target:
        raise ApiError(409, "INCREMENTAL_CAUGHT_UP", "修改时间增量已经追平")
    window_days = normalized_window_days(update_window)
    end = min(start + timedelta(days=window_days - 1), target)
    incremental_lag_days = max(int(update_window.get("lag_days") or 0), 0)
    progress = _progress(
        ProgressSpec(
            completed_windows=history.window_count,
            total_windows=history.window_count,
            start=start,
            end=end,
            history_complete_through=history.end.isoformat(),
            change_catchup="running",
        )
    )
    progress.update(
        {
            "_incrementalTargetEnd": target.isoformat(),
            "_backfillStartedAt": str(backfill_started_at),
            "_incrementalWindowDays": window_days,
            "_incrementalTimezone": history.policy_timezone,
            "_incrementalLagDays": incremental_lag_days,
        }
    )
    return WindowPlan(
        job_type=UPDATE_INCREMENTAL,
        start=start,
        end=end,
        progress=progress,
    )


def _progress(spec: ProgressSpec) -> dict[str, Any]:
    return {
        "completedWindows": spec.completed_windows,
        "totalWindows": spec.total_windows,
        "currentWindow": {
            "startDate": spec.start.isoformat(),
            "endDate": spec.end.isoformat(),
        },
        "currentPage": 0,
        "totalPages": 0,
        "earliestObservedDataDate": None,
        "historyCompleteThrough": spec.history_complete_through,
        "changeCatchup": spec.change_catchup,
    }
