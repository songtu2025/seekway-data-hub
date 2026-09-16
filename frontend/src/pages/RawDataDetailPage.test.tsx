import { useLayoutEffect } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/client";
import type { RawDataDetail, RawDataVersionListResponse } from "../api/types";
import { RawDataDetailPage } from "./RawDataDetailPage";

const authState = vi.hoisted(() => ({
  role: "viewer" as "admin" | "operator" | "viewer",
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    csrfToken: null,
    user: {
      id: 2,
      email: "member@example.com",
      displayName: "项目成员",
      role: authState.role,
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
      getRawData: vi.fn(),
      listRawDataVersions: vi.fn(),
    },
  };
});

describe("原始数据详情", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = "viewer";
    vi.mocked(api.getRawData).mockResolvedValue({
      id: 3,
      apiCode: "sale_return_order_page",
      sourcePrimaryKey: "R-1",
      sensitive: true,
      rawJson: { secret: "masked" },
      versionCount: 1,
    });
    vi.mocked(api.listRawDataVersions).mockResolvedValue({
      items: [
        {
          id: 4,
          batchNo: "BATCH-V1",
          dataHash: "hash-1",
          dataDate: "2026-08-25",
          observedAt: "2026-08-26T00:00:00Z",
          rawJson: { versionSecret: "version-visible" },
        },
      ],
    });
  });

  it("无精确上下文时不展示泛化任务和运行入口", async () => {
    vi.mocked(api.getRawData).mockResolvedValue({
      id: 3,
      apiCode: "amazon_shop_page",
      jijiaAccountId: 8,
      accountName: "测试账号",
      batchNo: "BATCH-ONLY",
    });
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/raw-data/3",
            state: {
              from: "/data/stores?keyword=demo",
              backLabel: "返回店铺信息",
              returnState: { preserved: true },
            },
          },
        ]}
      >
        <Routes>
          <Route path="/raw-data/:id" element={<RawDataDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const accountLink = await screen.findByRole("link", { name: "测试账号" });
    expect(accountLink).toHaveAttribute("href", "/accounts/8");
    expect(accountLink.closest("p")).toHaveTextContent("来源账号：测试账号");
    expect(accountLink.closest("p")).not.toHaveTextContent("业务编号");
    expect(screen.queryByRole("link", { name: "批次 BATCH-ONLY" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "浏览执行记录" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "数据来源链路" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← 返回店铺信息" })).toHaveAttribute(
      "href",
      "/data/stores?keyword=demo",
    );
  });

  it("存在来源业务主键时显示业务编号", async () => {
    vi.mocked(api.getRawData).mockResolvedValue({
      id: 3,
      apiCode: "amazon_shop_page",
      accountName: "测试账号",
      sourcePrimaryKey: "B081DY9881",
      dataDate: "2024-06-01",
      rawJson: { asin: "B081DY9881" },
    });

    render(
      <MemoryRouter initialEntries={["/raw-data/3"]}>
        <Routes>
          <Route path="/raw-data/:id" element={<RawDataDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const heading = await screen.findByRole("heading", { name: "amazon_shop_page" });
    expect(heading.parentElement?.querySelector("p")).toHaveTextContent(
      "来源账号：测试账号 · 业务编号：B081DY9881",
    );
  });

  it("Viewer 只看到元数据，完整 raw JSON 不出现在页面", async () => {
    render(
      <MemoryRouter initialEntries={["/raw-data/3"]}>
        <Routes>
          <Route path="/raw-data/:id" element={<RawDataDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("版本历史")).toBeInTheDocument();
    expect(screen.getByText("批次 BATCH-V1")).toBeInTheDocument();
    expect(screen.getByText(/完整原始 JSON 不可见/)).toBeInTheDocument();
    expect(screen.queryByText(/masked/)).not.toBeInTheDocument();
    expect(screen.queryByText(/version-visible/)).not.toBeInTheDocument();
  });

  it("从退货订单进入详情时保留原筛选返回路径", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/raw-data/3",
            state: { from: "/sale-returns?status=completed", label: "返回退货订单" },
          },
        ]}
      >
        <Routes>
          <Route path="/raw-data/:id" element={<RawDataDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "← 返回退货订单" })).toHaveAttribute(
      "href",
      "/sale-returns?status=completed",
    );
  });

  it("批次验证详情可返回对应任务、运行和筛选结果", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          "/raw-data/3?jijiaAccountId=8&apiCode=sale_return_order_page&observedBatchNo=BATCH-17&taskId=8&runId=17",
        ]}
      >
        <Routes>
          <Route path="/raw-data/:id" element={<RawDataDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "← 返回批次数据" })).toHaveAttribute(
      "href",
      "/raw-data?jijiaAccountId=8&apiCode=sale_return_order_page&observedBatchNo=BATCH-17&taskId=8&runId=17",
    );
    expect(screen.getAllByRole("link", { name: "返回任务" })[0]).toHaveAttribute(
      "href",
      "/jobs/8?runId=17#job-diagnostics",
    );
    expect(screen.getAllByRole("link", { name: "查看运行" })[0]).toHaveAttribute(
      "href",
      "/runs/17",
    );
    expect(screen.queryByRole("navigation", { name: "数据来源链路" })).not.toBeInTheDocument();
  });

  it("将浏览器时区并入最后观察字段", async () => {
    vi.mocked(api.getRawData).mockResolvedValue({
      id: 3,
      apiCode: "amazon_shop_page",
      lastObservedAt: "2026-09-14T02:51:00Z",
    });
    render(
      <MemoryRouter initialEntries={["/raw-data/3"]}>
        <Routes>
          <Route path="/raw-data/:id" element={<RawDataDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/^最后观察（.+）$/)).toBeInTheDocument();
    expect(screen.queryByText(/时间按浏览器时区/)).not.toBeInTheDocument();
  });

  it.each(["admin", "operator"] as const)("%s 可以查看当前和版本原始 JSON", async (role) => {
    authState.role = role;
    render(
      <MemoryRouter initialEntries={["/raw-data/3"]}>
        <Routes>
          <Route path="/raw-data/:id" element={<RawDataDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/masked/)).toBeInTheDocument();
    expect(screen.getByText(/version-visible/)).toBeInTheDocument();
  });

  it("可搜索、复制并比较两个 JSON 版本", async () => {
    authState.role = "admin";
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(
      <MemoryRouter initialEntries={["/raw-data/3"]}>
        <Routes>
          <Route path="/raw-data/:id" element={<RawDataDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText(/masked/);
    await user.type(screen.getByLabelText("搜索字段或值"), "secret");
    expect(screen.getByText("$.secret")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "复制 JSON" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("masked"));
    await chooseSelectOption(user, "版本 B", "版本 4 · BATCH-V1");
    expect(screen.getByText(/共 2 个字段发生变化/)).toBeInTheDocument();
  });

  it("手动刷新保留搜索、版本对比和旧内容，并阻止重复请求", async () => {
    authState.role = "admin";
    const refreshedDetail = deferred<RawDataDetail>();
    const refreshedVersions = deferred<RawDataVersionListResponse>();
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/raw-data/3"]}>
        <Routes>
          <Route path="/raw-data/:id" element={<RawDataDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText(/masked/);
    await user.type(screen.getByLabelText("搜索字段或值"), "secret");
    await chooseSelectOption(user, "版本 B", "版本 4 · BATCH-V1");
    vi.mocked(api.getRawData).mockReturnValue(refreshedDetail.promise);
    vi.mocked(api.listRawDataVersions).mockReturnValue(refreshedVersions.promise);

    await user.dblClick(screen.getByRole("button", { name: "刷新数据" }));

    expect(api.getRawData).toHaveBeenCalledTimes(2);
    expect(api.listRawDataVersions).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/正在刷新/)).toBeInTheDocument();
    expect(screen.getByLabelText("搜索字段或值")).toHaveValue("secret");
    expect(
      screen.getByRole("combobox", { name: "版本 B" }).closest(".ant-select"),
    ).toHaveTextContent("版本 4 · BATCH-V1");
    expect(screen.getAllByText(/masked/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/version-visible/).length).toBeGreaterThan(0);

    await act(async () => {
      refreshedDetail.resolve({
        id: 3,
        apiCode: "sale_return_order_page",
        sourcePrimaryKey: "R-1",
        sensitive: true,
        rawJson: { secret: "updated" },
        versionCount: 1,
      });
      refreshedVersions.reject(new Error("versions unavailable"));
      await refreshedVersions.promise.catch(() => undefined);
    });

    expect((await screen.findAllByText(/updated/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/version-visible/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("搜索字段或值")).toHaveValue("secret");
    expect(screen.getByRole("alert")).toHaveTextContent("版本历史加载失败，请稍后重试");
    expect(screen.getByRole("alert")).toHaveClass("ant-alert-warning");
    expect(screen.getByText(/刷新失败 · 仍显示/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新数据" })).toBeEnabled();
  });

  it("刷新后恢复已经加载的版本数量", async () => {
    const firstVersion = {
      id: 4,
      batchNo: "BATCH-V1",
      dataHash: "hash-1",
      observedAt: "2026-08-26T00:00:00Z",
    };
    const secondVersion = {
      id: 5,
      batchNo: "BATCH-V2",
      dataHash: "hash-2",
      observedAt: "2026-08-27T00:00:00Z",
    };
    let refreshStarted = false;
    vi.mocked(api.listRawDataVersions).mockImplementation(async (_id, cursor) => {
      if (cursor) {
        return {
          items: [
            refreshStarted ? { ...secondVersion, dataHash: "hash-2-refreshed" } : secondVersion,
          ],
        };
      }
      return {
        items: [refreshStarted ? { ...firstVersion, dataHash: "hash-1-refreshed" } : firstVersion],
        nextCursor: "page-2",
      };
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/raw-data/3"]}>
        <Routes>
          <Route path="/raw-data/:id" element={<RawDataDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText("hash-1");
    await user.click(screen.getByRole("button", { name: "加载更多版本" }));
    expect(await screen.findByText("hash-2")).toBeInTheDocument();
    refreshStarted = true;
    await user.click(screen.getByRole("button", { name: "刷新数据" }));

    expect(await screen.findByText("hash-1-refreshed")).toBeInTheDocument();
    expect(screen.getByText("hash-2-refreshed")).toBeInTheDocument();
    expect(api.listRawDataVersions).toHaveBeenCalledTimes(4);
  });

  it("刷新后继续加载被选中但已后移的版本", async () => {
    authState.role = "admin";
    let refreshStarted = false;
    vi.mocked(api.listRawDataVersions).mockImplementation(async (_id, cursor) => {
      if (!refreshStarted) {
        return {
          items: [
            {
              id: 4,
              batchNo: "BATCH-V1",
              dataHash: "hash-1",
              observedAt: "2026-08-26T00:00:00Z",
              rawJson: { versionSecret: "version-visible" },
            },
          ],
        };
      }
      if (cursor) {
        return {
          items: [
            {
              id: 4,
              batchNo: "BATCH-V1",
              dataHash: "hash-1",
              observedAt: "2026-08-26T00:00:00Z",
              rawJson: { versionSecret: "version-visible" },
            },
          ],
        };
      }
      return {
        items: [
          {
            id: 5,
            batchNo: "BATCH-V2",
            dataHash: "hash-2",
            observedAt: "2026-08-27T00:00:00Z",
          },
        ],
        nextCursor: "page-2",
      };
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/raw-data/3"]}>
        <Routes>
          <Route path="/raw-data/:id" element={<RawDataDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText(/masked/);
    await chooseSelectOption(user, "版本 B", "版本 4 · BATCH-V1");
    refreshStarted = true;
    await user.click(screen.getByRole("button", { name: "刷新数据" }));

    expect(await screen.findByText("批次 BATCH-V2")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "版本 B" }).closest(".ant-select"),
    ).toHaveTextContent("版本 4 · BATCH-V1");
    expect(api.listRawDataVersions).toHaveBeenCalledWith("3", "page-2");
  });

  it("刷新成功后清理已不存在的版本对比选择", async () => {
    authState.role = "admin";
    const replacementVersion = {
      id: 5,
      batchNo: "BATCH-V2",
      dataHash: "hash-2",
      observedAt: "2026-08-27T00:00:00Z",
      rawJson: { replacement: true },
    };
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/raw-data/3"]}>
        <Routes>
          <Route path="/raw-data/:id" element={<RawDataDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText(/masked/);
    await chooseSelectOption(user, "版本 B", "版本 4 · BATCH-V1");
    vi.mocked(api.listRawDataVersions).mockResolvedValue({ items: [replacementVersion] });
    await user.click(screen.getByRole("button", { name: "刷新数据" }));

    expect(await screen.findByText("批次 BATCH-V2")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "版本 B" }).closest(".ant-select"),
    ).toHaveTextContent("选择版本");
    expect(screen.queryByText(/个字段发生变化/)).not.toBeInTheDocument();
  });

  it("版本请求失败时仍展示已经成功加载的当前记录", async () => {
    vi.mocked(api.listRawDataVersions).mockRejectedValue(new Error("versions unavailable"));
    render(
      <MemoryRouter initialEntries={["/raw-data/3"]}>
        <Routes>
          <Route path="/raw-data/:id" element={<RawDataDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/R-1/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("版本历史加载失败，请稍后重试");
    expect(screen.queryByText("暂无版本历史")).not.toBeInTheDocument();
  });

  it("详情请求失败时仍展示已经成功加载的版本历史", async () => {
    vi.mocked(api.getRawData).mockRejectedValue(new Error("detail unavailable"));
    render(
      <MemoryRouter initialEntries={["/raw-data/3"]}>
        <Routes>
          <Route path="/raw-data/:id" element={<RawDataDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("批次 BATCH-V1")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("原始数据详情加载失败，请稍后重试");
    expect(screen.queryByText("暂无版本历史")).not.toBeInTheDocument();
  });

  it("切换记录后旧首屏请求迟到不能覆盖新记录", async () => {
    const oldDetail = deferred<RawDataDetail>();
    const oldVersions = deferred<RawDataVersionListResponse>();
    const newDetail = deferred<RawDataDetail>();
    const newVersions = deferred<RawDataVersionListResponse>();
    vi.mocked(api.getRawData).mockImplementation((id) =>
      String(id) === "3" ? oldDetail.promise : newDetail.promise,
    );
    vi.mocked(api.listRawDataVersions).mockImplementation((id) =>
      String(id) === "3" ? oldVersions.promise : newVersions.promise,
    );

    render(
      <MemoryRouter initialEntries={["/raw-data/3"]}>
        <Link to="/raw-data/4">切换到记录 4</Link>
        <Routes>
          <Route path="/raw-data/:id" element={<RawDataDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("link", { name: "切换到记录 4" }));
    await waitFor(() => expect(api.getRawData).toHaveBeenCalledTimes(2));

    await act(async () => {
      newDetail.resolve(rawDetail(4));
      newVersions.resolve({ items: [{ id: 41, dataHash: "hash-new" }] });
    });
    expect(screen.getByText(/R-4/)).toBeInTheDocument();
    expect(screen.getByText("hash-new")).toBeInTheDocument();

    await act(async () => {
      oldDetail.resolve(rawDetail(3));
      oldVersions.resolve({ items: [{ id: 31, dataHash: "hash-old" }] });
    });
    expect(screen.getByText(/R-4/)).toBeInTheDocument();
    expect(screen.getByText("hash-new")).toBeInTheDocument();
    expect(screen.queryByText(/R-3/)).not.toBeInTheDocument();
    expect(screen.queryByText("hash-old")).not.toBeInTheDocument();
  });

  it("旧记录的版本下一页迟到时不能追加到新记录", async () => {
    const oldNextPage = deferred<RawDataVersionListResponse>();
    vi.mocked(api.getRawData).mockImplementation(async (id) => rawDetail(Number(id)));
    vi.mocked(api.listRawDataVersions).mockImplementation((id, cursor) => {
      if (String(id) === "3" && cursor === "next-3") return oldNextPage.promise;
      if (String(id) === "3") {
        return Promise.resolve({
          items: [{ id: 31, dataHash: "hash-3" }],
          nextCursor: "next-3",
        });
      }
      return Promise.resolve({ items: [{ id: 41, dataHash: "hash-4" }] });
    });

    render(
      <MemoryRouter initialEntries={["/raw-data/3"]}>
        <Link to="/raw-data/4">切换到记录 4</Link>
        <Routes>
          <Route path="/raw-data/:id" element={<RawDataDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("hash-3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "加载更多版本" }));
    await waitFor(() => expect(api.listRawDataVersions).toHaveBeenCalledWith("3", "next-3"));

    fireEvent.click(screen.getByRole("link", { name: "切换到记录 4" }));
    expect(await screen.findByText(/R-4/)).toBeInTheDocument();
    expect(screen.getByText("hash-4")).toBeInTheDocument();

    await act(async () => {
      oldNextPage.resolve({ items: [{ id: 32, dataHash: "hash-3-late" }] });
    });
    expect(screen.queryByText("hash-3-late")).not.toBeInTheDocument();
    expect(screen.getByText("hash-4")).toBeInTheDocument();
  });

  it("路由提交时立即隐藏不属于当前 ID 的旧详情", async () => {
    const routeCommitText: string[] = [];
    const newDetail = deferred<RawDataDetail>();
    const newVersions = deferred<RawDataVersionListResponse>();
    vi.mocked(api.getRawData).mockImplementation((id) =>
      String(id) === "3" ? Promise.resolve(rawDetail(3)) : newDetail.promise,
    );
    vi.mocked(api.listRawDataVersions).mockImplementation((id) =>
      String(id) === "3"
        ? Promise.resolve({ items: [{ id: 31, dataHash: "hash-3" }] })
        : newVersions.promise,
    );

    render(
      <MemoryRouter initialEntries={["/raw-data/3"]}>
        <RawDetailRouteHarness onRouteCommit={(text) => routeCommitText.push(text)} />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/R-3/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "切换到记录 4" }));
    await waitFor(() => expect(routeCommitText).toHaveLength(1));
    expect(routeCommitText[0]).not.toContain("R-3");
    expect(routeCommitText[0]).toContain("正在加载原始数据详情");

    await act(async () => {
      newDetail.resolve(rawDetail(4));
      newVersions.resolve({ items: [] });
    });
  });

  it("旧记录请求拒绝和 finally 不能污染新记录加载状态", async () => {
    const oldDetail = deferred<RawDataDetail>();
    const oldVersions = deferred<RawDataVersionListResponse>();
    const newDetail = deferred<RawDataDetail>();
    const newVersions = deferred<RawDataVersionListResponse>();
    vi.mocked(api.getRawData).mockImplementation((id) =>
      String(id) === "3" ? oldDetail.promise : newDetail.promise,
    );
    vi.mocked(api.listRawDataVersions).mockImplementation((id) =>
      String(id) === "3" ? oldVersions.promise : newVersions.promise,
    );

    render(
      <MemoryRouter initialEntries={["/raw-data/3"]}>
        <Link to="/raw-data/4">切换到记录 4</Link>
        <Routes>
          <Route path="/raw-data/:id" element={<RawDataDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("link", { name: "切换到记录 4" }));
    await waitFor(() => expect(api.getRawData).toHaveBeenCalledTimes(2));

    await act(async () => {
      oldDetail.reject(new Error("旧详情失败"));
      oldVersions.reject(new Error("旧版本失败"));
      await Promise.all([
        oldDetail.promise.catch(() => undefined),
        oldVersions.promise.catch(() => undefined),
      ]);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("正在加载原始数据详情…")).toBeInTheDocument();

    await act(async () => {
      newDetail.resolve(rawDetail(4));
    });
    expect(screen.getByText(/R-4/)).toBeInTheDocument();
    expect(screen.getByText("正在加载版本历史…")).toBeInTheDocument();

    await act(async () => {
      newVersions.resolve({ items: [{ id: 41, batchNo: "BATCH-4", dataHash: "hash-4" }] });
    });
    expect(screen.getByText("批次 BATCH-4")).toBeInTheDocument();
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

function rawDetail(id: number): RawDataDetail {
  return {
    id,
    apiCode: "sale_return_order_page",
    sourcePrimaryKey: `R-${id}`,
    sensitive: true,
    versionCount: 1,
  };
}

function RawDetailRouteHarness({ onRouteCommit }: { onRouteCommit: (text: string) => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  useLayoutEffect(() => {
    if (location.pathname === "/raw-data/4") {
      onRouteCommit(document.body.textContent ?? "");
    }
  }, [location.pathname, onRouteCommit]);
  return (
    <>
      <button type="button" onClick={() => navigate("/raw-data/4")}>
        切换到记录 4
      </button>
      <Routes>
        <Route path="/raw-data/:id" element={<RawDataDetailPage />} />
      </Routes>
    </>
  );
}
