import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api, ApiError } from "../api/client";
import type { JijiaAccount } from "../api/types";
import { AccountWorkspacePage } from "./AccountWorkspacePage";

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
      deactivateAccount: vi.fn(),
      getAccount: vi.fn(),
      updateAccount: vi.fn(),
      verifyAccount: vi.fn(),
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

function WorkspaceNavigationHarness() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate("/accounts/9")}>
        切换账号
      </button>
      <Routes>
        <Route path="/accounts/:accountId" element={<AccountWorkspacePage />} />
      </Routes>
    </>
  );
}

function renderWorkspace(state?: { accountError?: string }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/accounts/8", state }]}>
      <Routes>
        <Route path="/accounts/:accountId" element={<AccountWorkspacePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("接入管理账号工作台", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = "operator";
    vi.mocked(api.getAccount).mockResolvedValue(account);
    vi.mocked(api.updateAccount).mockResolvedValue(account);
    vi.mocked(api.verifyAccount).mockResolvedValue(account);
    vi.mocked(api.deactivateAccount).mockResolvedValue({ ...account, status: "inactive" });
  });

  it("集中展示账号配置，并只突出当前主要操作", async () => {
    renderWorkspace();

    expect(await screen.findByRole("heading", { name: "北美业务账号" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "配置同步范围" })).toHaveAttribute(
      "href",
      "/accounts/8/policies",
    );
    expect(screen.getByRole("link", { name: "创建定时计划 →" })).toHaveAttribute(
      "href",
      "/jobs/plans/new?accountId=8",
    );
    expect(screen.getByRole("heading", { name: "账号配置" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "最近运行" })).toBeInTheDocument();
    expect(screen.queryByText(/\/ 5/)).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "账号管理导航" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /查看同步任务/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /查看账号数据/ })).not.toBeInTheDocument();
  });

  it("首载失败后可在当前页面重新加载账号详情", async () => {
    vi.mocked(api.getAccount)
      .mockRejectedValueOnce(new Error("暂时不可用"))
      .mockResolvedValueOnce(account);
    const user = userEvent.setup();
    renderWorkspace();

    expect(await screen.findByRole("alert")).toHaveTextContent("账号概览加载失败");
    expect(screen.queryByRole("heading", { name: "北美业务账号" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重新加载" }));

    expect(await screen.findByRole("heading", { name: "北美业务账号" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(api.getAccount).toHaveBeenCalledTimes(2);
  });

  it("手动刷新保留账号上下文、阻止重复请求且失败显示 warning", async () => {
    const refresh = deferred<JijiaAccount>();
    vi.mocked(api.getAccount).mockResolvedValueOnce(account).mockReturnValueOnce(refresh.promise);
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByRole("heading", { name: "北美业务账号" });

    await user.dblClick(screen.getByRole("button", { name: "刷新账号概览" }));
    await waitFor(() => expect(api.getAccount).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("heading", { name: "北美业务账号" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "配置同步范围" })).toBeInTheDocument();
    expect(screen.getByText(/正在刷新 · 上次检查/)).toBeVisible();

    await act(async () => {
      refresh.reject(new Error("offline"));
      await refresh.promise.catch(() => undefined);
    });
    expect(screen.getByRole("alert")).toHaveClass("ant-alert-warning");
    expect(screen.getByRole("heading", { name: "北美业务账号" })).toBeInTheDocument();
    expect(screen.getByText(/刷新失败 · 仍显示 .* 的结果/)).toBeVisible();
  });

  it("切换账号后忽略上一账号延迟返回的结果", async () => {
    const oldAccount = deferred<JijiaAccount>();
    const nextAccount = deferred<JijiaAccount>();
    vi.mocked(api.getAccount).mockImplementation((accountId) =>
      accountId === 8 ? oldAccount.promise : nextAccount.promise,
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/accounts/8"]}>
        <WorkspaceNavigationHarness />
      </MemoryRouter>,
    );

    await waitFor(() => expect(api.getAccount).toHaveBeenCalledWith(8));
    await user.click(screen.getByRole("button", { name: "切换账号" }));
    await act(async () => {
      nextAccount.resolve({ ...account, id: 9, name: "欧洲业务账号" });
      await nextAccount.promise;
    });
    expect(await screen.findByRole("heading", { name: "欧洲业务账号" })).toBeInTheDocument();

    await act(async () => {
      oldAccount.resolve(account);
      await oldAccount.promise;
    });
    expect(screen.queryByRole("heading", { name: "北美业务账号" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "欧洲业务账号" })).toBeInTheDocument();
  });

  it("切换账号后旧账号操作完成不能污染新账号状态", async () => {
    const oldMutation = deferred<JijiaAccount>();
    vi.mocked(api.getAccount).mockImplementation(async (accountId) =>
      accountId === 8 ? account : { ...account, id: 9, name: "欧洲业务账号" },
    );
    vi.mocked(api.deactivateAccount).mockReturnValue(oldMutation.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/accounts/8"]}>
        <WorkspaceNavigationHarness />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "停用账号" }));
    await user.click(screen.getByRole("button", { name: "切换账号" }));
    expect(await screen.findByRole("heading", { name: "欧洲业务账号" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停用账号" })).toBeEnabled();

    await act(async () => {
      oldMutation.resolve({ ...account, status: "inactive" });
      await oldMutation.promise;
    });

    expect(screen.queryByText("账号已停用。")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "欧洲业务账号" })).toBeInTheDocument();
    expect(api.getAccount).not.toHaveBeenCalledTimes(3);
  });

  it("Viewer 只能查看脱敏信息，不能修改账号", async () => {
    authState.role = "viewer";
    renderWorkspace();

    await screen.findByRole("heading", { name: "北美业务账号" });
    expect(screen.getByText("只读查看")).toBeInTheDocument();
    expect(screen.getByText("凭证已脱敏")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑凭证" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "停用账号" })).not.toBeInTheDocument();
  });

  it("只有存在运行和数据记录时才展示对应入口", async () => {
    vi.mocked(api.getAccount).mockResolvedValue({
      ...account,
      enabledPolicyCount: 2,
      latestJobStatus: "success",
      latestJobAt: "2026-08-27T03:00:00",
      latestDataAt: "2026-08-27T03:05:00",
    });
    renderWorkspace();

    expect(await screen.findByRole("link", { name: /查看同步任务/ })).toHaveAttribute(
      "href",
      "/jobs?account=8",
    );
    expect(screen.getByRole("link", { name: /查看账号数据/ })).toHaveAttribute(
      "href",
      "/raw-data?jijiaAccountId=8",
    );
  });

  it("凭据更新失败时保留弹窗和输入", async () => {
    vi.mocked(api.updateAccount).mockRejectedValue(
      new ApiError("凭据更新失败", 400, "ACCOUNT_UPDATE_FAILED"),
    );
    const user = userEvent.setup();
    renderWorkspace();

    await screen.findByRole("heading", { name: "北美业务账号" });
    await user.click(screen.getByRole("button", { name: "编辑凭证" }));
    await user.type(screen.getByLabelText("新 appId"), "replacement-app");
    await user.type(screen.getByLabelText("新 appKey"), "replacement-key");
    await user.click(screen.getByRole("button", { name: "保存修改" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("凭据更新失败");
    expect(screen.getByRole("heading", { name: "编辑账号凭证" })).toBeInTheDocument();
    expect(screen.getByLabelText("新 appId")).toHaveValue("replacement-app");
    expect(screen.getByLabelText("新 appKey")).toHaveValue("replacement-key");
  });

  it("重新验证失败后刷新服务端状态并保留失败原因", async () => {
    const failedAccount: JijiaAccount = {
      ...account,
      status: "verification_failed",
      lastVerifyError: "积加账号验证失败",
    };
    vi.mocked(api.getAccount)
      .mockResolvedValueOnce(failedAccount)
      .mockResolvedValueOnce(failedAccount);
    vi.mocked(api.verifyAccount).mockRejectedValue(
      new ApiError("积加账号验证失败", 400, "ACCOUNT_CREDENTIAL_INVALID"),
    );
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(await screen.findByRole("button", { name: "重新验证" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("积加账号验证失败");
    expect(api.getAccount).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText("连接异常").length).toBeGreaterThan(0);
  });

  it("从接入向导进入时展示账号级失败信息", async () => {
    renderWorkspace({ accountError: "账号已创建，但连接验证失败。" });

    expect(await screen.findByRole("alert")).toHaveTextContent("账号已创建，但连接验证失败。");
  });
});
