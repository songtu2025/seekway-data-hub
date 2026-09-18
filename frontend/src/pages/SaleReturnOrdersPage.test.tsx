import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/client";
import type { SaleReturnOrderListResponse } from "../api/types";
import { SaleReturnOrdersPage } from "./SaleReturnOrdersPage";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    csrfToken: null,
    user: {
      id: 3,
      email: "operator@example.com",
      displayName: "操作员",
      role: "operator",
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
      getApiCatalog: vi.fn(),
      getWorkerRuntime: vi.fn(),
      listSyncJobs: vi.fn(),
      createSyncJob: vi.fn(),
      listSaleReturnOrders: vi.fn(),
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

const order = {
  id: 1,
  jijiaAccountId: 8,
  accountName: "北美业务账号",
  rawDataId: 91,
  sourcePrimaryKey: "return-1",
  returnDateTime: "2021-08-01T09:30:00",
  orderId: "order-1",
  sellerOrderId: "seller-1",
  asin: "asin-1",
  sku: "sku-1",
  quantity: 1,
  disposition: "SELLABLE",
  status: "completed",
  dataHash: "hash-1",
  syncBatchNo: "sync-1",
};

const nextOrder = {
  ...order,
  id: 2,
  rawDataId: 92,
  sourcePrimaryKey: "return-2",
  orderId: "order-2",
  sellerOrderId: "seller-2",
  sku: "sku-2",
};

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

describe("退货订单列表", () => {
  it("同条件加载中重复提交不产生额外请求", async () => {
    const pending = deferred<SaleReturnOrderListResponse>();
    vi.mocked(api.listSaleReturnOrders).mockReturnValueOnce(pending.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SaleReturnOrdersPage />
      </MemoryRouter>,
    );
    await user.dblClick(screen.getByRole("button", { name: /^查\s*询$/ }));
    expect(api.listSaleReturnOrders).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ items: [] }));
    await screen.findByText("尚未同步退货订单接口");
  });
  it("失败不显示空结果且同条件查询可以重试", async () => {
    vi.mocked(api.listSaleReturnOrders)
      .mockRejectedValueOnce(new Error("失败"))
      .mockResolvedValueOnce({ items: [] });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SaleReturnOrdersPage />
      </MemoryRouter>,
    );
    await screen.findByRole("alert");
    expect(screen.queryByText("尚未同步退货订单接口")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^查\s*询$/ }));
    await screen.findByText("尚未同步退货订单接口");
    expect(api.listSaleReturnOrders).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listAccounts).mockResolvedValue([account]);
    vi.mocked(api.getWorkerRuntime).mockResolvedValue({
      availability: "online",
      capacityStatus: "ready",
      configuredWorkerCount: 1,
      onlineWorkerCount: 1,
      busyWorkerCount: 0,
      idleWorkerCount: 1,
      staleWorkerCount: 0,
      heartbeatAt: "2026-09-06T08:00:00Z",
      currentJobId: null,
      queueDepth: 0,
      oldestQueuedAt: null,
      pollIntervalSeconds: 5,
      offlineAfterSeconds: 30,
    });
    vi.mocked(api.getApiCatalog).mockResolvedValue([
      {
        apiCode: "sale_return_order_page",
        name: "查询退货订单列表",
        method: "POST",
        path: "/operation/sale/returnOrder/page",
        domain: "sale",
        catalogEnabled: true,
        platformEnabled: true,
        systemConfigured: true,
        supportsDateWindow: true,
        accountEnabled: true,
        recentRunStatus: "success",
        recentRunAt: "2026-09-06T08:00:00Z",
        rawRecordCount: 1,
        hasData: true,
      },
    ]);
    vi.mocked(api.listSyncJobs).mockResolvedValue({ items: [] });
    vi.mocked(api.createSyncJob).mockResolvedValue({ jobId: 99, taskNo: "task_99" });
    vi.mocked(api.listSaleReturnOrders).mockResolvedValue({ items: [] });
  });

  it("展示当前结构化记录并链接原始数据", async () => {
    vi.mocked(api.listSaleReturnOrders).mockResolvedValue({ items: [order] });
    render(
      <MemoryRouter>
        <SaleReturnOrdersPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("2021-08-01 09:30:00")).toBeInTheDocument();
    const orderLink = screen.getByRole("button", { name: "order-1" });
    expect(orderLink.closest(".ant-table-wrapper")).toHaveClass(
      "sale-return-table",
      "responsive-card-table",
    );
    expect(orderLink.closest("td")).toHaveAttribute("data-label", "订单与商品");
    expect(orderLink.closest("td")).toHaveAttribute("data-card-width", "full");
    expect(screen.queryByRole("link", { name: "order-1" })).not.toBeInTheDocument();
    expect(orderLink.closest(".table-cell-stack")).toHaveTextContent("seller-1");
    expect(screen.getByText("SELLABLE")).toBeInTheDocument();
    expect(screen.getAllByText("北美业务账号").length).toBeGreaterThanOrEqual(2);
  });

  it("提交账号、日期、状态、订单号和 SKU 筛选", async () => {
    vi.mocked(api.listSaleReturnOrders)
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [order] });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SaleReturnOrdersPage />
      </MemoryRouter>,
    );

    await screen.findByText("尚未同步退货订单接口");
    await chooseSelectOption(user, "积加账号", "北美业务账号");
    await user.type(screen.getByLabelText("退货状态"), "completed");
    await user.type(screen.getByLabelText("退货开始日期"), "2021-08-01");
    await user.type(screen.getByLabelText("退货结束日期"), "2021-08-31");
    await user.type(screen.getByLabelText("订单编号"), "order-1");
    await user.click(screen.getByText("商品与仓库筛选", { exact: true }));
    await user.type(screen.getByLabelText("SKU"), "sku-1");
    await user.click(screen.getByRole("button", { name: /^查\s*询$/ }));

    expect(await screen.findByRole("button", { name: "order-1" })).toBeInTheDocument();
    expect(api.listSaleReturnOrders).toHaveBeenLastCalledWith({
      cursor: undefined,
      limit: 20,
      jijiaAccountId: 8,
      status: "completed",
      returnDateStart: "2021-08-01",
      returnDateEnd: "2021-08-31",
      orderId: "order-1",
      sku: "sku-1",
    });
  }, 10_000);

  it("支持每页条数和游标翻页", async () => {
    vi.mocked(api.listSaleReturnOrders)
      .mockResolvedValueOnce({ items: [order], nextCursor: "return-next" })
      .mockResolvedValueOnce({ items: [nextOrder], nextCursor: null })
      .mockResolvedValueOnce({ items: [order], nextCursor: null });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SaleReturnOrdersPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: "order-1" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(await screen.findByRole("button", { name: "order-2" })).toBeInTheDocument();
    expect(api.listSaleReturnOrders).toHaveBeenLastCalledWith({
      cursor: "return-next",
      limit: 20,
      jijiaAccountId: undefined,
      status: undefined,
      returnDateStart: undefined,
      returnDateEnd: undefined,
      orderId: undefined,
      sku: undefined,
    });

    await chooseSelectOption(user, "每页条数", "50 条");
    expect(await screen.findByRole("button", { name: "order-1" })).toBeInTheDocument();
    expect(api.listSaleReturnOrders).toHaveBeenLastCalledWith({
      cursor: undefined,
      limit: 50,
      jijiaAccountId: undefined,
      status: undefined,
      returnDateStart: undefined,
      returnDateEnd: undefined,
      orderId: undefined,
      sku: undefined,
    });
  });

  it("旧筛选返回不能覆盖新筛选", async () => {
    const oldRequest = deferred<SaleReturnOrderListResponse>();
    const currentRequest = deferred<SaleReturnOrderListResponse>();
    vi.mocked(api.listSaleReturnOrders)
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(currentRequest.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SaleReturnOrdersPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("SKU"), "sku-1");
    await user.click(screen.getByRole("button", { name: /^查\s*询$/ }));
    expect(await screen.findByText("正在查询 · 已应用筛选")).toBeInTheDocument();

    await act(async () => {
      oldRequest.resolve({ items: [] });
    });
    expect(screen.getByText("正在查询 · 已应用筛选")).toBeInTheDocument();

    await act(async () => {
      currentRequest.resolve({ items: [order] });
    });
    expect(screen.getByRole("button", { name: "order-1" })).toBeInTheDocument();
  });
});
