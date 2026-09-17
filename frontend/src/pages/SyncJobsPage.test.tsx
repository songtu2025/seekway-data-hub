import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/client";
import type { SyncJob } from "../api/types";
import { SyncJobsPage } from "./SyncJobsPage";

const authState = vi.hoisted(() => ({
  role: "viewer" as "admin" | "operator" | "viewer",
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    csrfToken: "csrf-token",
    user: {
      id: 3,
      email: "member@example.com",
      displayName: "项目成员",
      role: authState.role,
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
      getWorkerRuntime: vi.fn(),
      getApiCatalog: vi.fn(),
      listAccounts: vi.fn(),
      listSyncJobs: vi.fn(),
      listScheduledPlans: vi.fn(),
    },
  };
});

const account = {
  id: 8,
  accountCode: "acct_demo",
  name: "北美业务账号",
  maskedAppId: "•••• 8J2K",
  credentialSource: "encrypted" as const,
  status: "active" as const,
  lastVerifiedAt: "2026-08-26T02:42:00Z",
  lastVerifyError: null,
  createdAt: "2026-08-26T02:00:00Z",
  updatedAt: "2026-08-26T02:42:00Z",
};

describe("同步任务列表", () => {
  it("加载失败不展示空结果且同条件刷新恢复", async () => {
    vi.mocked(api.listSyncJobs).mockRejectedValueOnce(new Error("失败"));
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SyncJobsPage />
      </MemoryRouter>,
    );
    await screen.findByText(/任务加载失败/);
    expect(screen.queryByText(/暂无同步任务/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "刷新任务" }));
    await screen.findByText(/暂无同步任务/);
    expect(api.listSyncJobs).toHaveBeenCalledTimes(2);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = "viewer";
    vi.mocked(api.listSyncJobs).mockResolvedValue({ items: [] });
    vi.mocked(api.listScheduledPlans).mockResolvedValue([]);
    vi.mocked(api.listAccounts).mockResolvedValue([account]);
    vi.mocked(api.getApiCatalog).mockResolvedValue([]);
    vi.mocked(api.getWorkerRuntime).mockResolvedValue({
      availability: "online",
      capacityStatus: "ready",
      configuredWorkerCount: 1,
      onlineWorkerCount: 1,
      busyWorkerCount: 0,
      idleWorkerCount: 1,
      staleWorkerCount: 0,
      heartbeatAt: "2026-08-27T08:00:00Z",
      currentJobId: null,
      queueDepth: 0,
      oldestQueuedAt: null,
      pollIntervalSeconds: 3,
      offlineAfterSeconds: 90,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("只保留进入创建页作为页面主操作", async () => {
    authState.role = "operator";
    render(
      <MemoryRouter>
        <SyncJobsPage />
      </MemoryRouter>,
    );

    await screen.findByText(/暂无同步任务/);
    expect(screen.getByRole("link", { name: "立即同步" })).toHaveAttribute("href", "/jobs/new");
    expect(screen.queryByRole("link", { name: "高级运行诊断" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "任务记录" })).toBeInTheDocument();
  });

  it("展示常驻 Worker 在线状态", async () => {
    render(
      <MemoryRouter>
        <SyncJobsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("执行服务在线")).toBeInTheDocument();
    expect(screen.getByText("可以领取新的排队任务。")).toBeInTheDocument();
    expect(screen.getByLabelText("任务执行服务状态")).toHaveClass("worker-status--compact");
    expect(screen.queryByText("排队任务")).not.toBeInTheDocument();
  });

  it("页面隐藏时暂停轮询，恢复可见后自动更新活动任务", async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    vi.mocked(api.listSyncJobs)
      .mockResolvedValueOnce({ items: [{ ...syncJob(1), status: "running" }] })
      .mockResolvedValueOnce({ items: [{ ...syncJob(1), status: "success" }] });

    render(
      <MemoryRouter>
        <SyncJobsPage />
      </MemoryRouter>,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getAllByText("进行中")).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(api.listSyncJobs).toHaveBeenCalledTimes(1);

    visibility.mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(api.listSyncJobs).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText("已完成")).toHaveLength(1);
    expect(screen.queryByText("任务状态已自动更新")).not.toBeInTheDocument();
    expect(screen.getByText(/上次检查 \d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新任务" })).toBeEnabled();
  });

  it("后台自动刷新保持任务可见且失败时不进入手动 loading", async () => {
    vi.useFakeTimers();
    const backgroundRefresh = deferred<{ items: SyncJob[] }>();
    vi.mocked(api.listSyncJobs)
      .mockResolvedValueOnce({ items: [{ ...syncJob(1), status: "running" }] })
      .mockReturnValueOnce(backgroundRefresh.promise);

    render(
      <MemoryRouter>
        <SyncJobsPage />
      </MemoryRouter>,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByRole("link", { name: "任务 #1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新任务" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "正在刷新任务" })).not.toBeInTheDocument();

    await act(async () => {
      backgroundRefresh.reject(new Error("自动刷新失败"));
      await backgroundRefresh.promise.catch(() => undefined);
    });
    expect(screen.getByRole("link", { name: "任务 #1" })).toBeInTheDocument();
    expect(screen.getByText(/刷新失败 · 仍显示 .* 的结果/)).toBeInTheDocument();
  });

  it("轮询窗口状态时保持逻辑任务状态和行位置稳定", async () => {
    vi.useFakeTimers();
    const queuedJob: SyncJob = {
      id: 21,
      taskNo: "TASK-HISTORY-1",
      apiCode: "sales_analysis_variation_asin_page",
      jobType: "history_backfill",
      status: "queued",
      taskStatus: "in_progress",
      executionStatus: "queued",
      completedWindows: 2,
      totalWindows: 10,
      taskCreatedAt: "2026-09-01T09:30:00Z",
      lastUpdatedAt: "2026-09-11T02:00:00Z",
    };
    const runningJob: SyncJob = {
      ...queuedJob,
      id: 22,
      currentExecutionId: 22,
      status: "running",
      executionStatus: "running",
      lastUpdatedAt: "2026-09-11T02:00:05Z",
    };
    vi.mocked(api.listSyncJobs)
      .mockResolvedValueOnce({ items: [queuedJob] })
      .mockResolvedValueOnce({ items: [runningJob, { ...runningJob, id: 23 }] });

    render(
      <MemoryRouter>
        <SyncJobsPage />
      </MemoryRouter>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("等待领取第 3 个窗口")).toBeInTheDocument();
    expect(screen.getByText("进行中")).toBeInTheDocument();
    expect(screen.getByText("2 / 10")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "TASK-HISTORY-1" })).toHaveAttribute(
      "href",
      "/jobs/tasks/TASK-HISTORY-1",
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.getByText("正在执行第 3 个窗口")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "TASK-HISTORY-1" })).toHaveLength(1);
    expect(screen.getAllByText("进行中")).toHaveLength(1);
  });

  it("第二页活动任务自动刷新时继续使用当前页游标", async () => {
    vi.useFakeTimers();
    vi.mocked(api.listSyncJobs)
      .mockResolvedValueOnce({ items: [syncJob(1)], nextCursor: "page-2" })
      .mockResolvedValueOnce({
        items: [{ ...syncJob(2), status: "running", taskStatus: "in_progress" }],
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        items: [{ ...syncJob(2), status: "success", taskStatus: "success" }],
        nextCursor: null,
      });

    render(
      <MemoryRouter>
        <SyncJobsPage />
      </MemoryRouter>,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("link", { name: "任务 #2" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(api.listSyncJobs).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "page-2", limit: 20 }),
    );
    expect(screen.getAllByText("已完成")).toHaveLength(1);
  });

  it("Viewer 可读任务但不能发起任务", async () => {
    render(
      <MemoryRouter>
        <SyncJobsPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/暂无同步任务/)).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "列表分页" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "立即同步" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "创建定时计划" })).not.toBeInTheDocument();
  });

  it("任务状态筛选只展示逻辑状态并提交 terminated", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SyncJobsPage />
      </MemoryRouter>,
    );

    await screen.findByText(/暂无同步任务/);
    await user.click(screen.getByLabelText("任务状态"));
    expect(
      await screen.findByText("已终止", { selector: ".ant-select-item-option-content" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("排队中", { selector: ".ant-select-item-option-content" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("运行中", { selector: ".ant-select-item-option-content" }),
    ).not.toBeInTheDocument();
    await user.click(
      await screen.findByText("已终止", { selector: ".ant-select-item-option-content" }),
    );
    await user.click(screen.getByRole("button", { name: "筛选" }));

    await waitFor(() =>
      expect(api.listSyncJobs).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: undefined, limit: 20, status: "terminated" }),
      ),
    );
  });

  it("按触发方式筛选计划任务", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SyncJobsPage />
      </MemoryRouter>,
    );

    await screen.findByText(/暂无同步任务/);
    await user.click(screen.getByLabelText("触发方式"));
    await user.click(
      await screen.findByText("计划任务", { selector: ".ant-select-item-option-content" }),
    );
    await user.click(screen.getByRole("button", { name: "筛选" }));

    await waitFor(() =>
      expect(api.listSyncJobs).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: undefined, limit: 20, triggerType: "schedule" }),
      ),
    );
  });

  it("任务列表不加载计划，立即同步携带已应用账号接口及返回条件", async () => {
    authState.role = "operator";
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/jobs?account=8&api=orders&status=failed"]}>
        <SyncJobsPage />
        <LocationState />
      </MemoryRouter>,
    );
    await screen.findByText("执行服务在线");
    expect(api.listSyncJobs).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "attention" }),
    );
    expect(api.listScheduledPlans).not.toHaveBeenCalled();
    expect(screen.queryByRole("table", { name: "定时计划列表" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "立即同步" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/jobs/new?accountId=8&apiCode=orders",
    );
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/jobs?account=8&api=orders&status=failed",
    );
  });

  it("兼容旧筛选参数但规范账号接口优先", async () => {
    render(
      <MemoryRouter initialEntries={["/jobs?account=8&accountId=9&api=orders&apiCode=legacy"]}>
        <SyncJobsPage />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(api.listSyncJobs).toHaveBeenCalledWith(
        expect.objectContaining({ jijiaAccountId: 8, apiCode: "orders" }),
      ),
    );
  });

  it("只有旧参数时仍应用账号接口筛选", async () => {
    render(
      <MemoryRouter initialEntries={["/jobs?accountId=9&apiCode=legacy"]}>
        <SyncJobsPage />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(api.listSyncJobs).toHaveBeenCalledWith(
        expect.objectContaining({ jijiaAccountId: 9, apiCode: "legacy" }),
      ),
    );
  });

  it("同路由查询参数变化和后退会重新应用 URL 筛选", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/jobs?status=failed"]}>
        <JobsNavigationHarness />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(api.listSyncJobs).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "attention" }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "显示成功任务 URL" }));
    await waitFor(() =>
      expect(api.listSyncJobs).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "success" }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "返回上一任务 URL" }));
    await waitFor(() =>
      expect(api.listSyncJobs).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "attention" }),
      ),
    );
  });

  it("账号加载失败提供重试且不显示无账号提示", async () => {
    authState.role = "operator";
    vi.mocked(api.listAccounts).mockRejectedValueOnce(new Error("失败"));
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SyncJobsPage />
      </MemoryRouter>,
    );
    await screen.findByText("账号加载失败，请重试");
    expect(screen.queryByText(/没有可用账号/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "立即同步" })).toHaveAttribute("href", "/jobs/new");
    await user.click(screen.getByRole("button", { name: "重试加载账号" }));
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "立即同步" })).toHaveAttribute("href", "/jobs/new"),
    );
  });

  it("接口筛选选项失败独立重试，不影响任务列表", async () => {
    vi.mocked(api.getApiCatalog)
      .mockRejectedValueOnce(new Error("失败"))
      .mockResolvedValueOnce([
        {
          apiCode: "sale_return_order_page",
          name: "查询退货订单",
          method: "POST",
          path: "/sale/return/order/page",
          domain: "sale",
          catalogEnabled: true,
          supportsDateWindow: true,
        },
      ]);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SyncJobsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("接口筛选选项加载失败，请稍后重试")).toBeInTheDocument();
    expect(screen.getByText(/暂无同步任务/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重试加载接口" }));
    await user.click(screen.getByLabelText("接口"));
    expect(
      await screen.findByText("查询退货订单 · sale_return_order_page", {
        selector: ".ant-select-item-option-content",
      }),
    ).toBeInTheDocument();
    expect(api.getApiCatalog).toHaveBeenCalledTimes(2);
  });

  it("没有有效账号展示管理入口", async () => {
    authState.role = "operator";
    vi.mocked(api.listAccounts).mockResolvedValue([{ ...account, status: "pending_verification" }]);
    render(
      <MemoryRouter>
        <SyncJobsPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("link", { name: "管理账号" })).toHaveAttribute(
      "href",
      "/accounts",
    );
    expect(screen.getByRole("link", { name: "立即同步" })).toHaveAttribute("href", "/jobs/new");
  });

  it("按业务接口筛选，并区分筛选无结果", async () => {
    vi.mocked(api.getApiCatalog).mockResolvedValue([
      {
        apiCode: "sale_return_order_page",
        name: "查询退货订单",
        method: "POST",
        path: "/sale/return/order/page",
        domain: "sale",
        catalogEnabled: true,
        supportsDateWindow: true,
      },
    ]);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/jobs?api=sale_return_order_page"]}>
        <SyncJobsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("没有符合当前筛选条件的任务。")).toBeInTheDocument();
    expect(api.listSyncJobs).toHaveBeenCalledWith(
      expect.objectContaining({ apiCode: "sale_return_order_page" }),
    );
    await user.click(screen.getByLabelText("接口"));
    expect(
      await screen.findByText("查询退货订单 · sale_return_order_page", {
        selector: ".ant-select-item-option-content",
      }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(api.listSyncJobs).toHaveBeenLastCalledWith(
      expect.objectContaining({ apiCode: undefined }),
    );
  });

  it("展示接口业务名称、技术代码和触发方式", async () => {
    vi.mocked(api.listSyncJobs).mockResolvedValue({
      items: [
        {
          ...syncJob(1),
          apiName: "查询退货订单",
          triggerType: "schedule",
          progressSummary: {
            currentPage: 3,
            totalPages: 3,
            requestCount: 4,
            successApiCount: 1,
            failedApiCount: 0,
          },
        },
      ],
    });
    render(
      <MemoryRouter>
        <SyncJobsPage />
      </MemoryRouter>,
    );

    const apiName = await screen.findByText("查询退货订单");
    expect(apiName.closest(".table-cell-stack")).toHaveTextContent("sale_return_order_page");
    expect(screen.getAllByText(/计划任务/).length).toBeGreaterThan(0);
    expect(screen.getByText("sale_return_order_page")).toBeInTheDocument();
    expect(screen.getByText("未记录窗口进度")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "列表分页" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
  });

  it("状态概览展示汇总并可直接筛选需处理任务", async () => {
    vi.mocked(api.listSyncJobs).mockResolvedValue({
      items: [],
      summary: { total: 9, active: 2, attention: 3, success: 3, ended: 1 },
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SyncJobsPage />
      </MemoryRouter>,
    );

    const overview = await screen.findByRole("region", { name: "任务状态概览" });
    expect(
      await screen.findByRole("button", { name: /全部任务 9/ }, { timeout: 5_000 }),
    ).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /需处理 3/ }, { timeout: 5_000 }));

    await waitFor(() =>
      expect(api.listSyncJobs).toHaveBeenLastCalledWith(
        expect.objectContaining({
          cursor: undefined,
          limit: 20,
          status: undefined,
          statusGroup: "attention",
        }),
      ),
    );
    expect(overview).toBeInTheDocument();
  });

  it("已追平任务归入成功态并提供结果入口", async () => {
    vi.mocked(api.listSyncJobs).mockResolvedValue({
      items: [
        {
          ...syncJob(1),
          status: "failed",
          taskStatus: "caught_up",
          executionStatus: "failed",
          resolutionCode: "incremental_caught_up",
        },
      ],
      summary: { total: 1, active: 0, attention: 0, success: 1, ended: 0 },
    });
    render(
      <MemoryRouter>
        <SyncJobsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("已追平")).toBeInTheDocument();
    expect(screen.getByText("原执行失败，数据范围已由后续同步覆盖")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /查看结果/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "处理失败" })).not.toBeInTheDocument();
  });

  it("已忽略提醒的任务展示为历史记录而不是待处理项", async () => {
    vi.mocked(api.listSyncJobs).mockResolvedValue({
      items: [
        {
          ...syncJob(1),
          status: "failed",
          taskStatus: "dismissed",
          executionStatus: "failed",
          resolutionCode: "operator_dismissed",
        },
      ],
      summary: { total: 1, active: 0, attention: 0, success: 0, ended: 1 },
    });
    render(
      <MemoryRouter>
        <SyncJobsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("已忽略提醒")).toBeInTheDocument();
    expect(screen.getByText("原执行失败，当前不再提醒")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /查看记录/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "处理失败" })).not.toBeInTheDocument();
  });

  it("初载任务失败后刷新成功仍保留已加载的账号选项", async () => {
    vi.mocked(api.listSyncJobs)
      .mockRejectedValueOnce(new Error("初载任务失败"))
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SyncJobsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("任务加载失败");
    await user.click(screen.getByRole("button", { name: "刷新任务" }));
    expect(await screen.findByText(/暂无同步任务/)).toBeInTheDocument();
    await user.click(screen.getByLabelText("积加账号"));
    expect(
      await screen.findByText("北美业务账号", { selector: ".ant-select-item-option-content" }),
    ).toBeInTheDocument();
    expect(api.listAccounts).toHaveBeenCalledTimes(1);
    expect(api.listSyncJobs).toHaveBeenCalledTimes(2);
  });

  it("初载旧结果和 finally 不能覆盖仍在等待的刷新请求", async () => {
    const initialJobs = deferred<{ items: SyncJob[]; nextCursor?: string | null }>();
    const refreshedJobs = deferred<{ items: SyncJob[]; nextCursor?: string | null }>();
    vi.mocked(api.listSyncJobs)
      .mockReturnValueOnce(initialJobs.promise)
      .mockReturnValueOnce(refreshedJobs.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SyncJobsPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "刷新任务" }));
    await waitFor(() => expect(api.listSyncJobs).toHaveBeenCalledTimes(2));
    await act(async () => {
      initialJobs.resolve({ items: [syncJob(1)], nextCursor: "old-cursor" });
    });
    expect(screen.queryByRole("link", { name: "任务 #1" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "正在刷新任务" })).toBeDisabled();

    await act(async () => {
      refreshedJobs.resolve({ items: [syncJob(2)], nextCursor: null });
    });
    expect(screen.getByRole("link", { name: "任务 #2" })).toBeInTheDocument();
  });

  it("手动刷新当前页时替换记录且不追加重复任务", async () => {
    vi.mocked(api.listSyncJobs)
      .mockResolvedValueOnce({ items: [syncJob(1)], nextCursor: "page-2" })
      .mockResolvedValueOnce({ items: [syncJob(2), syncJob(2)], nextCursor: "page-2" });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SyncJobsPage />
      </MemoryRouter>,
    );

    await screen.findByRole("link", { name: "任务 #1" });
    await user.click(screen.getByRole("button", { name: "刷新任务" }));
    expect(await screen.findByRole("link", { name: "任务 #2" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "任务 #1" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "任务 #2" })).toHaveLength(1);
    expect(screen.getByText(/上次检查 \d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
    expect(api.listSyncJobs).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: undefined, limit: 20 }),
    );
  });

  it("从第二页应用筛选后回到第一页", async () => {
    vi.mocked(api.listSyncJobs)
      .mockResolvedValueOnce({ items: [syncJob(1)], nextCursor: "page-2" })
      .mockResolvedValueOnce({ items: [syncJob(2)], nextCursor: null })
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SyncJobsPage />
      </MemoryRouter>,
    );

    await screen.findByRole("link", { name: "任务 #1" });
    await user.click(screen.getByRole("button", { name: "下一页" }));
    await screen.findByRole("link", { name: "任务 #2" });
    await user.click(screen.getByLabelText("任务状态"));
    await user.click(
      await screen.findByText("已终止", { selector: ".ant-select-item-option-content" }),
    );
    await user.click(screen.getByRole("button", { name: "筛选" }));

    await waitFor(() =>
      expect(api.listSyncJobs).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: undefined, limit: 20, status: "terminated" }),
      ),
    );
    expect(screen.queryByRole("navigation", { name: "列表分页" })).not.toBeInTheDocument();
  });

  it("从任务详情返回时恢复当前游标页", async () => {
    vi.mocked(api.listSyncJobs)
      .mockResolvedValueOnce({ items: [syncJob(1)], nextCursor: "page-2" })
      .mockResolvedValueOnce({ items: [syncJob(2)], nextCursor: null })
      .mockResolvedValueOnce({ items: [syncJob(2)], nextCursor: null });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/jobs"]}>
        <Routes>
          <Route path="/jobs" element={<SyncJobsPage />} />
          <Route path="/jobs/:id" element={<JobDetailReturnTarget />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("link", { name: "任务 #1" });
    await user.click(screen.getByRole("button", { name: "下一页" }));
    await user.click(await screen.findByRole("link", { name: "任务 #2" }));
    await user.click(screen.getByRole("button", { name: "返回任务列表" }));

    expect(await screen.findByRole("link", { name: "任务 #2" })).toBeInTheDocument();
    expect(screen.getByText("第 2 页 · 本页 1 条")).toBeInTheDocument();
    expect(api.listSyncJobs).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "page-2", limit: 20 }),
    );
  });

  it("旧筛选失败和 finally 不能污染仍在等待的新刷新", async () => {
    const filteredJobs = deferred<{ items: SyncJob[]; nextCursor?: string | null }>();
    const refreshedJobs = deferred<{ items: SyncJob[]; nextCursor?: string | null }>();
    vi.mocked(api.listSyncJobs)
      .mockResolvedValueOnce({ items: [syncJob(1)], nextCursor: null })
      .mockReturnValueOnce(filteredJobs.promise)
      .mockReturnValueOnce(refreshedJobs.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SyncJobsPage />
      </MemoryRouter>,
    );

    await screen.findByRole("link", { name: "任务 #1" });
    await user.click(screen.getByLabelText("积加账号"));
    await user.click(
      await screen.findByText("北美业务账号", { selector: ".ant-select-item-option-content" }),
    );
    await user.click(screen.getByRole("button", { name: "筛选" }));
    await user.click(screen.getByRole("button", { name: "刷新任务" }));
    await waitFor(() => expect(api.listSyncJobs).toHaveBeenCalledTimes(3));

    await act(async () => {
      filteredJobs.reject(new Error("旧筛选失败"));
      await filteredJobs.promise.catch(() => undefined);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("正在加载任务…")).toBeInTheDocument();

    await act(async () => {
      refreshedJobs.resolve({ items: [syncJob(3)], nextCursor: null });
    });
    expect(screen.getByRole("link", { name: "任务 #3" })).toBeInTheDocument();
  });

  it("旧下一页结果不能在当前页刷新失败后混入列表", async () => {
    const oldNextPage = deferred<{ items: SyncJob[]; nextCursor?: string | null }>();
    const refreshedJobs = deferred<{ items: SyncJob[]; nextCursor?: string | null }>();
    vi.mocked(api.listSyncJobs)
      .mockResolvedValueOnce({ items: [syncJob(1)], nextCursor: "page-2" })
      .mockReturnValueOnce(oldNextPage.promise)
      .mockReturnValueOnce(refreshedJobs.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SyncJobsPage />
      </MemoryRouter>,
    );

    await screen.findByRole("link", { name: "任务 #1" });
    await user.click(screen.getByRole("button", { name: "下一页" }));
    await user.click(screen.getByRole("button", { name: "刷新任务" }));
    await waitFor(() => expect(api.listSyncJobs).toHaveBeenCalledTimes(3));

    await act(async () => {
      oldNextPage.resolve({ items: [syncJob(2)], nextCursor: null });
    });
    expect(screen.queryByRole("link", { name: "任务 #2" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "正在刷新任务" })).toBeDisabled();

    await act(async () => {
      refreshedJobs.reject(new Error("当前刷新失败"));
      await refreshedJobs.promise.catch(() => undefined);
    });
    expect(screen.queryByRole("link", { name: "任务 #2" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("任务加载失败，请稍后重试");
  });

  it("使用游标切换本页并支持上一页和每页条数", async () => {
    vi.mocked(api.listSyncJobs)
      .mockResolvedValueOnce({
        items: [
          {
            id: 1,
            apiCode: "sale_return_order_page",
            jobType: "history_backfill",
            status: "success",
            historyProgress: {
              completedWindows: 1,
              totalWindows: 79,
              currentWindow: { startDate: "2020-01-01", endDate: "2020-01-31" },
              currentPage: 10,
              totalPages: 10,
              earliestObservedDataDate: null,
              historyCompleteThrough: "2020-01-31",
              changeCatchup: "pending",
            },
          },
        ],
        nextCursor: "page-2",
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 2,
            apiCode: "sale_return_order_page",
            jobType: "update_incremental",
            status: "failed",
          },
        ],
        nextCursor: null,
      })
      .mockResolvedValueOnce({ items: [syncJob(1)], nextCursor: "page-2" })
      .mockResolvedValueOnce({ items: [syncJob(3)], nextCursor: null });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SyncJobsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "任务 #1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "任务 #1" })).toHaveTextContent("历史回填");
    expect(screen.getByText("2020-01-01 至 2020-01-31")).toBeInTheDocument();
    expect(screen.getByText("1 / 79")).toBeInTheDocument();
    expect(screen.getByText("第 1 页 · 本页 1 条")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(await screen.findByRole("link", { name: "任务 #2" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "任务 #1" })).not.toBeInTheDocument();
    expect(screen.getByText("第 2 页 · 本页 1 条")).toBeInTheDocument();
    expect(api.listSyncJobs).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "page-2", limit: 20 }),
    );

    await user.click(screen.getByRole("button", { name: "上一页" }));
    expect(await screen.findByRole("link", { name: "任务 #1" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "任务 #2" })).not.toBeInTheDocument();
    expect(api.listSyncJobs).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: undefined, limit: 20 }),
    );

    await user.click(screen.getByLabelText("每页条数"));
    await user.click(
      await screen.findByText("50 条", { selector: ".ant-select-item-option-content" }),
    );
    expect(await screen.findByRole("link", { name: "任务 #3" })).toBeInTheDocument();
    expect(screen.getByText("第 1 页 · 本页 1 条")).toBeInTheDocument();
    expect(api.listSyncJobs).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: undefined, limit: 50 }),
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

function JobsNavigationHarness() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate("/jobs?status=success")}>
        显示成功任务 URL
      </button>
      <button type="button" onClick={() => navigate(-1)}>
        返回上一任务 URL
      </button>
      <SyncJobsPage />
    </>
  );
}

function JobDetailReturnTarget() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { from: string; returnState?: unknown };
  return (
    <button type="button" onClick={() => navigate(state.from, { state: state.returnState })}>
      返回任务列表
    </button>
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

function syncJob(id: number): SyncJob {
  return {
    id,
    apiCode: "sale_return_order_page",
    jobType: "history_backfill",
    status: "success",
  };
}
