import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  Input,
  Modal,
  Select,
  Table,
  Tag,
  type TableColumnsType,
} from "antd";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { api } from "../api/client";
import type { AuditLog, JijiaAccount } from "../api/types";
import { AppShell } from "../components/AppShell";
import { RefreshStatus } from "../components/RefreshStatus";
import { formatDate, getApiErrorMessage, timeZoneNote } from "./m3Utils";

interface AuditFilters {
  accountId: string;
  actorUserId: string;
  resourceType: string;
  resourceId: string;
  action: string;
  result: "" | "success" | "failure";
  createdFrom: string;
  createdTo: string;
}

const actionLabels: Record<string, string> = {
  "api_policy.batch_update": "批量更新接口策略",
  "api_policy.update": "更新接口策略",
  "auth.login": "登录系统",
  "auth.login.lock": "登录被锁定",
  "auth.logout": "退出系统",
  "auth.password.change": "修改登录密码",
  "auth.password.reset": "重置登录密码",
  "invitation.create": "邀请成员",
  "invitation.resend": "重新发送邀请",
  "invitation.revoke": "撤销邀请",
  "jijia_account.create": "接入积加账号",
  "jijia_account.deactivate": "停用积加账号",
  "jijia_account.update": "更新账号凭证",
  "jijia_account.verify": "验证账号连接",
  "raw_data.view": "查看原始数据",
  "raw_data.versions_view": "查看数据版本",
  "sale_return_order.list": "查询退货订单",
  "sync_job.cancel": "取消同步任务",
  "sync_job.create": "创建同步任务",
  "sync_job.pause_request": "申请暂停任务",
  "sync_job.pause_withdraw": "撤回暂停申请",
  "sync_job.resume": "继续同步任务",
  "sync_job.retry": "重试同步任务",
  "sync_job.schedule": "计划创建任务",
  "sync_job.stop": "停止同步任务",
  "user.disable": "停用成员",
  "user.role.update": "修改成员角色",
  "user.status.update": "修改成员状态",
};

const resourceLabels: Record<string, string> = {
  app_user: "成员",
  user: "成员",
  api_policy: "接口策略",
  invitation: "邀请",
  jijia_account: "积加账号",
  raw_data: "原始数据",
  raw_api_data: "原始数据",
  sale_return_order: "退货订单",
  sync_job: "同步任务",
};

