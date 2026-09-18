import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Button, Empty, Select, Table, Tag, type TableColumnsType } from "antd";
import { Link, useSearchParams } from "react-router-dom";

import { api } from "../api/client";
import type { ScheduledPlan } from "../api/types";
import { formatDate, getApiErrorMessage, statusLabel } from "../pages/m3Utils";
import { RefreshStatus } from "./RefreshStatus";
import { responsiveTableCell } from "./responsiveTable";
import {
  blockedResumeText,
  nextWindowBasisText,
  nextWindowRangeText,
  syncProgressText,
} from "./scheduledPlanPreviewModel";

const statusNames = {
  normal: "正常",
  overdue: "已逾期",
  blocked: "被活动任务阻塞",
  account_inactive: "账号停用",
  api_disabled: "接口停用",
} as const;

const statusColors = {
  normal: "success",
  overdue: "error",
  blocked: "warning",
  account_inactive: "default",
  api_disabled: "error",
} as const;

function planColumns(returnTo: string, returnState: unknown): TableColumnsType<ScheduledPlan> {
  return [
    {
      title: "账号与接口",
      key: "account",
      width: 150,
      onCell: () => responsiveTableCell("账号与接口", "full"),
      render: (_, plan) => (
        <div className="table-cell-stack">
          <strong>{plan.accountName}</strong>
          <small>
            {plan.apiName} · {plan.apiCode}
          </small>
        </div>
      ),
    },
    {
      title: "执行计划",
      key: "schedule",
      width: 135,
      onCell: () => responsiveTableCell("执行计划", "full"),
      render: (_, plan) => (
        <div className="table-cell-stack">
          <strong>
            {plan.scheduleMode === "daily" ? "每天" : "Cron"} {plan.scheduleExpr ?? "—"}
          </strong>
          <small>
            {plan.timezone === "Asia/Shanghai" ? "Asia/Shanghai（UTC+08:00）" : plan.timezone}
          </small>
          <small>下次执行 {formatDate(plan.nextRunAt, plan.timezone)}</small>
        </div>
      ),
    },
    {
      title: "预计下次数据范围",
      key: "nextWindowPreview",
      width: 185,
      onCell: () => responsiveTableCell("预计下次数据范围", "full"),
      render: (_, plan) => (
        <div className="table-cell-stack">
          <strong>{nextWindowRangeText(plan.nextWindowPreview)}</strong>
          <small>{nextWindowBasisText(plan.nextWindowPreview)}</small>
        </div>
      ),
    },
    {
      title: "同步进度",
      key: "progress",
      width: 135,
      onCell: () => responsiveTableCell("同步进度"),
      render: (_, plan) => {
        const [completeText, nextText] = syncProgressText(plan.nextWindowPreview);
        return (
          <div className="table-cell-stack">
            <strong>{completeText}</strong>
            <small>{nextText}</small>
          </div>
        );
      },
    },
    {
      title: "状态",
      key: "status",
      width: 155,
      onCell: () => responsiveTableCell("状态"),
      render: (_, plan) => {
        const resumeText = blockedResumeText(plan);
        return (
          <div className="table-cell-stack">
            <Tag color={statusColors[plan.status]}>{statusNames[plan.status]}</Tag>
            {resumeText ? <small>{resumeText}</small> : null}
            {plan.status === "blocked" && plan.blockingJob ? (
              <small>
                当前活动任务：
                <Link
                  className="m3-link"
                  to={`/jobs/tasks/${encodeURIComponent(plan.blockingJob.taskNo)}`}
                  state={{ from: returnTo, backLabel: "返回定时计划", returnState }}
                >
                  {plan.blockingJob.taskNo}
                </Link>
              </small>
            ) : null}
          </div>
        );
      },
    },
  ];
}

