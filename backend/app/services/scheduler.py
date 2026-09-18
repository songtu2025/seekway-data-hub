import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from backend.app.core.config import WebSettings
from backend.app.core.errors import ApiError
from backend.app.core.security import utc_now
from backend.app.models.account_api_policy import AccountApiPolicy, ScheduleMode
from backend.app.models.jijia_account import JijiaAccount, JijiaAccountStatus
from backend.app.services.api_policy_service import next_run_for_policy
from backend.app.services.sync_job_service import (
    ScheduledJobOutcome,
    create_scheduled_job,
)

logger = logging.getLogger(__name__)


class SyncScheduler:
    """在短事务内把到期账号策略转换为幂等队列任务。"""

    def __init__(
        self,
        session_factory: sessionmaker[Session],
        settings: WebSettings,
    ) -> None:
        self.session_factory = session_factory
        self.settings = settings

    def enqueue_due_jobs(self, now: datetime | None = None) -> int:
        """每个策略每个计划时刻至多创建一个任务，并推进下次运行时间。"""
        current = now or utc_now()
        with self.session_factory() as db:
            policy_ids = list(
                db.scalars(
                    select(AccountApiPolicy.id)
                    .join(
                        JijiaAccount,
                        JijiaAccount.id == AccountApiPolicy.jijia_account_id,
                    )
                    .where(
                        AccountApiPolicy.enabled.is_(True),
                        AccountApiPolicy.schedule_mode != ScheduleMode.MANUAL_ONLY,
                        AccountApiPolicy.next_run_at.is_not(None),
                        AccountApiPolicy.next_run_at <= current,
                        JijiaAccount.status == JijiaAccountStatus.ACTIVE,
                    )
                    .order_by(AccountApiPolicy.next_run_at, AccountApiPolicy.id)
                ).all()
            )
        return sum(self._enqueue_policy(policy_id, current) for policy_id in policy_ids)

    def _enqueue_policy(self, policy_id: int, current: datetime) -> int:
        """单独处理一个到期策略，失败时不回滚其他策略。"""
        try:
            with self.session_factory() as db:
                policy = db.scalar(
                    select(AccountApiPolicy)
                    .join(
                        JijiaAccount,
                        JijiaAccount.id == AccountApiPolicy.jijia_account_id,
                    )
                    .where(
                        AccountApiPolicy.id == policy_id,
                        AccountApiPolicy.enabled.is_(True),
                        AccountApiPolicy.schedule_mode != ScheduleMode.MANUAL_ONLY,
                        AccountApiPolicy.next_run_at.is_not(None),
                        AccountApiPolicy.next_run_at <= current,
                        JijiaAccount.status == JijiaAccountStatus.ACTIVE,
                    )
                    .with_for_update()
                )
                if policy is None or policy.next_run_at is None:
                    return 0
                scheduled_for = policy.next_run_at
                try:
                    outcome = create_scheduled_job(db, policy, scheduled_for, self.settings)
                except ApiError as error:
                    if error.code not in {"INCREMENTAL_CAUGHT_UP", "HISTORY_CAUGHT_UP"}:
                        raise
                    # 已追平是本计划槽位的成功空操作，必须推进，避免 Worker 热循环。
                    policy.next_run_at = next_run_for_policy(policy, current)
                    db.commit()
                    return 0
                if outcome == ScheduledJobOutcome.BLOCKED:
                    return 0
                # 以当前时间为基准跳过所有错过槽位，只补当前欠账一次。
                policy.next_run_at = next_run_for_policy(policy, current)
                db.commit()
                return int(outcome == ScheduledJobOutcome.CREATED)
        except ApiError as error:
            logger.warning(
                "定时策略入队失败: policy_id=%s error_code=%s",
                policy_id,
                error.code,
            )
            return 0
        except Exception as error:
            logger.error(
                "定时策略入队异常: policy_id=%s error_type=%s",
                policy_id,
                type(error).__name__,
            )
            return 0
