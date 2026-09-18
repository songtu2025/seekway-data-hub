import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Form, Input, Modal, Spin, Tag } from "antd";
import { Link, useLocation, useParams } from "react-router-dom";

import { api, ApiError } from "../api/client";
import type { JijiaAccount } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { AppShell } from "../components/AppShell";
import { RefreshStatus } from "../components/RefreshStatus";
import { accountStatusNames, formatAccountDate, getAccountReadiness } from "./accountReadiness";
import { getReturnNavigation, statusLabel } from "./m3Utils";

export function AccountWorkspacePage() {
  const accountId = Number(useParams().accountId);
  const location = useLocation();
  const returnNavigation = getReturnNavigation(location.state, "/accounts", "返回账号列表", [
    "/accounts",
    "/audit",
    "/raw-data",
    "/jobs",
    "/api-catalog",
  ]);
  const sourceState = {
    from: `${location.pathname}${location.search}`,
    backLabel: "返回账号概览",
    returnState: location.state,
  };
  const { csrfToken, user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "operator";
  const routeState = location.state as { accountError?: string; accountNotice?: string } | null;
  const routeAlert = routeState?.accountError ?? "";
  const routeNotice = routeState?.accountNotice ?? "";
  const [account, setAccount] = useState<JijiaAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(routeNotice);
  const [workflowAlert, setWorkflowAlert] = useState(routeAlert);
  const [editOpen, setEditOpen] = useState(false);
  const requestGenerationRef = useRef(0);
  const inFlightGenerationRef = useRef<number | null>(null);
  const routeAccountIdRef = useRef(accountId);
  routeAccountIdRef.current = accountId;

  const loadAccount = useCallback(
    async (source: "initial" | "manual" | "mutation", clearExistingError = true) => {
      if (inFlightGenerationRef.current !== null) return;
      const generation = ++requestGenerationRef.current;
      inFlightGenerationRef.current = generation;
      if (source === "initial") setLoading(true);
      if (source === "manual") setRefreshing(true);
      if (clearExistingError) {
        setError("");
        setLoadFailed(false);
      }
      try {
        const nextAccount = await api.getAccount(accountId);
        if (requestGenerationRef.current === generation) {
          setAccount(nextAccount);
          setLastCheckedAt(new Date());
          setLoadFailed(false);
        }
      } catch (caught) {
        if (requestGenerationRef.current === generation && clearExistingError) {
          setError(caught instanceof ApiError ? caught.message : "账号概览加载失败");
          setLoadFailed(true);
        }
      } finally {
        if (requestGenerationRef.current === generation) {
          setLoading(false);
          setRefreshing(false);
        }
        if (inFlightGenerationRef.current === generation) inFlightGenerationRef.current = null;
      }
    },
    [accountId],
  );

  useEffect(() => {
    setAccount(null);
    setLoading(true);
    setRefreshing(false);
    setLastCheckedAt(null);
    setLoadFailed(false);
    setBusy(false);
    setError("");
    setNotice(routeNotice);
    setWorkflowAlert(routeAlert);
    setEditOpen(false);
    inFlightGenerationRef.current = null;
    void loadAccount("initial");
    return () => {
      requestGenerationRef.current += 1;
      inFlightGenerationRef.current = null;
    };
  }, [loadAccount, routeAlert, routeNotice]);

  async function runMutation(
    action: () => Promise<unknown>,
    successMessage: string,
    refreshAfterFailure = false,
  ): Promise<boolean> {
    if (!csrfToken) return false;
    const targetAccountId = accountId;
    const isCurrentAccount = () => routeAccountIdRef.current === targetAccountId;
    setBusy(true);
    setError("");
    setLoadFailed(false);
    setNotice("");
    setWorkflowAlert("");
    try {
      await action();
      if (!isCurrentAccount()) return false;
      await loadAccount("mutation");
      if (!isCurrentAccount()) return false;
      setNotice(successMessage);
      return true;
    } catch (caught) {
      if (!isCurrentAccount()) return false;
      if (refreshAfterFailure) await loadAccount("mutation", false);
      if (!isCurrentAccount()) return false;
      setError(caught instanceof ApiError ? caught.message : "操作失败，请稍后重试");
      return false;
    } finally {
      if (isCurrentAccount()) setBusy(false);
    }
  }

  const readiness = account ? getAccountReadiness(account, canEdit) : null;
  const pageBusy = busy || refreshing;

  function retryLoadAccount() {
    void loadAccount("initial");
  }

  return (
    <AppShell>
      <main className="account-workspace-page">
        <header className="workspace-heading">
          <div>
            <Link className="back-link" to={returnNavigation.path} state={returnNavigation.state}>
              ← {returnNavigation.label}
            </Link>
            <small>接入管理 / 账号概览</small>
            <h1>{account?.name ?? "账号概览"}</h1>
          </div>
          <div className="m3-refresh-controls">
            <RefreshStatus
              failedWithPreviousData={Boolean(loadFailed && account)}
              lastUpdatedAt={lastCheckedAt}
              refreshing={refreshing}
            />
            <Button
              aria-label="刷新账号概览"
              disabled={loading || refreshing || busy}
              loading={refreshing}
              onClick={() => void loadAccount("manual")}
            >
              刷新账号概览
            </Button>
            {readiness ? (
              <Tag className={`readiness-badge readiness-badge--${readiness.tone}`}>
                {readiness.label}
              </Tag>
            ) : null}
          </div>
        </header>

        {account ? (
          <nav aria-label="账号管理导航" className="account-workspace-nav">
            <Link aria-current="page" className="active" to={`/accounts/${account.id}`}>
              账号概览
            </Link>
            <Link to={`/accounts/${account.id}/policies`}>同步接口</Link>
          </nav>
        ) : null}

        {notice ? (
          <Alert className="page-success" role="status" title={notice} type="success" />
        ) : null}
        {workflowAlert ? (
          <Alert className="page-alert" showIcon title={workflowAlert} type="error" />
        ) : null}
        {error ? (
          <Alert
            action={
              !account ? (
                <Button loading={loading} onClick={retryLoadAccount}>
                  重新加载
                </Button>
              ) : undefined
            }
            className="page-alert"
            showIcon
            title={error}
            type={loadFailed && account ? "warning" : "error"}
          />
        ) : null}
        {loading ? (
          <div className="empty-state">
            <Spin description="正在加载账号概览…" />
          </div>
        ) : null}

        {!loading && account && readiness ? (
          <>
            <section className="workspace-next-action" aria-label="账号下一步">
              <div>
                <p>{readiness.description}</p>
              </div>
              <PrimaryAction
                busy={pageBusy}
                readiness={readiness}
                onVerify={() =>
                  void runMutation(
                    () => api.verifyAccount(account.id, csrfToken!),
                    "账号连接验证通过。",
                    true,
                  )
                }
              />
            </section>

            <section className="workspace-section" aria-labelledby="account-config-heading">
              <header>
                <div>
                  <h2 id="account-config-heading">账号配置</h2>
                </div>
              </header>
              <div className="workspace-status-grid">
                <article>
                  <span>账号连接</span>
                  <strong>{accountStatusNames[account.status]}</strong>
                  <p>最近验证：{formatAccountDate(account.lastVerifiedAt, "尚未验证")}</p>
                  {canEdit ? (
                    <div className="inline-actions">
                      <Button
                        className="text-button"
                        disabled={pageBusy}
                        type="text"
                        onClick={() => setEditOpen(true)}
                      >
                        编辑凭证
                      </Button>
                      {account.status === "active" ? (
                        <Button
                          className="text-button"
                          disabled={pageBusy}
                          type="text"
                          onClick={() =>
                            void runMutation(
                              () => api.verifyAccount(account.id, csrfToken!),
                              "账号连接已重新验证。",
                              true,
                            )
                          }
                        >
                          重新验证
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <small>凭证已脱敏</small>
                  )}
                </article>
                <article>
                  <span>同步范围</span>
                  <strong>{account.enabledPolicyCount ?? 0} 个接口</strong>
                  <p>{readiness.scopeReady ? "已具备可执行范围" : "尚未选择同步接口"}</p>
                  {readiness.scopeReady ? (
                    <Link to={`/accounts/${account.id}/policies`}>管理同步范围 →</Link>
                  ) : null}
                </article>
                <article>
                  <span>执行计划</span>
                  <strong>{account.scheduledPolicyCount ?? 0} 个自动计划</strong>
                  <p>
                    {account.scheduledPolicyCount
                      ? "系统将按计划自动执行"
                      : "可在创建计划时选择接口并启用定时同步"}
                  </p>
                  <Link state={sourceState} to={`/jobs/plans?account=${account.id}`}>
                    查看此账号计划 →
                  </Link>
                  {canEdit ? (
                    <Link state={sourceState} to={`/jobs/plans/new?accountId=${account.id}`}>
                      创建定时计划 →
                    </Link>
                  ) : null}
                </article>
              </div>
            </section>

            <section className="workspace-section" aria-labelledby="account-runtime-heading">
              <header>
                <div>
                  <h2 id="account-runtime-heading">最近运行</h2>
                </div>
              </header>
              <div className="workspace-runtime-card">
                <div>
                  <span>最近任务</span>
                  <strong>
                    {account.latestJobStatus ? statusLabel(account.latestJobStatus) : "尚未发起"}
                  </strong>
                  <p>{formatAccountDate(account.latestJobAt, "配置完成后即可发起同步")}</p>
                  {account.latestJobAt ? (
                    <Link state={sourceState} to={`/jobs?account=${account.id}`}>
                      查看同步任务 →
                    </Link>
                  ) : null}
                </div>
                <div>
                  <span>最近数据</span>
                  <strong>{account.latestDataAt ? "已有同步数据" : "暂无数据"}</strong>
                  <p>{formatAccountDate(account.latestDataAt, "任务成功写入后显示")}</p>
                  {account.latestDataAt ? (
                    <Link state={sourceState} to={`/raw-data?jijiaAccountId=${account.id}`}>
                      查看账号数据 →
                    </Link>
                  ) : null}
                </div>
              </div>
            </section>

            {canEdit && account.status !== "inactive" ? (
              <details className="workspace-account-settings">
                <summary>账号设置</summary>
                <div>
                  <span>
                    <strong>停用账号</strong>
                    <p>停用后不会生成新的同步任务，既有任务和数据仍保留。</p>
                  </span>
                  <Button
                    danger
                    disabled={pageBusy}
                    onClick={() =>
                      void runMutation(
                        () => api.deactivateAccount(account.id, csrfToken!),
                        "账号已停用。",
                      )
                    }
                  >
                    停用账号
                  </Button>
                </div>
              </details>
            ) : null}
          </>
        ) : null}
      </main>

      {editOpen && account ? (
        <CredentialModal
          account={account}
          busy={busy}
          onClose={() => setEditOpen(false)}
          onSubmit={async (name, appId, appKey) => {
            const succeeded = await runMutation(
              () =>
                api.updateAccount(
                  account.id,
                  { name, appId: appId || undefined, appKey: appKey || undefined },
                  csrfToken!,
                ),
              "账号信息已保存；如修改凭证，请重新验证连接。",
            );
            if (succeeded) setEditOpen(false);
          }}
        />
      ) : null}
    </AppShell>
  );
}

function PrimaryAction({
  busy,
  readiness,
  onVerify,
}: {
  busy: boolean;
  readiness: ReturnType<typeof getAccountReadiness>;
  onVerify: () => void;
}) {
  const location = useLocation();
  const sourceState = {
    from: `${location.pathname}${location.search}`,
    backLabel: "返回账号概览",
    returnState: location.state,
  };
  if (readiness.primaryAction === "verify" || readiness.primaryAction === "reverify") {
    return (
      <Button disabled={busy} type="primary" onClick={onVerify}>
        {readiness.primaryActionLabel}
      </Button>
    );
  }
  if (readiness.primaryAction === "view_status") {
    return <span className="read-only-note">只读查看</span>;
  }
  if (readiness.primaryActionTarget) {
    return (
      <Link
        state={sourceState}
        className="action-link action-link--primary"
        to={readiness.primaryActionTarget}
      >
        {readiness.primaryActionLabel}
      </Link>
    );
  }
  return <span className="read-only-note">当前无需操作</span>;
}

function CredentialModal({
  account,
  busy,
  onClose,
  onSubmit,
}: {
  account: JijiaAccount;
  busy: boolean;
  onClose: () => void;
  onSubmit: (name: string, appId: string, appKey: string) => Promise<void>;
}) {
  const [name, setName] = useState(account.name);
  const [appId, setAppId] = useState("");
  const [appKey, setAppKey] = useState("");

  async function handleSubmit() {
    await onSubmit(name, appId, appKey);
  }

  return (
    <Modal
      closable={!busy}
      destroyOnHidden
      footer={null}
      keyboard={!busy}
      mask={{ closable: !busy }}
      open
      title={<h2>编辑账号凭证</h2>}
      onCancel={onClose}
    >
      <p className="modal-description">留空凭证字段表示不修改；保存新凭证后必须重新验证。</p>
      <Form className="invite-form" layout="vertical" onFinish={handleSubmit}>
        <Form.Item htmlFor="edit-account-name" label="账号名称" required>
          <Input
            id="edit-account-name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Form.Item>
        <Form.Item htmlFor="edit-app-id" label="新 appId">
          <Input
            id="edit-app-id"
            placeholder={account.maskedAppId}
            value={appId}
            onChange={(event) => setAppId(event.target.value)}
          />
        </Form.Item>
        <Form.Item htmlFor="edit-app-key" label="新 appKey">
          <Input.Password
            id="edit-app-key"
            placeholder="只写入，不回显"
            value={appKey}
            onChange={(event) => setAppKey(event.target.value)}
          />
        </Form.Item>
        <div className="modal-actions">
          <Button disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button htmlType="submit" loading={busy} type="primary">
            保存修改
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
