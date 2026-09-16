"""允许安全取消尚未开始的同步任务。"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from backend.migrations.compat import supports_named_check_constraints

revision: str = "0004_sync_job_cancelled"
down_revision: str | None = "0003_sync_job_and_audit"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD_STATUS_CHECK = "status IN ('queued', 'running', 'success', 'partial_failed', 'failed')"
NEW_STATUS_CHECK = (
    "status IN ('queued', 'running', 'success', 'partial_failed', 'failed', 'cancelled')"
)


def upgrade() -> None:
    """只扩展任务状态约束，不修改现有任务数据。"""
    if not supports_named_check_constraints(op.get_bind()):
        return
    with op.batch_alter_table("sync_job") as batch_op:
        batch_op.drop_constraint("ck_sync_job_status", type_="check")
        batch_op.create_check_constraint("ck_sync_job_status", NEW_STATUS_CHECK)


def downgrade() -> None:
    """存在已取消任务时拒绝收窄约束，避免静默破坏证据。"""
    connection = op.get_bind()
    cancelled_exists = connection.execute(
        sa.text("SELECT 1 FROM sync_job WHERE status = 'cancelled' LIMIT 1")
    ).scalar_one_or_none()
    if cancelled_exists is not None:
        raise RuntimeError("0004 downgrade blocked: cancelled sync jobs exist")
    if not supports_named_check_constraints(connection):
        return
    with op.batch_alter_table("sync_job") as batch_op:
        batch_op.drop_constraint("ck_sync_job_status", type_="check")
        batch_op.create_check_constraint("ck_sync_job_status", OLD_STATUS_CHECK)
