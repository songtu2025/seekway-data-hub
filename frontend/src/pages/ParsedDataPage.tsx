import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Empty, Input, Select, Table, type TableColumnsType } from "antd";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import { api } from "../api/client";
import type { JijiaAccount, ParsedDataItem, ParsedDataset } from "../api/types";
import { AppShell } from "../components/AppShell";
import { CursorPagination } from "../components/CursorPagination";
import { DataSyncPanel } from "../components/DataSyncPanel";
import { RefreshStatus } from "../components/RefreshStatus";
import { useCursorPagination } from "../hooks/useCursorPagination";
import { getApiErrorMessage } from "./m3Utils";

interface DataColumn {
  label: string;
  keys: string[];
}

interface DatasetConfig {
  title: string;
  apiCode: string;
  searchPlaceholder: string;
  columns: DataColumn[];
}

const datasetConfigs: Record<ParsedDataset, DatasetConfig> = {
  stores: {
    title: "店铺信息",
    apiCode: "amazon_shop_page",
    searchPlaceholder: "搜索店铺、站点或国家",
    columns: [
      { label: "店铺与站点", keys: ["store", "marketName"] },
      { label: "国家与区域", keys: ["countryName", "areaName"] },
      { label: "接口授权", keys: ["apiState", "authType"] },
      { label: "广告授权", keys: ["adsState"] },
      { label: "关联仓库", keys: ["warehouseName"] },
      { label: "添加时间", keys: ["recordDate"] },
    ],
  },
  products: {
    title: "产品资料",
    apiCode: "product_page",
    searchPlaceholder: "搜索 SKU、产品名或品牌",
    columns: [
      { label: "SKU 与产品", keys: ["sku", "name", "briefName"] },
      { label: "品牌与品类", keys: ["brandName", "categoryName"] },
      { label: "产品类型", keys: ["productTypeName"] },
      { label: "状态", keys: ["stateName"] },
      { label: "单位", keys: ["unit"] },
      { label: "更新时间", keys: ["lastDate"] },
    ],
  },
  inventory: {
    title: "FBA 库存",
    apiCode: "fba_inventory_v2_page",
    searchPlaceholder: "搜索 SKU、MSKU、ASIN 或产品名",
    columns: [
      { label: "SKU 与 MSKU", keys: ["sku", "msku", "fnsku"] },
      { label: "产品", keys: ["productName", "asin"] },
      { label: "仓库", keys: ["warehouseName"] },
      { label: "可售", keys: ["afnFulfillableQuantity"] },
      { label: "预留与在途", keys: ["reserved", "inTransitQty"] },
      { label: "总库存与周转", keys: ["totalInventoryQty", "availableTurnoverDays"] },
    ],
  },
  warehouses: {
    title: "FBA 仓库",
    apiCode: "fba_warehouse_page",
    searchPlaceholder: "搜索仓库、店铺或国家",
    columns: [
      { label: "仓库", keys: ["name", "typeName"] },
      { label: "店铺", keys: ["marketName"] },
      { label: "地区", keys: ["country", "stateStr"] },
      { label: "状态", keys: ["statusName"] },
      { label: "采购方式", keys: ["fbaProcurementMethodName"] },
      { label: "中转仓", keys: ["transferWarehouseName"] },
    ],
  },
};

