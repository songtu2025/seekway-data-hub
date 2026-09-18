import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api, ApiError } from "../api/client";
import type { ApiCatalogItem, ApiPolicy, JijiaAccount } from "../api/types";
import { AccountPoliciesPage } from "./AccountPoliciesPage";

const authState = vi.hoisted(() => ({
  role: "operator" as "admin" | "operator" | "viewer",
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    csrfToken: "csrf-token",
    user: { id: 2, email: "operator@example.com", displayName: "操作员", role: authState.role },
    logout: vi.fn(),
  }),
}));
vi.mock("../api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api/client")>();
  return {
    ...original,
    api: {
      ...original.api,
      getAccount: vi.fn(),
      getApiCatalog: vi.fn(),
      listPolicies: vi.fn(),
      updatePolicy: vi.fn(),
      batchUpdatePolicies: vi.fn(),
    },
  };
});

const account: JijiaAccount = {
  id: 8,
  accountCode: "acct_demo",
  name: "北美业务账号",
  maskedAppId: "•••• 8J2K",
  credentialSource: "encrypted",
  status: "active",
  lastVerifiedAt: "2026-08-26T02:42:00",
  lastVerifyError: null,
  createdAt: "2026-08-26T02:00:00",
  updatedAt: "2026-08-26T02:42:00",
};
const policy: ApiPolicy = {
  id: 20,
  accountId: 8,
  apiCode: "traffic_analysis_page",
  name: "流量数据-ASIN",
  method: "POST",
  path: "/operation/sts/trafficAnalysis/page",
  domain: "operation",
  catalogEnabled: true,
  supportsDateWindow: true,
  enabled: false,
  scheduleMode: "manual_only",
  scheduleExpr: null,
  timezone: "Asia/Shanghai",
  windowMode: "checkpoint",
  lookbackDays: null,
  startDate: null,
  nextRunAt: null,
};
const secondAccount: JijiaAccount = {
  ...account,
  id: 9,
  accountCode: "acct_europe",
  name: "欧洲业务账号",
};
const secondPolicy: ApiPolicy = {
  ...policy,
  id: 21,
  accountId: 9,
  name: "欧洲流量数据",
};
const catalogItem: ApiCatalogItem = {
  ...policy,
  officialDomain: null,
};

