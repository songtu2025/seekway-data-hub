import { afterEach, describe, expect, it, vi } from "vitest";

import { advanceAuthSessionGeneration, api, AUTH_UNAUTHORIZED_EVENT } from "./client";

describe("API 客户端", () => {
  afterEach(() => {
    advanceAuthSessionGeneration();
    vi.restoreAllMocks();
  });

  it("合并相同路径的并发 GET，并在完成后清理", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const firstRequest = api.listAccounts();
    const secondRequest = api.listAccounts();

    expect(secondRequest).toBe(firstRequest);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch(
      new Response(JSON.stringify({ data: [], requestId: "r-get-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([[], []]);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [], requestId: "r-get-2" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await api.listAccounts();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("GET 失败后清理请求，允许后续重试", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("network failed"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [], requestId: "r-retry" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await expect(api.listAccounts()).rejects.toThrow("network failed");
    await expect(api.listAccounts()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("认证会话换代时清空正在进行的 GET", async () => {
    const resolvers: Array<(response: Response) => void> = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const previousSessionRequest = api.listAccounts();
    advanceAuthSessionGeneration();
    const currentSessionRequest = api.listAccounts();

    expect(currentSessionRequest).not.toBe(previousSessionRequest);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolvers[0](
      new Response(JSON.stringify({ data: [], requestId: "r-old" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    resolvers[1](
      new Response(JSON.stringify({ data: [], requestId: "r-new" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await Promise.all([previousSessionRequest, currentSessionRequest]);
  });

  it("不会合并相同路径的并发写请求", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({ data: { user: {}, csrfToken: "csrf" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    await Promise.all([
      api.login("admin@example.com", "password"),
      api.login("admin@example.com", "password"),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("登录请求携带 Cookie 凭据", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { user: {}, csrfToken: "csrf" }, requestId: "r1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await api.login("admin@example.com", "password");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/login",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
  });

  it("任意 API 返回 401 时广播登录失效事件", async () => {
    const listener = vi.fn();
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, listener);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "SESSION_EXPIRED", message: "登录状态已过期" },
          requestId: "r401",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(api.listAccounts()).rejects.toMatchObject({ status: 401 });

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, listener);
  });

  it("成员写请求携带 CSRF 头", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: {}, requestId: "r2" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await api.updateUser(8, { role: "viewer" }, "csrf-token");

    const request = fetchMock.mock.calls[0][1];
    expect(new Headers(request?.headers).get("X-CSRF-Token")).toBe("csrf-token");
  });

  it("密码接口使用约定路径、snake_case 字段和 CSRF", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { passwordChanged: true }, requestId: "r-password" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await api.changePassword("current-password", "new-password", "csrf-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/password/change",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
    const request = fetchMock.mock.calls[0][1];
    expect(new Headers(request?.headers).get("X-CSRF-Token")).toBe("csrf-token");
    expect(JSON.parse(String(request?.body))).toEqual({
      current_password: "current-password",
      new_password: "new-password",
    });
  });

  it("账号策略写请求只提交白名单字段并携带 CSRF", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: {}, requestId: "r3" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await api.updatePolicy(
      3,
      "traffic_analysis_page",
      {
        enabled: true,
        scheduleMode: "daily",
        scheduleExpr: "02:30",
        timezone: "Asia/Shanghai",
        windowMode: "checkpoint",
        lookbackDays: null,
        startDate: null,
      },
      "csrf-token",
    );

    const request = fetchMock.mock.calls[0][1];
    expect(new Headers(request?.headers).get("X-CSRF-Token")).toBe("csrf-token");
    expect(JSON.parse(String(request?.body))).toEqual(
      expect.objectContaining({ schedule_mode: "daily", schedule_expr: "02:30" }),
    );
  });

  it("任务列表解包 data，并保持接口路径不变", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { items: [], nextCursor: null }, requestId: "r4" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(api.listSyncJobs()).resolves.toEqual({ items: [], nextCursor: null });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/sync-jobs",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("创建任务发送 snake_case 字段并接受 202 + jobId", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { jobId: "job-9" }, requestId: "r5" }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      api.createSyncJob({ jijiaAccountId: 1, apiCode: "sale_return_order_page" }, "csrf-token"),
    ).resolves.toEqual({ jobId: "job-9" });
    const request = fetchMock.mock.calls[0][1];
    expect(JSON.parse(String(request?.body))).toEqual({
      jijia_account_id: 1,
      api_code: "sale_return_order_page",
      range_mode: "checkpoint",
      start_date: null,
      end_date: null,
      market_ids: null,
      preview_token: null,
    });
  });

  it("取消任务使用冻结路径并携带 CSRF", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              jobId: "job/9",
              status: "cancelled",
            },
            requestId: "r-cancel",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );

    await expect(api.cancelSyncJob("job/9", "csrf-token")).resolves.toMatchObject({
      jobId: "job/9",
      status: "cancelled",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/sync-jobs/job%2F9/cancel",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
    const request = fetchMock.mock.calls[0][1];
    expect(new Headers(request?.headers).get("X-CSRF-Token")).toBe("csrf-token");
  });

  it("逻辑任务详情和控制操作使用编码后的 taskNo 稳定路径", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              id: 21,
              taskNo: "task/demo 1",
              apiCode: "sales_analysis_variation_asin_page",
              jobType: "history_backfill",
              status: "pause_requested",
            },
            requestId: "r-task",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );

    await api.getSyncTask("task/demo 1");
    await api.getSyncTaskExecutions("task/demo 1", 2, 10);
    await api.getSyncTaskEvents("task/demo 1", 3, 5);
    await api.getSyncJobExecutions("job/9", 2, 10);
    await api.getSyncJobEvents("job/9", 3, 5);
    await api.pauseSyncTask("task/demo 1", "csrf-token");

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/v1/sync-jobs/tasks/task%2Fdemo%201",
      "/api/v1/sync-jobs/tasks/task%2Fdemo%201/executions?page=2&limit=10",
      "/api/v1/sync-jobs/tasks/task%2Fdemo%201/events?page=3&limit=5",
      "/api/v1/sync-jobs/job%2F9/executions?page=2&limit=10",
      "/api/v1/sync-jobs/job%2F9/events?page=3&limit=5",
      "/api/v1/sync-jobs/tasks/task%2Fdemo%201/pause",
    ]);
    expect(new Headers(fetchMock.mock.calls[5][1]?.headers).get("X-CSRF-Token")).toBe("csrf-token");
  });

  it("带取消信号的详情请求不与其他调用共享", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({ data: {}, requestId: "r-abort" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const controller = new AbortController();

    await Promise.all([
      api.getSyncTask("task-1", controller.signal),
      api.getSyncTask("task-1", controller.signal),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it("退货订单查询只发送结构化筛选字段", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { items: [] }, requestId: "r-return" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await api.listSaleReturnOrders({
      limit: 100,
      jijiaAccountId: 8,
      status: "completed",
      returnDateStart: "2021-08-01",
      returnDateEnd: "2021-08-31",
      orderId: "order-8",
      sku: "sku-8",
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/v1/sale-return-orders?limit=100&jijia_account_id=8&status=completed" +
        "&return_date_start=2021-08-01&return_date_end=2021-08-31" +
        "&order_id=order-8&sku=sku-8",
    );
  });

  it("游标列表保留账号和状态分组筛选字段", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { items: [], nextCursor: "next-2" }, requestId: "r6" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      api.listSyncJobs({ cursor: "next-1", jijiaAccountId: 8, statusGroup: "attention" }),
    ).resolves.toEqual({ items: [], nextCursor: "next-2" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/sync-jobs?cursor=next-1&jijia_account_id=8&status_group=attention",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("运行详情和原始数据两种批次筛选使用冻结路径与 snake_case 参数", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { id: 9, batchNo: "batch/9", status: "success" },
            requestId: "r-run",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { items: [], nextCursor: null },
            requestId: "r-raw",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    await expect(api.getSyncRun("run/9")).resolves.toMatchObject({
      id: 9,
      batchNo: "batch/9",
    });
    await expect(
      api.listRawData({
        jijiaAccountId: 8,
        syncBatchNo: "batch/9",
        observedBatchNo: "observed/9",
        sourcePrimaryKey: "record/9",
        dataDateStart: "2026-08-01",
        dataDateEnd: "2026-08-31",
      }),
    ).resolves.toEqual({ items: [], nextCursor: null });

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/v1/sync-runs/run%2F9",
      "/api/v1/raw-data?jijia_account_id=8&sync_batch_no=batch%2F9&observed_sync_batch_no=observed%2F9&source_primary_key=record%2F9&data_date_start=2026-08-01&data_date_end=2026-08-31",
    ]);
  });

  it("M3 列表请求使用冻结路径、snake_case 参数并传递 nextCursor", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ data: { items: [], nextCursor: "next-page" }, requestId: "r7" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );

    const expected = { items: [], nextCursor: "next-page" };
    await expect(
      api.listSyncJobs({
        cursor: "job-next",
        limit: 1,
        jijiaAccountId: 8,
        apiCode: "sale_return_order_page",
      }),
    ).resolves.toEqual(expected);
    await expect(
      api.listSyncRuns({ cursor: "run-next", jijiaAccountId: 8, status: "failed" }),
    ).resolves.toEqual(expected);
    await expect(api.listSyncRunLogs("run/9", "log-next")).resolves.toEqual(expected);
    await expect(api.listFailedRequests("run/9", "failed-next")).resolves.toEqual(expected);
    await expect(
      api.listRawData({
        cursor: "raw-next",
        limit: 20,
        jijiaAccountId: 8,
        apiCode: "sale_return_order_page",
      }),
    ).resolves.toEqual(expected);
    await expect(api.listRawDataVersions("raw/3", "version-next")).resolves.toEqual(expected);
    await expect(
      api.listParsedData("products", {
        cursor: "parsed-next",
        limit: 20,
        jijiaAccountId: 8,
        keyword: "SKU/1",
      }),
    ).resolves.toEqual(expected);
    await expect(api.listAuditLogs({ cursor: "audit-next", jijiaAccountId: 8 })).resolves.toEqual(
      expected,
    );

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/v1/sync-jobs?cursor=job-next&limit=1&jijia_account_id=8&api_code=sale_return_order_page",
      "/api/v1/sync-runs?cursor=run-next&jijia_account_id=8&status=failed",
      "/api/v1/sync-runs/run%2F9/logs?cursor=log-next",
      "/api/v1/sync-runs/run%2F9/failed-requests?cursor=failed-next",
      "/api/v1/raw-data?cursor=raw-next&limit=20&jijia_account_id=8&api_code=sale_return_order_page",
      "/api/v1/raw-data/raw%2F3/versions?cursor=version-next",
      "/api/v1/parsed-data/products?cursor=parsed-next&limit=20&jijia_account_id=8&keyword=SKU%2F1",
      "/api/v1/audit-logs?cursor=audit-next&jijia_account_id=8",
    ]);
  });
});
