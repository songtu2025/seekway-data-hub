import type {
  AuditLog,
  AuditLogListQuery,
  AuditLogListResponse,
  AuthResult,
  ApiCatalogItem,
  ApiPolicy,
  ApiPolicyBatchItem,
  ApiPolicyUpdateInput,
  CreateSyncJobInput,
  DashboardSummary,
  FailedRequest,
  FailedRequestListResponse,
  Invitation,
  InvitationValidation,
  JijiaAccount,
  JobAcceptedResponse,
  JobCancelledResponse,
  OfficialApiCatalogItem,
  PasswordPolicy,
  ParsedDataItem,
  ParsedDataListQuery,
  ParsedDataListResponse,
  ParsedDataset,
  RawDataDetail,
  RawDataListQuery,
  RawDataListResponse,
  RawDataSummary,
  RawDataVersion,
  RawDataVersionListResponse,
  SaleReturnOrder,
  SaleReturnOrderListQuery,
  SaleReturnOrderListResponse,
  ScheduledPlan,
  SyncJob,
  SyncJobListQuery,
  SyncJobListResponse,
  SyncJobMarketOption,
  SyncJobPreview,
  SyncRun,
  SyncRunListResponse,
  SyncRunLog,
  SyncRunLogListResponse,
  SyncListQuery,
  User,
  UserRole,
  UserStatus,
  WorkerRuntime,
} from "./types";

interface SuccessResponse<T> {
  data: T;
  requestId: string;
}

interface ErrorResponse {
  error?: {
    code?: string;
    message?: string;
  };
  requestId?: string;
}

export const AUTH_UNAUTHORIZED_EVENT = "jijia-auth-unauthorized";

interface AuthUnauthorizedDetail {
  sessionGeneration: number;
}

let authSessionGeneration = 0;
const inFlightGetRequests = new Map<string, Promise<unknown>>();

export function advanceAuthSessionGeneration(): void {
  authSessionGeneration += 1;
  inFlightGetRequests.clear();
}

export function isCurrentAuthUnauthorizedEvent(event: Event): boolean {
  if (!(event instanceof CustomEvent)) return true;
  const detail = event.detail as Partial<AuthUnauthorizedDetail> | null;
  if (typeof detail?.sessionGeneration !== "number") return true;
  return detail.sessionGeneration === authSessionGeneration;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

function request<T>(path: string, options: RequestInit = {}, csrfToken?: string): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  if (method !== "GET") {
    return sendRequest<T>(path, options, csrfToken);
  }

  const existingRequest = inFlightGetRequests.get(path) as Promise<T> | undefined;
  if (existingRequest) return existingRequest;

  const pendingRequest = sendRequest<T>(path, options, csrfToken);
  inFlightGetRequests.set(path, pendingRequest);
  const clearPendingRequest = () => {
    // 只复用仍在进行的 GET，完成后立即清理，避免跨页面返回陈旧数据。
    if (inFlightGetRequests.get(path) === pendingRequest) {
      inFlightGetRequests.delete(path);
    }
  };
  void pendingRequest.then(clearPendingRequest, clearPendingRequest);
  return pendingRequest;
}

function syncTaskPath(taskNo: string, action?: string): string {
  const basePath = `/api/v1/sync-jobs/tasks/${encodeURIComponent(taskNo)}`;
  return action ? `${basePath}/${action}` : basePath;
}

async function sendRequest<T>(path: string, options: RequestInit, csrfToken?: string): Promise<T> {
  const requestSessionGeneration = authSessionGeneration;
  const headers = new Headers(options.headers);
  if (options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (csrfToken) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers,
  });
  const responseText = await response.text();
  let payload = {} as SuccessResponse<T> & ErrorResponse;
  if (responseText) {
    try {
      payload = JSON.parse(responseText) as SuccessResponse<T> & ErrorResponse;
    } catch {
      // 代理或网关错误不一定返回 JSON，统一转换成可展示的 API 错误。
    }
  }
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent<AuthUnauthorizedDetail>(AUTH_UNAUTHORIZED_EVENT, {
          detail: { sessionGeneration: requestSessionGeneration },
        }),
      );
    }
    throw new ApiError(
      payload.error?.message ?? "请求失败，请稍后重试",
      response.status,
      payload.error?.code ?? "REQUEST_FAILED",
      payload.requestId,
    );
  }
  return payload.data;
}

