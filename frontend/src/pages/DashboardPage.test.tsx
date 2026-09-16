import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/client";
import type { DashboardSummary } from "../api/types";
import { DashboardPage } from "./DashboardPage";
import { browserTimeZone } from "./m3Utils";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    csrfToken: null,
    user: { id: 3, email: "viewer@example.com", displayName: "只读成员", role: "viewer" },
    logout: vi.fn(),
  }),
}));
vi.mock("../api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api/client")>();
  return { ...original, api: { ...original.api, getDashboard: vi.fn() } };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}

describe("同步概览", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getDashboard).mockResolvedValue({
      queuedJobs: 2,
      runningJobs: 1,
      failedJobs: 3,
      failedRequests: 7,
      accounts: { total: 1, active: 1, attention: 0, inactive: 0 },
      policies: { total: 1, enabled: 1, scheduled: 1 },
      worker: {
        availability: "online",
        capacityStatus: "ready",
        configuredWorkerCount: 1,
        onlineWorkerCount: 1,
        busyWorkerCount: 0,
        idleWorkerCount: 1,
        staleWorkerCount: 0,
        heartbeatAt: "2026-08-26T02:00:00Z",
        currentJobId: null,
        queueDepth: 2,
        oldestQueuedAt: null,
        pollIntervalSeconds: 3,
        offlineAfterSeconds: 60,
      },
      latestRun: {
        id: 16,
        batchNo: "sync-016",
        status: "partial_failed",
        startedAt: "2026-08-26T02:00:00Z",
      },
      historyProgress: {
        completedWindows: 4,
        totalWindows: 79,
        currentWindow: { startDate: "2020-05-04", endDate: "2020-06-03" },
        currentPage: 2,
        totalPages: 5,
        earliestObservedDataDate: "2020-05-09",
        historyCompleteThrough: "2020-06-03",
        changeCatchup: "incremental_ready",
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("StrictMode 下首载完成后展示同步概览", async () => {
    render(
      <StrictMode>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </StrictMode>,
    );

    expect(await screen.findByText("sync-016")).toBeInTheDocument();
    expect(api.getDashboard).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("正在加载同步概览…")).not.toBeInTheDocument();
  });

  it("只展示冻结的核心指标、最近运行和历史进度", async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("sync-016")).toHaveAttribute("href", "/runs/16");
    expect(screen.getByRole("link", { name: /活动任务.*3/ })).toHaveAttribute(
      "href",
      "/jobs?group=active",
    );
    expect(screen.getByRole("link", { name: /需处理任务.*3/ })).toHaveAttribute(
      "href",
      "/jobs?group=attention",
    );
    expect(screen.getByText("4 / 79")).toBeInTheDocument();
    expect(screen.getByText("增量同步已追平")).toBeInTheDocument();
    expect(screen.getByText("2020-05-09")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(browserTimeZone))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看失败任务" })).toHaveAttribute(
      "href",
      "/jobs?group=attention",
    );
  });

  it("Viewer无待处理任务时提供查看入口而非创建", async () => {
    vi.mocked(api.getDashboard).mockResolvedValue({
      queuedJobs: 0,
      runningJobs: 0,
      failedJobs: 0,
      failedRequests: 0,
      accounts: { total: 1, active: 1, attention: 0, inactive: 0 },
      policies: { total: 1, enabled: 1, scheduled: 0 },
      worker: {
        availability: "online",
        capacityStatus: "ready",
        configuredWorkerCount: 1,
        onlineWorkerCount: 1,
        busyWorkerCount: 0,
        idleWorkerCount: 1,
        staleWorkerCount: 0,
        heartbeatAt: "2026-08-26T02:00:00Z",
        currentJobId: null,
        queueDepth: 0,
        oldestQueuedAt: null,
        pollIntervalSeconds: 3,
        offlineAfterSeconds: 90,
      },
      latestRun: null,
      historyProgress: null,
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "查看任务" })).toHaveAttribute("href", "/jobs");
  });

  it("显式刷新失败时保留最后一次成功概览", async () => {
    vi.mocked(api.getDashboard)
      .mockResolvedValueOnce({
        queuedJobs: 0,
        runningJobs: 0,
        failedJobs: 3,
        failedRequests: 7,
        latestRun: {
          id: 16,
          batchNo: "sync-016",
          status: "partial_failed",
          startedAt: "2026-08-26T02:00:00Z",
        },
        historyProgress: null,
      })
      .mockRejectedValueOnce(new Error("network error"));
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("sync-016")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "刷新" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("刷新失败，当前为上次结果");
    expect(screen.getByText("sync-016")).toBeInTheDocument();
    expect(screen.getByText(/刷新失败 · 仍显示 .* 的结果/)).toBeVisible();
  });

  it("刷新进行中阻止重复请求并保留旧内容", async () => {
    const refresh = deferred<DashboardSummary>();
    vi.mocked(api.getDashboard)
      .mockResolvedValueOnce({
        queuedJobs: 0,
        runningJobs: 0,
        failedJobs: 1,
        failedRequests: 0,
        latestRun: { id: 1, batchNo: "DASHBOARD-BASE", status: "success" },
        historyProgress: null,
      })
      .mockReturnValueOnce(refresh.promise);
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    await screen.findByText("DASHBOARD-BASE");
    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    await waitFor(() => expect(api.getDashboard).toHaveBeenCalledTimes(2));
    expect(screen.getByText("DASHBOARD-BASE")).toBeInTheDocument();
    expect(screen.getByText(/正在刷新 · 上次检查/)).toBeVisible();
    expect(screen.getByRole("button", { name: "刷新" })).toBeDisabled();

    await act(async () => {
      refresh.resolve({
        queuedJobs: 0,
        runningJobs: 0,
        failedJobs: 0,
        failedRequests: 0,
        latestRun: { id: 3, batchNo: "DASHBOARD-NEW", status: "success" },
        historyProgress: null,
      });
      await refresh.promise;
    });
    expect(screen.getByText("DASHBOARD-NEW")).toBeInTheDocument();
  });

  it("刷新失败后保留旧内容并恢复刷新按钮", async () => {
    const refresh = deferred<DashboardSummary>();
    vi.mocked(api.getDashboard)
      .mockResolvedValueOnce({
        queuedJobs: 0,
        runningJobs: 0,
        failedJobs: 1,
        failedRequests: 0,
        latestRun: { id: 1, batchNo: "DASHBOARD-BASE", status: "success" },
        historyProgress: null,
      })
      .mockReturnValueOnce(refresh.promise);
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    await screen.findByText("DASHBOARD-BASE");
    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    await waitFor(() => expect(api.getDashboard).toHaveBeenCalledTimes(2));

    await act(async () => {
      refresh.reject(new Error("刷新失败"));
      await refresh.promise.catch(() => undefined);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("刷新失败，当前为上次结果");
    expect(screen.getByText("DASHBOARD-BASE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新" })).toBeEnabled();
  });

  it("仅在存在活动任务时每三秒刷新", async () => {
    vi.useFakeTimers();
    vi.mocked(api.getDashboard)
      .mockResolvedValueOnce({
        queuedJobs: 1,
        runningJobs: 0,
        failedJobs: 0,
        failedRequests: 0,
        latestRun: null,
        historyProgress: null,
      })
      .mockResolvedValue({
        queuedJobs: 0,
        runningJobs: 0,
        failedJobs: 0,
        failedRequests: 0,
        latestRun: null,
        historyProgress: null,
      });
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(api.getDashboard).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(api.getDashboard).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(api.getDashboard).toHaveBeenCalledTimes(2);
  });

  it("轮询请求完成后才等待三秒发起下一轮", async () => {
    vi.useFakeTimers();
    const slowPoll = deferred<DashboardSummary>();
    const activeSummary: DashboardSummary = {
      queuedJobs: 1,
      runningJobs: 0,
      failedJobs: 0,
      failedRequests: 0,
      latestRun: null,
      historyProgress: null,
    };
    vi.mocked(api.getDashboard)
      .mockResolvedValueOnce(activeSummary)
      .mockReturnValueOnce(slowPoll.promise)
      .mockResolvedValue(activeSummary);
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(api.getDashboard).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(api.getDashboard).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(api.getDashboard).toHaveBeenCalledTimes(2);

    await act(async () => {
      slowPoll.resolve(activeSummary);
      await slowPoll.promise;
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2999);
    });
    expect(api.getDashboard).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(api.getDashboard).toHaveBeenCalledTimes(3);
  });

  it("自动轮询进行中点击刷新不会发起重复请求", async () => {
    vi.useFakeTimers();
    const slowPoll = deferred<DashboardSummary>();
    const activeSummary: DashboardSummary = {
      queuedJobs: 1,
      runningJobs: 0,
      failedJobs: 0,
      failedRequests: 0,
      latestRun: null,
      historyProgress: null,
    };
    vi.mocked(api.getDashboard)
      .mockResolvedValueOnce(activeSummary)
      .mockReturnValueOnce(slowPoll.promise);
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(api.getDashboard).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    expect(api.getDashboard).toHaveBeenCalledTimes(2);

    await act(async () => {
      slowPoll.resolve(activeSummary);
      await slowPoll.promise;
    });
  });
});
