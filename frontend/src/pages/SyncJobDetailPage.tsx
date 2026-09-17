import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Empty, Modal, Spin, Table, Tabs, Tag } from "antd";
import type { TableColumnsType } from "antd";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { api } from "../api/client";
import type { JobAcceptedResponse, SyncJob } from "../api/types";
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
  const [refreshNotice, setRefreshNotice] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const jobRef = useRef<SyncJob | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [controllingAction, setControllingAction] = useState<SyncJobControlAction | null>(null);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<number | string | null>(requestedRunId);
  const [activeHistoryTab, setActiveHistoryTab] = useState<"executions" | "events">("executions");
  const [diagnosticsNavigationRequest, setDiagnosticsNavigationRequest] = useState(0);
  const routeGenerationRef = useRef(0);
  const requestSequenceRef = useRef(0);
  const requestInFlightSequenceRef = useRef<number | null>(null);
  const cancelInFlightRef = useRef(false);
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
    ): Promise<SyncJob | null> => {
      requestInFlightSequenceRef.current = requestSequence;
      try {
        const nextJob = byTaskNo ? await api.getSyncTask(targetId) : await api.getSyncJob(targetId);
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

  useEffect(() => {
    if (!routeIdentifier) return undefined;
    const generation = ++routeGenerationRef.current;
    const requestSequence = ++requestSequenceRef.current;
    setJob(null);
    jobRef.current = null;
    setLoading(true);
    setError("");
    setRetrying(false);
    setCancelling(false);
    setControllingAction(null);
    setStopConfirmOpen(false);
    setSelectedRunId(null);
    setActiveHistoryTab("executions");
    setDiagnosticsNavigationRequest(0);
    cancelInFlightRef.current = false;
    void loadJob(routeIdentifier, Boolean(routeTaskNo), generation, requestSequence, "initial");
    return () => {
      if (routeGenerationRef.current === generation) {
        routeGenerationRef.current += 1;
      }
    };
  }, [loadJob, routeIdentifier, routeTaskNo]);

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

  useVisiblePolling({
    enabled: Boolean(routeIdentifier && currentJobIsActive && !cancelling),
    intervalMs: 3000,
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
    void loadJob(routeIdentifier, Boolean(routeTaskNo), generation, requestSequence, "manual");
  }

  async function showAcceptedExecution(
    accepted: JobAcceptedResponse,
    fallbackTaskNo: string | undefined,
    generation: number,
  ) {
    if (routeGenerationRef.current !== generation) return;
    const acceptedTaskNo = accepted.taskNo ?? fallbackTaskNo;
    if (acceptedTaskNo && acceptedTaskNo === routeTaskNo) {
      const requestSequence = ++requestSequenceRef.current;
      await loadJob(acceptedTaskNo, true, generation, requestSequence);
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
      await loadJob(targetId, Boolean(currentJob.taskNo), generation, refreshSequence);
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
  const executions = currentJob?.executions ?? [];
  const lifecycleEvents = currentJob?.lifecycleEvents ?? [];
  const orderedExecutions = useMemo(
    () =>
      [...(currentJob?.executions ?? [])].sort((left, right) => {
        const leftIsCurrent =
          currentJob?.syncRunId != null && String(left.syncRunId) === String(currentJob.syncRunId);
        const rightIsCurrent =
          currentJob?.syncRunId != null && String(right.syncRunId) === String(currentJob.syncRunId);
        if (leftIsCurrent !== rightIsCurrent) return leftIsCurrent ? -1 : 1;
        const timeDifference = executionTimestamp(right) - executionTimestamp(left);
        return timeDifference || String(right.id).localeCompare(String(left.id));
      }),
    [currentJob?.executions, currentJob?.syncRunId],
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
  const selectedExecutionIndex = orderedExecutions.findIndex(
    (execution) =>
      diagnosticRunId != null && String(execution.syncRunId) === String(diagnosticRunId),
  );
  const defaultExecutionPage =
    selectedExecutionIndex >= 0 ? Math.floor(selectedExecutionIndex / 10) + 1 : 1;
  const executionColumns: TableColumnsType<NonNullable<SyncJob["executions"]>[number]> = [
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
              job={currentJob}
              rawDataPath={rawDataPath}
              retrying={retrying}
              onCancel={() => void cancel()}
              onControl={(action) => void control(action)}
              onRequestStop={() => setStopConfirmOpen(true)}
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
              executionCount={executions.length}
              job={currentJob}
              runDetailState={{ from: currentPath, backLabel: "返回任务详情" }}
            />
            <p className="timezone-note">{timeZoneNote()}</p>
            <section className="m3-card job-history-card" aria-label="任务执行与事件">
              <Tabs
                activeKey={activeHistoryTab}
                onChange={(key) => setActiveHistoryTab(key as "executions" | "events")}
                items={[
                  {
                    key: "executions",
                    label: `执行记录（${executions.length}）`,
                    children: (
                      <div className="job-history-panel">
                        {executions.length > 0 ? (
                          <div className="responsive-table-wrap responsive-table-wrap--cards">
                            <Table
                              key={`${currentJob.id}-${requestedRunId ?? "latest"}`}
                              className="responsive-table responsive-table--cards executions-table"
                              columns={executionColumns}
                              dataSource={orderedExecutions}
                              pagination={{
                                defaultCurrent: defaultExecutionPage,
                                hideOnSinglePage: true,
                                pageSize: 10,
                                showSizeChanger: false,
                                showTotal: (total) => `共 ${total} 次执行`,
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
                    label: `任务事件（${lifecycleEvents.length}）`,
                    children:
                      lifecycleEvents.length > 0 ? (
                        <SyncJobLifecycle key={String(currentJob.id)} events={lifecycleEvents} />
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

function executionTimestamp(execution: NonNullable<SyncJob["executions"]>[number]): number {
  const value = execution.startedAt ?? execution.createdAt ?? "";
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
