import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { api, ApiError, AUTH_UNAUTHORIZED_EVENT } from "./api/client";
import { AuthProvider } from "./auth/AuthContext";

vi.mock("./api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api/client")>();
  return {
    ...original,
    api: {
      ...original.api,
      getDashboard: vi.fn(),
      listAccounts: vi.fn(),
      listRawData: vi.fn(),
      login: vi.fn(),
      session: vi.fn(),
    },
  };
});

function LocationProbe() {
  const location = useLocation();
  return (
    <span data-testid="current-location">
      {location.pathname}
      {location.search}
      {location.hash}
    </span>
  );
}

describe("登录态过期", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.session).mockResolvedValue({
      user: {
        id: 3,
        email: "viewer@example.com",
        displayName: "只读成员",
        role: "viewer",
        status: "active",
      },
      csrfToken: "csrf-token",
    });
    vi.mocked(api.getDashboard).mockResolvedValue({
      queuedJobs: 0,
      runningJobs: 0,
      failedJobs: 0,
      failedRequests: 0,
      latestRun: null,
      historyProgress: null,
    });
    vi.mocked(api.listAccounts).mockResolvedValue([]);
    vi.mocked(api.listRawData).mockResolvedValue({ items: [] });
  });

  it("运行中收到 401 事件后从保护页回到登录页", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "运营收件箱" })).toBeInTheDocument();

    act(() => window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT)));

    expect(
      await screen.findByRole("heading", { name: "SEEKWAY 数据接入中心" }),
    ).toBeInTheDocument();
  });

  it("登录后恢复受保护地址的查询参数和哈希片段", async () => {
    vi.mocked(api.session).mockRejectedValue(new ApiError("请先登录", 401, "AUTH_REQUIRED"));
    vi.mocked(api.login).mockResolvedValue({
      user: {
        id: 4,
        email: "operator@example.com",
        displayName: "操作员",
        role: "operator",
        status: "active",
      },
      csrfToken: "operator-csrf",
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={["/raw-data?apiCode=sale_return_order_page&jijiaAccountId=8#versions"]}
      >
        <AuthProvider>
          <App />
          <LocationProbe />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "SEEKWAY 数据接入中心" }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("邮箱"), "operator@example.com");
    await user.type(screen.getByLabelText("密码"), "safe-password");
    await user.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(screen.getByTestId("current-location")).toHaveTextContent(
        "/raw-data?apiCode=sale_return_order_page&jijiaAccountId=8#versions",
      );
    });
  });
});
