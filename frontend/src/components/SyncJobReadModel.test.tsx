import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { SyncJob } from "../api/types";
import { SyncJobActionPanel } from "./SyncJobDetailSections";
import { SyncJobLifecycle } from "./SyncJobReadModel";

function lifecycleEvents(count = 11): NonNullable<SyncJob["lifecycleEvents"]> {
  return Array.from({ length: count }, (_, index) => ({
    id: `event-${index + 1}`,
    eventType: "created" as const,
    occurredAt: `2026-09-${String(index + 1).padStart(2, "0")}T08:00:00Z`,
    actorName: `操作人 ${index + 1}`,
    executionId: index + 1,
    status: null,
  }));
}

describe("任务生命周期", () => {
  it("默认展示最新事件，并在轮询新增事件时保留正在浏览的历史页", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SyncJobLifecycle events={lifecycleEvents()} />);

    expect(screen.getByText("共 11 条事件")).toBeInTheDocument();
    expect(screen.getByText(/执行 #11 · 操作人：操作人 11/)).toBeInTheDocument();
    expect(screen.queryByText("操作人：操作人 1")).not.toBeInTheDocument();

    await user.click(screen.getByTitle("2"));

    expect(screen.getByText(/执行 #6 · 操作人：操作人 6/)).toBeInTheDocument();
    expect(screen.queryByText(/执行 #11/)).not.toBeInTheDocument();

    rerender(<SyncJobLifecycle events={lifecycleEvents(12)} />);

    expect(screen.getByText(/执行 #7 · 操作人：操作人 7/)).toBeInTheDocument();
    expect(screen.queryByText(/执行 #12/)).not.toBeInTheDocument();
  });
});

describe("任务操作面板", () => {
  it("暂停状态使用警告反馈并保留唯一主操作", () => {
    const job: SyncJob = {
      id: 7,
      apiCode: "sale_return_order_page",
      jobType: "history_backfill",
      status: "paused",
      availableActions: ["resume", "stop"],
      historyProgress: {
        completedWindows: 3,
        totalWindows: 60,
        currentWindow: { startDate: "2021-11-02", endDate: "2021-12-02" },
        currentPage: 54,
        totalPages: 62,
        earliestObservedDataDate: "2021-08-01",
        historyCompleteThrough: "2021-11-01",
        changeCatchup: "pending",
      },
    };

    const { container } = render(
      <MemoryRouter>
        <SyncJobActionPanel
          canOperate
          cancelling={false}
          controllingAction={null}
          dispositionAction={null}
          job={job}
          rawDataPath={null}
          retrying={false}
          onCancel={vi.fn()}
          onControl={vi.fn()}
          onDismiss={vi.fn()}
          onRequestStop={vi.fn()}
          onRestoreAttention={vi.fn()}
          onRetry={vi.fn()}
          onShowDiagnostics={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "继续执行" })).toHaveClass("ant-btn-primary");
    expect(screen.getByRole("status")).toHaveTextContent("第 54 页安全暂停");
    expect(container.querySelector(".ant-alert")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".ant-btn-primary")).toHaveLength(1);
  });

  it("控制操作提交时只在对应按钮显示处理中状态", () => {
    const job: SyncJob = {
      id: 7,
      apiCode: "sale_return_order_page",
      jobType: "history_backfill",
      status: "paused",
      availableActions: ["resume", "stop"],
    };

    render(
      <MemoryRouter>
        <SyncJobActionPanel
          canOperate
          cancelling={false}
          controllingAction="resume"
          dispositionAction={null}
          job={job}
          rawDataPath={null}
          retrying={false}
          onCancel={vi.fn()}
          onControl={vi.fn()}
          onDismiss={vi.fn()}
          onRequestStop={vi.fn()}
          onRestoreAttention={vi.fn()}
          onRetry={vi.fn()}
          onShowDiagnostics={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "继续执行中…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "停止任务" })).toBeDisabled();
  });
});
