export type UserRole = "admin" | "operator" | "viewer";
export type UserStatus = "invited" | "active" | "disabled";

export interface User {
  id: number;
  email: string;
  displayName: string | null;
  role: UserRole;
  status: UserStatus;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export interface AuthResult {
  user: User;
  csrfToken: string;
}

export interface PasswordPolicy {
  minimumLength: number;
}

export interface InvitationValidation {
  email: string;
  role: UserRole;
  expiresAt: string;
}

export interface Invitation {
  id: number;
  email: string;
  role: UserRole;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
}

export type JijiaAccountStatus =
  "pending_verification" | "active" | "verification_failed" | "inactive";

export interface JijiaAccount {
  id: number;
  accountCode: string;
  name: string;
  maskedAppId: string;
  credentialSource: "encrypted" | "environment_legacy";
  status: JijiaAccountStatus;
  lastVerifiedAt: string | null;
  lastVerifyError: string | null;
  createdAt: string;
  updatedAt: string;
  enabledPolicyCount?: number;
  scheduledPolicyCount?: number;
  latestJobStatus?: SyncJobStatus | null;
  latestJobAt?: string | null;
  latestDataAt?: string | null;
}

export type ScheduleMode = "manual_only" | "daily" | "cron";
type WindowMode = "checkpoint" | "lookback_days" | "start_date";

export interface ApiCatalogItem {
  apiCode: string;
  name: string;
  method: string;
  path: string;
  domain: string;
  officialDomain?: string | null;
  catalogEnabled: boolean;
  platformEnabled?: boolean;
  systemConfigured?: boolean;
  officialExists?: boolean;
  readOnlyVerified?: boolean;
  officialDocId?: number | null;
  classification?: string | null;
  executionStage?: string | null;
  configVersion?: number;
  configHash?: string;
  publishedAt?: string | null;
  supportsDateWindow: boolean;
  supportsMarketScope?: boolean;
  canRunDirectly?: boolean;
  upstreamApiCode?: string | null;
  listField?: string;
  primaryKeyField?: string;
  dateField?: string;
  storageMode?: string;
  sensitive?: boolean;
  dataSummary?: string;
  accountPolicyExists?: boolean | null;
  accountEnabled?: boolean | null;
  recentRunStatus?: string | null;
  recentRunAt?: string | null;
  rawRecordCount?: number;
  hasData?: boolean;
}

export interface OfficialApiCatalogItem {
  docId: number | null;
  menuPath: string;
  name: string;
  path: string;
  method: string;
  classification: string;
  executionStage: string;
  executionReason: string;
  requiredFields: string[];
  businessRequiredFields: string[];
  responseFields: Array<{ name?: string; type?: string; description?: string }>;
  hasPageResponse: boolean;
  hasListResponse: boolean;
  sensitive: boolean;
  systemConfigured: boolean;
  configuredApiCodes: string[];
  platformEnabledApiCodes: string[];
  configuredMethods: string[];
  methodMismatch: boolean;
}

export interface ApiPolicy extends ApiCatalogItem {
  id: number;
  accountId: number;
  enabled: boolean;
  scheduleMode: ScheduleMode;
  scheduleExpr: string | null;
  timezone: string;
  windowMode: WindowMode | null;
  lookbackDays: number | null;
  startDate: string | null;
  nextRunAt: string | null;
  recentRunStatus?: string | null;
  recentRunAt?: string | null;
}

export interface ApiPolicyUpdateInput {
  enabled: boolean;
  scheduleMode: ScheduleMode;
  scheduleExpr: string | null;
  timezone: string;
  windowMode: WindowMode | null;
  lookbackDays: number | null;
  startDate: string | null;
}

export interface ApiPolicyBatchItem extends ApiPolicyUpdateInput {
  apiCode: string;
}

export type SyncJobStatus =
  | "queued"
  | "running"
  | "pause_requested"
  | "paused"
  | "success"
  | "partial_failed"
  | "failed"
  | "cancelled"
  | "stopped";

export type SyncTaskStatus =
  | "in_progress"
  | "pausing"
  | "paused"
  | "attention"
  | "success"
  | "caught_up"
  | "terminated"
  | "dismissed";

export type ChangeCatchupStatus =
  "pending" | "running" | "complete" | "incremental_ready" | "blocked" | "failed";

export type SyncJobType = "history_backfill" | "update_incremental" | "sync";
export type SyncJobTriggerType = "manual" | "retry" | "schedule";
export type SyncJobAction =
  | "cancel"
  | "pause"
  | "withdraw_pause"
  | "resume"
  | "stop"
  | "retry"
  | "dismiss"
  | "restore_attention";

export interface HistoryProgress {
  completedWindows: number;
  totalWindows: number;
  currentWindow: { startDate: string; endDate: string } | null;
  currentPage: number;
  totalPages: number;
  earliestObservedDataDate: string | null;
  historyCompleteThrough: string | null;
  changeCatchup: ChangeCatchupStatus;
}

export interface SyncJobExecution {
  id: number | string;
  jobNo: string;
  triggerType?: "manual" | "retry" | "schedule";
  windowIndex: number;
  windowStart: string | null;
  windowEnd: string | null;
  status: SyncJobStatus;
  syncBatchNo: string | null;
  syncRunId: number | string | null;
  createdAt?: string;
  startedAt: string | null;
  pausedAt?: string | null;
  finishedAt: string | null;
}

export interface SyncJobLifecycleEvent {
  id: string;
  eventType:
    | "created"
    | "retried"
    | "resumed"
    | "started"
    | "pause_requested"
    | "pause_withdrawn"
    | "paused"
    | "stop_requested"
    | "cancelled"
    | "resolved"
    | "dismissed"
    | "attention_restored"
    | "finished";
  occurredAt: string;
  actorName: string | null;
  executionId: number | string;
  status: SyncJobStatus | null;
}

export interface PageResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SyncJob {
  id: number | string;
  jobNo?: string;
  taskNo?: string;
  jijiaAccountId?: number;
  accountName?: string | null;
  apiCode: string;
  apiName?: string;
  jobType: SyncJobType;
  triggerType?: SyncJobTriggerType;
  status: SyncJobStatus;
  taskStatus?: SyncTaskStatus;
  executionStatus?: SyncJobStatus;
  currentExecutionId?: number | string;
  executionCount?: number;
  taskCreatedAt?: string;
  lastUpdatedAt?: string;
  completedWindows?: number;
  rangeMode?: "checkpoint" | "custom";
  taskStart?: string | null;
  taskEnd?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  windowIndex?: number;
  totalWindows?: number;
  advanceCheckpoint?: boolean;
  stopAfterCurrent?: boolean;
  pauseRequestedAt?: string | null;
  pausedAt?: string | null;
  syncBatchNo?: string | null;
  syncRunId?: number | string | null;
  apiConfigVersion?: number | null;
  apiConfigHash?: string | null;
  attemptCount?: number;
  maxAttempts?: number;
  queuedAt?: string;
  heartbeatAt?: string | null;
  retryOfJobId?: number | string | null;
  createdAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  resolutionCode?: "incremental_caught_up" | "operator_dismissed" | null;
  resolvedAt?: string | null;
  historyProgress?: HistoryProgress | null;
  progressSummary?: {
    currentPage: number | null;
    totalPages: number | null;
    requestCount: number | null;
    successApiCount: number | null;
    failedApiCount: number | null;
  };
  availableActions?: SyncJobAction[];
  failureInfo?: {
    category: "authentication" | "rate_limit" | "configuration" | "upstream" | "data" | "system";
    recommendation: string;
  } | null;
  queueInfo?: {
    reasonCode:
      | "WORKER_OFFLINE"
      | "WORKER_BUSY"
      | "WAITING_FOR_CLAIM"
      | "RETRY_BACKOFF"
      | "ATTEMPTS_EXHAUSTED";
    queuedAhead: number;
    eligibleAt: string;
  } | null;
  executions?: SyncJobExecution[];
  lifecycleEvents?: SyncJobLifecycleEvent[];
}

export interface WorkerRuntime {
  availability: "online" | "busy" | "offline";
  capacityStatus: "ready" | "degraded" | "offline";
  configuredWorkerCount: number;
  onlineWorkerCount: number;
  busyWorkerCount: number;
  idleWorkerCount: number;
  staleWorkerCount: number;
  heartbeatAt: string | null;
  currentJobId: number | string | null;
  queueDepth: number;
  oldestQueuedAt: string | null;
  pollIntervalSeconds: number;
  offlineAfterSeconds: number;
}

export interface SyncJobListResponse {
  items: SyncJob[];
  nextCursor?: string | null;
  summary?: SyncJobSummary;
}

export type SyncJobStatusGroup = "active" | "attention" | "success" | "ended";

export interface SyncJobSummary {
  total: number;
  active: number;
  attention: number;
  success: number;
  ended: number;
}

export interface SyncListQuery {
  cursor?: string;
  limit?: number;
  jijiaAccountId?: number;
  apiCode?: string;
  status?: string;
  statusGroup?: SyncJobStatusGroup;
  triggerType?: SyncJobTriggerType;
}

export interface SyncJobListQuery extends Omit<SyncListQuery, "status"> {
  status?: SyncTaskStatus;
}

type ScheduledPlanStatus = "normal" | "overdue" | "blocked" | "account_inactive" | "api_disabled";

interface ScheduledPlanJob {
  id: number | string;
  taskNo: string;
  status: SyncJobStatus;
}

export interface ScheduledPlanWindowPreview {
  phase: "history_backfill" | "update_incremental" | "no_date_window";
  basisLabel: string;
  nextStartDate: string | null;
  nextEndDate: string | null;
  completeThrough: string | null;
  lagDays: number | null;
  maxWindowDays: number | null;
  advancesOnSuccess: boolean;
  predictionStatus: "exact" | "dynamic" | "caught_up" | "unavailable";
}

export interface ScheduledPlan {
  id: number;
  jijiaAccountId: number;
  accountName: string;
  apiCode: string;
  apiName: string;
  scheduleMode: Exclude<ScheduleMode, "manual_only">;
  scheduleExpr: string | null;
  timezone: string;
  nextRunAt: string | null;
  status: ScheduledPlanStatus;
  nextWindowPreview: ScheduledPlanWindowPreview;
  blockingJob: ScheduledPlanJob | null;
  latestScheduledJob: ScheduledPlanJob | null;
}

export interface CreateSyncJobInput {
  jijiaAccountId: number;
  apiCode: string;
  rangeMode?: "checkpoint" | "custom";
  startDate?: string | null;
  endDate?: string | null;
  marketIds?: number[] | null;
  previewToken?: string | null;
}

export interface SyncJobMarketOption {
  marketId: number;
  label: string;
}

export interface SyncJobPreview {
  rangeMode: "checkpoint" | "custom";
  supportsDateWindow: boolean;
  scopeMode: "all" | "selected";
  selectedMarketIds: number[];
  scopeMessage: string;
  startDate: string | null;
  endDate: string | null;
  windowDays: number;
  windowCount: number;
  previewToken: string;
  windows: Array<{ index: number; startDate: string | null; endDate: string | null }>;
  activeTask?: {
    id: number | string;
    taskNo: string;
    status: SyncJobStatus;
  } | null;
  checkpoint?: {
    completeThrough: string | null;
    nextWindowStart: string | null;
    advancesOnSuccess: boolean;
  } | null;
  recentSuccessfulRunAt?: string | null;
  executionReadiness?: {
    workerAvailability: WorkerRuntime["availability"];
    queueDepth: number;
  };
}

export interface JobAcceptedResponse {
  jobId: number | string;
  taskNo?: string | null;
  outcome?: "queued" | "already_caught_up";
  taskStatus?: SyncTaskStatus;
}

export interface JobCancelledResponse extends JobAcceptedResponse {
  status: SyncJobStatus;
}

export interface SyncRun {
  id: number | string;
  batchNo?: string;
  jijiaAccountId?: number;
  accountName?: string | null;
  status: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  jobId?: number | string | null;
  totalApis?: number;
  failedApis?: number;
}

export interface SyncRunListResponse {
  items: SyncRun[];
  nextCursor?: string | null;
}

export interface SyncRunLog {
  id: number | string;
  apiCode: string;
  status: string;
  message?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface SyncRunLogListResponse {
  items: SyncRunLog[];
  nextCursor?: string | null;
}

export interface FailedRequest {
  id: number | string;
  apiCode: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  attemptCount?: number;
  createdAt?: string;
}

export interface FailedRequestListResponse {
  items: FailedRequest[];
  nextCursor?: string | null;
}

export interface RawDataSummary {
  id: number | string;
  jijiaAccountId?: number;
  accountName?: string | null;
  apiCode: string;
  sourcePrimaryKey?: string | null;
  dataDate?: string | null;
  dataHash?: string | null;
  batchNo?: string | null;
  firstObservedAt?: string | null;
  lastObservedAt?: string | null;
  observationCount?: number;
  versionCount?: number;
  updatedAt?: string | null;
}

export interface RawDataListResponse {
  items: RawDataSummary[];
  nextCursor?: string | null;
}

export interface RawDataListQuery {
  cursor?: string;
  limit?: number;
  jijiaAccountId?: number;
  apiCode?: string;
  syncBatchNo?: string;
  observedBatchNo?: string;
  sourcePrimaryKey?: string;
  dataDateStart?: string;
  dataDateEnd?: string;
}

export interface RawDataDetail extends RawDataSummary {
  rawJson?: unknown | null;
  sensitive?: boolean;
  createdAt?: string | null;
}

export interface RawDataVersion {
  id: number | string;
  batchNo?: string | null;
  dataHash?: string | null;
  dataDate?: string | null;
  observedAt?: string | null;
  rawJson?: unknown | null;
}

export interface RawDataVersionListResponse {
  items: RawDataVersion[];
  nextCursor?: string | null;
}

export interface SaleReturnOrder {
  id: number | string;
  jijiaAccountId: number;
  accountName?: string | null;
  rawDataId: number | string;
  sourcePrimaryKey: string;
  marketId?: number | null;
  returnDateTime?: string | null;
  orderId?: string | null;
  sellerOrderId?: string | null;
  asin?: string | null;
  msku?: string | null;
  fnsku?: string | null;
  sku?: string | null;
  productName?: string | null;
  quantity?: number | null;
  fulfillmentCenterId?: string | null;
  disposition?: string | null;
  reason?: string | null;
  status?: string | null;
  sourceCreatedAt?: string | null;
  sourceUpdatedAt?: string | null;
  dataHash: string;
  syncBatchNo: string;
}

export interface SaleReturnOrderListResponse {
  items: SaleReturnOrder[];
  nextCursor?: string | null;
}

export interface SaleReturnOrderListQuery {
  cursor?: string;
  limit?: number;
  jijiaAccountId?: number;
  status?: string;
  returnDateStart?: string;
  returnDateEnd?: string;
  orderId?: string;
  sku?: string;
  reason?: string;
  disposition?: string;
  fulfillmentCenterId?: string;
}

export type ParsedDataset = "stores" | "products" | "inventory" | "warehouses";

export interface ParsedDataItem {
  id: string;
  rawDataId: number | string;
  jijiaAccountId: number;
  accountName?: string | null;
  apiCode: string;
  sourcePrimaryKey?: string | null;
  dataDate?: string | null;
  lastObservedAt?: string | null;
  fields: Record<string, string | number | boolean | null>;
}

export interface ParsedDataListResponse {
  items: ParsedDataItem[];
  nextCursor?: string | null;
}

export interface ParsedDataListQuery {
  cursor?: string;
  limit?: number;
  jijiaAccountId?: number;
  keyword?: string;
}

export interface AuditLog {
  id: number | string;
  actorUserId?: number | null;
  actorName?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | number | null;
  requestId?: string | null;
  result: string;
  createdAt?: string;
  changes?: Record<string, unknown> | null;
}

export interface AuditLogListResponse {
  items: AuditLog[];
  nextCursor?: string | null;
}

export interface AuditLogListQuery {
  cursor?: string;
  jijiaAccountId?: number;
  actorUserId?: number;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  result?: "success" | "failure";
  createdFrom?: string;
  createdTo?: string;
}

export interface DashboardSummary {
  queuedJobs: number;
  runningJobs: number;
  failedJobs: number;
  failedRequests: number;
  latestRun: SyncRun | null;
  historyProgress: HistoryProgress | null;
  accounts?: {
    total: number;
    active: number;
    attention: number;
    inactive: number;
  };
  policies?: {
    total: number;
    enabled: number;
    scheduled: number;
  };
  latestDataAt?: string | null;
  worker?: WorkerRuntime;
}
