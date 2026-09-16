import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/client";
import type { ApiCatalogItem, ApiPolicy, OfficialApiCatalogItem } from "../api/types";
import { ApiCatalogPage } from "./ApiCatalogPage";

const authState = vi.hoisted(() => ({ role: "operator" }));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: 3,
      email: "operator@example.com",
      displayName: "操作员",
      role: authState.role,
    },
    csrfToken: "csrf-token",
    logout: vi.fn(),
  }),
}));

vi.mock("../api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api/client")>();
  return {
    ...original,
    api: {
      ...original.api,
      getApiCatalog: vi.fn(),
      getOfficialApiCatalog: vi.fn(),
      listAccounts: vi.fn(),
      listPolicies: vi.fn(),
      updatePolicy: vi.fn(),
    },
  };
});

const connected: ApiCatalogItem = {
  apiCode: "amazon_shop_page",
  name: "查询亚马逊店铺信息",
  method: "POST",
  path: "/middle/base/market/page",
  domain: "middle",
  officialDomain: "基础资料",
  catalogEnabled: true,
  platformEnabled: true,
  systemConfigured: true,
  officialExists: true,
  readOnlyVerified: true,
  officialDocId: 2,
  classification: "direct_read_candidate",
  executionStage: "configured_enabled",
  configVersion: 3,
  configHash: "hash",
  publishedAt: "2026-09-03T08:00:00Z",
  supportsDateWindow: false,
  listField: "data.rows",
  primaryKeyField: "id",
  dateField: "createdTime",
  storageMode: "latest_snapshot",
  sensitive: false,
  dataSummary: "查询账号可访问的亚马逊店铺信息",
  accountPolicyExists: true,
  accountEnabled: true,
  recentRunStatus: "success",
  recentRunAt: "2026-09-03T08:00:00Z",
  rawRecordCount: 12,
  hasData: true,
};

const policy: ApiPolicy = {
  ...connected,
  id: 18,
  accountId: 8,
  enabled: true,
  scheduleMode: "daily",
  scheduleExpr: "03:30",
  timezone: "UTC",
  windowMode: "lookback_days",
  lookbackDays: 30,
  startDate: "2025-01-01",
  nextRunAt: null,
};

const official: OfficialApiCatalogItem = {
  docId: 99,
  menuPath: "采购 > 供应商",
  name: "查询供应商",
  path: "/purchase/supplier/page",
  method: "POST",
  classification: "direct_read_candidate",
  executionStage: "can_probe_next",
  executionReason: "未配置的低风险直读候选，可按默认 disabled 小窗口探测。",
  requiredFields: [],
  businessRequiredFields: [],
  responseFields: [],
  hasPageResponse: true,
  hasListResponse: false,
  sensitive: false,
  systemConfigured: false,
  configuredApiCodes: [],
  platformEnabledApiCodes: [],
  configuredMethods: [],
  methodMismatch: false,
};

function deferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

