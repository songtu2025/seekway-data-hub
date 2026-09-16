import { type ReactNode, useEffect, useState } from "react";
import { Alert, Dropdown } from "antd";
import type { MenuProps } from "antd";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";

import { ApiError } from "../api/client";
import type { DashboardSummary } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { useWorkerRuntime } from "../hooks/useWorkerRuntime";

interface SectionNavItem {
  label: string;
  to: string;
}

const dataSectionItems: SectionNavItem[] = [
  { label: "退货订单", to: "/sale-returns" },
  { label: "店铺", to: "/data/stores" },
  { label: "产品", to: "/data/products" },
  { label: "FBA 库存", to: "/data/inventory" },
  { label: "FBA 仓库", to: "/data/warehouses" },
  { label: "原始数据", to: "/raw-data" },
];

const accessSectionItems: SectionNavItem[] = [
  { label: "账号管理", to: "/accounts" },
  { label: "接口中心", to: "/api-catalog" },
];

const systemSectionItems: SectionNavItem[] = [
  { label: "成员与权限", to: "/members" },
  { label: "审计日志", to: "/audit" },
];

const roleLabels = {
  admin: "管理员",
  operator: "操作员",
  viewer: "只读成员",
};

function readDashboardStatus(): DashboardSummary | null {
  try {
    const value = sessionStorage.getItem("dashboard-runtime-status");
    return value ? (JSON.parse(value) as DashboardSummary) : null;
  } catch {
    return null;
  }
}

