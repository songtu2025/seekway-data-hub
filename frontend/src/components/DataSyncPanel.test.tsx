import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/client";
import type { ApiCatalogItem, JijiaAccount, SyncJob } from "../api/types";
import { DataSyncPanel } from "./DataSyncPanel";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    csrfToken: "csrf-token",
    user: {
      id: 3,
      email: "operator@example.com",
      displayName: "操作员",
      role: "operator",
    },
  }),
}));

vi.mock("../api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api/client")>();
  return {
    ...original,
    api: {
      ...original.api,
      getApiCatalog: vi.fn(),
      getWorkerRuntime: vi.fn(),
      listSyncJobs: vi.fn(),
      createSyncJob: vi.fn(),
    },
  };
});

const account: JijiaAccount = {
  id: 8,
  accountCode: "acct_demo",
  name: "北美业务账号",
  maskedAppId: "•••• 8J2K",
  credentialSource: "encrypted",
  status: "active",
  lastVerifiedAt: "2026-09-06T02:42:00Z",
  lastVerifyError: null,
  createdAt: "2026-09-06T02:00:00Z",
  updatedAt: "2026-09-06T02:42:00Z",
};

describe("DataSyncPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        rawRecordCount: 12,
        hasData: true,
      },
    ]);
    vi.mocked(api.listSyncJobs).mockResolvedValue({ items: [] });
    vi.mocked(api.createSyncJob).mockResolvedValue({ jobId: 99, taskNo: "task_99" });
  });

  it("为当前接口创建同步任务", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <DataSyncPanel
          accounts={[account]}
          apiCode="amazon_shop_page"
          displayName="店铺信息"
          loadedCount={3}
          selectedAccountId=""
          onSynced={vi.fn()}
        />
      </MemoryRouter>,
    );

    const syncButton = await screen.findByRole("button", { name: "按进度同步" });
    expect(syncButton).toHaveClass("ant-btn-variant-solid");
    expect(screen.getByText("查询亚马逊店铺列表")).toBeInTheDocument();
    expect(screen.getByText("amazon_shop_page")).toBeInTheDocument();
    expect(screen.getByText("可以按当前进度同步")).toBeInTheDocument();
    expect(screen.getByText("将从已保存的同步进度继续。")).toBeInTheDocument();
    await user.click(syncButton);

    expect(screen.getByRole("link", { name: "自定义同步范围" })).toHaveAttribute(
      "href",
      "/jobs/new?apiCode=amazon_shop_page&accountId=8",
    );
    expect(api.createSyncJob).toHaveBeenCalledWith(
      {
        jijiaAccountId: 8,
        apiCode: "amazon_shop_page",
        rangeMode: "checkpoint",
      },
      "csrf-token",
    );
    expect(await screen.findByText("同步任务已排队")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看最新数据" })).not.toBeInTheDocument();
  });

  it("后续页同步完成后保留当前位置并由用户查看最新数据", async () => {
    const completedJob: SyncJob = {
      id: 99,
      apiCode: "amazon_shop_page",
      jobType: "sync",
      status: "success",
    };
    vi.mocked(api.listSyncJobs)
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [completedJob] });
    const onSynced = vi.fn();
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <DataSyncPanel
          accounts={[account]}
          apiCode="amazon_shop_page"
          displayName="店铺信息"
          loadedCount={10}
          preservePageOnSync
          selectedAccountId=""
          onSynced={onSynced}
        />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "按进度同步" }));

    expect(await screen.findByText("同步完成，有新数据可查看")).toBeInTheDocument();
    expect(onSynced).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "查看最新数据" }));
    expect(onSynced).toHaveBeenCalledOnce();
  });

  it("全部账号且存在多个可用账号时要求先选择账号", async () => {
    const secondAccount = { ...account, id: 9, name: "欧洲业务账号" };
    render(
      <MemoryRouter>
        <DataSyncPanel
          accounts={[account, secondAccount]}
          apiCode="amazon_shop_page"
          displayName="店铺信息"
          loadedCount={0}
          selectedAccountId=""
          onSynced={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByTitle("请选择一个积加账号后同步")).toBeDisabled();
    expect(screen.getByText("店铺信息")).toBeInTheDocument();
    expect(screen.getByText("请选择一个积加账号后同步")).toBeInTheDocument();
    expect(screen.getByText("选择账号后即可查看接口状态并创建同步任务。")).toBeInTheDocument();
  });

  it("首次状态检查失败时不误报接口未接入", async () => {
    vi.mocked(api.getApiCatalog).mockRejectedValueOnce(new Error("offline"));

    render(
      <MemoryRouter>
        <DataSyncPanel
          accounts={[account]}
          apiCode="amazon_shop_page"
          displayName="店铺信息"
          loadedCount={3}
          selectedAccountId=""
          onSynced={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("同步状态暂时不可用")).toBeInTheDocument();
    expect(screen.getByText("状态检查失败，系统会继续自动重试。")).toBeInTheDocument();
    expect(screen.queryByText("当前接口不在已接入目录中")).not.toBeInTheDocument();
  });

  it("Worker 忙碌且已有活动任务时展示处理中语义并禁止重复创建", async () => {
    const activeJob: SyncJob = {
      id: 42,
      apiCode: "amazon_shop_page",
      jobType: "sync",
      status: "running",
    };
    vi.mocked(api.getWorkerRuntime).mockResolvedValue({
      availability: "busy",
      capacityStatus: "ready",
      configuredWorkerCount: 1,
      onlineWorkerCount: 1,
      busyWorkerCount: 1,
      idleWorkerCount: 0,
      staleWorkerCount: 0,
      heartbeatAt: "2026-09-06T08:00:00Z",
      currentJobId: activeJob.id,
      queueDepth: 0,
      oldestQueuedAt: null,
      pollIntervalSeconds: 5,
      offlineAfterSeconds: 30,
    });
    vi.mocked(api.listSyncJobs).mockResolvedValue({ items: [activeJob] });

    render(
      <MemoryRouter>
        <DataSyncPanel
          accounts={[account]}
          apiCode="amazon_shop_page"
          displayName="店铺信息"
          loadedCount={3}
          selectedAccountId=""
          onSynced={vi.fn()}
        />
      </MemoryRouter>,
    );

    const busyTag = await screen.findByText("忙碌");
    expect(busyTag.closest(".ant-tag")).toHaveClass("ant-tag-processing");
    expect(screen.getByRole("button", { name: "任务处理中" })).toBeDisabled();
  });

  it("Worker 忙碌且当前接口空闲时允许加入同步队列", async () => {
    vi.mocked(api.getWorkerRuntime).mockResolvedValue({
      availability: "busy",
      capacityStatus: "ready",
      configuredWorkerCount: 1,
      onlineWorkerCount: 1,
      busyWorkerCount: 1,
      idleWorkerCount: 0,
      staleWorkerCount: 0,
      heartbeatAt: "2026-09-06T08:00:00Z",
      currentJobId: 77,
      queueDepth: 1,
      oldestQueuedAt: "2026-09-06T07:59:00Z",
      pollIntervalSeconds: 5,
      offlineAfterSeconds: 30,
    });

    render(
      <MemoryRouter>
        <DataSyncPanel
          accounts={[account]}
          apiCode="amazon_shop_page"
          displayName="店铺信息"
          loadedCount={3}
          selectedAccountId=""
          onSynced={vi.fn()}
        />
      </MemoryRouter>,
    );

    const queueButton = await screen.findByRole("button", { name: "加入同步队列" });
    expect(queueButton).toBeEnabled();
    expect(queueButton).toHaveClass("ant-btn-variant-solid");
    expect(queueButton).toHaveAttribute("title", "执行服务忙碌，新任务会进入队列");
    expect(screen.getByText("执行服务正在处理其他任务，新任务会进入队列。")).toBeInTheDocument();
  });

  it("切换账号后忽略旧账号的迟到轮询响应", async () => {
    const secondAccount = { ...account, id: 9, name: "欧洲业务账号" };
    let resolveFirstCatalog!: (rows: ApiCatalogItem[]) => void;
    const firstCatalog = new Promise<ApiCatalogItem[]>((resolve) => {
      resolveFirstCatalog = resolve;
    });
    vi.mocked(api.getApiCatalog)
      .mockImplementationOnce(() => firstCatalog)
      .mockResolvedValueOnce([
        {
          apiCode: "amazon_shop_page",
          name: "欧洲账号接口",
          method: "POST",
          path: "/amazon/shop/page",
          domain: "amazon",
          catalogEnabled: true,
          platformEnabled: true,
          systemConfigured: true,
          supportsDateWindow: false,
          accountEnabled: false,
        },
      ]);

    const { rerender } = render(
      <MemoryRouter>
        <DataSyncPanel
          accounts={[account, secondAccount]}
          apiCode="amazon_shop_page"
          displayName="店铺信息"
          loadedCount={0}
          selectedAccountId="8"
          onSynced={vi.fn()}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(api.getApiCatalog).toHaveBeenCalledWith(8));
    rerender(
      <MemoryRouter>
        <DataSyncPanel
          accounts={[account, secondAccount]}
          apiCode="amazon_shop_page"
          displayName="店铺信息"
          loadedCount={0}
          selectedAccountId="9"
          onSynced={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("欧洲账号接口")).toBeInTheDocument();
    await act(async () => {
      resolveFirstCatalog([
        {
          apiCode: "amazon_shop_page",
          name: "北美账号接口",
          method: "POST",
          path: "/amazon/shop/page",
          domain: "amazon",
          catalogEnabled: true,
          platformEnabled: true,
          systemConfigured: true,
          supportsDateWindow: false,
          accountEnabled: true,
        },
      ]);
      await firstCatalog;
    });

    await waitFor(() => expect(screen.queryByText("北美账号接口")).not.toBeInTheDocument());
    expect(screen.getByText("欧洲账号接口")).toBeInTheDocument();
    expect(api.listSyncJobs).toHaveBeenCalledWith({
      jijiaAccountId: 9,
      apiCode: "amazon_shop_page",
      limit: 1,
    });
  });
});