export const api = {
  session: () => request<AuthResult>("/api/v1/auth/session"),
  getPasswordPolicy: () => request<PasswordPolicy>("/api/v1/auth/password-policy"),
  login: (email: string, password: string) =>
    request<AuthResult>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: (csrfToken: string) =>
    request<{ loggedOut: boolean }>("/api/v1/auth/logout", { method: "POST" }, csrfToken),
  changePassword: (currentPassword: string, newPassword: string, csrfToken: string) =>
    request<{ passwordChanged: boolean }>(
      "/api/v1/auth/password/change",
      {
        method: "POST",
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      },
      csrfToken,
    ),
  requestPasswordReset: (email: string) =>
    request<{ accepted: boolean }>("/api/v1/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  validatePasswordReset: (token: string) =>
    request<{ valid: boolean }>("/api/v1/auth/password-reset/validate", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  completePasswordReset: (token: string, newPassword: string) =>
    request<{ passwordReset: boolean }>("/api/v1/auth/password-reset/complete", {
      method: "POST",
      body: JSON.stringify({ token, new_password: newPassword }),
    }),
  validateInvitation: (token: string) =>
    request<InvitationValidation>("/api/v1/auth/invitations/validate", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  register: (token: string, displayName: string, password: string) =>
    request<AuthResult>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ token, display_name: displayName, password }),
    }),
  listUsers: () => request<User[]>("/api/v1/users"),
  updateUser: (
    userId: number,
    changes: { role?: UserRole; status?: UserStatus },
    csrfToken: string,
  ) =>
    request<User>(
      `/api/v1/users/${userId}`,
      { method: "PATCH", body: JSON.stringify(changes) },
      csrfToken,
    ),
  listInvitations: () => request<Invitation[]>("/api/v1/invitations"),
  createInvitation: (email: string, role: UserRole, csrfToken: string) =>
    request<Invitation>(
      "/api/v1/invitations",
      { method: "POST", body: JSON.stringify({ email, role }) },
      csrfToken,
    ),
  resendInvitation: (invitationId: number, csrfToken: string) =>
    request<Invitation>(
      `/api/v1/invitations/${invitationId}/resend`,
      { method: "POST" },
      csrfToken,
    ),
  revokeInvitation: (invitationId: number, csrfToken: string) =>
    request<Invitation>(
      `/api/v1/invitations/${invitationId}/revoke`,
      { method: "POST" },
      csrfToken,
    ),
  listAccounts: () => request<JijiaAccount[]>("/api/v1/jijia-accounts"),
  getAccount: (accountId: number) => request<JijiaAccount>(`/api/v1/jijia-accounts/${accountId}`),
  createAccount: (name: string, appId: string, appKey: string, csrfToken: string) =>
    request<JijiaAccount>(
      "/api/v1/jijia-accounts",
      {
        method: "POST",
        body: JSON.stringify({ name, app_id: appId, app_key: appKey }),
      },
      csrfToken,
    ),
  updateAccount: (
    accountId: number,
    changes: { name?: string; appId?: string; appKey?: string },
    csrfToken: string,
  ) =>
    request<JijiaAccount>(
      `/api/v1/jijia-accounts/${accountId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          name: changes.name,
          app_id: changes.appId,
          app_key: changes.appKey,
        }),
      },
      csrfToken,
    ),
  verifyAccount: (accountId: number, csrfToken: string) =>
    request<JijiaAccount>(
      `/api/v1/jijia-accounts/${accountId}/verify`,
      { method: "POST" },
      csrfToken,
    ),
  deactivateAccount: (accountId: number, csrfToken: string) =>
    request<JijiaAccount>(
      `/api/v1/jijia-accounts/${accountId}/deactivate`,
      { method: "POST" },
      csrfToken,
    ),
  getApiCatalog: (jijiaAccountId?: number) =>
    request<ApiCatalogItem[]>(
      listPath("/api/v1/api-catalog", {
        jijia_account_id: jijiaAccountId,
      }),
    ),
  getOfficialApiCatalog: () => request<OfficialApiCatalogItem[]>("/api/v1/api-catalog/official"),
  listPolicies: (accountId: number) =>
    request<ApiPolicy[]>(`/api/v1/jijia-accounts/${accountId}/api-policies`),
  updatePolicy: (
    accountId: number,
    apiCode: string,
    changes: ApiPolicyUpdateInput,
    csrfToken: string,
  ) =>
    request<ApiPolicy>(
      `/api/v1/jijia-accounts/${accountId}/api-policies/${apiCode}`,
      {
        method: "PUT",
        body: JSON.stringify({
          enabled: changes.enabled,
          schedule_mode: changes.scheduleMode,
          schedule_expr: changes.scheduleExpr,
          timezone: changes.timezone,
          window_mode: changes.windowMode,
          lookback_days: changes.lookbackDays,
          start_date: changes.startDate,
        }),
      },
      csrfToken,
    ),
  batchUpdatePolicies: (accountId: number, items: ApiPolicyBatchItem[], csrfToken: string) =>
    request<ApiPolicy[]>(
      `/api/v1/jijia-accounts/${accountId}/api-policies/batch`,
      {
        method: "PUT",
        body: JSON.stringify({
          items: items.map(({ apiCode, ...changes }) => ({
            api_code: apiCode,
            enabled: changes.enabled,
            schedule_mode: changes.scheduleMode,
            schedule_expr: changes.scheduleExpr,
            timezone: changes.timezone,
            window_mode: changes.windowMode,
            lookback_days: changes.lookbackDays,
            start_date: changes.startDate,
          })),
        }),
      },
      csrfToken,
    ),
  createSyncJob: (input: CreateSyncJobInput, csrfToken: string) =>
    request<JobAcceptedResponse>(
      "/api/v1/sync-jobs",
      {
        method: "POST",
        body: JSON.stringify({
          jijia_account_id: input.jijiaAccountId,
          api_code: input.apiCode,
          range_mode: input.rangeMode ?? "checkpoint",
          start_date: input.startDate ?? null,
          end_date: input.endDate ?? null,
          market_ids: input.marketIds ?? null,
          preview_token: input.previewToken ?? null,
        }),
      },
      csrfToken,
    ),
  previewSyncJob: (input: CreateSyncJobInput) =>
    request<SyncJobPreview>("/api/v1/sync-jobs/preview", {
      method: "POST",
      body: JSON.stringify({
        jijia_account_id: input.jijiaAccountId,
        api_code: input.apiCode,
        range_mode: input.rangeMode ?? "checkpoint",
        start_date: input.startDate ?? null,
        end_date: input.endDate ?? null,
        market_ids: input.marketIds ?? null,
      }),
    }),
  listSyncJobMarketOptions: (jijiaAccountId: number, apiCode: string) =>
    request<SyncJobMarketOption[]>(
      listPath("/api/v1/sync-jobs/market-options", {
        jijia_account_id: jijiaAccountId,
        api_code: apiCode,
      }),
    ),
  listSyncJobs: (query: SyncJobListQuery = {}) =>
    request<SyncJobListResponse | SyncJob[]>(
      listPath("/api/v1/sync-jobs", {
        cursor: query.cursor,
        limit: query.limit,
        jijia_account_id: query.jijiaAccountId,
        api_code: query.apiCode,
        status: query.status,
        status_group: query.statusGroup,
        trigger_type: query.triggerType,
      }),
    ).then((value) => (Array.isArray(value) ? { items: value } : value)),
  listScheduledPlans: () => request<ScheduledPlan[]>("/api/v1/sync-jobs/scheduled-plans"),
  getSyncJob: (jobId: number | string) =>
    request<SyncJob>(`/api/v1/sync-jobs/${encodeURIComponent(String(jobId))}`),
  getSyncTask: (taskNo: string) => request<SyncJob>(syncTaskPath(taskNo)),
  getWorkerRuntime: () => request<WorkerRuntime>("/api/v1/runtime/worker"),
  retrySyncJob: (jobId: number | string, csrfToken: string) =>
    request<JobAcceptedResponse>(
      `/api/v1/sync-jobs/${encodeURIComponent(String(jobId))}/retry`,
      { method: "POST" },
      csrfToken,
    ),
  dismissSyncJobAttention: (jobId: number | string, csrfToken: string) =>
    request<JobCancelledResponse>(
      `/api/v1/sync-jobs/${encodeURIComponent(String(jobId))}/dismiss`,
      { method: "POST" },
      csrfToken,
    ),
  restoreSyncJobAttention: (jobId: number | string, csrfToken: string) =>
    request<JobCancelledResponse>(
      `/api/v1/sync-jobs/${encodeURIComponent(String(jobId))}/restore-attention`,
      { method: "POST" },
      csrfToken,
    ),
  cancelSyncJob: (jobId: number | string, csrfToken: string) =>
    request<JobCancelledResponse>(
      `/api/v1/sync-jobs/${encodeURIComponent(String(jobId))}/cancel`,
      { method: "POST" },
      csrfToken,
    ),
  pauseSyncJob: (jobId: number | string, csrfToken: string) =>
    request<JobCancelledResponse>(
      `/api/v1/sync-jobs/${encodeURIComponent(String(jobId))}/pause`,
      { method: "POST" },
      csrfToken,
    ),
  withdrawSyncJobPause: (jobId: number | string, csrfToken: string) =>
    request<JobCancelledResponse>(
      `/api/v1/sync-jobs/${encodeURIComponent(String(jobId))}/pause/withdraw`,
      { method: "POST" },
      csrfToken,
    ),
  resumeSyncJob: (jobId: number | string, csrfToken: string) =>
    request<JobAcceptedResponse>(
      `/api/v1/sync-jobs/${encodeURIComponent(String(jobId))}/resume`,
      { method: "POST" },
      csrfToken,
    ),
  stopSyncJob: (jobId: number | string, csrfToken: string) =>
    request<JobCancelledResponse>(
      `/api/v1/sync-jobs/${encodeURIComponent(String(jobId))}/stop`,
      { method: "POST" },
      csrfToken,
    ),
  retrySyncTask: (taskNo: string, csrfToken: string) =>
    request<JobAcceptedResponse>(syncTaskPath(taskNo, "retry"), { method: "POST" }, csrfToken),
  dismissSyncTaskAttention: (taskNo: string, csrfToken: string) =>
    request<JobCancelledResponse>(syncTaskPath(taskNo, "dismiss"), { method: "POST" }, csrfToken),
  restoreSyncTaskAttention: (taskNo: string, csrfToken: string) =>
    request<JobCancelledResponse>(
      syncTaskPath(taskNo, "restore-attention"),
      { method: "POST" },
      csrfToken,
    ),
  cancelSyncTask: (taskNo: string, csrfToken: string) =>
    request<JobCancelledResponse>(syncTaskPath(taskNo, "cancel"), { method: "POST" }, csrfToken),
  pauseSyncTask: (taskNo: string, csrfToken: string) =>
    request<JobCancelledResponse>(syncTaskPath(taskNo, "pause"), { method: "POST" }, csrfToken),
  withdrawSyncTaskPause: (taskNo: string, csrfToken: string) =>
    request<JobCancelledResponse>(
      syncTaskPath(taskNo, "pause/withdraw"),
      { method: "POST" },
      csrfToken,
    ),
  resumeSyncTask: (taskNo: string, csrfToken: string) =>
    request<JobAcceptedResponse>(syncTaskPath(taskNo, "resume"), { method: "POST" }, csrfToken),
  stopSyncTask: (taskNo: string, csrfToken: string) =>
    request<JobCancelledResponse>(syncTaskPath(taskNo, "stop"), { method: "POST" }, csrfToken),
  listSyncRuns: (query: SyncListQuery = {}) =>
    request<SyncRunListResponse | SyncRun[]>(
      listPath("/api/v1/sync-runs", {
        cursor: query.cursor,
        jijia_account_id: query.jijiaAccountId,
        status: query.status,
      }),
    ).then(normalizeList<SyncRun>),
  getSyncRun: (runId: number | string) =>
    request<SyncRun>(`/api/v1/sync-runs/${encodeURIComponent(String(runId))}`),
  listSyncRunLogs: (runId: number | string, cursor?: string) =>
    request<SyncRunLogListResponse | SyncRunLog[]>(
      listPath(`/api/v1/sync-runs/${encodeURIComponent(String(runId))}/logs`, { cursor }),
    ).then(normalizeList<SyncRunLog>),
  listFailedRequests: (runId: number | string, cursor?: string) =>
    request<FailedRequestListResponse | FailedRequest[]>(
      listPath(`/api/v1/sync-runs/${encodeURIComponent(String(runId))}/failed-requests`, {
        cursor,
      }),
    ).then(normalizeList<FailedRequest>),
  listRawData: (query: RawDataListQuery = {}) =>
    request<RawDataListResponse | RawDataSummary[]>(
      listPath("/api/v1/raw-data", {
        cursor: query.cursor,
        limit: query.limit,
        jijia_account_id: query.jijiaAccountId,
        api_code: query.apiCode,
        sync_batch_no: query.syncBatchNo,
        observed_sync_batch_no: query.observedBatchNo,
        source_primary_key: query.sourcePrimaryKey,
        data_date_start: query.dataDateStart,
        data_date_end: query.dataDateEnd,
      }),
    ).then(normalizeList<RawDataSummary>),
  getRawData: (rawDataId: number | string) =>
    request<RawDataDetail>(`/api/v1/raw-data/${encodeURIComponent(String(rawDataId))}`),
  listRawDataVersions: (rawDataId: number | string, cursor?: string) =>
    request<RawDataVersionListResponse | RawDataVersion[]>(
      listPath(`/api/v1/raw-data/${encodeURIComponent(String(rawDataId))}/versions`, { cursor }),
    ).then(normalizeList<RawDataVersion>),
  listSaleReturnOrders: (query: SaleReturnOrderListQuery = {}) =>
    request<SaleReturnOrderListResponse | SaleReturnOrder[]>(
      listPath("/api/v1/sale-return-orders", {
        cursor: query.cursor,
        limit: query.limit,
        jijia_account_id: query.jijiaAccountId,
        status: query.status,
        return_date_start: query.returnDateStart,
        return_date_end: query.returnDateEnd,
        order_id: query.orderId,
        sku: query.sku,
        reason: query.reason,
        disposition: query.disposition,
        fulfillment_center_id: query.fulfillmentCenterId,
      }),
    ).then(normalizeList<SaleReturnOrder>),
  listParsedData: (dataset: ParsedDataset, query: ParsedDataListQuery = {}) =>
    request<ParsedDataListResponse | ParsedDataItem[]>(
      listPath(`/api/v1/parsed-data/${dataset}`, {
        cursor: query.cursor,
        limit: query.limit,
        jijia_account_id: query.jijiaAccountId,
        keyword: query.keyword,
      }),
    ).then(normalizeList<ParsedDataItem>),
  getDashboard: () => request<DashboardSummary>("/api/v1/dashboard"),
  listAuditLogs: (query: AuditLogListQuery = {}) =>
    request<AuditLogListResponse | AuditLog[]>(
      listPath("/api/v1/audit-logs", {
        cursor: query.cursor,
        jijia_account_id: query.jijiaAccountId,
        actor_user_id: query.actorUserId,
        resource_type: query.resourceType,
        resource_id: query.resourceId,
        action: query.action,
        result: query.result,
        created_from: query.createdFrom,
        created_to: query.createdTo,
      }),
    ).then(normalizeList<AuditLog>),
};

function listPath<T extends object>(path: string, query: T): string {
  const search = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if ((typeof value === "string" && value) || typeof value === "number") {
      search.set(key, String(value));
    }
  });
  const queryString = search.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function normalizeList<T>(value: { items: T[]; nextCursor?: string | null } | T[]): {
  items: T[];
  nextCursor?: string | null;
} {
  return Array.isArray(value) ? { items: value } : value;
}
