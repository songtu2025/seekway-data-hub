import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api, ApiError } from "../api/client";
import type { ApiPolicy, JijiaAccount, ScheduledPlan } from "../api/types";
import { ScheduledPlanPage } from "./ScheduledPlanPage";
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
      getWorkerRuntime: vi.fn(),
      listAccounts: vi.fn(),
      listPolicies: vi.fn(),
      listScheduledPlans: vi.fn(),
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
const scheduledPlan: ScheduledPlan = {
  id: 20,
  jijiaAccountId: 8,
  accountName: "北美业务账号",
  apiCode: "traffic_analysis_page",
  apiName: "流量数据-ASIN",
  scheduleMode: "daily",
  scheduleExpr: "02:30",
  timezone: "Asia/Shanghai",
  nextRunAt: "2026-09-12T02:30:00+08:00",
  status: "normal",
  nextWindowPreview: {
    phase: "update_incremental",
    basisLabel: "按修改时间增量",
    nextStartDate: "2026-09-10",
    nextEndDate: "2026-09-10",
    completeThrough: "2026-09-09",
    lagDays: 1,
    maxWindowDays: 31,
    advancesOnSuccess: true,
    predictionStatus: "exact",
  },
  blockingJob: null,
  latestScheduledJob: null,
};
async function chooseSelectOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
) {
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

function expectSelectText(label: string, value: string) {
  expect(screen.getByRole("combobox", { name: label }).closest(".ant-select")).toHaveTextContent(
    value,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

describe("同步任务定时计划页", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = "operator";
    vi.mocked(api.getWorkerRuntime).mockResolvedValue({
      availability: "online",
      capacityStatus: "ready",
      configuredWorkerCount: 1,
      onlineWorkerCount: 1,
      busyWorkerCount: 0,
      idleWorkerCount: 1,
      staleWorkerCount: 0,
      heartbeatAt: null,
      currentJobId: null,
      queueDepth: 0,
      oldestQueuedAt: null,
      pollIntervalSeconds: 3,
      offlineAfterSeconds: 90,
    });
    vi.mocked(api.listAccounts).mockResolvedValue([account]);
    vi.mocked(api.getAccount).mockResolvedValue(account);
    vi.mocked(api.listPolicies).mockResolvedValue([policy]);
    vi.mocked(api.listScheduledPlans).mockResolvedValue([scheduledPlan]);
    vi.mocked(api.updatePolicy).mockImplementation(async (_accountId, _apiCode, input) => ({
      ...policy,
      ...input,
      nextRunAt: "2026-08-27T18:30:00",
    }));
    vi.mocked(api.batchUpdatePolicies).mockImplementation(async (_accountId, items) =>
      items.map((item) => ({ ...policy, ...item, accountId: 8 })),
    );
  });

  function renderSchedule(
    path = "/jobs/plans/new?accountId=8",
    state: object = { from: "/jobs/plans?status=overdue&page=2" },
  ) {
    const [pathname, search = ""] = path.split("?");
    return render(
      <MemoryRouter
        initialEntries={[
          {
            pathname,
            search: `?${search}`,
            state,
          },
        ]}
      >
        <Routes>
          <Route path="/jobs/plans/new" element={<ScheduledPlanPage />} />
          <Route path="/jobs/plans/:accountId/:apiCode" element={<ScheduledPlanPage />} />
          <Route path="/accounts/:accountId/policies" element={<AccountPoliciesPage />} />
          <Route path="/accounts/:accountId" element={<div>账号概览来源</div>} />
        </Routes>
        <LocationState />
        <AccountNavigation />
      </MemoryRouter>,
    );
  }

  it("定时创建默认每日空时间，未选接口不能保存，保存后展示服务端时间和返回上下文", async () => {
    vi.mocked(api.batchUpdatePolicies).mockImplementation(async (_id, items) =>
      items.map((item) => ({ ...policy, ...item, nextRunAt: "2026-09-10T03:30:00+08:00" })),
    );
    const user = userEvent.setup();
    renderSchedule();
    await screen.findByText(/已选择 0 个接口/);
    expect(
      screen.queryByText("确认计划所属账号，并查看任务执行服务是否可用。"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("当前结果 1 / 共 1 · 已选 0")).toBeInTheDocument();
    expectSelectText("批量运行方式", "每日");
    const expressionInput = screen.getByLabelText("批量每日执行时间");
    expect(expressionInput).toHaveValue("");
    const executionColumn = screen.getByLabelText("执行计划与保存");
    expect(executionColumn).toContainElement(screen.getByRole("contentinfo"));
    expect(executionColumn.closest(".scheduled-plan-workspace")).toContainElement(
      screen.getByRole("region", { name: "2. 同步接口" }),
    );
    expect(screen.getByRole("button", { name: /保存 \d+ 个定时计划/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "全选当前结果" }));
    expect(screen.getByRole("button", { name: "全选当前结果" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "清空选择" })).toBeEnabled();
    expect(screen.getByText("新启用").parentElement).toHaveTextContent("新启用 1");
    await user.click(screen.getByRole("button", { name: /保存 \d+ 个定时计划/ }));
    const fieldError = await screen.findByText("请输入每日执行时间");
    expect(expressionInput).toHaveFocus();
    expect(expressionInput).toHaveAttribute("aria-invalid", "true");
    expect(expressionInput.getAttribute("aria-describedby")).toContain(fieldError.id);
    expect(api.batchUpdatePolicies).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("批量每日执行时间"), "03:30");
    await user.click(screen.getByRole("button", { name: /保存 \d+ 个定时计划/ }));
    expect(await screen.findByText(/下次计划时间：2026年9月10日 03:30/)).toBeInTheDocument();
    expect(api.batchUpdatePolicies).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "查看定时计划" })).toHaveAttribute(
      "href",
      "/jobs/plans?status=overdue&page=2",
    );
    expect(screen.queryByRole("link", { name: "预览并发起同步" })).not.toBeInTheDocument();
  });

  it("首载失败只显示错误和重试，不把请求失败误报为空数据", async () => {
    vi.mocked(api.getAccount).mockRejectedValueOnce(
      new ApiError("计划配置暂时无法读取", 503, "SERVICE_UNAVAILABLE"),
    );
    renderSchedule();
    expect(await screen.findByText("计划配置暂时无法读取")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新加载" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "2. 同步接口" })).not.toBeInTheDocument();
    expect(screen.queryByText(/暂无可配置接口/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("批量每日执行时间")).not.toBeInTheDocument();
  });

  it("即时筛选显示结果计数、自动展开命中域并可一键清除", async () => {
    vi.mocked(api.listPolicies).mockResolvedValue([
      policy,
      { ...policy, id: 21, apiCode: "inventory_page", name: "库存明细", domain: "inventory" },
    ]);
    const user = userEvent.setup();
    renderSchedule();
    await screen.findByText("当前结果 2 / 共 2 · 已选 0");
    const groups = screen.getAllByRole("group");
    expect(groups).toHaveLength(2);
    groups.forEach((group) => expect(group).not.toHaveAttribute("open"));
    const searchInput = screen.getByLabelText("搜索同步接口");
    await user.type(searchInput, "流量");
    await waitFor(() => expect(screen.getByRole("group")).toHaveAttribute("open"));
    expect(screen.getByText("当前结果 1 / 共 2 · 已选 0")).toBeInTheDocument();
    await user.clear(searchInput);
    await user.type(searchInput, "不存在");
    expect(await screen.findByText("没有符合条件的接口。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "清除搜索和筛选" }));
    expect(searchInput).toHaveValue("");
    expect(screen.getByText("当前结果 2 / 共 2 · 已选 0")).toBeInTheDocument();
  });

  it("接口选择整行与复选框共用单一键盘路径", async () => {
    const user = userEvent.setup();
    renderSchedule();
    await screen.findByText("当前结果 1 / 共 1 · 已选 0");
    await user.click(screen.getByRole("group").querySelector("summary")!);
    const checkbox = screen.getByRole("checkbox", { name: "选择 流量数据-ASIN" });
    checkbox.focus();
    await user.keyboard(" ");
    expect(checkbox).toBeChecked();
    expect(screen.getByText("当前结果 1 / 共 1 · 已选 1")).toBeInTheDocument();
    expect(
      within(screen.getByRole("group")).queryByRole("button", { name: /流量数据-ASIN/ }),
    ).not.toBeInTheDocument();
  });

  it("精准修改固定账号和接口，回填周期并单项保存", async () => {
    vi.mocked(api.listPolicies).mockResolvedValue([
      policy,
      {
        ...policy,
        apiCode: "target",
        name: "库存计划",
        enabled: true,
        scheduleMode: "cron",
        scheduleExpr: "0 */6 * * *",
      },
    ]);
    const user = userEvent.setup();
    renderSchedule("/jobs/plans/8/target");
    expect(await screen.findByLabelText("Cron 表达式")).toHaveValue("0 */6 * * *");
    expect(screen.queryByLabelText("搜索同步接口")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "同步账号" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "保存修改" }));
    expect(api.updatePolicy).toHaveBeenCalledWith(
      8,
      "target",
      expect.objectContaining({ scheduleMode: "cron", scheduleExpr: "0 */6 * * *" }),
      "csrf-token",
    );
    expect(api.batchUpdatePolicies).not.toHaveBeenCalled();
  });

  it("查看或修改计划时展示服务端返回的数据范围规则", async () => {
    vi.mocked(api.listPolicies).mockResolvedValue([
      { ...policy, enabled: true, scheduleMode: "daily", scheduleExpr: "02:30" },
    ]);

    renderSchedule("/jobs/plans/8/traffic_analysis_page");

    const rules = await screen.findByRole("region", { name: "数据范围规则" });
    expect(within(rules).getByText("增量同步")).toBeInTheDocument();
    expect(within(rules).getByText("2026-09-09")).toBeInTheDocument();
    expect(within(rules).getByText("2026-09-10")).toBeInTheDocument();
    expect(within(rules).getByText("1 天")).toBeInTheDocument();
    expect(within(rules).getByText("31 天")).toBeInTheDocument();
    expect(within(rules).getByText("仅当前窗口成功后推进同步水位")).toBeInTheDocument();
    expect(within(rules).getByText("按修改时间增量")).toBeInTheDocument();
  });

  it("保存修改后重新读取服务端预测", async () => {
    vi.mocked(api.listPolicies).mockResolvedValue([
      { ...policy, enabled: true, scheduleMode: "daily", scheduleExpr: "02:30" },
    ]);
    vi.mocked(api.listScheduledPlans)
      .mockResolvedValueOnce([scheduledPlan])
      .mockResolvedValueOnce([
        {
          ...scheduledPlan,
          nextWindowPreview: {
            ...scheduledPlan.nextWindowPreview,
            nextStartDate: "2026-09-11",
            nextEndDate: "2026-09-11",
            completeThrough: "2026-09-10",
          },
        },
      ]);
    const user = userEvent.setup();
    renderSchedule("/jobs/plans/8/traffic_analysis_page");
    const rules = await screen.findByRole("region", { name: "数据范围规则" });
    expect(within(rules).getByText("2026-09-10")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存修改" }));

    expect(await within(rules).findByText("2026-09-11")).toBeInTheDocument();
    expect(api.listScheduledPlans).toHaveBeenCalledTimes(2);
  });

  it("全选排除平台停用接口，失败保留输入，缺少下次时间不宣称已确认执行", async () => {
    vi.mocked(api.listPolicies).mockResolvedValue([
      policy,
      { ...policy, apiCode: "blocked", name: "平台停用接口", catalogEnabled: false, enabled: true },
    ]);
    vi.mocked(api.batchUpdatePolicies).mockRejectedValueOnce(
      new ApiError("Cron 不合法", 422, "INVALID"),
    );
    const user = userEvent.setup();
    renderSchedule();
    await screen.findByText(/已选择 0 个接口/);
    await user.click(screen.getByRole("button", { name: "全选当前结果" }));
    expect(screen.getByLabelText("选择 平台停用接口")).toBeDisabled();
    expect(screen.getByText(/已选择 1 个接口/)).toBeInTheDocument();
    await chooseSelectOption(user, "批量运行方式", "高级：Cron");
    await user.type(screen.getByLabelText("批量 Cron 表达式"), "invalid");
    await user.click(screen.getByRole("button", { name: /保存 \d+ 个定时计划/ }));
    const actionBar = screen.getByRole("contentinfo");
    expect(await within(actionBar).findByText("Cron 不合法")).toBeInTheDocument();
    expect(screen.getByLabelText("批量 Cron 表达式")).toHaveValue("invalid");
    expect(screen.getByText(/已选择 1 个接口/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("批量 Cron 表达式"));
    await user.type(screen.getByLabelText("批量 Cron 表达式"), "0 */6 * * *");
    await user.click(screen.getByRole("button", { name: /保存 \d+ 个定时计划/ }));
    expect(await screen.findByText(/下次计划时间未返回，请查看计划状态/)).toBeInTheDocument();
  });

  it("接口选择实际变化会清除陈旧保存错误，无操作按钮保持禁用", async () => {
    vi.mocked(api.listPolicies).mockResolvedValue([
      policy,
      { ...policy, id: 21, apiCode: "inventory_page", name: "库存明细" },
    ]);
    vi.mocked(api.batchUpdatePolicies).mockRejectedValue(
      new ApiError("旧的保存错误", 422, "INVALID"),
    );
    const user = userEvent.setup();
    renderSchedule();
    await screen.findByText("当前结果 2 / 共 2 · 已选 0");
    await user.type(screen.getByLabelText("批量每日执行时间"), "03:30");
    const firstPolicy = screen.getByRole("checkbox", { name: "选择 流量数据-ASIN" });

    await user.click(firstPolicy);
    await user.click(screen.getByRole("button", { name: /保存 \d+ 个定时计划/ }));
    expect(await screen.findByText("旧的保存错误")).toBeInTheDocument();
    await user.click(firstPolicy);
    expect(screen.queryByText("旧的保存错误")).not.toBeInTheDocument();

    await user.click(firstPolicy);
    await user.click(screen.getByRole("button", { name: /保存 \d+ 个定时计划/ }));
    expect(await screen.findByText("旧的保存错误")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "全选当前结果" }));
    expect(screen.queryByText("旧的保存错误")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /保存 \d+ 个定时计划/ }));
    expect(await screen.findByText("旧的保存错误")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全选当前结果" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "清空选择" }));
    expect(screen.queryByText("旧的保存错误")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "清空选择" })).toBeDisabled();
  });

  it("超过 100 项明确显示限制且不能提交", async () => {
    vi.mocked(api.listPolicies).mockResolvedValue(
      Array.from({ length: 101 }, (_, index) => ({
        ...policy,
        id: index,
        apiCode: `api_${index}`,
        name: `接口 ${index}`,
      })),
    );
    const user = userEvent.setup();
    renderSchedule();
    await screen.findByText(/已选择 0 个接口/);
    await user.click(screen.getByRole("button", { name: "全选当前结果" }));
    expect(screen.getByText(/已选择 101 个接口（每次最多 100 个）/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /保存 \d+ 个定时计划/ })).toBeDisabled();
    expect(api.batchUpdatePolicies).not.toHaveBeenCalled();
  });

  it("停用账号禁止保存定时计划，Viewer 不显示保存入口", async () => {
    vi.mocked(api.getAccount).mockResolvedValue({ ...account, status: "inactive" });
    const view = renderSchedule();
    expect(
      await screen.findByText("账号尚未验证或已停用，恢复有效状态后才能保存计划。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /保存 \d+ 个定时计划/ })).toBeDisabled();
    view.unmount();
    authState.role = "viewer";
    renderSchedule();
    expect(await screen.findByText("当前为只读权限，不能创建定时计划。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /保存 \d+ 个定时计划/ })).not.toBeInTheDocument();
  });

  it("关闭定时执行保留接口启用状态，且不提交批量请求", async () => {
    vi.mocked(api.listPolicies).mockResolvedValue([
      { ...policy, enabled: true, scheduleMode: "daily", scheduleExpr: "02:30" },
    ]);
    const user = userEvent.setup();
    renderSchedule("/jobs/plans/8/traffic_analysis_page");
    await user.click(await screen.findByRole("button", { name: "关闭定时执行" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "关闭定时执行" }),
    );
    expect(api.updatePolicy).toHaveBeenCalledWith(
      8,
      policy.apiCode,
      expect.objectContaining({ enabled: true, scheduleMode: "manual_only", scheduleExpr: null }),
      "csrf-token",
    );
    expect(await screen.findByText(/定时执行已关闭/)).toBeInTheDocument();
    expect(api.batchUpdatePolicies).not.toHaveBeenCalled();
  });

  it("Viewer 查看单项计划保持同步任务归属且没有编辑入口", async () => {
    authState.role = "viewer";
    renderSchedule("/jobs/plans/8/traffic_analysis_page");
    await screen.findByText("当前为只读权限，可查看接口的周期和运行状态。");
    expect(screen.getByRole("heading", { name: "查看定时计划" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存修改" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "关闭定时执行" })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("navigation", { name: "主导航" })).getByRole("link", {
        name: "同步任务",
      }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("切换账号确认后清空选择和时间，取消时保留编辑", async () => {
    const other = { ...account, id: 9, name: "欧洲业务账号" };
    const inactive = { ...account, id: 10, name: "停用账号", status: "inactive" as const };
    vi.mocked(api.listAccounts).mockResolvedValue([account, other, inactive]);
    vi.mocked(api.getAccount).mockImplementation(async (id) => (id === 8 ? account : other));
    vi.mocked(api.listPolicies).mockImplementation(async (id) => [{ ...policy, accountId: id }]);
    const user = userEvent.setup();
    renderSchedule();
    await screen.findByText(/已选择 0 个接口/);
    await user.click(screen.getByRole("combobox", { name: "同步账号" }));
    expect(await screen.findByRole("option", { name: "停用账号（不可用）" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "全选当前结果" }));
    await user.type(screen.getByLabelText("批量每日执行时间"), "03:30");
    await chooseSelectOption(user, "同步账号", "欧洲业务账号");
    expect(screen.getByText(/从“北美业务账号”切换到“欧洲业务账号”/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "继续编辑" }));
    expect(screen.getByLabelText("批量每日执行时间")).toHaveValue("03:30");
    await chooseSelectOption(user, "同步账号", "欧洲业务账号");
    await user.click(screen.getByRole("button", { name: "切换并清空选择" }));
    await screen.findByText(/当前账号：欧洲业务账号/);
    expect(screen.getByText(/已选择 0 个接口/)).toBeInTheDocument();
    expect(screen.getByLabelText("批量每日执行时间")).toHaveValue("");
    expect(screen.getByTestId("location")).toHaveTextContent("accountId=9");
    await user.click(screen.getByRole("button", { name: "历史返回" }));
    expect(screen.getByTestId("location")).toHaveTextContent("accountId=9");
  });

  it.each([
    ["/accounts/8/policies?intent=schedule", "/jobs/plans/new?accountId=8", "创建定时计划"],
    [
      "/accounts/8/policies?intent=schedule&apiCode=traffic_analysis_page",
      "/jobs/plans/8/traffic_analysis_page",
      "修改定时计划",
    ],
  ])("旧地址 %s 自动迁移到同步任务", async (path, expected, heading) => {
    renderSchedule(path);
    await screen.findByRole("heading", { name: heading });
    expect(screen.getByTestId("location")).toHaveTextContent(expected);
    expect(screen.getByRole("link", { name: "返回定时计划" })).toHaveAttribute(
      "href",
      "/jobs/plans?status=overdue&page=2",
    );
  });
  it("重新检查会刷新账号和接口状态并保留草稿", async () => {
    vi.mocked(api.getAccount)
      .mockResolvedValueOnce(account)
      .mockResolvedValueOnce({ ...account, status: "inactive" })
      .mockResolvedValue(account);
    const user = userEvent.setup();
    renderSchedule();
    await screen.findByText(/已选择 0 个接口/);
    await user.click(screen.getByRole("button", { name: "全选当前结果" }));
    await user.type(screen.getByLabelText("批量每日执行时间"), "03:30");
    await user.click(screen.getByRole("button", { name: "重新检查配置" }));
    await screen.findByText("账号尚未验证或已停用，恢复有效状态后才能保存计划。");
    await user.click(screen.getByRole("button", { name: "再次检查账号状态" }));
    expect(await screen.findByLabelText("批量每日执行时间")).toHaveValue("03:30");
    expect(screen.getByText(/已选择 1 个接口/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /保存 \d+ 个定时计划/ })).toBeEnabled();
    expect(api.getAccount).toHaveBeenCalledTimes(3);
    expect(api.listPolicies).toHaveBeenCalledTimes(3);
  });

  it("重新检查期间保留筛选、选择和时间，并阻止重复请求", async () => {
    const accountRefresh = deferred<JijiaAccount>();
    const policiesRefresh = deferred<ApiPolicy[]>();
    const user = userEvent.setup();
    renderSchedule();
    await screen.findByText(/已选择 0 个接口/);
    await user.type(screen.getByLabelText("搜索同步接口"), "流量");
    await user.click(screen.getByRole("button", { name: "全选当前结果" }));
    await user.type(screen.getByLabelText("批量每日执行时间"), "03:30");
    vi.mocked(api.getAccount).mockReturnValue(accountRefresh.promise);
    vi.mocked(api.listPolicies).mockReturnValue(policiesRefresh.promise);

    await user.dblClick(screen.getByRole("button", { name: "重新检查配置" }));

    expect(api.getAccount).toHaveBeenCalledTimes(2);
    expect(api.listPolicies).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/正在刷新 · 上次检查/)).toBeVisible();
    expect(screen.getByRole("button", { name: "重新检查配置" })).toBeDisabled();
    expect(screen.getByLabelText("搜索同步接口")).toHaveValue("流量");
    expect(screen.getByText(/已选择 1 个接口/)).toBeInTheDocument();
    expect(screen.getByLabelText("批量每日执行时间")).toHaveValue("03:30");

    await act(async () => {
      accountRefresh.resolve(account);
      policiesRefresh.resolve([policy]);
      await Promise.all([accountRefresh.promise, policiesRefresh.promise]);
    });

    expect(screen.getByText(/上次检查/)).toBeVisible();
    expect(screen.getByRole("button", { name: "重新检查配置" })).toBeEnabled();
  });

  it("重新检查部分失败时更新成功状态并保留旧配置", async () => {
    const user = userEvent.setup();
    renderSchedule();
    await screen.findByText(/已选择 0 个接口/);
    await user.click(screen.getByRole("button", { name: "全选当前结果" }));
    await user.type(screen.getByLabelText("批量每日执行时间"), "03:30");
    vi.mocked(api.getAccount).mockResolvedValue({ ...account, status: "inactive" });
    vi.mocked(api.listPolicies).mockRejectedValue(
      new ApiError("接口策略暂时不可用", 503, "UNAVAILABLE"),
    );

    await user.click(screen.getByRole("button", { name: "重新检查配置" }));

    expect(
      await screen.findByText("账号尚未验证或已停用，恢复有效状态后才能保存计划。"),
    ).toBeInTheDocument();
    expect(screen.getByText("接口策略暂时不可用").closest(".ant-alert")).toHaveClass(
      "ant-alert-warning",
    );
    expect(screen.getByText(/刷新失败 · 仍显示/)).toBeVisible();
    expect(screen.getByText(/已选择 1 个接口/)).toBeInTheDocument();
    expect(screen.getByLabelText("批量每日执行时间")).toHaveValue("03:30");
    expect(screen.getByRole("button", { name: "重新检查配置" })).toBeEnabled();
  });

  it("重新检查后移除服务端已删除的选择并明确提示", async () => {
    const inventoryPolicy = {
      ...policy,
      id: 21,
      apiCode: "inventory_page",
      name: "库存明细",
    };
    vi.mocked(api.listPolicies).mockResolvedValue([policy, inventoryPolicy]);
    const user = userEvent.setup();
    renderSchedule();
    await screen.findByText("当前结果 2 / 共 2 · 已选 0");
    await user.click(screen.getByRole("button", { name: "全选当前结果" }));
    await user.type(screen.getByLabelText("批量每日执行时间"), "03:30");
    vi.mocked(api.listPolicies).mockResolvedValue([policy]);

    await user.click(screen.getByRole("button", { name: "重新检查配置" }));

    expect(await screen.findByText("1 个已选接口已不可用，已从选择中移除。")).toBeVisible();
    expect(screen.getByText(/已选择 1 个接口/)).toBeInTheDocument();
    expect(screen.getByLabelText("批量每日执行时间")).toHaveValue("03:30");
  });

  it("保存未完成时历史导航切换账号会解除锁定并忽略旧结果", async () => {
    let finishSave!: (value: ApiPolicy[]) => void;
    const pending = new Promise<ApiPolicy[]>((resolve) => {
      finishSave = resolve;
    });
    const other = { ...account, id: 9, name: "欧洲业务账号" };
    vi.mocked(api.listAccounts).mockResolvedValue([account, other]);
    vi.mocked(api.getAccount).mockImplementation(async (id) => (id === 8 ? account : other));
    vi.mocked(api.listPolicies).mockImplementation(async (id) => [{ ...policy, accountId: id }]);
    vi.mocked(api.batchUpdatePolicies).mockReturnValueOnce(pending);
    const user = userEvent.setup();
    renderSchedule();
    await screen.findByText(/已选择 0 个接口/);
    await user.click(screen.getByRole("button", { name: "全选当前结果" }));
    await user.type(screen.getByLabelText("批量每日执行时间"), "03:30");
    await user.click(screen.getByRole("button", { name: /保存 \d+ 个定时计划/ }));
    await user.click(screen.getByRole("button", { name: "历史导航到账号 9" }));
    await screen.findByText(/当前账号：欧洲业务账号/);
    expect(screen.getByRole("combobox", { name: "同步账号" })).toBeEnabled();
    await act(async () => finishSave([{ ...policy, enabled: true, scheduleMode: "daily" }]));
    expect(screen.queryByLabelText("定时计划保存结果")).not.toBeInTheDocument();
    expect(screen.getByText(/已选择 0 个接口/)).toBeInTheDocument();
    expect(screen.getByLabelText("批量每日执行时间")).toHaveValue("");
  });
  it("执行服务离线仍允许保存计划并说明当前不可执行", async () => {
    vi.mocked(api.getWorkerRuntime).mockResolvedValue({
      availability: "offline",
      capacityStatus: "offline",
      configuredWorkerCount: 1,
      onlineWorkerCount: 0,
      busyWorkerCount: 0,
      idleWorkerCount: 0,
      staleWorkerCount: 0,
      heartbeatAt: null,
      currentJobId: null,
      queueDepth: 0,
      oldestQueuedAt: null,
      pollIntervalSeconds: 3,
      offlineAfterSeconds: 90,
    });
    const user = userEvent.setup();
    renderSchedule();
    await screen.findByText("执行服务离线");
    await screen.findByText(/已选择 0 个接口/);
    await user.click(screen.getByRole("button", { name: "全选当前结果" }));
    await user.type(screen.getByLabelText("批量每日执行时间"), "03:30");
    await user.click(screen.getByRole("button", { name: /保存 \d+ 个定时计划/ }));
    expect(await screen.findByLabelText("定时计划保存结果")).toBeInTheDocument();
  });
  it.each([
    ["/jobs/plans/new?accountId=8", "/accounts/8", "返回账号概览"],
    [
      `/jobs/plans/8/${policy.apiCode}`,
      `/accounts/8/policies?apiCode=${policy.apiCode}`,
      "返回同步接口",
    ],
  ])("账号来源%s保持任务模块且保存前后正确返回", async (path, from, backLabel) => {
    const user = userEvent.setup();
    renderSchedule(path, {
      from,
      backLabel,
      returnState: { from: "/accounts?filter=attention", backLabel: "返回账号列表" },
    });
    await screen.findByText(/当前账号：/);
    expect(screen.getByRole("link", { name: "同步任务" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: backLabel })).toHaveAttribute("href", from);
    if (path.includes("/new"))
      await user.click(screen.getByRole("button", { name: "全选当前结果" }));
    await user.type(
      screen.getByLabelText(path.includes("/new") ? "批量每日执行时间" : "执行时间"),
      "03:30",
    );
    await user.click(
      screen.getByRole("button", {
        name: path.includes("/new") ? /保存 \d+ 个定时计划/ : "保存修改",
      }),
    );
    const result = await screen.findByLabelText("定时计划保存结果");
    const backLink = within(result).getByRole("link", { name: backLabel });
    expect(backLink).toHaveAttribute("href", from);
    await user.click(backLink);
    expect(screen.getByTestId("location")).toHaveTextContent(from);
    expect(screen.getByTestId("location")).toHaveTextContent("/accounts?filter=attention");
  });

  it.each([
    [
      { from: "/jobs?account=8&accountId=9&api=orders&status=failed#scheduled-plans" },
      "/jobs/plans?account=8&api=orders",
    ],
    [{ returnTo: "/jobs?accountId=9#scheduled-plans" }, "/jobs/plans?account=9"],
    [
      { from: "/jobs/plans?account=8&page=2", returnTo: "/jobs?account=9#scheduled-plans" },
      "/jobs/plans?account=8&page=2",
    ],
  ])("旧计划来源迁移适用条件且新from优先：%j", async (state, expected) => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/jobs/plans/new",
            search: "?accountId=8",
            state: { ...state, returnState: { jobsPath: "/jobs?status=failed" } },
          },
        ]}
      >
        <ScheduledPlanPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("link", { name: "返回定时计划" })).toHaveAttribute(
      "href",
      expected,
    );
  });
});

function LocationState() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
      {JSON.stringify(location.state)}
    </output>
  );
}

function AccountNavigation() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate("/jobs/plans/new?accountId=9")}>历史导航到账号 9</button>
      <button onClick={() => navigate(-1)}>历史返回</button>
    </>
  );
}
