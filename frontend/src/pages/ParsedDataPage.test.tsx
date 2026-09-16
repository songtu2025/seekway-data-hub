import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/client";
import type { ParsedDataItem } from "../api/types";
import { ParsedDataPage } from "./ParsedDataPage";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    csrfToken: "csrf-token",
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
      listParsedData: vi.fn(),
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
  lastVerifiedAt: "2026-09-06T02:42:00Z",
  lastVerifyError: null,
  createdAt: "2026-09-06T02:00:00Z",
  updatedAt: "2026-09-06T02:42:00Z",
};

const storeItem: ParsedDataItem = {
  id: "91:70",
  rawDataId: 91,
  jijiaAccountId: 8,
  accountName: "北美业务账号",
  apiCode: "amazon_shop_page",
  dataDate: "2026-09-06",
  lastObservedAt: "2026-09-06T08:00:00Z",
  fields: {
    marketId: 70,
    store: "北美旗舰店",
    marketName: "Amazon.com",
    countryName: "美国",
    areaName: "北美",
    apiState: "Normal",
    adsState: "Successfully",
    warehouseName: "FBA",
    authType: "SP-API",
    recordDate: "2026-09-05 12:00:00",
  },
};

const nextStoreItem: ParsedDataItem = {
  ...storeItem,
  id: "92:71",
  rawDataId: 92,
  fields: {
    ...storeItem.fields,
    store: "第二页店铺",
    marketName: "Amazon.ca",
  },
};

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

function ParsedReturnTarget() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <Link to={location.state.from} state={location.state.returnState}>
        返回店铺信息
      </Link>
      <button onClick={() => navigate(-1)}>浏览器后退</button>
    </>
  );
}