export function ParsedDataPage({ dataset }: { dataset: ParsedDataset }) {
  const location = useLocation();
  const config = datasetConfigs[dataset];
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedAccountId = searchParams.get("jijiaAccountId") ?? "";
  const selectedKeyword = searchParams.get("keyword") ?? "";
  const filterKey = `${dataset}:${selectedAccountId}:${selectedKeyword}`;
  const requestRef = useRef(0);
  const [accountId, setAccountId] = useState(selectedAccountId);
  const [keyword, setKeyword] = useState(selectedKeyword);
  const [accounts, setAccounts] = useState<JijiaAccount[]>([]);
  const [items, setItems] = useState<ParsedDataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingPage, setLoadingPage] = useState(false);
  const [error, setError] = useState("");
  const [refreshNotice, setRefreshNotice] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [accountError, setAccountError] = useState("");
  const pagination = useCursorPagination(undefined, filterKey);
  const { pageSize, restorePagination, setNextCursor: updateNextCursor } = pagination;

  const load = useCallback(
    async (
      cursor: string | undefined,
      requestId: number,
      requestAccountId: string,
      requestKeyword: string,
      source: "initial" | "refresh" | "page",
    ) => {
      try {
        const result = await api.listParsedData(dataset, {
          cursor,
          limit: pageSize,
          jijiaAccountId: requestAccountId ? Number(requestAccountId) : undefined,
          keyword: requestKeyword || undefined,
        });
        if (requestRef.current !== requestId) return;
        setItems(result.items);
        updateNextCursor(result.nextCursor ?? null);
        setLastUpdatedAt(new Date());
        setError("");
        if (source === "refresh") setRefreshNotice(`${config.title}已刷新`);
      } catch (caught) {
        if (requestRef.current === requestId) {
          setError(getApiErrorMessage(caught, `${config.title}加载失败，请稍后重试`));
        }
      } finally {
        if (requestRef.current === requestId) {
          setLoading(false);
          setRefreshing(false);
          setLoadingPage(false);
        }
      }
    },
    [config.title, dataset, pageSize, updateNextCursor],
  );

  useEffect(() => {
    api
      .listAccounts()
      .then(setAccounts)
      .catch((caught: unknown) => {
        setAccountError(getApiErrorMessage(caught, "账号筛选选项加载失败"));
      });
  }, []);

  useEffect(() => {
    const requestId = ++requestRef.current;
    setAccountId(selectedAccountId);
    setKeyword(selectedKeyword);
    setItems([]);
    setRefreshNotice("");
    setLastUpdatedAt(null);
    const cursor = restorePagination();
    setLoading(true);
    setError("");
    void load(cursor, requestId, selectedAccountId, selectedKeyword, "initial");
    return () => {
      if (requestRef.current === requestId) requestRef.current += 1;
    };
  }, [filterKey, load, pageSize, restorePagination, selectedAccountId, selectedKeyword]);

  function refreshCurrentData() {
    const requestId = ++requestRef.current;
    pagination.resetPagination();
    setRefreshing(true);
    setRefreshNotice("");
    setError("");
    void load(undefined, requestId, selectedAccountId, selectedKeyword, "refresh");
  }

  function loadPage(cursor: string | undefined) {
    const requestId = ++requestRef.current;
    setLoadingPage(true);
    setRefreshNotice("");
    setError("");
    void load(cursor, requestId, selectedAccountId, selectedKeyword, "page");
  }

  const columns: TableColumnsType<ParsedDataItem> = config.columns.map((column, index) => ({
    title: column.label,
    key: column.label,
    width: index === 0 ? 220 : 170,
    render: (_, item) => {
      const values = column.keys.map((key) => displayValue(item.fields[key]));
      const content = (
        <>
          <strong>{values[0]}</strong>
          {values.slice(1).map((value, valueIndex) => (
            <small key={`${column.label}-${valueIndex}`}>{value}</small>
          ))}
        </>
      );
      return index === 0 ? (
        <div className="table-cell-stack">
          {content}
          <small>{item.accountName}</small>
        </div>
      ) : (
        <div className="table-cell-stack">{content}</div>
      );
    },
  }));

  columns.push({
    title: "操作",
    key: "actions",
    width: 140,
    render: (_, item) => (
      <Link
        className="m3-link"
        to={`/raw-data/${item.rawDataId}`}
        state={{
          from: `${location.pathname}${location.search}`,
          backLabel: `返回${config.title}`,
          returnState: pagination.returnState,
        }}
      >
        查看原始记录
      </Link>
    ),
  });

  return (
    <AppShell>
      <main className="m3-page parsed-data-page">
        <header className="page-heading">
          <div>
            <h1>{config.title}</h1>
          </div>
        </header>
        <DataSyncPanel
          accounts={accounts}
          apiCode={config.apiCode}
          loadedCount={items.length}
          selectedAccountId={selectedAccountId}
          onSynced={refreshCurrentData}
          preservePageOnSync={pagination.pageIndex > 0}
        />
        <form
          className="m3-filter parsed-data-filter"
          onSubmit={(event) => {
            event.preventDefault();
            const next = new URLSearchParams();
            if (accountId) next.set("jijiaAccountId", accountId);
            if (keyword.trim()) next.set("keyword", keyword.trim());
            if (accountId === selectedAccountId && keyword.trim() === selectedKeyword) {
              if (!loading && !refreshing && !loadingPage) refreshCurrentData();
            } else {
              setSearchParams(next);
            }
          }}
        >
          <label htmlFor={`${dataset}-account`}>
            积加账号
            <Select
              aria-label="积加账号"
              id={`${dataset}-account`}
              options={[
                { label: "全部账号", value: "" },
                ...accounts.map((account) => ({ label: account.name, value: String(account.id) })),
              ]}
              value={accountId}
              onChange={setAccountId}
            />
          </label>
          <label htmlFor={`${dataset}-keyword`}>
            关键词
            <Input
              id={`${dataset}-keyword`}
              value={keyword}
              placeholder={config.searchPlaceholder}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </label>
          <Button htmlType="submit" type="primary">
            查询
          </Button>
          {selectedAccountId || selectedKeyword ? (
            <Button type="link" onClick={() => setSearchParams({})}>
              清除筛选
            </Button>
          ) : null}
        </form>
        {error || accountError ? (
          <Alert
            className="page-alert"
            role="alert"
            title={error || accountError}
            showIcon
            type={items.length > 0 ? "warning" : "error"}
          />
        ) : null}
        <section className="m3-card" aria-labelledby={`${dataset}-title`}>
          <div className="m3-card-heading">
            <h2 id={`${dataset}-title`}>当前数据</h2>
            <div>
              <span>
                {loading
                  ? "正在查询"
                  : loadingPage
                    ? "正在切换页面"
                    : `第 ${pagination.pageIndex + 1} 页 · ${items.length} 条`}
              </span>
              <RefreshStatus
                failedWithPreviousData={Boolean(error && items.length)}
                lastUpdatedAt={lastUpdatedAt}
                manualRefreshMessage={refreshNotice}
                refreshing={refreshing}
              />
            </div>
          </div>
          <Table<ParsedDataItem>
            aria-label={`${config.title}列表`}
            columns={columns}
            dataSource={items}
            loading={{
              spinning: loading || loadingPage,
              description: loading ? `正在加载${config.title}…` : "正在更新数据…",
            }}
            locale={{
              emptyText:
                loading || error ? null : (
                  <Empty
                    description={
                      selectedAccountId || selectedKeyword
                        ? `没有符合条件的${config.title}数据`
                        : `尚无${config.title}数据`
                    }
                  >
                    {selectedAccountId || selectedKeyword ? (
                      <p>请调整或清除筛选条件后重试。</p>
                    ) : (
                      <p>接口编码：{config.apiCode}。同步完成后将在此展示解析结果。</p>
                    )}
                  </Empty>
                ),
            }}
            pagination={false}
            rowKey="id"
            scroll={{ x: Math.max(900, config.columns.length * 170) }}
          />
          <CursorPagination
            controller={pagination}
            itemCount={items.length}
            loadPage={loadPage}
            loading={loading || refreshing || loadingPage}
          />
        </section>
      </main>
    </AppShell>
  );
}

function displayValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}
