"""增加逻辑任务范围和安全暂停控制字段。"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from backend.migrations.compat import supports_named_check_constraints

revision: str = "0005_sync_job_control"
down_revision: str | None = "0004_sync_job_cancelled"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NEW_STATUS_CHECK = (
    "status IN ('queued', 'running', 'pause_requested', 'paused', "
    "'success', 'partial_failed', 'failed', 'cancelled', 'stopped')"
)
OLD_STATUS_CHECK = (
    "status IN ('queued', 'running', 'success', 'partial_failed', 'failed', 'cancelled')"
)


def upgrade() -> None:
    """扩展 Web 控制表，不修改既有同步业务表。"""
    supports_check_constraints = supports_named_check_constraints(op.get_bind())
    with op.batch_alter_table("sync_job") as batch_op:
        batch_op.add_column(sa.Column("task_no", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("task_start", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("task_end", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("range_mode", sa.String(length=16), nullable=True))
        batch_op.add_column(
            sa.Column("window_index", sa.Integer(), nullable=False, server_default="1")
        )
        batch_op.add_column(
            sa.Column("total_windows", sa.Integer(), nullable=False, server_default="1")
        )
        batch_op.add_column(
            sa.Column("advance_checkpoint", sa.Boolean(), nullable=False, server_default=sa.true())
        )
        batch_op.add_column(
            sa.Column("stop_after_current", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch_op.add_column(sa.Column("pause_requested_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("paused_at", sa.DateTime(), nullable=True))
        if supports_check_constraints:
            batch_op.drop_constraint("ck_sync_job_status", type_="check")
            batch_op.create_check_constraint("ck_sync_job_status", NEW_STATUS_CHECK)
    op.create_index("idx_sync_job_task_no", "sync_job", ["task_no", "id"])


def downgrade() -> None:
    """存在新控制证据时拒绝降级；未使用时允许回退代码。"""
    connection = op.get_bind()
    evidence_exists = connection.execute(
        sa.text(
            """
            SELECT 1 FROM sync_job
            WHERE task_no IS NOT NULL
               OR range_mode = 'custom'
               OR status IN ('pause_requested', 'paused', 'stopped')
               OR stop_after_current = 1
               OR pause_requested_at IS NOT NULL
               OR paused_at IS NOT NULL
            LIMIT 1
            """
        )
    ).scalar_one_or_none()
    if evidence_exists is not None:
        raise RuntimeError("0005 downgrade blocked: sync job control evidence exists")
    supports_check_constraints = supports_named_check_constraints(connection)
    op.drop_index("idx_sync_job_task_no", table_name="sync_job")
    with op.batch_alter_table("sync_job") as batch_op:
        if supports_check_constraints:
            batch_op.drop_constraint("ck_sync_job_status", type_="check")
            batch_op.create_check_constraint("ck_sync_job_status", OLD_STATUS_CHECK)
        batch_op.drop_column("paused_at")
        batch_op.drop_column("pause_requested_at")
        batch_op.drop_column("stop_after_current")
        batch_op.drop_column("advance_checkpoint")
        batch_op.drop_column("total_windows")
        batch_op.drop_column("window_index")
        batch_op.drop_column("range_mode")
        batch_op.drop_column("task_end")
        batch_op.drop_column("task_start")
        batch_op.drop_column("task_no")
