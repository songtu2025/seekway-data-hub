import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, ApiError } from "../api/client";
import type { JobAcceptedResponse, JobCancelledResponse, SyncJob } from "../api/types";
import { SyncJobDetailPage } from "./SyncJobDetailPage";

const authRole = vi.hoisted(() => ({ current: "admin" as "admin" | "operator" | "viewer" }));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    csrfToken: "csrf-token",
    user: { id: 1, email: "admin@example.com", displayName: "管理员", role: authRole.current },
    logout: vi.fn(),
  }),
}));
vi.mock("../api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api/client")>();
  return {
    ...original,
    api: {
      ...original.api,
      getSyncJob: vi.fn(),
      getSyncTask: vi.fn(),
      stopSyncJob: vi.fn(),
      stopSyncTask: vi.fn(),
      retrySyncJob: vi.fn(),
      retrySyncTask: vi.fn(),
      cancelSyncJob: vi.fn(),
      cancelSyncTask: vi.fn(),
      pauseSyncTask: vi.fn(),
      withdrawSyncTaskPause: vi.fn(),
      resumeSyncTask: vi.fn(),
      getWorkerRuntime: vi.fn(),
      listSyncRunLogs: vi.fn(),
      listFailedRequests: vi.fn(),
    },
  };
});

describe("同步任务详情", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authRole.current = "admin";
    vi.mocked(api.getSyncJob).mockResolvedValue({
      id: 8,
      jobNo: "JOB-008",
      apiCode: "sale_return_order_page",
      jobType: "update_incremental",
      status: "running",
      currentExecutionId: 18,
      availableActions: ["pause", "stop"],
      historyProgress: {
        completedWindows: 60,
        totalWindows: 60,
        currentWindow: { startDate: "2025-11-01", endDate: "2025-12-01" },
        currentPage: 20,
        totalPages: 77,
        earliestObservedDataDate: "2021-04-03",
        historyCompleteThrough: "2026-08-25",
        changeCatchup: "running",
      },
    });
    vi.mocked(api.getWorkerRuntime).mockResolvedValue({
      availability: "busy",
      capacityStatus: "ready",
      configuredWorkerCount: 1,
      onlineWorkerCount: 1,
      busyWorkerCount: 1,
      idleWorkerCount: 0,
      staleWorkerCount: 0,
      heartbeatAt: "2026-08-27T08:00:00Z",
      currentJobId: 18,
      queueDepth: 1,
      oldestQueuedAt: "2026-08-27T07:59:00Z",
      pollIntervalSeconds: 3,
      offlineAfterSeconds: 90,
    });
    vi.mocked(api.listSyncRunLogs).mockResolvedValue({ items: [] });
    vi.mocked(api.listFailedRequests).mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("展示后端历史进度，不暴露扫描下限或窗口编辑控件", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/jobs/8"]}>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("历史基线 60 / 60")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "增量同步进度" })).toBeInTheDocument();
    expect(screen.getByText("2025-11-01 至 2025-12-01")).toBeInTheDocument();
    expect(screen.getByText("当前窗口分页")).toBeInTheDocument();
    expect(screen.getByText("20 / 77")).toBeInTheDocument();
    expect(await screen.findByText("执行服务正在处理本任务")).toBeInTheDocument();
    await user.click(screen.getByText("查看技术信息"));
    expect(screen.getByText("2021-04-03")).toBeInTheDocument();
    expect(screen.getByText("2026-08-25")).toBeInTheDocument();
    expect(screen.getByText("变更追赶进行中")).toBeInTheDocument();
    expect(screen.queryByLabelText(/扫描下限|起始日期|窗口天数/)).not.toBeInTheDocument();
  });

  it("首载失败后可在当前页面重新加载任务详情", async () => {
    vi.mocked(api.getSyncJob).mockRejectedValueOnce(new Error("暂时不可用")).mockResolvedValueOnce({
      id: 8,
      apiCode: "sale_return_order_page",
      jobType: "history_backfill",
      status: "success",
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/jobs/8"]}>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("任务详情加载失败");

    await user.click(screen.getByRole("button", { name: "重新加载" }));

    expect(
      await screen.findByRole("heading", { name: "sale_return_order_page" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(api.getSyncJob).toHaveBeenCalledTimes(2);
  });

  it("以业务接口为标题并用页签组织执行记录和任务事件", async () => {
    vi.mocked(api.getSyncTask).mockResolvedValue({
      id: 8,
      taskNo: "task_c536f155447639e7b025e985",
      jijiaAccountId: 6,
      accountName: "Spring-Test",
      apiCode: "sale_return_order_page",
      apiName: "查询退货订单列表",
      jobType: "history_backfill",
      status: "paused",
      availableActions: ["resume", "stop"],
      executions: [],
      lifecycleEvents: [],
    });

    render(
      <MemoryRouter initialEntries={["/jobs/tasks/task_c536f155447639e7b025e985"]}>
        <Routes>
          <Route path="/jobs/tasks/:taskNo" element={<SyncJobDetailPage />} />
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const title = await screen.findByRole("heading", { name: "查询退货订单列表" });
    const heading = title.closest("header");
    expect(heading).not.toBeNull();
    expect(within(heading!).getByText("已暂停")).toBeInTheDocument();
    expect(within(heading!).getByText("任务号：task_c536f155447639e7b025e985")).toBeInTheDocument();
    expect(within(heading!).getByText("账号：Spring-Test")).toBeInTheDocument();
    expect(within(heading!).getByText("API：sale_return_order_page")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "执行记录（0）", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "任务事件（0）" })).toBeInTheDocument();
    expect(await screen.findByLabelText("任务执行服务状态")).toHaveClass("worker-status--compact");
    expect(api.getSyncTask).toHaveBeenCalledWith("task_c536f155447639e7b025e985");
    expect(api.getSyncJob).not.toHaveBeenCalled();
  });

  it("旧执行地址规范化后按 taskNo 重新加载最新执行并保留导航上下文", async () => {
    vi.mocked(api.getSyncJob).mockResolvedValue({
      id: 7,
      taskNo: "TASK-HISTORY-1",
      apiCode: "sale_return_order_page",
      jobType: "history_backfill",
      status: "paused",
      historyProgress: {
        completedWindows: 1,
        totalWindows: 3,
        currentWindow: { startDate: "2021-01-01", endDate: "2021-01-31" },
        currentPage: 5,
        totalPages: 5,
        earliestObservedDataDate: "2021-01-01",
        historyCompleteThrough: "2021-01-31",
        changeCatchup: "pending",
      },
    });
    vi.mocked(api.getSyncTask).mockResolvedValue({
      id: 9,
      taskNo: "TASK-HISTORY-1",
      currentExecutionId: 9,
      apiCode: "sale_return_order_page",
      jobType: "history_backfill",
      status: "running",
      taskStatus: "in_progress",
      executionStatus: "running",
      historyProgress: {
        completedWindows: 2,
        totalWindows: 3,
        currentWindow: { startDate: "2021-02-01", endDate: "2021-02-28" },
        currentPage: 1,
        totalPages: 6,
        earliestObservedDataDate: "2021-01-01",
        historyCompleteThrough: "2021-01-31",
        changeCatchup: "running",
      },
    });

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/jobs/7",
            search: "?tab=overview",
            hash: "#job-progress",
            state: { from: "/jobs?status=attention", backLabel: "返回任务列表" },
          },
        ]}
      >
        <Routes>
          <Route path="/jobs/tasks/:taskNo" element={<SyncJobDetailPage />} />
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("current-path")).toHaveTextContent(
        '/jobs/tasks/TASK-HISTORY-1?tab=overview#job-progress|{"from":"/jobs?status=attention","backLabel":"返回任务列表"}',
      ),
    );
    expect(await screen.findByText("2021-02-01 至 2021-02-28")).toBeInTheDocument();
    expect(screen.queryByText("2021-01-01 至 2021-01-31")).not.toBeInTheDocument();
    expect(api.getSyncJob).toHaveBeenCalledTimes(1);
    expect(api.getSyncJob).toHaveBeenCalledWith("7");
    expect(api.getSyncTask).toHaveBeenCalledTimes(1);
    expect(api.getSyncTask).toHaveBeenCalledWith("TASK-HISTORY-1");
  });

  it("执行记录每页十条并优先显示当前执行", async () => {
    const executions: NonNullable<SyncJob["executions"]> = Array.from(
      { length: 11 },
      (_, index) => {
        const runId = index + 1;
        return {
          id: runId,
          jobNo: `JOB-${runId}`,
          windowIndex: runId,
          windowStart: `2026-08-${String(runId).padStart(2, "0")}`,
          windowEnd: `2026-08-${String(runId).padStart(2, "0")}`,
          status: runId === 11 ? "running" : "success",
          syncBatchNo: `BATCH-${runId}`,
          syncRunId: runId,
          createdAt: `2026-08-${String(runId).padStart(2, "0")}T01:00:00Z`,
          startedAt: `2026-08-${String(runId).padStart(2, "0")}T01:00:00Z`,
          finishedAt: runId === 11 ? null : `2026-08-${String(runId).padStart(2, "0")}T01:10:00Z`,
        };
      },
    );
    vi.mocked(api.getSyncJob).mockResolvedValue({
      id: 8,
      apiCode: "sale_return_order_page",
      jobType: "history_backfill",
      status: "running",
      syncBatchNo: "BATCH-11",
      syncRunId: 11,
      executions,
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/jobs/8"]}>
        <Routes>
          <Route path="/jobs/tasks/:taskNo" element={<SyncJobDetailPage />} />
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("tab", { name: "执行记录（11）", selected: true });
    const selectedRow = screen.getByText("BATCH-11").closest("tr");
    expect(selectedRow).toHaveClass("execution-row--selected");
    expect(screen.queryByText("BATCH-1")).not.toBeInTheDocument();

    await user.click(screen.getByTitle("2"));
    expect(await screen.findByText("BATCH-1")).toBeInTheDocument();
    expect(screen.queryByText("BATCH-11")).not.toBeInTheDocument();
  });

  it("严格按后端可用操作展示按钮", async () => {
    vi.mocked(api.getSyncJob).mockResolvedValue({
      id: 8,
      apiCode: "sale_return_order_page",
      jobType: "sync",
      status: "running",
      availableActions: [],
    });
    render(
      <MemoryRouter initialEntries={["/jobs/8"]}>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "sale_return_order_page" });
    expect(screen.queryByRole("button", { name: "暂停任务" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "停止后续窗口" })).not.toBeInTheDocument();
  });

  it("停止任务先显示确认弹窗，确认后才提交", async () => {
    vi.mocked(api.stopSyncJob).mockResolvedValue({ jobId: 8, status: "stopped" });
    vi.mocked(api.getSyncJob)
      .mockResolvedValueOnce({
        id: 8,
        apiCode: "sale_return_order_page",
        jobType: "sync",
        status: "running",
        availableActions: ["pause", "stop"],
      })
      .mockResolvedValueOnce({
        id: 8,
        apiCode: "sale_return_order_page",
        jobType: "sync",
        status: "stopped",
        availableActions: [],
      });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/jobs/8"]}>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "停止后续窗口" }));
    expect(api.stopSyncJob).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "停止任务" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认停止" }));
    await waitFor(() => expect(api.stopSyncJob).toHaveBeenCalledWith("8", "csrf-token"));
  });

  it("展示生命周期和后端失败处理建议", async () => {
    vi.mocked(api.getSyncJob).mockResolvedValue({
      id: 8,
      apiCode: "sale_return_order_page",
      jobType: "sync",
      status: "failed",
      availableActions: ["retry"],
      failureInfo: {
        category: "authentication",
        recommendation: "检查账号凭证并重新验证账号，确认恢复后再重试。",
      },
      lifecycleEvents: [
        {
          id: "audit-1",
          eventType: "created",
          occurredAt: "2026-08-27T08:00:00Z",
          actorName: "管理员",
          executionId: 8,
          status: null,
        },
      ],
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/jobs/8"]}>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("tab", { name: "任务事件（1）" }));
    expect(await screen.findByRole("heading", { name: "任务生命周期" })).toBeInTheDocument();
    expect(screen.getByText("任务已创建")).toBeInTheDocument();
    expect(screen.getByText(/执行 #8 · 操作人：管理员/)).toBeInTheDocument();
    expect(screen.getByText(/检查账号凭证并重新验证账号/)).toBeInTheDocument();
  });

  it("增量追赶完成后明确展示已追平", async () => {
    vi.mocked(api.getSyncJob).mockResolvedValue({
      id: 8,
      apiCode: "sale_return_order_page",
      jobType: "update_incremental",
      status: "success",
      historyProgress: {
        completedWindows: 79,
        totalWindows: 79,
        currentWindow: { startDate: "2026-08-25", endDate: "2026-08-25" },
        currentPage: 1,
        totalPages: 1,
        earliestObservedDataDate: "2020-01-01",
        historyCompleteThrough: "2026-08-24",
        changeCatchup: "incremental_ready",
      },
    });

    render(
      <MemoryRouter initialEntries={["/jobs/8"]}>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("增量同步已追平")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "增量同步进度" })).toBeInTheDocument();
  });

  it("尚无分页结果时不把 0 / 0 展示为当前页", async () => {
    vi.mocked(api.getSyncJob).mockResolvedValue({
      id: 8,
      apiCode: "sale_return_order_page",
      jobType: "history_backfill",
      status: "running",
      historyProgress: {
        completedWindows: 0,
        totalWindows: 79,
        currentWindow: { startDate: "2020-01-01", endDate: "2020-01-31" },
        currentPage: 0,
        totalPages: 0,
        earliestObservedDataDate: null,
        historyCompleteThrough: null,
        changeCatchup: "pending",
      },
    });

    render(
      <MemoryRouter initialEntries={["/jobs/8"]}>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("等待首个分页结果")).toBeInTheDocument();
    expect(screen.queryByText("0 / 0")).not.toBeInTheDocument();
  });

  it("活动任务轮询后把等待状态更新为真实页码", async () => {
    vi.useFakeTimers();
    vi.mocked(api.getSyncJob)
      .mockResolvedValueOnce({
        id: 8,
        apiCode: "sale_return_order_page",
        jobType: "history_backfill",
        status: "running",
        historyProgress: {
          completedWindows: 0,
          totalWindows: 79,
          currentWindow: { startDate: "2020-01-01", endDate: "2020-01-31" },
          currentPage: 0,
          totalPages: 0,
          earliestObservedDataDate: null,
          historyCompleteThrough: null,
          changeCatchup: "running",
        },
      })
      .mockResolvedValue({
        id: 8,
        apiCode: "sale_return_order_page",
        jobType: "history_backfill",
        status: "running",
        historyProgress: {
          completedWindows: 0,
          totalWindows: 79,
          currentWindow: { startDate: "2020-01-01", endDate: "2020-01-31" },
          currentPage: 12,
          totalPages: 416,
          earliestObservedDataDate: "2020-01-03",
          historyCompleteThrough: null,
          changeCatchup: "running",
        },
      });
    render(
      <MemoryRouter initialEntries={["/jobs/8"]}>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("等待首个分页结果")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByText("12 / 416")).toBeInTheDocument();
  });

  it("切换任务后清空旧详情，并且旧请求完成不能解除新任务加载状态", async () => {
    const nextJob = deferred<SyncJob>();
    vi.mocked(api.getSyncJob)
      .mockResolvedValueOnce({
        id: 7,
        jobNo: "JOB-007",
        apiCode: "sale_return_order_page",
        jobType: "history_backfill",
        status: "success",
      })
      .mockReturnValueOnce(nextJob.promise);

    render(
      <MemoryRouter initialEntries={["/jobs/7"]}>
        <Link to="/jobs/8">切换到任务 8</Link>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("任务号：JOB-007")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "切换到任务 8" }));
    await waitFor(() => expect(api.getSyncJob).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("任务号：JOB-007")).not.toBeInTheDocument();
    expect(screen.getByText("正在加载任务详情…")).toBeInTheDocument();

    await act(async () => {
      nextJob.resolve({
        id: 8,
        jobNo: "JOB-008",
        apiCode: "sale_return_order_page",
        jobType: "history_backfill",
        status: "success",
      });
    });
    expect(screen.getByText("任务号：JOB-008")).toBeInTheDocument();
  });

  it("旧任务请求迟到时不能覆盖新任务，也不能提前结束新任务加载", async () => {
    const oldJob = deferred<SyncJob>();
    const newJob = deferred<SyncJob>();
    vi.mocked(api.getSyncJob)
      .mockReturnValueOnce(oldJob.promise)
      .mockReturnValueOnce(newJob.promise);

    render(
      <MemoryRouter initialEntries={["/jobs/7"]}>
        <Link to="/jobs/8">切换到任务 8</Link>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("link", { name: "切换到任务 8" }));
    await waitFor(() => expect(api.getSyncJob).toHaveBeenCalledTimes(2));

    await act(async () => {
      oldJob.resolve({
        id: 7,
        jobNo: "JOB-007",
        apiCode: "sale_return_order_page",
        jobType: "history_backfill",
        status: "failed",
      });
    });
    expect(screen.queryByText("任务号：JOB-007")).not.toBeInTheDocument();
    expect(screen.getByText("正在加载任务详情…")).toBeInTheDocument();

    await act(async () => {
      newJob.resolve({
        id: 8,
        jobNo: "JOB-008",
        apiCode: "sale_return_order_page",
        jobType: "history_backfill",
        status: "success",
      });
    });
    expect(screen.getByText("任务号：JOB-008")).toBeInTheDocument();
  });

  it("慢轮询完成后再等待三秒，期间不发起重叠请求", async () => {
    vi.useFakeTimers();
    const slowPoll = deferred<SyncJob>();
    vi.mocked(api.getSyncJob)
      .mockResolvedValueOnce(runningJobWithPage(1))
      .mockReturnValueOnce(slowPoll.promise)
      .mockResolvedValueOnce(runningJobWithPage(3));

    render(
      <MemoryRouter initialEntries={["/jobs/8"]}>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("1 / 10")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(api.getSyncJob).toHaveBeenCalledTimes(2);

    await act(async () => {
      slowPoll.resolve(runningJobWithPage(2));
    });
    expect(screen.getByText("2 / 10")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2999);
    });
    expect(api.getSyncJob).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(api.getSyncJob).toHaveBeenCalledTimes(3);
    expect(screen.getByText("3 / 10")).toBeInTheDocument();
  });

  it("切换任务后旧任务的未完成轮询不能继续调度", async () => {
    vi.useFakeTimers();
    const oldPoll = deferred<SyncJob>();
    vi.mocked(api.getSyncJob)
      .mockResolvedValueOnce({ ...runningJobWithPage(1), id: 7, jobNo: "JOB-007" })
      .mockReturnValueOnce(oldPoll.promise)
      .mockResolvedValueOnce({
        id: 8,
        jobNo: "JOB-008",
        apiCode: "sale_return_order_page",
        jobType: "history_backfill",
        status: "success",
      });

    render(
      <MemoryRouter initialEntries={["/jobs/7"]}>
        <Link to="/jobs/8">切换到任务 8</Link>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("任务号：JOB-007")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(api.getSyncJob).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("link", { name: "切换到任务 8" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("任务号：JOB-008")).toBeInTheDocument();
    expect(api.getSyncJob).toHaveBeenCalledTimes(3);

    await act(async () => {
      oldPoll.resolve({ ...runningJobWithPage(2), id: 7, jobNo: "JOB-007" });
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(api.getSyncJob).toHaveBeenCalledTimes(3);
    expect(screen.getByText("任务号：JOB-008")).toBeInTheDocument();
  });

  it("卸载任务详情后不再轮询", async () => {
    vi.useFakeTimers();
    vi.mocked(api.getSyncJob).mockResolvedValue(runningJobWithPage(1));
    const view = render(
      <MemoryRouter initialEntries={["/jobs/8"]}>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(api.getSyncJob).toHaveBeenCalledTimes(1);

    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(api.getSyncJob).toHaveBeenCalledTimes(1);
  });

  it("存在运行标识时可从批次号进入运行详情", async () => {
    vi.mocked(api.getSyncJob).mockResolvedValue({
      id: 8,
      jijiaAccountId: 6,
      apiCode: "sale_return_order_page",
      jobType: "history_backfill",
      status: "failed",
      syncBatchNo: "BATCH-008",
      syncRunId: 18,
      errorCode: "SYNC_API_FAILED",
      errorMessage: "同步接口执行失败",
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/jobs/8"]}>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "sale_return_order_page" });
    await user.click(screen.getByText("查看技术信息"));
    expect(screen.getByRole("link", { name: "BATCH-008" })).toHaveAttribute("href", "/runs/18");
    expect(screen.getByRole("heading", { name: "任务执行失败" })).toBeInTheDocument();
    expect(screen.getByText("同步接口执行失败")).toBeInTheDocument();
    expect(screen.queryByText(/SYNC_API_FAILED/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看失败请求" })).toHaveAttribute(
      "href",
      "#job-diagnostics",
    );
    expect(screen.getByRole("link", { name: "查看批次数据" })).toHaveAttribute(
      "href",
      "/raw-data?jijiaAccountId=6&apiCode=sale_return_order_page&observedBatchNo=BATCH-008&taskId=8&runId=18&runStatus=failed",
    );
  });

  it("从任务事件点击失败请求时切回执行记录并展示诊断", async () => {
    vi.mocked(api.getSyncJob).mockResolvedValue({
      id: 8,
      apiCode: "sale_return_order_page",
      jobType: "history_backfill",
      status: "failed",
      syncBatchNo: "BATCH-008",
      syncRunId: 18,
      errorCode: "SYNC_API_FAILED",
      errorMessage: "同步接口执行失败",
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/jobs/8"]}>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("tab", { name: "任务事件（0）" }));
    expect(screen.getByRole("tab", { name: "任务事件（0）", selected: true })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "批次诊断" })).not.toBeInTheDocument();

    const diagnosticsLink = screen.getByRole("link", { name: "查看失败请求" });
    expect(diagnosticsLink).toHaveAttribute("href", "#job-diagnostics");
    await user.click(diagnosticsLink);

    expect(screen.getByRole("tab", { name: "执行记录（0）", selected: true })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "批次诊断" })).toBeInTheDocument();
  });

  it("在任务详情内切换执行批次并查看对应诊断", async () => {
    vi.mocked(api.getSyncTask).mockResolvedValue({
      id: 8,
      taskNo: "TASK-008",
      jijiaAccountId: 6,
      apiCode: "sale_return_order_page",
      jobType: "history_backfill",
      status: "paused",
      syncBatchNo: "BATCH-18",
      syncRunId: 18,
      executions: [
        {
          id: 17,
          jobNo: "JOB-017",
          windowIndex: 1,
          windowStart: "2021-01-01",
          windowEnd: "2021-01-31",
          status: "success",
          syncBatchNo: "BATCH-17",
          syncRunId: 17,
          startedAt: "2026-08-26T01:00:00Z",
          finishedAt: "2026-08-26T01:10:00Z",
        },
        {
          id: 18,
          jobNo: "JOB-018",
          windowIndex: 2,
          windowStart: "2021-02-01",
          windowEnd: "2021-02-28",
          status: "paused",
          syncBatchNo: "BATCH-18",
          syncRunId: 18,
          startedAt: "2026-08-26T02:00:00Z",
          finishedAt: null,
        },
      ],
    });
    vi.mocked(api.listSyncRunLogs).mockImplementation(async (runId) => ({
      items: [
        {
          id: Number(runId),
          apiCode: "sale_return_order_page",
          status: "success",
          message: `运行 ${runId}`,
        },
      ],
    }));
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/jobs/tasks/TASK-008"]}>
        <Routes>
          <Route path="/jobs/tasks/:taskNo" element={<SyncJobDetailPage />} />
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const history = await screen.findByRole("tabpanel", { name: "执行记录（2）" });
    expect(screen.queryByText("高级运行诊断")).not.toBeInTheDocument();
    expect(await screen.findByText(/运行 18/)).toBeInTheDocument();

    const firstExecution = screen.getByText("BATCH-17").closest("tr");
    expect(firstExecution).not.toBeNull();
    await user.click(within(firstExecution!).getByRole("button", { name: "查看诊断" }));

    expect(await screen.findByText(/运行 17/)).toBeInTheDocument();
    expect(
      within(history).getByRole("button", { name: "查看诊断", pressed: true }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看完整技术日志" })).toHaveAttribute(
      "href",
      "/runs/17",
    );
    expect(screen.getByRole("link", { name: "验证所选批次数据" })).toHaveAttribute(
      "href",
      "/raw-data?jijiaAccountId=6&apiCode=sale_return_order_page&observedBatchNo=BATCH-17&taskId=8&runId=17&runStatus=success&windowStart=2021-01-01&windowEnd=2021-01-31",
    );
  });

  it("批次日志与失败请求独立加载，失败区域可单独重试", async () => {
    vi.mocked(api.getSyncJob).mockResolvedValue({
      id: 8,
      apiCode: "sale_return_order_page",
      jobType: "history_backfill",
      status: "failed",
      syncBatchNo: "BATCH-008",
      syncRunId: 18,
    });
    vi.mocked(api.listSyncRunLogs).mockResolvedValue({
      items: [
        {
          id: 18,
          apiCode: "sale_return_order_page",
          status: "success",
          message: "日志仍可查看",
        },
      ],
    });
    vi.mocked(api.listFailedRequests)
      .mockRejectedValueOnce(new ApiError("失败请求暂时不可用", 503, "SERVICE_UNAVAILABLE"))
      .mockResolvedValueOnce({
        items: [
          {
            id: 1,
            apiCode: "sale_return_order_page",
            errorMessage: "连接超时",
          },
        ],
      });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/jobs/8"]}>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "批次诊断" })).toBeInTheDocument();
    await waitFor(() => expect(api.listSyncRunLogs).toHaveBeenCalledWith(18));
    expect(await screen.findByText(/日志仍可查看/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("失败请求暂时不可用");
    expect(api.listSyncRunLogs).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "重试失败请求" }));

    expect(await screen.findByText("连接超时")).toBeInTheDocument();
    expect(api.listFailedRequests).toHaveBeenCalledTimes(2);
    expect(api.listSyncRunLogs).toHaveBeenCalledTimes(1);
  });

  it("接口日志失败时保留失败请求，并可单独重试日志", async () => {
    vi.mocked(api.getSyncJob).mockResolvedValue({
      id: 8,
      apiCode: "sale_return_order_page",
      jobType: "history_backfill",
      status: "failed",
      syncBatchNo: "BATCH-008",
      syncRunId: 18,
    });
    vi.mocked(api.listSyncRunLogs)
      .mockRejectedValueOnce(new ApiError("接口日志暂时不可用", 503, "SERVICE_UNAVAILABLE"))
      .mockResolvedValueOnce({
        items: [
          {
            id: 18,
            apiCode: "sale_return_order_page",
            status: "success",
            message: "日志已恢复",
          },
        ],
      });
    vi.mocked(api.listFailedRequests).mockResolvedValue({
      items: [
        {
          id: 1,
          apiCode: "sale_return_order_page",
          errorMessage: "失败请求仍可查看",
        },
      ],
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/jobs/8"]}>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "批次诊断" })).toBeInTheDocument();
    expect(await screen.findByText("失败请求仍可查看")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("接口日志暂时不可用");

    await user.click(screen.getByRole("button", { name: "重试接口日志" }));

    expect(await screen.findByText(/日志已恢复/)).toBeInTheDocument();
    expect(api.listSyncRunLogs).toHaveBeenCalledTimes(2);
    expect(api.listFailedRequests).toHaveBeenCalledTimes(1);
  });

  it("从原始数据返回时恢复对应执行批次", async () => {
    vi.mocked(api.getSyncJob).mockResolvedValue({
      id: 8,
      apiCode: "sale_return_order_page",
      jobType: "history_backfill",
      status: "paused",
      syncBatchNo: "BATCH-18",
      syncRunId: 18,
      executions: [
        {
          id: 17,
          jobNo: "JOB-017",
          windowIndex: 1,
          windowStart: "2021-01-01",
          windowEnd: "2021-01-31",
          status: "success",
          syncBatchNo: "BATCH-17",
          syncRunId: 17,
          startedAt: "2026-08-26T01:00:00Z",
          finishedAt: "2026-08-26T01:10:00Z",
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/jobs/8?runId=17#job-diagnostics"]}>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/当前查看批次 BATCH-17/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看诊断", pressed: true })).toBeInTheDocument();
  });

  it("从筛选后的任务列表进入时保留返回位置", async () => {
    vi.mocked(api.getSyncJob).mockResolvedValue({
      id: 8,
      apiCode: "sale_return_order_page",
      jobType: "history_backfill",
      status: "success",
    });
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/jobs/8",
            state: { from: "/jobs?account=6&status=failed", backLabel: "返回任务列表" },
          },
        ]}
      >
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "← 返回任务列表" })).toHaveAttribute(
      "href",
      "/jobs?account=6&status=failed",
    );
  });

  it("创建成功进入详情时显示已加入队列提示和返回任务列表路径", async () => {
    vi.mocked(api.getSyncJob).mockResolvedValue({
      id: 8,
      apiCode: "sale_return_order_page",
      jobType: "history_backfill",
      status: "queued",
    });
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/jobs/8",
            state: {
              backLabel: "返回任务列表",
              createdJobId: "8",
              from: "/jobs",
              jobCreatedNotice: "任务已加入队列",
            },
          },
        ]}
      >
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("status")).toHaveTextContent("任务已加入队列");
    expect(screen.getByRole("link", { name: "← 返回任务列表" })).toHaveAttribute("href", "/jobs");
  });

  it("本窗口完成但整体未完成时引导查看自动排队的下一窗口", async () => {
    vi.mocked(api.getSyncJob).mockResolvedValue({
      id: 8,
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
    });

    render(
      <MemoryRouter initialEntries={["/jobs/8"]}>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("下一窗口已自动排队。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回任务列表查看最新任务" })).toHaveAttribute(
      "href",
      "/jobs",
    );
  });

  it("稳定任务路由按 taskNo 读取并控制当前执行", async () => {
    const queuedJob: SyncJob = {
      id: 21,
      taskNo: "TASK-HISTORY-1",
      apiCode: "sales_analysis_variation_asin_page",
      jobType: "history_backfill",
      status: "queued",
      taskStatus: "in_progress",
      executionStatus: "queued",
      availableActions: ["cancel"],
      completedWindows: 2,
      totalWindows: 10,
    };
    vi.mocked(api.getSyncTask)
      .mockResolvedValueOnce(queuedJob)
      .mockResolvedValueOnce({
        ...queuedJob,
        status: "cancelled",
        taskStatus: "terminated",
        executionStatus: "cancelled",
        availableActions: [],
      });
    vi.mocked(api.cancelSyncTask).mockResolvedValue({
      jobId: 21,
      taskNo: "TASK-HISTORY-1",
      status: "cancelled",
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/jobs/tasks/TASK-HISTORY-1"]}>
        <Routes>
          <Route path="/jobs/tasks/:taskNo" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "取消任务" }));

    expect(api.getSyncTask).toHaveBeenNthCalledWith(1, "TASK-HISTORY-1");
    expect(api.cancelSyncTask).toHaveBeenCalledWith("TASK-HISTORY-1", "csrf-token");
    expect(await screen.findByText("已终止")).toBeInTheDocument();
    expect(api.getSyncJob).not.toHaveBeenCalled();
  });

  it.each(["admin", "operator"] as const)(
    "%s 可以取消排队中的任务，成功后刷新服务端状态",
    async (role) => {
      authRole.current = role;
      const queuedJob: SyncJob = {
        id: 8,
        jobNo: "JOB-008",
        apiCode: "sale_return_order_page",
        jobType: "history_backfill",
        status: "queued",
        availableActions: ["cancel"],
      };
      const cancelledJob: SyncJob = { ...queuedJob, status: "cancelled", availableActions: [] };
      vi.mocked(api.getSyncJob)
        .mockResolvedValueOnce(queuedJob)
        .mockResolvedValueOnce(cancelledJob);
      vi.mocked(api.cancelSyncJob).mockResolvedValue({ jobId: 8, status: "cancelled" });
      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={["/jobs/8"]}>
          <Routes>
            <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
          </Routes>
        </MemoryRouter>,
      );

      await user.click(await screen.findByRole("button", { name: "取消任务" }));

      expect(api.cancelSyncJob).toHaveBeenCalledWith("8", "csrf-token");
      expect(await screen.findByText("已终止")).toBeInTheDocument();
      expect(api.getSyncJob).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("button", { name: "取消任务" })).not.toBeInTheDocument();
    },
  );

  it("取消期间阻止重复提交，旧轮询结果不能覆盖已取消状态", async () => {
    vi.useFakeTimers();
    const stalePoll = deferred<SyncJob>();
    const cancelRequest = deferred<JobCancelledResponse>();
    const queuedJob: SyncJob = {
      id: 8,
      jobNo: "JOB-008",
      apiCode: "sale_return_order_page",
      jobType: "history_backfill",
      status: "queued",
      availableActions: ["cancel"],
    };
    const cancelledJob: SyncJob = { ...queuedJob, status: "cancelled", availableActions: [] };
    vi.mocked(api.getSyncJob)
      .mockResolvedValueOnce(queuedJob)
      .mockReturnValueOnce(stalePoll.promise)
      .mockResolvedValueOnce(cancelledJob);
    vi.mocked(api.cancelSyncJob).mockReturnValue(cancelRequest.promise);
    render(
      <MemoryRouter initialEntries={["/jobs/8"]}>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "取消任务" })).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(api.getSyncJob).toHaveBeenCalledTimes(2);

    const cancelButton = screen.getByRole("button", { name: "取消任务" });
    fireEvent.click(cancelButton);
    fireEvent.click(cancelButton);
    expect(api.cancelSyncJob).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "取消中…" })).toBeDisabled();

    await act(async () => {
      cancelRequest.resolve({ jobId: 8, status: "cancelled" });
    });
    expect(screen.getByText("已终止")).toBeInTheDocument();

    await act(async () => {
      stalePoll.resolve(queuedJob);
    });
    expect(screen.getByText("已终止")).toBeInTheDocument();
    expect(screen.queryByText("排队中")).not.toBeInTheDocument();
  });

  it("Viewer 查看排队任务时不显示取消按钮", async () => {
    authRole.current = "viewer";
    vi.mocked(api.getSyncJob).mockResolvedValue({
      id: 8,
      apiCode: "sale_return_order_page",
      jobType: "history_backfill",
      status: "queued",
      availableActions: ["cancel"],
    });
    render(
      <MemoryRouter initialEntries={["/jobs/8"]}>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("进行中")).toBeInTheDocument();
    expect(screen.getByText("当前阶段：等待领取")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "取消任务" })).not.toBeInTheDocument();
  });

  it("重试成功后跳转到新任务而不是停留在旧任务", async () => {
    vi.mocked(api.getSyncJob).mockResolvedValue({
      id: 8,
      apiCode: "sale_return_order_page",
      jobType: "history_backfill",
      status: "failed",
      availableActions: ["retry"],
      errorMessage: "请求失败",
    });
    vi.mocked(api.retrySyncJob).mockResolvedValue({ jobId: 19 });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/jobs/8"]}>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "重试任务" }));
    await waitFor(() => expect(screen.getByTestId("current-path")).toHaveTextContent("/jobs/19"));
    expect(api.retrySyncJob).toHaveBeenCalledWith("8", "csrf-token");
  });

  it("同一任务号重试成功后立即加载新执行", async () => {
    const taskNo = "task_retry_1";
    vi.mocked(api.getSyncTask)
      .mockResolvedValueOnce({
        id: 8,
        taskNo,
        apiCode: "sale_return_order_page",
        jobType: "history_backfill",
        status: "failed",
        availableActions: ["retry"],
        errorMessage: "请求失败",
      })
      .mockResolvedValueOnce({
        id: 19,
        taskNo,
        currentExecutionId: 19,
        apiCode: "sale_return_order_page",
        jobType: "history_backfill",
        status: "queued",
        taskStatus: "in_progress",
        executionStatus: "queued",
        availableActions: ["cancel"],
      });
    vi.mocked(api.retrySyncTask).mockResolvedValue({ jobId: 19, taskNo });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={[`/jobs/tasks/${taskNo}`]}>
        <Routes>
          <Route path="/jobs/tasks/:taskNo" element={<SyncJobDetailPage />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "重试任务" }));

    await waitFor(() => expect(api.getSyncTask).toHaveBeenCalledTimes(2));
    expect(screen.getByText("当前阶段：等待领取")).toBeInTheDocument();
    expect(screen.queryByText("任务执行失败")).not.toBeInTheDocument();
    expect(screen.getByTestId("current-path")).toHaveTextContent(`/jobs/tasks/${taskNo}`);
  });

  it("增量已追平时原地标记任务并保留失败证据", async () => {
    const taskNo = "task_caught_up_1";
    const failedJob: SyncJob = {
      id: 8,
      taskNo,
      jijiaAccountId: 4,
      apiCode: "sale_return_order_page",
      jobType: "update_incremental",
      status: "failed",
      syncRunId: 31,
      syncBatchNo: "sync_20260917_001",
      availableActions: ["retry"],
      errorMessage: "同步接口执行失败",
    };
    vi.mocked(api.getSyncTask)
      .mockResolvedValueOnce(failedJob)
      .mockResolvedValueOnce({
        ...failedJob,
        taskStatus: "caught_up",
        resolutionCode: "incremental_caught_up",
        resolvedAt: "2026-09-17T16:26:45Z",
        availableActions: [],
        lifecycleEvents: [
          {
            id: "audit-1",
            eventType: "resolved",
            occurredAt: "2026-09-17T16:26:45Z",
            actorName: "spring",
            executionId: 8,
            status: "failed",
          },
        ],
      });
    vi.mocked(api.retrySyncTask).mockResolvedValue({
      outcome: "already_caught_up",
      jobId: 8,
      taskNo,
      taskStatus: "caught_up",
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={[`/jobs/tasks/${taskNo}`]}>
        <Routes>
          <Route path="/jobs/tasks/:taskNo" element={<SyncJobDetailPage />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "重试任务" }));

    await waitFor(() => expect(api.getSyncTask).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "当前数据已追平，无需重试。原执行失败记录仍保留，相关数据范围已由后续同步覆盖。",
    );
    expect(screen.getByRole("heading", { name: "当前数据已追平" })).toBeInTheDocument();
    expect(screen.getByText("当前状态 · 已追平")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看失败请求" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看批次数据" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重试任务" })).not.toBeInTheDocument();
    expect(screen.getByTestId("current-path")).toHaveTextContent(`/jobs/tasks/${taskNo}`);

    await user.click(screen.getByRole("tab", { name: "任务事件（1）" }));
    expect(screen.getByText("数据范围已由后续同步覆盖")).toBeInTheDocument();
  });

  it("同一任务号继续成功后立即加载新执行", async () => {
    const taskNo = "task_paused_1";
    vi.mocked(api.getSyncTask)
      .mockResolvedValueOnce({
        id: 8,
        taskNo,
        apiCode: "sale_return_order_page",
        jobType: "history_backfill",
        status: "paused",
        availableActions: ["resume", "stop"],
      })
      .mockResolvedValueOnce({
        id: 20,
        taskNo,
        currentExecutionId: 20,
        apiCode: "sale_return_order_page",
        jobType: "history_backfill",
        status: "queued",
        taskStatus: "in_progress",
        executionStatus: "queued",
        availableActions: ["cancel"],
      });
    vi.mocked(api.resumeSyncTask).mockResolvedValue({ jobId: 20, taskNo });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={[`/jobs/tasks/${taskNo}`]}>
        <Routes>
          <Route path="/jobs/tasks/:taskNo" element={<SyncJobDetailPage />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "继续执行" }));

    await waitFor(() => expect(api.getSyncTask).toHaveBeenCalledTimes(2));
    expect(screen.getByText("当前阶段：等待领取")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "继续执行" })).not.toBeInTheDocument();
    expect(screen.getByTestId("current-path")).toHaveTextContent(`/jobs/tasks/${taskNo}`);
  });

  it("切换任务后旧重试成功不能导航离开当前任务", async () => {
    const oldRetry = deferred<JobAcceptedResponse>();
    vi.mocked(api.getSyncJob).mockImplementation(async (jobId) => failedJob(Number(jobId)));
    vi.mocked(api.retrySyncJob).mockReturnValue(oldRetry.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/jobs/7"]}>
        <Link to="/jobs/8">切换到任务 8</Link>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "重试任务" }));
    await user.click(screen.getByRole("link", { name: "切换到任务 8" }));
    expect(await screen.findByText("任务号：JOB-008")).toBeInTheDocument();

    await act(async () => {
      oldRetry.resolve({ jobId: 19 });
    });
    expect(screen.getByTestId("current-path")).toHaveTextContent("/jobs/8");
    expect(screen.getByText("任务号：JOB-008")).toBeInTheDocument();
  });

  it("旧重试失败和 finally 不能写入新任务或解除新重试状态", async () => {
    const oldRetry = deferred<JobAcceptedResponse>();
    const newRetry = deferred<JobAcceptedResponse>();
    vi.mocked(api.getSyncJob).mockImplementation(async (jobId) => failedJob(Number(jobId)));
    vi.mocked(api.retrySyncJob)
      .mockReturnValueOnce(oldRetry.promise)
      .mockReturnValueOnce(newRetry.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/jobs/7"]}>
        <Link to="/jobs/8">切换到任务 8</Link>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "重试任务" }));
    await user.click(screen.getByRole("link", { name: "切换到任务 8" }));
    await user.click(await screen.findByRole("button", { name: "重试任务" }));
    expect(screen.getByRole("button", { name: "提交中…" })).toBeDisabled();

    await act(async () => {
      oldRetry.reject(new Error("旧任务重试失败"));
      await oldRetry.promise.catch(() => undefined);
    });
    expect(screen.queryByText("旧任务重试失败")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交中…" })).toBeDisabled();
    expect(screen.getByTestId("current-path")).toHaveTextContent("/jobs/8");

    await act(async () => {
      newRetry.resolve({ jobId: 20 });
    });
    expect(screen.getByTestId("current-path")).toHaveTextContent("/jobs/20");
  });

  it("Viewer 查看失败任务时不显示重试按钮", async () => {
    authRole.current = "viewer";
    vi.mocked(api.getSyncJob).mockResolvedValue({
      id: 8,
      apiCode: "sale_return_order_page",
      jobType: "history_backfill",
      status: "failed",
      availableActions: ["retry"],
      errorMessage: "请求失败",
    });
    render(
      <MemoryRouter initialEntries={["/jobs/8"]}>
        <Routes>
          <Route path="/jobs/:id" element={<SyncJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("请求失败")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重试任务" })).not.toBeInTheDocument();
  });
});

function CurrentPath() {
  const location = useLocation();
  return (
    <span data-testid="current-path">
      {location.pathname}
      {location.search}
      {location.hash}|{JSON.stringify(location.state)}
    </span>
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

function runningJobWithPage(currentPage: number): SyncJob {
  return {
    id: 8,
    apiCode: "sale_return_order_page",
    jobType: "history_backfill",
    status: "running",
    availableActions: ["pause", "stop"],
    historyProgress: {
      completedWindows: 0,
      totalWindows: 79,
      currentWindow: { startDate: "2020-01-01", endDate: "2020-01-31" },
      currentPage,
      totalPages: 10,
      earliestObservedDataDate: null,
      historyCompleteThrough: null,
      changeCatchup: "running",
    },
  };
}

function failedJob(id: number): SyncJob {
  return {
    id,
    jobNo: `JOB-${String(id).padStart(3, "0")}`,
    apiCode: "sale_return_order_page",
    jobType: "history_backfill",
    status: "failed",
    availableActions: ["retry"],
    errorMessage: "请求失败",
  };
}
