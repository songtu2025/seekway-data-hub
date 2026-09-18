import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, api } from "../api/client";
import type { Invitation, User } from "../api/types";
import stylesSource from "../styles.css?raw";
import { getInvitationStatus, MembersPage } from "./MembersPage";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    csrfToken: "csrf-token",
    user: { id: 1, email: "admin@example.com", displayName: "管理员", role: "admin" },
    logout: vi.fn(),
  }),
}));

vi.mock("../api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api/client")>();
  return {
    ...original,
    api: {
      ...original.api,
      listUsers: vi.fn(),
      listInvitations: vi.fn(),
      createInvitation: vi.fn(),
      resendInvitation: vi.fn(),
      revokeInvitation: vi.fn(),
      updateUser: vi.fn(),
    },
  };
});

describe("成员与权限页", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.listUsers).mockResolvedValue([
      { id: 1, email: "admin@example.com", displayName: "管理员", role: "admin", status: "active" },
    ]);
    vi.mocked(api.listInvitations).mockResolvedValue([]);
    vi.mocked(api.createInvitation).mockResolvedValue({
      id: 2,
      email: "viewer@example.com",
      role: "viewer",
      expiresAt: "2026-08-27T00:00:00",
      usedAt: null,
      revokedAt: null,
    });
    vi.mocked(api.resendInvitation).mockResolvedValue({
      id: 3,
      email: "viewer@example.com",
      role: "viewer",
      expiresAt: "2026-08-28T00:00:00",
      usedAt: null,
      revokedAt: null,
    });
    vi.mocked(api.revokeInvitation).mockResolvedValue({
      id: 3,
      email: "viewer@example.com",
      role: "viewer",
      expiresAt: futureDate(48),
      usedAt: null,
      revokedAt: new Date().toISOString(),
    });
    vi.mocked(api.updateUser).mockResolvedValue({
      id: 2,
      email: "operator@example.com",
      displayName: "操作员",
      role: "viewer",
      status: "active",
    });
  });

  it("用户成功而邀请失败时仍展示成员并分别报告错误", async () => {
    vi.mocked(api.listUsers).mockResolvedValueOnce([
      {
        id: 2,
        email: "operator@example.com",
        displayName: "操作员",
        role: "operator",
        status: "active",
      },
    ]);
    vi.mocked(api.listInvitations).mockRejectedValueOnce(
      new ApiError("邀请列表暂不可用", 503, "SERVICE_UNAVAILABLE"),
    );

    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );

    expect((await screen.findAllByText("operator@example.com")).length).toBeGreaterThan(0);
    expect(screen.getByRole("alert")).toHaveTextContent("邀请列表暂不可用");
  });

  it("快速输入成员搜索词时保持准确内容并同步查询参数", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/members"]}>
        <MembersPage />
        <MembersLocationProbe />
      </MemoryRouter>,
    );
    await screen.findAllByText("admin@example.com");

    const searchInput = screen.getByRole("searchbox", { name: "搜索成员" });
    await user.type(searchInput, "zz");

    expect(searchInput).toHaveValue("zz");
    await waitFor(() =>
      expect(
        new URLSearchParams(screen.getByTestId("members-location").textContent ?? "").get("q"),
      ).toBe("zz"),
    );
    expect(searchInput).toHaveValue("zz");
  });

  it("手动刷新保留搜索、当前成员和旧列表，并阻止重复请求与写操作", async () => {
    const usersRefresh = deferred<User[]>();
    const invitationsRefresh = deferred<Invitation[]>();
    vi.mocked(api.listUsers)
      .mockResolvedValueOnce(memberRows())
      .mockReturnValueOnce(usersRefresh.promise);
    vi.mocked(api.listInvitations)
      .mockResolvedValueOnce([pendingInvitation()])
      .mockReturnValueOnce(invitationsRefresh.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/members?q=operator&member=2"]}>
        <MembersPage />
      </MemoryRouter>,
    );
    await screen.findByText(/上次检查 \d{2}:\d{2}:\d{2}/);

    await user.dblClick(screen.getByRole("button", { name: "刷新成员与邀请" }));

    expect(api.listUsers).toHaveBeenCalledTimes(2);
    expect(api.listInvitations).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/正在刷新 · 上次检查/)).toBeVisible();
    expect(screen.getByRole("searchbox", { name: "搜索成员" })).toHaveValue("operator");
    expect(screen.getAllByText("operator@example.com").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "刷新成员与邀请" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /邀请成员/ })).toBeDisabled();
    expect(screen.getByLabelText("当前角色")).toBeDisabled();
    expect(screen.getByRole("button", { name: "停用成员" })).toBeDisabled();

    await act(async () => {
      usersRefresh.resolve(memberRows());
      invitationsRefresh.resolve([pendingInvitation()]);
      await Promise.all([usersRefresh.promise, invitationsRefresh.promise]);
    });
    expect(screen.getByRole("button", { name: "刷新成员与邀请" })).toBeEnabled();
    expect(screen.getByRole("searchbox", { name: "搜索成员" })).toHaveValue("operator");
  });

  it("刷新局部失败时采用成功结果、保留失败数据并重新选择可用成员", async () => {
    vi.mocked(api.listUsers)
      .mockResolvedValueOnce(memberRows())
      .mockResolvedValueOnce([memberRows()[0]]);
    vi.mocked(api.listInvitations)
      .mockResolvedValueOnce([pendingInvitation()])
      .mockRejectedValueOnce(new ApiError("邀请列表暂不可用", 503, "SERVICE_UNAVAILABLE"));
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/members?member=2"]}>
        <MembersPage />
      </MemoryRouter>,
    );
    await screen.findByText(/上次检查 \d{2}:\d{2}:\d{2}/);

    await user.click(screen.getByRole("button", { name: "刷新成员与邀请" }));

    expect(await screen.findByText(/刷新失败 · 仍显示/)).toBeVisible();
    expect(screen.queryByText("operator@example.com")).not.toBeInTheDocument();
    expect(screen.getByLabelText("当前角色")).toBeDisabled();
    expect(screen.getByText("邀请列表暂不可用").closest(".ant-alert")).toHaveClass(
      "ant-alert-warning",
    );
    await user.click(screen.getByRole("button", { name: "邀请 1" }));
    expect(screen.getAllByText("viewer@example.com").length).toBeGreaterThan(0);
  });

  it("管理员可按固定角色发送邀请", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );
    expect((await screen.findAllByText("admin@example.com")).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /邀请成员/ }));
    expect(
      screen.getByText("将向该邮箱发送一次性注册链接；过期后可重新发送。"),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("邮箱"), "viewer@example.com");
    await user.click(screen.getByLabelText("角色"));
    const inviteRoleOption = await waitFor(() => {
      const option = screen
        .getAllByRole("option", { name: "只读成员" })
        .find((candidate) => candidate.tagName !== "OPTION");
      if (!option) throw new Error("邀请角色选项尚未打开");
      return option;
    });
    await user.click(inviteRoleOption);
    expect(screen.getByText(/只读成员：查看获授权的只读数据/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "发送邀请" }));

    expect(api.createInvitation).toHaveBeenCalledWith("viewer@example.com", "viewer", "csrf-token");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("邀请已发送");
  });

  it("不手动选择角色时默认按操作员发送邀请", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );
    await screen.findAllByText("admin@example.com");

    await user.click(screen.getByRole("button", { name: /邀请成员/ }));
    const dialog = screen.getByRole("dialog", { name: "邀请成员" });
    await waitFor(() => {
      expect(dialog.querySelector(".invite-member-form .ant-select-content")).toHaveTextContent(
        "操作员",
      );
    });
    await user.type(within(dialog).getByLabelText("邮箱"), "operator@example.com");
    await user.click(within(dialog).getByRole("button", { name: "发送邀请" }));

    expect(api.createInvitation).toHaveBeenCalledWith(
      "operator@example.com",
      "operator",
      "csrf-token",
    );
  });

  it("关闭并重开邀请弹窗后恢复默认角色", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );
    await screen.findAllByText("admin@example.com");

    const trigger = screen.getByRole("button", { name: /邀请成员/ });
    await user.click(trigger);
    let dialog = screen.getByRole("dialog", { name: "邀请成员" });
    await waitFor(() => {
      expect(dialog.querySelector(".invite-member-form .ant-select-content")).toHaveTextContent(
        "操作员",
      );
    });
    await user.type(within(dialog).getByLabelText("邮箱"), "stale@example.com");
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(trigger);
    dialog = screen.getByRole("dialog", { name: "邀请成员" });
    await waitFor(() => {
      expect(dialog.querySelector(".invite-member-form .ant-select-content")).toHaveTextContent(
        "操作员",
      );
    });
    expect(within(dialog).getByLabelText("邮箱")).toHaveValue("");
  });

  it("邀请失败时保留弹窗和已填写内容", async () => {
    vi.mocked(api.createInvitation).mockRejectedValue(
      new ApiError("邮箱已存在", 409, "USER_ALREADY_EXISTS", "request-1"),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );
    await screen.findAllByText("admin@example.com");

    await user.click(screen.getByRole("button", { name: /邀请成员/ }));
    const email = screen.getByLabelText("邮箱");
    await user.type(email, "viewer@example.com");
    await user.click(screen.getByRole("button", { name: "发送邀请" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("邮箱已存在"));
    expect(screen.getByRole("dialog", { name: "邀请成员" })).toBeInTheDocument();
    expect(email).toHaveValue("viewer@example.com");
  });

  it("邀请表单校验邮箱并在关闭后恢复触发按钮焦点", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );
    await screen.findAllByText("admin@example.com");

    const trigger = screen.getByRole("button", { name: /邀请成员/ });
    await user.click(trigger);
    await waitFor(() => expect(screen.getByLabelText("邮箱")).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "发送邀请" }));

    expect(await screen.findByText("请输入邮箱地址")).toBeInTheDocument();
    expect(api.createInvitation).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("关闭并重开邀请弹窗后旧成功请求不影响新输入", async () => {
    const firstRequest = deferred<Invitation>();
    const secondRequest = deferred<Invitation>();
    vi.mocked(api.createInvitation)
      .mockImplementationOnce(() => firstRequest.promise)
      .mockImplementationOnce(() => secondRequest.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );
    await screen.findAllByText("admin@example.com");

    await user.click(screen.getByRole("button", { name: /邀请成员/ }));
    await user.type(screen.getByLabelText("邮箱"), "a@example.com");
    await user.click(screen.getByRole("button", { name: "发送邀请" }));
    await user.click(screen.getByRole("button", { name: "取消" }));
    await user.click(screen.getByRole("button", { name: /邀请成员/ }));
    const newEmail = screen.getByLabelText("邮箱");
    await user.type(newEmail, "b@example.com");
    await user.click(screen.getByRole("button", { name: "发送邀请" }));
    expect(screen.getByRole("button", { name: "发送中…" })).toBeDisabled();

    await act(async () => {
      firstRequest.resolve({
        id: 2,
        email: "a@example.com",
        role: "operator",
        expiresAt: "2026-08-27T00:00:00",
        usedAt: null,
        revokedAt: null,
      });
    });

    expect(screen.getByRole("dialog", { name: "邀请成员" })).toBeInTheDocument();
    expect(newEmail).toHaveValue("b@example.com");
    expect(screen.getByRole("button", { name: "发送中…" })).toBeDisabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(api.listUsers).toHaveBeenCalledTimes(1);

    await act(async () => {
      secondRequest.resolve({
        id: 3,
        email: "b@example.com",
        role: "operator",
        expiresAt: "2026-08-27T00:00:00",
        usedAt: null,
        revokedAt: null,
      });
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("邀请已发送");
    expect(api.listUsers).toHaveBeenCalledTimes(2);
  });

  it("关闭并重开邀请弹窗后旧失败请求不影响新输入", async () => {
    const firstRequest = deferred<Invitation>();
    const secondRequest = deferred<Invitation>();
    vi.mocked(api.createInvitation)
      .mockImplementationOnce(() => firstRequest.promise)
      .mockImplementationOnce(() => secondRequest.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );
    await screen.findAllByText("admin@example.com");

    await user.click(screen.getByRole("button", { name: /邀请成员/ }));
    await user.type(screen.getByLabelText("邮箱"), "a@example.com");
    await user.click(screen.getByRole("button", { name: "发送邀请" }));
    await user.click(screen.getByRole("button", { name: "取消" }));
    await user.click(screen.getByRole("button", { name: /邀请成员/ }));
    const newEmail = screen.getByLabelText("邮箱");
    await user.type(newEmail, "b@example.com");
    await user.click(screen.getByRole("button", { name: "发送邀请" }));
    expect(screen.getByRole("button", { name: "发送中…" })).toBeDisabled();

    await act(async () => {
      firstRequest.reject(new ApiError("旧邀请失败", 503, "SERVICE_UNAVAILABLE"));
      await firstRequest.promise.catch(() => undefined);
    });

    expect(screen.getByRole("dialog", { name: "邀请成员" })).toBeInTheDocument();
    expect(newEmail).toHaveValue("b@example.com");
    expect(screen.getByRole("button", { name: "发送中…" })).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(api.listUsers).toHaveBeenCalledTimes(1);

    await act(async () => {
      secondRequest.resolve({
        id: 3,
        email: "b@example.com",
        role: "operator",
        expiresAt: "2026-08-27T00:00:00",
        usedAt: null,
        revokedAt: null,
      });
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("邀请已发送");
    expect(api.listUsers).toHaveBeenCalledTimes(2);
  });

  it("邀请请求等待期间卸载页面后成功结果不再刷新列表", async () => {
    const createRequest = deferred<Invitation>();
    vi.mocked(api.createInvitation).mockImplementationOnce(() => createRequest.promise);
    const user = userEvent.setup();
    const { unmount } = render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );
    await screen.findAllByText("admin@example.com");

    await user.click(screen.getByRole("button", { name: /邀请成员/ }));
    await user.type(screen.getByLabelText("邮箱"), "a@example.com");
    await user.click(screen.getByRole("button", { name: "发送邀请" }));
    unmount();

    await act(async () => {
      createRequest.resolve({
        id: 2,
        email: "a@example.com",
        role: "operator",
        expiresAt: "2026-08-27T00:00:00",
        usedAt: null,
        revokedAt: null,
      });
    });

    expect(api.listUsers).toHaveBeenCalledTimes(1);
    expect(api.listInvitations).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("邀请写入成功后立即关闭弹窗，刷新失败不误报写入失败且旧首屏不能覆盖", async () => {
    const oldUsers = deferred<User[]>();
    const oldInvitations = deferred<Invitation[]>();
    const refreshUsers = deferred<User[]>();
    const refreshInvitations = deferred<Invitation[]>();
    const createRequest = deferred<Invitation>();
    vi.mocked(api.listUsers)
      .mockImplementationOnce(() => oldUsers.promise)
      .mockImplementationOnce(() => refreshUsers.promise);
    vi.mocked(api.listInvitations)
      .mockImplementationOnce(() => oldInvitations.promise)
      .mockImplementationOnce(() => refreshInvitations.promise);
    vi.mocked(api.createInvitation).mockImplementationOnce(() => createRequest.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /邀请成员/ }));
    await user.type(screen.getByLabelText("邮箱"), "viewer@example.com");
    await user.click(screen.getByRole("button", { name: "发送邀请" }));
    await act(async () => {
      createRequest.resolve({
        id: 2,
        email: "viewer@example.com",
        role: "operator",
        expiresAt: "2026-08-27T00:00:00",
        usedAt: null,
        revokedAt: null,
      });
    });

    await waitFor(() => expect(api.listUsers).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog", { name: "邀请成员" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("邀请已发送");

    await act(async () => {
      refreshUsers.resolve([
        {
          id: 1,
          email: "new@example.com",
          displayName: "新管理员",
          role: "admin",
          status: "active",
        },
      ]);
      refreshInvitations.reject(new Error("refresh failed"));
      await refreshInvitations.promise.catch(() => undefined);
    });
    await user.click(screen.getByRole("button", { name: /^成员 \d+$/ }));
    expect((await screen.findAllByText("new@example.com")).length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent("邀请已发送；操作已成功，列表刷新失败");

    await act(async () => {
      oldUsers.resolve([
        {
          id: 9,
          email: "old@example.com",
          displayName: "旧管理员",
          role: "admin",
          status: "active",
        },
      ]);
      oldInvitations.resolve([]);
    });
    expect(screen.queryByText("old@example.com")).not.toBeInTheDocument();
    expect(screen.getAllByText("new@example.com").length).toBeGreaterThan(0);
  });

  it("重发成功后刷新仍在等待时先确认成功，刷新失败只显示刷新告警", async () => {
    const invitation = pendingInvitation();
    vi.mocked(api.listUsers).mockResolvedValueOnce(memberRows());
    vi.mocked(api.listInvitations).mockResolvedValueOnce([invitation]);
    const resendRequest = deferred<Invitation>();
    const refreshUsers = deferred<User[]>();
    const refreshInvitations = deferred<Invitation[]>();
    vi.mocked(api.resendInvitation).mockImplementationOnce(() => resendRequest.promise);
    vi.mocked(api.listUsers).mockImplementationOnce(() => refreshUsers.promise);
    vi.mocked(api.listInvitations).mockImplementationOnce(() => refreshInvitations.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole("button", { name: "邀请 1" }));
    await screen.findAllByText("viewer@example.com");
    await user.click(screen.getByRole("button", { name: /viewer@example.com/ }));
    await user.click(screen.getByRole("button", { name: "重新发送" }));

    await act(async () => resendRequest.resolve({ ...invitation, id: 4 }));
    await waitFor(() => expect(api.listUsers).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("status")).toHaveTextContent("邀请已重新发送");

    await act(async () => {
      refreshUsers.resolve(memberRows());
      refreshInvitations.reject(new Error("refresh failed"));
      await refreshInvitations.promise.catch(() => undefined);
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "邀请已重新发送；操作已成功，列表刷新失败",
    );
    expect(api.resendInvitation).toHaveBeenCalledTimes(1);
  });

  it("角色更新成功后刷新仍在等待时先确认成功", async () => {
    vi.mocked(api.listUsers).mockResolvedValueOnce(memberRows());
    const updateRequest = deferred<User>();
    const refreshUsers = deferred<User[]>();
    const refreshInvitations = deferred<Invitation[]>();
    vi.mocked(api.updateUser).mockImplementationOnce(() => updateRequest.promise);
    vi.mocked(api.listUsers).mockImplementationOnce(() => refreshUsers.promise);
    vi.mocked(api.listInvitations).mockImplementationOnce(() => refreshInvitations.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );
    await screen.findAllByText("operator@example.com");
    await user.click(screen.getByRole("button", { name: /operator@example.com/ }));
    await user.click(screen.getByLabelText("当前角色"));
    await user.click(
      await screen.findByText("只读成员", { selector: ".ant-select-item-option-content" }),
    );
    await waitFor(() => {
      expect(
        screen
          .getByLabelText("当前角色")
          .closest(".ant-select")
          ?.querySelector(".ant-select-content"),
      ).toHaveTextContent("只读成员");
    });
    await user.click(screen.getByRole("button", { name: "保存角色" }));

    await act(async () => updateRequest.resolve({ ...memberRows()[1], role: "viewer" }));
    await waitFor(() => expect(api.listUsers).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("status")).toHaveTextContent("成员角色已更新");

    await act(async () => {
      refreshUsers.resolve([{ ...memberRows()[1], role: "viewer" }]);
      refreshInvitations.resolve([]);
    });
    expect(api.updateUser).toHaveBeenCalledTimes(1);
  });

  it("成员与邀请使用独立视图且小屏样式保留状态徽标", async () => {
    vi.mocked(api.listUsers).mockResolvedValueOnce(memberRows());
    vi.mocked(api.listInvitations).mockResolvedValueOnce([
      invitationFixture({ id: 10, email: "pending@example.com", expiresAt: futureDate(48) }),
      invitationFixture({ id: 11, email: "expired@example.com", expiresAt: futureDate(-2) }),
    ]);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );

    const viewGroup = await screen.findByRole("group", { name: "成员与邀请视图" });
    const [membersButton, invitationsButton] = await Promise.all([
      within(viewGroup).findByRole("button", { name: "成员 2" }),
      within(viewGroup).findByRole("button", { name: "邀请 2" }),
    ]);
    expect(membersButton).toHaveAttribute("aria-pressed", "true");
    expect(invitationsButton).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByText("viewer@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("固定角色 · 至少保留 1 名可用管理员")).not.toBeInTheDocument();
    const adminRow = screen.getByRole("button", { name: /admin@example.com/ });
    expect(within(adminRow).getByText("已启用")).toHaveClass("badge", "status-active");
    expect(screen.queryByLabelText("固定角色说明")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("邀请状态摘要")).not.toBeInTheDocument();

    await user.click(invitationsButton);
    expect(screen.getByRole("region", { name: "邀请列表与详情" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /expired@example.com，已过期/ })).toBeInTheDocument();
    expect(membersButton).toHaveAttribute("aria-pressed", "false");
    expect(invitationsButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("邀请状态按有效期与使用结果自动判断")).not.toBeInTheDocument();
    expect(screen.queryByText("接受后立即按该固定角色生效")).not.toBeInTheDocument();

    expect(stylesSource).not.toMatch(
      /\.member-row \.status-(?:active|invited|disabled)[^}]*display:\s*none/,
    );
    expect(stylesSource).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.member-row,\s*\.invitation-row\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/,
    );
  });

  it("邀请状态只显示合法操作并为过期时间使用过去式", async () => {
    const invitations = [
      invitationFixture({ id: 10, email: "pending@example.com", expiresAt: futureDate(48) }),
      invitationFixture({ id: 11, email: "expired@example.com", expiresAt: futureDate(-2) }),
      invitationFixture({
        id: 12,
        email: "accepted@example.com",
        usedAt: new Date().toISOString(),
      }),
      invitationFixture({
        id: 13,
        email: "revoked@example.com",
        revokedAt: new Date().toISOString(),
      }),
    ];
    vi.mocked(api.listInvitations).mockResolvedValueOnce(invitations);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole("button", { name: "邀请 4" }));

    await user.click(screen.getByRole("button", { name: /pending@example.com，待接受/ }));
    expect(screen.getByRole("button", { name: "重新发送" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "撤销邀请" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /expired@example.com，已过期/ }));
    const expiredDetail = screen
      .getByRole("region", { name: "邀请列表与详情" })
      .querySelector(".member-detail");
    expect(expiredDetail).not.toBeNull();
    expect(within(expiredDetail as HTMLElement).getByText(/^已于 .* 过期$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新发送" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "撤销邀请" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /accepted@example.com，已接受/ }));
    expect(screen.queryByRole("button", { name: "重新发送" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "撤销邀请" })).not.toBeInTheDocument();
    expect(screen.getByText("当前状态无需操作")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /revoked@example.com，已撤销/ }));
    expect(screen.queryByRole("button", { name: "重新发送" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "撤销邀请" })).not.toBeInTheDocument();
  });

  it("停用成员前展示对象与影响并在确认后提交", async () => {
    const rows = memberRows().filter((row) => row.status !== "invited");
    vi.mocked(api.listUsers).mockResolvedValue(rows);
    vi.mocked(api.updateUser).mockResolvedValue({ ...rows[1], status: "disabled" });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: /operator@example.com/ });
    await user.click(screen.getByRole("button", { name: /operator@example.com/ }));
    await user.click(screen.getByRole("button", { name: "停用成员" }));

    const dialog = screen.getByRole("dialog", { name: "确认停用成员" });
    expect(within(dialog).getByText(/operator@example.com/)).toBeInTheDocument();
    expect(within(dialog).getByText(/现有会话会立即失效/)).toBeInTheDocument();
    expect(api.updateUser).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "确认停用" }));
    await waitFor(() =>
      expect(api.updateUser).toHaveBeenCalledWith(2, { status: "disabled" }, "csrf-token"),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("操作当前账号时额外警告停用与管理员降级影响", async () => {
    vi.mocked(api.listUsers).mockResolvedValueOnce([
      memberRows()[0],
      {
        id: 4,
        email: "backup-admin@example.com",
        displayName: "备用管理员",
        role: "admin",
        status: "active",
      },
    ]);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: /^管理员，admin@example.com/ });

    await user.click(screen.getByRole("button", { name: "停用成员" }));
    expect(screen.getByRole("alert")).toHaveTextContent("这是你当前登录的账号");
    expect(screen.getByRole("alert")).toHaveTextContent("当前会话也会失效");
    await user.click(screen.getByRole("button", { name: "取消" }));

    await user.click(screen.getByLabelText("当前角色"));
    await user.click(
      await screen.findByText("只读成员", { selector: ".ant-select-item-option-content" }),
    );
    await waitFor(() => {
      expect(
        screen
          .getByLabelText("当前角色")
          .closest(".ant-select")
          ?.querySelector(".ant-select-content"),
      ).toHaveTextContent("只读成员");
    });
    await user.click(screen.getByRole("button", { name: "保存角色" }));
    expect(screen.getByRole("dialog", { name: "确认调整管理员角色" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("失去成员与权限管理能力");
    expect(api.updateUser).not.toHaveBeenCalled();
  });

  it("最后一名可用管理员不能降级或停用", async () => {
    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: /admin@example.com/ });

    expect(screen.getByLabelText("当前角色")).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存角色" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "停用成员" })).not.toBeInTheDocument();
    expect(screen.queryByText("至少保留 1 名可用管理员")).not.toBeInTheDocument();
  });

  it("撤销邀请必须确认并展示对象与影响", async () => {
    const invitation = pendingInvitation();
    vi.mocked(api.listInvitations).mockResolvedValue([invitation]);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole("button", { name: "邀请 1" }));
    await user.click(screen.getByRole("button", { name: "撤销邀请" }));

    const dialog = screen.getByRole("dialog", { name: "确认撤销邀请" });
    expect(within(dialog).getByText("viewer@example.com")).toBeInTheDocument();
    expect(within(dialog).getByText(/注册链接会立即失效/)).toBeInTheDocument();
    expect(api.revokeInvitation).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "确认撤销" }));
    await waitFor(() =>
      expect(api.revokeInvitation).toHaveBeenCalledWith(invitation.id, "csrf-token"),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

function MembersLocationProbe() {
  const location = useLocation();
  return <output data-testid="members-location">{location.search}</output>;
}

describe("邀请派生状态", () => {
  const now = Date.parse("2026-09-03T08:00:00Z");

  it("统一派生待接受、即将过期、已过期、已接受和已撤销", () => {
    expect(getInvitationStatus(invitationFixture({ expiresAt: "2026-09-05T08:00:00Z" }), now)).toBe(
      "pending",
    );
    expect(getInvitationStatus(invitationFixture({ expiresAt: "2026-09-03T09:00:00Z" }), now)).toBe(
      "expiring",
    );
    expect(getInvitationStatus(invitationFixture({ expiresAt: "2026-09-03T07:59:59Z" }), now)).toBe(
      "expired",
    );
    expect(
      getInvitationStatus(
        invitationFixture({ expiresAt: "2026-09-03T07:59:59Z", usedAt: "2026-09-03T07:00:00Z" }),
        now,
      ),
    ).toBe("accepted");
    expect(
      getInvitationStatus(
        invitationFixture({ expiresAt: "2026-09-05T08:00:00Z", revokedAt: "2026-09-03T07:00:00Z" }),
        now,
      ),
    ).toBe("revoked");
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

function memberRows(): User[] {
  return [
    { id: 1, email: "admin@example.com", displayName: "管理员", role: "admin", status: "active" },
    {
      id: 2,
      email: "operator@example.com",
      displayName: "操作员",
      role: "operator",
      status: "active",
    },
    { id: 3, email: "viewer@example.com", displayName: null, role: "viewer", status: "invited" },
  ];
}

function pendingInvitation(): Invitation {
  return {
    id: 3,
    email: "viewer@example.com",
    role: "viewer",
    expiresAt: futureDate(48),
    usedAt: null,
    revokedAt: null,
  };
}

function invitationFixture(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: 99,
    email: "fixture@example.com",
    role: "viewer",
    expiresAt: futureDate(48),
    usedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function futureDate(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}
