import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/client";
import type {
  FailedRequestListResponse,
  SyncRun,
  SyncRunListResponse,
  SyncRunLogListResponse,
} from "../api/types";
import { SyncRunDetailPage, SyncRunsPage } from "./SyncRunsPage";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    csrfToken: null,
    user: {
      id: 3,
      email: "viewer@example.com",
      displayName: "只读成员",
      role: "viewer",
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
      listSyncRuns: vi.fn(),
      getSyncRun: vi.fn(),
      listSyncRunLogs: vi.fn(),
      listFailedRequests: vi.fn(),
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

function RunNavigationHarness() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate("/runs/8")}>
        切换运行
      </button>
      <Routes>
        <Route path="/runs/:id" element={<SyncRunDetailPage />} />
      </Routes>
    </>
  );
}

describe("同步运行记录", () => {
  it("从接口中心进入账号运行记录后保留列表与抽屉位置", async () => {
    const from = "/api-catalog?account=8&q=退货&page=2&api=sale_return_order_page";
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: "/runs", search: "?account=8", state: { from, backLabel: "返回接口中心" } },
        ]}
      >
        <SyncRunsPage />
      </MemoryRouter>,
    );
    await screen.findByText("暂无运行记录");
    expect(screen.getByRole("link", { name: "← 返回接口中心" })).toHaveAttribute("href", from);
    expect(api.listSyncRuns).toHaveBeenCalledWith({ jijiaAccountId: 8, status: undefined });
  });

  it("加载失败不展示空结果且同条件刷新恢复", async () => {
    vi.mocked(api.listSyncRuns).mockRejectedValueOnce(new Error("失败"));
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SyncRunsPage />
      </MemoryRouter>,
    );
    await screen.findByText(/运行记录加载失败/);
    expect(screen.queryByText("暂无运行记录")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "刷新" }));
    await screen.findByText("暂无运行记录");
    expect(api.listSyncRuns).toHaveBeenCalledTimes(2);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listAccounts).mockResolvedValue([account]);
    vi.mocked(api.listSyncRuns).mockResolvedValue({ items: [] });
    vi.mocked(api.getSyncRun).mockResolvedValue({
      id: 7,
      batchNo: "BATCH-7",
      jijiaAccountId: 8,
      accountName: "北美业务账号",
      status: "success",
      jobId: 19,
    });
    vi.mocked(api.listSyncRunLogs).mockResolvedValue({ items: [] });
    vi.mocked(api.listFailedRequests).mockResolvedValue({ items: [] });
  });

  it("按账号和状态筛选运行记录", async () => {
    vi.mocked(api.listSyncRuns)
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({
        items: [{ id: 3, batchNo: "BATCH-3", status: "failed" }],
      });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SyncRunsPage />
      </MemoryRouter>,
    );

    await screen.findByText("暂无运行记录");
    await user.click(screen.getByLabelText("积加账号"));
    await user.click(
      await screen.findByText("北美业务账号", { selector: ".ant-select-item-option-content" }),
    );
    await user.click(screen.getByLabelText("运行状态"));
    await user.click(
      await screen.findByText("失败", { selector: ".ant-select-item-option-content" }),
    );
    await user.click(screen.getByRole("button", { name: "筛选" }));

    const batchLink = await screen.findByRole("link", { name: "BATCH-3" });
    expect(batchLink.closest(".table-cell-stack")).toBeInTheDocument();
    expect(api.listSyncRuns).toHaveBeenLastCalledWith({
      cursor: undefined,
      jijiaAccountId: 8,
      status: "failed",
    });
  });

  it("作为兼容视图引导返回同步任务，并优先表达执行状态", async () => {
    vi.mocked(api.listSyncRuns).mockResolvedValue({
      items: [
        {
          id: 4,
          batchNo: "BATCH-PAUSED",
          status: "paused",
          jobId: 7,
          totalApis: 1,
          failedApis: 0,
        },
      ],
    });
    render(
      <MemoryRouter>
        <SyncRunsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "执行批次记录" })).toBeInTheDocument();
    const compatibilityNote = screen.getByRole("note");
    expect(compatibilityNote).toHaveTextContent("此页面保留用于兼容历史链接");
    expect(within(compatibilityNote).getByRole("link", { name: "同步任务" })).toHaveAttribute(
      "href",
      "/jobs",
    );
    expect(await screen.findByText("执行已暂停 · 接口无失败")).toBeInTheDocument();
    expect(screen.queryByText("全部 1 个接口成功")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看任务 #7" })).toHaveAttribute("href", "/jobs/7");
  });

  it("首载列表失败后仍保留成功加载的账号并可刷新重试", async () => {
    vi.mocked(api.listSyncRuns)
      .mockRejectedValueOnce(new Error("首载列表失败"))
      .mockResolvedValueOnce({
        items: [{ id: 5, batchNo: "BATCH-RETRY", status: "success" }],
      });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SyncRunsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/运行记录加载失败/)).toBeInTheDocument();
    await user.click(screen.getByLabelText("积加账号"));
    expect(
      await screen.findByText("北美业务账号", { selector: ".ant-select-item-option-content" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "刷新" }));
    expect(await screen.findByRole("link", { name: "BATCH-RETRY" })).toBeInTheDocument();
    await user.click(screen.getByLabelText("积加账号"));
    expect(
      await screen.findByText("北美业务账号", { selector: ".ant-select-item-option-content" }),
    ).toBeInTheDocument();
  });

  it("使用 nextCursor 追加下一页运行记录", async () => {
    vi.mocked(api.listSyncRuns)
      .mockResolvedValueOnce({
        items: [{ id: 1, batchNo: "BATCH-1", status: "success" }],
        nextCursor: "run-next",
      })
      .mockResolvedValueOnce({
        items: [{ id: 2, batchNo: "BATCH-2", status: "failed" }],
        nextCursor: null,
      });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SyncRunsPage />
      </MemoryRouter>,
    );

    await screen.findByRole("link", { name: "BATCH-1" });
    await user.click(screen.getByRole("button", { name: "加载更多" }));

    expect(await screen.findByRole("link", { name: "BATCH-2" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "BATCH-1" })).toBeInTheDocument();
    expect(api.listSyncRuns).toHaveBeenLastCalledWith({
      cursor: "run-next",
      jijiaAccountId: undefined,
      status: undefined,
    });
  });

  it("刷新进行中阻止重复请求并保留旧记录", async () => {
    const refresh = deferred<SyncRunListResponse>();
    vi.mocked(api.listSyncRuns)
      .mockResolvedValueOnce({
        items: [{ id: 1, batchNo: "BATCH-BASE", status: "success" }],
      })
      .mockReturnValueOnce(refresh.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SyncRunsPage />
      </MemoryRouter>,
    );

    await screen.findByRole("link", { name: "BATCH-BASE" });
    await user.click(screen.getByRole("button", { name: "刷新" }));
    await waitFor(() => expect(api.listSyncRuns).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("link", { name: "BATCH-BASE" })).toBeInTheDocument();
    expect(screen.getByText(/正在刷新 · 上次检查/)).toBeVisible();
    expect(document.querySelector(".ant-table-wrapper .ant-spin-spinning")).toBeNull();
    expect(screen.getByRole("button", { name: "正在刷新" })).toBeDisabled();

    await act(async () => {
      refresh.resolve({
        items: [{ id: 3, batchNo: "BATCH-NEW", status: "success" }],
      });
      await refresh.promise;
    });
    expect(screen.getByRole("link", { name: "BATCH-NEW" })).toBeInTheDocument();
    expect(screen.getByText(/上次检查 \d{2}:\d{2}:\d{2}/)).toBeVisible();
  });

  it("旧下一页失败不能污染仍在等待的新筛选", async () => {
    const oldNextPage = deferred<SyncRunListResponse>();
    const newFilter = deferred<SyncRunListResponse>();
    vi.mocked(api.listSyncRuns)
      .mockResolvedValueOnce({
        items: [{ id: 1, batchNo: "BATCH-BASE", status: "success" }],
        nextCursor: "run-next",
      })
      .mockReturnValueOnce(oldNextPage.promise)
      .mockReturnValueOnce(newFilter.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SyncRunsPage />
      </MemoryRouter>,
    );

    await screen.findByRole("link", { name: "BATCH-BASE" });
    await user.click(screen.getByRole("button", { name: "加载更多" }));
    await user.click(screen.getByLabelText("运行状态"));
    await user.click(
      await screen.findByText("失败", { selector: ".ant-select-item-option-content" }),
    );
    await user.click(screen.getByRole("button", { name: "筛选" }));
    await waitFor(() => expect(api.listSyncRuns).toHaveBeenCalledTimes(3));

    await act(async () => {
      oldNextPage.reject(new Error("旧下一页失败"));
      await oldNextPage.promise.catch(() => undefined);
    });
    expect(screen.queryByText("旧下一页失败")).not.toBeInTheDocument();
    expect(screen.getByText("正在加载运行记录…")).toBeInTheDocument();

    await act(async () => {
      newFilter.resolve({
        items: [{ id: 4, batchNo: "BATCH-FILTERED", status: "failed" }],
      });
      await newFilter.promise;
    });
    expect(screen.getByRole("link", { name: "BATCH-FILTERED" })).toBeInTheDocument();
  });

  it("运行详情按曾观察批次进入当前快照列表", async () => {
    vi.mocked(api.getSyncRun).mockResolvedValue({
      id: 7,
      batchNo: "BATCH 7/2026",
      jijiaAccountId: 8,
      accountName: "北美业务账号",
      status: "partial_failed",
      jobId: 19,
    });
    render(
      <MemoryRouter initialEntries={["/runs/7"]}>
        <Routes>
          <Route path="/runs/:id" element={<SyncRunDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const rawLink = await screen.findByRole("link", {
      name: "查看本批次曾观察的记录（列表展示当前快照）",
    });
    expect(rawLink).toHaveAttribute(
      "href",
      "/raw-data?jijiaAccountId=8&observedBatchNo=BATCH+7%2F2026",
    );
    expect(screen.getByText("北美业务账号")).toBeInTheDocument();
    expect(screen.getByText("部分失败")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "任务 #19" })).toHaveAttribute("href", "/jobs/19");
    expect(screen.getByRole("heading", { name: "本次运行需要处理" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "定位失败请求" })).toHaveAttribute(
      "href",
      "#failed-requests",
    );
    expect(screen.getByRole("link", { name: "返回任务处理" })).toHaveAttribute("href", "/jobs/19");
    expect(api.getSyncRun).toHaveBeenCalledWith("7");
    expect(api.listSyncRunLogs).toHaveBeenCalledWith("7");
    expect(api.listFailedRequests).toHaveBeenCalledWith("7");
  });

  it("刷新运行详情保留已加载内容、阻止重复请求并在部分失败时显示 warning", async () => {
    const runRefresh = deferred<SyncRun>();
    const logsRefresh = deferred<SyncRunLogListResponse>();
    const failedRefresh = deferred<FailedRequestListResponse>();
    vi.mocked(api.listSyncRunLogs)
      .mockResolvedValueOnce({
        items: [{ id: 1, apiCode: "api_a", status: "success", message: "日志首页" }],
        nextCursor: "logs-next",
      })
      .mockResolvedValueOnce({
        items: [{ id: 2, apiCode: "api_b", status: "success", message: "日志第二页" }],
      })
      .mockReturnValueOnce(logsRefresh.promise);
    vi.mocked(api.listFailedRequests)
      .mockResolvedValueOnce({
        items: [{ id: 3, apiCode: "api_a", errorCode: "FIRST" }],
        nextCursor: "failed-next",
      })
      .mockResolvedValueOnce({
        items: [{ id: 4, apiCode: "api_b", errorCode: "SECOND" }],
      })
      .mockReturnValueOnce(failedRefresh.promise);
    vi.mocked(api.getSyncRun).mockResolvedValueOnce({
      id: 7,
      batchNo: "BATCH-7",
      jijiaAccountId: 8,
      status: "partial_failed",
    });
    vi.mocked(api.getSyncRun).mockReturnValueOnce(runRefresh.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/runs/7"]}>
        <Routes>
          <Route path="/runs/:id" element={<SyncRunDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText("日志首页");
    await user.click(screen.getByRole("button", { name: "加载更多日志" }));
    await screen.findByText("日志第二页");
    await user.click(screen.getByRole("button", { name: "加载更多失败请求" }));
    await screen.findByText("SECOND");
    expect(screen.getByText(/上次检查 \d{2}:\d{2}:\d{2}/)).toBeVisible();

    await user.dblClick(screen.getByRole("button", { name: "刷新运行详情" }));
    await waitFor(() => {
      expect(api.getSyncRun).toHaveBeenCalledTimes(2);
      expect(api.listSyncRunLogs).toHaveBeenCalledTimes(3);
      expect(api.listFailedRequests).toHaveBeenCalledTimes(3);
    });
    expect(screen.getByText("日志第二页")).toBeInTheDocument();
    expect(screen.getByText("SECOND")).toBeInTheDocument();
    expect(screen.getByText(/正在刷新 · 上次检查/)).toBeVisible();

    await act(async () => {
      runRefresh.resolve({
        id: 7,
        batchNo: "BATCH-7",
        jijiaAccountId: 8,
        status: "partial_failed",
      });
      logsRefresh.resolve({
        items: [
          { id: 1, apiCode: "api_a", status: "success", message: "日志首页" },
          { id: 2, apiCode: "api_b", status: "success", message: "日志第二页" },
        ],
      });
      failedRefresh.reject(new Error("offline"));
      await failedRefresh.promise.catch(() => undefined);
    });
    expect(screen.getByText("日志第二页")).toBeInTheDocument();
    expect(screen.getByText("SECOND")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveClass("ant-alert-warning");
    expect(screen.getByText(/刷新失败 · 仍显示 .* 的结果/)).toBeVisible();
  });

  it("从筛选后的运行列表进入时保留返回位置", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/runs/7",
            state: { from: "/runs?account=8&status=failed", backLabel: "返回运行记录" },
          },
        ]}
      >
        <Routes>
          <Route path="/runs/:id" element={<SyncRunDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "← 返回运行记录" })).toHaveAttribute(
      "href",
      "/runs?account=8&status=failed",
    );
  });

  it("切换运行后忽略上一运行延迟返回的初载结果", async () => {
    const firstRun = deferred<SyncRun>();
    vi.mocked(api.getSyncRun).mockReturnValueOnce(firstRun.promise).mockResolvedValueOnce({
      id: 8,
      batchNo: "BATCH-8",
      jijiaAccountId: 8,
      status: "success",
    });
    vi.mocked(api.listSyncRunLogs)
      .mockResolvedValueOnce({
        items: [
          { id: 1, apiCode: "sale_return_order_page", status: "success", message: "运行7日志" },
        ],
      })
      .mockResolvedValueOnce({
        items: [
          { id: 2, apiCode: "sale_return_order_page", status: "success", message: "运行8日志" },
        ],
      });
    vi.mocked(api.listFailedRequests)
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [] });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/runs/7"]}>
        <RunNavigationHarness />
      </MemoryRouter>,
    );

    await waitFor(() => expect(api.getSyncRun).toHaveBeenCalledWith("7"));
    await user.click(screen.getByRole("button", { name: "切换运行" }));
    expect(await screen.findByText("运行8日志")).toBeInTheDocument();

    await act(async () => {
      firstRun.resolve({
        id: 7,
        batchNo: "BATCH-7",
        jijiaAccountId: 8,
        status: "failed",
      });
      await firstRun.promise;
    });

    expect(screen.queryByText("运行7日志")).not.toBeInTheDocument();
    expect(screen.queryByText("BATCH-7")).not.toBeInTheDocument();
    expect(screen.getAllByText("BATCH-8")).not.toHaveLength(0);
  });

  it("切换运行后忽略上一运行延迟返回的日志下一页", async () => {
    const oldPage = deferred<SyncRunLogListResponse>();
    vi.mocked(api.getSyncRun)
      .mockResolvedValueOnce({ id: 7, batchNo: "BATCH-7", jijiaAccountId: 8, status: "success" })
      .mockResolvedValueOnce({ id: 8, batchNo: "BATCH-8", jijiaAccountId: 8, status: "success" });
    vi.mocked(api.listSyncRunLogs)
      .mockResolvedValueOnce({
        items: [
          { id: 1, apiCode: "sale_return_order_page", status: "success", message: "运行7首页" },
        ],
        nextCursor: "run-7-next",
      })
      .mockReturnValueOnce(oldPage.promise)
      .mockResolvedValueOnce({
        items: [
          { id: 2, apiCode: "sale_return_order_page", status: "success", message: "运行8首页" },
        ],
      });
    vi.mocked(api.listFailedRequests)
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [] });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/runs/7"]}>
        <RunNavigationHarness />
      </MemoryRouter>,
    );

    await screen.findByText("运行7首页");
    await user.click(screen.getByRole("button", { name: "加载更多日志" }));
    await waitFor(() => expect(api.listSyncRunLogs).toHaveBeenCalledWith("7", "run-7-next"));
    await user.click(screen.getByRole("button", { name: "切换运行" }));
    expect(await screen.findByText("运行8首页")).toBeInTheDocument();

    await act(async () => {
      oldPage.resolve({
        items: [
          { id: 3, apiCode: "sale_return_order_page", status: "failed", message: "旧运行迟到日志" },
        ],
      });
      await oldPage.promise;
    });

    expect(screen.queryByText("旧运行迟到日志")).not.toBeInTheDocument();
    expect(screen.getByText("运行8首页")).toBeInTheDocument();
  });

  it("切换运行后忽略上一运行延迟返回的失败请求下一页", async () => {
    const oldPage = deferred<FailedRequestListResponse>();
    vi.mocked(api.getSyncRun)
      .mockResolvedValueOnce({ id: 7, batchNo: "BATCH-7", jijiaAccountId: 8, status: "failed" })
      .mockResolvedValueOnce({
        id: 8,
        batchNo: "BATCH-8",
        jijiaAccountId: 8,
        status: "partial_failed",
      });
    vi.mocked(api.listSyncRunLogs)
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [] });
    vi.mocked(api.listFailedRequests)
      .mockResolvedValueOnce({
        items: [{ id: 1, apiCode: "sale_return_order_page", errorCode: "RUN_7_FIRST" }],
        nextCursor: "run-7-failed-next",
      })
      .mockReturnValueOnce(oldPage.promise)
      .mockResolvedValueOnce({
        items: [{ id: 2, apiCode: "sale_return_order_page", errorCode: "RUN_8_FIRST" }],
        nextCursor: "run-8-failed-next",
      })
      .mockResolvedValueOnce({
        items: [{ id: 3, apiCode: "sale_return_order_page", errorCode: "RUN_8_SECOND" }],
      });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/runs/7"]}>
        <RunNavigationHarness />
      </MemoryRouter>,
    );

    await screen.findByText("RUN_7_FIRST");
    await user.click(screen.getByRole("button", { name: "加载更多失败请求" }));
    await waitFor(() =>
      expect(api.listFailedRequests).toHaveBeenCalledWith("7", "run-7-failed-next"),
    );
    await user.click(screen.getByRole("button", { name: "切换运行" }));
    expect(await screen.findByText("RUN_8_FIRST")).toBeInTheDocument();

    await act(async () => {
      oldPage.resolve({
        items: [{ id: 4, apiCode: "sale_return_order_page", errorCode: "RUN_7_LATE" }],
        nextCursor: "run-7-stale-cursor",
      });
      await oldPage.promise;
    });

    expect(screen.queryByText("RUN_7_LATE")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const loadMoreButton = screen.getByRole("button", { name: "加载更多失败请求" });
    expect(loadMoreButton).toBeEnabled();
    await user.click(loadMoreButton);
    expect(await screen.findByText("RUN_8_SECOND")).toBeInTheDocument();
    expect(api.listFailedRequests).toHaveBeenLastCalledWith("8", "run-8-failed-next");
  });

  it("旧运行失败请求拒绝不会提前结束新运行的下一页加载", async () => {
    const oldPage = deferred<FailedRequestListResponse>();
    const newPage = deferred<FailedRequestListResponse>();
    vi.mocked(api.getSyncRun)
      .mockResolvedValueOnce({ id: 7, batchNo: "BATCH-7", jijiaAccountId: 8, status: "failed" })
      .mockResolvedValueOnce({
        id: 8,
        batchNo: "BATCH-8",
        jijiaAccountId: 8,
        status: "partial_failed",
      });
    vi.mocked(api.listSyncRunLogs)
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [] });
    vi.mocked(api.listFailedRequests)
      .mockResolvedValueOnce({
        items: [{ id: 1, apiCode: "sale_return_order_page", errorCode: "RUN_7_FIRST" }],
        nextCursor: "run-7-failed-next",
      })
      .mockReturnValueOnce(oldPage.promise)
      .mockResolvedValueOnce({
        items: [{ id: 2, apiCode: "sale_return_order_page", errorCode: "RUN_8_FIRST" }],
        nextCursor: "run-8-failed-next",
      })
      .mockReturnValueOnce(newPage.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/runs/7"]}>
        <RunNavigationHarness />
      </MemoryRouter>,
    );

    await screen.findByText("RUN_7_FIRST");
    await user.click(screen.getByRole("button", { name: "加载更多失败请求" }));
    await waitFor(() =>
      expect(api.listFailedRequests).toHaveBeenCalledWith("7", "run-7-failed-next"),
    );
    await user.click(screen.getByRole("button", { name: "切换运行" }));
    expect(await screen.findByText("RUN_8_FIRST")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "加载更多失败请求" }));
    await waitFor(() =>
      expect(api.listFailedRequests).toHaveBeenCalledWith("8", "run-8-failed-next"),
    );
    expect(screen.getByRole("button", { name: "加载中…" })).toBeDisabled();

    await act(async () => {
      oldPage.reject(new Error("旧运行延迟失败"));
      await oldPage.promise.catch(() => undefined);
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("RUN_7_FIRST")).not.toBeInTheDocument();
    expect(screen.getByText("RUN_8_FIRST")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加载中…" })).toBeDisabled();

    await act(async () => {
      newPage.resolve({
        items: [{ id: 3, apiCode: "sale_return_order_page", errorCode: "RUN_8_SECOND" }],
        nextCursor: "run-8-final",
      });
      await newPage.promise;
    });

    expect(screen.getByText("RUN_8_SECOND")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加载更多失败请求" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("运行详情分别传递日志和失败请求的 nextCursor", async () => {
    vi.mocked(api.listSyncRunLogs)
      .mockResolvedValueOnce({
        items: [{ id: 1, apiCode: "sale_return_order_page", status: "success" }],
        nextCursor: "log-next",
      })
      .mockResolvedValueOnce({
        items: [{ id: 2, apiCode: "sale_return_order_page", status: "failed" }],
        nextCursor: null,
      });
    vi.mocked(api.listFailedRequests)
      .mockResolvedValueOnce({
        items: [{ id: 3, apiCode: "sale_return_order_page", errorCode: "TIMEOUT" }],
        nextCursor: "failed-next",
      })
      .mockResolvedValueOnce({
        items: [{ id: 4, apiCode: "sale_return_order_page", errorCode: "RATE_LIMIT" }],
        nextCursor: null,
      });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/runs/7"]}>
        <Routes>
          <Route path="/runs/:id" element={<SyncRunDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText("TIMEOUT");
    await user.click(screen.getByRole("button", { name: "加载更多日志" }));
    expect(api.listSyncRunLogs).toHaveBeenLastCalledWith("7", "log-next");
    await user.click(screen.getByRole("button", { name: "加载更多失败请求" }));
    expect(api.listFailedRequests).toHaveBeenLastCalledWith("7", "failed-next");
    expect(await screen.findByText("RATE_LIMIT")).toBeInTheDocument();
  });

  it("失败请求初载失败时保留已成功加载的接口日志且不显示虚假空态", async () => {
    vi.mocked(api.listSyncRunLogs).mockResolvedValue({
      items: [
        {
          id: 1,
          apiCode: "sale_return_order_page",
          status: "success",
          message: "接口日志已保存",
        },
      ],
    });
    vi.mocked(api.listFailedRequests).mockRejectedValue(new Error("network error"));
    render(
      <MemoryRouter initialEntries={["/runs/7"]}>
        <Routes>
          <Route path="/runs/:id" element={<SyncRunDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("接口日志已保存")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "查看本批次曾观察的记录（列表展示当前快照）",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("失败请求加载失败");
    expect(screen.queryByText("暂无接口日志")).not.toBeInTheDocument();
    expect(screen.queryByText("暂无失败请求")).not.toBeInTheDocument();
  });
});