function SectionNav({ label, items }: { label: string; items: SectionNavItem[] }) {
  return (
    <nav className="section-nav" aria-label={label}>
      {items.map((item) => (
        <NavLink className="section-nav-link" key={item.to} to={item.to}>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { logout, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [dashboardStatus, setDashboardStatus] = useState<DashboardSummary | null>(
    readDashboardStatus,
  );
  const { runtime: workerRuntime } = useWorkerRuntime({
    refreshKey: location.pathname,
  });
  const inSyncSection =
    location.pathname.startsWith("/jobs") || location.pathname.startsWith("/runs");
  const inAccessSection =
    location.pathname.startsWith("/accounts") || location.pathname.startsWith("/api-catalog");
  const inDataSection =
    location.pathname.startsWith("/raw-data") ||
    location.pathname.startsWith("/sale-returns") ||
    location.pathname.startsWith("/data/");
  const inSystemSection =
    location.pathname.startsWith("/members") || location.pathname.startsWith("/audit");

  useEffect(() => {
    setDashboardStatus(readDashboardStatus());
  }, [location.pathname]);

  const savedViews = (location.state?.returnState ?? location.state) as {
    jobsPath?: string;
    plansPath?: string;
  } | null;
  const sourcePath = typeof location.state?.from === "string" ? location.state.from : "";
  const jobsPath =
    location.pathname === "/jobs"
      ? `${location.pathname}${location.search}`
      : /^\/jobs(?:\?|$)/.test(sourcePath)
        ? sourcePath
        : savedViews?.jobsPath?.match(/^\/jobs(?:\?|$)/)
          ? savedViews.jobsPath
          : "/jobs";
  const plansPath =
    location.pathname === "/jobs/plans"
      ? `${location.pathname}${location.search}`
      : /^\/jobs\/plans(?:\?|$)/.test(sourcePath)
        ? sourcePath
        : savedViews?.plansPath?.match(/^\/jobs\/plans(?:\?|$)/)
          ? savedViews.plansPath
          : "/jobs/plans";
  const viewsState = { jobsPath, plansPath };

  const globalAlert =
    workerRuntime?.availability === "offline"
      ? {
          message: "任务执行服务离线，任务不会继续执行。",
          to: "/jobs#worker-status",
          action: "查看执行服务",
        }
      : dashboardStatus?.accounts?.attention
        ? {
            message: `有 ${dashboardStatus.accounts.attention} 个账号需要处理。`,
            to: "/accounts?filter=attention",
            action: "处理账号",
          }
        : null;

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (caught) {
      setLogoutError(caught instanceof ApiError ? caught.message : "退出失败，请稍后重试");
      setLoggingOut(false);
    }
  }

  const accountMenuItems: MenuProps["items"] = [
    { key: "security", label: "账号安全" },
    { type: "divider" },
    {
      key: "logout",
      danger: true,
      disabled: loggingOut,
      label: loggingOut ? "退出中…" : "退出登录",
    },
  ];

  function handleAccountMenu({ key }: { key: string }) {
    if (key === "security") {
      navigate("/account/security");
      return;
    }
    if (key === "logout") void handleLogout();
  }

  return (
    <div className="app-shell">
      <aside className="top-nav">
        <div className="brand-lockup brand-lockup--dark">
          <img
            alt=""
            aria-hidden="true"
            className="brand-mark brand-mark--image"
            src="/favicon.svg"
          />
          <span>SEEKWAY数据接入平台</span>
        </div>
        <nav aria-label="主导航">
          <NavLink className="top-nav-link" end to="/">
            概览
          </NavLink>
          <Link
            aria-current={inAccessSection ? "page" : undefined}
            className={`top-nav-link${inAccessSection ? " active" : ""}`}
            to="/accounts"
          >
            接入管理
          </Link>
          <Link
            aria-current={inSyncSection ? "page" : undefined}
            className={`top-nav-link${inSyncSection ? " active" : ""}`}
            to="/jobs"
          >
            同步任务
          </Link>
          <Link
            aria-current={inDataSection ? "page" : undefined}
            className={`top-nav-link${inDataSection ? " active" : ""}`}
            to="/raw-data"
          >
            数据中心
          </Link>
          {user?.role === "admin" ? (
            <Link
              aria-current={inSystemSection ? "page" : undefined}
              className={`top-nav-link${inSystemSection ? " active" : ""}`}
              to="/members"
            >
              系统设置
            </Link>
          ) : null}
        </nav>
        <div className="top-nav-spacer" />
        <div className="sidebar-account">
          <Dropdown
            classNames={{ root: "sidebar-account-menu" }}
            menu={{
              items: accountMenuItems,
              onClick: handleAccountMenu,
              selectedKeys: location.pathname === "/account/security" ? ["security"] : [],
            }}
            placement="topLeft"
            trigger={["click"]}
          >
            <button
              aria-label={`打开${user?.displayName ?? user?.email ?? "当前账号"}的账号菜单`}
              className="sidebar-account-trigger"
              type="button"
            >
              <span className="avatar" aria-hidden="true">
                {(user?.displayName ?? user?.email ?? "管").slice(0, 1)}
              </span>
              <span className="sidebar-account-copy">
                <strong>{user?.displayName ?? user?.email}</strong>
                <small>{user ? roleLabels[user.role] : ""}</small>
              </span>
            </button>
          </Dropdown>
        </div>
      </aside>
      <div className="app-shell-main">
        {inSyncSection ? (
          <nav className="section-nav" aria-label="同步任务导航">
            <Link
              className={`section-nav-link${location.pathname.startsWith("/jobs/plans") ? "" : " active"}`}
              aria-current={!location.pathname.startsWith("/jobs/plans") ? "page" : undefined}
              to={jobsPath}
              state={viewsState}
            >
              任务列表
            </Link>
            <Link
              className={`section-nav-link${location.pathname.startsWith("/jobs/plans") ? " active" : ""}`}
              aria-current={location.pathname.startsWith("/jobs/plans") ? "page" : undefined}
              to={plansPath}
              state={viewsState}
            >
              定时计划
            </Link>
          </nav>
        ) : null}
        {inAccessSection ? <SectionNav label="接入管理导航" items={accessSectionItems} /> : null}
        {inDataSection && user?.role !== "viewer" ? (
          <SectionNav label="数据中心导航" items={dataSectionItems} />
        ) : null}
        {inSystemSection && user?.role === "admin" ? (
          <SectionNav label="系统设置导航" items={systemSectionItems} />
        ) : null}
        {logoutError ? <Alert className="shell-alert" title={logoutError} type="error" /> : null}
        {globalAlert && location.pathname !== "/" && !inSyncSection ? (
          <Alert
            action={<Link to={globalAlert.to}>{globalAlert.action}</Link>}
            className="global-runtime-alert"
            role="status"
            title={globalAlert.message}
            type="warning"
          />
        ) : null}
        {children}
      </div>
    </div>
  );
}
