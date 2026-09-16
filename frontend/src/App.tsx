import { lazy, Suspense, type ReactNode } from "react";
import { Alert, Button, Spin } from "antd";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { useAuth } from "./auth/AuthContext";
import { PRODUCT_NAME } from "./config/product";

const AccountOnboardingPage = lazy(() =>
  import("./pages/AccountOnboardingPage").then((module) => ({
    default: module.AccountOnboardingPage,
  })),
);
const AccountSecurityPage = lazy(() =>
  import("./pages/AccountSecurityPage").then((module) => ({
    default: module.AccountSecurityPage,
  })),
);
const AccountPoliciesPage = lazy(() =>
  import("./pages/AccountPoliciesPage").then((module) => ({ default: module.AccountPoliciesPage })),
);
const AccountWorkspacePage = lazy(() =>
  import("./pages/AccountWorkspacePage").then((module) => ({
    default: module.AccountWorkspacePage,
  })),
);
const AccountsPage = lazy(() =>
  import("./pages/AccountsPage").then((module) => ({ default: module.AccountsPage })),
);
const ApiCatalogPage = lazy(() =>
  import("./pages/ApiCatalogPage").then((module) => ({ default: module.ApiCatalogPage })),
);
const AuditPage = lazy(() =>
  import("./pages/AuditPage").then((module) => ({ default: module.AuditPage })),
);
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })),
);
const LoginPage = lazy(() =>
  import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })),
);
const ForgotPasswordPage = lazy(() =>
  import("./pages/ForgotPasswordPage").then((module) => ({
    default: module.ForgotPasswordPage,
  })),
);
const MembersPage = lazy(() =>
  import("./pages/MembersPage").then((module) => ({ default: module.MembersPage })),
);
const ParsedDataPage = lazy(() =>
  import("./pages/ParsedDataPage").then((module) => ({ default: module.ParsedDataPage })),
);
const RawDataDetailPage = lazy(() =>
  import("./pages/RawDataDetailPage").then((module) => ({ default: module.RawDataDetailPage })),
);
const RawDataPage = lazy(() =>
  import("./pages/RawDataPage").then((module) => ({ default: module.RawDataPage })),
);
const RegisterPage = lazy(() =>
  import("./pages/RegisterPage").then((module) => ({ default: module.RegisterPage })),
);
const ResetPasswordPage = lazy(() =>
  import("./pages/ResetPasswordPage").then((module) => ({
    default: module.ResetPasswordPage,
  })),
);
const SaleReturnOrdersPage = lazy(() =>
  import("./pages/SaleReturnOrdersPage").then((module) => ({
    default: module.SaleReturnOrdersPage,
  })),
);
const ScheduledPlansPage = lazy(() =>
  import("./pages/ScheduledPlansPage").then((module) => ({ default: module.ScheduledPlansPage })),
);
const ScheduledPlanPage = lazy(() =>
  import("./pages/ScheduledPlanPage").then((module) => ({ default: module.ScheduledPlanPage })),
);
const SyncJobCreatePage = lazy(() =>
  import("./pages/SyncJobCreatePage").then((module) => ({ default: module.SyncJobCreatePage })),
);
const SyncJobDetailPage = lazy(() =>
  import("./pages/SyncJobDetailPage").then((module) => ({ default: module.SyncJobDetailPage })),
);
const SyncJobsPage = lazy(() =>
  import("./pages/SyncJobsPage").then((module) => ({ default: module.SyncJobsPage })),
);
const SyncRunDetailPage = lazy(() =>
  import("./pages/SyncRunDetailPage").then((module) => ({ default: module.SyncRunDetailPage })),
);
const SyncRunsPage = lazy(() =>
  import("./pages/SyncRunsListPage").then((module) => ({ default: module.SyncRunsPage })),
);

function AppRestoreSkeleton({ message = "正在加载页面…" }: { message?: string }) {
  return (
    <div className="app-restore-shell">
      <aside className="app-restore-sidebar" aria-hidden="true">
        <div className="brand-lockup brand-lockup--dark">
          <img alt="" className="brand-mark brand-mark--image" src="/favicon.svg" />
          <span>{PRODUCT_NAME}</span>
        </div>
        <span className="app-restore-nav-line" />
        <span className="app-restore-nav-line" />
        <span className="app-restore-nav-line" />
        <span className="app-restore-nav-line" />
      </aside>
      <main className="app-restore-content" aria-busy="true" aria-live="polite">
        <div className="app-restore-heading" aria-hidden="true" />
        <div className="app-restore-card" aria-hidden="true" />
        <div className="app-restore-message">
          <Spin size="small" /> {message}
        </div>
      </main>
    </div>
  );
}

