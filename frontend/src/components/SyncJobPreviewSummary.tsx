import { Alert, Button } from "antd";
import { Link } from "react-router-dom";
import { formatDate, statusLabel } from "../pages/m3Utils";
import type { SyncJobPreview } from "../api/types";

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PreviewWindows({ preview }: { preview: SyncJobPreview }) {
  const lastWindow = preview.windows[preview.windows.length - 1];
  return (
    <details className="job-preview">
      <summary>查看窗口明细（共 {preview.windowCount} 个）</summary>
      <ol>
        {preview.windows.slice(0, 3).map((window) => (
          <li key={window.index}>
            窗口 {window.index}：{windowLabel(window)}
          </li>
        ))}
        {preview.windows.length > 4 ? (
          <li className="job-preview-gap">… 中间 {preview.windows.length - 4} 个窗口</li>
        ) : null}
        {preview.windows.length > 3 && lastWindow ? (
          <li key={lastWindow.index}>
            窗口 {lastWindow.index}：{windowLabel(lastWindow)}
          </li>
        ) : null}
      </ol>
      {preview.windows.length > 4 ? (
        <details>
          <summary>查看全部 {preview.windowCount} 个窗口</summary>
          <ol className="job-preview-all">
            {preview.windows.map((window) => (
              <li key={window.index}>
                窗口 {window.index}：{windowLabel(window)}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </details>
  );
}

function windowLabel(window: SyncJobPreview["windows"][number]): string {
  return window.startDate && window.endDate
    ? `${window.startDate} 至 ${window.endDate}`
    : "完整接口数据";
}

function executionReadinessLabel(preview: SyncJobPreview): string {
  const readiness = preview.executionReadiness;
  if (!readiness) return "创建后进入后台队列";
  if (readiness.workerAvailability === "offline") {
    return `执行服务离线；任务会保留在队列中（当前 ${readiness.queueDepth} 个）`;
  }
  if (readiness.workerAvailability === "busy") {
    return `执行服务忙碌；当前队列 ${readiness.queueDepth} 个任务`;
  }
  return readiness.queueDepth > 0
    ? `执行服务在线；当前队列 ${readiness.queueDepth} 个任务`
    : "执行服务在线，创建后等待领取";
}

export function JobReview({
  preview,
  accountName,
  apiName,
  rangeMode,
  busy,
  formError,
  headingRef,
  errorRef,
  returnNavigation,
  onReturnToConfig,
  onCreate,
  taskReturnState,
}: {
  preview: SyncJobPreview;
  accountName: string;
  apiName: string;
  rangeMode: "checkpoint" | "custom";
  busy: boolean;
  formError: string;
  headingRef: { readonly current: HTMLHeadingElement | null };
  errorRef: { readonly current: HTMLDivElement | null };
  returnNavigation: { path: string; label: string; state?: unknown };
  onReturnToConfig: (targetId: string) => void;
  onCreate: () => Promise<void>;
  taskReturnState: unknown;
}) {
  return (
    <section className="job-review-card" aria-labelledby="job-review-heading">
      <header>
        <span>执行计划已生成</span>
        <h2 id="job-review-heading" ref={headingRef} tabIndex={-1}>
          检查并创建
        </h2>
        <p>创建后任务进入后台队列。</p>
      </header>
      <dl className="job-review-summary">
        <ReviewItem label="积加账号" value={accountName} />
        <ReviewItem label="已启用接口" value={apiName} />
        <ReviewItem
          label="同步方式"
          value={
            preview.supportsDateWindow
              ? rangeMode === "checkpoint"
                ? "补齐历史至今"
                : "重跑指定日期"
              : "同步当前完整结果"
          }
        />
        {preview.supportsDateWindow ? (
          <>
            <ReviewItem label="实际起点" value={preview.startDate ?? "服务端未返回"} />
            <ReviewItem
              label={rangeMode === "checkpoint" ? "最新完整数据日" : "实际终点"}
              value={preview.endDate ?? "服务端未返回"}
            />
            <ReviewItem label="窗口大小" value={`${preview.windowDays} 天 / 窗口`} />
            <ReviewItem label="执行窗口" value={`${preview.windowCount} 个`} />
            <ReviewItem
              label="当前检查点"
              value={
                preview.checkpoint?.completeThrough
                  ? `已完成至 ${preview.checkpoint.completeThrough}`
                  : preview.checkpoint?.nextWindowStart
                    ? `将从 ${preview.checkpoint.nextWindowStart} 开始`
                    : "尚未建立"
              }
            />
          </>
        ) : (
          <ReviewItem label="数据范围" value="当前可返回的完整结果" />
        )}
        <ReviewItem
          label="最近成功"
          value={
            preview.recentSuccessfulRunAt
              ? formatDate(preview.recentSuccessfulRunAt)
              : "尚无成功记录"
          }
        />
        <ReviewItem label="启动条件" value={executionReadinessLabel(preview)} />
        {preview.supportsDateWindow ? (
          <ReviewItem
            label="检查点影响"
            value={
              preview.checkpoint?.advancesOnSuccess ? "任务成功后推进主检查点" : "不推进主检查点"
            }
          />
        ) : null}
        <ReviewItem
          label="店铺范围"
          value={
            preview.scopeMode === "selected"
              ? `已选择 ${preview.selectedMarketIds.length} 个店铺站点`
              : "该接口将同步此账号可访问的全部店铺"
          }
        />
      </dl>
      <p className="job-scope-technical">技术说明：{preview.scopeMessage}</p>
      <div className="job-review-modify" aria-label="修改任务配置">
        <Button
          className="text-button"
          type="text"
          onClick={() => onReturnToConfig("sync-account-id")}
        >
          修改同步目标
        </Button>
        <Button
          className="text-button"
          type="text"
          onClick={() =>
            onReturnToConfig(rangeMode === "custom" ? "sync-start-date" : "sync-range-heading")
          }
        >
          修改数据范围
        </Button>
        <Button
          className="text-button"
          type="text"
          onClick={() => onReturnToConfig("sync-market-scope-all")}
        >
          修改店铺范围
        </Button>
      </div>
      {preview.activeTask ? (
        <section className="job-conflict" aria-label="活动任务冲突">
          <strong>该账号与接口已有{statusLabel(preview.activeTask.status)}任务</strong>
          <p>请先处理活动任务，再创建新的同步任务，避免重复排队。</p>
          <Link
            className="action-link action-link--neutral"
            to={`/jobs/${preview.activeTask.id}`}
            state={taskReturnState}
          >
            查看活动任务 {preview.activeTask.taskNo}
          </Link>
        </section>
      ) : null}
      {preview.supportsDateWindow ? <PreviewWindows preview={preview} /> : null}
      <ErrorSummary entries={[]} formError={formError} summaryRef={errorRef} />
      <footer className="job-create-actions job-review-actions">
        <Link
          className="action-link action-link--neutral"
          to={returnNavigation.path}
          state={returnNavigation.state}
        >
          取消
        </Link>
        <Button
          disabled={busy || Boolean(preview.activeTask)}
          loading={busy}
          type="primary"
          onClick={() => void onCreate()}
        >
          {busy ? "正在加入队列…" : preview.activeTask ? "请先处理活动任务" : "创建并加入队列"}
        </Button>
      </footer>
    </section>
  );
}

export function ErrorSummary({
  entries,
  formError,
  summaryRef,
}: {
  entries: [string, string | undefined][];
  formError: string;
  summaryRef: { readonly current: HTMLDivElement | null };
}) {
  if (!formError && entries.length === 0) return null;
  const targetIds: Record<string, string> = {
    accountId: "sync-account-id",
    apiCode: "sync-api-code",
    startDate: "sync-start-date",
    endDate: "sync-end-date",
    marketIds: "sync-market-scope-all",
  };
  return (
    <div ref={summaryRef} tabIndex={-1}>
      <Alert
        className="form-alert job-error-summary"
        description={
          entries.length > 0 ? (
            <ul>
              {entries.map(([field, message]) => (
                <li key={field}>
                  <a href={`#${targetIds[field]}`}>{message}</a>
                </li>
              ))}
            </ul>
          ) : undefined
        }
        showIcon
        title={formError || "请检查任务配置"}
        type="error"
      />
    </div>
  );
}

export function CompactSummary({
  apiName,
  range,
  storeScope,
}: {
  apiName: string;
  range: string;
  storeScope: string;
}) {
  return (
    <dl className="job-create-compact-summary" aria-label="当前任务配置">
      <div>
        <dt>接口</dt>
        <dd>{apiName}</dd>
      </div>
      <div>
        <dt>范围</dt>
        <dd>{range}</dd>
      </div>
      <div>
        <dt>店铺</dt>
        <dd>{storeScope}</dd>
      </div>
    </dl>
  );
}
