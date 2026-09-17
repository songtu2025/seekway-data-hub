import { Button, Collapse, Descriptions, Progress, Tag } from "antd";
import { Link } from "react-router-dom";

import type { SyncJob } from "../api/types";
import {
  hasSyncJobAction,
  jobActionGuidance,
  type SyncJobControlAction,
} from "../pages/syncJobDetailModel";
import { changeCatchupLabel, formatDate, statusLabel } from "../pages/m3Utils";

export function SyncJobProgressSection({
  job,
  executionCount,
  runDetailState,
}: {
  job: SyncJob;
  executionCount: number;
  runDetailState: { from: string; backLabel: string };
}) {
  const progress = job.historyProgress;
  const metrics = job.progressSummary;
  const isIncremental = job.jobType === "update_incremental";
  const title =
    job.jobType === "history_backfill"
      ? "历史扫描进度"
      : job.jobType === "update_incremental"
        ? "增量同步进度"
        : "同步进度";
  const windowText = progress?.currentWindow
    ? `${progress.currentWindow.startDate} 至 ${progress.currentWindow.endDate}`
    : job.windowStart && job.windowEnd
      ? `${job.windowStart} 至 ${job.windowEnd}`
      : "当前无执行窗口";
  const currentPage = progress?.currentPage ?? metrics?.currentPage ?? 0;
  const totalPages = progress?.totalPages ?? metrics?.totalPages ?? 0;
  const pageText =
    currentPage === 0 && totalPages === 0
      ? "等待首个分页结果"
      : totalPages > 0
        ? `${currentPage} / ${totalPages}`
        : `已处理 ${currentPage} 页`;
  const fullRange =
    job.taskStart && job.taskEnd ? `${job.taskStart} 至 ${job.taskEnd}` : "系统控制";
  const batchValue =
    job.syncBatchNo && job.syncRunId != null ? (
      <Link className="m3-link" state={runDetailState} to={`/runs/${job.syncRunId}`}>
        {job.syncBatchNo}
      </Link>
    ) : (
      (job.syncBatchNo ?? "—")
    );

  return (
    <section className="m3-card job-progress-overview" aria-labelledby="sync-progress-title">
      <div className="m3-card-heading">
        <div>
          <h2 id="sync-progress-title">{title}</h2>
          <p className="muted-copy">
            {isIncremental
              ? "历史基线窗口与当前执行窗口分页分别统计。"
              : "按完整任务范围累计，执行记录共同构成此进度。"}
          </p>
        </div>
        {progress ? (
          <Tag className={`m3-status m3-status--${progress.changeCatchup}`} role="status">
            {changeCatchupLabel(progress.changeCatchup)}
          </Tag>
        ) : null}
      </div>
      {progress && progress.totalWindows > 0 ? (
        <div className="job-overall-progress">
          <Progress
            aria-label={`${isIncremental ? "历史基线" : "完整同步链路"}已完成 ${progress.completedWindows} / ${progress.totalWindows} 个窗口`}
            percent={(progress.completedWindows / progress.totalWindows) * 100}
            showInfo={false}
          />
          <strong>
            {isIncremental ? "历史基线 " : ""}
            {progress.completedWindows} / {progress.totalWindows}
          </strong>
        </div>
      ) : (
        <p className="muted-copy">尚无可计算的窗口总量，先展示已有执行计数。</p>
      )}
      <dl className="m3-progress-grid">
        <div>
          <dt>当前窗口</dt>
          <dd>{windowText}</dd>
        </div>
        <div>
          <dt>{isIncremental ? "当前窗口分页" : "当前页"}</dt>
          <dd>{pageText}</dd>
        </div>
        <div>
          <dt>HTTP 请求</dt>
          <dd>{metrics?.requestCount ?? "—"}</dd>
        </div>
        <div>
          <dt>失败接口</dt>
          <dd>{metrics?.failedApiCount ?? "—"}</dd>
        </div>
      </dl>
      <Descriptions
        className="job-basic-details"
        column={{ xs: 1, sm: 2, lg: 3 }}
        items={[
          { key: "trigger", label: "触发方式", children: triggerTypeLabel(job.triggerType) },
          { key: "range", label: "完整范围", children: fullRange },
          {
            key: "queued",
            label: "排队时间",
            children: formatDate(job.queuedAt ?? job.createdAt),
          },
          { key: "started", label: "开始时间", children: formatDate(job.startedAt) },
          { key: "finished", label: "结束时间", children: formatDate(job.finishedAt) },
        ]}
        size="small"
      />
      <Collapse
        className="job-technical-details"
        ghost
        items={[
          {
            key: "technical",
            label: "查看技术信息",
            children: (
              <Descriptions
                column={{ xs: 1, sm: 2, lg: 3 }}
                items={[
                  { key: "executions", label: "执行次数", children: `${executionCount} 次` },
                  {
                    key: "attempts",
                    label: "执行尝试",
                    children: `${job.attemptCount ?? 0} / ${job.maxAttempts ?? "—"}`,
                  },
                  {
                    key: "checkpoint",
                    label: "检查点影响",
                    children: job.advanceCheckpoint ? "成功后推进" : "不推进",
                  },
                  { key: "batch", label: "最近批次", children: batchValue },
                  {
                    key: "observed",
                    label: "最早观测数据",
                    children: progress?.earliestObservedDataDate ?? "尚未观测到业务数据",
                  },
                  {
                    key: "caught-up",
                    label: "历史已追赶至",
                    children: progress?.historyCompleteThrough ?? "尚未完成",
                  },
                ]}
                size="small"
              />
            ),
          },
        ]}
      />
    </section>
  );
}

