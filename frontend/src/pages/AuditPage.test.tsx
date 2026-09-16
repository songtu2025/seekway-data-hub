import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/client";
import type { AuditLogListResponse } from "../api/types";
import { AuditPage } from "./AuditPage";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    csrfToken: "csrf-token",
    user: {
      id: 1,
      email: "admin@example.com",
      displayName: "管理员",
      role: "admin",
    },
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
      listAuditLogs: vi.fn(),
    },
  };
});

const account = {
  id: 8,
  accountCode: "acct_demo",
  name: "北美业务账号",
  maskedAppId: "•••• 8J2K",
  credentialSource: "encrypted" as const,
  status: "active" as const,
  lastVerifiedAt: "2026-08-26T02:42:00Z",
  lastVerifyError: null,
  createdAt: "2026-08-26T02:00:00Z",
  updatedAt: "2026-08-26T02:42:00Z",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}

async function chooseSelectOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
) {
  await user.click(screen.getByRole("combobox", { name: new RegExp(label) }));
  await user.click(
    await screen.findByText(option, { selector: ".ant-select-item-option-content" }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: new RegExp(label) }).closest(".ant-select"),
    ).toHaveTextContent(option),
  );
}

function expectSelectText(label: string, value: string) {
  expect(
    screen.getByRole("combobox", { name: new RegExp(label) }).closest(".ant-select"),
  ).toHaveTextContent(value);
}

function AuditResourceTarget() {
  const location = useLocation();
  return (
    <Link to={location.state.from} state={location.state.returnState}>
      返回审计日志
    </Link>
  );
}

