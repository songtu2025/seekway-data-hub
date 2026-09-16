import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Empty, Form, Select, Spin, Table, Tag } from "antd";
import type { TableColumnsType } from "antd";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import { api } from "../api/client";
import type { JijiaAccount, SyncRun } from "../api/types";
import { AppShell } from "../components/AppShell";
import { RefreshStatus } from "../components/RefreshStatus";
import {
  formatDate,
  getApiErrorMessage,
  getReturnNavigation,
  statusLabel,
  timeZoneNote,
} from "./m3Utils";

export function SyncRunsPage() {
  const location = useLocation();
  const returnNavigation = getReturnNavigation(location.state, "/jobs", "返回同步任务", [
    "/raw-data",
    "/audit",
    "/api-catalog",
    "/jobs",
    "/",
  ]);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestSequenceRef = useRef(0);
  const inFlightRequestKeysRef = useRef(new Map<string, number>());
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [accounts, setAccounts] = useState<JijiaAccount[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState(searchParams.get("account") ?? "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [refreshNotice, setRefreshNotice] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [accountError, setAccountError] = useState("");
  const filtersRef = useRef({ account: accountFilter, status: statusFilter });
  filtersRef.current = { account: accountFilter, status: statusFilter };

  const loadRuns = useCallback(
    async (
      cursor?: string,
      filters = filtersRef.current,
      source: "initial" | "filter" | "manual" | "page" = cursor ? "page" : "manual",
    ) => {
      const requestKey = `${cursor ?? "first"}:${filters.account}:${filters.status}`;
      if (inFlightRequestKeysRef.current.get(requestKey) === requestSequenceRef.current) return;
      const requestSequence = ++requestSequenceRef.current;
      inFlightRequestKeysRef.current.set(requestKey, requestSequence);
      setError("");
      setRefreshNotice("");
      if (cursor) {
        setLoadingMore(true);
      } else if (source === "manual") {
        setRefreshing(true);
        setRefreshNotice("");
      } else {
        if (source === "filter") {
          setRuns([]);
          setLastUpdatedAt(null);
        }
        setLoading(true);
        setLoadingMore(false);
      }
      try {
        const result = await api.listSyncRuns({
          cursor,
          jijiaAccountId: filters.account ? Number(filters.account) : undefined,
          status: filters.status || undefined,
        });
        if (requestSequenceRef.current !== requestSequence) return;
        setRuns((current) => (cursor ? [...current, ...result.items] : result.items));
        setNextCursor(result.nextCursor ?? null);
        setLastUpdatedAt(new Date());
        if (source === "manual") setRefreshNotice("运行记录已刷新");
      } catch (caught) {
        if (requestSequenceRef.current !== requestSequence) return;
        setError(getApiErrorMessage(caught, "运行记录加载失败，请稍后重试"));
      } finally {
        if (requestSequenceRef.current === requestSequence) {
          if (cursor) {
            setLoadingMore(false);
          } else {
            setLoading(false);
            setRefreshing(false);
          }
        }
        if (inFlightRequestKeysRef.current.get(requestKey) === requestSequence) {
          inFlightRequestKeysRef.current.delete(requestKey);
        }
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;
    const inFlightRequestKeys = inFlightRequestKeysRef.current;
    void api
      .listAccounts()
      .then((accountRows) => {
        if (active) setAccounts(accountRows);
      })
      .catch((caught: unknown) => {
        if (active) {
          setAccountError(getApiErrorMessage(caught, "账号筛选选项加载失败，请稍后重试"));
        }
      });
    void loadRuns(undefined, filtersRef.current, "initial");
    return () => {
      active = false;
      requestSequenceRef.current += 1;
      inFlightRequestKeys.clear();
    };
  }, [loadRuns]);

  const columns: TableColumnsType<SyncRun> = [
    {
      title: "批次",
      key: "batch",
      render: (_, run) => (
        <div className="table-cell-stack">
          <Link
            className="m3-link"
            state={{ from: runsListPath(searchParams), backLabel: "返回运行记录" }}
            to={`/runs/${run.id}`}
          >
            {run.batchNo ?? `运行 #${run.id}`}
          </Link>
          <small>
            {run.accountName ?? (run.jijiaAccountId ? `账号 ${run.jijiaAccountId}` : "legacy 账号")}
          </small>
        </div>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (status: SyncRun["status"]) => (
        <Tag className={`m3-status m3-status--${status}`}>{statusLabel(status)}</Tag>
      ),
    },
    {
      title: "任务",
      key: "job",
      render: (_, run) =>
        run.jobId ? (
          <Link
            className="m3-link"
            state={{ from: runsListPath(searchParams), backLabel: "返回运行记录" }}
            to={`/jobs/${run.jobId}`}
          >
            查看任务 #{run.jobId}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      title: "开始时间",
      dataIndex: "startedAt",
      key: "startedAt",
      render: (value: string | null | undefined) => formatDate(value),
    },
    {
      title: "结果",
      key: "result",
      render: (_, run) => runResultLabel(run),
    },
  ];

  return (
    <AppShell>
      <main className="m3-page">
        <Link className="m3-link" to={returnNavigation.path} state={returnNavigation.state}>
          ← {returnNavigation.label}
        </Link>
        <header className="page-heading">
          <div>
            <h1>执行批次记录</h1>
          </div>
          <div className="m3-refresh-controls">
            <RefreshStatus
              failedWithPreviousData={Boolean(error && runs.length)}
              lastUpdatedAt={lastUpdatedAt}
              manualRefreshMessage={refreshNotice}
              refreshing={refreshing}
            />
            <Button
              aria-label={refreshing ? "正在刷新" : "刷新"}
              disabled={loading || refreshing || loadingMore}
              loading={refreshing}
              onClick={() => void loadRuns(undefined, filtersRef.current, "manual")}
            >
              刷新
            </Button>
          </div>
        </header>
        <div className="run-compat-notice" role="note">
          <Alert
            title={
              <>
                此页面保留用于兼容历史链接。日常查看进度、处理失败或继续任务，请前往{" "}
                <Link className="m3-link" to="/jobs">
                  同步任务
                </Link>
                。
              </>
            }
            showIcon
            type="info"
          />
        </div>
        {error || accountError ? (
          <Alert
            title={error || accountError}
            showIcon
            type={runs.length > 0 ? "warning" : "error"}
          />
        ) : null}
        <Form
          className="m3-filter"
          aria-label="运行记录筛选"
          layout="inline"
          onFinish={() => {
            const next = new URLSearchParams();
            if (accountFilter) next.set("account", accountFilter);
            if (statusFilter) next.set("status", statusFilter);
            setSearchParams(next, { replace: true });
            void loadRuns(undefined, filtersRef.current, "filter");
          }}
        >
          <Form.Item label="积加账号">
            <Select
              aria-label="积加账号"
              id="run-account-filter"
              value={accountFilter}
              onChange={(value) => {
                setAccountFilter(value);
                setNextCursor(null);
              }}
              options={[
                { label: "全部账号", value: "" },
                ...accounts.map((account) => ({ label: account.name, value: String(account.id) })),
              ]}
            />
          </Form.Item>
          <Form.Item label="运行状态">
            <Select
              aria-label="运行状态"
              id="run-status-filter"
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value);
                setNextCursor(null);
              }}
              options={[
                { label: "全部状态", value: "" },
                ...(
                  [
                    "queued",
                    "running",
                    "pause_requested",
                    "paused",
                    "success",
                    "partial_failed",
                    "failed",
                    "cancelled",
                    "stopped",
                  ] as const
                ).map((status) => ({ label: statusLabel(status), value: status })),
              ]}
            />
          </Form.Item>
          <Button aria-label="筛选" htmlType="submit">
            筛选
          </Button>
          {accountFilter || statusFilter ? (
            <Button
              className="text-button"
              type="text"
              onClick={() => {
                setAccountFilter("");
                setStatusFilter("");
                setSearchParams({}, { replace: true });
                void loadRuns(undefined, { account: "", status: "" }, "filter");
              }}
            >
              重置筛选
            </Button>
          ) : null}
          <small className="timezone-note">{timeZoneNote()}</small>
        </Form>
        <section className="m3-card" aria-labelledby="runs-title">
          <div className="m3-card-heading">
            <h2 id="runs-title">最近批次</h2>
          </div>
          {loading && runs.length === 0 ? <Spin description="正在加载运行记录…" /> : null}
          {!loading && !error && runs.length === 0 ? <Empty description="暂无运行记录" /> : null}
          {runs.length > 0 ? (
            <div className="responsive-table-wrap responsive-table-wrap--cards">
              <Table
                className="responsive-table responsive-table--cards runs-table"
                columns={columns}
                dataSource={runs}
                pagination={false}
                rowKey={(run) => String(run.id)}
                scroll={{ x: 960 }}
              />
            </div>
          ) : null}
          {nextCursor ? (
            <div className="load-more-row">
              <Button
                aria-label={loadingMore ? "加载中…" : "加载更多"}
                disabled={loadingMore}
                loading={loadingMore}
                onClick={() => void loadRuns(nextCursor)}
              >
                {loadingMore ? "加载中…" : "加载更多"}
              </Button>
            </div>
          ) : null}
        </section>
      </main>
    </AppShell>
  );
}

function runResultLabel(run: SyncRun): string {
  const failed = run.failedApis ?? 0;
  if (run.status === "paused" || run.status === "pause_requested") {
    return failed > 0 ? `执行已暂停 · ${failed} 个接口失败` : "执行已暂停 · 接口无失败";
  }
  if (run.status === "cancelled" || run.status === "stopped") {
    return failed > 0 ? `执行已结束 · ${failed} 个接口失败` : "执行已结束 · 接口无失败";
  }
  if (run.totalApis != null && run.totalApis > 0) {
    if (failed > 0) return `${run.totalApis - failed} / ${run.totalApis} 个接口成功`;
    return `全部 ${run.totalApis} 个接口成功`;
  }
  if (run.failedApis) return `${run.failedApis} 个接口失败`;
  return "查看详情";
}

function runsListPath(searchParams: URLSearchParams): string {
  const query = searchParams.toString();
  return query ? `/runs?${query}` : "/runs";
}