const routeLoading = <AppRestoreSkeleton />;

function ProtectedRoute({
  children,
  admin = false,
  editor = false,
}: {
  children: ReactNode;
  admin?: boolean;
  editor?: boolean;
}) {
  const { ready, user } = useAuth();
  const location = useLocation();
  if (!ready) return <AppRestoreSkeleton message="正在恢复登录状态…" />;
  if (!user) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate replace state={{ from }} to="/login" />;
  }
  if ((admin && user.role !== "admin") || (editor && user.role === "viewer")) {
    return (
      <AppShell>
        <main className="m3-page">
          <h1>无权访问此页面</h1>
          <Alert type="info" title="当前角色没有此页面的操作权限，请联系管理员。" />
        </main>
      </AppShell>
    );
  }
  return children;
}

function SyncJobsRoute() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  if (location.hash === "#scheduled-plans") {
    const planParams = new URLSearchParams();
    const account = searchParams.get("account") ?? searchParams.get("accountId");
    const apiCode = searchParams.get("api") ?? searchParams.get("apiCode");
    if (account) planParams.set("account", account);
    if (apiCode) planParams.set("api", apiCode);
    return (
      <Navigate
        replace
        state={location.state}
        to={`/jobs/plans${planParams.size ? `?${planParams}` : ""}`}
      />
    );
  }
  if (searchParams.get("run") !== "1") return <SyncJobsPage />;

  const createParams = new URLSearchParams();
  const accountId = searchParams.get("account") ?? searchParams.get("accountId");
  const apiCode = searchParams.get("api") ?? searchParams.get("apiCode");
  if (accountId) createParams.set("accountId", accountId);
  if (apiCode) createParams.set("apiCode", apiCode);
  const query = createParams.toString();
  return <Navigate replace state={location.state} to={`/jobs/new${query ? `?${query}` : ""}`} />;
}

export function App() {
  const { ready, retrySession, sessionUnavailable } = useAuth();
  if (!ready) return <AppRestoreSkeleton message="正在恢复登录状态…" />;
  if (sessionUnavailable) {
    return (
      <main className="app-loading">
        <Alert
          action={
            <Button aria-label="重试" onClick={retrySession}>
              重试
            </Button>
          }
          description="无法连接服务，请稍后重试。"
          title="服务暂时不可用"
          type="error"
        />
      </main>
    );
  }
  return (
    <Suspense fallback={routeLoading}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/account/security"
          element={
            <ProtectedRoute>
              <AccountSecurityPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/members"
          element={
            <ProtectedRoute admin>
              <MembersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounts"
          element={
            <ProtectedRoute>
              <AccountsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounts/new"
          element={
            <ProtectedRoute editor>
              <AccountOnboardingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounts/:accountId"
          element={
            <ProtectedRoute>
              <AccountWorkspacePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounts/:accountId/policies"
          element={
            <ProtectedRoute>
              <AccountPoliciesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/api-catalog"
          element={
            <ProtectedRoute>
              <ApiCatalogPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/jobs"
          element={
            <ProtectedRoute>
              <SyncJobsRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/jobs/new"
          element={
            <ProtectedRoute editor>
              <SyncJobCreatePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/jobs/plans"
          element={
            <ProtectedRoute>
              <ScheduledPlansPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/jobs/plans/new"
          element={
            <ProtectedRoute>
              <ScheduledPlanPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/jobs/plans/:accountId/:apiCode"
          element={
            <ProtectedRoute>
              <ScheduledPlanPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/jobs/tasks/:taskNo"
          element={
            <ProtectedRoute>
              <SyncJobDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/jobs/:id"
          element={
            <ProtectedRoute>
              <SyncJobDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/runs"
          element={
            <ProtectedRoute>
              <SyncRunsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/runs/:id"
          element={
            <ProtectedRoute>
              <SyncRunDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/raw-data"
          element={
            <ProtectedRoute>
              <RawDataPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/raw-data/:id"
          element={
            <ProtectedRoute>
              <RawDataDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/data/stores"
          element={
            <ProtectedRoute editor>
              <ParsedDataPage dataset="stores" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/data/products"
          element={
            <ProtectedRoute editor>
              <ParsedDataPage dataset="products" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/data/inventory"
          element={
            <ProtectedRoute editor>
              <ParsedDataPage dataset="inventory" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/data/warehouses"
          element={
            <ProtectedRoute editor>
              <ParsedDataPage dataset="warehouses" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sale-returns"
          element={
            <ProtectedRoute editor>
              <SaleReturnOrdersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/audit"
          element={
            <ProtectedRoute admin>
              <AuditPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </Suspense>
  );
}
