import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Empty, Modal, Spin, Table, Tabs, Tag } from "antd";
import type { TableColumnsType } from "antd";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { api } from "../api/client";
import type {
  JobAcceptedResponse,
  SyncJob,
  SyncJobExecution,
  SyncJobLifecycleEvent,
} from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { AppShell } from "../components/AppShell";
import { RefreshStatus } from "../components/RefreshStatus";
import { SourceBackLink } from "../components/SourceBackLink";
import { JobRunDiagnostics } from "../components/JobRunDiagnostics";
import { SyncJobLifecycle } from "../components/SyncJobReadModel";
import { WorkerStatusPanel } from "../components/WorkerStatusPanel";
import { useVisiblePolling } from "../hooks/useVisiblePolling";
import { SyncJobActionPanel, SyncJobProgressSection } from "../components/SyncJobDetailSections";
import {
  formatDate,
  getApiErrorMessage,
  getReturnNavigation,
  detailReturnPaths,
  statusLabel,
  timeZoneNote,
} from "./m3Utils";
import {
  executionStageLabel,
  getTaskStatus,
  isTaskActive,
  syncJobDetailPath,
  taskStatusLabel,
} from "./syncJobStatus";
import { hasSyncJobAction, type SyncJobControlAction } from "./syncJobDetailModel";

const EXECUTION_PAGE_SIZE = 10;
const EVENT_PAGE_SIZE = 5;

function acceptedJobDetailPath(jobId: number | string, taskNo?: string | null): string {
  return taskNo
    ? `/jobs/tasks/${encodeURIComponent(taskNo)}`
    : `/jobs/${encodeURIComponent(String(jobId))}`;
}

