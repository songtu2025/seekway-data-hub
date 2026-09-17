import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Empty, Form, Select, Spin, Table, Tag, type TableColumnsType } from "antd";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import { api } from "../api/client";
import type {
  ApiCatalogItem,
  HistoryProgress,
  JijiaAccount,
  SyncJob,
  SyncJobStatusGroup,
  SyncJobSummary,
  SyncTaskStatus,
  SyncJobTriggerType,
  SyncJobType,
} from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { AppShell } from "../components/AppShell";
import { CursorPagination } from "../components/CursorPagination";
import { RefreshStatus } from "../components/RefreshStatus";
import { SyncJobProgressSummary } from "../components/SyncJobReadModel";
import { WorkerStatusPanel } from "../components/WorkerStatusPanel";
import { useCursorPagination } from "../hooks/useCursorPagination";
import { useVisiblePolling } from "../hooks/useVisiblePolling";
import { formatDate, getApiErrorMessage, timeZoneNote } from "./m3Utils";
import {
  executionStageLabel,
  getTaskStatus,
  isTaskActive,
  syncJobDetailPath,
  taskStatusLabel,
} from "./syncJobStatus";

const JOBS_POLL_INTERVAL_MS = 5000;
const emptySummary: SyncJobSummary = {
  total: 0,
  active: 0,
  attention: 0,
  success: 0,
  ended: 0,
};

const jobTypeNames: Record<SyncJobType, string> = {
  history_backfill: "历史回填",
  update_incremental: "增量追赶",
  sync: "普通同步",
};

const triggerNames = {
  manual: "手动发起",
  retry: "失败重试",
  schedule: "计划任务",
} as const;

interface JobFilters {
  account: string;
  apiCode: string;
  status: SyncTaskStatus | "";
  group: SyncJobStatusGroup | "";
  trigger: SyncJobTriggerType | "";
}

const taskStatuses: SyncTaskStatus[] = [
  "in_progress",
  "pausing",
  "paused",
  "attention",
  "success",
  "caught_up",
  "terminated",
  "dismissed",
];

const legacyTaskStatusMap: Record<string, SyncTaskStatus> = {
  queued: "in_progress",
  running: "in_progress",
  pause_requested: "pausing",
  failed: "attention",
  partial_failed: "attention",
  cancelled: "terminated",
  stopped: "terminated",
};

function readTaskStatus(value: string | null): SyncTaskStatus | "" {
  if (!value) return "";
  if (taskStatuses.includes(value as SyncTaskStatus)) return value as SyncTaskStatus;
  return legacyTaskStatusMap[value] ?? "";
}

function readJobFilters(searchParams: URLSearchParams): JobFilters {
  return {
    account: searchParams.get("account") ?? searchParams.get("accountId") ?? "",
    apiCode: searchParams.get("api") ?? searchParams.get("apiCode") ?? "",
    status: readTaskStatus(searchParams.get("status")),
    group: (searchParams.get("group") as SyncJobStatusGroup | null) ?? "",
    trigger: (searchParams.get("trigger") as SyncJobTriggerType | null) ?? "",
  };
}

function currentWindowLabel(progress?: HistoryProgress | null): string {
  const window = progress?.currentWindow;
  return window ? `${window.startDate} 至 ${window.endDate}` : "—";
}

function shortTaskNo(value: string): string {
  return value.length > 18 ? `…${value.slice(-12)}` : value;
}

function nextActionLabel(status: SyncTaskStatus): string {
  if (["in_progress", "pausing"].includes(status)) return "查看进度";
  if (status === "paused") return "继续处理";
  if (status === "attention") return "处理失败";
  if (status === "dismissed") return "查看记录";
  if (["success", "caught_up"].includes(status)) return "查看结果";
  return "查看详情";
}

function jobRowKey(job: SyncJob): string {
  return job.taskNo ? `task:${job.taskNo}` : `job:${job.id}`;
}

