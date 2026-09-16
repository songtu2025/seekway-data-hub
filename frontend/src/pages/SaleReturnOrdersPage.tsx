import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Empty, Input, Select, Table, Tag, type TableColumnsType } from "antd";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import { api } from "../api/client";
import type { JijiaAccount, SaleReturnOrder } from "../api/types";
import { AppShell } from "../components/AppShell";
import { CursorPagination } from "../components/CursorPagination";
import { DataSyncPanel } from "../components/DataSyncPanel";
import { RefreshStatus } from "../components/RefreshStatus";
import { useCursorPagination } from "../hooks/useCursorPagination";
import { getApiErrorMessage } from "./m3Utils";

const SALE_RETURN_API_CODE = "sale_return_order_page";

interface ReturnFilters {
  accountId: string;
  status: string;
  returnDateStart: string;
  returnDateEnd: string;
  orderId: string;
  sku: string;
  reason: string;
  disposition: string;
  fulfillmentCenterId: string;
}

function marketDateTime(value?: string | null): string {
  return value ? value.replace("T", " ") : "—";
}

export function SaleReturnOrdersPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedFilters = useMemo<ReturnFilters>(
    () => ({
      accountId: searchParams.get("jijiaAccountId") ?? "",
      status: searchParams.get("status") ?? "",
      returnDateStart: searchParams.get("returnDateStart") ?? "",
      returnDateEnd: searchParams.get("returnDateEnd") ?? "",
      orderId: searchParams.get("orderId") ?? "",
      sku: searchParams.get("sku") ?? "",
      reason: searchParams.get("reason") ?? "",
      disposition: searchParams.get("disposition") ?? "",
      fulfillmentCenterId: searchParams.get("fulfillmentCenterId") ?? "",
    }),
    [searchParams],
  );
  const filterKey = JSON.stringify(selectedFilters);
  const activeFilterKeyRef = useRef(filterKey);
  const requestGenerationRef = useRef(0);
  const [filters, setFilters] = useState(selectedFilters);
  const [orders, setOrders] = useState<SaleReturnOrder[]>([]);
  const [accounts, setAccounts] = useState<JijiaAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingPage, setLoadingPage] = useState(false);
  const [error, setError] = useState("");
  const [refreshNotice, setRefreshNotice] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [accountError, setAccountError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<SaleReturnOrder | null>(null);
  const hasActiveFilters = Object.values(selectedFilters).some(Boolean);
  const pagination = useCursorPagination(undefined, filterKey);
  const { pageSize, restorePagination, setNextCursor: updateNextCursor } = pagination;

  useEffect(() => {
    api
      .listAccounts()
      .then(setAccounts)
      .catch((caught: unknown) =>
        setAccountError(getApiErrorMessage(caught, "账号筛选选项加载失败")),
      );
  }, []);

  const loadOrders = useCallback(
    async (
      cursor: string | undefined,
      generation: number,
      requestFilterKey: string,
      requestFilters: ReturnFilters,
      source: "initial" | "refresh" | "page",
    ) => {
      setError("");
      try {
        const result = await api.listSaleReturnOrders({
          cursor,
          limit: pageSize,
          jijiaAccountId: requestFilters.accountId ? Number(requestFilters.accountId) : undefined,
          status: requestFilters.status || undefined,
          returnDateStart: requestFilters.returnDateStart || undefined,
          returnDateEnd: requestFilters.returnDateEnd || undefined,
          orderId: requestFilters.orderId || undefined,
          sku: requestFilters.sku || undefined,
          ...(requestFilters.reason ? { reason: requestFilters.reason } : {}),
          ...(requestFilters.disposition ? { disposition: requestFilters.disposition } : {}),
          ...(requestFilters.fulfillmentCenterId
            ? { fulfillmentCenterId: requestFilters.fulfillmentCenterId }
            : {}),
        });
        if (
          requestGenerationRef.current !== generation ||
          activeFilterKeyRef.current !== requestFilterKey
        )
          return;
        setOrders(result.items);
        updateNextCursor(result.nextCursor ?? null);
        setLastUpdatedAt(new Date());
        if (source === "refresh") setRefreshNotice("退货订单已刷新");
      } catch (caught) {
        if (
          requestGenerationRef.current === generation &&
          activeFilterKeyRef.current === requestFilterKey
        )
          setError(getApiErrorMessage(caught, "退货订单加载失败，请稍后重试"));
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
    [pageSize, updateNextCursor],
  );

  useEffect(() => {
    const generation = ++requestGenerationRef.current;
    activeFilterKeyRef.current = filterKey;
    setFilters(selectedFilters);
    setOrders([]);
    setRefreshNotice("");
    setLastUpdatedAt(null);
    const cursor = restorePagination();
    setLoading(true);
    setError("");
    setSelectedOrder(null);
    void loadOrders(cursor, generation, filterKey, selectedFilters, "initial");
    return () => {
      if (requestGenerationRef.current === generation) requestGenerationRef.current += 1;
    };
  }, [filterKey, loadOrders, pageSize, restorePagination, selectedFilters]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextParams: Record<string, string> = {};
    if (filters.accountId) nextParams.jijiaAccountId = filters.accountId;
    if (filters.status.trim()) nextParams.status = filters.status.trim();
    if (filters.returnDateStart) nextParams.returnDateStart = filters.returnDateStart;
    if (filters.returnDateEnd) nextParams.returnDateEnd = filters.returnDateEnd;
    if (filters.orderId.trim()) nextParams.orderId = filters.orderId.trim();
    if (filters.sku.trim()) nextParams.sku = filters.sku.trim();
    if (filters.reason.trim()) nextParams.reason = filters.reason.trim();
    if (filters.disposition.trim()) nextParams.disposition = filters.disposition.trim();
    if (filters.fulfillmentCenterId.trim()) {
      nextParams.fulfillmentCenterId = filters.fulfillmentCenterId.trim();
    }
    if (
      Object.values(selectedFilters).filter(Boolean).length === Object.keys(nextParams).length &&
      Object.entries(nextParams).every(([key, value]) => searchParams.get(key) === value)
    ) {
      if (!loading && !refreshing && !loadingPage) refreshCurrentData();
    } else {
      setSearchParams(nextParams);
    }
  }

  function updateFilter(name: keyof ReturnFilters, value: string) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function refreshCurrentData() {
    const generation = ++requestGenerationRef.current;
    activeFilterKeyRef.current = filterKey;
    pagination.resetPagination();
    setRefreshing(true);
    setRefreshNotice("");
    setError("");
    setSelectedOrder(null);
    void loadOrders(undefined, generation, filterKey, selectedFilters, "refresh");
  }

  function loadPage(cursor: string | undefined) {
    const generation = ++requestGenerationRef.current;
    activeFilterKeyRef.current = filterKey;
    setLoadingPage(true);
    setRefreshNotice("");
    setError("");
    setSelectedOrder(null);
    void loadOrders(cursor, generation, filterKey, selectedFilters, "page");
  }

  const columns: TableColumnsType<SaleReturnOrder> = [
    {
      title: "退货时间",
      dataIndex: "returnDateTime",
      key: "returnDateTime",
      width: 180,
      render: (value: SaleReturnOrder["returnDateTime"]) => marketDateTime(value),
    },
    {
      title: "订单与商品",
      key: "order",
      width: 280,
      render: (_, order) => (
        <div className="table-cell-stack">
          <Button type="link" onClick={() => setSelectedOrder(order)}>
            {order.orderId ?? order.sourcePrimaryKey}
          </Button>
          <small>{order.sellerOrderId ?? "—"}</small>
          <span className="table-secondary">{order.sku ?? "—"}</span>
          <small>{order.asin ?? order.productName ?? "—"}</small>
        </div>
      ),
    },
    {
      title: "数量与状态",
      key: "quantity",
      width: 150,
      render: (_, order) => (
        <div className="table-cell-stack">
          <strong>{order.quantity ?? "—"}</strong>
          <Tag>{order.status ?? "—"}</Tag>
        </div>
      ),
    },
    {
      title: "库存属性",
      dataIndex: "disposition",
      key: "disposition",
      width: 150,
      render: (value: SaleReturnOrder["disposition"]) => value ?? "—",
    },
    {
      title: "原因与仓库",
      key: "reason",
      width: 230,
      render: (_, order) => (
        <div className="table-cell-stack">
          {order.reason ?? "—"}
          <small>{order.fulfillmentCenterId ?? "—"}</small>
          <small>{order.accountName ?? `账号 ${order.jijiaAccountId}`}</small>
        </div>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 110,
      render: (_, order) => (
        <Button type="link" onClick={() => setSelectedOrder(order)}>
          查看详情
        </Button>
      ),
    },
  ];

  return (
    <AppShell>
      <main className="m3-page">
        <header className="page-heading">
          <div>
            <h1>退货订单</h1>
          </div>
        </header>
        <DataSyncPanel
          accounts={accounts}
          apiCode={SALE_RETURN_API_CODE}
          loadedCount={orders.length}
          selectedAccountId={selectedFilters.accountId}
          onSynced={refreshCurrentData}
          preservePageOnSync={pagination.pageIndex > 0}
        />
        <form className="m3-filter sale-return-filter" onSubmit={submit}>
          <label htmlFor="return-account">
            积加账号
            <Select
              aria-label="积加账号"
              id="return-account"
              options={[
                { label: "全部账号", value: "" },
                ...accounts.map((account) => ({ label: account.name, value: String(account.id) })),
              ]}
              value={filters.accountId}
              onChange={(value) => updateFilter("accountId", value)}
            />
          </label>
          <label htmlFor="return-status">
            退货状态
            <Input
              id="return-status"
              value={filters.status}
              onChange={(event) => updateFilter("status", event.target.value)}
            />
          </label>
          <label htmlFor="return-date-start">
            退货开始日期
            <Input
              id="return-date-start"
              type="date"
              value={filters.returnDateStart}
              onChange={(event) => updateFilter("returnDateStart", event.target.value)}
            />
          </label>
          <label htmlFor="return-date-end">
            退货结束日期
            <Input
              id="return-date-end"
              type="date"
              value={filters.returnDateEnd}
              onChange={(event) => updateFilter("returnDateEnd", event.target.value)}
            />
          </label>
          <label htmlFor="return-order-id">
            订单编号
            <Input
              id="return-order-id"
              value={filters.orderId}
              onChange={(event) => updateFilter("orderId", event.target.value)}
            />
          </label>
          <details
            className="sale-return-advanced"
            key={filterKey}
            open={Boolean(
              selectedFilters.sku ||
              selectedFilters.reason ||
              selectedFilters.disposition ||
              selectedFilters.fulfillmentCenterId,
            )}
          >
            <summary>商品与仓库筛选</summary>
            <div className="sale-return-advanced-fields">
              <label htmlFor="return-sku">
                SKU
                <Input
                  id="return-sku"
                  value={filters.sku}
                  onChange={(event) => updateFilter("sku", event.target.value)}
                />
              </label>
              <label htmlFor="return-reason">
                退货原因
                <Input
                  id="return-reason"
                  list="return-reason-options"
                  value={filters.reason}
                  onChange={(event) => updateFilter("reason", event.target.value)}
                />
              </label>
              <datalist id="return-reason-options">
                {[
                  ...new Set(
                    orders
                      .map((order) => order.reason)
                      .filter((value): value is string => Boolean(value)),
                  ),
                ].map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
              <label htmlFor="return-disposition">
                库存属性
                <Input
                  id="return-disposition"
                  list="return-disposition-options"
                  value={filters.disposition}
                  onChange={(event) => updateFilter("disposition", event.target.value)}
                />
              </label>
              <datalist id="return-disposition-options">
                {[
                  ...new Set(
                    orders
                      .map((order) => order.disposition)
                      .filter((value): value is string => Boolean(value)),
                  ),
                ].map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
              <label htmlFor="return-warehouse">
                仓库
                <Input
                  id="return-warehouse"
                  value={filters.fulfillmentCenterId}
                  onChange={(event) => updateFilter("fulfillmentCenterId", event.target.value)}
                />
              </label>
            </div>
          </details>
          <div className="sale-return-filter-actions">
            <div>
              <Button htmlType="submit" type="primary">
                查询
              </Button>
              {hasActiveFilters ? (
                <Button type="link" onClick={() => setSearchParams({})}>
                  重置筛选
                </Button>
              ) : null}
            </div>
            <small className="timezone-note">退货时间按积加返回的市场时间展示</small>
          </div>
        </form>
        {error || accountError ? (
          <Alert
            className="page-alert"
            role="alert"
            title={error || accountError}
            showIcon
            type={orders.length > 0 ? "warning" : "error"}
          />
        ) : null}
        <section className="m3-card" aria-labelledby="sale-return-title">
          <div className="m3-card-heading">
            <h2 id="sale-return-title">当前记录</h2>
            <div>
              <span>
                {loading
                  ? "正在查询"
                  : loadingPage
                    ? "正在切换页面"
                    : `第 ${pagination.pageIndex + 1} 页 · ${orders.length} 条`}
                {hasActiveFilters ? " · 已应用筛选" : ""}
              </span>
              <RefreshStatus
                failedWithPreviousData={Boolean(error && orders.length)}
                lastUpdatedAt={lastUpdatedAt}
                manualRefreshMessage={refreshNotice}
                refreshing={refreshing}
              />
            </div>
          </div>
          <Table<SaleReturnOrder>
            aria-label="退货订单当前记录列表"
            columns={columns}
            dataSource={orders}
            loading={{
              spinning: loading || loadingPage,
              description: loading ? "正在加载退货订单…" : "正在更新数据…",
            }}
            locale={{
              emptyText:
                loading || error ? null : (
                  <Empty
                    description={
                      hasActiveFilters ? "暂无符合条件的退货订单" : "尚未同步退货订单接口"
                    }
                  >
                    {hasActiveFilters ? (
                      <Button type="link" onClick={() => setSearchParams({})}>
                        重置筛选
                      </Button>
                    ) : (
                      <Link className="m3-link" to="/accounts">
                        配置账号接口策略
                      </Link>
                    )}
                  </Empty>
                ),
            }}
            pagination={false}
            rowKey={(order) => String(order.id)}
            scroll={{ x: 1100 }}
          />
          <CursorPagination
            controller={pagination}
            itemCount={orders.length}
            loadPage={loadPage}
            loading={loading || refreshing || loadingPage}
          />
        </section>
        {selectedOrder ? (
          <aside className="return-detail" aria-label="退货订单详情">
            <div className="m3-card-heading">
              <h2>退货订单详情</h2>
              <Button type="link" onClick={() => setSelectedOrder(null)}>
                关闭
              </Button>
            </div>
            <dl className="return-detail-grid">
              <div>
                <dt>退货时间</dt>
                <dd>{marketDateTime(selectedOrder.returnDateTime)}</dd>
              </div>
              <div>
                <dt>订单</dt>
                <dd>{selectedOrder.orderId ?? selectedOrder.sourcePrimaryKey}</dd>
              </div>
              <div>
                <dt>SKU / ASIN</dt>
                <dd>
                  {selectedOrder.sku ?? "—"} / {selectedOrder.asin ?? "—"}
                </dd>
              </div>
              <div>
                <dt>商品</dt>
                <dd>{selectedOrder.productName ?? "—"}</dd>
              </div>
              <div>
                <dt>数量 / 状态</dt>
                <dd>
                  {selectedOrder.quantity ?? "—"} / {selectedOrder.status ?? "—"}
                </dd>
              </div>
              <div>
                <dt>原因 / 库存属性</dt>
                <dd>
                  {selectedOrder.reason ?? "—"} / {selectedOrder.disposition ?? "—"}
                </dd>
              </div>
              <div>
                <dt>仓库</dt>
                <dd>{selectedOrder.fulfillmentCenterId ?? "—"}</dd>
              </div>
              <div>
                <dt>账号 / 批次</dt>
                <dd>
                  {selectedOrder.accountName ?? `账号 ${selectedOrder.jijiaAccountId}`} /{" "}
                  {selectedOrder.syncBatchNo}
                </dd>
              </div>
            </dl>
            <Link
              className="action-link action-link--primary"
              state={{
                from: `${location.pathname}${location.search}`,
                backLabel: "返回退货订单",
                returnState: pagination.returnState,
              }}
              to={`/raw-data/${selectedOrder.rawDataId}`}
            >
              查看原始记录与版本
            </Link>
          </aside>
        ) : null}
      </main>
    </AppShell>
  );
}
