import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Spin, Tag } from "antd";
import { Link, useLocation } from "react-router-dom";

import { api } from "../api/client";
import type { ApiCatalogItem, JijiaAccount, SyncJob, WorkerRuntime } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { RefreshStatus } from "./RefreshStatus";
import { useVisiblePolling } from "../hooks/useVisiblePolling";
import { useWorkerRuntime } from "../hooks/useWorkerRuntime";
import { formatDate, getApiErrorMessage, statusLabel } from "../pages/m3Utils";

const ACTIVE_JOB_STATUSES = new Set(["queued", "running", "pause_requested"]);
const JOB_POLL_INTERVAL_MS = 5000;
const STATUS_POLL_INTERVAL_MS = 15000;

interface DataSyncPanelProps {
  apiCode: string;
  displayName: string;
  accounts: JijiaAccount[];
  selectedAccountId: string;
  loadedCount: number;
  onSynced: () => void;
  preservePageOnSync?: boolean;
}

export function DataSyncPanel({
  apiCode,
  displayName,
  accounts,
  selectedAccountId,
  loadedCount,
  onSynced,
  preservePageOnSync = false,
}: DataSyncPanelProps) {
  const location = useLocation();
  const sourceState = {
    from: `${location.pathname}${location.search}`,
    backLabel: "返回业务数据",
    returnState: location.state,
  };
  const { csrfToken, user } = useAuth();
  const { runtime } = useWorkerRuntime();
  const [catalogItem, setCatalogItem] = useState<ApiCatalogItem | null>(null);
  const [latestJob, setLatestJob] = useState<SyncJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [hasNewData, setHasNewData] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const trackedJobIdRef = useRef<string | null>(null);
  const refreshedJobIdRef = useRef<string | null>(null);
  const requestGenerationRef = useRef(0);
  const onSyncedRef = useRef(onSynced);

  useEffect(() => {
    onSyncedRef.current = onSynced;
  }, [onSynced]);

  const activeAccounts = accounts.filter((account) => account.status === "active");
  const selectedAccount = activeAccounts.find(
    (account) => String(account.id) === selectedAccountId,
  );
  const effectiveAccount =
    selectedAccount ??
    (selectedAccountId ? null : activeAccounts.length === 1 ? activeAccounts[0] : null);
  const requestContextKey = `${effectiveAccount?.id ?? "none"}:${apiCode}`;
  const activeContextKeyRef = useRef(requestContextKey);
  activeContextKeyRef.current = requestContextKey;
  const [stateContextKey, setStateContextKey] = useState(requestContextKey);
  const stateMatchesContext = stateContextKey === requestContextKey;
  const currentRuntime = runtime;
  const currentCatalogItem = stateMatchesContext ? catalogItem : null;
  const currentLatestJob = stateMatchesContext ? latestJob : null;
  const currentLoading = stateMatchesContext ? loading : true;
  const currentCreating = stateMatchesContext ? creating : false;
  const currentMessage = stateMatchesContext ? message : "";
  const currentHasNewData = stateMatchesContext ? hasNewData : false;
  const currentError = stateMatchesContext ? error : "";
  const currentRefreshing = stateMatchesContext ? refreshing : false;
  const currentLastUpdatedAt = stateMatchesContext ? lastUpdatedAt : null;
  const activeJob =
    currentLatestJob && ACTIVE_JOB_STATUSES.has(currentLatestJob.status) ? currentLatestJob : null;
  const pollInterval = activeJob ? JOB_POLL_INTERVAL_MS : STATUS_POLL_INTERVAL_MS;
  const canOperate = user?.role === "admin" || user?.role === "operator";
  const catalogReady = Boolean(currentCatalogItem);
  const accountEnabled = currentCatalogItem?.accountEnabled === true;
  const canCreateJob = Boolean(
    canOperate &&
    csrfToken &&
    effectiveAccount &&
    catalogReady &&
    accountEnabled &&
    !activeJob &&
    !currentLoading &&
    !currentCreating,
  );
  const statusTone = currentRuntime?.availability ?? "unknown";

  useEffect(() => {
    requestGenerationRef.current += 1;
    setStateContextKey(requestContextKey);
    setCatalogItem(null);
    setLatestJob(null);
    setLoading(true);
    setCreating(false);
    setMessage("");
    setHasNewData(false);
    setError("");
    setRefreshing(false);
    setLastUpdatedAt(null);
    trackedJobIdRef.current = null;
    refreshedJobIdRef.current = null;
  }, [requestContextKey]);

  const loadStatus = useCallback(
    async (source: "auto" | "manual" = "manual") => {
      const requestGeneration = ++requestGenerationRef.current;
      const contextKey = requestContextKey;
      const isCurrentRequest = () =>
        requestGenerationRef.current === requestGeneration &&
        activeContextKeyRef.current === contextKey;
      if (source === "manual") setLoading(true);
      if (source === "auto") setRefreshing(true);
      try {
        const accountId = effectiveAccount?.id;
        const [catalog, jobs] = await Promise.all([
          accountId ? api.getApiCatalog(accountId) : Promise.resolve([]),
          accountId
            ? api.listSyncJobs({ jijiaAccountId: accountId, apiCode, limit: 1 })
            : Promise.resolve({ items: [] }),
        ]);
        const nextCatalogItem = catalog.find((item) => item.apiCode === apiCode) ?? null;
        const nextLatestJob = jobs.items[0] ?? null;
        if (!isCurrentRequest()) return;
        setCatalogItem(nextCatalogItem);
        setLatestJob(nextLatestJob);
        setError("");
        setLastUpdatedAt(new Date());

        const trackedJobId = trackedJobIdRef.current;
        if (
          trackedJobId &&
          nextLatestJob &&
          String(nextLatestJob.id) === trackedJobId &&
          nextLatestJob.status === "success" &&
          refreshedJobIdRef.current !== trackedJobId
        ) {
          refreshedJobIdRef.current = trackedJobId;
          if (preservePageOnSync) {
            setMessage("同步完成，有新数据可查看");
            setHasNewData(true);
          } else {
            setMessage("同步已完成，正在刷新数据");
            setHasNewData(false);
            onSyncedRef.current();
          }
        }
      } catch (caught) {
        if (isCurrentRequest()) setError(getApiErrorMessage(caught, "同步状态加载失败"));
      } finally {
        if (isCurrentRequest()) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [apiCode, effectiveAccount?.id, preservePageOnSync, requestContextKey],
  );

  useEffect(() => {
    if (document.visibilityState === "visible") void loadStatus("manual");
    return () => {
      requestGenerationRef.current += 1;
    };
  }, [loadStatus]);

  useVisiblePolling({
    enabled: true,
    intervalMs: pollInterval,
    onPoll: () => loadStatus("auto"),
  });

  async function createJob() {
    if (!canCreateJob || !effectiveAccount || !csrfToken) return;
    const contextKey = requestContextKey;
    setCreating(true);
    setError("");
    setMessage("");
    setHasNewData(false);
    try {
      const result = await api.createSyncJob(
        {
          jijiaAccountId: effectiveAccount.id,
          apiCode,
          rangeMode: "checkpoint",
        },
        csrfToken,
      );
      if (activeContextKeyRef.current !== contextKey) return;
      trackedJobIdRef.current = String(result.jobId);
      refreshedJobIdRef.current = null;
      setMessage(
        currentRuntime?.availability === "offline"
          ? "任务已排队，执行服务启动后会处理"
          : "同步任务已排队",
      );
      await loadStatus("manual");
    } catch (caught) {
      if (activeContextKeyRef.current === contextKey) {
        setError(getApiErrorMessage(caught, "同步任务创建失败"));
      }
    } finally {
      if (activeContextKeyRef.current === contextKey) setCreating(false);
    }
  }

  function viewLatestData() {
    setHasNewData(false);
    setMessage("正在加载最新数据");
    onSyncedRef.current();
  }

  function disabledReason(): string {
    if (!canOperate) return "当前账号无同步权限";
    if (!csrfToken) return "登录状态缺少操作凭证";
    if (currentLoading) return "正在检查同步状态";
    if (!effectiveAccount) return "请选择一个积加账号后同步";
    if (!catalogReady) return "当前接口不在已接入目录中";
    if (!accountEnabled) return "该账号未启用当前接口策略";
    if (activeJob) return "已有任务处理中";
    return "";
  }

  const syncDescription =
    currentRuntime?.availability === "busy"
      ? "执行服务正在处理其他任务，新任务会进入队列。"
      : currentRuntime?.availability === "offline"
        ? "可先创建同步任务，服务恢复后会自动处理。"
        : currentRuntime
          ? "将从已保存的同步进度继续。"
          : "正在检查执行服务状态。";
  const actionTitle =
    disabledReason() ||
    (currentRuntime?.availability === "busy"
      ? "执行服务忙碌，新任务会进入队列"
      : currentRuntime?.availability === "offline"
        ? "创建任务并等待执行服务恢复"
        : "从已保存进度创建同步任务");
  const actionLabel = currentCreating
    ? "创建中"
    : activeJob
      ? "任务处理中"
      : currentRuntime?.availability === "busy"
        ? "加入同步队列"
        : "按进度同步";
  const readinessTitle = currentLoading
    ? "正在检查同步状态"
    : currentError && !currentLastUpdatedAt
      ? "同步状态暂时不可用"
      : activeJob
        ? "同步任务正在处理"
        : disabledReason() ||
          (currentRuntime?.availability === "busy"
            ? "可以加入同步队列"
            : currentRuntime?.availability === "offline"
              ? "可以创建同步任务"
              : "可以按当前进度同步");
  const readinessDescription =
    currentError && !currentLastUpdatedAt
      ? "状态检查失败，系统会继续自动重试。"
      : !effectiveAccount
        ? "选择账号后即可查看接口状态并创建同步任务。"
        : !canOperate
          ? "你仍可以查看现有数据和历史任务。"
          : !csrfToken
            ? "刷新页面或重新登录后重试。"
            : !catalogReady
              ? "请先确认此接口已经接入当前账号。"
              : !accountEnabled
                ? "请先在账号策略中启用当前接口。"
                : activeJob
                  ? "打开最近任务可查看执行进度。"
                  : syncDescription;

  return (
    <section className={`data-sync-panel data-sync-panel--${statusTone}`} aria-live="polite">
      <header className="data-sync-header">
        <div className="data-sync-title">
          <span>同步控制</span>
          <div className="data-sync-interface">
            <strong>{currentCatalogItem?.name ?? displayName}</strong>
            <span>{apiCode}</span>
          </div>
        </div>
        <div className="data-sync-worker">
          <span>执行服务</span>
          {currentRuntime ? (
            <Tag color={runtimeTagColor(currentRuntime.availability)}>
              {runtimeLabel(currentRuntime)}
            </Tag>
          ) : (
            <Spin size="small" />
          )}
        </div>
      </header>
      <div className="data-sync-command">
        <div className="data-sync-readiness">
          <strong>{readinessTitle}</strong>
          <p>{readinessDescription}</p>
        </div>
        <div className="data-sync-actions">
          <Button
            className="data-sync-primary-action"
            color="primary"
            disabled={!canCreateJob}
            loading={currentCreating}
            variant="solid"
            onClick={() => void createJob()}
            title={actionTitle}
          >
            {actionLabel}
          </Button>
          {currentLoading ? (
            <small>
              <Spin size="small" /> 正在检查同步状态
            </small>
          ) : null}
        </div>
      </div>
      <dl className="data-sync-metrics">
        <div>
          <dt>账号</dt>
          <dd>{effectiveAccount?.name ?? "未选择"}</dd>
        </div>
        <div>
          <dt>当前加载</dt>
          <dd>{loadedCount}</dd>
        </div>
        <div>
          <dt>原始记录</dt>
          <dd>{currentCatalogItem?.rawRecordCount ?? "—"}</dd>
        </div>
        <div>
          <dt>最近同步</dt>
          <dd>{formatDate(currentCatalogItem?.recentRunAt)}</dd>
        </div>
      </dl>
      <footer className="data-sync-footer">
        <div className="data-sync-links">
          {canOperate ? (
            <Link
              className="m3-link"
              to={`/jobs/new?${new URLSearchParams({ apiCode, ...(selectedAccountId || effectiveAccount ? { accountId: selectedAccountId || String(effectiveAccount?.id) } : {}) })}`}
              state={sourceState}
            >
              自定义同步范围
            </Link>
          ) : null}
          {currentLatestJob ? (
            <Link className="m3-link" to={`/jobs/${currentLatestJob.id}`} state={sourceState}>
              最近任务：{statusLabel(currentLatestJob.status)}
            </Link>
          ) : (
            <span>暂无历史任务</span>
          )}
        </div>
        <RefreshStatus
          failedWithPreviousData={Boolean(currentError && currentLastUpdatedAt)}
          lastUpdatedAt={currentLastUpdatedAt}
          refreshing={currentRefreshing}
        />
      </footer>
      {currentMessage || currentError || currentHasNewData ? (
        <div className="data-sync-feedback">
          {currentMessage ? <Alert title={currentMessage} type="success" /> : null}
          {currentHasNewData ? (
            <Button type="link" onClick={viewLatestData}>
              查看最新数据
            </Button>
          ) : null}
          {currentError ? <Alert title={currentError} type="error" /> : null}
        </div>
      ) : null}
    </section>
  );
}

function runtimeLabel(runtime: WorkerRuntime): string {
  if (runtime.availability === "offline") return "离线";
  if (runtime.availability === "busy") return "忙碌";
  return "在线";
}

function runtimeTagColor(availability: WorkerRuntime["availability"]) {
  if (availability === "offline") return "error";
  if (availability === "busy") return "processing";
  return "success";
}