function triggerTypeLabel(triggerType: SyncJob["triggerType"]): string {
  if (triggerType === "schedule") return "定时";
  if (triggerType === "retry") return "重试";
  return "手动";
}

interface SyncJobActionPanelProps {
  job: SyncJob;
  canOperate: boolean;
  cancelling: boolean;
  controllingAction: SyncJobControlAction | null;
  retrying: boolean;
  rawDataPath: string | null;
  onCancel: () => void;
  onControl: (action: SyncJobControlAction) => void;
  onRequestStop: () => void;
  onRetry: () => void;
  onShowDiagnostics: () => void;
}

function SyncJobRetryButton({ retrying, onRetry }: { retrying: boolean; onRetry: () => void }) {
  return (
    <Button
      aria-label={retrying ? "提交中…" : "重试任务"}
      disabled={retrying}
      loading={retrying}
      type="primary"
      onClick={onRetry}
    >
      {retrying ? "提交中…" : "重试任务"}
    </Button>
  );
}

function SyncJobFailureActionPanel({
  job,
  canRetry,
  retrying,
  rawDataPath,
  onRetry,
  onShowDiagnostics,
}: {
  job: SyncJob;
  canRetry: boolean;
  retrying: boolean;
  rawDataPath: string | null;
  onRetry: () => void;
  onShowDiagnostics: () => void;
}) {
  const recommendation =
    job.failureInfo?.recommendation ?? "查看关联运行和失败请求，确认问题恢复后再重试。";

  return (
    <section className="job-failure-action" aria-labelledby="job-failure-title">
      <div className="job-failure-action-copy">
        <h2 id="job-failure-title">任务执行失败</h2>
        <p>
          <span>{job.errorMessage ?? "任务执行未完成。"}</span>
          <span className="job-failure-action-next">{recommendation}</span>
        </p>
      </div>
      <div className="heading-actions job-failure-action-buttons">
        {job.syncRunId != null ? (
          <a
            className="action-link action-link--neutral"
            href="#job-diagnostics"
            onClick={onShowDiagnostics}
          >
            查看失败请求
          </a>
        ) : null}
        {rawDataPath ? (
          <Link className="action-link action-link--neutral" to={rawDataPath}>
            查看批次数据
          </Link>
        ) : null}
        {canRetry ? <SyncJobRetryButton retrying={retrying} onRetry={onRetry} /> : null}
      </div>
    </section>
  );
}

