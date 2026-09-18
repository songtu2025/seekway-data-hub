import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import type { ScheduledPlan } from "../api/types";
import { AppShell } from "../components/AppShell";
import { ScheduledPlansPage } from "./ScheduledPlansPage";

const auth = vi.hoisted(() => ({ role: "operator" }));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ user: { id: 1, role: auth.role, displayName: "测试成员" }, logout: vi.fn() }),
}));
vi.mock("../api/client", async (original) => ({
  ...(await original<typeof import("../api/client")>()),
  api: { listScheduledPlans: vi.fn() },
}));

function CurrentLocation() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
      {JSON.stringify(location.state)}
    </output>
  );
}

function scheduledPlan(index: number, overrides: Partial<ScheduledPlan> = {}): ScheduledPlan {
  return {
    id: index + 1,
    jijiaAccountId: index === 11 ? 9 : 8,
    accountName: index === 11 ? "欧洲账号" : "北美账号",
    apiCode: `api_${index}`,
    apiName: `接口 ${index}`,
    scheduleMode: "daily",
    scheduleExpr: "02:30",
    timezone: "Asia/Shanghai",
    nextRunAt: "2026-09-10T18:30:00Z",
    status: index === 11 ? "overdue" : "normal",
    nextWindowPreview: {
      phase: "history_backfill",
      basisLabel: "按业务日期回填",
      nextStartDate: "2026-08-01",
      nextEndDate: "2026-08-31",
      completeThrough: "2026-07-31",
      lagDays: 1,
      maxWindowDays: 31,
      advancesOnSuccess: true,
      predictionStatus: "exact",
    },
    blockingJob: null,
    latestScheduledJob: index === 0 ? { id: 30, taskNo: "TASK-30", status: "success" } : null,
    ...overrides,
  };
}

function deferred<T>() {
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((_, nextReject) => {
    reject = nextReject;
  });
  return { promise, reject };
}

