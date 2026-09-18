import base64
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol

from sqlalchemy import and_, or_

from backend.app.core.errors import ApiError

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 100


@dataclass(frozen=True)
class CompositeCursor:
    """保存列表稳定翻页所需的 UTC 创建时间和主键。"""

    created_at: datetime
    record_id: int


class CursorBoundary(Protocol):
    """定义降序复合游标生成 SQL 所需的最小字段。"""

    @property
    def created_at(self) -> datetime: ...

    @property
    def record_id(self) -> int: ...


def utc_iso(value: datetime | str | None) -> str | None:
    """把数据库中的 UTC DATETIME 明确序列化为带 Z 的字符串。"""
    if value is None:
        return None
    if isinstance(value, str):
        # MySQL 聚合函数可能绕过 DateTime 结果处理器并返回 ISO 字符串。
        value = datetime.fromisoformat(value)
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    else:
        value = value.astimezone(UTC)
    return value.isoformat().replace("+00:00", "Z")


def json_object(value: Any) -> dict[str, Any]:
    """兼容 MySQL JSON 字符串和 SQLAlchemy 已解码字典。"""
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, bytes):
        value = value.decode("utf-8")
    if not isinstance(value, str) or not value:
        return {}
    try:
        decoded = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return decoded if isinstance(decoded, dict) else {}


def json_value(value: Any) -> Any:
    """保留原始 JSON 的对象或数组形态，解析失败时不回显驱动字符串。"""
    if isinstance(value, (dict, list, int, float, bool)) or value is None:
        return value
    if isinstance(value, bytes):
        value = value.decode("utf-8")
    if not isinstance(value, str):
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return None


def encode_cursor(created_at: datetime, record_id: int) -> str:
    return encode_cursor_payload([utc_iso(created_at), record_id])


def decode_cursor(value: str | None) -> CompositeCursor | None:
    if not value:
        return None
    try:
        decoded = decode_cursor_payload(value)
        created_at = cursor_datetime(decoded[0])
        record_id = int(decoded[1])
    except (ValueError, TypeError, IndexError, json.JSONDecodeError) as error:
        raise ApiError(422, "CURSOR_INVALID", "分页游标无效") from error
    return CompositeCursor(created_at=created_at, record_id=record_id)


def encode_cursor_payload(values: list[Any]) -> str:
    payload = json.dumps(values, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def decode_cursor_payload(value: str) -> list[Any]:
    try:
        padded = value + "=" * (-len(value) % 4)
        decoded = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
    except (ValueError, TypeError, json.JSONDecodeError) as error:
        raise ApiError(422, "CURSOR_INVALID", "分页游标无效") from error
    if not isinstance(decoded, list):
        raise ApiError(422, "CURSOR_INVALID", "分页游标无效")
    return decoded


def cursor_datetime(value: Any) -> datetime:
    created_at = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if created_at.tzinfo is not None:
        created_at = created_at.astimezone(UTC).replace(tzinfo=None)
    return created_at


def cursor_before(
    created_column: Any,
    id_column: Any,
    cursor: CursorBoundary,
) -> Any:
    """生成 `(created_at, id)` 降序列表的下一页边界。"""
    return or_(
        created_column < cursor.created_at,
        and_(created_column == cursor.created_at, id_column < cursor.record_id),
    )


def page_size(limit: int) -> int:
    return min(max(limit, 1), MAX_PAGE_SIZE)


HISTORY_PROGRESS_KEYS = (
    "completedWindows",
    "totalWindows",
    "currentWindow",
    "currentPage",
    "totalPages",
    "earliestObservedDataDate",
    "historyCompleteThrough",
    "changeCatchup",
)


def public_history_progress(value: Any) -> dict[str, Any] | None:
    """只返回前端冻结的进度字段，隐藏 Worker 内部水位。"""
    progress = json_object(value)
    if not progress:
        return None
    defaults: dict[str, Any] = {
        "completedWindows": 0,
        "totalWindows": 0,
        "currentWindow": None,
        "currentPage": 0,
        "totalPages": 0,
        "earliestObservedDataDate": None,
        "historyCompleteThrough": None,
        "changeCatchup": "pending",
    }
    return {key: progress.get(key, defaults[key]) for key in HISTORY_PROGRESS_KEYS}
