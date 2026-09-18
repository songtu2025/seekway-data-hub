import { type FormEvent, useState } from "react";
import { Button, Checkbox, Tag } from "antd";
import { Link, useLocation } from "react-router-dom";
import type {
  ApiPolicy,
  ApiPolicyUpdateInput,
  JijiaAccountStatus,
  ScheduleMode,
} from "../api/types";
import { buildPolicyUpdate } from "../policyUtils";
import { businessDomainKey, businessDomainLabel } from "../businessDomains";
import { formatDate, getReturnNavigation } from "../pages/m3Utils";

const scheduleNames: Record<ScheduleMode, string> = {
  manual_only: "仅手动",
  daily: "每日",
  cron: "Cron",
};
function fieldLabel(value?: string | null) {
  return value?.trim() || "未配置";
}

export function PolicyDomainGroup({
  accountId,
  accountStatus,
  canEdit,
  busy = false,
  selectionOnly = false,
  domainName,
  initiallyOpen,
  policies,
  selectedCode,
  selectedCodes,
  onSave,
  onSelect,
  onToggleSelected,
}: {
  accountId: number;
  accountStatus: JijiaAccountStatus | null;
  canEdit: boolean;
  busy?: boolean;
  selectionOnly?: boolean;
  domainName: string;
  initiallyOpen: boolean;
  policies: ApiPolicy[];
  selectedCode: string | null;
  selectedCodes: Set<string>;
  onSave?: (input: ApiPolicyUpdateInput) => Promise<void>;
  onSelect?: (apiCode: string) => void;
  onToggleSelected: (apiCode: string, checked: boolean) => void;
}) {
  const [open, setOpen] = useState(initiallyOpen);

  return (
    <details
      className="policy-domain-group"
      open={open || initiallyOpen}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="policy-domain-heading">
        <h2>{businessDomainLabel(domainName)}</h2>
        <span>
          {policies.length} 个接口 · {policies.filter((policy) => policy.enabled).length} 个已启用
        </span>
      </summary>
      {policies.map((policy) => {
        const automated = policy.enabled && policy.scheduleMode !== "manual_only";
        const checked = selectedCodes.has(policy.apiCode);
        const isSelected = selectionOnly ? checked : selectedCode === policy.apiCode;
        const selectionDisabled = busy || !policy.catalogEnabled;
        const rowContent = (
          <span className="policy-row-grid">
            <span className="policy-row-main">
              <strong>{policy.name}</strong>
              <small>{policy.apiCode}</small>
            </span>
            <span className="policy-row-domain">
              <span className="policy-row-mobile-label">业务域</span>
              {businessDomainLabel(businessDomainKey(policy))}
            </span>
            <span className="policy-row-status">
              <span className="policy-row-mobile-label">状态</span>
              <Tag className={`badge ${policy.enabled ? "status-active" : "status-disabled"}`}>
                {!policy.catalogEnabled
                  ? "平台停用"
                  : accountStatus !== "active" && policy.enabled
                    ? "运行受阻"
                    : policy.enabled
                      ? automated
                        ? "自动运行"
                        : "可手动"
                      : "未启用"}
              </Tag>
            </span>
            <span className="policy-row-schedule">
              <span className="policy-row-mobile-label">同步策略</span>
              {scheduleNames[policy.scheduleMode]}
              {policy.scheduleExpr ? ` · ${policy.scheduleExpr}` : ""}
            </span>
          </span>
        );
        return (
          <div
            className={`policy-select-item ${isSelected ? "selected" : ""}`}
            key={policy.apiCode}
          >
            {selectionOnly && canEdit ? (
              <Checkbox
                aria-label={`选择 ${policy.name}`}
                checked={checked}
                className="policy-select-row policy-select-control"
                disabled={selectionDisabled}
                onChange={(event) => onToggleSelected(policy.apiCode, event.target.checked)}
              >
                <span className="policy-row">{rowContent}</span>
              </Checkbox>
            ) : (
              <div className={`policy-select-row${canEdit ? "" : " policy-select-row--read-only"}`}>
                {canEdit ? (
                  <Checkbox
                    aria-label={`选择 ${policy.name}`}
                    checked={checked}
                    disabled={busy || (!policy.catalogEnabled && !policy.enabled)}
                    onChange={(event) => onToggleSelected(policy.apiCode, event.target.checked)}
                  />
                ) : null}
                <Button
                  aria-controls={`policy-editor-${policy.apiCode}`}
                  aria-expanded={isSelected}
                  disabled={busy}
                  className="policy-row"
                  type="text"
                  onClick={() => onSelect?.(policy.apiCode)}
                >
                  {rowContent}
                </Button>
              </div>
            )}
            {isSelected && !selectionOnly && onSave ? (
              <div className="policy-inline-editor">
                <PolicyEditor
                  key={`${accountId}-${policy.apiCode}-${policy.enabled}-${policy.scheduleMode}-${policy.scheduleExpr}`}
                  accountId={accountId}
                  canEdit={canEdit && !busy}
                  policy={policy}
                  onSave={onSave}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </details>
  );
}

function PolicyEditor({
  accountId,
  policy,
  canEdit,
  onSave,
}: {
  accountId: number;
  policy: ApiPolicy;
  canEdit: boolean;
  onSave: (input: ApiPolicyUpdateInput) => Promise<void>;
}) {
  const location = useLocation();
  const returnNavigation = getReturnNavigation(location.state, "", "", ["/jobs/new"]);
  const resumeTask = returnNavigation.path !== "";
  const sourceState = {
    from: `${location.pathname}${location.search}`,
    backLabel: "返回同步接口",
    returnState: location.state,
  };
  const [enabled, setEnabled] = useState(policy.enabled);
  const [busy, setBusy] = useState(false);
  const hasUnsavedChanges = enabled !== policy.enabled;
  const isScheduled = policy.enabled && policy.scheduleMode !== "manual_only";
  const platformBlocked = !policy.catalogEnabled;
  const readiness = platformBlocked
    ? {
        description: "该接口已被平台全局停用。现有账号策略会保留，但不能启用或创建新任务。",
        state: "pending",
        title: "平台已停用",
      }
    : hasUnsavedChanges
      ? {
          description: enabled
            ? "接口启用状态尚未保存，保存成功后才会按新策略运行。"
            : "停用尚未保存，当前服务端策略仍保持原状态。",
          state: "changed",
          title: "保存修改后再运行",
        }
      : policy.enabled
        ? {
            description: isScheduled
              ? policy.nextRunAt
                ? `下次计划时间：${formatDate(policy.nextRunAt, policy.timezone)}；也可以立即同步。`
                : "自动计划已启用，也可以立即发起一次同步。"
              : "策略已启用，可进入任务预览并确认同步范围。",
            state: "ready",
            title: isScheduled ? "自动计划已生效" : "可立即手动同步",
          }
        : {
            description: canEdit
              ? "先启用接口并保存，之后才能发起同步。"
              : "该策略尚未启用，需要 Operator 或 Admin 完成配置。",
            state: "pending",
            title: "当前不可运行",
          };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSave(buildPolicyUpdate(policy, { enabled }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      aria-label={`${policy.name}策略编辑`}
      className="policy-editor"
      id={`policy-editor-${policy.apiCode}`}
      onSubmit={handleSubmit}
    >
      <div className="policy-editor-heading">
        <span>当前接口</span>
        <h2>{policy.name}</h2>
        <small>{policy.apiCode}</small>
        <label>
          <Checkbox
            checked={enabled}
            disabled={!canEdit || busy || (platformBlocked && !enabled)}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          启用此接口
        </label>
      </div>
      <div className={`policy-readiness policy-readiness--${readiness.state}`} aria-live="polite">
        <span>运行准备</span>
        <strong>{readiness.title}</strong>
        <p>{readiness.description}</p>
      </div>
      <section className="policy-editor-section">
        <h3>执行方式</h3>
        <div className="policy-editor-fields">
          <p aria-label="计划时区" className="policy-editor-field">
            {scheduleNames[policy.scheduleMode]} {policy.scheduleExpr} · 北京时间
          </p>
          <Link
            className="policy-editor-field policy-editor-plan-link"
            state={sourceState}
            to={`/jobs/plans/${accountId}/${encodeURIComponent(policy.apiCode)}`}
          >
            {canEdit ? "设置定时计划" : "查看定时计划"}
          </Link>
          <p className="policy-editor-field">
            日期窗口：
            {policy.supportsDateWindow ? "按已保存的同步进度继续" : "此接口不使用日期窗口"}
          </p>
          {!policy.enabled && enabled && policy.scheduleMode !== "manual_only" ? (
            <p className="policy-editor-change-note">启用后将恢复该接口原有的定时设置。</p>
          ) : null}
          {policy.enabled && !enabled ? (
            <p className="policy-editor-change-note">
              停用后不能创建新任务，正在执行的任务不受影响，原周期和时间会保留。
            </p>
          ) : null}
        </div>
      </section>
      <details className="policy-technical-rules">
        <summary>查看官方接口规则</summary>
        <dl>
          <dt>请求方式</dt>
          <dd>{policy.method}</dd>
          <dt>路径</dt>
          <dd>{policy.path}</dd>
          <dt>平台状态</dt>
          <dd>{policy.catalogEnabled ? "允许运行" : "全局停用"}</dd>
          <dt>数据列表</dt>
          <dd>{fieldLabel(policy.listField)}</dd>
          <dt>业务主键</dt>
          <dd>{fieldLabel(policy.primaryKeyField)}</dd>
          <dt>日期窗口</dt>
          <dd>{policy.supportsDateWindow ? "支持" : "不支持"}</dd>
          <dt>运行依赖</dt>
          <dd>
            {policy.upstreamApiCode ? `依赖上游接口 ${policy.upstreamApiCode}` : "可直接运行"}
          </dd>
          <dt>最近运行</dt>
          <dd>
            {policy.recentRunStatus
              ? `${policy.recentRunStatus} · ${formatDate(policy.recentRunAt)}`
              : "尚未运行"}
          </dd>
          <dt>下次计划</dt>
          <dd>{policy.nextRunAt ? formatDate(policy.nextRunAt, policy.timezone) : "无自动计划"}</dd>
        </dl>
      </details>
      {canEdit ? (
        <div className="policy-actions">
          <Button
            className="policy-save"
            disabled={busy || (platformBlocked && enabled)}
            htmlType="submit"
            loading={busy}
            type="primary"
          >
            保存策略
          </Button>
          {policy.catalogEnabled && policy.enabled && !hasUnsavedChanges ? (
            <Link
              className="action-link action-link--neutral"
              state={resumeTask ? returnNavigation.state : sourceState}
              to={
                resumeTask
                  ? returnNavigation.path
                  : `/jobs/new?accountId=${accountId}&apiCode=${encodeURIComponent(policy.apiCode)}`
              }
            >
              {resumeTask ? "返回任务配置并重新检查" : "同步此接口"}
            </Link>
          ) : (
            <span className="read-only-note">
              {platformBlocked
                ? "平台启用后才可同步"
                : hasUnsavedChanges
                  ? "请先保存当前修改"
                  : "启用后可发起同步"}
            </span>
          )}
        </div>
      ) : (
        <p className="read-only-note">Viewer 仅可查看策略</p>
      )}
    </form>
  );
}
