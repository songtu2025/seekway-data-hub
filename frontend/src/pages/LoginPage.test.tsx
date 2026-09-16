import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";
import { LoginPage } from "./LoginPage";

const login = vi.fn();
let signedIn = false;
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ user: signedIn ? { role: "admin" } : null, login }),
}));

function renderLogin(from?: string) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/login", state: { from } }]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<h1>平台首页</h1>} />
        <Route path="/sync-jobs" element={<h1>同步任务</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("登录页", () => {
  beforeEach(() => {
    login.mockReset();
    signedIn = false;
  });

  it("提交邮箱和密码并进入平台首页", async () => {
    login.mockResolvedValue({ role: "admin" });
    const user = userEvent.setup();
    renderLogin();

    expect(screen.getByRole("heading", { name: "SEEKWAY 数据接入中心" })).toBeInTheDocument();
    expect(screen.queryByText("请输入邮箱和密码")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("邮箱"), "admin@example.com");
    await user.type(screen.getByLabelText("密码"), "safe-password");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("heading", { name: "平台首页" })).toBeInTheDocument();
    expect(login).toHaveBeenCalledWith("admin@example.com", "safe-password");
  });

  it("提交浏览器自动填充但未触发 React 输入事件的凭据", async () => {
    login.mockResolvedValue({ role: "admin" });
    renderLogin();

    const email = screen.getByLabelText("邮箱");
    const password = screen.getByLabelText("密码");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
      email,
      "admin@example.com",
    );
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
      password,
      "safe-password",
    );
    fireEvent.submit(screen.getByRole("button", { name: "登录" }).closest("form")!);

    await waitFor(() => expect(login).toHaveBeenCalledWith("admin@example.com", "safe-password"));
  });

  it("校验空字段和无效邮箱并阻止请求", async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(screen.getByRole("button", { name: "登录" }));
    expect(await screen.findByText("请输入邮箱")).toBeInTheDocument();
    expect(await screen.findByText("请输入密码")).toBeInTheDocument();
    await user.type(screen.getByLabelText("邮箱"), "invalid-email");
    await user.type(screen.getByLabelText("密码"), "safe-password");
    await user.click(screen.getByRole("button", { name: "登录" }));
    expect(await screen.findByText("请输入有效的邮箱地址")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("提交中禁用表单，重复提交只请求一次，失败后保留输入", async () => {
    let rejectLogin: (reason: Error) => void = () => undefined;
    login.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectLogin = reject;
        }),
    );
    const user = userEvent.setup();
    renderLogin();
    const email = screen.getByLabelText("邮箱");
    const password = screen.getByLabelText("密码");
    await user.type(email, "admin@example.com");
    await user.type(password, "safe-password");
    const button = screen.getByRole("button", { name: "登录" });
    const form = button.closest("form")!;
    await user.click(button);
    await waitFor(() => expect(email).toBeDisabled());
    expect(password).toBeDisabled();
    expect(button).toBeDisabled();
    fireEvent.submit(form);
    await waitFor(() => expect(login).toHaveBeenCalledTimes(1));
    rejectLogin(new ApiError("邮箱或密码错误", 401, "INVALID_CREDENTIALS"));
    expect(await screen.findByText("邮箱或密码错误")).toBeInTheDocument();
    expect(email).toHaveValue("admin@example.com");
    expect(password).toHaveValue("safe-password");
    expect(email).toBeEnabled();
  });

  it("未知异常仅显示通用提示，允许重试后返回原页面", async () => {
    login.mockRejectedValueOnce(new Error("内部异常")).mockResolvedValueOnce({ role: "admin" });
    const user = userEvent.setup();
    renderLogin("/sync-jobs");
    await user.type(screen.getByLabelText("邮箱"), "admin@example.com");
    await user.type(screen.getByLabelText("密码"), "safe-password");
    await user.click(screen.getByRole("button", { name: "登录" }));
    expect(await screen.findByText("登录失败，请稍后重试")).toBeInTheDocument();
    expect(screen.queryByText("内部异常")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "登录" }));
    expect(await screen.findByRole("heading", { name: "同步任务" })).toBeInTheDocument();
  });

  it("已登录用户直接返回原页面", () => {
    signedIn = true;
    renderLogin("/sync-jobs");
    expect(screen.getByRole("heading", { name: "同步任务" })).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("展示完整品牌文案并可通过键盘切换密码可见性", async () => {
    const user = userEvent.setup();
    renderLogin();
    expect(
      screen.getByRole("img", { name: "SEEK THE WAY YOU WANT. LIVE THE LIFE YOU FOUND." }),
    ).toBeInTheDocument();
    await user.tab();
    expect(screen.getByLabelText("邮箱")).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("密码")).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "显示密码" })).toHaveFocus();
    await user.keyboard(" ");
    expect(screen.getByLabelText("密码")).toHaveAttribute("type", "text");
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("密码")).toHaveAttribute("type", "password");
  });
});
