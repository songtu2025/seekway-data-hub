import type { SyncJob, SyncJobAction } from "../api/types";

export type SyncJobControlAction = "pause" | "withdraw" | "resume" | "stop";

export interface JobActionGuidance {
  title: string;
  description: string;
  tone: "active" | "attention" | "success" | "neutral";
}

export function hasSyncJobAction(job: SyncJob, action: SyncJobAction): boolean {
  return job.availableActions?.includes(action) ?? false;
}

function queueReasonMessage(
  reasonCode: NonNullable<SyncJob["queueInfo"]>["reasonCode"],
  queuedAhead: number,
): string {
  if (reasonCode === "WORKER_OFFLINE") {
    return "任务执行服务离线。任务会保留在队列中，服务恢复后自动执行。";
  }
  if (reasonCode === "WORKER_BUSY") {
    return `执行服务正在处理其他任务，前方还有 ${queuedAhead} 个可执行任务。`;
  }
  if (reasonCode === "RETRY_BACKOFF") return "任务正在等待重试时间，到期后会被自动领取。";
  if (reasonCode === "ATTEMPTS_EXHAUSTED") {
    return "任务已达到最大尝试次数，需要人工检查失败原因。";
  }
  return queuedAhead > 0
    ? `任务正常排队，前方还有 ${queuedAhead} 个可执行任务。`
    : "任务正常排队，等待执行服务领取。";
}

export function jobActionGuidance(job: SyncJob): JobActionGuidance {
  if (job.taskStatus === "dismissed") {
    return {
      title: "此失败提醒已忽略",
      description: "原失败执行和诊断证据仍保留；需要再次处理时，可恢复关注。",
      tone: "neutral",
    };
  }
  if (job.taskStatus === "caught_up") {
    return {
      title: "当前数据已追平",
      description: "无需再次同步；原失败执行记录仍保留，可继续查看诊断和批次数据。",
      tone: "success",
    };
  }
  if (job.status === "queued") {
    return {
      title: "等待执行服务领取",
      description: job.queueInfo
        ? queueReasonMessage(job.queueInfo.reasonCode, job.queueInfo.queuedAhead)
        : "任务已进入队列，无需停留在页面等待。",
      tone: "active",
    };
  }
  if (job.status === "running") {
    return {
      title: "任务正在执行",
      description: "可继续观察链路进度；需要中断时，可安全暂停或停止后续窗口。",
      tone: "active",
    };
  }
  if (job.status === "pause_requested") {
    return {
      title: "等待当前页安全完成",
      description: "完成本页写入后任务会暂停；如需继续，可撤销暂停请求。",
      tone: "active",
    };
  }
  if (job.status === "paused") {
    return {
      title: "决定继续还是停止",
      description: "继续会从当前窗口重新执行并幂等更新；停止则不再处理后续窗口。",
      tone: "attention",
    };
  }
  if (["failed", "partial_failed"].includes(job.status)) {
    return {
      title: "先定位失败原因，再决定重试",
      description: "查看关联运行和失败请求，确认配置或外部服务恢复后再重试。",
      tone: "attention",
    };
  }
  if (job.status === "success") {
    return {
      title: "本次任务已完成",
      description: "可查看运行记录和批次数据，核对本次同步结果。",
      tone: "success",
    };
  }
  return {
    title: "任务已结束",
    description: "当前任务不会继续执行，可返回任务列表发起或查看其他任务。",
    tone: "neutral",
  };
}