function uniqueJobs(rows: SyncJob[]): SyncJob[] {
  const seen = new Set<string>();
  return rows.filter((job) => {
    const key = jobRowKey(job);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function reconcilePolledJobs(current: SyncJob[], incoming: SyncJob[]): SyncJob[] {
  const uniqueIncoming = uniqueJobs(incoming);
  const incomingByKey = new Map(uniqueIncoming.map((job) => [jobRowKey(job), job]));
  const currentKeys = new Set(current.map(jobRowKey));
  const newJobs = uniqueIncoming.filter((job) => !currentKeys.has(jobRowKey(job)));
  const existingJobs = current.flatMap((job) => {
    const updated = incomingByKey.get(jobRowKey(job));
    return updated ? [updated] : [];
  });
  return [...newJobs, ...existingJobs];
}

export function SyncJobsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [summary, setSummary] = useState<SyncJobSummary>(emptySummary);
  const [accounts, setAccounts] = useState<JijiaAccount[]>([]);
  const [apis, setApis] = useState<ApiCatalogItem[]>([]);
  const initialFilters = readJobFilters(searchParams);
  const [accountFilter, setAccountFilter] = useState(initialFilters.account);
  const [apiFilter, setApiFilter] = useState(initialFilters.apiCode);
  const [statusFilter, setStatusFilter] = useState<SyncTaskStatus | "">(initialFilters.status);
  const [groupFilter, setGroupFilter] = useState<SyncJobStatusGroup | "">(initialFilters.group);
  const [triggerFilter, setTriggerFilter] = useState<SyncJobTriggerType | "">(
    initialFilters.trigger,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [manualRefreshMessage, setManualRefreshMessage] = useState("");
  const [autoRefreshWarning, setAutoRefreshWarning] = useState("");
  const [error, setError] = useState("");
  const canRun = user?.role === "admin" || user?.role === "operator";
  const appliedQuery = searchParams.toString();
  const pagination = useCursorPagination(undefined, appliedQuery || "all-jobs");
  const { pageSize, restorePagination, setNextCursor: updateNextCursor } = pagination;
  const activePageSizeRef = useRef(pageSize);
  activePageSizeRef.current = pageSize;
  const currentCursorRef = useRef<string | undefined>(undefined);
  currentCursorRef.current = pagination.pageCursors[pagination.pageIndex];
  const appliedFilters = readJobFilters(searchParams);
  const appliedAccountFilter = appliedFilters.account;
  const appliedApiFilter = appliedFilters.apiCode;
  const appliedStatusFilter = appliedFilters.status;
  const appliedGroupFilter = appliedFilters.group;
  const appliedTriggerFilter = appliedFilters.trigger;
  const requestIdRef = useRef(0);
  const requestInFlightRef = useRef(false);
  const catalogRequestRef = useRef<Promise<ApiCatalogItem[]> | null>(null);
  const [accountError, setAccountError] = useState("");
  const [accountLoading, setAccountLoading] = useState(true);
  const [accountReload, setAccountReload] = useState(0);
  const [catalogError, setCatalogError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogReload, setCatalogReload] = useState(0);
  const filtersRef = useRef({
    applied: {
      account: appliedAccountFilter,
      apiCode: appliedApiFilter,
      status: appliedStatusFilter,
      group: appliedGroupFilter as SyncJobStatusGroup | "",
      trigger: appliedTriggerFilter as SyncJobTriggerType | "",
    },
    draft: {
      account: accountFilter,
      apiCode: apiFilter,
      status: statusFilter,
      group: groupFilter,
      trigger: triggerFilter,
    },
  });
  filtersRef.current = {
    applied: {
      account: appliedAccountFilter,
      apiCode: appliedApiFilter,
      status: appliedStatusFilter,
      group: appliedGroupFilter as SyncJobStatusGroup | "",
      trigger: appliedTriggerFilter as SyncJobTriggerType | "",
    },
    draft: {
      account: accountFilter,
      apiCode: apiFilter,
      status: statusFilter,
      group: groupFilter,
      trigger: triggerFilter,
    },
  };
  const activeAccounts = accounts.filter((account) => account.status === "active");
  const createParams = new URLSearchParams();
  if (appliedAccountFilter) createParams.set("accountId", appliedAccountFilter);
  if (appliedApiFilter) createParams.set("apiCode", appliedApiFilter);
  const createPath = `/jobs/new${createParams.size ? `?${createParams}` : ""}`;

  useEffect(() => {
    if (location.hash === "#worker-status") {
      document.getElementById("worker-status")?.scrollIntoView?.({ block: "start" });
    }
  }, [location.hash]);

  useEffect(() => {
    let active = true;
    setAccountLoading(true);
    setAccountError("");
    void api
      .listAccounts()
      .then((rows) => {
        if (active) setAccounts(rows);
      })
      .catch((caught: unknown) => {
        if (active) setAccountError(getApiErrorMessage(caught, "账号加载失败，请重试"));
      })
      .finally(() => {
        if (active) setAccountLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accountReload]);

  useEffect(() => {
    let active = true;
    setCatalogLoading(true);
    setCatalogError("");
    const request = catalogRequestRef.current ?? api.getApiCatalog();
    catalogRequestRef.current = request;
    void request
      .then((catalog) => {
        if (active) setApis(catalog);
      })
      .catch((caught: unknown) => {
        if (active) {
          setCatalogError(getApiErrorMessage(caught, "接口筛选选项加载失败，请稍后重试"));
        }
      })
      .finally(() => {
        if (catalogRequestRef.current === request) catalogRequestRef.current = null;
        if (active) setCatalogLoading(false);
      });
    return () => {
      active = false;
    };
  }, [catalogReload]);

  const loadJobs = useCallback(
    async (
      cursor?: string,
      source: "filter" | "manual" | "auto" | "page" = "manual",
      filters?: JobFilters,
    ) => {
      if (source === "auto" && requestInFlightRef.current) return;

      const currentFilters =
        source === "filter" ? filtersRef.current.draft : filtersRef.current.applied;
      const requestId = ++requestIdRef.current;
      const isCurrentRequest = () => requestIdRef.current === requestId;
      const queryAccount = filters?.account ?? currentFilters.account;
      const queryApi = filters?.apiCode ?? currentFilters.apiCode;
      const queryStatus = filters?.status ?? currentFilters.status;
      const queryGroup = filters?.group ?? currentFilters.group;
      const queryTrigger = filters?.trigger ?? currentFilters.trigger;
      if (source !== "auto") {
        setError("");
        setManualRefreshMessage("");
        setAutoRefreshWarning("");
      }
      requestInFlightRef.current = true;
      if (source === "filter" || source === "page") {
        setJobs([]);
        setLoading(true);
        setRefreshing(false);
      } else if (source === "manual") {
        setRefreshing(true);
      } else {
        setRefreshing(false);
      }
      try {
        const result = await api.listSyncJobs({
          cursor,
          limit: activePageSizeRef.current,
          jijiaAccountId: queryAccount ? Number(queryAccount) : undefined,
          apiCode: queryApi || undefined,
          status: queryStatus || undefined,
          statusGroup: queryStatus
            ? undefined
            : ((queryGroup || undefined) as SyncJobStatusGroup | undefined),
          ...(queryTrigger ? { triggerType: queryTrigger as SyncJobTriggerType } : {}),
        });
        if (!isCurrentRequest()) return;
        setJobs((current) => {
          if (source === "auto") return reconcilePolledJobs(current, result.items);
          return uniqueJobs(result.items);
        });
        if (result.summary) setSummary(result.summary);
        updateNextCursor(result.nextCursor ?? null);
        setLastUpdatedAt(new Date());
        setAutoRefreshWarning("");
        if (source === "manual") setManualRefreshMessage("任务状态已刷新");
        if (source === "auto") setManualRefreshMessage("");
      } catch (caught) {
        if (!isCurrentRequest()) return;
        if (source === "auto") {
          setAutoRefreshWarning("自动刷新失败，当前仍显示上次结果");
        } else {
          setError(getApiErrorMessage(caught, "任务加载失败，请稍后重试"));
        }
      } finally {
        if (isCurrentRequest()) {
          requestInFlightRef.current = false;
          if (source === "filter" || source === "page") setLoading(false);
          if (source === "manual") {
            setLoading(false);
            setRefreshing(false);
          }
        }
      }
    },
    [updateNextCursor],
  );

  useEffect(() => {
    const nextFilters = readJobFilters(new URLSearchParams(appliedQuery));
    setAccountFilter(nextFilters.account);
    setApiFilter(nextFilters.apiCode);
    setStatusFilter(nextFilters.status);
    setGroupFilter(nextFilters.group);
    setTriggerFilter(nextFilters.trigger);
    const cursor = restorePagination();
    void loadJobs(cursor, "filter", nextFilters);
  }, [appliedQuery, loadJobs, pageSize, restorePagination]);

  const hasActiveJobs = jobs.some((job) => isTaskActive(getTaskStatus(job)));

  useVisiblePolling({
    enabled: hasActiveJobs,
    intervalMs: JOBS_POLL_INTERVAL_MS,
    onPoll: () => loadJobs(currentCursorRef.current, "auto"),
  });

  function applyFilterSearch(next: URLSearchParams, nextFilters: JobFilters) {
    if (next.toString() === appliedQuery) {
      pagination.resetPagination();
      void loadJobs(undefined, "filter", nextFilters);
    } else {
      setSearchParams(next, { replace: true, state: location.state });
    }
  }

  function applyStatusGroup(nextGroup: SyncJobStatusGroup | "") {
    const next = new URLSearchParams();
    if (accountFilter) next.set("account", accountFilter);
    if (apiFilter) next.set("api", apiFilter);
    if (triggerFilter) next.set("trigger", triggerFilter);
    if (nextGroup) next.set("group", nextGroup);
    const nextFilters = {
      account: accountFilter,
      apiCode: apiFilter,
      status: "",
      group: nextGroup,
      trigger: triggerFilter,
    } satisfies JobFilters;
    applyFilterSearch(next, nextFilters);
  }

  function clearFilters() {
    const nextFilters = {
      account: "",
      apiCode: "",
      status: "",
      group: "",
      trigger: "",
    } satisfies JobFilters;
    applyFilterSearch(new URLSearchParams(), nextFilters);
  }

  function loadPage(cursor: string | undefined) {
    void loadJobs(cursor, "page");
  }

  const columns: TableColumnsType<SyncJob> = [
    {
      title: "任务",
      key: "task",
      render: (_, job) => (
        <div className="table-cell-stack">
          <Link
            aria-label={job.taskNo ?? job.jobNo ?? `任务 #${job.id}`}
            className="m3-link"
            state={{
              from: jobsListPath(searchParams),
              backLabel: "返回任务列表",
              returnState: pagination.returnState,
            }}
            to={syncJobDetailPath(job)}
          >
            {job.accountName ?? (job.jijiaAccountId ? `账号 ${job.jijiaAccountId}` : "legacy 账号")}{" "}
            · {jobTypeNames[job.jobType]}
          </Link>
          <small title={job.taskNo ?? job.jobNo ?? undefined}>
            {shortTaskNo(job.taskNo ?? job.jobNo ?? `任务 #${job.id}`)} ·{" "}
            {triggerNames[job.triggerType ?? "manual"]}
          </small>
        </div>
      ),
    },
    {
      title: "接口",
      key: "api",
      className: "job-api-cell",
      render: (_, job) => (
        <div className="table-cell-stack">
          <strong>{job.apiName ?? job.apiCode}</strong>
          {job.apiName && job.apiName !== job.apiCode ? <small>{job.apiCode}</small> : null}
        </div>
      ),
    },
    {
      title: "同步范围",
      key: "range",
      render: (_, job) =>
        job.taskStart && job.taskEnd
          ? `${job.taskStart} 至 ${job.taskEnd}`
          : currentWindowLabel(job.historyProgress),
    },
    {
      title: "完整进度",
      key: "progress",
      render: (_, job) => <SyncJobProgressSummary job={job} />,
    },
    {
      title: "状态",
      key: "status",
      render: (_, job) => {
        const taskStatus = getTaskStatus(job);
        return (
          <div className="table-cell-stack">
            <Tag className={`m3-status m3-status--${taskStatus}`}>
              {taskStatusLabel(taskStatus)}
            </Tag>
            <small>{executionStageLabel(job)}</small>
          </div>
        );
      },
    },
    {
      title: "创建时间",
      key: "taskCreatedAt",
      render: (_, job) => formatDate(job.taskCreatedAt ?? job.createdAt),
    },
    {
      title: "最近更新",
      key: "lastUpdatedAt",
      render: (_, job) =>
        formatDate(
          job.lastUpdatedAt ?? job.finishedAt ?? job.heartbeatAt ?? job.startedAt ?? job.createdAt,
        ),
    },
    {
      title: "下一步",
      key: "action",
      fixed: "right",
      width: 112,
      render: (_, job) => (
        <Link
          className="m3-link"
          state={{
            from: jobsListPath(searchParams),
            backLabel: "返回任务列表",
            returnState: pagination.returnState,
          }}
          to={syncJobDetailPath(job)}
        >
          {nextActionLabel(getTaskStatus(job))} →
        </Link>
      ),
    },
  ];

  return (
    <AppShell>
      <main className="m3-page jobs-page">
        <header className="page-heading">
          <div>
            <h1>同步任务</h1>
          </div>
          <div className="heading-actions">
            {canRun ? (
              <Link
                className="action-link action-link--primary job-create-link"
                to={createPath}
                state={{
                  from: jobsListPath(searchParams),
                  backLabel: "返回任务列表",
                  returnState: pagination.returnState,
                }}
              >
                立即同步
              </Link>
            ) : null}
          </div>
        </header>
        <WorkerStatusPanel compact />
        {accountError ? (
          <Alert
            type="error"
            title={accountError}
            action={
              <Button
                loading={accountLoading}
                onClick={() => setAccountReload((current) => current + 1)}
              >
                重试加载账号
              </Button>
            }
          />
        ) : canRun && !accountLoading && activeAccounts.length === 0 ? (
          <Alert
            type="info"
            title="没有可用账号，请先接入并验证账号，或启用已有账号。"
            action={<Link to="/accounts">管理账号</Link>}
          />
        ) : null}
        {catalogError ? (
          <Alert
            action={
              <Button
                loading={catalogLoading}
                onClick={() => {
                  setCatalogLoading(true);
                  setCatalogError("");
                  setCatalogReload((current) => current + 1);
                }}
              >
                重试加载接口
              </Button>
            }
            showIcon
            title={catalogError}
            type="error"
          />
        ) : null}
        <section className="job-summary-strip" aria-label="任务状态概览">
          {(
            [
              ["", "全部任务", summary.total],
              ["active", "活动任务", summary.active],
              ["attention", "需处理", summary.attention],
              ["success", "成功任务", summary.success],
              ["ended", "终止任务", summary.ended],
            ] as const
          ).map(([group, label, count]) => (
            <Button
              aria-pressed={groupFilter === group && !statusFilter}
              className="job-summary-card"
              disabled={loading}
              key={group || "all"}
              type="text"
              onClick={() => applyStatusGroup(group)}
            >
              <span>{label}</span>
              <strong>{count}</strong>
            </Button>
          ))}
        </section>
        {error ? (
          <Alert
            action={
              <Button
                loading={refreshing}
                onClick={() => void loadJobs(currentCursorRef.current, "manual")}
              >
                重试加载任务
              </Button>
            }
            showIcon
            title={error}
            type="error"
          />
        ) : null}
        <Form
          className="m3-filter"
          aria-label="任务筛选"
          onFinish={() => {
            const next = new URLSearchParams();
            if (accountFilter) next.set("account", accountFilter);
            if (apiFilter) next.set("api", apiFilter);
            if (statusFilter) next.set("status", statusFilter);
            else if (groupFilter) next.set("group", groupFilter);
            if (triggerFilter) next.set("trigger", triggerFilter);
            const nextFilters = {
              account: accountFilter,
              apiCode: apiFilter,
              status: statusFilter,
              group: statusFilter ? "" : groupFilter,
              trigger: triggerFilter,
            } satisfies JobFilters;
            applyFilterSearch(next, nextFilters);
          }}
        >
          <label htmlFor="job-account-filter">
            积加账号
            <Select
              aria-label="积加账号"
              id="job-account-filter"
              loading={accountLoading}
              options={[
                { label: "全部账号", value: "" },
                ...accounts.map((account) => ({ label: account.name, value: String(account.id) })),
              ]}
              value={accountFilter}
              onChange={setAccountFilter}
            />
          </label>
          <label htmlFor="job-api-filter">
            接口
            <Select
              aria-label="接口"
              id="job-api-filter"
              loading={catalogLoading}
              options={[
                { label: "全部接口", value: "" },
                ...apis.map((item) => ({
                  label: `${item.name} · ${item.apiCode}`,
                  value: item.apiCode,
                })),
              ]}
              value={apiFilter}
              onChange={setApiFilter}
            />
          </label>
          <label htmlFor="job-status-filter">
            任务状态
            <Select
              aria-label="任务状态"
              id="job-status-filter"
              options={[
                { label: "全部状态", value: "" },
                ...taskStatuses.map((status) => ({
                  label: taskStatusLabel(status),
                  value: status,
                })),
              ]}
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value as SyncTaskStatus | "");
                setGroupFilter("");
              }}
            />
          </label>
          <label htmlFor="job-trigger-filter">
            触发方式
            <Select
              aria-label="触发方式"
              id="job-trigger-filter"
              options={[
                { label: "全部方式", value: "" },
                { label: "手动发起", value: "manual" },
                { label: "失败重试", value: "retry" },
                { label: "计划任务", value: "schedule" },
              ]}
              value={triggerFilter}
              onChange={(value) => setTriggerFilter(value as SyncJobTriggerType | "")}
            />
          </label>
          <div className="job-filter-actions">
            <Button aria-label="筛选" htmlType="submit" loading={loading}>
              筛选
            </Button>
            {accountFilter || apiFilter || statusFilter || groupFilter || triggerFilter ? (
              <Button type="text" onClick={clearFilters}>
                重置筛选
              </Button>
            ) : null}
          </div>
          <small className="timezone-note">{timeZoneNote()}</small>
        </Form>
        <section className="m3-card" aria-labelledby="jobs-title">
          <div className="m3-card-heading">
            <h2 id="jobs-title">任务记录</h2>
            <div className="m3-refresh-controls">
              <RefreshStatus
                failedWithPreviousData={Boolean((error || autoRefreshWarning) && jobs.length)}
                lastUpdatedAt={lastUpdatedAt}
                manualRefreshMessage={manualRefreshMessage}
                refreshing={refreshing}
              />
              <Button
                aria-label={refreshing ? "正在刷新任务" : "刷新任务"}
                disabled={refreshing}
                loading={refreshing}
                onClick={() => void loadJobs(currentCursorRef.current, "manual")}
              >
                刷新任务
              </Button>
            </div>
          </div>
          <Spin description="正在加载任务…" spinning={loading}>
            <Table<SyncJob>
              aria-label="同步任务列表"
              className="jobs-table"
              columns={columns}
              dataSource={jobs}
              rowKey={jobRowKey}
              locale={{
                emptyText:
                  loading || error ? null : appliedAccountFilter ||
                    appliedApiFilter ||
                    appliedStatusFilter ||
                    appliedGroupFilter ||
                    appliedTriggerFilter ? (
                    <Empty
                      description={
                        <>
                          <p>没有符合当前筛选条件的任务。</p>
                          <Button type="link" onClick={clearFilters}>
                            清除筛选
                          </Button>
                        </>
                      }
                    />
                  ) : (
                    <Empty description="暂无同步任务。具备运行权限的成员可以发起第一项任务。" />
                  ),
              }}
              pagination={false}
              scroll={{ x: 1040 }}
            />
          </Spin>
          <CursorPagination
            controller={pagination}
            itemCount={jobs.length}
            loading={loading}
            loadPage={loadPage}
          />
        </section>
      </main>
    </AppShell>
  );
}

function jobsListPath(searchParams: URLSearchParams): string {
  const query = searchParams.toString();
  return query ? `/jobs?${query}` : "/jobs";
}
