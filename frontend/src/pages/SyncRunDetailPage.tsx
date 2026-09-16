import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Empty, Spin, Tag } from "antd";
import { Link, useLocation, useParams } from "react-router-dom";

import { api } from "../api/client";
import type { FailedRequest, SyncRun, SyncRunLog } from "../api/types";
import { AppShell } from "../components/AppShell";
import { RefreshStatus } from "../components/RefreshStatus";
import { SourceBackLink } from "../components/SourceBackLink";
import { getApiErrorMessage, statusLabel, timeZoneNote } from "./m3Utils";

export function SyncRunDetailPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const requestGenerationRef = useRef(0);
  const inFlightGenerationRef = useRef<number | null>(null);
  const [run, setRun] = useState<SyncRun | null>(null);
  const [logs, setLogs] = useState<SyncRunLog[]>([]);
  const [failed, setFailed] = useState<FailedRequest[]>([]);
  const [runState, setRunState] = useState<"loading" | "success" | "error">("loading");
  const [logsState, setLogsState] = useState<"loading" | "success" | "error">("loading");
  const [failedState, setFailedState] = useState<"loading" | "success" | "error">("loading");
  const [runError, setRunError] = useState("");
  const [logsError, setLogsError] = useState("");
  const [failedError, setFailedError] = useState("");
  const [logCursor, setLogCursor] = useState<string | null>(null);
  const [failedCursor, setFailedCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<"logs" | "failed" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [error, setError] = useState("");
  const currentPath = `${location.pathname}${location.search}${location.hash}`;

  const loadDetail = useCallback(
    async (source: "initial" | "manual", targetLogCount = 0, targetFailedCount = 0) => {
      if (inFlightGenerationRef.current !== null) return;
      const generation = ++requestGenerationRef.current;
      inFlightGenerationRef.current = generation;
      if (source === "manual") setRefreshing(true);
      setRunError("");
      setLogsError("");
      setFailedError("");
      setError("");

      async function loadPages<T>(
        request: (cursor?: string) => Promise<{ items: T[]; nextCursor?: string | null }>,
        targetCount: number,
      ) {
        const firstPage = await request();
        const result = { items: [...firstPage.items], nextCursor: firstPage.nextCursor ?? null };
        while (
          requestGenerationRef.current === generation &&
          result.nextCursor &&
          result.items.length < targetCount
        ) {
          const nextPage = await request(result.nextCursor);
          result.items.push(...nextPage.items);
          result.nextCursor = nextPage.nextCursor ?? null;
        }
        return result;
      }

      const results = await Promise.allSettled([
        api.getSyncRun(id),
        loadPages(
          (cursor) => (cursor ? api.listSyncRunLogs(id, cursor) : api.listSyncRunLogs(id)),
          targetLogCount,
        ),
        loadPages(
          (cursor) => (cursor ? api.listFailedRequests(id, cursor) : api.listFailedRequests(id)),
          targetFailedCount,
        ),
      ]);
      if (requestGenerationRef.current !== generation) return;
      const [runResult, logsResult, failedResult] = results;

      if (runResult.status === "fulfilled") {
        setRun(runResult.value);
        setRunState("success");
      } else {
        setRunError(getApiErrorMessage(runResult.reason, "运行详情加载失败"));
        if (source === "initial") setRunState("error");
      }

      if (logsResult.status === "fulfilled") {
        setLogs(logsResult.value.items);
        setLogCursor(logsResult.value.nextCursor);
        setLogsState("success");
      } else {
        setLogsError(getApiErrorMessage(logsResult.reason, "接口日志加载失败"));
        if (source === "initial") setLogsState("error");
      }

      if (failedResult.status === "fulfilled") {
        setFailed(failedResult.value.items);
        setFailedCursor(failedResult.value.nextCursor);
        setFailedState("success");
      } else {
        setFailedError(getApiErrorMessage(failedResult.reason, "失败请求加载失败"));
        if (source === "initial") setFailedState("error");
      }

      if (results.every((result) => result.status === "fulfilled")) {
        setLastCheckedAt(new Date());
      }
      setRefreshing(false);
      if (inFlightGenerationRef.current === generation) inFlightGenerationRef.current = null;
    },
    [id],
  );

  useEffect(() => {
    setRun(null);
    setLogs([]);
    setFailed([]);
    setLogCursor(null);
    setFailedCursor(null);
    setRunState("loading");
    setLogsState("loading");
    setFailedState("loading");
    setRunError("");
    setLogsError("");
    setFailedError("");
    setLoadingMore(null);
    setRefreshing(false);
    setLastCheckedAt(null);
    setError("");
    inFlightGenerationRef.current = null;
    void loadDetail("initial");

    return () => {
      requestGenerationRef.current += 1;
      inFlightGenerationRef.current = null;
    };
  }, [id, loadDetail]);

  const rawDataPath =
    run?.batchNo && run.jijiaAccountId != null
      ? `/raw-data?${new URLSearchParams({
          jijiaAccountId: String(run.jijiaAccountId),
          observedBatchNo: run.batchNo,
        }).toString()}`
      : null;
  const needsAttention =
    run != null && (["failed", "partial_failed"].includes(run.status) || (run.failedApis ?? 0) > 0);
  const initialLoading =
    runState === "loading" || logsState === "loading" || failedState === "loading";
  const refreshFailed = Boolean(runError || logsError || failedError);

  async function loadMoreLogs() {
    if (!logCursor) return;
    const generation = requestGenerationRef.current;
    const runId = id;
    setLoadingMore("logs");
    try {
      const result = await api.listSyncRunLogs(runId, logCursor);
      if (requestGenerationRef.current !== generation) return;
      setLogs((current) => [...current, ...result.items]);
      setLogCursor(result.nextCursor ?? null);
    } catch (caught) {
      if (requestGenerationRef.current === generation) {
        setError(getApiErrorMessage(caught, "接口日志加载失败"));
      }
    } finally {
      if (requestGenerationRef.current === generation) {
        setLoadingMore(null);
      }
    }
  }

  async function loadMoreFailed() {
    if (!failedCursor) return;
    const generation = requestGenerationRef.current;
    const runId = id;
    setLoadingMore("failed");
    try {
      const result = await api.listFailedRequests(runId, failedCursor);
      if (requestGenerationRef.current !== generation) return;
      setFailed((current) => [...current, ...result.items]);
      setFailedCursor(result.nextCursor ?? null);
    } catch (caught) {
      if (requestGenerationRef.current === generation) {
        setError(getApiErrorMessage(caught, "失败请求加载失败"));
      }
    } finally {
      if (requestGenerationRef.current === generation) {
        setLoadingMore(null);
      }
    }
  }

  return (
    <AppShell>
      <main className="m3-page">
        <SourceBackLink fallbackPath="/runs" fallbackLabel="返回运行记录" />
        <header className="page-heading">
          <div>
            <h1>运行详情</h1>
            <p>
              {runState === "loading"
                ? "正在加载批次信息…"
                : run
                  ? `批次 ${run.batchNo ?? "—"}`
                  : `运行 #${id}`}
            </p>
          </div>
          <div className="m3-refresh-controls">
            <RefreshStatus
              failedWithPreviousData={Boolean(lastCheckedAt && refreshFailed)}
              lastUpdatedAt={lastCheckedAt}
              refreshing={refreshing}
            />
            <Button
              aria-label="刷新运行详情"
              disabled={initialLoading || refreshing || loadingMore !== null}
              loading={refreshing}
              onClick={() => void loadDetail("manual", logs.length, failed.length)}
            >
              刷新运行详情
            </Button>
          </div>
        </header>
        {runError ? <Alert title={runError} showIcon type={run ? "warning" : "error"} /> : null}
        {runState === "success" && run ? (
          <section className="m3-card m3-summary-grid" aria-label="运行摘要">
            <div>
              <span>批次号</span>
              <strong>{run.batchNo ?? "—"}</strong>
            </div>
            <div>
              <span>积加账号</span>
              <strong>
                {run.accountName ??
                  (run.jijiaAccountId != null ? `账号 ${run.jijiaAccountId}` : "legacy 账号")}
              </strong>
            </div>
            <div>
              <span>状态</span>
              <Tag className={`m3-status m3-status--${run.status}`}>{statusLabel(run.status)}</Tag>
            </div>
            <div>
              <span>关联任务</span>
              <strong>
                {run.jobId != null ? (
                  <Link
                    className="m3-link"
                    state={{ from: currentPath, backLabel: "返回运行详情" }}
                    to={`/jobs/${run.jobId}`}
                  >
                    任务 #{run.jobId}
                  </Link>
                ) : (
                  "—"
                )}
              </strong>
            </div>
            <div>
              <span>批次观察记录</span>
              <strong>
                {rawDataPath ? (
                  <Link className="m3-link" to={rawDataPath}>
                    查看本批次曾观察的记录（列表展示当前快照）
                  </Link>
                ) : (
                  "—"
                )}
              </strong>
            </div>
          </section>
        ) : null}
        {needsAttention && run ? (
          <section
            className="m3-card m3-failure-summary"
            aria-labelledby="run-failure-summary-title"
          >
            <div className="m3-card-heading">
              <div>
                <h2 id="run-failure-summary-title">本次运行需要处理</h2>
                <p className="muted-copy">
                  {run.failedApis ? `${run.failedApis} 个接口执行失败。` : "运行未完整成功。"}
                  {failedState === "success"
                    ? ` 已加载 ${failed.length} 条失败请求。`
                    : " 正在读取失败请求。"}
                </p>
              </div>
            </div>
            <div className="heading-actions m3-failure-actions">
              <a className="action-link action-link--neutral" href="#failed-requests">
                定位失败请求
              </a>
              {run.jobId != null ? (
                <Link
                  className="action-link action-link--neutral"
                  state={{ from: currentPath, backLabel: "返回运行详情" }}
                  to={`/jobs/${run.jobId}`}
                >
                  返回任务处理
                </Link>
              ) : null}
              {rawDataPath ? (
                <Link className="action-link action-link--neutral" to={rawDataPath}>
                  查看批次数据
                </Link>
              ) : null}
            </div>
          </section>
        ) : null}
        <p className="timezone-note">{timeZoneNote()}</p>
        {error ? <Alert title={error} showIcon type="error" /> : null}
        <section className="m3-card">
          <h2>接口日志</h2>
          {logsError ? (
            <Alert
              title={logsError}
              showIcon
              type={logsState === "success" ? "warning" : "error"}
            />
          ) : null}
          {logsState === "loading" ? (
            <Spin description="正在加载接口日志…" />
          ) : logsState === "success" && logs.length === 0 ? (
            <Empty description="暂无接口日志" />
          ) : logs.length > 0 ? (
            <ul className="m3-list">
              {logs.map((log) => (
                <li key={String(log.id)}>
                  <strong>{log.apiCode}</strong>
                  <Tag className={`m3-status m3-status--${log.status}`}>
                    {statusLabel(log.status)}
                  </Tag>
                  <small>{log.message ?? "—"}</small>
                </li>
              ))}
            </ul>
          ) : null}
          {logCursor ? (
            <div className="load-more-row">
              <Button
                aria-label={loadingMore === "logs" ? "加载中…" : "加载更多日志"}
                disabled={loadingMore !== null}
                loading={loadingMore === "logs"}
                onClick={() => void loadMoreLogs()}
              >
                {loadingMore === "logs" ? "加载中…" : "加载更多日志"}
              </Button>
            </div>
          ) : null}
        </section>
        <section className="m3-card" id="failed-requests">
          <h2>失败请求</h2>
          {failedError ? (
            <Alert
              title={failedError}
              showIcon
              type={failedState === "success" ? "warning" : "error"}
            />
          ) : null}
          {failedState === "loading" ? (
            <Spin description="正在加载失败请求…" />
          ) : failedState === "success" && failed.length === 0 ? (
            <Empty description="暂无失败请求" />
          ) : failed.length > 0 ? (
            <ul className="m3-list">
              {failed.map((item) => (
                <li key={String(item.id)}>
                  <strong>{item.apiCode}</strong>
                  <span>{item.errorCode ?? "请求失败"}</span>
                  <small>
                    {item.errorMessage ?? "—"}
                    {item.attemptCount ? ` · 已尝试 ${item.attemptCount} 次` : ""}
                  </small>
                </li>
              ))}
            </ul>
          ) : null}
          {failedCursor ? (
            <div className="load-more-row">
              <Button
                aria-label={loadingMore === "failed" ? "加载中…" : "加载更多失败请求"}
                disabled={loadingMore !== null}
                loading={loadingMore === "failed"}
                onClick={() => void loadMoreFailed()}
              >
                {loadingMore === "failed" ? "加载中…" : "加载更多失败请求"}
              </Button>
            </div>
          ) : null}
        </section>
      </main>
    </AppShell>
  );
}
