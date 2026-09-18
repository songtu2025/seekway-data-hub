import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api, ApiError } from "../api/client";
import type { RawDataListResponse } from "../api/types";
import { RawDataPage } from "./RawDataPage";
import { RawDataDetailPage } from "./RawDataDetailPage";

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
      listRawData: vi.fn(),
      getRawData: vi.fn(),
      listRawDataVersions: vi.fn(),
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

const secondAccount = { ...account, id: 9, accountCode: "acct_second", name: "欧洲业务账号" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
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

function CatalogReturnHarness() {
  const location = useLocation();
  return (
    <>
      <span>{`${location.pathname}${location.search}`}</span>
      <Link
        to="/raw-data?jijiaAccountId=8&apiCode=amazon_shop_page"
        state={{ from: `${location.pathname}${location.search}`, backLabel: "返回接口中心" }}
      >
        查看原始数据
      </Link>
    </>
  );
}

function RawNavigationHarness() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate(-1)}>
        浏览器后退
      </button>
      <button
        type="button"
        onClick={() =>
          navigate(
            "/raw-data?apiCode=sale_return_order_page&jijiaAccountId=8&syncBatchNo=BATCH-8&observedBatchNo=OBSERVED-9",
          )
        }
      >
        切换筛选
      </button>
      <Routes>
        <Route path="/raw-data" element={<RawDataPage />} />
        <Route path="/raw-data/:id" element={<RawDataDetailPage />} />
      </Routes>
    </>
  );
}