describe("审计日志列表", () => {
  it("从 URL 恢复成员筛选并可返回对应成员", async () => {
    vi.mocked(api.listAuditLogs).mockResolvedValueOnce({
      items: [
        {
          id: 21,
          actorUserId: 2,
          action: "user.role.update",
          resourceType: "user",
          resourceId: "2",
          result: "success",
        },
      ],
    });
    render(
      <MemoryRouter initialEntries={["/audit?actorUserId=2&resourceType=user&resourceId=2"]}>
        <AuditPage />
      </MemoryRouter>,
    );

    const memberLink = await screen.findByRole("link", { name: "成员 #2" });
    expect(memberLink).toHaveAttribute("href", "/members?member=2");
    expect(screen.getByLabelText("操作者成员 ID")).toHaveValue(2);
    expectSelectText("资源类型", "成员");
    expect(screen.getByLabelText("资源 ID")).toHaveValue("2");
    expect(api.listAuditLogs).toHaveBeenCalledWith({
      cursor: undefined,
      jijiaAccountId: undefined,
      actorUserId: 2,
      resourceType: "user",
      resourceId: "2",
    });
  });

  it("准确展示密码安全事件并使用高风险行样式", async () => {
    vi.mocked(api.listAuditLogs).mockResolvedValueOnce({
      items: [
        { id: 31, action: "auth.password.change", result: "success" },
        { id: 32, action: "auth.password.reset", result: "success" },
      ],
    });
    render(
      <MemoryRouter>
        <AuditPage />
      </MemoryRouter>,
    );

    const changeLabel = await screen.findByText("修改登录密码");
    const resetLabel = screen.getByText("重置登录密码");
    expect(changeLabel.closest("tr")).toHaveClass("audit-row-attention");
    expect(resetLabel.closest("tr")).toHaveClass("audit-row-attention");
    expect(screen.queryByText("auth.password_reset.complete")).not.toBeInTheDocument();
  });

  it("账号资源直达具体账号，返回后恢复已加载记录与筛选", async () => {
    vi.mocked(api.listAuditLogs).mockImplementation(async (params) => ({
      items: [
        {
          id: params?.cursor ? 2 : 1,
          action: "jijia_account.update",
          resourceType: "jijia_account",
          resourceId: params?.cursor ? "9" : "8",
          result: "success",
        },
      ],
      nextCursor: params?.cursor ? null : "next-audit",
    }));
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/audit?action=jijia_account"]}>
        <Routes>
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/accounts/:id" element={<AuditResourceTarget />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("link", { name: "积加账号 #8" });
    await user.click(screen.getByRole("button", { name: "加载更多" }));
    const target = await screen.findByRole("link", { name: "积加账号 #9" });
    expect(target).toHaveAttribute("href", "/accounts/9");
    await user.click(target);
    const back = screen.getByRole("link", { name: "返回审计日志" });
    expect(back).toHaveAttribute("href", "/audit?action=jijia_account#audit-log-2");
    await user.click(back);
    await screen.findByRole("link", { name: "积加账号 #9" });
    expect(screen.getByRole("link", { name: "积加账号 #8" })).toBeInTheDocument();
    expect(screen.getByLabelText("操作")).toHaveValue("jijia_account");
    expect(api.listAuditLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "next-audit", action: "jijia_account" }),
    );
  });

  it("同条件加载中重复提交不产生额外请求", async () => {
    const pending = deferred<AuditLogListResponse>();
    vi.mocked(api.listAuditLogs).mockReturnValueOnce(pending.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuditPage />
      </MemoryRouter>,
    );
    await user.dblClick(screen.getByRole("button", { name: /^筛\s*选$/ }));
    expect(api.listAuditLogs).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ items: [] }));
    await screen.findByText("暂无审计记录");
  });
  it("失败不显示空结果且同条件筛选可以重试", async () => {
    vi.mocked(api.listAuditLogs).mockRejectedValueOnce(new Error("失败"));
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuditPage />
      </MemoryRouter>,
    );
    await screen.findByRole("alert");
    expect(screen.queryByText("暂无审计记录")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^筛\s*选$/ }));
    await screen.findByText("暂无审计记录");
    expect(api.listAuditLogs).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listAccounts).mockResolvedValue([account]);
    vi.mocked(api.listAuditLogs).mockResolvedValue({ items: [] });
  });

  it("按积加账号筛选审计日志", async () => {
    vi.mocked(api.listAuditLogs)
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({
        items: [{ id: 3, action: "sync_job.create", result: "success" }],
      });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuditPage />
      </MemoryRouter>,
    );

    await screen.findByText("暂无审计记录");
    await chooseSelectOption(user, "积加账号", "北美业务账号");
    await user.click(screen.getByRole("button", { name: /^筛\s*选$/ }));

    const actionCode = await screen.findByText("sync_job.create");
    expect(api.listAuditLogs).toHaveBeenCalledTimes(2);
    expect(actionCode.closest(".table-cell-stack")).toHaveTextContent("创建同步任务");
    expect(api.listAuditLogs).toHaveBeenLastCalledWith({
      cursor: undefined,
      jijiaAccountId: 8,
    });
  });

  it("首载列表失败后仍保留成功加载的账号并可筛选重试", async () => {
    vi.mocked(api.listAuditLogs)
      .mockRejectedValueOnce(new Error("首载列表失败"))
      .mockResolvedValueOnce({
        items: [{ id: 4, action: "audit.retry", result: "success" }],
      });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuditPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("审计日志加载失败");
    expectSelectText("积加账号", "全部账号");

    await chooseSelectOption(user, "积加账号", "北美业务账号");
    await user.click(screen.getByRole("button", { name: /^筛\s*选$/ }));
    expect(await screen.findByText("audit.retry")).toBeInTheDocument();
    expectSelectText("积加账号", "北美业务账号");
  });

  it("使用 nextCursor 追加下一页审计日志", async () => {
    vi.mocked(api.listAuditLogs)
      .mockResolvedValueOnce({
        items: [{ id: 1, action: "raw_data.view", result: "success" }],
        nextCursor: "audit-next",
      })
      .mockResolvedValueOnce({
        items: [{ id: 2, action: "sync_job.retry", result: "success" }],
        nextCursor: null,
      });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuditPage />
      </MemoryRouter>,
    );

    await screen.findByText("raw_data.view");
    await user.click(screen.getByRole("button", { name: "加载更多" }));

    expect(await screen.findByText("sync_job.retry")).toBeInTheDocument();
    expect(screen.getByText("raw_data.view")).toBeInTheDocument();
    expect(api.listAuditLogs).toHaveBeenLastCalledWith({
      cursor: "audit-next",
      jijiaAccountId: undefined,
    });
  });

  it("同条件刷新保留已加载数量和详情，阻止重复请求且失败显示 warning", async () => {
    const refresh = deferred<AuditLogListResponse>();
    vi.mocked(api.listAuditLogs)
      .mockResolvedValueOnce({
        items: [{ id: 1, action: "audit.first", result: "success", requestId: "request-1" }],
        nextCursor: "audit-next",
      })
      .mockResolvedValueOnce({
        items: [{ id: 2, action: "audit.second", result: "success", requestId: "request-2" }],
      })
      .mockReturnValueOnce(refresh.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuditPage />
      </MemoryRouter>,
    );

    await screen.findByText("audit.first");
    await user.click(screen.getByRole("button", { name: "加载更多" }));
    await screen.findByText("audit.second");
    const detailButtons = screen.getAllByRole("button", { name: "查看详情" });
    await user.click(detailButtons[1]);
    expect(screen.getByRole("dialog", { name: "操作详情" })).toHaveTextContent("request-2");

    fireEvent.click(screen.getByRole("button", { name: /^筛\s*选$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^筛\s*选$/ }));
    await waitFor(() => expect(api.listAuditLogs).toHaveBeenCalledTimes(3));
    expect(screen.getByText("audit.first")).toBeInTheDocument();
    expect(screen.getAllByText("audit.second")).not.toHaveLength(0);
    expect(screen.getByText("已加载 2 条")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "操作详情" })).toHaveTextContent("request-2");
    expect(screen.getByText(/正在刷新 · 上次检查/)).toBeVisible();
    expect(screen.getByRole("button", { name: "刷新审计日志" })).toBeDisabled();

    await act(async () => {
      refresh.reject(new Error("offline"));
      await refresh.promise.catch(() => undefined);
    });
    expect(screen.getByRole("alert")).toHaveClass("ant-alert-warning");
    expect(screen.getAllByText("audit.second")).not.toHaveLength(0);
    expect(screen.getByText("已加载 2 条")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "操作详情" })).toHaveTextContent("request-2");
    expect(screen.getByText(/刷新失败 · 仍显示 .* 的结果/)).toBeVisible();
  });

  it("支持按操作、结果和时间筛选，并在详情中保留技术追踪信息", async () => {
    vi.mocked(api.listAuditLogs)
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({
        items: [
          {
            id: 9,
            actorName: "管理员",
            action: "sync_job.create",
            resourceType: "sync_job",
            resourceId: "42",
            requestId: "request-42",
            result: "success",
            changes: { rangeMode: "checkpoint" },
          },
        ],
      });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuditPage />
      </MemoryRouter>,
    );
    await screen.findByText("暂无审计记录");

    await user.type(screen.getByLabelText("操作"), "sync_job");
    await chooseSelectOption(user, "结果", "成功");
    fireEvent.change(screen.getByLabelText("开始时间"), { target: { value: "2026-08-26T10:15" } });
    fireEvent.change(screen.getByLabelText("结束时间"), { target: { value: "2026-08-26T11:20" } });
    await user.click(screen.getByRole("button", { name: /^筛\s*选$/ }));

    expect(await screen.findByText("创建同步任务")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "同步任务 #42" })).toHaveAttribute("href", "/jobs/42");
    expect(api.listAuditLogs).toHaveBeenLastCalledWith({
      cursor: undefined,
      jijiaAccountId: undefined,
      action: "sync_job",
      result: "success",
      createdFrom: new Date("2026-08-26T10:15").toISOString(),
      createdTo: new Date("2026-08-26T11:20:59.999").toISOString(),
    });
    await user.click(screen.getByRole("button", { name: "查看详情" }));
    expect(screen.getByRole("dialog", { name: "操作详情" })).toHaveTextContent("request-42");
    await user.click(screen.getByText("查看脱敏变更内容"));
    expect(screen.getByText(/checkpoint/)).toBeInTheDocument();
  });

  it("旧筛选成功和 finally 不能覆盖仍在等待的新筛选", async () => {
    const oldFilter = deferred<AuditLogListResponse>();
    const newFilter = deferred<AuditLogListResponse>();
    vi.mocked(api.listAuditLogs)
      .mockResolvedValueOnce({
        items: [{ id: 1, action: "audit.base", result: "success" }],
      })
      .mockReturnValueOnce(oldFilter.promise)
      .mockReturnValueOnce(newFilter.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuditPage />
      </MemoryRouter>,
    );

    await screen.findByText("audit.base");
    await chooseSelectOption(user, "积加账号", "北美业务账号");
    await user.click(screen.getByRole("button", { name: /^筛\s*选$/ }));
    await chooseSelectOption(user, "积加账号", "全部账号");
    await user.click(screen.getByRole("button", { name: /^筛\s*选$/ }));
    await waitFor(() => expect(api.listAuditLogs).toHaveBeenCalledTimes(3));

    await act(async () => {
      oldFilter.resolve({
        items: [{ id: 2, action: "audit.old", result: "success" }],
      });
      await oldFilter.promise;
    });
    expect(screen.queryByText("audit.old")).not.toBeInTheDocument();
    expect(screen.getByText("正在加载审计日志…")).toBeInTheDocument();

    await act(async () => {
      newFilter.resolve({
        items: [{ id: 3, action: "audit.new", result: "success" }],
      });
      await newFilter.promise;
    });
    expect(screen.getByText("audit.new")).toBeInTheDocument();
  });

  it("旧下一页失败不能污染仍在等待的新筛选", async () => {
    const oldNextPage = deferred<AuditLogListResponse>();
    const newFilter = deferred<AuditLogListResponse>();
    vi.mocked(api.listAuditLogs)
      .mockResolvedValueOnce({
        items: [{ id: 1, action: "audit.base", result: "success" }],
        nextCursor: "audit-next",
      })
      .mockReturnValueOnce(oldNextPage.promise)
      .mockReturnValueOnce(newFilter.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuditPage />
      </MemoryRouter>,
    );

    await screen.findByText("audit.base");
    await user.click(screen.getByRole("button", { name: "加载更多" }));
    await chooseSelectOption(user, "积加账号", "北美业务账号");
    await user.click(screen.getByRole("button", { name: /^筛\s*选$/ }));
    await waitFor(() => expect(api.listAuditLogs).toHaveBeenCalledTimes(3));

    await act(async () => {
      oldNextPage.reject(new Error("旧下一页失败"));
      await oldNextPage.promise.catch(() => undefined);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("正在加载审计日志…")).toBeInTheDocument();

    await act(async () => {
      newFilter.resolve({
        items: [{ id: 3, action: "audit.new", result: "success" }],
      });
      await newFilter.promise;
    });
    expect(screen.getByText("audit.new")).toBeInTheDocument();
  });
});
