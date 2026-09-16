interface RefreshStatusProps {
  refreshing: boolean;
  lastUpdatedAt: Date | null;
  failedWithPreviousData?: boolean;
  manualRefreshMessage?: string;
}

function formatRefreshTime(value: Date): string {
  return value.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function RefreshStatus({
  refreshing,
  lastUpdatedAt,
  failedWithPreviousData = false,
  manualRefreshMessage = "",
}: RefreshStatusProps) {
  const shouldAnnounce = refreshing || failedWithPreviousData || Boolean(manualRefreshMessage);
  const lastCheckedTime = lastUpdatedAt ? formatRefreshTime(lastUpdatedAt) : "";
  const label = refreshing
    ? lastCheckedTime
      ? `正在刷新 · 上次检查 ${lastCheckedTime}`
      : "正在刷新"
    : failedWithPreviousData && lastCheckedTime
      ? `刷新失败 · 仍显示 ${lastCheckedTime} 的结果`
      : manualRefreshMessage && lastCheckedTime
        ? `${manualRefreshMessage} · 上次检查 ${lastCheckedTime}`
        : lastCheckedTime
          ? `上次检查 ${lastCheckedTime}`
          : "尚未检查";

  return (
    <span
      aria-live={shouldAnnounce ? "polite" : "off"}
      className={`m3-refresh-status${failedWithPreviousData ? " is-warning" : ""}`}
      role={shouldAnnounce ? "status" : undefined}
    >
      {label}
    </span>
  );
}
