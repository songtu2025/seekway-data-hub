import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";
import { AppShell } from "./AppShell";

const authState = vi.hoisted(() => ({
  logout: vi.fn<() => Promise<void>>(),
  role: "operator" as "admin" | "operator" | "viewer",
}));

const apiState = vi.hoisted(() => ({
  getWorkerRuntime: vi.fn(),
}));
const scrollIntoView = vi.fn();

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getWorkerRuntime: apiState.getWorkerRuntime,
    },
  };
});

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    logout: authState.logout,
    user: {
      id: 1,
      email: "operator@example.com",
      displayName: "操作员",
      role: authState.role,
    },
  }),
}));

describe("应用外壳退出", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    scrollIntoView.mockClear();
    authState.logout.mockReset();
    authState.role = "operator";
    apiState.getWorkerRuntime.mockReset();
    apiState.getWorkerRuntime.mockResolvedValue({
      availability: "online",
      capacityStatus: "ready",
      configuredWorkerCount: 1,
      onlineWorkerCount: 1,
      busyWorkerCount: 0,
      idleWorkerCount: 1,
      staleWorkerCount: 0,
      heartbeatAt: "2026-09-12T08:30:00Z",
      currentJobId: null,
      queueDepth: 0,
      oldestQueuedAt: null,
      pollIntervalSeconds: 3,
      offlineAfterSeconds: 90,
    });
    sessionStorage.clear();
  });

  it("在其他页面按实时状态显示全局 Worker 异常提示", async () => {
    apiState.getWorkerRuntime.mockResolvedValueOnce({
      availability: "offline",
      capacityStatus: "offline",
      configuredWorkerCount: 1,
      onlineWorkerCount: 0,
      busyWorkerCount: 0,
      idleWorkerCount: 0,
      staleWorkerCount: 0,
      heartbeatAt: "2026-09-12T08:20:00Z",
      currentJobId: null,
      queueDepth: 2,
      oldestQueuedAt: "2026-09-12T08:21:00Z",
      pollIntervalSeconds: 3,
      offlineAfterSeconds: 90,
    });
    render(
      <MemoryRouter initialEntries={["/accounts"]}>
        <AppShell>
          <p>任务内容</p>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByText("SEEKWAY 数据接入中心")).toBeInTheDocument();
    expect(document.querySelector(".brand-mark--image")).toHaveAttribute("src", "/favicon.svg");
    expect(await screen.findByRole("status")).toHaveTextContent("任务执行服务离线");
    expect(screen.getByRole("link", { name: "查看执行服务" })).toHaveAttribute(
      "href",
      "/jobs#worker-status",
    );
  });

  it("旧离线缓存不会覆盖实时在线状态", async () => {
    sessionStorage.setItem(
      "dashboard-runtime-status",
      JSON.stringify({
        queuedJobs: 2,
        runningJobs: 0,
        failedJobs: 0,
        failedRequests: 0,
        worker: { availability: "offline" },
      }),
    );
    render(
      <MemoryRouter initialEntries={["/accounts"]}>
        <AppShell>
          <p>任务内容</p>
        </AppShell>
      </MemoryRouter>,
    );

    await waitFor(() => expect(apiState.getWorkerRuntime).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "查看执行服务" })).not.toBeInTheDocument();
  });

  it("实时状态请求失败时不把未知状态误报为离线", async () => {
    sessionStorage.setItem(
      "dashboard-runtime-status",
      JSON.stringify({ worker: { availability: "offline" } }),
    );
    apiState.getWorkerRuntime.mockRejectedValueOnce(new Error("temporary unavailable"));
    render(
      <MemoryRouter initialEntries={["/accounts"]}>
        <AppShell>
          <p>任务内容</p>
        </AppShell>
      </MemoryRouter>,
    );

    await waitFor(() => expect(apiState.getWorkerRuntime).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "查看执行服务" })).not.toBeInTheDocument();
  });

  it("页面切换时立即刷新并移除已经恢复的离线提示", async () => {
    apiState.getWorkerRuntime.mockResolvedValueOnce({
      availability: "offline",
      capacityStatus: "offline",
      configuredWorkerCount: 1,
      onlineWorkerCount: 0,
      busyWorkerCount: 0,
      idleWorkerCount: 0,
      staleWorkerCount: 0,
      heartbeatAt: "2026-09-12T08:20:00Z",
      currentJobId: null,
      queueDepth: 0,
      oldestQueuedAt: null,
      pollIntervalSeconds: 3,
      offlineAfterSeconds: 90,
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/raw-data"]}>
        <AppShell>
          <p>任务内容</p>
        </AppShell>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("status")).toHaveTextContent("任务执行服务离线");
    await user.click(screen.getByRole("link", { name: "接入管理" }));

    await waitFor(() => expect(apiState.getWorkerRuntime).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("同步任务区域不重复显示全局 Worker 异常提示", async () => {
    apiState.getWorkerRuntime.mockResolvedValueOnce({
      availability: "offline",
      capacityStatus: "offline",
      configuredWorkerCount: 1,
      onlineWorkerCount: 0,
      busyWorkerCount: 0,
      idleWorkerCount: 0,
      staleWorkerCount: 0,
      heartbeatAt: "2026-09-12T08:20:00Z",
      currentJobId: null,
      queueDepth: 2,
      oldestQueuedAt: "2026-09-12T08:21:00Z",
      pollIntervalSeconds: 3,
      offlineAfterSeconds: 90,
    });
    render(
      <MemoryRouter initialEntries={["/jobs/tasks/task_1"]}>
        <AppShell>
          <p>任务内容</p>
        </AppShell>
      </MemoryRouter>,
    );

    await waitFor(() => expect(apiState.getWorkerRuntime).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "查看执行服务" })).not.toBeInTheDocument();
  });

  it("合并一级导航并将运行记录软合并到同步任务", () => {
    render(
      <MemoryRouter initialEntries={["/runs"]}>
        <AppShell>
          <p>运行内容</p>
        </AppShell>
      </MemoryRouter>,
    );

    const mainNav = screen.getByRole("navigation", { name: "主导航" });
    expect(within(mainNav).getByRole("link", { name: "接入管理" })).toBeInTheDocument();
    expect(within(mainNav).getByRole("link", { name: "同步任务" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(mainNav).getByRole("link", { name: "数据中心" })).toBeInTheDocument();
    expect(within(mainNav).queryByRole("link", { name: "运行" })).not.toBeInTheDocument();

    expect(screen.getByRole("navigation", { name: "同步任务导航" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "任务列表" })).toHaveAttribute("href", "/jobs");
    expect(screen.getByRole("link", { name: "定时计划" })).toHaveAttribute("href", "/jobs/plans");
  });

  it("在接入管理下提供接口中心入口", () => {
    render(
      <MemoryRouter initialEntries={["/api-catalog"]}>
        <AppShell>
          <p>接口内容</p>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "接入管理" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("navigation", { name: "接入管理导航" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "接口中心" })).toHaveAttribute("aria-current", "page");
  });

  it("通过账号菜单收纳安全入口和退出操作", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/account/security"]}>
        <AppShell>
          <p>账号安全内容</p>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link", { name: "账号安全" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "打开操作员的账号菜单" }));
    expect(await screen.findByRole("menuitem", { name: "账号安全" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "退出登录" })).toBeInTheDocument();
  });

  it("按权限展示数据中心和系统设置的二级入口", () => {
    authState.role = "admin";
    const { unmount } = render(
      <MemoryRouter initialEntries={["/audit"]}>
        <AppShell>
          <p>审计内容</p>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "系统设置" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("navigation", { name: "系统设置导航" })).toBeInTheDocument();

    unmount();
    authState.role = "viewer";
    render(
      <MemoryRouter initialEntries={["/raw-data"]}>
        <AppShell>
          <p>原始数据</p>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link", { name: "系统设置" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "数据中心导航" })).not.toBeInTheDocument();
  });

  it("为运营人员展示全部数据解析入口", () => {
    render(
      <MemoryRouter initialEntries={["/data/stores"]}>
        <AppShell>
          <p>店铺数据</p>
        </AppShell>
      </MemoryRouter>,
    );

    const navigation = screen.getByRole("navigation", { name: "数据中心导航" });
    expect(within(navigation).getByRole("link", { name: "退货订单" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "店铺" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(navigation).getByRole("link", { name: "产品" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "FBA 库存" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "FBA 仓库" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "原始数据" })).toBeInTheDocument();
  });

  it("将当前一级和二级导航项保持在横向可视区", async () => {
    render(
      <MemoryRouter initialEntries={["/raw-data"]}>
        <AppShell>
          <p>原始数据</p>
        </AppShell>
      </MemoryRouter>,
    );

    const mainNavigation = screen.getByRole("navigation", { name: "主导航" });
    const sectionNavigation = screen.getByRole("navigation", { name: "数据中心导航" });
    const mainCurrent = within(mainNavigation).getByRole("link", { name: "数据中心" });
    const sectionCurrent = within(sectionNavigation).getByRole("link", { name: "原始数据" });

    await waitFor(() => {
      expect(scrollIntoView.mock.instances).toEqual(
        expect.arrayContaining([mainCurrent, sectionCurrent]),
      );
    });
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "center" });
  });

  it("退出失败显示可重试错误并恢复按钮，重试成功后进入登录页", async () => {
    authState.logout
      .mockRejectedValueOnce(new ApiError("退出服务暂时不可用", 502, "BAD_GATEWAY"))
      .mockResolvedValueOnce();
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/private"]}>
        <Routes>
          <Route
            path="/private"
            element={
              <AppShell>
                <p>受保护内容</p>
              </AppShell>
            }
          />
          <Route path="/login" element={<p>登录页</p>} />
        </Routes>
      </MemoryRouter>,
    );

    const accountMenuTrigger = screen.getByRole("button", { name: "打开操作员的账号菜单" });
    await user.click(accountMenuTrigger);
    await user.click(await screen.findByRole("menuitem", { name: "退出登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("退出服务暂时不可用");
    expect(accountMenuTrigger).toBeEnabled();
    expect(screen.getByText("受保护内容")).toBeInTheDocument();

    await user.click(accountMenuTrigger);
    await user.click(await screen.findByRole("menuitem", { name: "退出登录" }));

    expect(await screen.findByText("登录页")).toBeInTheDocument();
    expect(authState.logout).toHaveBeenCalledTimes(2);
  });
});
