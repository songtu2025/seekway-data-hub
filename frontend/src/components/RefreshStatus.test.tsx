import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RefreshStatus } from "./RefreshStatus";

describe("RefreshStatus", () => {
  const updatedAt = new Date("2026-09-14T08:05:06");

  it("向普通用户展示刷新中和更新时间", () => {
    const view = render(<RefreshStatus lastUpdatedAt={updatedAt} refreshing />);
    expect(screen.getByText("正在刷新 · 上次检查 08:05:06")).toBeVisible();

    view.rerender(<RefreshStatus lastUpdatedAt={updatedAt} refreshing={false} />);
    expect(screen.getByText("上次检查 08:05:06")).toBeVisible();
  });

  it("刷新失败时明确说明继续显示上次结果", () => {
    render(<RefreshStatus failedWithPreviousData lastUpdatedAt={updatedAt} refreshing={false} />);

    expect(screen.getByText("刷新失败 · 仍显示 08:05:06 的结果")).toBeVisible();
  });

  it("没有成功检查时间时显示尚未检查", () => {
    render(
      <RefreshStatus lastUpdatedAt={null} manualRefreshMessage="数据已刷新" refreshing={false} />,
    );

    expect(screen.getByText("尚未检查")).toBeVisible();
  });

  it("手动刷新成功后展示成功反馈和检查时间", () => {
    render(
      <RefreshStatus
        lastUpdatedAt={updatedAt}
        manualRefreshMessage="数据已刷新"
        refreshing={false}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("数据已刷新 · 上次检查 08:05:06");
  });

  it("支持页面使用更明确的更新时间标签", () => {
    render(
      <RefreshStatus lastUpdatedAt={updatedAt} refreshing={false} updatedLabel="页面更新于" />,
    );

    expect(screen.getByText("页面更新于 08:05:06")).toBeVisible();
  });
});
