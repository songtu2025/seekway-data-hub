import { Pagination, Progress } from "antd";

import type { SyncJob, SyncJobLifecycleEvent } from "../api/types";
import { formatDate, statusLabel } from "../pages/m3Utils";
import { taskWindowProgress } from "../pages/syncJobStatus";

export function SyncJobProgressSummary({ job }: { job: SyncJob }) {
  const windowProgress = taskWindowProgress(job);
  const label = windowProgress
    ? `${windowProgress.completed} / ${windowProgress.total}`
    : "未记录窗口进度";
  return (
    <div className="job-table-progress">
      {windowProgress ? (
        <Progress
          aria-label={label}
          percent={Math.round((windowProgress.completed / windowProgress.total) * 100)}
          showInfo={false}
          size="small"
        />
      ) : null}
      <small>{label}</small>
    </div>
  );
}

export function SyncJobLifecycle({
  events,
  currentPage,
  pageSize,
  total,
  onPageChange,
}: {
  events: SyncJobLifecycleEvent[];
  currentPage: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <section className="job-lifecycle" aria-labelledby="job-lifecycle-title">
      <div className="job-lifecycle-heading">
        <h2 id="job-lifecycle-title">任务生命周期</h2>
        <span>共 {total} 条事件</span>
      </div>
      <ol>
        {events.map((event) => (
          <li key={event.id}>
            <strong>{lifecycleEventLabel(event.eventType, event.status)}</strong>
            <span>{formatDate(event.occurredAt)}</span>
            <small>
              执行 #{event.executionId} ·{" "}
              {event.actorName ? `操作人：${event.actorName}` : "系统记录"}
            </small>
          </li>
        ))}
      </ol>
      {total > pageSize ? (
        <nav aria-label="任务生命周期分页">
          <Pagination
            className="job-lifecycle-pagination"
            current={currentPage}
            pageSize={pageSize}
            showSizeChanger={false}
            size="small"
            total={total}
            onChange={onPageChange}
          />
        </nav>
      ) : null}
    </section>
  );
}

function lifecycleEventLabel(
  eventType: SyncJobLifecycleEvent["eventType"],
  status: SyncJob["status"] | null,
): string {
  const labels = {
    created: "任务已创建",
    retried: "已创建重试执行",
    resumed: "已创建恢复执行",
    started: "执行服务已领取",
    pause_requested: "已请求安全暂停",
    pause_withdrawn: "已撤销暂停请求",
    paused: "已在安全边界暂停",
    stop_requested: "已请求停止后续窗口",
    cancelled: "已取消排队任务",
    resolved: "数据范围已由后续同步覆盖",
    dismissed: "已忽略失败提醒",
    attention_restored: "已恢复关注",
    finished: status ? `执行结束：${statusLabel(status)}` : "执行结束",
  };
  return labels[eventType];
}
