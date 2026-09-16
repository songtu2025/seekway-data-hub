import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./api/client";
import { App } from "./App";

const authState = vi.hoisted(() => ({
  role: "viewer" as "admin" | "operator" | "viewer",
  ready: true,
  sessionUnavailable: false,
  retrySession: vi.fn(),
}));

vi.mock("./auth/AuthContext", () => ({
  useAuth: () => ({
    ready: authState.ready,
    sessionUnavailable: authState.sessionUnavailable,
    retrySession: authState.retrySession,
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
vi.mock("./api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api/client")>();
  return {
    ...original,
    api: {
      ...original.api,
      getApiCatalog: vi.fn(),
      getAccount: vi.fn(),
      getDashboard: vi.fn(),
      listAccounts: vi.fn(),
      listAuditLogs: vi.fn(),
      listPolicies: vi.fn(),
      listScheduledPlans: vi.fn(),
    },
  };
});

function CurrentLocation() {
  const location = useLocation();
  return (
    <output data-testid="route">
      {location.pathname}
      {location.search}
      {location.hash}
    </output>
  );
}

describe("M3 路由权限", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = "viewer";
    authState.ready = true;
    authState.sessionUnavailable = false;
    vi.mocked(api.getDashboard).mockResolvedValue({
      queuedJobs: 0,
      runningJobs: 0,
      failedJobs: 0,
      failedRequests: 0,
      latestRun: null,
      historyProgress: null,
    });
    vi.mocked(api.listAccounts).mockResolvedValue([]);
    vi.mocked(api.listScheduledPlans).mockResolvedValue([]);
    vi.mocked(api.getApiCatalog).mockResolvedValue([
      {
        apiCode: "sale_return_order_page",
        name: "销售退货单",
        method: "POST",
        path: "/sale/return/page",
        domain: "销售",
        catalogEnabled: true,
        supportsDateWindow: true,
      },
    ]);
    vi.mocked(api.listPolicies).mockResolvedValue([
      {
        id: 4,
        accountId: 8,
        apiCode: "sale_return_order_page",
        name: "销售退货单",
        method: "POST",
        path: "/sale/return/page",
        domain: "销售",
        catalogEnabled: true,
        supportsDateWindow: true,
        enabled: true,
        scheduleMode: "manual_only",
        scheduleExpr: null,
        timezone: "Asia/Shanghai",
        windowMode: "checkpoint",
        lookbackDays: null,
        startDate: null,
        nextRunAt: null,
      },
    ]);
    vi.mocked(api.getAccount).mockResolvedValue({
      id: 8,
      accountCode: "acct_demo",
      name: "路由测试账号",
      maskedAppId: "•••• demo",
      credentialSource: "encrypted",
      status: "active",
      lastVerifiedAt: "2026-08-26T02:42:00",
      lastVerifyError: null,
      createdAt: "2026-08-26T02:00:00",
      updatedAt: "2026-08-26T02:42:00",
      enabledPolicyCount: 1,
      scheduledPolicyCount: 0,
      latestJobStatus: null,
      latestJobAt: null,
      latestDataAt: null,
    });
    vi.mocked(api.listAuditLogs).mockResolvedValue({ items: [] });
  });

  it("所有已登录角色从根路径进入仪表盘", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "运营收件箱" })).toBeInTheDocument();
  });

  it("Operator 访问审计页时显示权限提示", async () => {
    authState.role = "operator";
    render(
      <MemoryRouter initialEntries={["/audit"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "无权访问此页面" })).toBeInTheDocument();
    expect(api.listAuditLogs).not.toHaveBeenCalled();
  });

  it("Admin 可以访问审计页", async () => {
    authState.role = "admin";
    render(
      <MemoryRouter initialEntries={["/audit"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "审计日志" })).toBeInTheDocument();
    expect(api.listAuditLogs).toHaveBeenCalled();
  });

  it("初始化会话失败时显示服务不可用并允许重试", async () => {
    authState.sessionUnavailable = true;
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText("服务暂时不可用")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重试" }));

    expect(authState.retrySession).toHaveBeenCalledTimes(1);
    expect(api.getDashboard).not.toHaveBeenCalled();
  });

  it("恢复登录状态时显示不包含业务数据的应用骨架", () => {
    authState.ready = false;

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText("SEEKWAY 数据接入中心")).toBeInTheDocument();
    expect(screen.getByText("正在恢复登录状态…")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "运营收件箱" })).not.toBeInTheDocument();
    expect(api.getDashboard).not.toHaveBeenCalled();
  });

  it("所有已登录角色都可以进入账号工作台", async () => {
    render(
      <MemoryRouter initialEntries={["/accounts/8"]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "路由测试账号" })).toBeInTheDocument();
    expect(api.getAccount).toHaveBeenCalledWith(8);
  });

  it("Viewer 不能访问创建同步任务页", async () => {
    render(
      <MemoryRouter initialEntries={["/jobs/new"]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "无权访问此页面" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "同步任务" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("heading", { name: "创建同步任务" })).not.toBeInTheDocument();
  });

  it("旧计划锚点迁移独立列表并仅保留适用条件", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          "/jobs?account=8&accountId=9&api=orders&apiCode=old&status=failed#scheduled-plans",
        ]}
      >
        <App />
        <CurrentLocation />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "定时计划" });
    expect(screen.getByTestId("route")).toHaveTextContent("/jobs/plans?account=8&api=orders");
    expect(screen.getByTestId("route").textContent).not.toContain("failed");
  });

  it("Viewer访问受限数据页仍归属数据中心", async () => {
    render(
      <MemoryRouter initialEntries={["/data/stores"]}>
        <App />
        <CurrentLocation />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "无权访问此页面" });
    expect(screen.getByTestId("route")).toHaveTextContent("/data/stores");
    expect(screen.getByRole("link", { name: "数据中心" })).toHaveAttribute("aria-current", "page");
  });

  it("旧发起链接跳转到新页面并保留账号与接口上下文", async () => {
    authState.role = "operator";
    vi.mocked(api.listAccounts).mockResolvedValue([
      {
        id: 8,
        accountCode: "acct_demo",
        name: "路由测试账号",
        maskedAppId: "•••• demo",
        credentialSource: "encrypted",
        status: "active",
        lastVerifiedAt: "2026-08-26T02:42:00",
        lastVerifyError: null,
        createdAt: "2026-08-26T02:00:00",
        updatedAt: "2026-08-26T02:42:00",
      },
    ]);
    render(
      <MemoryRouter initialEntries={["/jobs?run=1&accountId=8&apiCode=sale_return_order_page"]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "创建同步任务" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("积加账号").closest(".ant-select")).toHaveTextContent(
        "路由测试账号",
      ),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("已启用接口").closest(".ant-select")).toHaveTextContent(
        "sale_return_order_page",
      ),
    );
  });
});
