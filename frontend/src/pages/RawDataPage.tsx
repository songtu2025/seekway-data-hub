import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Empty, Input, Select, Table, Tag, type TableColumnsType } from "antd";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { api, ApiError } from "../api/client";
import type { JijiaAccount, RawDataSummary } from "../api/types";
import { AppShell } from "../components/AppShell";
import { CursorPagination } from "../components/CursorPagination";
import { RefreshStatus } from "../components/RefreshStatus";
import { useCursorPagination, type CursorPaginationState } from "../hooks/useCursorPagination";
import {
  formatDate,
  getApiErrorMessage,
  getReturnNavigation,
  statusLabel,
  timeZoneNote,
} from "./m3Utils";

export function RawDataPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const returnNavigation = getReturnNavigation(location.state, "/raw-data", "返回原始数据", [
    "/api-catalog",
    "/accounts",
    "/jobs",
    "/runs",
    "/audit",
    "/data",
    "/sale-returns",
    "/",
  ]);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedApiCode = searchParams.get("apiCode") ?? "";
  const selectedAccountId = searchParams.get("jijiaAccountId") ?? "";
  const selectedSyncBatchNo = searchParams.get("syncBatchNo") ?? "";
  const selectedObservedBatchNo = searchParams.get("observedBatchNo") ?? "";
  const selectedSourcePrimaryKey = searchParams.get("sourcePrimaryKey") ?? "";
  const selectedDataDateStart = searchParams.get("dataDateStart") ?? "";
  const selectedDataDateEnd = searchParams.get("dataDateEnd") ?? "";
  const verificationTaskId = searchParams.get("taskId") ?? "";
  const verificationRunId = searchParams.get("runId") ?? "";
  const verificationRunStatus = searchParams.get("runStatus") ?? "";
  const verificationWindowStart = searchParams.get("windowStart") ?? "";
  const verificationWindowEnd = searchParams.get("windowEnd") ?? "";
  const filterKey = JSON.stringify([
    selectedAccountId,
    selectedApiCode,
    selectedSyncBatchNo,
    selectedObservedBatchNo,
    selectedSourcePrimaryKey,
    selectedDataDateStart,
    selectedDataDateEnd,
  ]);
  const activeFilterKeyRef = useRef(filterKey);
  const requestGenerationRef = useRef(0);
  const [rows, setRows] = useState<RawDataSummary[]>([]);
  const [accounts, setAccounts] = useState<JijiaAccount[]>([]);
  const [apiCode, setApiCode] = useState(selectedApiCode);
  const [accountId, setAccountId] = useState(selectedAccountId);
  const [syncBatchNo, setSyncBatchNo] = useState(selectedSyncBatchNo);
  const [observedBatchNo, setObservedBatchNo] = useState(selectedObservedBatchNo);
  const [sourcePrimaryKey, setSourcePrimaryKey] = useState(selectedSourcePrimaryKey);
  const [dataDateStart, setDataDateStart] = useState(selectedDataDateStart);
  const [dataDateEnd, setDataDateEnd] = useState(selectedDataDateEnd);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingPage, setLoadingPage] = useState(false);
  const [error, setError] = useState("");
  const [refreshNotice, setRefreshNotice] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [paginationNotice, setPaginationNotice] = useState("");
  const savedState = location.state as {
    rawPagination?: CursorPaginationState & { filterKey: string };
  } | null;
  const [initialPagination] = useState(
    savedState?.rawPagination?.filterKey === filterKey ? savedState.rawPagination : undefined,
  );
  const pagination = useCursorPagination(initialPagination);
  const { pageSize, resetPagination, setNextCursor: updateNextCursor } = pagination;
  const activePageSizeRef = useRef(pageSize);
  const paginationPositionRef = useRef({
    pageCursors: pagination.pageCursors,
    pageIndex: pagination.pageIndex,
  });
  paginationPositionRef.current = {
    pageCursors: pagination.pageCursors,
    pageIndex: pagination.pageIndex,
  };
  const [accountError, setAccountError] = useState("");
  const rawPagination = useMemo(
    () => ({
      filterKey,
      pageSize: pagination.pageSize,
      pageIndex: pagination.pageIndex,
      pageCursors: pagination.pageCursors,
    }),
    [filterKey, pagination.pageSize, pagination.pageIndex, pagination.pageCursors],
  );
  const hasActiveFilters = Boolean(
    selectedApiCode ||
    selectedAccountId ||
    selectedSyncBatchNo ||
    selectedObservedBatchNo ||
    selectedSourcePrimaryKey ||
    selectedDataDateStart ||
    selectedDataDateEnd,
  );
  const hasVerificationContext = Boolean(verificationTaskId && selectedObservedBatchNo);
  const hasAdditionalFilters = Boolean(
    selectedSyncBatchNo || selectedSourcePrimaryKey || selectedDataDateStart || selectedDataDateEnd,
  );
  const verificationAccountName =
    accounts.find((account) => String(account.id) === selectedAccountId)?.name ??
    (selectedAccountId ? `账号 ${selectedAccountId}` : "全部账号");
  const verificationTaskPath = verificationTaskId
    ? `/jobs/${encodeURIComponent(verificationTaskId)}${
        verificationRunId ? `?runId=${encodeURIComponent(verificationRunId)}#job-diagnostics` : ""
      }`
    : null;
  const verificationRunPath = verificationRunId
    ? `/runs/${encodeURIComponent(verificationRunId)}`
    : null;
  const verificationSearchParams = hasVerificationContext
    ? {
        ...(selectedAccountId ? { jijiaAccountId: selectedAccountId } : {}),
        ...(selectedApiCode ? { apiCode: selectedApiCode } : {}),
        observedBatchNo: selectedObservedBatchNo,
        taskId: verificationTaskId,
        ...(verificationRunId ? { runId: verificationRunId } : {}),
        ...(verificationRunStatus ? { runStatus: verificationRunStatus } : {}),
        ...(verificationWindowStart ? { windowStart: verificationWindowStart } : {}),
        ...(verificationWindowEnd ? { windowEnd: verificationWindowEnd } : {}),
      }
    : {};
  const verificationFailed = ["failed", "partial_failed"].includes(verificationRunStatus);
  const emptyState = hasVerificationContext
    ? verificationFailed
      ? {
          title: "执行存在失败，未找到可验证数据",
          description: "请返回任务查看批次诊断，或打开完整技术日志定位失败请求。",
        }
      : hasAdditionalFilters
        ? {
            title: "当前附加筛选没有匹配结果",
            description: "可以清除业务主键、日期或最后观察批次条件后重新查询。",
          }
        : verificationRunStatus === "success"
          ? {
              title: "执行完成，未找到该批次关联的数据",
              description:
                "空列表不代表接口未返回数据；仅保存快照或未产生新版本时，后续同步可能覆盖批次关联。请结合执行记录核对。",
            }
          : {
              title: "该批次尚无可验证数据",
              description: "当前执行可能尚未完成，或该数据范围没有返回记录。",
            }
    : {
        title: hasActiveFilters ? "当前筛选没有匹配结果" : "尚未同步原始数据",
        description: hasActiveFilters
          ? "请调整筛选条件后重新查询。"
          : "请先启用接口策略并完成一次同步任务。",
      };

  useEffect(() => {
    api
      .listAccounts()
      .then(setAccounts)
      .catch((caught: unknown) =>
        setAccountError(getApiErrorMessage(caught, "账号筛选选项加载失败")),
      );
  }, []);

  const loadRows = useCallback(
    async function loadRows(
      cursor: string | undefined,
      generation: number,
      requestFilterKey: string,
      filters: {
        accountId: string;
        apiCode: string;
        syncBatchNo: string;
        observedBatchNo: string;
        sourcePrimaryKey: string;
        dataDateStart: string;
        dataDateEnd: string;
      },
      source: "initial" | "refresh" | "page",
    ) {
      setError("");
      try {
        const result = await api.listRawData({
          cursor,
          limit: pageSize,
          jijiaAccountId: filters.accountId ? Number(filters.accountId) : undefined,
          apiCode: filters.apiCode || undefined,
          syncBatchNo: filters.syncBatchNo || undefined,
          observedBatchNo: filters.observedBatchNo || undefined,
          sourcePrimaryKey: filters.sourcePrimaryKey || undefined,
          dataDateStart: filters.dataDateStart || undefined,
          dataDateEnd: filters.dataDateEnd || undefined,
        });
        if (
          requestGenerationRef.current !== generation ||
          activeFilterKeyRef.current !== requestFilterKey
        )
          return;
        setRows(result.items);
        updateNextCursor(result.nextCursor ?? null);
        setLastUpdatedAt(new Date());
        if (source === "refresh") setRefreshNotice("原始数据已刷新");
      } catch (caught) {
        if (
          requestGenerationRef.current === generation &&
          activeFilterKeyRef.current === requestFilterKey
        ) {
          if (cursor && caught instanceof ApiError && caught.code === "CURSOR_INVALID") {
            resetPagination();
            setPaginationNotice("原分页位置已失效，已返回第一页。");
            await loadRows(undefined, generation, requestFilterKey, filters, source);
            return;
          }
          setError(getApiErrorMessage(caught, "原始数据加载失败，请稍后重试"));
        }
      } finally {
        if (
          requestGenerationRef.current === generation &&
          activeFilterKeyRef.current === requestFilterKey
        ) {
          setLoading(false);
          setRefreshing(false);
          setLoadingPage(false);
        }
      }
    },
    [pageSize, resetPagination, updateNextCursor],
  );

  useEffect(() => {
    const generation = ++requestGenerationRef.current;
    const restorePage =
      activeFilterKeyRef.current === filterKey && activePageSizeRef.current === pageSize;
    const paginationPosition = paginationPositionRef.current;
    const cursor = restorePage
      ? paginationPosition.pageCursors[paginationPosition.pageIndex]
      : undefined;
    activeFilterKeyRef.current = filterKey;
    activePageSizeRef.current = pageSize;
    setApiCode(selectedApiCode);
    setAccountId(selectedAccountId);
    setSyncBatchNo(selectedSyncBatchNo);
    setObservedBatchNo(selectedObservedBatchNo);
    setSourcePrimaryKey(selectedSourcePrimaryKey);
    setDataDateStart(selectedDataDateStart);
    setDataDateEnd(selectedDataDateEnd);
    setRows([]);
    setRefreshNotice("");
    setLastUpdatedAt(null);
    if (!restorePage) resetPagination();
    setLoading(true);
    setError("");
    void loadRows(
      cursor,
      generation,
      filterKey,
      {
        accountId: selectedAccountId,
        apiCode: selectedApiCode,
        syncBatchNo: selectedSyncBatchNo,
        observedBatchNo: selectedObservedBatchNo,
        sourcePrimaryKey: selectedSourcePrimaryKey,
        dataDateStart: selectedDataDateStart,
        dataDateEnd: selectedDataDateEnd,
      },
      "initial",
    );

    return () => {
      if (requestGenerationRef.current === generation) {
        requestGenerationRef.current += 1;
      }
    };
  }, [
    filterKey,
    loadRows,
    pageSize,
    resetPagination,
    selectedAccountId,
    selectedApiCode,
    selectedDataDateEnd,
    selectedDataDateStart,
    selectedObservedBatchNo,
    selectedSourcePrimaryKey,
    selectedSyncBatchNo,
  ]);

  useEffect(() => {
    if (loading || JSON.stringify(savedState?.rawPagination) === JSON.stringify(rawPagination))
      return;
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: { ...location.state, rawPagination },
    });
  }, [
    loading,
    location.pathname,
    location.search,
    location.state,
    navigate,
    rawPagination,
    savedState?.rawPagination,
  ]);

  function loadPage(cursor: string | undefined) {
    setPaginationNotice("");
    setRefreshNotice("");
    const generation = ++requestGenerationRef.current;
    activeFilterKeyRef.current = filterKey;
    const source = cursor === undefined && pagination.pageIndex === 0 ? "refresh" : "page";
    if (source === "refresh") {
      setRefreshing(true);
      setRefreshNotice("");
    } else {
      setLoadingPage(true);
    }
    setError("");
    void loadRows(
      cursor,
      generation,
      filterKey,
      {
        accountId: selectedAccountId,
        apiCode: selectedApiCode,
        syncBatchNo: selectedSyncBatchNo,
        observedBatchNo: selectedObservedBatchNo,
        sourcePrimaryKey: selectedSourcePrimaryKey,
        dataDateStart: selectedDataDateStart,
        dataDateEnd: selectedDataDateEnd,
      },
      source,
    );
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const nextParams: Record<string, string> = { ...verificationSearchParams };
    if (apiCode.trim()) nextParams.apiCode = apiCode.trim();
    if (accountId) nextParams.jijiaAccountId = accountId;
    if (syncBatchNo.trim()) nextParams.syncBatchNo = syncBatchNo.trim();
    if (observedBatchNo.trim()) nextParams.observedBatchNo = observedBatchNo.trim();
    if (sourcePrimaryKey.trim()) nextParams.sourcePrimaryKey = sourcePrimaryKey.trim();
    if (dataDateStart) nextParams.dataDateStart = dataDateStart;
    if (dataDateEnd) nextParams.dataDateEnd = dataDateEnd;
    const nextFilterKey = JSON.stringify([
      accountId,
      apiCode.trim(),
      syncBatchNo.trim(),
      observedBatchNo.trim(),
      sourcePrimaryKey.trim(),
      dataDateStart,
      dataDateEnd,
    ]);
    if (nextFilterKey === filterKey) {
      pagination.resetPagination();
      loadPage(undefined);
    } else {
      setSearchParams(nextParams, { state: location.state });
    }
  }

  const columns: TableColumnsType<RawDataSummary> = [
    {
      title: "接口",
      key: "api",
      width: 220,
      render: (_, row) => (
        <div className="table-cell-stack">
          <Link
            className="m3-link"
            state={{
              from: `${location.pathname}${location.search}`,
              backLabel: "返回原始数据",
              returnState: { ...location.state, rawPagination },
            }}
            to={`/raw-data/${row.id}${location.search}`}
          >
            {row.apiCode}
          </Link>
          <small>
            {row.accountName ?? (row.jijiaAccountId ? `账号 ${row.jijiaAccountId}` : "legacy 账号")}
          </small>
        </div>
      ),
    },
    {
      title: "业务主键",
      dataIndex: "sourcePrimaryKey",
      key: "sourcePrimaryKey",
      width: 180,
      render: (value: RawDataSummary["sourcePrimaryKey"]) => value ?? "—",
    },
    {
      title: "数据日期",
      dataIndex: "dataDate",
      key: "dataDate",
      width: 130,
      render: (value: RawDataSummary["dataDate"]) => value ?? "—",
    },
    {
      title: "观察情况",
      key: "observations",
      width: 150,
      render: (_, row) => (
        <div className="table-cell-stack">
          <span>{row.observationCount ?? "—"} 次</span>
          <small>{row.versionCount ?? 0} 个历史版本</small>
        </div>
      ),
    },
    {
      title: "最后观察",
      key: "lastObservedAt",
      width: 190,
      render: (_, row) => formatDate(row.lastObservedAt ?? row.updatedAt),
    },
    {
      title: "当前批次",
      dataIndex: "batchNo",
      key: "batchNo",
      width: 200,
      render: (value: RawDataSummary["batchNo"]) => <code>{value ?? "—"}</code>,
    },
  ];

  return (
    <AppShell>
      <main className="m3-page">
        {!hasVerificationContext && returnNavigation.path !== "/raw-data" ? (
          <Link className="m3-link" to={returnNavigation.path} state={returnNavigation.state}>
            ← {returnNavigation.label}
          </Link>
        ) : null}
        <header className="page-heading">
          <div>
            <h1>原始数据</h1>
          </div>
        </header>
        {hasVerificationContext ? (
          <section
            className="m3-card raw-verification-context"
            aria-labelledby="verification-context-title"
          >
            <div className="m3-card-heading">
              <div>
                <span className="raw-verification-kicker">同步结果验证</span>
                <h2 id="verification-context-title">
                  正在验证任务 #{verificationTaskId} 的执行结果
                </h2>
                <p className="muted-copy">
                  按当前保留的批次关联查询，展示记录的当前快照；详情可查看已保存的版本。
                </p>
              </div>
              <div className="heading-actions">
                {verificationTaskPath ? (
                  <Link
                    className="action-link action-link--neutral"
                    to={verificationTaskPath}
                    state={{
                      from: `${location.pathname}${location.search}`,
                      backLabel: "返回批次数据",
                      returnState: { ...location.state, rawPagination },
                    }}
                  >
                    返回任务
                  </Link>
                ) : null}
                {verificationRunPath ? (
                  <Link
                    className="m3-link"
                    to={verificationRunPath}
                    state={{
                      from: `${location.pathname}${location.search}`,
                      backLabel: "返回批次数据",
                      returnState: { ...location.state, rawPagination },
                    }}
                  >
                    查看技术日志
                  </Link>
                ) : null}
                <Link className="m3-link" to="/raw-data">
                  退出验证
                </Link>
              </div>
            </div>
            <dl className="raw-verification-meta">
              <div>
                <dt>账号</dt>
                <dd>{verificationAccountName}</dd>
              </div>
              <div>
                <dt>接口</dt>
                <dd>{selectedApiCode || "全部接口"}</dd>
              </div>
              <div>
                <dt>执行状态</dt>
                <dd>
                  {verificationRunStatus ? <Tag>{statusLabel(verificationRunStatus)}</Tag> : "—"}
                </dd>
              </div>
              <div>
                <dt>数据范围</dt>
                <dd>
                  {verificationWindowStart && verificationWindowEnd
                    ? `${verificationWindowStart} 至 ${verificationWindowEnd}`
                    : "完整接口数据"}
                </dd>
              </div>
              <div>
                <dt>观察批次</dt>
                <dd>
                  <code>{selectedObservedBatchNo}</code>
                </dd>
              </div>
            </dl>
          </section>
        ) : null}
        <form className="m3-filter raw-data-filter" onSubmit={submit}>
          <section className="raw-data-filter-section" aria-label="常用筛选">
            <div className="raw-data-filter-grid raw-data-filter-grid--primary">
              <label htmlFor="raw-account-id">
                积加账号
                <Select
                  aria-label="积加账号"
                  id="raw-account-id"
                  options={[
                    { label: "全部账号", value: "" },
                    ...accounts.map((account) => ({
                      label: account.name,
                      value: String(account.id),
                    })),
                  ]}
                  value={accountId}
                  onChange={setAccountId}
                />
              </label>
              <label htmlFor="raw-api-code">
                接口编码
                <Input
                  id="raw-api-code"
                  value={apiCode}
                  placeholder="例如 sale_return_order_page"
                  onChange={(event) => setApiCode(event.target.value)}
                />
              </label>
              <label htmlFor="raw-source-key">
                业务主键
                <Input
                  id="raw-source-key"
                  value={sourcePrimaryKey}
                  placeholder="精确匹配业务主键"
                  onChange={(event) => setSourcePrimaryKey(event.target.value)}
                />
              </label>
            </div>
          </section>

          <details
            className="raw-data-filter-section raw-data-filter-advanced"
            key={filterKey}
            open={Boolean(
              selectedDataDateStart ||
              selectedDataDateEnd ||
              selectedSyncBatchNo ||
              selectedObservedBatchNo,
            )}
          >
            <summary>日期与批次筛选</summary>
            <div className="raw-data-filter-grid raw-data-filter-grid--advanced">
              <label htmlFor="raw-data-date-start">
                数据开始日期
                <Input
                  id="raw-data-date-start"
                  type="date"
                  value={dataDateStart}
                  onChange={(event) => setDataDateStart(event.target.value)}
                />
              </label>
              <label htmlFor="raw-data-date-end">
                数据结束日期
                <Input
                  id="raw-data-date-end"
                  type="date"
                  value={dataDateEnd}
                  onChange={(event) => setDataDateEnd(event.target.value)}
                />
              </label>
              <div className="raw-data-filter-field">
                <label htmlFor="raw-sync-batch-no">
                  最后观察批次号
                  <Input
                    aria-describedby="raw-sync-batch-help"
                    id="raw-sync-batch-no"
                    value={syncBatchNo}
                    placeholder="例如 sync_20260826_001"
                    onChange={(event) => setSyncBatchNo(event.target.value)}
                  />
                </label>
              </div>
              <div className="raw-data-filter-field">
                <label htmlFor="raw-observed-batch-no">
                  曾观察批次号
                  <Input
                    aria-describedby="raw-observed-batch-help"
                    id="raw-observed-batch-no"
                    value={observedBatchNo}
                    placeholder="例如 sync_20260826_001"
                    onChange={(event) => setObservedBatchNo(event.target.value)}
                  />
                </label>
              </div>
              <div className="raw-data-filter-note" role="note">
                <small id="raw-sync-batch-help">
                  筛选当前记录的最后观察批次；不代表当前 JSON 由该批次形成。
                </small>
                <small id="raw-observed-batch-help">
                  筛选当前快照或历史版本仍关联本批次的记录；不保证覆盖本批次的全部观察记录，列表展示当前快照。
                </small>
              </div>
            </div>
          </details>

          <footer className="raw-data-filter-actions">
            <small className="timezone-note">{timeZoneNote()}</small>
            <div>
              {hasAdditionalFilters || (!hasVerificationContext && hasActiveFilters) ? (
                <Button
                  onClick={() =>
                    setSearchParams(verificationSearchParams, { state: location.state })
                  }
                >
                  {hasVerificationContext ? "清除附加筛选" : "重置筛选"}
                </Button>
              ) : null}
              <Button
                htmlType="submit"
                type="primary"
                loading={loading || refreshing || loadingPage}
              >
                查询
              </Button>
            </div>
          </footer>
        </form>
        {paginationNotice ? (
          <Alert
            className="page-alert"
            role="status"
            title={paginationNotice}
            showIcon
            type="warning"
          />
        ) : null}
        {accountError ? (
          <Alert className="page-alert" role="alert" title={accountError} showIcon type="error" />
        ) : null}
        {error ? (
          <Alert
            className="page-alert"
            role="alert"
            title={error}
            showIcon
            type={rows.length > 0 ? "warning" : "error"}
            action={
              <Button
                onClick={() => loadPage(pagination.pageCursors[pagination.pageIndex])}
                loading={loading || refreshing || loadingPage}
              >
                重试
              </Button>
            }
          />
        ) : null}
        <section className="m3-card" aria-labelledby="raw-title">
          <div className="m3-card-heading">
            <h2 id="raw-title">当前快照</h2>
            <div>
              <span>
                {loading
                  ? "正在查询"
                  : loadingPage
                    ? "正在切换页面"
                    : `第 ${pagination.pageIndex + 1} 页 · ${rows.length} 条`}
                {hasActiveFilters ? " · 已应用筛选" : ""}
              </span>
              <RefreshStatus
                failedWithPreviousData={Boolean(error && rows.length)}
                lastUpdatedAt={lastUpdatedAt}
                manualRefreshMessage={refreshNotice}
                refreshing={refreshing}
              />
            </div>
          </div>
          <Table<RawDataSummary>
            aria-label="原始数据当前快照列表"
            columns={columns}
            dataSource={rows}
            loading={{
              spinning: loading || loadingPage,
              description: loading ? "正在加载原始数据…" : "正在更新数据…",
            }}
            locale={{
              emptyText:
                loading || error ? null : (
                  <Empty description={emptyState.title}>
                    <span>{emptyState.description}</span>
                  </Empty>
                ),
            }}
            pagination={false}
            rowKey={(row) => String(row.id)}
            scroll={{ x: 1070 }}
          />
          <CursorPagination
            controller={pagination}
            itemCount={rows.length}
            loadPage={loadPage}
            loading={loading || refreshing || loadingPage}
          />
        </section>
      </main>
    </AppShell>
  );
}