export function AuditPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedFilters = useMemo<AuditFilters>(
    () => ({
      accountId: searchParams.get("account") ?? "",
      actorUserId: searchParams.get("actorUserId") ?? "",
      resourceType: searchParams.get("resourceType") ?? "",
      resourceId: searchParams.get("resourceId") ?? "",
      action: searchParams.get("action") ?? "",
      result: (searchParams.get("result") as AuditFilters["result"] | null) ?? "",
      createdFrom: searchParams.get("from") ?? "",
      createdTo: searchParams.get("to") ?? "",
    }),
    [searchParams],
  );
  const filterKey = JSON.stringify(selectedFilters);
  const savedAudit = location.state?.auditPosition as
    { filterKey: string; count: number } | undefined;
  const restoredAuditRef = useRef(savedAudit);
  const requestSequenceRef = useRef(0);
  const manualRefreshInFlightRef = useRef(false);
  const [filters, setFilters] = useState(selectedFilters);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [accounts, setAccounts] = useState<JijiaAccount[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [accountError, setAccountError] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [loadedFilterKey, setLoadedFilterKey] = useState("");
  function resourceState(log: AuditLog) {
    return {
      from: `${location.pathname}${location.search}#audit-log-${log.id}`,
      backLabel: "返回审计日志",
      returnState: { auditPosition: { filterKey, count: logs.length } },
    };
  }

  useEffect(() => {
    if (loading || loadingMore || !logs.length) return;
    if (savedAudit?.filterKey !== filterKey || savedAudit.count !== logs.length) {
      navigate(`${location.pathname}${location.search}${location.hash}`, {
        replace: true,
        state: { ...location.state, auditPosition: { filterKey, count: logs.length } },
      });
    }
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView?.();
  }, [
    loading,
    loadingMore,
    logs.length,
    filterKey,
    location,
    navigate,
    savedAudit?.filterKey,
    savedAudit?.count,
  ]);
  const hasActiveFilters = Object.values(selectedFilters).some(Boolean);

  useEffect(() => {
    let active = true;
    void api
      .listAccounts()
      .then((accountRows) => {
        if (active) setAccounts(accountRows);
      })
      .catch((caught: unknown) => {
        if (active) setAccountError(getApiErrorMessage(caught, "账号筛选选项加载失败"));
      });
    return () => {
      active = false;
    };
  }, []);

  const loadLogs = useCallback(
    async (cursor: string | undefined, requestFilters: AuditFilters, targetCount = 0) => {
      const requestSequence = ++requestSequenceRef.current;
      setError("");
      if (cursor) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setLoadingMore(false);
      }
      try {
        const query = {
          cursor,
          jijiaAccountId: requestFilters.accountId ? Number(requestFilters.accountId) : undefined,
          ...(requestFilters.actorUserId
            ? { actorUserId: Number(requestFilters.actorUserId) }
            : {}),
          ...(requestFilters.resourceType ? { resourceType: requestFilters.resourceType } : {}),
          ...(requestFilters.resourceId.trim()
            ? { resourceId: requestFilters.resourceId.trim() }
            : {}),
          ...(requestFilters.action.trim() ? { action: requestFilters.action.trim() } : {}),
          ...(requestFilters.result ? { result: requestFilters.result } : {}),
          ...(requestFilters.createdFrom
            ? { createdFrom: localDateTimeToIso(requestFilters.createdFrom) }
            : {}),
          ...(requestFilters.createdTo
            ? { createdTo: localDateTimeToIso(requestFilters.createdTo, true) }
            : {}),
        };
        const firstPage = await api.listAuditLogs(query);
        const result = { items: [...firstPage.items], nextCursor: firstPage.nextCursor };
        while (result.nextCursor && result.items.length < targetCount) {
          if (requestSequenceRef.current !== requestSequence) return;
          const more = await api.listAuditLogs({ ...query, cursor: result.nextCursor });
          result.items.push(...more.items);
          result.nextCursor = more.nextCursor;
        }
        if (requestSequenceRef.current !== requestSequence) return;
        setLogs((current) => (cursor ? [...current, ...result.items] : result.items));
        setNextCursor(result.nextCursor ?? null);
        if (!cursor) {
          setLastCheckedAt(new Date());
          setLoadedFilterKey(JSON.stringify(requestFilters));
        }
      } catch (caught) {
        if (requestSequenceRef.current !== requestSequence) return;
        setError(getApiErrorMessage(caught, "审计日志加载失败，请稍后重试"));
      } finally {
        if (requestSequenceRef.current === requestSequence) {
          if (cursor) {
            setLoadingMore(false);
          } else {
            setLoading(false);
          }
        }
      }
    },
    [],
  );

  useEffect(() => {
    setFilters(selectedFilters);
    setLogs([]);
    setNextCursor(null);
    setLoadedFilterKey("");
    manualRefreshInFlightRef.current = false;
    const restoredAudit = restoredAuditRef.current;
    const targetCount = restoredAudit?.filterKey === filterKey ? restoredAudit.count : 0;
    void loadLogs(undefined, selectedFilters, targetCount);
    return () => {
      requestSequenceRef.current += 1;
    };
  }, [filterKey, loadLogs, selectedFilters]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (filters.accountId) next.account = filters.accountId;
    if (filters.actorUserId) next.actorUserId = filters.actorUserId;
    if (filters.resourceType) next.resourceType = filters.resourceType;
    if (filters.resourceId.trim()) next.resourceId = filters.resourceId.trim();
    if (filters.action.trim()) next.action = filters.action.trim();
    if (filters.result) next.result = filters.result;
    if (filters.createdFrom) next.from = filters.createdFrom;
    if (filters.createdTo) next.to = filters.createdTo;
    if (
      Object.values(selectedFilters).filter(Boolean).length === Object.keys(next).length &&
      Object.entries(next).every(([key, value]) => searchParams.get(key) === value)
    ) {
      refreshLogs();
    } else {
      setSearchParams(next);
    }
  }

  function refreshLogs() {
    if (loading || loadingMore || manualRefreshInFlightRef.current) return;
    manualRefreshInFlightRef.current = true;
    void loadLogs(undefined, selectedFilters, logs.length).finally(() => {
      manualRefreshInFlightRef.current = false;
    });
  }

  function updateFilter(name: keyof AuditFilters, value: string) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  const columns: TableColumnsType<AuditLog> = [
    {
      title: "时间与操作者",
      key: "actor",
      width: 210,
      render: (_, log) => (
        <div className="table-cell-stack">
          {formatDate(log.createdAt)}
          <small>{log.actorName ?? (log.actorUserId ? `用户 ${log.actorUserId}` : "系统")}</small>
        </div>
      ),
    },
    {
      title: "操作",
      key: "action",
      width: 220,
      render: (_, log) => (
        <div className="table-cell-stack">
          <span>{actionLabel(log.action)}</span>
          <small>{auditCategory(log.action)}</small>
          {actionLabels[log.action] ? <code>{log.action}</code> : null}
        </div>
      ),
    },
    {
      title: "资源",
      key: "resource",
      width: 180,
      render: (_, log) => {
        const path = resourcePath(log);
        const label = `${resourceLabel(log.resourceType)}${log.resourceId ? ` #${log.resourceId}` : ""}`;
        return path ? (
          <Link className="m3-link" to={path} state={resourceState(log)}>
            {label}
          </Link>
        ) : (
          label
        );
      },
    },
    {
      title: "结果",
      dataIndex: "result",
      key: "result",
      width: 100,
      render: (result: AuditLog["result"]) => (
        <Tag color={result === "success" ? "success" : "error"}>
          {result === "success" ? "成功" : "失败"}
        </Tag>
      ),
    },
    {
      title: "详情",
      key: "details",
      width: 110,
      render: (_, log) => (
        <Button type="link" onClick={() => setSelectedLog(log)}>
          查看详情
        </Button>
      ),
    },
  ];
  const hasPreviousResult = loadedFilterKey === filterKey && lastCheckedAt !== null;
  const refreshing = loading && hasPreviousResult;

  return (
    <AppShell>
      <main className="m3-page">
        <header className="page-heading">
          <div>
            <h1>审计日志</h1>
          </div>
        </header>
        {error || accountError ? (
          <Alert
            className="page-alert"
            role="alert"
            title={error || accountError}
            showIcon
            type={error && hasPreviousResult ? "warning" : "error"}
          />
        ) : null}
        <form className="m3-filter audit-filter" aria-label="审计日志筛选" onSubmit={submit}>
          <label htmlFor="audit-account-filter">
            积加账号
            <Select
              aria-label="积加账号"
              id="audit-account-filter"
              options={[
                { label: "全部账号", value: "" },
                ...accounts.map((account) => ({ label: account.name, value: String(account.id) })),
              ]}
              value={filters.accountId}
              onChange={(value) => updateFilter("accountId", value)}
            />
          </label>
          <label htmlFor="audit-action-filter">
            操作
            <Input
              id="audit-action-filter"
              placeholder="例如：create、sync、view"
              value={filters.action}
              onChange={(event) => updateFilter("action", event.target.value)}
            />
          </label>
          <label htmlFor="audit-actor-filter">
            操作者成员 ID
            <Input
              id="audit-actor-filter"
              inputMode="numeric"
              min={1}
              type="number"
              value={filters.actorUserId}
              onChange={(event) => updateFilter("actorUserId", event.target.value)}
            />
          </label>
          <label htmlFor="audit-resource-type-filter">
            资源类型
            <Select
              aria-label="资源类型"
              id="audit-resource-type-filter"
              options={[
                { label: "全部资源", value: "" },
                { label: "成员", value: "user" },
                { label: "邀请", value: "invitation" },
                { label: "积加账号", value: "jijia_account" },
                { label: "接口策略", value: "api_policy" },
                { label: "同步任务", value: "sync_job" },
                { label: "原始数据", value: "raw_data" },
              ]}
              value={filters.resourceType}
              onChange={(value) => updateFilter("resourceType", value)}
            />
          </label>
          <label htmlFor="audit-resource-id-filter">
            资源 ID
            <Input
              id="audit-resource-id-filter"
              maxLength={100}
              value={filters.resourceId}
              onChange={(event) => updateFilter("resourceId", event.target.value)}
            />
          </label>
          <label htmlFor="audit-result-filter">
            结果
            <Select
              aria-label="结果"
              id="audit-result-filter"
              options={[
                { label: "全部结果", value: "" },
                { label: "成功", value: "success" },
                { label: "失败", value: "failure" },
              ]}
              value={filters.result}
              onChange={(value) => updateFilter("result", value)}
            />
          </label>
          <label htmlFor="audit-created-from">
            开始时间
            <Input
              id="audit-created-from"
              type="datetime-local"
              value={filters.createdFrom}
              onChange={(event) => updateFilter("createdFrom", event.target.value)}
            />
          </label>
          <label htmlFor="audit-created-to">
            结束时间
            <Input
              id="audit-created-to"
              type="datetime-local"
              value={filters.createdTo}
              onChange={(event) => updateFilter("createdTo", event.target.value)}
            />
          </label>
          <Button htmlType="submit" type="primary">
            筛选
          </Button>
          {hasActiveFilters ? (
            <Button type="link" onClick={() => setSearchParams({})}>
              重置筛选
            </Button>
          ) : null}
          <small className="timezone-note">{timeZoneNote()}</small>
        </form>
        <section className="m3-card">
          <div className="m3-card-heading">
            <h2>操作记录</h2>
            <div className="m3-refresh-controls">
              <span>
                {hasPreviousResult || !loading
                  ? `已加载 ${logs.length} 条`
                  : error
                    ? "查询失败"
                    : "正在查询"}
                {hasActiveFilters ? " · 已应用筛选" : ""}
              </span>
              <RefreshStatus
                failedWithPreviousData={Boolean(error && hasPreviousResult)}
                lastUpdatedAt={hasPreviousResult ? lastCheckedAt : null}
                refreshing={refreshing}
              />
              <Button
                aria-label="刷新审计日志"
                disabled={loading || loadingMore}
                loading={refreshing}
                onClick={refreshLogs}
              >
                刷新审计日志
              </Button>
            </div>
          </div>
          <Table<AuditLog>
            columns={columns}
            dataSource={logs}
            loading={{
              spinning: loading && !hasPreviousResult,
              description: "正在加载审计日志…",
            }}
            locale={{
              emptyText:
                loading || error ? null : (
                  <Empty
                    description={hasActiveFilters ? "暂无符合条件的审计记录" : "暂无审计记录"}
                  />
                ),
            }}
            pagination={false}
            rowClassName={(log) =>
              log.result === "failure" || isHighRisk(log.action) ? "audit-row-attention" : ""
            }
            rowKey={(log) => String(log.id)}
            onRow={(log) => ({ id: `audit-log-${log.id}` })}
            scroll={{ x: 820 }}
          />
          {nextCursor ? (
            <div className="load-more-row">
              <Button
                disabled={loading}
                loading={loadingMore}
                onClick={() => void loadLogs(nextCursor, selectedFilters)}
              >
                {loadingMore ? "加载中…" : "加载更多"}
              </Button>
            </div>
          ) : null}
        </section>
      </main>
      {selectedLog ? (
        <AuditDetailModal
          log={selectedLog}
          sourceState={resourceState(selectedLog)}
          onClose={() => setSelectedLog(null)}
        />
      ) : null}
    </AppShell>
  );
}

