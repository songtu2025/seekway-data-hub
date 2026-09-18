import { useEffect, useRef, useState } from "react";
import { Alert, Button, Empty, Modal, Select, Spin } from "antd";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { JijiaAccount } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { AppShell } from "../components/AppShell";
import { WorkerStatusPanel } from "../components/WorkerStatusPanel";
import { ScheduledPlanForm } from "../components/ScheduledPlanForm";
import { getReturnNavigation } from "./m3Utils";

export function ScheduledPlanPage() {
  const params = useParams();
  const [query, setQuery] = useSearchParams();
  const location = useLocation();
  const { user, csrfToken } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "operator";
  const accountId = Number(params.accountId ?? query.get("accountId"));
  const targetApiCode = params.apiCode;
  const routeState = location.state as {
    from?: string;
    returnTo?: string;
    returnState?: unknown;
  } | null;
  let from = routeState?.from ?? routeState?.returnTo;
  // 兼容上一版任务页锚点来源，只迁移计划仍适用的账号和接口条件。
  if (from?.split("#")[1] === "scheduled-plans" && /^\/jobs(?:\?|#)/.test(from)) {
    const legacyQuery = new URLSearchParams(from.split("#")[0].split("?")[1]);
    const planQuery = new URLSearchParams();
    const account = legacyQuery.get("account") ?? legacyQuery.get("accountId");
    const apiCode = legacyQuery.get("api") ?? legacyQuery.get("apiCode");
    if (account) planQuery.set("account", account);
    if (apiCode) planQuery.set("api", apiCode);
    from = `/jobs/plans${planQuery.size ? `?${planQuery}` : ""}`;
  }
  const returnNavigation = getReturnNavigation(
    { ...routeState, from },
    "/jobs/plans",
    "返回定时计划",
    ["/jobs/plans", "/accounts"],
  );
  const returnTo = returnNavigation.path;
  const [accounts, setAccounts] = useState<JijiaAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState("");
  const [accountReload, setAccountReload] = useState(0);
  const [pendingAccount, setPendingAccount] = useState<number | null>(null);
  const dirtyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const activeAccounts = accounts.filter((account) => account.status === "active");
  const currentAccountName =
    accounts.find((account) => account.id === accountId)?.name ?? `账号 ${accountId}`;
  const pendingAccountName =
    accounts.find((account) => account.id === pendingAccount)?.name ??
    `账号 ${pendingAccount ?? ""}`;

  useEffect(() => {
    dirtyRef.current = false;
    setBusy(false);
  }, [accountId, targetApiCode]);

  useEffect(() => {
    if (targetApiCode || !canEdit) return;
    let current = true;
    setAccountsLoading(true);
    setAccountsError("");
    api
      .listAccounts()
      .then((rows) => {
        if (!current) return;
        setAccounts(rows);
        const valid = rows.filter((account) => account.status === "active");
        if (!accountId && valid.length === 1)
          setQuery({ accountId: String(valid[0].id) }, { replace: true, state: location.state });
      })
      .catch((caught) => {
        if (current)
          setAccountsError(caught instanceof ApiError ? caught.message : "账号列表加载失败");
      })
      .finally(() => {
        if (current) setAccountsLoading(false);
      });
    return () => {
      current = false;
    };
  }, [targetApiCode, canEdit, accountReload, accountId, setQuery, location.state]);

  function changeAccount(value: number) {
    dirtyRef.current = false;
    setPendingAccount(null);
    setQuery({ accountId: String(value) }, { replace: true, state: location.state });
  }

  return (
    <AppShell>
      <main className="policy-page job-create-page scheduled-plan-page">
        <header className="page-heading policy-heading job-create-heading">
          <div>
            <small>
              同步任务 / 定时计划 / {targetApiCode ? (canEdit ? "修改" : "查看") : "创建"}
            </small>
            <h1>{targetApiCode ? (canEdit ? "修改定时计划" : "查看定时计划") : "创建定时计划"}</h1>
          </div>
          <Link
            className="action-link action-link--neutral"
            to={returnTo}
            state={returnNavigation.state}
          >
            {returnNavigation.label}
          </Link>
        </header>
        {!canEdit && !targetApiCode ? (
          <Alert type="info" title="当前为只读权限，不能创建定时计划。" />
        ) : (
          <div className="job-create-form">
            <section
              className="job-create-section scheduled-plan-account-section"
              aria-labelledby="scheduled-plan-account-heading"
            >
              <div className="job-create-section-heading">
                <div>
                  <h2 id="scheduled-plan-account-heading">1. 同步账号</h2>
                </div>
              </div>
              <div className="scheduled-plan-worker-compact">
                <WorkerStatusPanel />
              </div>
              {!targetApiCode ? (
                <div className="policy-toolbar scheduled-plan-account-toolbar">
                  <label className="job-create-field">
                    同步账号
                    <Select
                      aria-label="同步账号"
                      disabled={busy}
                      value={accountId || undefined}
                      placeholder="请选择账号"
                      loading={accountsLoading}
                      virtual={false}
                      options={accounts.map((account) => ({
                        value: account.id,
                        label: `${account.name}${account.status === "active" ? "" : "（不可用）"}`,
                        disabled: account.status !== "active",
                      }))}
                      onChange={(value) =>
                        dirtyRef.current ? setPendingAccount(value) : changeAccount(value)
                      }
                    />
                  </label>
                </div>
              ) : null}
              {accountsError && !targetApiCode ? (
                <Alert
                  type="error"
                  title={accountsError}
                  action={
                    <Button disabled={busy} onClick={() => setAccountReload((value) => value + 1)}>
                      重试
                    </Button>
                  }
                />
              ) : null}
              {!targetApiCode &&
              !accountsLoading &&
              !accountsError &&
              activeAccounts.length === 0 ? (
                <Alert
                  type="warning"
                  title="没有有效账号，请先完成账号接入或验证。"
                  action={
                    <Link to="/accounts" target="_blank" rel="noopener noreferrer">
                      管理账号
                    </Link>
                  }
                />
              ) : null}
            </section>
            {accountId ? (
              <ScheduledPlanForm
                key={`${accountId}-${targetApiCode ?? "new"}`}
                accountId={accountId}
                apiCode={targetApiCode}
                canEdit={canEdit}
                csrfToken={csrfToken}
                returnTo={returnTo}
                returnLabel={
                  returnTo.startsWith("/accounts") ? returnNavigation.label : "查看定时计划"
                }
                returnState={returnNavigation.state}
                onBusyChange={setBusy}
                onDirtyChange={(dirty) => {
                  dirtyRef.current = dirty;
                }}
              />
            ) : accountsLoading ? (
              <Spin description="正在加载账号…" />
            ) : (
              <Empty description="选择账号后设置同步范围和执行时间" />
            )}
          </div>
        )}
        <Modal
          open={pendingAccount !== null}
          title="切换同步账号"
          okText="切换并清空选择"
          cancelText="继续编辑"
          onCancel={() => setPendingAccount(null)}
          onOk={() => {
            if (pendingAccount !== null) changeAccount(pendingAccount);
          }}
        >
          <p>
            将从“{currentAccountName}”切换到“{pendingAccountName}
            ”。切换后会清空当前接口选择和未保存设置。
          </p>
        </Modal>
      </main>
    </AppShell>
  );
}