describe("数据中心通用解析页", () => {
  it("同条件加载中重复提交不产生额外请求", async () => {
    let resolve!: (value: { items: ParsedDataItem[] }) => void;
    vi.mocked(api.listParsedData).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ParsedDataPage dataset="stores" />
      </MemoryRouter>,
    );
    await user.dblClick(screen.getByRole("button", { name: /^查\s*询$/ }));
    expect(api.listParsedData).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ items: [] }));
    await screen.findByText("尚无店铺信息数据");
  });
  it("失败不显示空结果且同条件查询可以重试", async () => {
    vi.mocked(api.listParsedData).mockRejectedValueOnce(new Error("失败"));
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ParsedDataPage dataset="stores" />
      </MemoryRouter>,
    );
    await screen.findByRole("alert");
    expect(screen.queryByText("尚无店铺信息数据")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^查\s*询$/ }));
    await screen.findByText("尚无店铺信息数据");
    expect(api.listParsedData).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
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
        apiCode: "amazon_shop_page",
        name: "查询亚马逊店铺列表",
        method: "POST",
        path: "/amazon/shop/page",
        domain: "amazon",
        catalogEnabled: true,
        platformEnabled: true,
        systemConfigured: true,
        supportsDateWindow: false,
        accountEnabled: true,
        recentRunStatus: "success",
        recentRunAt: "2026-09-06T08:00:00Z",
        rawRecordCount: 1,
        hasData: true,
      },
    ]);
    vi.mocked(api.listSyncJobs).mockResolvedValue({ items: [] });
    vi.mocked(api.createSyncJob).mockResolvedValue({ jobId: 99, taskNo: "task_99" });
    vi.mocked(api.listParsedData).mockResolvedValue({ items: [] });
  });

  it.each(["返回店铺信息", "浏览器后退"])(
    "%s 恢复业务列表第二页，再切筛选回第一页",
    async (label) => {
      const user = userEvent.setup();
      vi.mocked(api.listParsedData).mockImplementation(async (_dataset, params) => ({
        items: [params?.cursor ? nextStoreItem : storeItem],
        nextCursor: params?.cursor ? null : "parsed-next",
      }));
      render(
        <MemoryRouter initialEntries={["/data/stores?jijiaAccountId=8&keyword=Amazon"]}>
          <Routes>
            <Route path="/data/stores" element={<ParsedDataPage dataset="stores" />} />
            <Route path="/raw-data/:id" element={<ParsedReturnTarget />} />
          </Routes>
        </MemoryRouter>,
      );
      await screen.findByText("北美旗舰店");
      await user.click(screen.getByRole("button", { name: "下一页" }));
      await screen.findByText("第二页店铺");
      await user.click(screen.getByRole("link", { name: "查看原始记录" }));
      await user.click(
        screen.getByRole(label === "浏览器后退" ? "button" : "link", { name: label }),
      );
      await screen.findByText("第二页店铺");
      expect(screen.getByLabelText("关键词")).toHaveValue("Amazon");
      expect(api.listParsedData).toHaveBeenLastCalledWith(
        "stores",
        expect.objectContaining({ cursor: "parsed-next", jijiaAccountId: 8, keyword: "Amazon" }),
      );
      await user.clear(screen.getByLabelText("关键词"));
      await user.type(screen.getByLabelText("关键词"), "new");
      await user.click(screen.getByRole("button", { name: /^查\s*询$/ }));
      await screen.findByText("北美旗舰店");
      expect(screen.getByText("第 1 页 · 1 条")).toBeInTheDocument();
      expect(api.listParsedData).toHaveBeenLastCalledWith(
        "stores",
        expect.objectContaining({ cursor: undefined, keyword: "new" }),
      );
    },
  );

  it("展示店铺解析字段并链接原始数据", async () => {
    vi.mocked(api.listParsedData).mockResolvedValue({ items: [storeItem] });

    render(
      <MemoryRouter>
        <ParsedDataPage dataset="stores" />
      </MemoryRouter>,
    );

    const storeLink = await screen.findByRole("link", { name: "查看原始记录" });
    expect(storeLink).toHaveAttribute("href", "/raw-data/91");
    expect(screen.queryByRole("link", { name: /北美旗舰店/ })).not.toBeInTheDocument();
    expect(screen.getByText("北美旗舰店")).toBeInTheDocument();
    expect(screen.getByText("Amazon.com")).toBeInTheDocument();
    expect(screen.getByText("SP-API")).toBeInTheDocument();
    expect(screen.getByText("Successfully")).toBeInTheDocument();
  });

  it("提交账号和关键词筛选", async () => {
    const user = userEvent.setup();
    vi.mocked(api.listParsedData)
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [storeItem] });

    render(
      <MemoryRouter>
        <ParsedDataPage dataset="stores" />
      </MemoryRouter>,
    );
    await screen.findByText("尚无店铺信息数据");
    await chooseSelectOption(user, "积加账号", "北美业务账号");
    await user.type(screen.getByLabelText("关键词"), "Amazon.com");
    await user.click(screen.getByRole("button", { name: /^查\s*询$/ }));

    expect(await screen.findByText("北美旗舰店")).toBeInTheDocument();
    expect(api.listParsedData).toHaveBeenCalledTimes(2);
    expect(api.listParsedData).toHaveBeenLastCalledWith("stores", {
      cursor: undefined,
      limit: 20,
      jijiaAccountId: 8,
      keyword: "Amazon.com",
    });
  });

  it("支持切换每页条数并用游标翻页", async () => {
    const user = userEvent.setup();
    vi.mocked(api.listParsedData)
      .mockResolvedValueOnce({ items: [storeItem], nextCursor: "parsed-next" })
      .mockResolvedValueOnce({ items: [nextStoreItem], nextCursor: null })
      .mockResolvedValueOnce({ items: [storeItem], nextCursor: null });

    render(
      <MemoryRouter>
        <ParsedDataPage dataset="stores" />
      </MemoryRouter>,
    );

    expect(await screen.findByText("北美旗舰店")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(await screen.findByText("第二页店铺")).toBeInTheDocument();
    expect(api.listParsedData).toHaveBeenLastCalledWith("stores", {
      cursor: "parsed-next",
      limit: 20,
      jijiaAccountId: undefined,
      keyword: undefined,
    });

    await chooseSelectOption(user, "每页条数", "100 条");
    expect(await screen.findByText("北美旗舰店")).toBeInTheDocument();
    expect(api.listParsedData).toHaveBeenLastCalledWith("stores", {
      cursor: undefined,
      limit: 100,
      jijiaAccountId: undefined,
      keyword: undefined,
    });
  });

  it("无库存快照时显示对应接口编码", async () => {
    render(
      <MemoryRouter>
        <ParsedDataPage dataset="inventory" />
      </MemoryRouter>,
    );

    expect(await screen.findByText("尚无FBA 库存数据")).toBeInTheDocument();
    expect(screen.getAllByText(/fba_inventory_v2_page/).length).toBeGreaterThan(0);
  });
});
