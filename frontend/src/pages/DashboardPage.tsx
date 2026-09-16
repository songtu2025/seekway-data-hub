import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Empty, Select, Spin, Tabs, Tag } from "antd";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import type { DashboardSummary } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { AppShell } from "../components/AppShell";
import { RefreshStatus } from "../components/RefreshStatus";
import { useVisiblePolling } from "../hooks/useVisiblePolling";
import { changeCatchupLabel, formatDate, getApiErrorMessage, statusLabel } from "./m3Utils";

type InboxView = "attention" | "active" | "all";
type InboxItemType = "all" | "runtime" | "progress";

function formatClock(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(value);
}

function formatCalendarDate(value: Date) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatCompactDate(value: string) {
  const date = new Date(value);
  return `${formatCalendarDate(date)} ${formatClock(date).slice(0, 5)}`;
}

export function DashboardPage() {
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "operator";
  const requestSequenceRef = useRef(0);
  const inFlightRequestRef = useRef<number | null>(null);
  const summaryRef = useRef<DashboardSummary | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [refreshNotice, setRefreshNotice] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [inboxView, setInboxView] = useState<InboxView>("attention");
  const [itemType, setItemType] = useState<InboxItemType>("all");

  const loadSummary = useCallback(async (source: "initial" | "manual" | "auto" = "manual") => {
    if (inFlightRequestRef.current !== null) return;
    const requestSequence = ++requestSequenceRef.current;
    inFlightRequestRef.current = requestSequence;
    if (source === "manual" && summaryRef.current) {
      setRefreshing(true);
      setRefreshNotice("");
    }
    if (source === "auto") setRefreshNotice("");
    try {
      const nextSummary = await api.getDashboard();
      if (requestSequenceRef.current !== requestSequence) return;
      summaryRef.current = nextSummary;
      setSummary(nextSummary);
      sessionStorage.setItem("dashboard-runtime-status", JSON.stringify(nextSummary));
      setLastUpdatedAt(new Date());
      setError("");
      if (source === "manual") setRefreshNotice("概览已刷新");
      if (source === "auto") setRefreshNotice("");
    } catch (caught) {
      if (requestSequenceRef.current !== requestSequence) return;
      setError(
        getApiErrorMessage(
          caught,
          summaryRef.current ? "刷新失败，当前为上次结果" : "概览加载失败，请稍后重试",
        ),
      );
    } finally {
      if (requestSequenceRef.current === requestSequence) {
        setLoading(false);
        setRefreshing(false);
      }
      if (inFlightRequestRef.current === requestSequence) inFlightRequestRef.current = null;
    }
  }, []);

  useEffect(() => {
    void loadSummary("initial");
    return () => {
      requestSequenceRef.current += 1;
      inFlightRequestRef.current = null;
    };
  }, [loadSummary]);

  const hasActiveJobs = (summary?.queuedJobs ?? 0) > 0 || (summary?.runningJobs ?? 0) > 0;
  useVisiblePolling({
    enabled: hasActiveJobs,
    intervalMs: 3000,
    onPoll: () => loadSummary("auto"),
  });

  const progress = summary?.historyProgress;
  const accounts = summary?.accounts ?? { total: 0, active: 0, attention: 0, inactive: 0 };
  const policies = summary?.policies ?? { total: 0, enabled: 0, scheduled: 0 };
  const worker = summary?.worker;
  const workerStatus =
    worker?.availability === "offline"
      ? {
          color: "error" as const,
          emphasisClassName: "is-critical",
          label: "离线",
        }
      : worker?.availability === "busy"
        ? {
            color: "processing" as const,
            emphasisClassName: "is-info",
            label: "忙碌",
          }
        : {
            color: "success" as const,
            emphasisClassName: "is-success",
            label: "在线",
          };
  const activeJobs = (summary?.queuedJobs ?? 0) + (summary?.runningJobs ?? 0);
  const nextAction = summary
    ? worker?.availability === "offline"
      ? {
          title: "任务执行服务离线",
          description: "新任务仍可排队，但不会开始执行。请先检查任务执行服务。",
          label: "查看执行服务",
          to: "/jobs#worker-status",
        }
      : accounts.attention > 0
        ? {
            title: "先修复账号连接",
            description: `当前有 ${accounts.attention} 个账号等待验证或验证失败。`,
            label: "处理异常账号",
            to: "/accounts?filter=attention",
          }
        : accounts.active === 0
          ? {
              title: "接入第一个可用账号",
              description: "完成凭证验证后，才能配置接口并发起同步。",
              label: canManage ? "接入账号" : "查看账号",
              to: canManage ? "/accounts/new" : "/accounts",
            }
          : policies.enabled === 0
            ? {
                title: "配置同步接口",
                description: "账号已可用，但还没有启用任何接口策略。",
                label: "进入账号策略",
                to: "/accounts",
              }
            : summary.failedJobs > 0 || summary.failedRequests > 0
              ? {
                  title: "先处理失败项",
                  description: `当前有 ${summary.failedJobs} 个失败任务、${summary.failedRequests} 个失败请求。`,
                  label: "查看失败任务",
                  to: "/jobs?group=attention",
                }
              : hasActiveJobs
                ? {
                    title: "同步正在执行",
                    description: `还有 ${summary.queuedJobs} 个排队任务、${summary.runningJobs} 个运行中任务。`,
                    label: "查看执行进度",
                    to: "/jobs",
                  }
                : summary.latestDataAt
                  ? {
                      title: "同步链路当前正常",
                      description: `最近一次数据观察时间：${formatDate(summary.latestDataAt)}。`,
                      label: "验证最新数据",
                      to: "/raw-data",
                    }
                  : {
                      title: "当前没有待处理任务",
                      description: "可以从已启用的账号策略发起一次同步，或先检查接口策略。",
                      label: canManage ? "发起同步任务" : "查看任务",
                      to: canManage ? "/jobs/new" : "/jobs",
                    }
    : null;
  const activeFocus = summary
    ? {
        title: hasActiveJobs ? "同步任务正在执行" : "当前没有活动任务",
        description: hasActiveJobs
          ? `当前有 ${summary.queuedJobs} 个排队任务、${summary.runningJobs} 个运行中任务。`
          : "当前没有排队或运行中的同步任务。",
        label: hasActiveJobs ? "查看执行进度" : "查看全部任务",
        to: "/jobs?group=active",
      }
    : null;
  const selectedFocus = inboxView === "active" ? activeFocus : nextAction;
  const focusIsCritical =
    inboxView !== "active" &&
    Boolean(
      worker?.availability === "offline" ||
      accounts.attention > 0 ||
      (summary?.failedJobs ?? 0) > 0 ||
      (summary?.failedRequests ?? 0) > 0,
    );
  const detectedAt = lastUpdatedAt ?? new Date();
  const showRuntimeItems = itemType === "all" || itemType === "runtime";
  const showProgressItems = itemType === "all" || itemType === "progress";

  return (
    <AppShell>
      <main className="m3-page dashboard-page">
        <header className="dashboard-inbox-header">
          <h1>运营收件箱</h1>
          <div className="dashboard-inbox-meta">
            <RefreshStatus
              failedWithPreviousData={Boolean(error && summary)}
              lastUpdatedAt={lastUpdatedAt}
              manualRefreshMessage={refreshNotice}
              refreshing={refreshing}
            />
            <Button
              aria-label="刷新"
              className="dashboard-refresh"
              disabled={loading || refreshing}
              loading={loading || refreshing}
              type="text"
              onClick={() => void loadSummary("manual")}
            >
              刷新
            </Button>
            <time dateTime={formatCalendarDate(detectedAt)}>
              {formatCalendarDate(detectedAt)}（今天）
            </time>
          </div>
        </header>
        {error ? <Alert title={error} type={summary ? "warning" : "error"} /> : null}
        {loading ? (
          <div className="empty-state">
            <Spin /> 正在加载同步概览…
          </div>
        ) : null}
        {summary ? (
          <>
            <section className="dashboard-metrics" aria-label="同步运营指标">
              <Link to="/accounts">
                <span className="dashboard-metric-label">可用账号</span>
                <strong>
                  {accounts.active} / {accounts.total}
                </strong>
                <small>{accounts.attention ? `${accounts.attention} 个需处理` : "连接正常"}</small>
              </Link>
              <Link to="/accounts">
                <span className="dashboard-metric-label">已启用策略</span>
                <strong>{policies.enabled}</strong>
                <small>{policies.scheduled} 个自动执行</small>
              </Link>
              <Link to="/jobs?group=active">
                <span className="dashboard-metric-label">活动任务</span>
                <strong>{activeJobs}</strong>
                <small>
                  {summary.queuedJobs} 排队 · {summary.runningJobs} 运行
                </small>
              </Link>
              <Link to="/jobs?group=attention">
                <span className="dashboard-metric-label">需处理任务</span>
                <strong className={summary.failedJobs > 0 ? "is-critical" : undefined}>
                  {summary.failedJobs}
                </strong>
                <small>{summary.failedRequests} 个失败请求</small>
              </Link>
              <Link to="/jobs">
                <span className="dashboard-metric-label">执行服务</span>
                <Tag className="dashboard-worker-tag" color={workerStatus.color}>
                  {workerStatus.label}
                </Tag>
                <small>{worker?.queueDepth ?? summary.queuedJobs} 个排队任务</small>
              </Link>
              <Link to="/raw-data">
                <span className="dashboard-metric-label">最近数据</span>
                <strong>
                  {summary.latestDataAt ? formatCompactDate(summary.latestDataAt) : "暂无"}
                </strong>
                <small>验证数据</small>
              </Link>
            </section>
            <div className="dashboard-workspace">
              <section className="dashboard-inbox-list" aria-label="运营事项">
                <div className="dashboard-inbox-toolbar">
                  <Tabs
                    activeKey={inboxView}
                    aria-label="事项视图"
                    className="dashboard-tabs"
                    items={[
                      { key: "attention", label: "待处理" },
                      { key: "active", label: "运行中" },
                      { key: "all", label: "全部" },
                    ]}
                    onChange={(value) => setInboxView(value as InboxView)}
                  />
                  <Select
                    aria-label="事项类型"
                    options={[
                      { label: "全部类型", value: "all" },
                      { label: "运行状态", value: "runtime" },
                      { label: "数据进度", value: "progress" },
                    ]}
                    value={itemType}
                    onChange={(value) => setItemType(value as InboxItemType)}
                  />
                </div>

                {showRuntimeItems ? (
                  <section className="dashboard-inbox-group" aria-labelledby="latest-run-title">
                    <h2 id="latest-run-title">最近运行</h2>
                    {summary.latestRun ? (
                      <div className="dashboard-inbox-row">
                        <span aria-hidden="true" className="dashboard-state-dot is-success" />
                        <span>
                          <Link className="dashboard-row-link" to={`/runs/${summary.latestRun.id}`}>
                            {summary.latestRun.batchNo ?? `运行 #${summary.latestRun.id}`}
                          </Link>
                          <small>
                            <Tag>{statusLabel(summary.latestRun.status)}</Tag>
                          </small>
                        </span>
                        <time>{formatDate(summary.latestRun.startedAt)}</time>
                      </div>
                    ) : (
                      <Empty description="暂无运行记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    )}
                  </section>
                ) : null}

                {showProgressItems ? (
                  <section
                    className="dashboard-inbox-group"
                    aria-labelledby="dashboard-history-title"
                  >
                    <h2 id="dashboard-history-title">历史追赶</h2>
                    {progress ? (
                      <Link className="dashboard-inbox-row" to="/jobs">
                        <span aria-hidden="true" className="dashboard-state-dot is-success" />
                        <span>
                          <strong>历史追赶任务</strong>
                          <small className="dashboard-history-copy">
                            <span>{changeCatchupLabel(progress.changeCatchup)}</span>
                            <span>
                              {progress.completedWindows} / {progress.totalWindows}
                            </span>
                            <span>{progress.earliestObservedDataDate ?? "尚未观测到数据"}</span>
                          </small>
                        </span>
                        <time>{progress.historyCompleteThrough ?? "进行中"}</time>
                      </Link>
                    ) : (
                      <Empty description="暂无历史任务进度" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    )}
                  </section>
                ) : null}
              </section>

              {selectedFocus ? (
                <section className="dashboard-focus-detail" aria-labelledby="dashboard-focus-title">
                  <header>
                    <span
                      aria-hidden="true"
                      className={`dashboard-state-dot${focusIsCritical ? " is-critical" : ""}`}
                    />
                    <div>
                      <h2 id="dashboard-focus-title">{selectedFocus.title}</h2>
                      <p>检测时间：{formatClock(detectedAt).slice(0, 5)}</p>
                    </div>
                  </header>
                  <div className="dashboard-focus-copy">
                    <p>{selectedFocus.description}</p>
                    {worker?.availability === "offline" ? (
                      <p>请检查执行节点状态，恢复后队列中的任务将自动继续。</p>
                    ) : null}
                  </div>
                  <details className="dashboard-focus-context">
                    <summary>影响范围与系统状态</summary>
                    <section
                      className="dashboard-focus-section"
                      aria-labelledby="dashboard-impact-title"
                    >
                      <h3 id="dashboard-impact-title">影响范围</h3>
                      <dl>
                        <div>
                          <dt>活动任务</dt>
                          <dd>{activeJobs}</dd>
                        </div>
                        <div>
                          <dt>排队任务</dt>
                          <dd>{summary.queuedJobs}</dd>
                        </div>
                        <div>
                          <dt>最近失败请求</dt>
                          <dd>{summary.failedRequests}</dd>
                        </div>
                        <div>
                          <dt>最新数据</dt>
                          <dd>
                            {summary.latestDataAt
                              ? `${formatCompactDate(summary.latestDataAt)}（验证数据）`
                              : "暂无"}
                          </dd>
                        </div>
                      </dl>
                    </section>
                    <section
                      className="dashboard-focus-section"
                      aria-labelledby="dashboard-system-title"
                    >
                      <h3 id="dashboard-system-title">系统状态</h3>
                      <dl>
                        <div>
                          <dt>可用账号</dt>
                          <dd className="is-success">
                            {accounts.active} / {accounts.total} · 连接正常
                          </dd>
                        </div>
                        <div>
                          <dt>已启用策略</dt>
                          <dd>
                            {policies.enabled}（{policies.scheduled} 个自动执行）
                          </dd>
                        </div>
                        <div>
                          <dt>任务执行服务</dt>
                          <dd className={workerStatus.emphasisClassName}>{workerStatus.label}</dd>
                        </div>
                        <div>
                          <dt>数据中心区域</dt>
                          <dd>{Intl.DateTimeFormat().resolvedOptions().timeZone}</dd>
                        </div>
                      </dl>
                    </section>
                  </details>
                  <section
                    className="dashboard-focus-actions"
                    aria-labelledby="dashboard-actions-title"
                  >
                    <h3 id="dashboard-actions-title">建议操作</h3>
                    <div>
                      <Link className="action-link action-link--primary" to={selectedFocus.to}>
                        {selectedFocus.label}
                      </Link>
                      {worker?.availability !== "offline" ? (
                        <Link className="action-link action-link--neutral" to="/accounts">
                          检查账号与策略
                        </Link>
                      ) : null}
                    </div>
                  </section>
                </section>
              ) : null}
            </div>
          </>
        ) : null}
      </main>
    </AppShell>
  );
}