function AuditDetailModal({
  log,
  onClose,
  sourceState,
}: {
  log: AuditLog;
  onClose: () => void;
  sourceState: unknown;
}) {
  return (
    <Modal
      footer={
        <Button type="primary" onClick={onClose}>
          关闭
        </Button>
      }
      open
      title="操作详情"
      onCancel={onClose}
    >
      <dl className="audit-detail-list">
        <div>
          <dt>操作</dt>
          <dd>
            {actionLabel(log.action)}
            {actionLabels[log.action] ? <small>{log.action}</small> : null}
          </dd>
        </div>
        <div>
          <dt>操作者</dt>
          <dd>{log.actorName ?? (log.actorUserId ? `用户 ${log.actorUserId}` : "系统")}</dd>
        </div>
        <div>
          <dt>资源</dt>
          <dd>
            {resourceLabel(log.resourceType)}
            {log.resourceId ? ` #${log.resourceId}` : ""}
          </dd>
        </div>
        <div>
          <dt>结果</dt>
          <dd>{log.result === "success" ? "成功" : "失败"}</dd>
        </div>
        <div>
          <dt>时间</dt>
          <dd>{formatDate(log.createdAt)}</dd>
        </div>
        <div>
          <dt>请求 ID</dt>
          <dd>
            <code>{log.requestId ?? "—"}</code>
          </dd>
        </div>
      </dl>
      {log.changes ? (
        <details className="audit-changes">
          <summary>查看脱敏变更内容</summary>
          <pre className="raw-json">{JSON.stringify(log.changes, null, 2)}</pre>
        </details>
      ) : (
        <p className="muted-copy">本次操作没有记录字段变更。</p>
      )}
      {resourcePath(log) ? (
        <p>
          <Link className="m3-link" to={resourcePath(log)!} state={sourceState}>
            打开相关业务对象
          </Link>
        </p>
      ) : null}
    </Modal>
  );
}

