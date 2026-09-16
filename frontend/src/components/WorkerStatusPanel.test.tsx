import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/client";
import { useWorkerRuntime } from "../hooks/useWorkerRuntime";
import { WorkerStatusPanel } from "./WorkerStatusPanel";

vi.mock("../api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api/client")>();
  return {
    ...original,
    api: {
      ...original.api,
      getWorkerRuntime: vi.fn(),
    },
  };
});

describe("Worker 状态面板", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("后台刷新间隔最短为 15 秒", async () => {
    vi.useFakeTimers();
    const runtime = {
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
    } as const;
    const backgroundRefresh = deferred<typeof runtime>();
    vi.mocked(api.getWorkerRuntime)
      .mockResolvedValueOnce(runtime)
      .mockReturnValueOnce(backgroundRefresh.promise);

    render(<WorkerStatusPanel />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("执行服务在线")).toBeInTheDocument();
    expect(api.getWorkerRuntime).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_999);
    });
    expect(api.getWorkerRuntime).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(api.getWorkerRuntime).toHaveBeenCalledTimes(2);
    expect(screen.getByText("执行服务在线")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新状态" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "正在刷新状态" })).not.toBeInTheDocument();
    await act(async () => backgroundRefresh.resolve(runtime));
  });

  it("多个消费者共享同一个 Worker 状态请求", async () => {
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
      pollIntervalSeconds: 30,
      offlineAfterSeconds: 90,
    });

    render(
      <>
        <WorkerStatusPanel compact />
        <WorkerStatusPanel compact />
      </>,
    );

    expect((await screen.findAllByText("执行服务在线")).length).toBe(2);
    expect(api.getWorkerRuntime).toHaveBeenCalledTimes(1);
  });

  it("页面隐藏时暂停请求并在恢复可见时立即刷新", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
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
      pollIntervalSeconds: 30,
      offlineAfterSeconds: 90,
    });

    render(<WorkerStatusPanel compact />);
    expect(api.getWorkerRuntime).not.toHaveBeenCalled();

    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(await screen.findByText("执行服务在线")).toBeInTheDocument();
    expect(api.getWorkerRuntime).toHaveBeenCalledTimes(1);
  });
  it("离线时只展示影响、关键状态和重新检查操作", async () => {
    vi.mocked(api.getWorkerRuntime).mockResolvedValue({
      availability: "offline",
      capacityStatus: "offline",
      configuredWorkerCount: 1,
      onlineWorkerCount: 0,
      busyWorkerCount: 0,
      idleWorkerCount: 0,
      staleWorkerCount: 0,
      heartbeatAt: null,
      currentJobId: 31,
      queueDepth: 3,
      oldestQueuedAt: null,
      pollIntervalSeconds: 3,
      offlineAfterSeconds: 90,
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <WorkerStatusPanel />
      </MemoryRouter>,
    );
    expect(await screen.findByText("执行服务离线")).toBeInTheDocument();
    expect(screen.getByText(/任务将继续排队，服务恢复后自动执行/)).toBeInTheDocument();
    expect(screen.queryByText("离线判定阈值")).not.toBeInTheDocument();
    expect(screen.queryByText(/ECS|systemd|数据库连接/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看任务 31" })).toHaveAttribute("href", "/jobs/31");
    expect(document.getElementById("worker-status")).toBeInTheDocument();
    const calls = vi.mocked(api.getWorkerRuntime).mock.calls.length;
    await user.click(screen.getByRole("button", { name: "刷新状态" }));
    expect(api.getWorkerRuntime).toHaveBeenCalledTimes(calls + 1);
  });

  it("容量不足时展示在线、忙碌、排队和失联数量", async () => {
    vi.mocked(api.getWorkerRuntime).mockResolvedValue({
      availability: "online",
      capacityStatus: "degraded",
      configuredWorkerCount: 4,
      onlineWorkerCount: 2,
      busyWorkerCount: 1,
      idleWorkerCount: 1,
      staleWorkerCount: 1,
      heartbeatAt: "2026-09-15T08:00:00Z",
      currentJobId: 8,
      queueDepth: 8,
      oldestQueuedAt: "2026-09-15T07:59:00Z",
      pollIntervalSeconds: 3,
      offlineAfterSeconds: 90,
    });

    render(<WorkerStatusPanel compact />);

    const panel = await screen.findByLabelText("任务执行服务状态");
    expect(panel).toHaveClass("worker-status--degraded");
    expect(
      screen.getByText("容量降级；配置 4、在线 2、忙碌 1、空闲 1、失联 1、排队 8。"),
    ).toBeInTheDocument();
  });

  it("完整模式展示配置、在线、忙碌、空闲、失联和容量状态", async () => {
    vi.mocked(api.getWorkerRuntime).mockResolvedValue({
      availability: "online",
      capacityStatus: "ready",
      configuredWorkerCount: 4,
      onlineWorkerCount: 4,
      busyWorkerCount: 2,
      idleWorkerCount: 2,
      staleWorkerCount: 0,
      heartbeatAt: "2026-09-15T08:00:00Z",
      currentJobId: 8,
      queueDepth: 3,
      oldestQueuedAt: null,
      pollIntervalSeconds: 3,
      offlineAfterSeconds: 90,
    });

    render(
      <MemoryRouter>
        <WorkerStatusPanel />
      </MemoryRouter>,
    );

    await screen.findByText("执行服务在线");
    expect(screen.getByText("容量状态").nextElementSibling).toHaveTextContent("容量正常");
    expect(screen.getByText("配置 Worker").nextElementSibling).toHaveTextContent("4");
    expect(screen.getByText("在线 Worker").nextElementSibling).toHaveTextContent("4");
    expect(screen.getByText("忙碌 Worker").nextElementSibling).toHaveTextContent("2");
    expect(screen.getByText("空闲 Worker").nextElementSibling).toHaveTextContent("2");
    expect(screen.getByText("失联 Worker").nextElementSibling).toHaveTextContent("0");
  });

  it("旧生命周期的响应不会覆盖重新挂载后的最新状态", async () => {
    const staleRuntime = {
      availability: "offline" as const,
      capacityStatus: "offline" as const,
      configuredWorkerCount: 4,
      onlineWorkerCount: 0,
      busyWorkerCount: 0,
      idleWorkerCount: 0,
      staleWorkerCount: 4,
      heartbeatAt: "2026-09-15T07:00:00Z",
      currentJobId: null,
      queueDepth: 6,
      oldestQueuedAt: "2026-09-15T06:59:00Z",
      pollIntervalSeconds: 3,
      offlineAfterSeconds: 90,
    };
    const currentRuntime = {
      ...staleRuntime,
      availability: "online" as const,
      capacityStatus: "ready" as const,
      onlineWorkerCount: 4,
      idleWorkerCount: 4,
      staleWorkerCount: 0,
      heartbeatAt: "2026-09-15T08:00:00Z",
      queueDepth: 0,
    };
    const staleRequest = deferred<typeof staleRuntime>();
    const currentRequest = deferred<typeof currentRuntime>();
    vi.mocked(api.getWorkerRuntime)
      .mockReturnValueOnce(staleRequest.promise)
      .mockReturnValueOnce(currentRequest.promise);

    const firstView = render(<WorkerStatusPanel compact />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.getWorkerRuntime).toHaveBeenCalledTimes(1);
    firstView.unmount();

    render(<WorkerStatusPanel compact />);
    await act(async () => staleRequest.resolve(staleRuntime));
    expect(api.getWorkerRuntime).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("执行服务离线")).not.toBeInTheDocument();

    await act(async () => currentRequest.resolve(currentRuntime));
    expect(await screen.findByText("执行服务在线")).toBeInTheDocument();
    expect(
      screen.getByText("容量正常；配置 4、在线 4、忙碌 0、空闲 4、失联 0、排队 0。"),
    ).toBeInTheDocument();
  });

  it("刷新条件变化时丢弃进行中的旧响应并立即重新请求", async () => {
    const staleRuntime = {
      availability: "offline" as const,
      capacityStatus: "offline" as const,
      configuredWorkerCount: 4,
      onlineWorkerCount: 0,
      busyWorkerCount: 0,
      idleWorkerCount: 0,
      staleWorkerCount: 4,
      heartbeatAt: "2026-09-15T07:00:00Z",
      currentJobId: null,
      queueDepth: 6,
      oldestQueuedAt: "2026-09-15T06:59:00Z",
      pollIntervalSeconds: 3,
      offlineAfterSeconds: 90,
    };
    const currentRuntime = {
      ...staleRuntime,
      availability: "online" as const,
      capacityStatus: "ready" as const,
      onlineWorkerCount: 4,
      idleWorkerCount: 4,
      staleWorkerCount: 0,
      heartbeatAt: "2026-09-15T08:00:00Z",
      queueDepth: 0,
    };
    const staleRequest = deferred<typeof staleRuntime>();
    const currentRequest = deferred<typeof currentRuntime>();
    vi.mocked(api.getWorkerRuntime)
      .mockReturnValueOnce(staleRequest.promise)
      .mockReturnValueOnce(currentRequest.promise);

    const view = render(<WorkerRuntimeProbe refreshKey="/jobs" />);
    await act(async () => {
      await Promise.resolve();
    });
    view.rerender(<WorkerRuntimeProbe refreshKey="/runs" />);
    await act(async () => staleRequest.resolve(staleRuntime));

    expect(api.getWorkerRuntime).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("offline:0")).not.toBeInTheDocument();

    await act(async () => currentRequest.resolve(currentRuntime));
    expect(await screen.findByText("ready:4")).toBeInTheDocument();
  });

  it("重新检查期间只保留一个请求并展示局部加载状态", async () => {
    const runtime = {
      availability: "online" as const,
      capacityStatus: "ready" as const,
      configuredWorkerCount: 1,
      onlineWorkerCount: 1,
      busyWorkerCount: 0,
      idleWorkerCount: 1,
      staleWorkerCount: 0,
      heartbeatAt: "2026-08-27T08:00:00Z",
      currentJobId: null,
      queueDepth: 0,
      oldestQueuedAt: null,
      pollIntervalSeconds: 30,
      offlineAfterSeconds: 90,
    };
    const refresh = deferred<typeof runtime>();
    vi.mocked(api.getWorkerRuntime)
      .mockResolvedValueOnce(runtime)
      .mockReturnValueOnce(refresh.promise);
    const user = userEvent.setup();
    render(<WorkerStatusPanel />);

    await screen.findByText("执行服务在线");
    await user.click(screen.getByRole("button", { name: "刷新状态" }));
    const checkingButton = screen.getByRole("button", { name: "正在刷新状态" });
    expect(checkingButton).toBeDisabled();
    expect(api.getWorkerRuntime).toHaveBeenCalledTimes(2);
    await user.click(checkingButton);
    expect(api.getWorkerRuntime).toHaveBeenCalledTimes(2);

    await act(async () => refresh.resolve(runtime));
    expect(screen.getByRole("button", { name: "刷新状态" })).toBeEnabled();
  });

  it("紧凑模式识别执行服务正在处理当前详情任务", async () => {
    vi.mocked(api.getWorkerRuntime).mockResolvedValue({
      availability: "busy",
      capacityStatus: "ready",
      configuredWorkerCount: 1,
      onlineWorkerCount: 1,
      busyWorkerCount: 1,
      idleWorkerCount: 0,
      staleWorkerCount: 0,
      heartbeatAt: "2026-08-27T08:00:00Z",
      currentJobId: 8,
      queueDepth: 3,
      oldestQueuedAt: "2026-08-27T07:59:00Z",
      pollIntervalSeconds: 30,
      offlineAfterSeconds: 90,
    });

    render(<WorkerStatusPanel compact currentExecutionId="8" />);

    const panel = await screen.findByLabelText("任务执行服务状态");
    expect(panel).toHaveClass("worker-status--compact");
    expect(screen.getByText("执行服务正在处理本任务")).toBeInTheDocument();
    expect(screen.getByText("当前任务正在正常执行。")).toBeInTheDocument();
    expect(screen.queryByText("执行服务忙碌")).not.toBeInTheDocument();
    expect(screen.getByText(/最近心跳/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新状态" })).toBeEnabled();
    expect(screen.queryByText("排队任务")).not.toBeInTheDocument();
    expect(screen.queryByText("离线判定阈值")).not.toBeInTheDocument();
  });

  it("紧凑模式明确提示执行服务正在处理其他任务", async () => {
    vi.mocked(api.getWorkerRuntime).mockResolvedValue({
      availability: "busy",
      capacityStatus: "ready",
      configuredWorkerCount: 1,
      onlineWorkerCount: 1,
      busyWorkerCount: 1,
      idleWorkerCount: 0,
      staleWorkerCount: 0,
      heartbeatAt: "2026-08-27T08:00:00Z",
      currentJobId: 8,
      queueDepth: 3,
      oldestQueuedAt: "2026-08-27T07:59:00Z",
      pollIntervalSeconds: 30,
      offlineAfterSeconds: 90,
    });

    render(<WorkerStatusPanel compact currentExecutionId={9} />);

    expect(await screen.findByText("执行服务正在处理其他任务")).toBeInTheDocument();
    expect(screen.getByText("当前任务正在等待，正在处理任务 8。")).toBeInTheDocument();
    expect(screen.queryByText("执行服务正在处理本任务")).not.toBeInTheDocument();
    expect(screen.queryByText("执行服务忙碌")).not.toBeInTheDocument();
  });

  it.each([
    ["普通", false],
    ["紧凑", true],
  ] as const)("%s模式后台刷新失败时保留上次结果", async (_label, compact) => {
    vi.useFakeTimers();
    const runtime = {
      availability: "online" as const,
      capacityStatus: "ready" as const,
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
    };
    vi.mocked(api.getWorkerRuntime)
      .mockResolvedValueOnce(runtime)
      .mockRejectedValueOnce(new Error("暂时失败"));

    render(<WorkerStatusPanel compact={compact} />);
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(screen.getByText("执行服务在线")).toBeInTheDocument();
    expect(screen.getByText(/状态刷新失败/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新状态" })).toBeEnabled();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function WorkerRuntimeProbe({ refreshKey }: { refreshKey: string }) {
  const { runtime } = useWorkerRuntime({ refreshKey });
  return (
    <span>{runtime ? `${runtime.capacityStatus}:${runtime.onlineWorkerCount}` : "loading"}</span>
  );
}
