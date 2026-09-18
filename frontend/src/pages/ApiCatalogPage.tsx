import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Drawer, Empty, Input, Select, Switch, Table, Tabs, Tag } from "antd";
import type { TableColumnsType } from "antd";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { ApiCatalogItem, ApiPolicy, JijiaAccount, OfficialApiCatalogItem } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { AppShell } from "../components/AppShell";
import { RefreshStatus } from "../components/RefreshStatus";
import { responsiveTableCell } from "../components/responsiveTable";
import { useUrlSearchInput } from "../hooks/useUrlSearchInput";
import { businessDomainKey, businessDomainLabel } from "../businessDomains";
import { buildPolicyUpdate } from "../policyUtils";
import { ConnectedCatalogDetail, OfficialCatalogDetail } from "./ApiCatalogDetails";
import { formatDate, getApiErrorMessage, statusLabel } from "./m3Utils";

const classificationLabels: Record<string, string> = {
  direct_read_candidate: "直读候选",
  requires_upstream_params: "需要上游参数",
  sensitive_review: "敏感字段审核",
  write_or_mutation: "写入类，暂不接入",
  unsupported_shape_review: "响应结构待适配",
};
function classificationLabel(value?: string | null) {
  return value ? (classificationLabels[value] ?? value) : "未分类";
}

const quickFilters = [
  { value: "", label: "全部" },
  { value: "enabled", label: "本账号已启用" },
  { value: "disabled", label: "本账号未启用" },
  { value: "failed", label: "最近运行失败" },
  { value: "data", label: "已有数据" },
];
function matchesStatus(item: ApiCatalogItem, status: string) {
  if (status === "enabled") return Boolean(item.accountEnabled);
  if (status === "disabled") return !item.accountEnabled;
  if (status === "failed") return ["failed", "partial_failed"].includes(item.recentRunStatus ?? "");
  if (status === "data") return Boolean(item.hasData);
  return true;
}
function officialDomain(item: OfficialApiCatalogItem) {
  return item.menuPath.split(/\s*>\s*/)[0] || "未分类";
}
function matchesConnectedDomain(item: ApiCatalogItem, domain: string) {
  return !domain || businessDomainKey(item) === domain || item.domain === domain;
}