export function ScheduledPlansPanel({
  createAction,
  canManage,
  returnTo,
  returnState,
}: {
  createAction: ReactNode;
  canManage: boolean;
  returnTo: string;
  returnState?: unknown;
}) {
  const [query, setQuery] = useSearchParams();
  const account = query.get("account") ?? "";
  const apiCode = query.get("api") ?? "";
  const status = query.get("status") ?? "";
  const page = Math.max(1, Number(query.get("page")) || 1);
  const pageSize = 10;
  function updateQuery(key: string, value: string) {
    const next = new URLSearchParams(query);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setQuery(next, { state: returnState });
  }
  const [plans, setPlans] = useState<ScheduledPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [error, setError] = useState("");
  const requestSequenceRef = useRef(0);
  const inFlightRequestRef = useRef<number | null>(null);

  const loadPlans = useCallback(async (source: "initial" | "manual") => {
    if (inFlightRequestRef.current !== null) return;
    const requestSequence = ++requestSequenceRef.current;
    inFlightRequestRef.current = requestSequence;
    if (source === "initial") setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const rows = await api.listScheduledPlans();
      if (requestSequence !== requestSequenceRef.current) return;
      setPlans(rows);
      setLastCheckedAt(new Date());
    } catch (caught) {
      if (requestSequence !== requestSequenceRef.current) return;
      setError(getApiErrorMessage(caught, "定时计划加载失败，请稍后重试"));
    } finally {
      if (requestSequence === requestSequenceRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
      if (inFlightRequestRef.current === requestSequence) inFlightRequestRef.current = null;
    }
  }, []);

  useEffect(() => {
    void loadPlans("initial");
    return () => {
      requestSequenceRef.current += 1;
      inFlightRequestRef.current = null;
    };
  }, [loadPlans]);

  const filtered = plans.filter(
    (plan) =>
      (!account || String(plan.jijiaAccountId) === account) &&
      (!apiCode || plan.apiCode === apiCode) &&
      (!status || plan.status === status),
  );
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const hasFilter = Boolean(account || apiCode || status);

  return (
    <section id="scheduled-plans" className="m3-card" aria-labelledby="scheduled-plans-title">
      <div className="m3-card-heading">
        <div>
          <h2 id="scheduled-plans-title">计划列表</h2>
          <p className="muted-copy">计划时区固定为 Asia/Shanghai（UTC+08:00）</p>
        </div>
        <div className="heading-actions">
          {createAction}
          <RefreshStatus
            failedWithPreviousData={Boolean(error && plans.length > 0)}
            lastUpdatedAt={lastCheckedAt}
            refreshing={refreshing}
          />
          <Button
            disabled={loading || refreshing}
            loading={refreshing}
            onClick={() => void loadPlans(lastCheckedAt ? "manual" : "initial")}
          >
            刷新计划
          </Button>
        </div>
      </div>
      <div className="policy-toolbar" aria-label="定时计划筛选">
        <label>
          账号
          <Select
            aria-label="计划账号"
            virtual={false}
            value={account}
            onChange={(value) => updateQuery("account", value)}
            options={[
              { value: "", label: "全部账号" },
              ...Array.from(
                new Map(plans.map((plan) => [String(plan.jijiaAccountId), plan.accountName])),
                ([value, label]) => ({ value, label }),
              ),
            ]}
          />
        </label>
        <label>
          接口
          <Select
            aria-label="计划接口"
            virtual={false}
            showSearch
            optionFilterProp="label"
            value={apiCode}
            onChange={(value) => updateQuery("api", value)}
            options={[
              { value: "", label: "全部接口" },
              ...Array.from(
                new Map(plans.map((plan) => [plan.apiCode, plan.apiName])),
                ([value, label]) => ({ value, label }),
              ),
            ]}
          />
        </label>
        <label>
          状态
          <Select
            aria-label="计划状态"
            virtual={false}
            value={status}
            onChange={(value) => updateQuery("status", value)}
            options={[
              { value: "", label: "全部状态" },
              ...Object.entries(statusNames).map(([value, label]) => ({ value, label })),
            ]}
          />
        </label>
        {hasFilter ? (
          <Button onClick={() => setQuery({}, { state: returnState })}>清除筛选</Button>
        ) : null}
      </div>
      {error ? <Alert title={error} type={plans.length > 0 ? "warning" : "error"} /> : null}
      <Table<ScheduledPlan>
        aria-label="定时计划列表"
        className="scheduled-plans-table responsive-card-table"
        columns={[
          ...planColumns(returnTo, returnState),
          {
            title: "操作",
            key: "actions",
            width: 90,
            onCell: () => responsiveTableCell("操作", "full"),
            render: (_, plan) => (
              <div className="table-cell-stack">
                <Link
                  className="m3-link"
                  state={{ from: returnTo, backLabel: "返回定时计划", returnState }}
                  to={`/jobs/plans/${plan.jijiaAccountId}/${encodeURIComponent(plan.apiCode)}`}
                >
                  {canManage ? "修改计划" : "查看计划"}
                </Link>
                {plan.latestScheduledJob ? (
                  <Link
                    className="m3-link"
                    to={`/jobs/tasks/${encodeURIComponent(plan.latestScheduledJob.taskNo)}`}
                    state={{ from: returnTo, backLabel: "返回定时计划", returnState }}
                  >
                    最近任务 · {statusLabel(plan.latestScheduledJob.status)}
                  </Link>
                ) : (
                  <small>尚未运行</small>
                )}
              </div>
            ),
          },
        ]}
        dataSource={
          error && plans.length === 0
            ? []
            : filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
        }
        loading={loading}
        locale={{
          emptyText: error ? (
            "计划暂时无法显示，请刷新重试。"
          ) : (
            <Empty
              description={
                hasFilter
                  ? "没有符合当前筛选条件的定时计划，请清除筛选。"
                  : canManage
                    ? "暂无启用的定时计划，点击上方“创建定时计划”开始设置。"
                    : "暂无启用的定时计划。"
              }
            />
          ),
        }}
        pagination={{
          current: currentPage,
          pageSize,
          total: filtered.length,
          showSizeChanger: false,
          onChange: (value) => updateQuery("page", String(value)),
          showTotal: (total) => `共 ${total} 个计划`,
        }}
        rowKey="id"
        scroll={{ x: 850 }}
      />
    </section>
  );
}
