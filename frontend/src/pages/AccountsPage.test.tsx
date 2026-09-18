import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/client";
import type { JijiaAccount } from "../api/types";
import { AccountsPage } from "./AccountsPage";

const authState = vi.hoisted(() => ({
  role: "viewer" as "admin" | "operator" | "viewer",
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    csrfToken: "csrf-token",
    user: { id: 3, email: "viewer@example.com", displayName: "查看者", role: authState.role },
    logout: vi.fn(),
  }),
}));
vi.mock("../api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api/client")>();
  return {
    ...original,
    api: {
      ...original.api,
      listAccounts: vi.fn(),
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
  enabledPolicyCount: 0,
  scheduledPolicyCount: 0,
  latestJobStatus: null,
  latestJobAt: null,
  latestDataAt: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function AccountsNavigationHarness() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate("/accounts?filter=attention")}>
        显示需处理 URL
      </button>
      <button type="button" onClick={() => navigate(-1)}>
        返回上一 URL
      </button>
      <AccountsPage />
    </>
  );
}

describe("接入管理账号列表", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = "viewer";
    vi.mocked(api.listAccounts).mockResolvedValue([account]);
  });

  it("Viewer 可查看脱敏账号和接入状态，但没有接入入口", async () => {
    render(
      <MemoryRouter>
        <AccountsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "接入管理" })).toBeInTheDocument();
    expect(screen.getByText("appId · •••• 8J2K")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /接入新账号/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /北美业务账号/ })).toHaveAttribute(
      "href",
      "/accounts/8",
    );
    expect(screen.getByRole("link", { name: /查看账号/ })).toHaveAttribute("href", "/accounts/8");
    expect(screen.getByRole("button", { name: "全部 1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("只读权限")).not.toBeInTheDocument();
    const row = screen.getByText("北美业务账号").closest(".account-overview-row");
    expect(row?.querySelectorAll("[data-label]")).toHaveLength(5);
    expect(row?.querySelector('[data-label="同步范围"]')).toHaveTextContent("0 个接口");
    expect(row?.querySelector('[data-label="最近同步"]')).toHaveTextContent("暂无记录");
  });

  it("Operator 能看到账号真实的下一步操作", async () => {
    authState.role = "operator";
    render(
      <MemoryRouter>
        <AccountsPage />
      </MemoryRouter>,
    );

    await screen.findByText("北美业务账号");
    expect(screen.queryByText("可管理账号")).not.toBeInTheDocument();
    expect(screen.getByText("待配置")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /配置同步范围/ })).toHaveAttribute(
      "href",
      "/accounts/8/policies",
    );
  });

  it("状态筛选只保留需要处理的账号", async () => {
    vi.mocked(api.listAccounts).mockResolvedValue([
      { ...account, enabledPolicyCount: 1 },
      {
        ...account,
        id: 9,
        name: "待修复账号",
        status: "verification_failed",
        lastVerifyError: "积加账号验证失败",
      },
    ]);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AccountsPage />
      </MemoryRouter>,
    );

    await screen.findByText("待修复账号");
    await user.click(screen.getByRole("button", { name: "需处理 1" }));

    expect(screen.queryByText("北美业务账号")).not.toBeInTheDocument();
    expect(screen.getByText("待修复账号")).toBeInTheDocument();
  });

  it("同路由查询参数变化和后退时按 URL 恢复筛选", async () => {
    vi.mocked(api.listAccounts).mockResolvedValue([
      { ...account, enabledPolicyCount: 1 },
      {
        ...account,
        id: 9,
        name: "待修复账号",
        status: "verification_failed",
        lastVerifyError: "积加账号验证失败",
      },
    ]);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/accounts"]}>
        <AccountsNavigationHarness />
      </MemoryRouter>,
    );

    await screen.findByText("待修复账号");
    await user.type(screen.getByRole("searchbox", { name: "搜索账号" }), "北美");
    expect(screen.queryByText("待修复账号")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "显示需处理 URL" }));

    expect(screen.getByRole("button", { name: "需处理 1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByText("北美业务账号")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "返回上一 URL" }));

    expect(screen.getByRole("button", { name: "全部 2" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("北美业务账号")).toBeInTheDocument();
    expect(screen.queryByText("待修复账号")).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "搜索账号" })).toHaveValue("北美");
  });

  it("加载失败只展示错误并可原位重试", async () => {
    vi.mocked(api.listAccounts)
      .mockRejectedValueOnce(new Error("失败"))
      .mockResolvedValueOnce([account]);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AccountsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("账号数据加载失败")).toBeInTheDocument();
    expect(screen.queryByText("尚未接入积加账号")).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "重试加载" }));
    expect(await screen.findByText("北美业务账号")).toBeInTheDocument();
    expect(api.listAccounts).toHaveBeenCalledTimes(2);
  });

  it("手动刷新保留账号与筛选、阻止重复请求，失败后显示旧结果", async () => {
    const refresh = deferred<JijiaAccount[]>();
    vi.mocked(api.listAccounts)
      .mockResolvedValueOnce([account])
      .mockReturnValueOnce(refresh.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/accounts?q=北美"]}>
        <AccountsPage />
      </MemoryRouter>,
    );

    await screen.findByText("北美业务账号");
    await user.dblClick(screen.getByRole("button", { name: "刷新账号" }));
    await waitFor(() => expect(api.listAccounts).toHaveBeenCalledTimes(2));
    expect(screen.getByText("北美业务账号")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "搜索账号" })).toHaveValue("北美");
    expect(screen.getByText(/正在刷新 · 上次检查/)).toBeVisible();

    await act(async () => refresh.reject(new Error("刷新失败")));
    expect(screen.getByText("北美业务账号")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("账号数据加载失败");
    expect(screen.getByRole("alert")).toHaveClass("ant-alert-warning");
    expect(screen.getByText(/刷新失败 · 仍显示 .* 的结果/)).toBeVisible();
  });
});