async function chooseSelectOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
) {
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("账号接口策略页", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = "operator";
    vi.mocked(api.getAccount).mockResolvedValue(account);
    vi.mocked(api.getApiCatalog).mockResolvedValue([catalogItem]);
    vi.mocked(api.listPolicies).mockResolvedValue([policy]);
    vi.mocked(api.updatePolicy).mockImplementation(async (_accountId, _apiCode, input) => ({
      ...policy,
      ...input,
      nextRunAt: "2026-08-27T18:30:00",
    }));
    vi.mocked(api.batchUpdatePolicies).mockImplementation(async (_accountId, items) =>
      items.map((item) => ({ ...policy, ...item, accountId: 8 })),
    );
  });

  it("首载失败不误报为空接口，并可原位重新加载", async () => {
    vi.mocked(api.listPolicies)
      .mockRejectedValueOnce(new Error("暂时不可用"))
      .mockResolvedValueOnce([policy]);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/accounts/8/policies"]}>
        <Routes>
          <Route path="/accounts/:accountId/policies" element={<AccountPoliciesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("接口策略加载失败");
    expect(
      screen.queryByText("暂无可配置接口，请在接口中心查看平台接入状态。"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重新加载" }));

    expect((await screen.findAllByText("流量数据-ASIN")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("手动刷新保留筛选、当前接口和批量选择，并阻止重复请求", async () => {
    const refreshedAccount = deferred<JijiaAccount>();
    const refreshedPolicies = deferred<ApiPolicy[]>();
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/accounts/8/policies"]}>
        <Routes>
          <Route path="/accounts/:accountId/policies" element={<AccountPoliciesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findAllByText("流量数据-ASIN");
    await user.type(screen.getByRole("searchbox", { name: "搜索同步接口" }), "流量");
    await chooseSelectOption(user, "按业务域筛选", "运营管理");
    await user.click(screen.getByRole("button", { name: "未启用 1" }));
    await user.click(screen.getByRole("checkbox", { name: "选择 流量数据-ASIN" }));
    vi.mocked(api.getAccount).mockReturnValue(refreshedAccount.promise);
    vi.mocked(api.listPolicies).mockReturnValue(refreshedPolicies.promise);

    await user.dblClick(screen.getByRole("button", { name: "刷新同步接口" }));

    expect(api.getAccount).toHaveBeenCalledTimes(2);
    expect(api.listPolicies).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/正在刷新/)).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "搜索同步接口" })).toHaveValue("流量");
    expect(screen.getByRole("button", { name: "未启用 1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("checkbox", { name: "选择 流量数据-ASIN" })).toBeChecked();
    expect(screen.getByText("已选择 1 个接口（每次最多 100 个）")).toBeInTheDocument();

    await act(async () => {
      refreshedAccount.resolve({ ...account, name: "北美业务账号（已更新）" });
      refreshedPolicies.reject(new ApiError("策略刷新失败", 503, "UNAVAILABLE"));
      await refreshedPolicies.promise.catch(() => undefined);
    });

    expect(await screen.findByText(/北美业务账号（已更新）/)).toBeInTheDocument();
    expect(screen.getAllByText("流量数据-ASIN").length).toBeGreaterThan(0);
    expect(screen.getByRole("alert")).toHaveTextContent("策略刷新失败");
    expect(screen.getByRole("alert")).toHaveClass("ant-alert-warning");
    expect(screen.getByText(/刷新失败 · 仍显示/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新同步接口" })).toBeEnabled();
  });

  it("刷新成功后保留搜索并剔除服务端已删除的批量选择", async () => {
    const removedPolicy: ApiPolicy = {
      ...policy,
      id: 22,
      apiCode: "inventory_removed",
      name: "已删除库存接口",
      domain: "inventory",
    };
    vi.mocked(api.listPolicies).mockResolvedValue([policy, removedPolicy]);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/accounts/8/policies"]}>
        <Routes>
          <Route path="/accounts/:accountId/policies" element={<AccountPoliciesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findAllByText("已删除库存接口");
    await user.click(screen.getByRole("checkbox", { name: "选择 已删除库存接口" }));
    await user.type(screen.getByRole("searchbox", { name: "搜索同步接口" }), "库存");
    vi.mocked(api.listPolicies).mockResolvedValue([policy]);
    await user.click(screen.getByRole("button", { name: "刷新同步接口" }));

    await waitFor(() => expect(api.listPolicies).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("searchbox", { name: "搜索同步接口" })).toHaveValue("库存");
    expect(screen.getByText("当前显示 0 / 1")).toBeInTheDocument();
    expect(screen.queryByText("已选择 1 个接口（每次最多 100 个）")).not.toBeInTheDocument();
    expect(screen.getByText("没有符合条件的接口，可清除搜索或选择全部接口。")).toBeInTheDocument();
  });

  it("从任务支线定位未启用接口并原样恢复草稿与来源", async () => {
    const user = userEvent.setup();
    vi.mocked(api.listPolicies).mockResolvedValue([
      policy,
      { ...policy, apiCode: "other", name: "其他接口", enabled: true },
    ]);
    const taskState = {
      from: "/jobs?account=8",
      backLabel: "返回任务列表",
      syncJobDraft: { accountId: "8", apiCode: policy.apiCode, startDate: "2026-01-01" },
    };
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/accounts/8/policies",
            search: `?apiCode=${policy.apiCode}`,
            state: {
              from: `/jobs/new?accountId=8&apiCode=${policy.apiCode}`,
              backLabel: "返回任务配置",
              returnState: taskState,
            },
          },
        ]}
      >
        <Routes>
          <Route path="/accounts/:accountId/policies" element={<AccountPoliciesPage />} />
          <Route path="/jobs/new" element={<ReturnStateProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: policy.name });
    expect(screen.getByRole("searchbox", { name: "搜索同步接口" })).toHaveValue(policy.apiCode);
    expect(screen.getByRole("checkbox", { name: "启用此接口" })).not.toBeChecked();
    await user.click(screen.getByRole("link", { name: "返回任务配置" }));
    expect(JSON.parse(screen.getByTestId("return-state").textContent ?? "null")).toEqual(taskState);
  });

  it("批量保存未完成切换账号后不泄露选择、时间和旧结果", async () => {
    const oldSave = deferred<ApiPolicy[]>();
    vi.mocked(api.getAccount).mockImplementation((id) =>
      Promise.resolve(id === 8 ? account : secondAccount),
    );
    vi.mocked(api.listPolicies).mockImplementation((id) =>
      Promise.resolve(id === 8 ? [policy] : [secondPolicy]),
    );
    vi.mocked(api.batchUpdatePolicies).mockReturnValue(oldSave.promise);
    const user = userEvent.setup();
    render(<PolicyNavigationHarness />);
    await screen.findAllByText("流量数据-ASIN");
    await user.click(screen.getByRole("button", { name: "全选当前结果" }));
    await user.click(screen.getByRole("button", { name: "批量启用" }));
    expect(screen.getByLabelText("搜索同步接口")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "切换到账号 9" }));
    await screen.findAllByText("欧洲流量数据");
    await act(async () =>
      oldSave.resolve([
        { ...policy, enabled: true, scheduleMode: "daily", nextRunAt: "2026-09-10T03:30:00+08:00" },
      ]),
    );
    expect(screen.queryByLabelText("定时计划保存结果")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "全选当前结果" }));
    expect(screen.queryByRole("combobox", { name: "批量运行方式" })).not.toBeInTheDocument();
  });

  it("批量启用保留原周期并提示恢复定时设置", async () => {
    vi.mocked(api.listPolicies).mockResolvedValue([
      { ...policy, scheduleMode: "daily", scheduleExpr: "03:30" },
    ]);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/accounts/8/policies"]}>
        <Routes>
          <Route path="/accounts/:accountId/policies" element={<AccountPoliciesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findAllByText("流量数据-ASIN");
    await user.click(screen.getByRole("button", { name: "全选当前结果" }));
    expect(screen.getByText("启用后将恢复所选接口原有的定时设置。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "批量启用" }));

    expect(api.batchUpdatePolicies).toHaveBeenCalledWith(
      8,
      [
        expect.objectContaining({
          apiCode: "traffic_analysis_page",
          enabled: true,
          scheduleMode: "daily",
          scheduleExpr: "03:30",
          timezone: "Asia/Shanghai",
        }),
      ],
      "csrf-token",
    );
    expect(await screen.findByText("1 个接口策略已批量保存。")).toBeInTheDocument();
  });

  it("Operator 启用接口保留每日策略且不能修改官方规则", async () => {
    vi.mocked(api.listPolicies).mockResolvedValue([
      { ...policy, scheduleMode: "daily", scheduleExpr: "02:30" },
    ]);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/accounts/8/policies"]}>
        <Routes>
          <Route path="/accounts/:accountId/policies" element={<AccountPoliciesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect((await screen.findAllByText("流量数据-ASIN")).length).toBeGreaterThan(0);
    const editor = screen.getByRole("form", { name: "流量数据-ASIN策略编辑" });
    expect(editor.closest(".policy-select-item")).toContainElement(
      screen.getByRole("button", { name: /流量数据-ASIN/ }),
    );
    expect(screen.getByText("/operation/sts/trafficAnalysis/page")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全部接口 1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("日期窗口：按已保存的同步进度继续")).toBeInTheDocument();
    await user.click(screen.getByLabelText("启用此接口"));
    expect(screen.getByText("保存修改后再运行")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "同步此接口" })).not.toBeInTheDocument();
    expect(screen.getByText("启用后将恢复该接口原有的定时设置。")).toBeInTheDocument();
    expect(screen.queryByLabelText("执行时间")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "保存策略" }));

    expect(api.updatePolicy).toHaveBeenCalledWith(
      8,
      "traffic_analysis_page",
      expect.objectContaining({
        enabled: true,
        scheduleMode: "daily",
        scheduleExpr: "02:30",
        timezone: "Asia/Shanghai",
        windowMode: "checkpoint",
        lookbackDays: null,
        startDate: null,
      }),
      "csrf-token",
    );
    expect(await screen.findByRole("link", { name: "同步此接口" })).toBeInTheDocument();
  });

  it("按业务域分组展示策略，并可用概览快速定位自动计划和待启用项", async () => {
    const salesPolicy: ApiPolicy = {
      ...policy,
      id: 22,
      apiCode: "sale_return_order_page",
      name: "销售退货单",
      path: "/sale/return/page",
      domain: "sales",
      enabled: true,
    };
    const inventoryPolicy: ApiPolicy = {
      ...policy,
      id: 23,
      apiCode: "inventory_detail_page",
      name: "库存明细",
      path: "/inventory/detail/page",
      domain: "inventory",
      enabled: true,
      scheduleMode: "daily",
      scheduleExpr: "03:00",
      nextRunAt: "2026-08-28T03:00:00Z",
    };
    vi.mocked(api.listPolicies).mockResolvedValue([policy, salesPolicy, inventoryPolicy]);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/accounts/8/policies"]}>
        <Routes>
          <Route path="/accounts/:accountId/policies" element={<AccountPoliciesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "销售管理" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "库存管理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "已启用 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "自动计划 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "未启用 1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "定时计划" })).toHaveAttribute(
      "href",
      "/jobs/plans?account=8",
    );
    expect(screen.queryByText("选择接口后可批量设置")).not.toBeInTheDocument();
    expect(
      screen.queryByText("需要立即执行时，进入任务预览确认日期范围。"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "预览并发起同步" })).toHaveAttribute(
      "href",
      "/jobs/new?accountId=8",
    );

    await user.click(screen.getByRole("button", { name: "自动计划 1" }));
    expect(screen.getByText("当前显示 1 / 3")).toBeInTheDocument();
    expect(screen.getByText("自动计划已生效")).toBeInTheDocument();
    expect(screen.getByText(/北京时间/)).toBeInTheDocument();
    expect(screen.getByText("2026年8月28日 11:00")).toBeInTheDocument();
    expect(screen.queryByText("/sale/return/page")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "未启用 1" }));
    expect(screen.getByText("当前不可运行")).toBeInTheDocument();
    expect(screen.getByText("启用后可发起同步")).toBeInTheDocument();
  });

  it("与接口中心统一使用官方业务域，并在保存策略后保持分类", async () => {
    vi.mocked(api.getApiCatalog).mockResolvedValue([{ ...catalogItem, officialDomain: "统计" }]);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/accounts/8/policies"]}>
        <Routes>
          <Route path="/accounts/:accountId/policies" element={<AccountPoliciesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "统计" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "运营管理" })).not.toBeInTheDocument();
    await chooseSelectOption(user, "按业务域筛选", "统计");
    expect(screen.getByText("当前显示 1 / 1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存策略" }));

    expect(await screen.findByText("“流量数据-ASIN”策略已保存。")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "统计" })).toBeInTheDocument();
    expect(api.getApiCatalog).toHaveBeenCalledWith(8);
  });

  it("展示平台停用接口但禁止账号启用", async () => {
    vi.mocked(api.listPolicies).mockResolvedValue([
      policy,
      {
        ...policy,
        id: 24,
        apiCode: "placeholder_order_list",
        name: "订单列表示例",
        path: "/replace/with/real/order/list/path",
        catalogEnabled: false,
      },
    ]);
    render(
      <MemoryRouter initialEntries={["/accounts/8/policies"]}>
        <Routes>
          <Route path="/accounts/:accountId/policies" element={<AccountPoliciesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findAllByText("流量数据-ASIN");
    expect(screen.getByRole("button", { name: "全部接口 2" })).toBeInTheDocument();
    expect(screen.getAllByText("订单列表示例").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("选择 订单列表示例")).toBeDisabled();
  });

  it("旧假窗口模式统一显示并提交 checkpoint，同时清空旧字段", async () => {
    const user = userEvent.setup();
    vi.mocked(api.listPolicies).mockResolvedValue([
      {
        ...policy,
        windowMode: "lookback_days",
        lookbackDays: 30,
        startDate: "2020-01-01",
      },
    ]);
    render(
      <MemoryRouter initialEntries={["/accounts/8/policies"]}>
        <Routes>
          <Route path="/accounts/:accountId/policies" element={<AccountPoliciesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findAllByText("流量数据-ASIN");
    expect(screen.getByText("日期窗口：按已保存的同步进度继续")).toBeInTheDocument();
    expect(screen.queryByText("回看天数")).not.toBeInTheDocument();
    expect(screen.queryByText("首次同步日期")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "保存策略" }));

    expect(api.updatePolicy).toHaveBeenCalledWith(
      8,
      "traffic_analysis_page",
      expect.objectContaining({
        windowMode: "checkpoint",
        lookbackDays: null,
        startDate: null,
      }),
      "csrf-token",
    );
  });

  it("不支持日期窗口时只显示不适用并提交 null", async () => {
    const user = userEvent.setup();
    vi.mocked(api.listPolicies).mockResolvedValue([
      {
        ...policy,
        supportsDateWindow: false,
        windowMode: "checkpoint",
      },
    ]);
    render(
      <MemoryRouter initialEntries={["/accounts/8/policies"]}>
        <Routes>
          <Route path="/accounts/:accountId/policies" element={<AccountPoliciesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findAllByText("流量数据-ASIN");
    expect(screen.queryByRole("combobox", { name: "日期窗口" })).not.toBeInTheDocument();
    expect(screen.getByText("日期窗口：此接口不使用日期窗口")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "保存策略" }));

    expect(api.updatePolicy).toHaveBeenCalledWith(
      8,
      "traffic_analysis_page",
      expect.objectContaining({
        windowMode: null,
        lookbackDays: null,
        startDate: null,
      }),
      "csrf-token",
    );
  });

  it("按业务域筛选后行内详情同步切换，并可带入账号与接口发起任务", async () => {
    const salesPolicy: ApiPolicy = {
      ...policy,
      id: 22,
      apiCode: "sale_return_order_page",
      name: "销售退货单",
      path: "/sale/return/page",
      domain: "sales",
      enabled: true,
    };
    vi.mocked(api.listPolicies).mockResolvedValue([policy, salesPolicy]);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/accounts/8/policies"]}>
        <Routes>
          <Route path="/accounts/:accountId/policies" element={<AccountPoliciesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findAllByText("销售退货单");
    await chooseSelectOption(user, "按业务域筛选", "销售管理");

    expect(screen.getByText("/sale/return/page")).toBeInTheDocument();
    expect(screen.queryByText("/operation/sts/trafficAnalysis/page")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "同步此接口" })).toHaveAttribute(
      "href",
      "/jobs/new?accountId=8&apiCode=sale_return_order_page",
    );
  });

  it("切换账号后立即隐藏旧账号策略并显示新账号 loading", async () => {
    const nextAccount = deferred<JijiaAccount>();
    const nextPolicies = deferred<ApiPolicy[]>();
    vi.mocked(api.getAccount).mockImplementation((accountId) =>
      accountId === 8 ? Promise.resolve(account) : nextAccount.promise,
    );
    vi.mocked(api.listPolicies).mockImplementation((accountId) =>
      accountId === 8 ? Promise.resolve([policy]) : nextPolicies.promise,
    );
    const user = userEvent.setup();
    render(<PolicyNavigationHarness />);
    await screen.findAllByText("流量数据-ASIN");

    await user.click(screen.getByRole("button", { name: "切换到账号 9" }));

    expect(screen.queryAllByText("流量数据-ASIN")).toHaveLength(0);
    expect(screen.getByText("正在加载接口策略…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存策略" })).not.toBeInTheDocument();

    await act(async () => {
      nextAccount.resolve(secondAccount);
      nextPolicies.resolve([secondPolicy]);
    });
    expect((await screen.findAllByText("欧洲流量数据")).length).toBeGreaterThan(0);
  });

  it("旧账号加载延迟成功或失败均不能污染新账号", async () => {
    const oldAccount = deferred<JijiaAccount>();
    const oldPolicies = deferred<ApiPolicy[]>();
    vi.mocked(api.getAccount).mockImplementation((accountId) =>
      accountId === 8 ? oldAccount.promise : Promise.resolve(secondAccount),
    );
    vi.mocked(api.listPolicies).mockImplementation((accountId) =>
      accountId === 8 ? oldPolicies.promise : Promise.resolve([secondPolicy]),
    );
    const user = userEvent.setup();
    render(<PolicyNavigationHarness />);

    await user.click(screen.getByRole("button", { name: "切换到账号 9" }));
    expect((await screen.findAllByText("欧洲流量数据")).length).toBeGreaterThan(0);

    await act(async () => {
      oldAccount.reject(new Error("旧账号加载失败"));
      oldPolicies.resolve([policy]);
      await oldAccount.promise.catch(() => undefined);
    });
    expect(screen.queryByText("旧账号加载失败")).not.toBeInTheDocument();
    expect(screen.queryAllByText("流量数据-ASIN")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "保存策略" })).toBeEnabled();
  });

  it("旧账号加载延迟成功不能覆盖已显示的新账号", async () => {
    const oldAccount = deferred<JijiaAccount>();
    const oldPolicies = deferred<ApiPolicy[]>();
    vi.mocked(api.getAccount).mockImplementation((accountId) =>
      accountId === 8 ? oldAccount.promise : Promise.resolve(secondAccount),
    );
    vi.mocked(api.listPolicies).mockImplementation((accountId) =>
      accountId === 8 ? oldPolicies.promise : Promise.resolve([secondPolicy]),
    );
    const user = userEvent.setup();
    render(<PolicyNavigationHarness />);

    await user.click(screen.getByRole("button", { name: "切换到账号 9" }));
    expect((await screen.findAllByText("欧洲流量数据")).length).toBeGreaterThan(0);
    await act(async () => {
      oldAccount.resolve(account);
      oldPolicies.resolve([policy]);
    });

    expect(screen.queryAllByText("流量数据-ASIN")).toHaveLength(0);
    expect(screen.queryByText("北美业务账号")).not.toBeInTheDocument();
  });

  it("旧账号保存延迟成功不能覆盖新账号策略", async () => {
    const oldSave = deferred<ApiPolicy>();
    vi.mocked(api.getAccount).mockImplementation((accountId) =>
      Promise.resolve(accountId === 8 ? account : secondAccount),
    );
    vi.mocked(api.listPolicies).mockImplementation((accountId) =>
      Promise.resolve(accountId === 8 ? [policy] : [secondPolicy]),
    );
    vi.mocked(api.updatePolicy).mockReturnValue(oldSave.promise);
    const user = userEvent.setup();
    render(<PolicyNavigationHarness />);
    await screen.findAllByText("流量数据-ASIN");
    await user.click(screen.getByRole("button", { name: "保存策略" }));
    await waitFor(() => expect(api.updatePolicy).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "切换到账号 9" }));
    expect((await screen.findAllByText("欧洲流量数据")).length).toBeGreaterThan(0);
    await act(async () => {
      oldSave.resolve({ ...policy, enabled: true });
    });

    expect(screen.queryAllByText("流量数据-ASIN")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "保存策略" })).toBeEnabled();
  });

  it("旧账号保存延迟失败不能污染新账号错误或按钮", async () => {
    const oldSave = deferred<ApiPolicy>();
    vi.mocked(api.getAccount).mockImplementation((accountId) =>
      Promise.resolve(accountId === 8 ? account : secondAccount),
    );
    vi.mocked(api.listPolicies).mockImplementation((accountId) =>
      Promise.resolve(accountId === 8 ? [policy] : [secondPolicy]),
    );
    vi.mocked(api.updatePolicy).mockReturnValue(oldSave.promise);
    const user = userEvent.setup();
    render(<PolicyNavigationHarness />);
    await screen.findAllByText("流量数据-ASIN");
    await user.click(screen.getByRole("button", { name: "保存策略" }));
    await waitFor(() => expect(api.updatePolicy).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "切换到账号 9" }));
    expect((await screen.findAllByText("欧洲流量数据")).length).toBeGreaterThan(0);
    await act(async () => {
      oldSave.reject(new Error("旧账号保存失败"));
      await oldSave.promise.catch(() => undefined);
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存策略" })).toBeEnabled();
  });

  it("保存失败显示错误并恢复按钮，不产生未处理拒绝", async () => {
    vi.mocked(api.updatePolicy).mockRejectedValue(new ApiError("策略保存失败", 502, "BAD_GATEWAY"));
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/accounts/8/policies"]}>
        <Routes>
          <Route path="/accounts/:accountId/policies" element={<AccountPoliciesPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findAllByText("流量数据-ASIN");

    await user.click(screen.getByRole("button", { name: "保存策略" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("策略保存失败");
    expect(screen.getByRole("button", { name: "保存策略" })).toBeEnabled();
  });

  it("Viewer 仍只能查看 checkpoint 选项且不能保存", async () => {
    authState.role = "viewer";
    render(
      <MemoryRouter initialEntries={["/accounts/8/policies"]}>
        <Routes>
          <Route path="/accounts/:accountId/policies" element={<AccountPoliciesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findAllByText("流量数据-ASIN");
    expect(screen.queryByRole("combobox", { name: "日期窗口" })).not.toBeInTheDocument();
    expect(screen.getByText("日期窗口：按已保存的同步进度继续")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存策略" })).not.toBeInTheDocument();
    expect(screen.getByText("Viewer 仅可查看策略")).toBeInTheDocument();
  });
});

function PolicyNavigationHarness() {
  return (
    <MemoryRouter initialEntries={["/accounts/8/policies"]}>
      <PolicyNavigationContent />
    </MemoryRouter>
  );
}

function PolicyNavigationContent() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate("/accounts/9/policies")}>
        切换到账号 9
      </button>
      <Routes>
        <Route path="/accounts/:accountId/policies" element={<AccountPoliciesPage />} />
      </Routes>
    </>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function ReturnStateProbe() {
  const location = useLocation();
  return <div data-testid="return-state">{JSON.stringify(location.state)}</div>;
}