describe("原始数据列表", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listAccounts).mockResolvedValue([account]);
    vi.mocked(api.listRawData).mockResolvedValue({ items: [] });
    vi.mocked(api.getRawData).mockResolvedValue({ id: 2, apiCode: "restore" });
    vi.mocked(api.listRawDataVersions).mockResolvedValue({ items: [] });
  });

  it("为窄屏原始数据卡片提供完整字段标签", async () => {
    vi.mocked(api.listRawData).mockResolvedValue({
      items: [
        {
          id: 1,
          apiCode: "sale_return_order_page",
          jijiaAccountId: 8,
          accountName: "北美业务账号",
          sourcePrimaryKey: "RETURN-001",
          dataDate: "2026-08-26",
          observationCount: 1,
          versionCount: 0,
          lastObservedAt: "2026-08-26T08:00:00Z",
          updatedAt: "2026-08-26T08:00:00Z",
          batchNo: "batch-001",
        },
      ],
    });
    render(
      <MemoryRouter>
        <RawDataPage />
      </MemoryRouter>,
    );

    await screen.findByRole("link", { name: "sale_return_order_page" });
    const table = screen.getByRole("table", { name: "原始数据当前快照列表" });
    const wrapper = table.closest(".ant-table-wrapper");
    const labels = Array.from(table.querySelectorAll("tbody td"))
      .map((cell) => cell.getAttribute("data-label"))
      .filter(Boolean);

    expect(wrapper).toHaveClass("responsive-card-table");
    expect(labels).toEqual(["接口", "业务主键", "数据日期", "观察情况", "最后观察", "当前批次"]);
    expect(table.querySelector('td[data-label="业务主键"]')).toHaveAttribute(
      "data-card-width",
      "full",
    );
  });

  it("从接口中心进入原始列表，查询后仍能返回原账号与接口筛选", async () => {
    const user = userEvent.setup();
    const catalogPath = "/api-catalog?account=8&api=amazon_shop_page&q=shop";
    render(
      <MemoryRouter initialEntries={[catalogPath]}>
        <Routes>
          <Route path="/api-catalog" element={<CatalogReturnHarness />} />
          <Route path="/raw-data" element={<RawDataPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("link", { name: "查看原始数据" }));
    await screen.findByText("当前筛选没有匹配结果");
    await user.type(screen.getByLabelText("业务主键"), "shop-1");
    await user.click(screen.getByRole("button", { name: /^查\s*询$/ }));
    await waitFor(() =>
      expect(api.listRawData).toHaveBeenLastCalledWith(
        expect.objectContaining({ sourcePrimaryKey: "shop-1" }),
      ),
    );
    const back = screen.getByRole("link", { name: "← 返回接口中心" });
    expect(back).toHaveAttribute("href", catalogPath);
    await user.click(back);
    expect(screen.getByText(catalogPath)).toBeInTheDocument();
  });

  it.each(["← 返回原始数据", "浏览器后退"])(
    "通过 %s 恢复详情来源的分页上下文",
    async (returnLabel) => {
      vi.mocked(api.listRawData).mockImplementation(async (params = {}) => ({
        items: [
          {
            id: params.cursor ? 2 : 1,
            apiCode: "restore",
            sourcePrimaryKey: params.cursor ? "SECOND" : "FIRST",
          },
        ],
        nextCursor: params.cursor ? null : "next-page",
      }));
      const user = userEvent.setup();
      render(
        <MemoryRouter
          initialEntries={[
            {
              pathname: "/raw-data",
              search: "?apiCode=restore",
              state: {
                rawPagination: {
                  filterKey: JSON.stringify(["", "restore", "", "", "", "", ""]),
                  pageIndex: 0,
                  pageSize: 50,
                  pageCursors: [undefined],
                },
              },
            },
          ]}
        >
          <RawNavigationHarness />
        </MemoryRouter>,
      );
      await screen.findByText("FIRST");
      await user.click(screen.getByRole("button", { name: "下一页" }));
      await screen.findByText("SECOND");
      await user.click(screen.getByRole("link", { name: "restore" }));
      await screen.findByRole("heading", { name: "restore" });
      await user.click(
        screen.getByRole(returnLabel === "浏览器后退" ? "button" : "link", { name: returnLabel }),
      );
      await screen.findByText("SECOND");
      expect(screen.getByLabelText("接口编码")).toHaveValue("restore");
      expect(screen.getByText("第 2 页 · 1 条 · 已应用筛选")).toBeInTheDocument();
      expect(api.listRawData).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: "next-page", limit: 50, apiCode: "restore" }),
      );
      await user.click(screen.getByRole("button", { name: "上一页" }));
      await screen.findByText("FIRST");
      expect(api.listRawData).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: undefined, limit: 50 }),
      );
      expect(api.listRawData).toHaveBeenCalledTimes(4);
    },
  );

  it("同条件查询可以重试，失败时不显示成功空态", async () => {
    vi.mocked(api.listRawData)
      .mockRejectedValueOnce(new Error("离线"))
      .mockResolvedValueOnce({
        items: [{ id: 1, apiCode: "retry", sourcePrimaryKey: "RECOVERED" }],
      });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/raw-data?apiCode=retry"]}>
        <RawDataPage />
      </MemoryRouter>,
    );
    await screen.findByRole("alert");
    expect(screen.queryByText("当前筛选没有匹配结果")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^查\s*询$/ }));
    expect(await screen.findByText("RECOVERED")).toBeInTheDocument();
    expect(api.listRawData).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([false, true])("严格模式恢复分页并处理失效游标：%s", async (invalidCursor) => {
    vi.mocked(api.listRawData).mockImplementation(async (params = {}) => {
      if (invalidCursor && params.cursor) throw new ApiError("分页游标无效", 422, "CURSOR_INVALID");
      return {
        items: [
          { id: 2, apiCode: "restore", sourcePrimaryKey: params.cursor ? "RESTORED" : "FIRST" },
        ],
      };
    });
    render(
      <StrictMode>
        <MemoryRouter
          initialEntries={[
            {
              pathname: "/raw-data",
              search: "?apiCode=restore",
              state: {
                rawPagination: {
                  filterKey: JSON.stringify(["", "restore", "", "", "", "", ""]),
                  pageIndex: 1,
                  pageSize: 50,
                  pageCursors: [undefined, "saved"],
                },
              },
            },
          ]}
        >
          <RawDataPage />
        </MemoryRouter>
      </StrictMode>,
    );
    await screen.findByText(invalidCursor ? "FIRST" : "RESTORED");
    expect(api.listRawData).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 50, cursor: invalidCursor ? undefined : "saved" }),
    );
    if (invalidCursor)
      expect(screen.getByText("原分页位置已失效，已返回第一页。")).toBeInTheDocument();
  });

  it("按账号、接口、业务主键、数据日期和批次精确查询", async () => {
    vi.mocked(api.listRawData)
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({
        items: [{ id: 3, apiCode: "sale_return_order_page", sourcePrimaryKey: "R-3" }],
      });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/raw-data"]}>
        <RawDataPage />
      </MemoryRouter>,
    );

    await screen.findByText("尚未同步原始数据");
    await chooseSelectOption(user, "积加账号", "北美业务账号");
    await user.type(screen.getByLabelText("接口编码"), "sale_return_order_page");
    await user.click(screen.getByText("日期与批次筛选"));
    await user.type(screen.getByLabelText("最后观察批次号"), "BATCH-8");
    await user.type(screen.getByLabelText("曾观察批次号"), "OBSERVED-8");
    await user.type(screen.getByLabelText("业务主键"), "R-3");
    await user.type(screen.getByLabelText("数据开始日期"), "2026-08-01");
    await user.type(screen.getByLabelText("数据结束日期"), "2026-08-31");
    await user.click(screen.getByRole("button", { name: /^查\s*询$/ }));

    const recordLink = await screen.findByRole("link", { name: "sale_return_order_page" });
    expect(recordLink.closest(".table-cell-stack")).toBeInTheDocument();
    expect(api.listRawData).toHaveBeenLastCalledWith({
      cursor: undefined,
      limit: 20,
      jijiaAccountId: 8,
      apiCode: "sale_return_order_page",
      syncBatchNo: "BATCH-8",
      observedBatchNo: "OBSERVED-8",
      sourcePrimaryKey: "R-3",
      dataDateStart: "2026-08-01",
      dataDateEnd: "2026-08-31",
    });
  }, 10_000);

  it("从任务进入时展示执行验证上下文并传递到记录详情", async () => {
    vi.mocked(api.listRawData).mockResolvedValue({
      items: [{ id: 3, apiCode: "sale_return_order_page", sourcePrimaryKey: "R-3" }],
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          "/raw-data?jijiaAccountId=8&apiCode=sale_return_order_page&observedBatchNo=BATCH-17&taskId=8&runId=17&runStatus=success&windowStart=2021-01-01&windowEnd=2021-01-31",
        ]}
      >
        <RawDataPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "正在验证任务 #8 的执行结果" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2021-01-01 至 2021-01-31")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回任务" })).toHaveAttribute(
      "href",
      "/jobs/8?runId=17#job-diagnostics",
    );
    expect(screen.getByRole("link", { name: "查看技术日志" })).toHaveAttribute("href", "/runs/17");
    expect(screen.getByRole("link", { name: "退出验证" })).toHaveAttribute("href", "/raw-data");
    expect(screen.getByRole("link", { name: "sale_return_order_page" })).toHaveAttribute(
      "href",
      "/raw-data/3?jijiaAccountId=8&apiCode=sale_return_order_page&observedBatchNo=BATCH-17&taskId=8&runId=17&runStatus=success&windowStart=2021-01-01&windowEnd=2021-01-31",
    );

    await user.type(screen.getByLabelText("业务主键"), "R-3");
    await user.click(screen.getByRole("button", { name: /^查\s*询$/ }));
    expect(
      await screen.findByRole("heading", { name: "正在验证任务 #8 的执行结果" }),
    ).toBeInTheDocument();
    expect(api.listRawData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        limit: 20,
        jijiaAccountId: 8,
        observedBatchNo: "BATCH-17",
        sourcePrimaryKey: "R-3",
      }),
    );
    await user.click(screen.getByRole("button", { name: "清除附加筛选" }));
    expect(screen.getByRole("heading", { name: "正在验证任务 #8 的执行结果" })).toBeInTheDocument();
    expect(screen.getByLabelText("业务主键")).toHaveValue("");
  });

  it.each([
    ["success", "执行完成，未找到该批次关联的数据"],
    ["failed", "执行存在失败，未找到可验证数据"],
  ])("按执行状态 %s 解释批次空结果", async (runStatus, expectedTitle) => {
    render(
      <MemoryRouter
        initialEntries={[
          `/raw-data?jijiaAccountId=8&apiCode=sale_return_order_page&observedBatchNo=BATCH-17&taskId=8&runId=17&runStatus=${runStatus}`,
        ]}
      >
        <RawDataPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(expectedTitle)).toBeInTheDocument();
    if (runStatus === "success") {
      expect(screen.getByText(/空列表不代表接口未返回数据/)).toBeInTheDocument();
    }
  });

  it("下一页时沿用 URL 筛选并替换当前页", async () => {
    vi.mocked(api.listRawData)
      .mockResolvedValueOnce({
        items: [{ id: 1, apiCode: "sale_return_order_page", sourcePrimaryKey: "R-1" }],
        nextCursor: "raw-next",
      })
      .mockResolvedValueOnce({
        items: [{ id: 2, apiCode: "sale_return_order_page", sourcePrimaryKey: "R-2" }],
        nextCursor: null,
      });
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          "/raw-data?apiCode=sale_return_order_page&jijiaAccountId=8&syncBatchNo=BATCH-8&observedBatchNo=OBSERVED-8",
        ]}
      >
        <RawDataPage />
      </MemoryRouter>,
    );

    await screen.findByText("R-1");
    expect(screen.getByLabelText("最后观察批次号")).toHaveValue("BATCH-8");
    expect(screen.getByLabelText("曾观察批次号")).toHaveValue("OBSERVED-8");
    expect(screen.getByText(/筛选当前记录的最后观察批次/)).toBeInTheDocument();
    expect(screen.getByText(/当前快照或历史版本仍关联本批次的记录/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "下一页" }));

    expect(await screen.findByText("R-2")).toBeInTheDocument();
    expect(screen.queryByText("R-1")).not.toBeInTheDocument();
    expect(api.listRawData).toHaveBeenLastCalledWith({
      cursor: "raw-next",
      limit: 20,
      jijiaAccountId: 8,
      apiCode: "sale_return_order_page",
      syncBatchNo: "BATCH-8",
      observedBatchNo: "OBSERVED-8",
    });
  });

  it("URL 仅切换曾观察批次后忽略旧首屏的延迟结果", async () => {
    const oldInitial = deferred<RawDataListResponse>();
    vi.mocked(api.listAccounts).mockResolvedValue([account, secondAccount]);
    vi.mocked(api.listRawData)
      .mockReturnValueOnce(oldInitial.promise)
      .mockResolvedValueOnce({
        items: [{ id: 9, apiCode: "sale_return_order_page", sourcePrimaryKey: "NEW-FILTER" }],
      });
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          "/raw-data?apiCode=sale_return_order_page&jijiaAccountId=8&syncBatchNo=BATCH-8&observedBatchNo=OBSERVED-8",
        ]}
      >
        <RawNavigationHarness />
      </MemoryRouter>,
    );

    await waitFor(() => expect(api.listRawData).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "切换筛选" }));
    expect(await screen.findByText("NEW-FILTER")).toBeInTheDocument();

    await act(async () => {
      oldInitial.resolve({
        items: [{ id: 8, apiCode: "sale_return_order_page", sourcePrimaryKey: "OLD-FILTER" }],
      });
      await oldInitial.promise;
    });

    expect(screen.queryByText("OLD-FILTER")).not.toBeInTheDocument();
    expect(screen.getByText("NEW-FILTER")).toBeInTheDocument();
    expect(api.listRawData).toHaveBeenLastCalledWith({
      cursor: undefined,
      limit: 20,
      jijiaAccountId: 8,
      apiCode: "sale_return_order_page",
      syncBatchNo: "BATCH-8",
      observedBatchNo: "OBSERVED-9",
    });
  });

  it("URL 仅切换曾观察批次后忽略旧筛选的延迟下一页", async () => {
    const oldNextPage = deferred<RawDataListResponse>();
    vi.mocked(api.listAccounts).mockResolvedValue([account, secondAccount]);
    vi.mocked(api.listRawData)
      .mockResolvedValueOnce({
        items: [{ id: 1, apiCode: "sale_return_order_page", sourcePrimaryKey: "OLD-FIRST" }],
        nextCursor: "old-next",
      })
      .mockReturnValueOnce(oldNextPage.promise)
      .mockResolvedValueOnce({
        items: [{ id: 9, apiCode: "sale_return_order_page", sourcePrimaryKey: "NEW-FIRST" }],
      });
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          "/raw-data?apiCode=sale_return_order_page&jijiaAccountId=8&syncBatchNo=BATCH-8&observedBatchNo=OBSERVED-8",
        ]}
      >
        <RawNavigationHarness />
      </MemoryRouter>,
    );

    await screen.findByText("OLD-FIRST");
    await user.click(screen.getByRole("button", { name: "下一页" }));
    await waitFor(() =>
      expect(api.listRawData).toHaveBeenLastCalledWith({
        cursor: "old-next",
        limit: 20,
        jijiaAccountId: 8,
        apiCode: "sale_return_order_page",
        syncBatchNo: "BATCH-8",
        observedBatchNo: "OBSERVED-8",
      }),
    );
    await user.click(screen.getByRole("button", { name: "切换筛选" }));
    expect(await screen.findByText("NEW-FIRST")).toBeInTheDocument();

    await act(async () => {
      oldNextPage.resolve({
        items: [{ id: 2, apiCode: "sale_return_order_page", sourcePrimaryKey: "OLD-LATE" }],
      });
      await oldNextPage.promise;
    });

    expect(screen.queryByText("OLD-LATE")).not.toBeInTheDocument();
    expect(screen.getByText("NEW-FIRST")).toBeInTheDocument();
  });
});