export function ApiCatalogPage() {
  const { csrfToken, user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "operator";
  const location = useLocation();
  const detailTrigger = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useSearchParams();
  const view = query.get("view") === "official" ? "official" : "connected";
  const accountId = query.get("account") ?? "";
  const urlSearch = query.get("q") ?? "";
  const { inputProps: searchInputProps, value: search } = useUrlSearchInput(urlSearch, (value) =>
    updateQuery({ q: value }, true, true),
  );
  const domain = query.get("domain") ?? "";
  const platform = query.get("platform") ?? "";
  const status = query.get("status") ?? "";
  const page = Math.max(1, Number(query.get("page")) || 1);
  const requestedSize = Number(query.get("pageSize"));
  const pageSize = [10, 20, 50].includes(requestedSize) ? requestedSize : 10;
  const [accounts, setAccounts] = useState<JijiaAccount[]>([]);
  const [connected, setConnected] = useState<ApiCatalogItem[]>([]);
  const [official, setOfficial] = useState<OfficialApiCatalogItem[]>([]);
  const [connectedLoading, setConnectedLoading] = useState(true);
  const [officialLoading, setOfficialLoading] = useState(true);
  const [connectedLastCheckedAt, setConnectedLastCheckedAt] = useState<Date | null>(null);
  const [officialLastCheckedAt, setOfficialLastCheckedAt] = useState<Date | null>(null);
  const [connectedError, setConnectedError] = useState("");
  const [officialError, setOfficialError] = useState("");
  const [policies, setPolicies] = useState<ApiPolicy[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [policyLoadError, setPolicyLoadError] = useState("");
  const [policyUpdateError, setPolicyUpdateError] = useState("");
  const [updatingPolicyCodes, setUpdatingPolicyCodes] = useState<Set<string>>(() => new Set());
  const [loadedAccountId, setLoadedAccountId] = useState<string | null>(null);
  const [loadedPolicyAccountId, setLoadedPolicyAccountId] = useState<string | null>(null);
  const loading =
    view === "official"
      ? officialLoading
      : connectedLoading ||
        policiesLoading ||
        (loadedAccountId !== accountId && !connectedError) ||
        (Boolean(accountId) && loadedPolicyAccountId !== accountId && !policyLoadError);
  const error = view === "official" ? officialError : connectedError || policyLoadError;
  const [connectedRefresh, setConnectedRefresh] = useState(0);
  const [officialRefresh, setOfficialRefresh] = useState(0);
  const accountsCacheRef = useRef<JijiaAccount[] | null>(null);
  const accountsRequestRef = useRef<Promise<JijiaAccount[]> | null>(null);
  const connectedCacheRef = useRef(new Map<string, ApiCatalogItem[]>());
  const connectedRequestsRef = useRef(new Map<string, Promise<ApiCatalogItem[]>>());
  const officialCacheRef = useRef(new Map<number, OfficialApiCatalogItem[]>());
  const officialRequestsRef = useRef(new Map<number, Promise<OfficialApiCatalogItem[]>>());
  const policyGenerationRef = useRef(0);
  const connectedCatalogSuccessRef = useRef("");
  const connectedPolicySuccessRef = useRef("");
  const policiesByCode = useMemo(
    () =>
      new Map(
        (loadedPolicyAccountId === accountId ? policies : []).map((policy) => [
          policy.apiCode,
          policy,
        ]),
      ),
    [accountId, loadedPolicyAccountId, policies],
  );

  function updateQuery(values: Record<string, string>, resetPage = false, replace = false) {
    if ((values.api || values.doc) && document.activeElement instanceof HTMLElement)
      detailTrigger.current = document.activeElement;
    const next = new URLSearchParams(query);
    if (resetPage) ["page", "api", "doc"].forEach((key) => next.delete(key));
    Object.entries(values).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    setQuery(next, { replace });
  }
  const sourceState = { from: `${location.pathname}${location.search}`, backLabel: "返回接口中心" };
  const account = accounts.find((item) => String(item.id) === accountId);

  function refreshCurrentView() {
    if (view === "official") {
      if (officialLoading) return;
      setOfficialLoading(true);
      setOfficialRefresh(officialRefresh + 1);
    } else {
      if (connectedLoading || policiesLoading) return;
      setConnectedLoading(true);
      if (accountId) setPoliciesLoading(true);
      setConnectedRefresh(connectedRefresh + 1);
    }
  }

  useEffect(() => {
    setConnectedLastCheckedAt(null);
  }, [accountId]);

  useEffect(() => {
    if (view !== "connected") return undefined;
    const loadKey = `${accountId}:${connectedRefresh}`;
    const cachedRows = connectedCacheRef.current.get(loadKey);
    if (cachedRows) {
      setAccounts(accountsCacheRef.current ?? []);
      setConnected(cachedRows);
      setLoadedAccountId(accountId);
      setConnectedError("");
      setConnectedLoading(false);
      connectedCatalogSuccessRef.current = loadKey;
      if (!accountId || connectedPolicySuccessRef.current === loadKey) {
        setConnectedLastCheckedAt(new Date());
      }
      return undefined;
    }

    let active = true;
    setConnectedLoading(true);
    setConnectedError("");
    let accountsRequest = accountsRequestRef.current;
    if (accountsCacheRef.current) {
      accountsRequest = Promise.resolve(accountsCacheRef.current);
    } else if (!accountsRequest) {
      accountsRequest = api.listAccounts().then((rows) => {
        accountsCacheRef.current = rows;
        return rows;
      });
      accountsRequestRef.current = accountsRequest;
      const clearAccountsRequest = () => {
        if (accountsRequestRef.current === accountsRequest) accountsRequestRef.current = null;
      };
      void accountsRequest.then(clearAccountsRequest, clearAccountsRequest);
    }
    let connectedRequest = connectedRequestsRef.current.get(loadKey);
    if (!connectedRequest) {
      connectedRequest = Promise.all([
        accountsRequest,
        api.getApiCatalog(accountId ? Number(accountId) : undefined),
      ]).then(([accountRows, connectedRows]) => {
        accountsCacheRef.current = accountRows;
        connectedCacheRef.current.set(loadKey, connectedRows);
        return connectedRows;
      });
      connectedRequestsRef.current.set(loadKey, connectedRequest);
      const clearConnectedRequest = () => {
        if (connectedRequestsRef.current.get(loadKey) === connectedRequest) {
          connectedRequestsRef.current.delete(loadKey);
        }
      };
      void connectedRequest.then(clearConnectedRequest, clearConnectedRequest);
    }
    void connectedRequest
      .then((connectedRows) => {
        if (!active) return;
        setAccounts(accountsCacheRef.current ?? []);
        setConnected(connectedRows);
        setLoadedAccountId(accountId);
        connectedCatalogSuccessRef.current = loadKey;
        if (!accountId || connectedPolicySuccessRef.current === loadKey) {
          setConnectedLastCheckedAt(new Date());
        }
      })
      .catch((caught: unknown) => {
        if (active) setConnectedError(getApiErrorMessage(caught, "已接入接口加载失败"));
      })
      .finally(() => {
        if (!active) return;
        setConnectedLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accountId, connectedRefresh, view]);

  useEffect(() => {
    setPolicies([]);
    setLoadedPolicyAccountId(null);
    setPolicyLoadError("");
    setPolicyUpdateError("");
    setUpdatingPolicyCodes(new Set());
  }, [accountId]);

  useEffect(() => {
    const generation = ++policyGenerationRef.current;
    const loadKey = `${accountId}:${connectedRefresh}`;
    setPolicyLoadError("");
    if (view !== "connected" || !accountId) {
      setPoliciesLoading(false);
      return undefined;
    }

    setPoliciesLoading(true);
    void api
      .listPolicies(Number(accountId))
      .then((rows) => {
        if (policyGenerationRef.current !== generation) return;
        setPolicies(rows);
        setLoadedPolicyAccountId(accountId);
        connectedPolicySuccessRef.current = loadKey;
        if (connectedCatalogSuccessRef.current === loadKey) {
          setConnectedLastCheckedAt(new Date());
        }
      })
      .catch((caught: unknown) => {
        if (policyGenerationRef.current !== generation) return;
        setPolicyLoadError(getApiErrorMessage(caught, "账号接口策略加载失败"));
      })
      .finally(() => {
        if (policyGenerationRef.current !== generation) return;
        setPoliciesLoading(false);
      });
    return undefined;
  }, [accountId, connectedRefresh, view]);

  useEffect(() => {
    if (view !== "official") return undefined;
    const cachedRows = officialCacheRef.current.get(officialRefresh);
    if (cachedRows) {
      setOfficial(cachedRows);
      setOfficialError("");
      setOfficialLoading(false);
      setOfficialLastCheckedAt(new Date());
      return undefined;
    }

    let active = true;
    setOfficialLoading(true);
    setOfficialError("");
    let officialRequest = officialRequestsRef.current.get(officialRefresh);
    if (!officialRequest) {
      officialRequest = api.getOfficialApiCatalog().then((rows) => {
        officialCacheRef.current.set(officialRefresh, rows);
        return rows;
      });
      officialRequestsRef.current.set(officialRefresh, officialRequest);
      const clearOfficialRequest = () => {
        if (officialRequestsRef.current.get(officialRefresh) === officialRequest) {
          officialRequestsRef.current.delete(officialRefresh);
        }
      };
      void officialRequest.then(clearOfficialRequest, clearOfficialRequest);
    }
    void officialRequest
      .then((rows) => {
        if (active) {
          setOfficial(rows);
          setOfficialLastCheckedAt(new Date());
        }
      })
      .catch((caught: unknown) => {
        if (active) setOfficialError(getApiErrorMessage(caught, "官方接口目录加载失败"));
      })
      .finally(() => {
        if (!active) return;
        setOfficialLoading(false);
      });
    return () => {
      active = false;
    };
  }, [officialRefresh, view]);

  const keyword = search.trim().toLocaleLowerCase();
  const currentConnected = loadedAccountId === accountId ? connected : [];
  const visibleConnected = currentConnected.filter(
    (item) =>
      (!keyword ||
        `${item.name} ${item.apiCode} ${item.path} ${item.domain} ${businessDomainKey(item)} ${businessDomainLabel(businessDomainKey(item))}`
          .toLocaleLowerCase()
          .includes(keyword)) &&
      matchesConnectedDomain(item, domain) &&
      (!platform || Boolean(item.platformEnabled) === (platform === "enabled")) &&
      ((!accountId && ["enabled", "disabled"].includes(status)) || matchesStatus(item, status)),
  );
  const visibleOfficial = official.filter(
    (item) =>
      (!keyword ||
        `${item.name} ${item.path} ${item.menuPath}`.toLocaleLowerCase().includes(keyword)) &&
      (!domain || officialDomain(item) === domain) &&
      (!platform || item.systemConfigured === (platform === "enabled")),
  );
  const selectedConnected =
    view === "connected"
      ? currentConnected.find((item) => item.apiCode === query.get("api"))
      : undefined;
  const selectedOfficial =
    view === "official"
      ? official.find((item) => String(item.docId ?? item.path) === query.get("doc"))
      : undefined;
  const domains = [
    ...new Set(
      view === "connected" ? currentConnected.map(businessDomainKey) : official.map(officialDomain),
    ),
  ].sort();
  const selected = selectedConnected ?? selectedOfficial;
  const hasFilters = Boolean(search || domain || platform || status);
  const total = view === "connected" ? visibleConnected.length : visibleOfficial.length;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
  const lastCheckedAt = view === "official" ? officialLastCheckedAt : connectedLastCheckedAt;
  const hasPreviousResult =
    view === "official"
      ? officialLastCheckedAt !== null
      : loadedAccountId === accountId && connectedLastCheckedAt !== null;
  const refreshing = loading && hasPreviousResult;

  function toggleBlockReason(item: ApiCatalogItem, policy?: ApiPolicy) {
    if (!canEdit) return "Viewer 仅可查看";
    if (account?.status !== "active") return "账号未激活";
    if (!item.platformEnabled) return "平台已停用";
    if (!item.readOnlyVerified) return "只读安全待核验";
    if (!policy) return "账号策略不可用";
    return "";
  }

  async function updateAccountEnabled(item: ApiCatalogItem, enabled: boolean) {
    const policy = policiesByCode.get(item.apiCode);
    const token = csrfToken;
    if (!accountId || !policy || !token || updatingPolicyCodes.has(item.apiCode)) return;
    const generation = policyGenerationRef.current;
    setPolicyUpdateError("");
    setUpdatingPolicyCodes((current) => new Set(current).add(item.apiCode));
    try {
      const updated = await api.updatePolicy(
        Number(accountId),
        item.apiCode,
        {
          ...buildPolicyUpdate(policy, { enabled }),
          timezone: policy.timezone,
          windowMode: policy.windowMode,
          lookbackDays: policy.lookbackDays,
          startDate: policy.startDate,
        },
        token,
      );
      if (policyGenerationRef.current !== generation) return;
      setPolicies((current) =>
        current.map((candidate) => (candidate.apiCode === updated.apiCode ? updated : candidate)),
      );
      setConnected((current) =>
        current.map((candidate) =>
          candidate.apiCode === updated.apiCode
            ? { ...candidate, accountEnabled: updated.enabled, accountPolicyExists: true }
            : candidate,
        ),
      );
      for (const key of connectedCacheRef.current.keys()) {
        if (key.startsWith(`${accountId}:`)) connectedCacheRef.current.delete(key);
      }
    } catch (caught: unknown) {
      if (policyGenerationRef.current === generation) {
        setPolicyUpdateError(getApiErrorMessage(caught, `${item.name}启用状态保存失败`));
      }
    } finally {
      if (policyGenerationRef.current === generation) {
        setUpdatingPolicyCodes((current) => {
          const next = new Set(current);
          next.delete(item.apiCode);
          return next;
        });
      }
    }
  }

  function nextAction(item: ApiCatalogItem, primary = false) {
    const linkClass = primary ? "action-link action-link--primary" : "catalog-row-link";
    if (!canEdit || connectedLoading || loadedAccountId !== accountId || connectedError)
      return null;
    if (!item.platformEnabled) return <span className="muted-copy">平台已停用</span>;
    if (!item.readOnlyVerified) return <span className="muted-copy">只读安全待核验</span>;
    if (!accountId) return <span className="muted-copy">请先选择账号</span>;
    if (account?.status !== "active")
      return (
        <Link className={linkClass} state={sourceState} to={`/accounts/${accountId}`}>
          查看账号
        </Link>
      );
    if (item.canRunDirectly === false || item.upstreamApiCode)
      return <span className="muted-copy">需要上游参数</span>;
    if (!item.accountEnabled) return <span className="muted-copy">启用后可创建</span>;
    return (
      <Link
        className={linkClass}
        state={sourceState}
        to={`/jobs/new?accountId=${accountId}&apiCode=${encodeURIComponent(item.apiCode)}`}
      >
        创建同步任务
      </Link>
    );
  }
  const connectedColumns: TableColumnsType<ApiCatalogItem> = [
    {
      title: "接口",
      key: "name",
      width: 260,
      onCell: () => responsiveTableCell("接口", "full"),
      render: (_, item) => (
        <div className="catalog-name-cell">
          <Button type="link" onClick={() => updateQuery({ api: item.apiCode })}>
            {item.name}
          </Button>
          <code>{item.apiCode}</code>
        </div>
      ),
    },
    {
      title: "业务域",
      key: "domain",
      width: 100,
      onCell: () => responsiveTableCell("业务域"),
      render: (_, item) => businessDomainLabel(businessDomainKey(item)),
    },
    {
      title: "平台状态",
      key: "platform",
      width: 110,
      onCell: () => responsiveTableCell("平台状态"),
      render: (_, item) => (
        <Tag color={item.platformEnabled ? "success" : "default"}>
          {item.platformEnabled ? "平台启用" : "平台停用"}
        </Tag>
      ),
    },
    {
      title: "账号状态",
      key: "account",
      width: 180,
      onCell: () => responsiveTableCell("账号状态"),
      render: (_, item) => {
        if (!accountId) return <span className="muted-copy">选择账号后查看</span>;
        const policy = policiesByCode.get(item.apiCode);
        const reason = toggleBlockReason(item, policy);
        const updating = updatingPolicyCodes.has(item.apiCode);
        return (
          <div className="catalog-account-toggle">
            <Switch
              size="small"
              aria-label={`${item.name}账号启用`}
              checked={Boolean(item.accountEnabled)}
              disabled={Boolean(reason) || loading || updating}
              loading={updating}
              onChange={(enabled) => void updateAccountEnabled(item, enabled)}
            />
            <span>{item.accountEnabled ? "已启用" : "未启用"}</span>
            {reason ? <small>{reason}</small> : null}
          </div>
        );
      },
    },
    {
      title: "最近运行",
      key: "run",
      width: 175,
      onCell: () => responsiveTableCell("最近运行"),
      render: (_, item) => (
        <div className="catalog-run-cell">
          {item.recentRunStatus ? (
            <>
              <Tag color={matchesStatus(item, "failed") ? "error" : "default"}>
                {statusLabel(item.recentRunStatus)}
              </Tag>
              <small>{formatDate(item.recentRunAt)}</small>
            </>
          ) : (
            <span className="muted-copy">尚未运行</span>
          )}
        </div>
      ),
    },
    {
      title: "原始记录",
      key: "records",
      width: 100,
      align: "right",
      onCell: () => responsiveTableCell("原始记录"),
      render: (_, item) => (item.rawRecordCount ?? 0).toLocaleString(),
    },
    {
      title: "操作",
      key: "action",
      width: canEdit ? 220 : 80,
      onCell: () => responsiveTableCell("操作", "full"),
      render: (_, item) => (
        <div className="catalog-row-actions">
          <Button type="link" onClick={() => updateQuery({ api: item.apiCode })}>
            详情
          </Button>
          {nextAction(item)}
        </div>
      ),
    },
  ];
  const officialColumns: TableColumnsType<OfficialApiCatalogItem> = [
    {
      title: "接口",
      key: "name",
      width: 300,
      onCell: () => responsiveTableCell("接口", "full"),
      render: (_, item) => (
        <div className="catalog-name-cell">
          <Button type="link" onClick={() => updateQuery({ doc: String(item.docId ?? item.path) })}>
            {item.name}
          </Button>
          <code>
            {item.method} {item.path}
          </code>
        </div>
      ),
    },
    {
      title: "业务域",
      key: "domain",
      width: 130,
      onCell: () => responsiveTableCell("业务域"),
      render: (_, item) => businessDomainLabel(officialDomain(item)),
    },
    {
      title: "系统支持",
      key: "support",
      width: 110,
      onCell: () => responsiveTableCell("系统支持"),
      render: (_, item) => (
        <Tag color={item.systemConfigured ? "success" : "default"}>
          {item.systemConfigured ? "已接入" : "待接入"}
        </Tag>
      ),
    },
    {
      title: "接入条件",
      key: "conditions",
      width: 300,
      onCell: () => responsiveTableCell("接入条件", "full"),
      render: (_, item) => (
        <div className="catalog-run-cell">
          <span>{classificationLabel(item.classification)}</span>
          <small>{item.methodMismatch ? "请求方法不一致，需人工复核" : item.executionReason}</small>
        </div>
      ),
    },
    {
      title: "操作",
      key: "action",
      width: 100,
      onCell: () => responsiveTableCell("操作", "full"),
      render: (_, item) => (
        <Button type="link" onClick={() => updateQuery({ doc: String(item.docId ?? item.path) })}>
          详情
        </Button>
      ),
    },
  ];
  const empty = (
    <Empty description={hasFilters ? "没有匹配的接口" : "暂无接口"}>
      {hasFilters && (
        <Button onClick={() => updateQuery({ q: "", domain: "", platform: "", status: "" }, true)}>
          清除筛选
        </Button>
      )}
    </Empty>
  );
  const pagination = {
    current: currentPage,
    pageSize,
    total,
    showSizeChanger: true,
    pageSizeOptions: [10, 20, 50],
    showTotal: (count: number) => `共 ${count} 个接口`,
    onChange: (nextPage: number, size: number) =>
      updateQuery({
        page: String(size !== pageSize ? 1 : nextPage),
        pageSize: String(size),
        api: "",
        doc: "",
      }),
  };

  return (
    <AppShell>
      <main className="m3-page api-catalog-page">
        <header className="page-heading">
          <div>
            <h1>接口中心</h1>
          </div>
          {view === "connected" && (
            <label className="catalog-account">
              <span>当前账号</span>
              <Select
                aria-label="当前账号"
                value={accountId}
                virtual={false}
                options={[
                  { label: "全部账号汇总", value: "" },
                  ...accounts.map((item) => ({ label: item.name, value: String(item.id) })),
                ]}
                onChange={(value) => updateQuery({ account: value, status: "" }, true)}
              />
            </label>
          )}
        </header>
        <Tabs
          activeKey={view}
          items={[
            { key: "connected", label: "已接入接口" },
            { key: "official", label: "官方接口目录" },
          ]}
          onChange={(value) =>
            updateQuery({ view: value, domain: "", platform: "", status: "", q: "" }, true)
          }
        />
        <section
          className="catalog-table-panel"
          aria-label={view === "connected" ? "已接入接口列表" : "官方接口列表"}
        >
          <div className="catalog-toolbar" aria-label="接口目录工具栏">
            <div className="catalog-filter-grid">
              <label className="catalog-search">
                <span>搜索接口</span>
                <Input.Search
                  {...searchInputProps}
                  aria-label="搜索接口"
                  placeholder="搜索名称、编码或路径"
                  allowClear
                />
              </label>
              <label>
                <span>业务域</span>
                <Select
                  aria-label="业务域"
                  value={domain}
                  virtual={false}
                  options={[
                    { label: "全部业务域", value: "" },
                    ...domains.map((value) => ({ label: businessDomainLabel(value), value })),
                  ]}
                  onChange={(value) => updateQuery({ domain: value }, true)}
                />
              </label>
              <label>
                <span>{view === "connected" ? "平台状态" : "系统支持"}</span>
                <Select
                  aria-label={view === "connected" ? "平台状态" : "系统支持"}
                  value={platform}
                  virtual={false}
                  options={[
                    { label: "全部状态", value: "" },
                    { label: view === "connected" ? "平台启用" : "已接入", value: "enabled" },
                    { label: view === "connected" ? "平台停用" : "待接入", value: "disabled" },
                  ]}
                  onChange={(value) => updateQuery({ platform: value }, true)}
                />
              </label>
            </div>
            <div className="catalog-toolbar-actions">
              <Button
                type="text"
                onClick={() => updateQuery({ q: "", domain: "", platform: "", status: "" }, true)}
              >
                重置
              </Button>
              <div className="catalog-toolbar-refresh">
                <RefreshStatus
                  failedWithPreviousData={Boolean(error && hasPreviousResult)}
                  lastUpdatedAt={lastCheckedAt}
                  refreshing={refreshing}
                />
                <Button
                  aria-label="刷新"
                  disabled={loading || refreshing}
                  loading={refreshing}
                  onClick={refreshCurrentView}
                >
                  刷新
                </Button>
              </div>
            </div>
          </div>
          {view === "connected" ? (
            <>
              <div className="catalog-quick-filters" aria-label="接口快捷筛选">
                {quickFilters.map((filter) => {
                  const needsAccount = ["enabled", "disabled"].includes(filter.value);
                  return (
                    <Button
                      key={filter.value}
                      aria-pressed={status === filter.value}
                      disabled={needsAccount && !accountId}
                      type={status === filter.value ? "primary" : "default"}
                      onClick={() => updateQuery({ status: filter.value }, true)}
                    >
                      {filter.label}{" "}
                      {needsAccount && !accountId
                        ? "—"
                        : currentConnected.filter((item) => matchesStatus(item, filter.value))
                            .length}
                    </Button>
                  );
                })}
              </div>
              {!accountId && (
                <p className="catalog-scope-note">
                  最近运行与原始记录为全部账号汇总；选择账号后可查看启用状态和创建任务。
                </p>
              )}
              {policyUpdateError ? (
                <Alert
                  className="page-alert"
                  showIcon
                  closable
                  title={policyUpdateError}
                  type="error"
                  onClose={() => setPolicyUpdateError("")}
                />
              ) : null}
            </>
          ) : (
            <p className="catalog-scope-note">
              官方目录用于了解可接入能力；系统支持与接入条件分别展示，未接入接口需经过验证和受控发布。
            </p>
          )}
          {error ? (
            <Alert
              className="page-alert"
              showIcon
              title={error}
              type={hasPreviousResult ? "warning" : "error"}
              action={
                hasPreviousResult ? undefined : <Button onClick={refreshCurrentView}>重试</Button>
              }
            />
          ) : null}
          {!error || hasPreviousResult ? (
            view === "connected" ? (
              <Table
                className="catalog-responsive-table responsive-card-table"
                size="middle"
                rowKey="apiCode"
                columns={connectedColumns}
                dataSource={visibleConnected}
                loading={loading && !hasPreviousResult}
                locale={{ emptyText: empty }}
                pagination={pagination}
                scroll={{ x: 1095 }}
              />
            ) : (
              <Table
                className="catalog-responsive-table responsive-card-table"
                size="middle"
                rowKey={(item) => `${item.docId}-${item.path}`}
                columns={officialColumns}
                dataSource={visibleOfficial}
                loading={loading && !hasPreviousResult}
                locale={{ emptyText: empty }}
                pagination={pagination}
                scroll={{ x: 940 }}
              />
            )
          ) : null}
        </section>
        <Drawer
          rootClassName="catalog-drawer"
          focusable={{ focusTriggerAfterClose: false }}
          afterOpenChange={(open) => {
            if (!open) {
              // 等待抽屉移除背景的 inert 限制后，再恢复列表键盘位置。
              requestAnimationFrame(() => {
                const target = detailTrigger.current;
                if (target?.isConnected) target.focus({ preventScroll: true });
                else document.querySelector<HTMLElement>('[aria-label="搜索接口"]')?.focus();
              });
            }
          }}
          title={selected?.name ?? "接口详情"}
          open={
            Boolean(selected) && (!loading || hasPreviousResult) && (!error || hasPreviousResult)
          }
          onClose={() => updateQuery({ api: "", doc: "" }, false, true)}
          size={560}
          footer={
            selectedConnected ? (
              <div className="catalog-actions">
                <Link
                  className="action-link action-link--neutral"
                  state={sourceState}
                  to={`/raw-data?${new URLSearchParams({ ...(accountId ? { jijiaAccountId: accountId } : {}), apiCode: selectedConnected.apiCode })}`}
                >
                  查看原始数据
                </Link>
                {canEdit &&
                  accountId &&
                  account?.status === "active" &&
                  selectedConnected.platformEnabled &&
                  selectedConnected.accountEnabled && (
                    <Link
                      className="action-link action-link--neutral"
                      state={sourceState}
                      to={`/accounts/${accountId}/policies?apiCode=${encodeURIComponent(selectedConnected.apiCode)}`}
                    >
                      配置接口
                    </Link>
                  )}
                {accountId && (
                  <Link
                    className="action-link action-link--neutral"
                    state={sourceState}
                    to={`/runs?account=${accountId}`}
                  >
                    查看账号运行记录
                  </Link>
                )}
                {nextAction(selectedConnected, true)}
              </div>
            ) : null
          }
        >
          {selectedConnected && (
            <ConnectedCatalogDetail item={selectedConnected} accountSelected={Boolean(accountId)} />
          )}
          {selectedOfficial && (
            <OfficialCatalogDetail
              item={selectedOfficial}
              classification={classificationLabel(selectedOfficial.classification)}
              onSelectConfiguredApi={(code) =>
                updateQuery({
                  view: "connected",
                  api: code,
                  doc: "",
                  q: "",
                  domain: "",
                  platform: "",
                  status: "",
                  page: "",
                })
              }
            />
          )}
        </Drawer>
      </main>
    </AppShell>
  );
}
