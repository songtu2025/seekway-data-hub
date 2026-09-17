"""记录无需再次执行的逻辑任务解决状态。"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010_sync_job_resolution"
down_revision: str | None = "0009_sync_job_task_index"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """增加可空解决状态字段，不改写既有任务。"""
    with op.batch_alter_table("sync_job") as batch_op:
        batch_op.add_column(sa.Column("resolution_code", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("resolved_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    """移除解决状态字段，不改变执行状态和同步数据。"""
    with op.batch_alter_table("sync_job") as batch_op:
        batch_op.drop_column("resolved_at")
        batch_op.drop_column("resolution_code")