describe("独立定时计划列表", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    auth.role = "operator";
    vi.mocked(api.listScheduledPlans).mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => scheduledPlan(index)),
    );
  });

  it("分页写入URL并把筛选分页来源带入修改页", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/jobs/plans?account=8&page=2"]}>
        <ScheduledPlansPage />
        <CurrentLocation />
      </MemoryRouter>,
    );
    expect(await screen.findByText("接口 10 · api_10")).toBeInTheDocument();
    expect(screen.queryByText("接口 0 · api_0")).not.toBeInTheDocument();
    const editLink = screen.getByRole("link", { name: "修改计划" });
    expect(editLink.closest(".ant-table-wrapper")).toHaveClass(
      "scheduled-plans-table",
      "responsive-card-table",
    );
    expect(editLink.closest("td")).toHaveAttribute("data-label", "操作");
    expect(editLink.closest("td")).toHaveAttribute("data-card-width", "full");
    // 数据行可能先于加载遮罩退出动画出现，等待真实可交互状态。
    await waitFor(() => {
      expect(editLink.closest(".ant-spin-blur")).toBeNull();
      expect(window.getComputedStyle(editLink).pointerEvents).not.toBe("none");
    });
    await user.click(editLink);
    expect(screen.getByTestId("location")).toHaveTextContent("/jobs/plans/8/api_10");
    expect(screen.getByTestId("location")).toHaveTextContent("/jobs/plans?account=8&page=2");
  });

  it("状态接口筛选生效、无结果可清除并重置页码", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/jobs/plans?account=8&api=api_11&status=overdue&page=2"]}>
        <ScheduledPlansPage />
        <CurrentLocation />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/没有符合当前筛选条件的定时计划/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(await screen.findByText("接口 0 · api_0")).toBeInTheDocument();
    expect(screen.getByTestId("location").textContent).not.toContain("page=2");
    await user.click(screen.getByTitle("2"));
    expect(screen.getByTestId("location")).toHaveTextContent("page=2");
  });

  it("Viewer仅查看，错误可刷新重试", async () => {
    auth.role = "viewer";
    vi.mocked(api.listScheduledPlans).mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/jobs/plans"]}>
        <ScheduledPlansPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("定时计划加载失败，请稍后重试")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "创建定时计划" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "刷新计划" }));
    expect((await screen.findAllByRole("link", { name: "查看计划" })).length).toBe(10);
  });

  it("刷新计划保留筛选分页和旧表格，重复点击只发一次请求", async () => {
    const refresh = deferred<ScheduledPlan[]>();
    vi.mocked(api.listScheduledPlans)
      .mockResolvedValueOnce(Array.from({ length: 12 }, (_, index) => scheduledPlan(index)))
      .mockReturnValueOnce(refresh.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/jobs/plans?account=8&page=2"]}>
        <ScheduledPlansPage />
        <CurrentLocation />
      </MemoryRouter>,
    );

    await screen.findByText("接口 10 · api_10");
    await user.dblClick(screen.getByRole("button", { name: "刷新计划" }));
    await waitFor(() => expect(api.listScheduledPlans).toHaveBeenCalledTimes(2));
    expect(screen.getByText("接口 10 · api_10")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("account=8&page=2");
    expect(document.querySelector(".scheduled-plans-table .ant-spin-spinning")).toBeNull();

    await act(async () => refresh.reject(new Error("offline")));
    expect(screen.getByText("接口 10 · api_10")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveClass("ant-alert-warning");
    expect(screen.getByText(/刷新失败 · 仍显示 .* 的结果/)).toBeVisible();
  });

  it("解释精确、动态、追平、不可用和无日期窗口的数据范围", async () => {
    vi.mocked(api.listScheduledPlans).mockResolvedValue([
      scheduledPlan(0),
      scheduledPlan(1, {
        apiName: "增量接口",
        nextWindowPreview: {
          ...scheduledPlan(1).nextWindowPreview,
          phase: "update_incremental",
          nextStartDate: "2026-09-09",
          nextEndDate: "2026-09-09",
          basisLabel: "按修改时间增量",
        },
      }),
      scheduledPlan(2, {
        status: "blocked",
        blockingJob: { id: 88, taskNo: "TASK-88", status: "running" },
        nextWindowPreview: {
          ...scheduledPlan(2).nextWindowPreview,
          nextStartDate: "2026-09-01",
          nextEndDate: null,
          predictionStatus: "dynamic",
          basisLabel: "活动任务完成后动态计算结束日期",
        },
      }),
      scheduledPlan(3, {
        nextWindowPreview: {
          ...scheduledPlan(3).nextWindowPreview,
          nextStartDate: null,
          nextEndDate: null,
          predictionStatus: "caught_up",
          basisLabel: "历史数据已经追平",
        },
      }),
      scheduledPlan(4, {
        nextWindowPreview: {
          ...scheduledPlan(4).nextWindowPreview,
          nextStartDate: null,
          nextEndDate: null,
          completeThrough: null,
          predictionStatus: "unavailable",
          basisLabel: "同步水位尚未建立",
        },
      }),
      scheduledPlan(5, {
        nextWindowPreview: {
          phase: "no_date_window",
          basisLabel: "接口不使用日期窗口",
          nextStartDate: null,
          nextEndDate: null,
          completeThrough: null,
          lagDays: 0,
          maxWindowDays: null,
          advancesOnSuccess: false,
          predictionStatus: "exact",
        },
      }),
    ]);

    render(
      <MemoryRouter initialEntries={["/jobs/plans"]}>
        <ScheduledPlansPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("2026-08-01 至 2026-08-31")).toBeInTheDocument();
    expect(screen.getByText("2026-09-09（全天）")).toBeInTheDocument();
    expect(screen.getByText("按修改时间增量")).toBeInTheDocument();
    expect(screen.getByText("从 2026-09-01 开始，结束日期将在执行前确定")).toBeInTheDocument();
    expect(
      screen.getByText("活动任务结束后从 2026-09-01 继续，不会跳过数据。"),
    ).toBeInTheDocument();
    expect(screen.getByText("历史数据已追平，等待新数据")).toBeInTheDocument();
    expect(screen.getByText("暂无法预测数据范围")).toBeInTheDocument();
    expect(screen.getByText("当前可用数据")).toBeInTheDocument();
    expect(screen.getByText("不限定日期范围")).toBeInTheDocument();
    expect(screen.queryByText("该接口无日期窗口，每次同步当前可用数据")).not.toBeInTheDocument();
    expect(screen.queryByText("接口不使用日期窗口")).not.toBeInTheDocument();
    expect(screen.getByText("不适用")).toBeInTheDocument();
    expect(screen.getByText("每次执行获取当前数据")).toBeInTheDocument();
    expect(screen.queryByText("每次执行独立完成")).not.toBeInTheDocument();
    expect(screen.queryByText("不按日期累计进度")).not.toBeInTheDocument();
    expect(screen.queryByText("无需日期水位")).not.toBeInTheDocument();
  });

  it("任务与计划切换独立保留两边筛选", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/jobs?account=8&status=failed"]}>
        <Routes>
          <Route
            path="/jobs"
            element={
              <AppShell>
                <Link to="/jobs?account=9&status=success">调整任务筛选</Link>
              </AppShell>
            }
          />
          <Route path="/jobs/plans" element={<ScheduledPlansPage />} />
        </Routes>
        <CurrentLocation />
      </MemoryRouter>,
    );
    await user.click(
      within(screen.getByRole("navigation", { name: "同步任务导航" })).getByRole("link", {
        name: "定时计划",
      }),
    );
    await screen.findByText("接口 0 · api_0");
    await user.click(screen.getByTitle("2"));
    await user.click(screen.getByRole("link", { name: "任务列表" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/jobs?account=8&status=failed");
    await user.click(screen.getByRole("link", { name: "定时计划" }));
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/jobs/plans?page=2"),
    );
  });
});