function actionLabel(action: string): string {
  return actionLabels[action] ?? action;
}

function resourceLabel(resourceType?: string | null): string {
  if (!resourceType) return "—";
  return resourceLabels[resourceType] ?? resourceType;
}

function auditCategory(action: string): string {
  const prefix = action.split(".")[0];
  return (
    (
      {
        api_policy: "策略",
        auth: "认证",
        invitation: "成员",
        jijia_account: "账号",
        raw_data: "数据访问",
        sale_return_order: "数据访问",
        sync_job: "任务",
        user: "成员",
      } as Record<string, string>
    )[prefix] ?? "系统"
  );
}

function isHighRisk(action: string): boolean {
  return [
    "jijia_account.deactivate",
    "auth.password.change",
    "auth.password.reset",
    "invitation.revoke",
    "user.disable",
    "user.role.update",
    "sync_job.stop",
    "sync_job.cancel",
  ].includes(action);
}

function resourcePath(log: AuditLog): string | null {
  if (!log.resourceId) return null;
  if (log.resourceType === "sync_job") return `/jobs/${log.resourceId}`;
  if (log.resourceType === "sync_run") return `/runs/${log.resourceId}`;
  if (log.resourceType === "raw_data" || log.resourceType === "raw_api_data")
    return `/raw-data/${log.resourceId}`;
  if (log.resourceType === "jijia_account") return `/accounts/${log.resourceId}`;
  if (log.resourceType === "user" || log.resourceType === "app_user") {
    return `/members?member=${encodeURIComponent(String(log.resourceId))}`;
  }
  return null;
}

function localDateTimeToIso(value: string, includeMinuteEnd = false): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (includeMinuteEnd) date.setSeconds(59, 999);
  return date.toISOString();
}
