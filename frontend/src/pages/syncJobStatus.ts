import type { SyncJob, SyncTaskStatus } from "../api/types";

const activeStatuses = new Set(["queued", "running", "pause_requested"]);

const taskStatusLabels: Record<SyncTaskStatus, string> = {
  in_progress: "进行中",
  pausing: "暂停处理中",
  paused: "已暂停",
  attention: "需处理",
  success: "已完成",
  caught_up: "已追平",
  terminated: "已终止",
  dismissed: "已忽略提醒",
};

export function isJobActive(status: string): boolean {
  return activeStatuses.has(status);
}

export function getTaskStatus(job: SyncJob): SyncTaskStatus {
  if (job.taskStatus) return job.taskStatus;
  if (job.resolutionCode === "operator_dismissed") return "dismissed";
  if (job.resolutionCode === "incremental_caught_up") return "caught_up";
  if (["queued", "running"].includes(job.status)) return "in_progress";
  if (job.status === "pause_requested") return "pausing";
  if (job.status === "paused") return "paused";
  if (["failed", "partial_failed"].includes(job.status)) return "attention";
  if (["cancelled", "stopped"].includes(job.status)) return "terminated";

  const completedWindows = job.completedWindows ?? job.historyProgress?.completedWindows;
  const totalWindows = job.totalWindows ?? job.historyProgress?.totalWindows;
  if (job.status === "success" && completedWindows != null && totalWindows != null) {
    return completedWindows < totalWindows ? "in_progress" : "success";
  }
  return "success";
}

export function isTaskActive(status: SyncTaskStatus): boolean {
  return status === "in_progress" || status === "pausing";
}

export function taskStatusLabel(status: SyncTaskStatus): string {
  return taskStatusLabels[status];
}

export function taskWindowProgress(job: SyncJob): { completed: number; total: number } | null {
  const completed = job.completedWindows ?? job.historyProgress?.completedWindows;
  const total = job.totalWindows ?? job.historyProgress?.totalWindows;
  if (completed == null || total == null || total <= 0) return null;
  return { completed, total };
}

export function executionStageLabel(job: SyncJob): string {
  if (getTaskStatus(job) === "dismissed") {
    return "原执行失败，当前不再提醒";
  }
  if (getTaskStatus(job) === "caught_up") {
    return "原执行失败，数据范围已由后续同步覆盖";
  }
  const status = job.executionStatus ?? job.status;
  const progress = taskWindowProgress(job);
  const currentWindow = progress ? Math.min(progress.completed + 1, progress.total) : null;
  const windowSuffix = currentWindow == null ? "" : `第 ${currentWindow} 个窗口`;

  if (status === "queued") {
    if (job.queueInfo?.reasonCode === "WORKER_OFFLINE") return "执行服务离线";
    if (job.queueInfo?.reasonCode === "RETRY_BACKOFF") return "等待重试时间";
    if (job.queueInfo?.reasonCode === "ATTEMPTS_EXHAUSTED") return "尝试次数已用尽";
    const queuePrefix = job.queueInfo?.queuedAhead
      ? `前方 ${job.queueInfo.queuedAhead} 个任务，`
      : "";
    return `${queuePrefix}等待领取${windowSuffix}`;
  }
  if (status === "running") return windowSuffix ? `正在执行${windowSuffix}` : "正在执行";
  if (status === "pause_requested") return "将在安全边界暂停";
  if (status === "paused") return windowSuffix ? `已在${windowSuffix}安全暂停` : "已安全暂停";
  if (["failed", "partial_failed"].includes(status)) {
    return windowSuffix ? `${windowSuffix}执行失败` : "当前执行失败";
  }
  if (status === "success" && getTaskStatus(job) === "in_progress") {
    return windowSuffix ? `正在安排${windowSuffix}` : "正在安排下一窗口";
  }
  if (status === "success") return "全部窗口已完成";
  if (status === "cancelled") return "已取消等待执行";
  return "已停止后续窗口";
}

export function syncJobDetailPath(job: Pick<SyncJob, "id" | "taskNo">): string {
  return job.taskNo
    ? `/jobs/tasks/${encodeURIComponent(job.taskNo)}`
    : `/jobs/${encodeURIComponent(String(job.id))}`;
}
