import { Alert, Badge, Button, Spin } from "antd";

import { Link } from "react-router-dom";
import type { WorkerRuntime } from "../api/types";
import { useWorkerRuntime } from "../hooks/useWorkerRuntime";
import { formatDate, getApiErrorMessage } from "../pages/m3Utils";

const labels: Record<WorkerRuntime["availability"], string> = {
  online: "执行服务在线",
  busy: "执行服务忙碌",
  offline: "执行服务离线",
};

const capacityLabels: Record<WorkerRuntime["capacityStatus"], string> = {
  ready: "容量正常",
  degraded: "容量降级",
  offline: "容量离线",
};

export function WorkerStatusPanel({
  compact = false,
  currentExecutionId,
}: {
  compact?: boolean;
  currentExecutionId?: number | string | null;
}) {
  const { checking, error, reloadStatus, runtime } = useWorkerRuntime();
  const errorMessage = error ? getApiErrorMessage(error, "执行服务状态暂时无法获取") : "";

  if (errorMessage && runtime === null) {
    return (
      <section id="worker-status">
        <Alert
          aria-live="polite"
          title={errorMessage}
          type="error"
          action={
            <Button
              aria-label={checking ? "正在刷新状态" : "刷新状态"}
              disabled={checking}
              loading={checking}
              onClick={reloadStatus}
            >
              刷新状态
            </Button>
          }
        />
      </section>
    );
  }
  if (runtime === null) {
    return (
      <section
        id="worker-status"
        className={`worker-status worker-status--unknown${compact ? " worker-status--compact" : ""}`}
        aria-live="polite"
      >
        <Spin size="small" /> 正在检查任务执行服务…
      </section>
    );
  }

  const workerIsHandlingCurrentExecution =
    runtime.currentJobId != null &&
    currentExecutionId != null &&
    String(runtime.currentJobId) === String(currentExecutionId);
  const capacityDegraded = runtime.capacityStatus === "degraded";
  const capacitySummary = `配置 ${runtime.configuredWorkerCount}、在线 ${runtime.onlineWorkerCount}、忙碌 ${runtime.busyWorkerCount}、空闲 ${runtime.idleWorkerCount}、失联 ${runtime.staleWorkerCount}、排队 ${runtime.queueDepth}`;
  const compactTitle =
    runtime.availability === "busy"
      ? workerIsHandlingCurrentExecution
        ? "执行服务正在处理本任务"
        : "执行服务正在处理其他任务"
      : labels[runtime.availability];
  const compactDescription =
    runtime.availability === "offline"
      ? "任务会留在队列中，服务恢复后自动执行。"
      : runtime.availability === "busy"
        ? workerIsHandlingCurrentExecution
          ? "当前任务正在正常执行。"
          : `当前任务正在等待，正在处理任务 ${runtime.currentJobId ?? "—"}。`
        : "可以领取新的排队任务。";
  const compactCapacityDescription = `${capacityLabels[runtime.capacityStatus]}；${capacitySummary}。`;

  if (compact) {
    return (
      <section
        id="worker-status"
        className={`worker-status worker-status--compact worker-status--${capacityDegraded ? "degraded" : runtime.availability}`}
        aria-label="任务执行服务状态"
      >
        <div>
          <Badge
            status={
              runtime.availability === "offline"
                ? "error"
                : capacityDegraded
                  ? "warning"
                  : runtime.availability === "busy"
                    ? "processing"
                    : "success"
            }
            text={<strong>{compactTitle}</strong>}
          />
          <span>{compactDescription}</span>
          <span>{compactCapacityDescription}</span>
        </div>
        {errorMessage ? (
          <span className="worker-status-refresh-error">状态刷新失败，当前为上次结果。</span>
        ) : null}
        <div className="worker-status-compact-actions">
          <span>最近心跳 {formatDate(runtime.heartbeatAt)}</span>
          <Button
            aria-label={checking ? "正在刷新状态" : "刷新状态"}
            disabled={checking}
            loading={checking}
            size="small"
            onClick={reloadStatus}
          >
            刷新状态
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section
      id="worker-status"
      className={`worker-status worker-status--${capacityDegraded ? "degraded" : runtime.availability}`}
      aria-label="任务执行服务状态"
    >
      <div>
        <Badge
          status={
            runtime.availability === "offline"
              ? "error"
              : capacityDegraded
                ? "warning"
                : runtime.availability === "busy"
                  ? "processing"
                  : "success"
          }
          text={<strong>{capacityDegraded ? "执行容量降级" : labels[runtime.availability]}</strong>}
        />
        <span>
          {runtime.availability === "offline"
            ? "任务将继续排队，服务恢复后自动执行；请联系运维处理。"
            : capacityDegraded
              ? "在线 Worker 少于配置数量，任务仍会继续处理；请联系运维检查。"
              : runtime.availability === "busy"
                ? `正在执行任务 ${runtime.currentJobId ?? "—"}`
                : "可以自动领取新的排队任务。"}
        </span>
      </div>
      {errorMessage ? (
        <Alert aria-live="polite" type="warning" title="状态刷新失败，以下为上次成功读取的结果。" />
      ) : null}
      <dl>
        <div>
          <dt>容量状态</dt>
          <dd>{capacityLabels[runtime.capacityStatus]}</dd>
        </div>
        <div>
          <dt>配置 Worker</dt>
          <dd>{runtime.configuredWorkerCount}</dd>
        </div>
        <div>
          <dt>在线 Worker</dt>
          <dd>{runtime.onlineWorkerCount}</dd>
        </div>
        <div>
          <dt>忙碌 Worker</dt>
          <dd>{runtime.busyWorkerCount}</dd>
        </div>
        <div>
          <dt>空闲 Worker</dt>
          <dd>{runtime.idleWorkerCount}</dd>
        </div>
        <div>
          <dt>失联 Worker</dt>
          <dd>{runtime.staleWorkerCount}</dd>
        </div>
        <div>
          <dt>排队任务</dt>
          <dd>{runtime.queueDepth}</dd>
        </div>
        <div>
          <dt>最近心跳</dt>
          <dd>{formatDate(runtime.heartbeatAt)}</dd>
        </div>
        {runtime.oldestQueuedAt ? (
          <div>
            <dt>最早排队</dt>
            <dd>{formatDate(runtime.oldestQueuedAt)}</dd>
          </div>
        ) : null}
        {runtime.availability !== "offline" ? (
          <div>
            <dt>离线判定阈值</dt>
            <dd>{runtime.offlineAfterSeconds} 秒</dd>
          </div>
        ) : null}
        {runtime.currentJobId ? (
          <div>
            <dt>当前任务</dt>
            <dd>
              <Link
                to={`/jobs/${runtime.currentJobId}`}
                state={{ from: "/jobs#worker-status", backLabel: "返回执行服务状态" }}
              >
                查看任务 {runtime.currentJobId}
              </Link>
            </dd>
          </div>
        ) : null}
      </dl>
      <Button
        aria-label={checking ? "正在刷新状态" : "刷新状态"}
        disabled={checking}
        loading={checking}
        onClick={reloadStatus}
      >
        刷新状态
      </Button>
    </section>
  );
}
