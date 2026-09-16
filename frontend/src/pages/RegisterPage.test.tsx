import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/client";
import { RegisterPage } from "./RegisterPage";

const register = vi.fn();
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ user: null, register }),
}));
vi.mock("../api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api/client")>();
  return {
    ...original,
    api: { ...original.api, getPasswordPolicy: vi.fn(), validateInvitation: vi.fn() },
  };
});

describe("邀请注册页", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getPasswordPolicy).mockResolvedValue({ minimumLength: 14 });
  });

  it("展示服务端确认的邮箱和角色，并拦截不一致密码", async () => {
    vi.mocked(api.validateInvitation).mockResolvedValue({
      email: "operator@example.com",
      role: "operator",
      expiresAt: "2026-08-27T00:00:00",
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/register#token=abcdefghijklmnopqrstuvwxyz"]}>
        <RegisterPage />
      </MemoryRouter>,
    );

    await screen.findByText("operator@example.com");
    expect(screen.getByText("SEEKWAY 数据接入中心")).toBeInTheDocument();
    expect(document.querySelector(".brand-mark--image")).toHaveAttribute("src", "/favicon.svg");
    expect(api.validateInvitation).toHaveBeenCalledWith("abcdefghijklmnopqrstuvwxyz");
    expect(screen.getByText("操作员")).toBeInTheDocument();
    await user.type(screen.getByLabelText("姓名"), "周晨");
    expect(screen.getByText(/密码至少 14 位/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("新密码"), "abcdefghijklmn");
    await user.type(screen.getByLabelText("确认新密码"), "mnopqrstuvwxzz");
    await user.click(screen.getByRole("button", { name: "完成注册" }));

    expect(await screen.findByText("两次输入的密码不一致")).toBeInTheDocument();
    // Ant Design 表单错误列表使用 10ms 延迟状态，等待反馈稳定后再销毁 JSDOM。
    await act(() => new Promise((resolve) => window.setTimeout(resolve, 20)));
    expect(register).not.toHaveBeenCalled();
  });
});