export function SyncJobDetailPage() {
  const { id, taskNo: routeTaskNo } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { csrfToken, user } = useAuth();
  const requestedRunId = new URLSearchParams(location.search).get("runId");
  const [job, setJob] = useState<SyncJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [refreshNotice, setRefreshNotice] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const jobRef = useRef<SyncJob | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [controllingAction, setControllingAction] = useState<SyncJobControlAction | null>(null);
  const [dispositionAction, setDispositionAction] = useState<
    "dismiss" | "restore_attention" | null
  >(null);
  const [dismissConfirmOpen, setDismissConfirmOpen] = useState(false);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<number | string | null>(requestedRunId);
  const [activeHistoryTab, setActiveHistoryTab] = useState<"executions" | "events">("executions");
  const [executions, setExecutions] = useState<SyncJobExecution[]>([]);
  const [executionPage, setExecutionPage] = useState(1);
  const [executionTotal, setExecutionTotal] = useState(0);
  const [executionLoading, setExecutionLoading] = useState(false);
  const [executionError, setExecutionError] = useState("");
  const [lifecycleEvents, setLifecycleEvents] = useState<SyncJobLifecycleEvent[]>([]);
  const [eventPage, setEventPage] = useState(1);
  const [eventTotal, setEventTotal] = useState(0);
  const [eventLoading, setEventLoading] = useState(false);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [eventError, setEventError] = useState("");
  const [diagnosticsNavigationRequest, setDiagnosticsNavigationRequest] = useState(0);
  const routeGenerationRef = useRef(0);
  const requestSequenceRef = useRef(0);
  const requestInFlightSequenceRef = useRef<number | null>(null);
  const cancelInFlightRef = useRef(false);
  const routeAbortControllerRef = useRef<AbortController | null>(null);
  const executionRequestRef = useRef(0);
  const eventRequestRef = useRef(0);
  const executionInitializedRef = useRef(false);
  const executionTotalRef = useRef(0);
  const routeIdentifier = routeTaskNo ?? id;
  const currentJob =
    job && (routeTaskNo ? job.taskNo === routeTaskNo : String(job.id) === id) ? job : null;
  const currentJobIsActive = Boolean(currentJob && isTaskActive(getTaskStatus(currentJob)));
  const canOperate = user?.role === "admin" || user?.role === "operator";
  const routeState = location.state as {
    createdJobId?: string;
    createdTaskNo?: string;
    jobCreatedNotice?: string;
  } | null;
  const jobCreatedNotice = (
    routeTaskNo ? routeState?.createdTaskNo === routeTaskNo : routeState?.createdJobId === id
  )
    ? (routeState?.jobCreatedNotice ?? "")
    : "";
  const returnNavigation = getReturnNavigation(
    location.state,
    "/jobs",
    "返回任务列表",
    detailReturnPaths,
  );
  const currentPath = `${location.pathname}${location.search}${location.hash}`;

  const loadJob = useCallback(
    async (
      targetId: string,
      byTaskNo: boolean,
      generation: number,
      requestSequence: number,
      source: "initial" | "manual" | "auto" = "auto",
      signal?: AbortSignal,
    ): Promise<SyncJob | null> => {
      requestInFlightSequenceRef.current = requestSequence;
      try {
        const nextJob = byTaskNo
          ? await api.getSyncTask(targetId, signal)
          : await api.getSyncJob(targetId, signal);
        if (
          routeGenerationRef.current !== generation ||
          requestSequenceRef.current !== requestSequence
        )
          return null;
        jobRef.current = nextJob;
        setJob(nextJob);
        setError("");
        setLastUpdatedAt(new Date());
        if (source === "manual") setRefreshNotice("任务详情已刷新");
        if (source === "auto") setRefreshNotice("");
        return nextJob;
      } catch (caught) {
        if (isAbortError(caught)) return null;
        if (
          routeGenerationRef.current !== generation ||
          requestSequenceRef.current !== requestSequence
        )
          return null;
        setError(
          getApiErrorMessage(
            caught,
            jobRef.current ? "刷新失败，当前为上次结果" : "任务详情加载失败，请稍后重试",
          ),
        );
        return null;
      } finally {
        const isCurrentRequest =
          routeGenerationRef.current === generation &&
          requestSequenceRef.current === requestSequence;
        if (isCurrentRequest) {
          setLoading(false);
          if (source === "manual") setRefreshing(false);
        }
        if (requestInFlightSequenceRef.current === requestSequence) {
          requestInFlightSequenceRef.current = null;
        }
      }
    },
    [],
  );

  const loadExecutions = useCallback(
    async (
      targetId: string,
      byTaskNo: boolean,
      page: number,
      generation: number,
      signal?: AbortSignal,
    ) => {
      const requestSequence = ++executionRequestRef.current;
      setExecutionLoading(true);
      try {
        const result = byTaskNo
          ? await api.getSyncTaskExecutions(targetId, page, EXECUTION_PAGE_SIZE, signal)
          : await api.getSyncJobExecutions(targetId, page, EXECUTION_PAGE_SIZE, signal);
        if (
          routeGenerationRef.current !== generation ||
          executionRequestRef.current !== requestSequence
        )
          return;
        setExecutions(result.items);
        setExecutionPage(result.page);
        setExecutionTotal(result.total);
        executionTotalRef.current = result.total;
        executionInitializedRef.current = true;
        setExecutionError("");
      } catch (caught) {
        if (
          isAbortError(caught) ||
          routeGenerationRef.current !== generation ||
          executionRequestRef.current !== requestSequence
        )
          return;
        setExecutionError(getApiErrorMessage(caught, "执行记录加载失败，请稍后重试"));
      } finally {
        if (
          routeGenerationRef.current === generation &&
          executionRequestRef.current === requestSequence
        ) {
          setExecutionLoading(false);
        }
      }
    },
    [],
  );

  const loadEvents = useCallback(
    async (
      targetId: string,
      byTaskNo: boolean,
      page: number,
      generation: number,
      signal?: AbortSignal,
    ) => {
      const requestSequence = ++eventRequestRef.current;
      setEventLoading(true);
      try {
        const result = byTaskNo
          ? await api.getSyncTaskEvents(targetId, page, EVENT_PAGE_SIZE, signal)
          : await api.getSyncJobEvents(targetId, page, EVENT_PAGE_SIZE, signal);
        if (
          routeGenerationRef.current !== generation ||
          eventRequestRef.current !== requestSequence
        )
          return;
        setLifecycleEvents(result.items);
        setEventPage(result.page);
        setEventTotal(result.total);
        setEventsLoaded(true);
        setEventError("");
      } catch (caught) {
        if (
          isAbortError(caught) ||
          routeGenerationRef.current !== generation ||
          eventRequestRef.current !== requestSequence
        )
          return;
        setEventsLoaded(true);
        setEventError(getApiErrorMessage(caught, "任务事件加载失败，请稍后重试"));
      } finally {
        if (
          routeGenerationRef.current === generation &&
          eventRequestRef.current === requestSequence
        ) {
          setEventLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!routeIdentifier) return undefined;
    const generation = ++routeGenerationRef.current;
    const requestSequence = ++requestSequenceRef.current;
    const abortController = new AbortController();
    routeAbortControllerRef.current?.abort();
    routeAbortControllerRef.current = abortController;
    setJob(null);
    jobRef.current = null;
    setLoading(true);
    setError("");
    setActionNotice("");
    setRetrying(false);
    setCancelling(false);
    setControllingAction(null);
    setDispositionAction(null);
    setDismissConfirmOpen(false);
    setStopConfirmOpen(false);
    setSelectedRunId(null);
    setActiveHistoryTab("executions");
    setExecutions([]);
    setExecutionPage(1);
    setExecutionTotal(0);
    executionTotalRef.current = 0;
    executionInitializedRef.current = false;
    setExecutionError("");
    setLifecycleEvents([]);
    setEventPage(1);
    setEventTotal(0);
    setEventsLoaded(false);
    setEventError("");
    setDiagnosticsNavigationRequest(0);
    cancelInFlightRef.current = false;
    void loadJob(
      routeIdentifier,
      Boolean(routeTaskNo),
      generation,
      requestSequence,
      "initial",
      abortController.signal,
    );
    void loadExecutions(
      routeIdentifier,
      Boolean(routeTaskNo),
      1,
      generation,
      abortController.signal,
    );
    return () => {
      abortController.abort();
      if (routeGenerationRef.current === generation) {
        routeGenerationRef.current += 1;
      }
    };
  }, [loadExecutions, loadJob, routeIdentifier, routeTaskNo]);

  useEffect(() => {
    if (routeTaskNo || !currentJob?.taskNo) return;
    navigate(`${syncJobDetailPath(currentJob)}${location.search}${location.hash}`, {
      replace: true,
      state: location.state,
    });
  }, [currentJob, location.hash, location.search, location.state, navigate, routeTaskNo]);

  useEffect(() => {
    setSelectedRunId(requestedRunId);
  }, [routeIdentifier, requestedRunId]);

  useEffect(() => {
    if (activeHistoryTab !== "executions" || diagnosticsNavigationRequest === 0) return;
    document.getElementById("job-diagnostics")?.scrollIntoView?.({ block: "start" });
  }, [activeHistoryTab, diagnosticsNavigationRequest]);

  useEffect(() => {
    if (
      !routeIdentifier ||
      !executionInitializedRef.current ||
      currentJob?.executionCount == null ||
      currentJob.executionCount === executionTotalRef.current
    )
      return;
    void loadExecutions(
      currentJob.taskNo ?? routeIdentifier,
      Boolean(currentJob.taskNo ?? routeTaskNo),
      1,
      routeGenerationRef.current,
      routeAbortControllerRef.current?.signal,
    );
  }, [
    currentJob?.executionCount,
    currentJob?.taskNo,
    loadExecutions,
    routeIdentifier,
    routeTaskNo,
  ]);

  useVisiblePolling({
    enabled: Boolean(routeIdentifier && currentJobIsActive && !cancelling),
    intervalMs: 5000,
    onPoll: async () => {
      if (!routeIdentifier || requestInFlightSequenceRef.current !== null) return;
      const generation = routeGenerationRef.current;
      const requestSequence = ++requestSequenceRef.current;
      const pollIdentifier = jobRef.current?.taskNo ?? routeIdentifier;
      await loadJob(
        pollIdentifier,
        Boolean(jobRef.current?.taskNo ?? routeTaskNo),
        generation,
        requestSequence,
        "auto",
        routeAbortControllerRef.current?.signal,
      );
    },
  });

  function reloadJobDetail() {
    if (!routeIdentifier || loading || refreshing || requestInFlightSequenceRef.current !== null)
      return;
    const generation = routeGenerationRef.current;
    const requestSequence = ++requestSequenceRef.current;
    setRefreshing(true);
    setRefreshNotice("");
    setError("");
    void loadJob(
      routeIdentifier,
      Boolean(routeTaskNo),
      generation,
      requestSequence,
      "manual",
      routeAbortControllerRef.current?.signal,
    );
    void loadExecutions(
      currentJob?.taskNo ?? routeIdentifier,
      Boolean(currentJob?.taskNo ?? routeTaskNo),
      executionPage,
      generation,
      routeAbortControllerRef.current?.signal,
    );
  }

  function loadExecutionPage(page: number) {
    if (!routeIdentifier || executionLoading) return;
    void loadExecutions(
      currentJob?.taskNo ?? routeIdentifier,
      Boolean(currentJob?.taskNo ?? routeTaskNo),
      page,
      routeGenerationRef.current,
      routeAbortControllerRef.current?.signal,
    );
  }

  function loadEventPage(page: number) {
    if (!routeIdentifier || eventLoading) return;
    void loadEvents(
      currentJob?.taskNo ?? routeIdentifier,
      Boolean(currentJob?.taskNo ?? routeTaskNo),
      page,
      routeGenerationRef.current,
      routeAbortControllerRef.current?.signal,
    );
  }

  function changeHistoryTab(key: string) {
    const nextTab = key as "executions" | "events";
    setActiveHistoryTab(nextTab);
    if (nextTab === "events" && !eventsLoaded && !eventLoading) {
      loadEventPage(1);
    }
  }

  async function showAcceptedExecution(
    accepted: JobAcceptedResponse,
    fallbackTaskNo: string | undefined,
    generation: number,
  ) {
    if (routeGenerationRef.current !== generation) return;
    const acceptedTaskNo = accepted.taskNo ?? fallbackTaskNo;
    if (accepted.outcome === "already_caught_up") {
      setActionNotice(
        "当前数据已追平，无需重试。原执行失败记录仍保留，相关数据范围已由后续同步覆盖。",
      );
      const requestSequence = ++requestSequenceRef.current;
      await loadJob(
        acceptedTaskNo ?? String(accepted.jobId),
        Boolean(acceptedTaskNo),
        generation,
        requestSequence,
        "auto",
        routeAbortControllerRef.current?.signal,
      );
      return;
    }
    if (acceptedTaskNo && acceptedTaskNo === routeTaskNo) {
      const requestSequence = ++requestSequenceRef.current;
      await loadJob(
        acceptedTaskNo,
        true,
        generation,
        requestSequence,
        "auto",
        routeAbortControllerRef.current?.signal,
      );
      return;
    }
    navigate(acceptedJobDetailPath(accepted.jobId, acceptedTaskNo), {
      state: location.state,
    });
  }

  async function retry() {
    if (!routeIdentifier || !csrfToken || !currentJob || !hasSyncJobAction(currentJob, "retry"))
      return;
    const targetId = currentJob.taskNo ?? routeIdentifier;
    const generation = routeGenerationRef.current;
    setRetrying(true);
    setError("");
    setActionNotice("");
    requestSequenceRef.current += 1;
    try {
      const accepted = currentJob.taskNo
        ? await api.retrySyncTask(currentJob.taskNo, csrfToken)
        : await api.retrySyncJob(targetId, csrfToken);
      await showAcceptedExecution(accepted, currentJob.taskNo, generation);
    } catch (caught) {
      if (routeGenerationRef.current !== generation) return;
      setError(getApiErrorMessage(caught, "重试失败，请稍后重试"));
    } finally {
      if (routeGenerationRef.current === generation) setRetrying(false);
    }
  }

  async function cancel() {
    if (
      !routeIdentifier ||
      !csrfToken ||
      !currentJob ||
      !hasSyncJobAction(currentJob, "cancel") ||
      cancelInFlightRef.current
    )
      return;
    const targetId = currentJob.taskNo ?? routeIdentifier;
    const generation = routeGenerationRef.current;
    cancelInFlightRef.current = true;
    setCancelling(true);
    setError("");
    // 取消属于更新操作，先让此前的详情或轮询请求失效，避免旧排队状态回写。
    requestSequenceRef.current += 1;
    try {
      if (currentJob.taskNo) await api.cancelSyncTask(currentJob.taskNo, csrfToken);
      else await api.cancelSyncJob(targetId, csrfToken);
      if (routeGenerationRef.current !== generation) return;
      const refreshSequence = ++requestSequenceRef.current;
      await loadJob(
        targetId,
        Boolean(currentJob.taskNo),
        generation,
        refreshSequence,
        "auto",
        routeAbortControllerRef.current?.signal,
      );
    } catch (caught) {
      if (routeGenerationRef.current !== generation) return;
      setError(getApiErrorMessage(caught, "取消失败，请稍后重试"));
    } finally {
      if (routeGenerationRef.current === generation) {
        cancelInFlightRef.current = false;
        setCancelling(false);
      }
    }
  }

  async function updateDisposition(action: "dismiss" | "restore_attention") {
    if (
      !routeIdentifier ||
      !csrfToken ||
      !currentJob ||
      dispositionAction !== null ||
      !hasSyncJobAction(currentJob, action)
    )
      return;
    const targetId = currentJob.taskNo ?? routeIdentifier;
    const generation = routeGenerationRef.current;
    setDispositionAction(action);
    setError("");
    setActionNotice("");
    requestSequenceRef.current += 1;
    try {
      if (action === "dismiss") {
        if (currentJob.taskNo) {
          await api.dismissSyncTaskAttention(currentJob.taskNo, csrfToken);
        } else {
          await api.dismissSyncJobAttention(targetId, csrfToken);
        }
      } else if (currentJob.taskNo) {
        await api.restoreSyncTaskAttention(currentJob.taskNo, csrfToken);
      } else {
        await api.restoreSyncJobAttention(targetId, csrfToken);
      }
      if (routeGenerationRef.current !== generation) return;
      const requestSequence = ++requestSequenceRef.current;
      await loadJob(
        targetId,
        Boolean(currentJob.taskNo),
        generation,
        requestSequence,
        "auto",
        routeAbortControllerRef.current?.signal,
      );
      if (routeGenerationRef.current !== generation) return;
      setDismissConfirmOpen(false);
      setActionNotice(action === "dismiss" ? "已忽略此失败提醒" : "已恢复关注此失败任务");
    } catch (caught) {
      if (routeGenerationRef.current !== generation) return;
      setError(
        getApiErrorMessage(
          caught,
          action === "dismiss" ? "忽略提醒失败，请稍后重试" : "恢复关注失败，请稍后重试",
        ),
      );
    } finally {
      if (routeGenerationRef.current === generation) setDispositionAction(null);
    }
  }

  async function control(action: SyncJobControlAction) {
    if (!routeIdentifier || !csrfToken || !currentJob || controllingAction !== null) return;
    const backendAction = action === "withdraw" ? "withdraw_pause" : action;
    if (!hasSyncJobAction(currentJob, backendAction)) return;
    const generation = routeGenerationRef.current;
    setControllingAction(action);
    setError("");
    requestSequenceRef.current += 1;
    try {
      if (action === "pause") {
        if (currentJob.taskNo) await api.pauseSyncTask(currentJob.taskNo, csrfToken);
        else await api.pauseSyncJob(routeIdentifier, csrfToken);
      }
      if (action === "withdraw") {
        if (currentJob.taskNo) await api.withdrawSyncTaskPause(currentJob.taskNo, csrfToken);
        else await api.withdrawSyncJobPause(routeIdentifier, csrfToken);
      }
      if (action === "stop") {
        if (currentJob.taskNo) await api.stopSyncTask(currentJob.taskNo, csrfToken);
        else await api.stopSyncJob(routeIdentifier, csrfToken);
      }
      if (action === "resume") {
        const accepted = currentJob.taskNo
          ? await api.resumeSyncTask(currentJob.taskNo, csrfToken)
          : await api.resumeSyncJob(routeIdentifier, csrfToken);
        await showAcceptedExecution(accepted, currentJob.taskNo, generation);
        return;
      }
      if (routeGenerationRef.current !== generation) return;
      const sequence = ++requestSequenceRef.current;
      await loadJob(
        currentJob.taskNo ?? routeIdentifier,
        Boolean(currentJob.taskNo),
        generation,
        sequence,
        "auto",
        routeAbortControllerRef.current?.signal,
      );
      if (action === "stop" && routeGenerationRef.current === generation) {
        setStopConfirmOpen(false);
      }
    } catch (caught) {
      if (routeGenerationRef.current === generation) {
        setError(getApiErrorMessage(caught, "任务控制失败，请稍后重试"));
      }
    } finally {
      if (routeGenerationRef.current === generation) setControllingAction(null);
    }
  }

  const progress = currentJob?.historyProgress;
  const nextWindowQueued =
    currentJob?.taskStatus == null &&
    currentJob?.status === "success" &&
    progress != null &&
    progress.completedWindows < progress.totalWindows;
  const displayedExecutionTotal = currentJob?.executionCount ?? executionTotal;
  const orderedExecutions = useMemo(
    () =>
      executions.map((execution) =>
        currentJob?.currentExecutionId != null &&
        String(execution.id) === String(currentJob.currentExecutionId) &&
        currentJob.executionStatus
          ? { ...execution, status: currentJob.executionStatus }
          : execution,
      ),
    [currentJob?.currentExecutionId, currentJob?.executionStatus, executions],
  );
  const latestExecutionRunId = orderedExecutions.find(
    (execution) => execution.syncRunId != null,
  )?.syncRunId;
  const diagnosticRunId = selectedRunId ?? currentJob?.syncRunId ?? latestExecutionRunId ?? null;
  const diagnosticExecution =
    diagnosticRunId == null
      ? null
      : orderedExecutions.find(
          (execution) => String(execution.syncRunId) === String(diagnosticRunId),
        );
  const isCurrentDiagnosticRun =
    diagnosticRunId != null &&
    currentJob?.syncRunId != null &&
    String(diagnosticRunId) === String(currentJob.syncRunId);
  const diagnosticBatchNo =
    diagnosticExecution?.syncBatchNo ?? (isCurrentDiagnosticRun ? currentJob?.syncBatchNo : null);
  const diagnosticStatus =
    diagnosticExecution?.status ?? (isCurrentDiagnosticRun ? currentJob?.status : null);
  const diagnosticWindowStart =
    diagnosticExecution?.windowStart ?? (isCurrentDiagnosticRun ? currentJob?.windowStart : null);
  const diagnosticWindowEnd =
    diagnosticExecution?.windowEnd ?? (isCurrentDiagnosticRun ? currentJob?.windowEnd : null);
  const rawDataPath =
    diagnosticBatchNo && currentJob?.jijiaAccountId != null
      ? `/raw-data?${new URLSearchParams({
          jijiaAccountId: String(currentJob.jijiaAccountId),
          apiCode: currentJob.apiCode,
          observedBatchNo: diagnosticBatchNo,
          taskId: String(currentJob.id),
          ...(diagnosticRunId != null ? { runId: String(diagnosticRunId) } : {}),
          ...(diagnosticStatus ? { runStatus: diagnosticStatus } : {}),
          ...(diagnosticWindowStart ? { windowStart: diagnosticWindowStart } : {}),
          ...(diagnosticWindowEnd ? { windowEnd: diagnosticWindowEnd } : {}),
        }).toString()}`
      : null;
  const executionColumns: TableColumnsType<SyncJobExecution> = [
    { title: "窗口", dataIndex: "windowIndex", key: "windowIndex" },
    {
      title: "数据范围",
      key: "range",
      render: (_, execution) =>
        execution.windowStart && execution.windowEnd
          ? `${execution.windowStart} 至 ${execution.windowEnd}`
          : "完整接口数据",
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (status: string) => (
        <Tag className={`m3-status m3-status--${status}`}>{statusLabel(status)}</Tag>
      ),
    },
    {
      title: "批次",
      dataIndex: "syncBatchNo",
      key: "syncBatchNo",
      render: (value) => value ?? "—",
    },
    {
      title: "开始时间",
      dataIndex: "startedAt",
      key: "startedAt",
      render: (value: string | null | undefined) => formatDate(value),
    },
    {
      title: "诊断",
      key: "diagnostics",
      render: (_, execution) =>
        execution.syncRunId != null ? (
          <Button
            aria-pressed={String(diagnosticRunId) === String(execution.syncRunId)}
            className="text-button execution-diagnostic-button"
            type="text"
            onClick={() => setSelectedRunId(execution.syncRunId)}
          >
            查看诊断
          </Button>
        ) : (
          "尚未生成"
        ),
    },
  ];

  return (
    <AppShell>
      <main className="m3-page">
        <SourceBackLink fallbackPath="/jobs" fallbackLabel="返回任务列表" />
        {jobCreatedNotice ? (
          <div aria-live="polite" role="status">
            <Alert title={jobCreatedNotice} showIcon type="success" />
          </div>
        ) : null}
        {loading && !currentJob ? <Spin description="正在加载任务详情…" /> : null}
        {actionNotice ? (
          <div aria-live="polite" role="status">
            <Alert title={actionNotice} showIcon type="success" />
          </div>
        ) : null}
        {error ? (
          <Alert
            action={
              !currentJob ? (
                <Button loading={loading} onClick={reloadJobDetail}>
                  重新加载
                </Button>
              ) : undefined
            }
            title={error}
            showIcon
            type={currentJob ? "warning" : "error"}
          />
        ) : null}
        {currentJob ? (
          <>
            <header className="page-heading job-detail-heading">
              <div className="job-detail-heading-copy">
                <div className="job-detail-title-line">
                  <h1>{currentJob.apiName ?? currentJob.apiCode}</h1>
                  <Tag className={`m3-status m3-status--${getTaskStatus(currentJob)}`}>
                    {taskStatusLabel(getTaskStatus(currentJob))}
                  </Tag>
                </div>
                <p className="job-detail-meta">
                  <span>
                    任务号：{currentJob.taskNo ?? currentJob.jobNo ?? `任务 #${currentJob.id}`}
                  </span>
                  <span>
                    账号：
                    {currentJob.accountName ??
                      (currentJob.jijiaAccountId
                        ? `账号 ${currentJob.jijiaAccountId}`
                        : "legacy 账号")}
                  </span>
                  <span>API：{currentJob.apiCode}</span>
                </p>
                <p className="job-detail-stage">当前阶段：{executionStageLabel(currentJob)}</p>
                <p className="job-detail-stage">
                  <RefreshStatus
                    failedWithPreviousData={Boolean(error && currentJob)}
                    lastUpdatedAt={lastUpdatedAt}
                    manualRefreshMessage={refreshNotice}
                    refreshing={refreshing}
                  />
                </p>
              </div>
            </header>
            <WorkerStatusPanel
              compact
              currentExecutionId={currentJob.currentExecutionId ?? currentJob.id}
            />
            <SyncJobActionPanel
              canOperate={canOperate}
              cancelling={cancelling}
              controllingAction={controllingAction}
              dispositionAction={dispositionAction}
              job={currentJob}
              rawDataPath={rawDataPath}
              retrying={retrying}
              onCancel={() => void cancel()}
              onControl={(action) => void control(action)}
              onDismiss={() => setDismissConfirmOpen(true)}
              onRequestStop={() => setStopConfirmOpen(true)}
              onRestoreAttention={() => void updateDisposition("restore_attention")}
              onRetry={() => void retry()}
              onShowDiagnostics={() => {
                setActiveHistoryTab("executions");
                setDiagnosticsNavigationRequest((request) => request + 1);
              }}
            />
            {nextWindowQueued ? (
              <section className="m3-card job-context-notice" aria-labelledby="next-window-title">
                <h2 id="next-window-title">后续窗口</h2>
                <p>
                  下一窗口已自动排队。{" "}
                  <Link
                    className="m3-link"
                    to={returnNavigation.path}
                    state={returnNavigation.state}
                  >
                    返回任务列表查看最新任务
                  </Link>
                </p>
              </section>
            ) : null}
            <SyncJobProgressSection
              executionCount={displayedExecutionTotal}
              job={currentJob}
              runDetailState={{ from: currentPath, backLabel: "返回任务详情" }}
            />
            <p className="timezone-note">{timeZoneNote()}</p>
            <section className="m3-card job-history-card" aria-label="任务执行与事件">
              <Tabs
                activeKey={activeHistoryTab}
                onChange={changeHistoryTab}
                items={[
                  {
                    key: "executions",
                    label: `执行记录（${displayedExecutionTotal}）`,
                    children: (
                      <div className="job-history-panel">
                        {executionError ? (
                          <Alert
                            action={
                              <Button onClick={() => loadExecutionPage(executionPage)}>重试</Button>
                            }
                            showIcon
                            title={executionError}
                            type="warning"
                          />
                        ) : null}
                        {orderedExecutions.length > 0 ? (
                          <div className="responsive-table-wrap responsive-table-wrap--cards">
                            <Table
                              key={`${currentJob.id}-${requestedRunId ?? "latest"}`}
                              className="responsive-table responsive-table--cards executions-table"
                              columns={executionColumns}
                              dataSource={orderedExecutions}
                              loading={executionLoading}
                              pagination={{
                                current: executionPage,
                                hideOnSinglePage: true,
                                pageSize: EXECUTION_PAGE_SIZE,
                                showSizeChanger: false,
                                showTotal: (total) => `共 ${total} 次执行`,
                                total: executionTotal,
                                onChange: loadExecutionPage,
                              }}
                              rowClassName={(execution) =>
                                diagnosticRunId != null &&
                                String(execution.syncRunId) === String(diagnosticRunId)
                                  ? "execution-row--selected"
                                  : ""
                              }
                              rowKey={(execution) => String(execution.id)}
                              scroll={{ x: 960 }}
                            />
                          </div>
                        ) : executionLoading ? (
                          <Spin description="正在加载执行记录…" />
                        ) : (
                          <Empty description="尚无执行记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        )}
                        {diagnosticRunId != null ? (
                          <JobRunDiagnostics batchNo={diagnosticBatchNo} runId={diagnosticRunId} />
                        ) : null}
                        {rawDataPath ? (
                          <section
                            className="m3-card job-data-result"
                            id="job-data"
                            aria-labelledby="job-data-title"
                          >
                            <div>
                              <h2 id="job-data-title">数据结果</h2>
                              <p className="muted-copy">
                                当前选择批次 {diagnosticBatchNo}
                                ；验证该批次观察到的记录及其当前快照。
                              </p>
                            </div>
                            <Link className="action-link action-link--primary" to={rawDataPath}>
                              验证所选批次数据
                            </Link>
                          </section>
                        ) : null}
                      </div>
                    ),
                  },
                  {
                    key: "events",
                    label: eventsLoaded ? `任务事件（${eventTotal}）` : "任务事件",
                    children: eventError ? (
                      <Alert
                        action={<Button onClick={() => loadEventPage(eventPage)}>重试</Button>}
                        showIcon
                        title={eventError}
                        type="warning"
                      />
                    ) : eventLoading ? (
                      <Spin description="正在加载任务事件…" />
                    ) : lifecycleEvents.length > 0 ? (
                      <SyncJobLifecycle
                        currentPage={eventPage}
                        events={lifecycleEvents}
                        pageSize={EVENT_PAGE_SIZE}
                        total={eventTotal}
                        onPageChange={loadEventPage}
                      />
                    ) : (
                      <Empty description="尚无任务事件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    ),
                  },
                ]}
              />
            </section>
          </>
        ) : null}
        <Modal
          cancelText="取消"
          cancelButtonProps={{ disabled: dispositionAction === "dismiss" }}
          confirmLoading={dispositionAction === "dismiss"}
          destroyOnHidden
          okText="确认忽略"
          open={dismissConfirmOpen}
          title="忽略失败提醒"
          onCancel={() => setDismissConfirmOpen(false)}
          onOk={() => void updateDisposition("dismiss")}
        >
          <Alert
            description="忽略后，此任务不再计入概览告警和“需处理”列表；失败记录不会删除，可随时恢复关注。"
            showIcon
            title="确认忽略此提醒吗？"
            type="warning"
          />
        </Modal>
        <Modal
          cancelText="取消"
          cancelButtonProps={{ disabled: controllingAction === "stop" }}
          confirmLoading={controllingAction === "stop"}
          destroyOnHidden
          okButtonProps={{ danger: true }}
          okText="确认停止"
          open={stopConfirmOpen}
          title="停止任务"
          onCancel={() => setStopConfirmOpen(false)}
          onOk={() => void control("stop")}
        >
          <Alert
            description="停止后不会再执行此任务的后续窗口，定时计划不受影响。"
            showIcon
            title="确认停止吗？"
            type="warning"
          />
        </Modal>
      </main>
    </AppShell>
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