describe("接口中心", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = "operator";
    vi.mocked(api.listAccounts).mockResolvedValue([
      {
        id: 8,
        accountCode: "acct_demo",
        name: "北美账号",
        maskedAppId: "•••• demo",
        credentialSource: "encrypted",
        status: "active",
        lastVerifiedAt: null,
        lastVerifyError: null,
        createdAt: "2026-09-03T08:00:00Z",
        updatedAt: "2026-09-03T08:00:00Z",
      },
    ]);
    vi.mocked(api.getApiCatalog).mockResolvedValue([connected]);
    vi.mocked(api.getOfficialApiCatalog).mockResolvedValue([official]);
    vi.mocked(api.listPolicies).mockResolvedValue([policy]);
    vi.mocked(api.updatePolicy).mockImplementation(async (_accountId, _apiCode, changes) => ({
      ...policy,
      ...changes,
      accountEnabled: changes.enabled,
    }));
  });

  it("列表直接比较状态，点击名称才打开详情，技术字段按需展开", async () => {
    const user = userEvent.setup();
    renderCatalog("/api-catalog?account=8");
    const name = await screen.findByRole("button", { name: connected.name });
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("已完成")).toBeInTheDocument();
    await user.click(name);
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByText(connected.name)).toBeInTheDocument();
    expect(within(drawer).queryByText("data.rows")).not.toBeInTheDocument();
    await user.click(within(drawer).getByText("技术详情"));
    expect(within(drawer).getByText("data.rows")).toBeVisible();
    expect(within(drawer).getByRole("link", { name: "查看原始数据" })).toHaveAttribute(
      "href",
      "/raw-data?jijiaAccountId=8&apiCode=amazon_shop_page",
    );
  });

  it("URL恢复账号、搜索与详情，Viewer不出现配置和创建操作", async () => {
    authState.role = "viewer";
    renderCatalog("/api-catalog?account=8&q=amazon_shop_page&api=amazon_shop_page");
    await screen.findByRole("dialog");
    expect(api.getApiCatalog).toHaveBeenCalledWith(8);
    expect(screen.getByRole("searchbox", { name: "搜索接口" })).toHaveValue("amazon_shop_page");
    expect(screen.queryByRole("link", { name: /创建同步任务|配置接口/ })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: `${connected.name}账号启用` })).toBeDisabled();
    expect(screen.getByText("Viewer 仅可查看")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看原始数据" })).toBeInTheDocument();
  });

  it("搜索路径与业务域、平台状态组合筛选，重置后恢复结果", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getApiCatalog).mockResolvedValue([
      connected,
      {
        ...connected,
        apiCode: "supplier_page",
        name: "供应商",
        domain: "purchase",
        path: "/purchase/supplier/page",
      },
      { ...connected, apiCode: "shop_disabled", name: "停用店铺", platformEnabled: false },
    ]);
    renderCatalog("/api-catalog?domain=middle&platform=enabled");
    await screen.findByRole("button", { name: connected.name });
    expect(screen.getByRole("cell", { name: /^基础资料$/ })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: /^middle$/ })).not.toBeInTheDocument();
    expect(readQuery().get("domain")).toBe("middle");
    expect(screen.queryByRole("button", { name: "供应商" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "停用店铺" })).not.toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "搜索接口" }), "/middle/base");
    expect(screen.getByRole("button", { name: connected.name })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^重\s*置$/ }));
    expect(screen.getByRole("button", { name: "供应商" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停用店铺" })).toBeInTheDocument();
  });

  it("已接入接口按官方业务域展示、搜索和筛选，无映射时回退内部分类", async () => {
    const user = userEvent.setup();
    const salesAnalysis = {
      ...connected,
      apiCode: "sales_analysis_asin_page",
      name: "流量数据-ASIN",
      path: "/operation/sts/trafficAnalysis/page",
      domain: "operation",
      officialDomain: "统计",
    };
    const fallback = {
      ...connected,
      apiCode: "unmapped_purchase",
      name: "未关联供应商接口",
      path: "/purchase/supplier/page",
      domain: "purchase",
      officialDomain: null,
    };
    vi.mocked(api.getApiCatalog).mockResolvedValue([salesAnalysis, fallback]);

    renderCatalog("/api-catalog?domain=统计");
    await screen.findByRole("button", { name: salesAnalysis.name });
    expect(screen.getByRole("cell", { name: "统计" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: fallback.name })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /重\s*置/ }));
    expect(await screen.findByRole("button", { name: fallback.name })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "采购与商品库存" })).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "搜索接口" }), "统计");
    expect(screen.getByRole("button", { name: salesAnalysis.name })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: fallback.name })).not.toBeInTheDocument();
  });

  it("账号未启用时直接提供启用开关，平台停用及依赖接口不提供直接创建", async () => {
    vi.mocked(api.getApiCatalog).mockResolvedValue([
      { ...connected, accountEnabled: false },
      { ...connected, apiCode: "disabled", name: "平台已停用接口", platformEnabled: false },
      {
        ...connected,
        apiCode: "dependent",
        name: "依赖上游接口",
        canRunDirectly: false,
        upstreamApiCode: "amazon_shop_page",
      },
    ]);
    renderCatalog("/api-catalog?account=8");
    await screen.findByRole("button", { name: connected.name });
    const row = screen.getByRole("row", { name: new RegExp(connected.name) });
    expect(
      within(row).getByRole("switch", { name: `${connected.name}账号启用` }),
    ).not.toBeChecked();
    expect(within(row).getByText("启用后可创建")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "创建同步任务" })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("row", { name: /平台已停用接口/ })).getByRole("switch"),
    ).toBeDisabled();
  });

  it("启用接口时完整保留策略并立即提供创建任务入口", async () => {
    const user = userEvent.setup();
    const disabledPolicy = { ...policy, enabled: false, accountEnabled: false };
    vi.mocked(api.getApiCatalog).mockResolvedValue([{ ...connected, accountEnabled: false }]);
    vi.mocked(api.listPolicies).mockResolvedValue([disabledPolicy]);
    vi.mocked(api.updatePolicy).mockResolvedValue({
      ...disabledPolicy,
      enabled: true,
      accountEnabled: true,
    });

    renderCatalog("/api-catalog?account=8");
    const toggle = await screen.findByRole("switch", { name: `${connected.name}账号启用` });
    await user.click(toggle);

    expect(api.updatePolicy).toHaveBeenCalledWith(
      8,
      connected.apiCode,
      {
        enabled: true,
        scheduleMode: "daily",
        scheduleExpr: "03:30",
        timezone: "UTC",
        windowMode: "lookback_days",
        lookbackDays: 30,
        startDate: "2025-01-01",
      },
      "csrf-token",
    );
    expect(await screen.findByRole("link", { name: "创建同步任务" })).toHaveAttribute(
      "href",
      "/jobs/new?accountId=8&apiCode=amazon_shop_page",
    );
    expect(toggle).toBeChecked();
  });

  it("启用失败时保持原状态并显示错误", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getApiCatalog).mockResolvedValue([{ ...connected, accountEnabled: false }]);
    vi.mocked(api.listPolicies).mockResolvedValue([
      { ...policy, enabled: false, accountEnabled: false },
    ]);
    vi.mocked(api.updatePolicy).mockRejectedValue(new Error("策略保存失败"));

    renderCatalog("/api-catalog?account=8");
    const toggle = await screen.findByRole("switch", { name: `${connected.name}账号启用` });
    await user.click(toggle);

    expect(await screen.findByRole("alert")).toHaveTextContent("启用状态保存失败");
    expect(toggle).not.toBeChecked();
    expect(screen.queryByRole("link", { name: "创建同步任务" })).not.toBeInTheDocument();
  });

  it("停用接口后立即移除创建任务入口", async () => {
    const user = userEvent.setup();
    vi.mocked(api.updatePolicy).mockResolvedValue({
      ...policy,
      enabled: false,
      accountEnabled: false,
    });

    renderCatalog("/api-catalog?account=8");
    const toggle = await screen.findByRole("switch", { name: `${connected.name}账号启用` });
    expect(screen.getByRole("link", { name: "创建同步任务" })).toBeInTheDocument();
    await user.click(toggle);

    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(screen.queryByRole("link", { name: "创建同步任务" })).not.toBeInTheDocument();
    expect(screen.getByText("启用后可创建")).toBeInTheDocument();
  });

  it("运行失败与账号启用独立，失败筛选仍允许就绪接口创建任务", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getApiCatalog).mockResolvedValue([
      connected,
      { ...connected, apiCode: "failed", name: "失败接口", recentRunStatus: "failed" },
    ]);
    renderCatalog("/api-catalog?account=8");
    await screen.findByRole("button", { name: connected.name });
    await user.click(screen.getByRole("button", { name: /最近运行失败/ }));
    expect(screen.queryByRole("button", { name: connected.name })).not.toBeInTheDocument();
    const row = screen.getByRole("row", { name: /失败接口/ });
    expect(within(row).getByRole("link", { name: "创建同步任务" })).toHaveAttribute(
      "href",
      "/jobs/new?accountId=8&apiCode=failed",
    );
  });

  it("全账号汇总不推断账号可运行性，也不提供写入口", async () => {
    vi.mocked(api.getApiCatalog).mockResolvedValue([
      { ...connected, accountEnabled: null, accountPolicyExists: null },
    ]);
    renderCatalog("/api-catalog");
    await screen.findByRole("button", { name: connected.name });
    expect(api.getApiCatalog).toHaveBeenCalledWith(undefined);
    expect(screen.queryByRole("link", { name: /创建同步任务|配置接口/ })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "当前账号" })).toBeInTheDocument();
  });

  it("加载失败后重试恢复接口列表", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getApiCatalog).mockRejectedValueOnce(new Error("测试网络失败"));
    renderCatalog("/api-catalog?account=8");
    expect(await screen.findByRole("alert")).toHaveTextContent("已接入接口加载失败");
    expect(screen.queryByRole("link", { name: "创建同步任务" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^重\s*试$/ }));
    await screen.findByRole("button", { name: connected.name });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("刷新已接入接口保留筛选分页详情且不会重复请求", async () => {
    const rows = Array.from({ length: 21 }, (_, index) => ({
      ...connected,
      apiCode: `shop_${index}`,
      name: `店铺接口 ${index}`,
    }));
    const catalogRefresh = deferred<ApiCatalogItem[]>();
    const policyRefresh = deferred<ApiPolicy[]>();
    vi.mocked(api.getApiCatalog)
      .mockResolvedValueOnce(rows)
      .mockReturnValueOnce(catalogRefresh.promise);
    vi.mocked(api.listPolicies)
      .mockResolvedValueOnce([policy])
      .mockReturnValueOnce(policyRefresh.promise);
    const user = userEvent.setup();
    renderCatalog("/api-catalog?account=8&q=shop&page=2&pageSize=10&api=shop_10");

    const drawer = await screen.findByRole("dialog");
    await user.dblClick(screen.getByRole("button", { name: /^刷\s*新$/ }));
    await waitFor(() => {
      expect(api.getApiCatalog).toHaveBeenCalledTimes(2);
      expect(api.listPolicies).toHaveBeenCalledTimes(2);
    });
    expect(drawer).toBeVisible();
    expect(screen.getByRole("searchbox", { name: "搜索接口" })).toHaveValue("shop");
    expect(readQuery().get("page")).toBe("2");
    expect(screen.getByText(/正在刷新 · 上次检查/)).toBeVisible();

    await act(async () => {
      catalogRefresh.resolve(rows);
      policyRefresh.resolve([policy]);
    });
    expect(screen.getByText(/上次检查 \d{2}:\d{2}:\d{2}/)).toBeVisible();
  });

  it("已接入接口刷新失败保留旧表格并显示 warning", async () => {
    vi.mocked(api.getApiCatalog).mockResolvedValue([connected]);
    vi.mocked(api.listPolicies)
      .mockResolvedValueOnce([policy])
      .mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    renderCatalog("/api-catalog?account=8");
    await screen.findByRole("button", { name: connected.name });
    await user.click(screen.getByRole("button", { name: /^刷\s*新$/ }));

    expect(await screen.findByRole("alert")).toHaveClass("ant-alert-warning");
    expect(screen.getByRole("button", { name: connected.name })).toBeInTheDocument();
    expect(screen.getByText(/刷新失败 · 仍显示 .* 的结果/)).toBeVisible();
  });

  it("官方目录独立记录检查时间，刷新失败仍保留目录", async () => {
    vi.mocked(api.getOfficialApiCatalog)
      .mockResolvedValueOnce([official])
      .mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    renderCatalog("/api-catalog?view=official");
    await screen.findByRole("button", { name: official.name });
    await user.click(screen.getByRole("button", { name: /^刷\s*新$/ }));

    expect(await screen.findByRole("alert")).toHaveClass("ant-alert-warning");
    expect(screen.getByRole("button", { name: official.name })).toBeInTheDocument();
    expect(screen.getByText(/刷新失败 · 仍显示 .* 的结果/)).toBeVisible();
  });

  it("切换到官方目录再返回时，策略加载失败仍保留同账号旧策略", async () => {
    const user = userEvent.setup();
    renderCatalog("/api-catalog?account=8");
    await screen.findByRole("link", { name: "创建同步任务" });

    await user.click(screen.getByRole("tab", { name: "官方接口目录" }));
    await screen.findByRole("button", { name: official.name });
    vi.mocked(api.listPolicies).mockRejectedValueOnce(new Error("offline"));
    await user.click(screen.getByRole("tab", { name: "已接入接口" }));

    expect(await screen.findByRole("alert")).toHaveClass("ant-alert-warning");
    expect(screen.getByRole("switch", { name: `${connected.name}账号启用` })).toBeChecked();
    expect(screen.getByRole("link", { name: "创建同步任务" })).toBeInTheDocument();
  });

  it("切换账号时隐藏旧操作，较晚返回的旧响应不会覆盖新账号", async () => {
    const user = userEvent.setup();
    const accounts = await api.listAccounts();
    vi.mocked(api.listAccounts).mockResolvedValue([
      ...accounts,
      { ...accounts[0], id: 9, name: "欧洲账号" },
    ]);
    let resolveOld: (items: ApiCatalogItem[]) => void = () => undefined;
    let resolveNew: (items: ApiCatalogItem[]) => void = () => undefined;
    const oldResponse = new Promise<ApiCatalogItem[]>((resolve) => {
      resolveOld = resolve;
    });
    const newResponse = new Promise<ApiCatalogItem[]>((resolve) => {
      resolveNew = resolve;
    });
    vi.mocked(api.getApiCatalog)
      .mockResolvedValueOnce([connected])
      .mockImplementation((id) => (id === 8 ? oldResponse : newResponse));
    renderCatalog("/api-catalog?account=8");
    await screen.findByRole("link", { name: "创建同步任务" });
    await user.click(screen.getByRole("button", { name: /^刷\s*新$/ }));
    await user.click(screen.getByRole("combobox", { name: "当前账号" }));
    await user.click(await screen.findByRole("option", { name: "欧洲账号" }));
    expect(readQuery().get("account")).toBe("9");
    expect(screen.queryByRole("link", { name: "创建同步任务" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: `${connected.name}账号启用` }),
    ).not.toBeInTheDocument();
    await act(async () => {
      resolveNew([{ ...connected, accountEnabled: false }]);
    });
    expect(await screen.findByText("启用后可创建")).toBeInTheDocument();
    await act(async () => {
      resolveOld([connected]);
    });
    expect(screen.queryByRole("link", { name: "创建同步任务" })).not.toBeInTheDocument();
    expect(screen.getByText("启用后可创建")).toBeInTheDocument();
  });

  it("创建任务携带完整列表返回上下文", async () => {
    const user = userEvent.setup();
    const source =
      "/api-catalog?account=8&q=shop&domain=middle&platform=enabled&status=data&pageSize=20";
    renderCatalog(source);
    await user.click(await screen.findByRole("link", { name: "创建同步任务" }));
    expect(screen.getByTestId("catalog-source")).toHaveTextContent(
      JSON.stringify({ from: source, backLabel: "返回接口中心" }),
    );
  });

  it("分页详情关闭保留筛选和页码，搜索变化回到第一页", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getApiCatalog).mockResolvedValue(
      Array.from({ length: 21 }, (_, index) => ({
        ...connected,
        apiCode: `shop_${index}`,
        name: `店铺接口 ${index}`,
      })),
    );
    renderCatalog(
      "/api-catalog?account=8&q=shop&domain=middle&platform=enabled&page=2&pageSize=10",
    );
    await user.click(await screen.findByRole("button", { name: "店铺接口 10" }));
    const drawer = await screen.findByRole("dialog");
    expect(readQuery().get("api")).toBe("shop_10");
    await user.click(within(drawer).getByRole("button", { name: /关闭|Close/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(Object.fromEntries(readQuery())).toMatchObject({
      account: "8",
      q: "shop",
      domain: "middle",
      platform: "enabled",
      page: "2",
      pageSize: "10",
    });
    expect(readQuery().has("api")).toBe(false);
    await user.type(screen.getByRole("searchbox", { name: "搜索接口" }), "_0");
    expect(readQuery().get("page") ?? "1").toBe("1");
    expect(screen.getByRole("button", { name: "店铺接口 0" })).toBeInTheDocument();
  });

  it("官方目录不自动展开，doc深链可恢复待接入说明且无虚假接入按钮", async () => {
    const user = userEvent.setup();
    renderCatalog("/api-catalog?view=official&q=supplier&doc=99");
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByText(official.name)).toBeInTheDocument();
    expect(
      within(drawer).queryByRole("button", { name: /一键接入|创建同步任务/ }),
    ).not.toBeInTheDocument();
    await user.click(within(drawer).getByRole("button", { name: /关闭|Close/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(readQuery().get("view")).toBe("official");
    expect(readQuery().get("q")).toBe("supplier");
    expect(readQuery().has("doc")).toBe(false);
    expect(screen.getByRole("button", { name: official.name })).toBeInTheDocument();
  });

  it("官方详情在正文展示映射接口，技术详情可展开并能切换到已接入详情", async () => {
    const user = userEvent.setup();
    const configuredOfficial: OfficialApiCatalogItem = {
      ...official,
      systemConfigured: true,
      configuredApiCodes: ["amazon_shop_page", "sales_analysis_asin_page"],
      businessRequiredFields: ["marketplaceId", "startDate"],
    };
    vi.mocked(api.getOfficialApiCatalog).mockResolvedValue([configuredOfficial]);
    vi.mocked(api.getApiCatalog).mockResolvedValue([
      connected,
      {
        ...connected,
        apiCode: "sales_analysis_asin_page",
        name: "流量数据-ASIN",
      },
    ]);

    renderCatalog("/api-catalog?view=official&doc=99");
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByRole("heading", { name: "已接入接口" })).toBeInTheDocument();
    expect(within(drawer).getByText("2 个")).toBeInTheDocument();
    expect(
      within(drawer).getByRole("button", {
        name: "查看已接入接口：sales_analysis_asin_page",
      }),
    ).toBeInTheDocument();
    await user.click(within(drawer).getByText("技术详情"));
    expect(within(drawer).getByText("marketplaceId、startDate")).toBeVisible();

    await user.click(
      within(drawer).getByRole("button", { name: "查看已接入接口：amazon_shop_page" }),
    );
    await waitFor(() => {
      expect(readQuery().get("view")).toBe("connected");
      expect(readQuery().get("api")).toBe("amazon_shop_page");
      expect(readQuery().has("doc")).toBe(false);
    });
    expect(await screen.findByRole("dialog")).toHaveTextContent(connected.name);
  });
});

function LocationProbe() {
  const location = useLocation();
  return (
    <>
      <output data-testid="catalog-location">{location.search}</output>
      <output data-testid="catalog-source">{JSON.stringify(location.state)}</output>
    </>
  );
}

function renderCatalog(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ApiCatalogPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function readQuery() {
  return new URLSearchParams(screen.getByTestId("catalog-location").textContent ?? "");
}
