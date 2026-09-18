import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api, ApiError } from "../api/client";
import type { ApiPolicy, JijiaAccount, SyncJobPreview } from "../api/types";
import "../styles.css";
import stylesCss from "../styles.css?raw";
import { SyncJobCreatePage } from "./SyncJobCreatePage";

const authState = vi.hoisted(() => ({
  csrfToken: "csrf-token" as string | null,
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    csrfToken: authState.csrfToken,
    user: {
      id: 3,
      email: "operator@example.com",
      displayName: "操作员",
      role: "operator",
    },
    logout: vi.fn(),
  }),
}));
vi.mock("../api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api/client")>();
  return {
    ...original,
    api: {
      ...original.api,
      createSyncJob: vi.fn(),
      getApiCatalog: vi.fn(),
      listAccounts: vi.fn(),
      listPolicies: vi.fn(),
      listSyncJobMarketOptions: vi.fn(),
      previewSyncJob: vi.fn(),
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
  lastVerifiedAt: "2026-08-26T02:42:00Z",
  lastVerifyError: null,
  createdAt: "2026-08-26T02:00:00Z",
  updatedAt: "2026-08-26T02:42:00Z",
};

const policy: ApiPolicy = {
  id: 4,
  accountId: 8,
  apiCode: "sale_return_order_page",
  name: "销售退货单",
  method: "POST",
  path: "/sale/return/page",
  domain: "销售",
  catalogEnabled: true,
  supportsDateWindow: true,
  supportsMarketScope: true,
  enabled: true,
  scheduleMode: "manual_only",
  scheduleExpr: null,
  timezone: "Asia/Shanghai",
  windowMode: "checkpoint",
  lookbackDays: null,
  startDate: null,
  nextRunAt: null,
};

const preview: SyncJobPreview = {
  rangeMode: "checkpoint",
  supportsDateWindow: true,
  scopeMode: "all",
  selectedMarketIds: [],
  scopeMessage: "该接口未声明已验证的店铺筛选参数，将同步账号可访问的全部数据。",
  startDate: "2021-09-01",
  endDate: "2021-09-30",
  windowDays: 31,
  windowCount: 1,
  previewToken: "preview-token",
  windows: [{ index: 1, startDate: "2021-09-01", endDate: "2021-09-30" }],
  checkpoint: {
    completeThrough: "2021-08-31",
    nextWindowStart: "2021-09-01",
    advancesOnSuccess: true,
  },
  recentSuccessfulRunAt: "2026-08-26T08:00:00Z",
  executionReadiness: { workerAvailability: "busy", queueDepth: 2 },
};

function getSelectContainer(label: string): Element {
  const container = screen.getByRole("combobox", { name: label }).closest(".ant-select");
  if (!container) throw new Error(`未找到 ${label} 下拉框容器`);
  return container;
}

async function waitForSelectText(label: string, value: string) {
  await waitFor(() => expect(getSelectContainer(label)).toHaveTextContent(value));
}

async function chooseSelectOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
) {
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("创建同步任务页", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.csrfToken = "csrf-token";
    vi.mocked(api.listAccounts).mockResolvedValue([account]);
    vi.mocked(api.getApiCatalog).mockResolvedValue([policy]);
    vi.mocked(api.listPolicies).mockResolvedValue([policy]);
    vi.mocked(api.listSyncJobMarketOptions).mockResolvedValue([
      { marketId: 101, label: "店铺 A · 美国站" },
      { marketId: 202, label: "店铺 A · 加拿大站" },
    ]);
    vi.mocked(api.previewSyncJob).mockResolvedValue(preview);
    vi.mocked(api.createSyncJob).mockResolvedValue({ jobId: 9 });
  });

  it("明确指定的不可用账号不替换为唯一可用账号", async () => {
    renderCreatePage("/jobs/new?accountId=99&apiCode=sale_return_order_page");
    await screen.findByText("链接中的账号当前不可用");
    expect(getSelectContainer("积加账号")).toHaveTextContent("账号 99（不可用）");
    expect(api.listPolicies).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "预览执行计划" })).toBeDisabled();
  });

  it("明确指定的不可用接口不替换为唯一已启用接口", async () => {
    renderCreatePage("/jobs/new?accountId=8&apiCode=amazon_shop_page");
    await screen.findByText("链接中的接口当前不可用");
    expect(getSelectContainer("已启用接口")).toHaveTextContent("amazon_shop_page（不可用）");
    expect(screen.getByRole("button", { name: "预览执行计划" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "检查接口策略" })).toHaveAttribute(
      "href",
      "/accounts/8/policies?apiCode=amazon_shop_page",
    );
  });

  it("仅指定接口时手动选择账号仍保留原接口目标", async () => {
    vi.mocked(api.listAccounts).mockResolvedValue([
      account,
      { ...account, id: 9, name: "欧洲账号" },
    ]);
    const user = userEvent.setup();
    renderCreatePage("/jobs/new?apiCode=amazon_shop_page");
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "积加账号" })).not.toBeDisabled(),
    );
    await chooseSelectOption(user, "积加账号", account.name);
    await screen.findByText("链接中的接口当前不可用");
    expect(getSelectContainer("已启用接口")).toHaveTextContent("amazon_shop_page（不可用）");
    expect(screen.getByRole("button", { name: "预览执行计划" })).toBeDisabled();
  });

  it("预览挂起时浏览器历史切换目标不会采用旧预览令牌", async () => {
    const pending = deferred<SyncJobPreview>();
    vi.mocked(api.previewSyncJob).mockReturnValue(pending.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          "/jobs/new?accountId=99",
          "/jobs/new?accountId=8&apiCode=sale_return_order_page",
        ]}
        initialIndex={1}
      >
        <HistoryBackButton />
        <Routes>
          <Route path="/jobs/new" element={<SyncJobCreatePage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitForSelectText("已启用接口", policy.name);
    await user.click(screen.getByRole("button", { name: "预览执行计划" }));
    await user.click(screen.getByRole("button", { name: "浏览器后退" }));
    await screen.findByText("链接中的账号当前不可用");
    await act(async () => pending.resolve(preview));
    expect(screen.queryByRole("heading", { name: "检查并创建" })).not.toBeInTheDocument();
    expect(getSelectContainer("积加账号")).toHaveTextContent("账号 99（不可用）");
    expect(api.createSyncJob).not.toHaveBeenCalled();
  });

  it("创建挂起时浏览器历史切换不会被旧成功结果跳走", async () => {
    const pending = deferred<{ jobId: number }>();
    vi.mocked(api.createSyncJob).mockReturnValue(pending.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          "/jobs/new?accountId=99",
          "/jobs/new?accountId=8&apiCode=sale_return_order_page",
        ]}
        initialIndex={1}
      >
        <HistoryBackButton />
        <Routes>
          <Route path="/jobs/new" element={<SyncJobCreatePage />} />
          <Route path="/jobs/:id" element={<CreatedRouteProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitForSelectText("已启用接口", policy.name);
    await user.click(screen.getByRole("button", { name: "预览执行计划" }));
    await user.click(await screen.findByRole("button", { name: "创建并加入队列" }));
    await user.click(screen.getByRole("button", { name: "浏览器后退" }));
    await screen.findByText("链接中的账号当前不可用");
    await act(async () => pending.resolve({ jobId: 9 }));
    expect(screen.queryByTestId("created-route")).not.toBeInTheDocument();
    expect(getSelectContainer("积加账号")).toHaveTextContent("账号 99（不可用）");
  });

  it("恢复任务草稿并重新预览，创建成功仍返回原来源", async () => {
    const user = userEvent.setup();
    renderCreatePage("/jobs/new?accountId=8&apiCode=sale_return_order_page", {
      from: "/sale-returns?orderNo=demo",
      backLabel: "返回退货订单",
      returnState: { page: 2 },
      syncJobDraft: {
        accountId: "8",
        apiCode: policy.apiCode,
        rangeMode: "custom",
        startDate: "2026-01-01",
        endDate: "2026-01-02",
        marketScopeMode: "selected",
        selectedMarketIds: [101],
      },
      preview: { previewToken: "stale-token" },
    });
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "店铺 A · 美国站" })).toBeChecked(),
    );
    expect(screen.getByLabelText("开始日期")).toHaveValue("2026-01-01");
    expect(screen.queryByRole("button", { name: "创建并加入队列" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "取消" })).toHaveAttribute(
      "href",
      "/sale-returns?orderNo=demo",
    );
    await user.click(screen.getByRole("button", { name: "预览执行计划" }));
    expect(api.previewSyncJob).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: "2026-01-01", marketIds: [101], previewToken: null }),
    );
    await user.click(await screen.findByRole("button", { name: "创建并加入队列" }));
    expect(await screen.findByTestId("created-route")).toHaveTextContent(
      "/sale-returns?orderNo=demo|返回退货订单",
    );
  });

  it("视觉隐藏图例不会扩展页面布局", async () => {
    renderCreatePage("/jobs/new?accountId=8&apiCode=sale_return_order_page");

    const legend = await screen.findByText("同步方式");
    expect(legend.tagName).toBe("LEGEND");
    const style = window.getComputedStyle(legend);
    expect(style.position).toBe("absolute");
    expect(style.maxWidth).toBe("1px");
    expect(style.maxHeight).toBe("1px");
    const hiddenRule = stylesCss.match(/\.sr-only\s*\{[^}]+\}/)?.[0] ?? "";
    expect(hiddenRule).toContain("width: 1px !important");
    expect(hiddenRule).toContain("margin: -1px !important");
    expect(hiddenRule).toContain("border: 0 !important");
    expect(hiddenRule).toContain("padding: 0 !important");
    expect(hiddenRule).toContain("clip-path: inset(50%) !important");
  });

  it("加载期间禁用下游控件，多个选项时不任意选择第一个", async () => {
    const accounts = deferred<JijiaAccount[]>();
    const secondAccount = { ...account, id: 9, name: "欧洲业务账号" };
    const secondPolicy = {
      ...policy,
      id: 5,
      apiCode: "purchase_order_page",
      name: "采购订单",
    };
    vi.mocked(api.listAccounts).mockReturnValue(accounts.promise);
    vi.mocked(api.getApiCatalog).mockResolvedValue([policy, secondPolicy]);
    vi.mocked(api.listPolicies).mockResolvedValue([policy, secondPolicy]);
    const user = userEvent.setup();
    renderCreatePage();

    expect(screen.getByLabelText("积加账号")).toBeDisabled();
    expect(screen.getByLabelText("已启用接口")).toBeDisabled();
    expect(screen.getByText("加载中")).toBeInTheDocument();

    await act(async () => accounts.resolve([account, secondAccount]));
    await waitFor(() => expect(screen.getByLabelText("积加账号")).toBeEnabled());
    expect(getSelectContainer("积加账号")).toHaveTextContent("请选择可用账号");
    await user.click(screen.getByRole("combobox", { name: "积加账号" }));
    expect(await screen.findByRole("option", { name: "欧洲业务账号" })).toBeInTheDocument();
    expect(screen.getByText("请选择本次同步目标")).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "北美业务账号" }));
    await waitForSelectText("已启用接口", "请选择已启用接口");
    expect(screen.getAllByText("请选择本次同步目标").length).toBeGreaterThanOrEqual(1);
  });

  it("URL 上下文透明预填账号和接口，预览后进入独立确认态", async () => {
    const longPreview: SyncJobPreview = {
      ...preview,
      startDate: "2021-01-01",
      endDate: "2021-06-30",
      windowCount: 6,
      previewToken: "long-preview",
      windows: Array.from({ length: 6 }, (_, index) => ({
        index: index + 1,
        startDate: `2021-0${index + 1}-01`,
        endDate: `2021-0${index + 1}-28`,
      })),
    };
    vi.mocked(api.previewSyncJob).mockResolvedValue(longPreview);
    const user = userEvent.setup();
    renderCreatePage("/jobs/new?accountId=8&apiCode=sale_return_order_page");

    await waitForSelectText("积加账号", "北美业务账号");
    await waitForSelectText("已启用接口", "销售退货单 · sale_return_order_page");
    expect(screen.getAllByText("来自链接")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "预览执行计划" }));
    const reviewHeading = await screen.findByRole("heading", { name: "检查并创建" });
    await waitFor(() => expect(reviewHeading).toHaveFocus());
    expect(screen.getByText("创建后任务进入后台队列。")).toBeInTheDocument();
    expect(
      screen.queryByText("请确认目标与数据范围。创建后任务会进入后台队列。"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("积加账号")).not.toBeInTheDocument();
    expect(screen.getByText("该接口将同步此账号可访问的全部店铺")).toBeInTheDocument();
    expect(screen.getByText("补齐历史至今")).toBeInTheDocument();
    expect(screen.getByText("2021-01-01")).toBeInTheDocument();
    expect(screen.getByText("2021-06-30")).toBeInTheDocument();
    expect(screen.getByText("31 天 / 窗口")).toBeInTheDocument();
    expect(screen.getByText("已完成至 2021-08-31")).toBeInTheDocument();
    expect(screen.getByText("任务成功后推进主检查点")).toBeInTheDocument();
    expect(screen.getByText(/执行服务忙碌；当前队列 2 个任务/)).toBeInTheDocument();
    const detailsSummary = screen.getByText("查看窗口明细（共 6 个）");
    expect(detailsSummary.closest("details")).not.toHaveAttribute("open");

    await user.click(detailsSummary);
    expect(screen.getByText("… 中间 2 个窗口")).toBeInTheDocument();
    expect(screen.getByText("查看全部 6 个窗口").closest("details")).not.toHaveAttribute("open");
  });

  it("重跑指定日期错误与字段关联，并阻止开始日期晚于结束日期", async () => {
    const user = userEvent.setup();
    renderCreatePage();

    await waitForSelectText("已启用接口", "销售退货单 · sale_return_order_page");
    await user.click(screen.getByRole("radio", { name: /重跑指定日期/ }));
    fireEvent.input(screen.getByLabelText("开始日期"), {
      target: { value: "2021-11-01" },
    });
    fireEvent.input(screen.getByLabelText("结束日期"), {
      target: { value: "2021-09-01" },
    });
    await user.click(screen.getByRole("button", { name: "预览执行计划" }));

    const startDate = screen.getByLabelText("开始日期");
    await waitFor(() => expect(startDate).toHaveAttribute("aria-invalid", "true"));
    expect(startDate).toHaveAttribute(
      "aria-describedby",
      "sync-date-constraints sync-start-date-error",
    );
    expect(screen.getAllByText("开始日期不能晚于结束日期")).toHaveLength(2);
    expect(api.previewSyncJob).not.toHaveBeenCalled();
  });

  it("返回修改数据范围时保留输入，字段变化会作废旧预览", async () => {
    const user = userEvent.setup();
    renderCreatePage();

    await waitForSelectText("已启用接口", "销售退货单 · sale_return_order_page");
    await user.click(screen.getByRole("radio", { name: /重跑指定日期/ }));
    fireEvent.input(screen.getByLabelText("开始日期"), {
      target: { value: "2021-09-01" },
    });
    fireEvent.input(screen.getByLabelText("结束日期"), {
      target: { value: "2021-11-01" },
    });
    await user.click(screen.getByRole("button", { name: "预览执行计划" }));
    await screen.findByRole("heading", { name: "检查并创建" });

    await user.click(screen.getByRole("button", { name: "修改数据范围" }));
    expect(screen.getByLabelText("开始日期")).toHaveValue("2021-09-01");
    expect(screen.getByLabelText("结束日期")).toHaveValue("2021-11-01");
    fireEvent.input(screen.getByLabelText("结束日期"), {
      target: { value: "2021-12-01" },
    });
    await user.click(screen.getByRole("button", { name: "预览执行计划" }));

    expect(api.previewSyncJob).toHaveBeenCalledTimes(2);
    expect(api.previewSyncJob).toHaveBeenLastCalledWith({
      jijiaAccountId: 8,
      apiCode: "sale_return_order_page",
      rangeMode: "custom",
      startDate: "2021-09-01",
      endDate: "2021-12-01",
      marketIds: null,
      previewToken: null,
    });
  });

  it("活动任务冲突时禁止创建并提供详情入口", async () => {
    vi.mocked(api.previewSyncJob).mockResolvedValue({
      ...preview,
      activeTask: { id: 7, taskNo: "TASK-LONG-000007", status: "paused" },
    });
    const user = userEvent.setup();
    renderCreatePage();

    await waitForSelectText("已启用接口", "销售退货单 · sale_return_order_page");
    await user.click(screen.getByRole("button", { name: "预览执行计划" }));

    expect(await screen.findByText("该账号与接口已有已暂停任务")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /查看活动任务/ })).toHaveAttribute("href", "/jobs/7");
    expect(screen.getByRole("button", { name: "请先处理活动任务" })).toBeDisabled();
    expect(api.createSyncJob).not.toHaveBeenCalled();
  });

  it("没有账号、账号未验证和没有接口时提供对应恢复入口", async () => {
    vi.mocked(api.listAccounts).mockResolvedValue([]);
    const { unmount } = renderCreatePage();
    expect(await screen.findByText("先接入积加账号")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "接入账号" })).toHaveAttribute("href", "/accounts/new");

    unmount();
    vi.mocked(api.listAccounts).mockResolvedValue([{ ...account, status: "pending_verification" }]);
    const secondRender = renderCreatePage();
    expect(await screen.findByText("先完成账号验证")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "检查账号状态" })).toHaveAttribute("href", "/accounts");

    secondRender.unmount();
    vi.mocked(api.listAccounts).mockResolvedValue([account]);
    vi.mocked(api.listPolicies).mockResolvedValue([]);
    renderCreatePage();
    expect(await screen.findByText("先启用一个接口策略")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "配置接口策略" })).toHaveAttribute(
      "href",
      "/accounts/8/policies",
    );
  });

  it("账号和目录加载失败时不显示空态，并可重新加载", async () => {
    vi.mocked(api.listAccounts)
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce([account]);
    const user = userEvent.setup();
    renderCreatePage();

    expect(await screen.findByRole("alert", { name: "账号和接口加载失败" })).toHaveTextContent(
      "账号与接口选项加载失败",
    );
    expect(screen.queryByText("先接入积加账号")).not.toBeInTheDocument();
    const retryButton = screen.getByRole("button", { name: "重新加载账号和接口" });
    retryButton.focus();
    expect(retryButton).toHaveFocus();

    await user.keyboard("{Enter}");

    await waitForSelectText("已启用接口", "销售退货单 · sale_return_order_page");
    expect(screen.queryByRole("alert", { name: "账号和接口加载失败" })).not.toBeInTheDocument();
    expect(api.listAccounts).toHaveBeenCalledTimes(2);
  });

  it("接口策略加载失败时不显示空态，并可重新加载", async () => {
    vi.mocked(api.listPolicies)
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce([policy]);
    const user = userEvent.setup();
    renderCreatePage();

    expect(await screen.findByRole("alert", { name: "接口策略加载失败" })).toHaveTextContent(
      "账号策略加载失败",
    );
    expect(screen.queryByText("先启用一个接口策略")).not.toBeInTheDocument();
    const retryButton = screen.getByRole("button", { name: "重新加载接口策略" });
    retryButton.focus();
    expect(retryButton).toHaveFocus();

    await user.keyboard("{Enter}");

    await waitForSelectText("已启用接口", "销售退货单 · sale_return_order_page");
    expect(screen.queryByRole("alert", { name: "接口策略加载失败" })).not.toBeInTheDocument();
    expect(api.listPolicies).toHaveBeenCalledTimes(2);
  });

  it("预览请求未完成时锁定全部配置控件", async () => {
    const previewRequest = deferred<SyncJobPreview>();
    vi.mocked(api.previewSyncJob).mockReturnValue(previewRequest.promise);
    const user = userEvent.setup();
    renderCreatePage();

    await waitForSelectText("已启用接口", "销售退货单 · sale_return_order_page");
    await user.click(screen.getByRole("radio", { name: /重跑指定日期/ }));
    fireEvent.input(screen.getByLabelText("开始日期"), {
      target: { value: "2021-09-01" },
    });
    fireEvent.input(screen.getByLabelText("结束日期"), {
      target: { value: "2021-09-30" },
    });
    await user.click(screen.getByRole("button", { name: "预览执行计划" }));

    await waitFor(() => expect(api.previewSyncJob).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("积加账号")).toBeDisabled();
    expect(screen.getByLabelText("已启用接口")).toBeDisabled();
    expect(screen.getByRole("radio", { name: /补齐历史至今/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /重跑指定日期/ })).toBeDisabled();
    expect(screen.getByLabelText("开始日期")).toBeDisabled();
    expect(screen.getByLabelText("结束日期")).toBeDisabled();
    expect(screen.getByRole("button", { name: /正在生成执行计划/ })).toBeDisabled();

    await act(async () =>
      previewRequest.resolve({
        ...preview,
        rangeMode: "custom",
        startDate: "2021-09-01",
        endDate: "2021-09-30",
      }),
    );
    expect(await screen.findByRole("heading", { name: "检查并创建" })).toBeInTheDocument();
  });

  it("不支持日期窗口的接口只展示同步当前完整结果", async () => {
    vi.mocked(api.listPolicies).mockResolvedValue([{ ...policy, supportsDateWindow: false }]);
    vi.mocked(api.previewSyncJob).mockResolvedValue({
      ...preview,
      supportsDateWindow: false,
      startDate: null,
      endDate: null,
      windowDays: 0,
      checkpoint: null,
      windows: [{ index: 1, startDate: null, endDate: null }],
    });
    const user = userEvent.setup();
    renderCreatePage();

    await waitForSelectText("已启用接口", "销售退货单 · sale_return_order_page");
    expect(screen.getAllByText("同步当前完整结果")).toHaveLength(2);
    expect(
      screen.getByText("此接口不使用日期窗口，每次同步当前可返回的完整结果。"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /补齐历史至今/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /重跑指定日期/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "预览执行计划" }));
    expect(await screen.findByRole("heading", { name: "检查并创建" })).toBeInTheDocument();
    expect(screen.getByText("当前可返回的完整结果")).toBeInTheDocument();
    expect(screen.queryByText("当前检查点")).not.toBeInTheDocument();
    expect(screen.queryByText(/窗口明细/)).not.toBeInTheDocument();
    expect(api.previewSyncJob).toHaveBeenCalledWith(
      expect.objectContaining({ rangeMode: "checkpoint", startDate: null, endDate: null }),
    );
  });

  it("检查点已追平时显示中性结果且不提供创建入口", async () => {
    vi.mocked(api.previewSyncJob).mockRejectedValue(
      new ApiError("修改时间增量已经追平", 409, "INCREMENTAL_CAUGHT_UP"),
    );
    const user = userEvent.setup();
    renderCreatePage();

    await waitForSelectText("已启用接口", "销售退货单 · sale_return_order_page");
    await user.click(screen.getByRole("button", { name: "预览执行计划" }));

    expect(await screen.findByRole("status", { name: "同步进度已追平" })).toHaveTextContent(
      "已同步至最新完整数据日",
    );
    expect(screen.getByText(/不需要创建同步任务/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "创建并加入队列" })).not.toBeInTheDocument();
    expect(screen.queryByText("修改时间增量已经追平")).not.toBeInTheDocument();
  });

  it("CSRF 失效时不创建任务并显示登录状态错误", async () => {
    authState.csrfToken = null;
    const user = userEvent.setup();
    renderCreatePage();

    await waitForSelectText("已启用接口", "销售退货单 · sale_return_order_page");
    await user.click(screen.getByRole("button", { name: "预览执行计划" }));
    await user.click(await screen.findByRole("button", { name: "创建并加入队列" }));

    expect(await screen.findByText("登录状态已失效，请重新登录")).toBeInTheDocument();
    expect(api.createSyncJob).not.toHaveBeenCalled();
  });

  it("创建成功后进入任务详情并传递队列提示和返回路径", async () => {
    const user = userEvent.setup();
    renderCreatePage();

    await waitForSelectText("已启用接口", "销售退货单 · sale_return_order_page");
    await user.click(screen.getByRole("button", { name: "预览执行计划" }));
    await user.click(await screen.findByRole("button", { name: "创建并加入队列" }));

    expect(api.createSyncJob).toHaveBeenCalledWith(
      {
        jijiaAccountId: 8,
        apiCode: "sale_return_order_page",
        rangeMode: "checkpoint",
        startDate: null,
        endDate: null,
        marketIds: null,
        previewToken: "preview-token",
      },
      "csrf-token",
    );
    expect(await screen.findByTestId("created-route")).toHaveTextContent(
      "/jobs/9|任务已加入队列|/jobs|返回任务列表|9",
    );
  });

  it("默认全部店铺，并支持勾选单个或多个店铺站点", async () => {
    const user = userEvent.setup();
    vi.mocked(api.previewSyncJob).mockResolvedValue({
      ...preview,
      scopeMode: "selected",
      selectedMarketIds: [101, 202],
      scopeMessage: "已按官方 marketIds 参数冻结 2 个店铺站点。",
    });
    renderCreatePage();

    await waitForSelectText("已启用接口", "销售退货单 · sale_return_order_page");
    expect(screen.getByRole("radio", { name: /全部店铺/ })).toBeChecked();
    await waitFor(() => expect(screen.getByRole("radio", { name: /指定店铺站点/ })).toBeEnabled());
    await user.click(screen.getByRole("radio", { name: /指定店铺站点/ }));
    await user.click(screen.getByRole("checkbox", { name: "店铺 A · 加拿大站" }));
    await user.click(screen.getByRole("checkbox", { name: "店铺 A · 美国站" }));
    await user.click(screen.getByRole("button", { name: "预览执行计划" }));

    expect(api.previewSyncJob).toHaveBeenCalledWith(
      expect.objectContaining({
        marketIds: [101, 202],
      }),
    );
    expect(await screen.findByText("已选择 2 个店铺站点")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "创建并加入队列" }));
    expect(api.createSyncJob).toHaveBeenCalledWith(
      expect.objectContaining({ marketIds: [101, 202] }),
      "csrf-token",
    );
  });

  it("快速切换账号时旧策略结果不能覆盖新账号选项", async () => {
    const secondAccount = { ...account, id: 9, name: "欧洲业务账号" };
    const secondPolicy = {
      ...policy,
      id: 5,
      accountId: 9,
      apiCode: "purchase_order_page",
      name: "采购订单",
    };
    const oldPolicies = deferred<ApiPolicy[]>();
    const newPolicies = deferred<ApiPolicy[]>();
    vi.mocked(api.listAccounts).mockResolvedValue([account, secondAccount]);
    vi.mocked(api.getApiCatalog).mockResolvedValue([policy, secondPolicy]);
    vi.mocked(api.listPolicies).mockImplementation((selectedAccountId) =>
      selectedAccountId === 8 ? oldPolicies.promise : newPolicies.promise,
    );
    const user = userEvent.setup();
    renderCreatePage();

    await waitFor(() => expect(screen.getByLabelText("积加账号")).toBeEnabled());
    await chooseSelectOption(user, "积加账号", "北美业务账号");
    await waitFor(() => expect(api.listPolicies).toHaveBeenCalledWith(8));
    await chooseSelectOption(user, "积加账号", "欧洲业务账号");
    await waitFor(() => expect(api.listPolicies).toHaveBeenCalledWith(9));

    await act(async () => oldPolicies.resolve([policy]));
    expect(getSelectContainer("已启用接口")).not.toHaveTextContent("销售退货单");
    expect(screen.getByLabelText("已启用接口")).toBeDisabled();

    await act(async () => newPolicies.resolve([secondPolicy]));
    await waitForSelectText("已启用接口", "采购订单 · purchase_order_page");
  });
});

function renderCreatePage(path = "/jobs/new", state?: unknown) {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: path.split("?")[0],
          search: path.includes("?") ? `?${path.split("?")[1]}` : "",
          state,
        },
      ]}
    >
      <Routes>
        <Route path="/jobs/new" element={<SyncJobCreatePage />} />
        <Route path="/jobs/:id" element={<CreatedRouteProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function CreatedRouteProbe() {
  const location = useLocation();
  const state = location.state as {
    backLabel?: string;
    createdJobId?: string;
    from?: string;
    jobCreatedNotice?: string;
  } | null;
  return (
    <div data-testid="created-route">
      {location.pathname}|{state?.jobCreatedNotice}|{state?.from}|{state?.backLabel}|
      {state?.createdJobId}
    </div>
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

function HistoryBackButton() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>浏览器后退</button>;
}