export function SyncJobActionPanel({
  job,
  canOperate,
  cancelling,
  controllingAction,
  retrying,
  rawDataPath,
  onCancel,
  onControl,
  onRequestStop,
  onRetry,
  onShowDiagnostics,
}: SyncJobActionPanelProps) {
  const failed = ["failed", "partial_failed"].includes(job.status);
  if (job.taskStatus !== "caught_up" && (failed || job.errorMessage)) {
    return (
      <SyncJobFailureActionPanel
        canRetry={canOperate && hasSyncJobAction(job, "retry")}
        job={job}
        rawDataPath={rawDataPath}
        retrying={retrying}
        onRetry={onRetry}
        onShowDiagnostics={onShowDiagnostics}
      />
    );
  }

  const guidance = jobActionGuidance(job);
  const controlling = controllingAction !== null;
  const guidanceDescription =
    job.status === "paused"
      ? `任务已在第 ${job.historyProgress?.currentPage ?? 0} 页安全暂停。继续执行会从当前窗口第 1 页重新开始，已写入数据会幂等更新。`
      : job.status === "pause_requested"
        ? "当前 HTTP 请求及本页数据会先安全完成，随后任务进入已暂停状态。"
        : job.stopAfterCurrent
          ? "已请求停止后续窗口；当前窗口完成后任务结束，定时计划保持不变。"
          : guidance.description;

  return (
    <section
      className={`job-next-action job-next-action--${guidance.tone}`}
      aria-labelledby="job-next-action-title"
    >
      <div className="job-next-action-copy">
        <span className="job-next-action-kicker">
          当前状态 · {job.taskStatus === "caught_up" ? "已追平" : statusLabel(job.status)}
        </span>
        <h2 id="job-next-action-title">{guidance.title}</h2>
        <p
          role={job.status === "paused" || job.status === "pause_requested" ? "status" : undefined}
        >
          {guidanceDescription}
        </p>
      </div>
      <div className="heading-actions job-next-action-buttons">
        {job.taskStatus === "caught_up" && job.syncRunId != null ? (
          <a
            className="action-link action-link--neutral"
            href="#job-diagnostics"
            onClick={onShowDiagnostics}
          >
            查看失败请求
          </a>
        ) : null}
        {job.taskStatus === "caught_up" && rawDataPath ? (
          <Link className="action-link action-link--neutral" to={rawDataPath}>
            查看批次数据
          </Link>
        ) : null}
        {canOperate && hasSyncJobAction(job, "pause") ? (
          <>
            <Button
              aria-label={controllingAction === "pause" ? "暂停中…" : "暂停任务"}
              disabled={controlling}
              loading={controllingAction === "pause"}
              type="primary"
              onClick={() => onControl("pause")}
            >
              {controllingAction === "pause" ? "暂停中…" : "暂停任务"}
            </Button>
            {hasSyncJobAction(job, "stop") ? (
              <Button disabled={controlling || job.stopAfterCurrent} onClick={onRequestStop}>
                停止后续窗口
              </Button>
            ) : null}
          </>
        ) : canOperate && hasSyncJobAction(job, "withdraw_pause") ? (
          <>
            <Button
              aria-label={controllingAction === "withdraw" ? "撤销中…" : "撤销暂停请求"}
              disabled={controlling}
              loading={controllingAction === "withdraw"}
              onClick={() => onControl("withdraw")}
            >
              {controllingAction === "withdraw" ? "撤销中…" : "撤销暂停请求"}
            </Button>
            {hasSyncJobAction(job, "stop") ? (
              <Button danger disabled={controlling} onClick={onRequestStop}>
                停止任务
              </Button>
            ) : null}
          </>
        ) : canOperate && hasSyncJobAction(job, "resume") ? (
          <>
            <Button
              aria-label={controllingAction === "resume" ? "继续执行中…" : "继续执行"}
              disabled={controlling}
              loading={controllingAction === "resume"}
              type="primary"
              onClick={() => onControl("resume")}
            >
              {controllingAction === "resume" ? "继续执行中…" : "继续执行"}
            </Button>
            <Button danger disabled={controlling} onClick={onRequestStop}>
              停止任务
            </Button>
          </>
        ) : canOperate && hasSyncJobAction(job, "cancel") ? (
          <Button
            aria-label={cancelling ? "取消中…" : "取消任务"}
            disabled={cancelling}
            loading={cancelling}
            onClick={onCancel}
          >
            {cancelling ? "取消中…" : "取消任务"}
          </Button>
        ) : canOperate && hasSyncJobAction(job, "retry") ? (
          <SyncJobRetryButton retrying={retrying} onRetry={onRetry} />
        ) : null}
      </div>
    </section>
  );
}
