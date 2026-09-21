import { describe, expect, it } from "vitest";

import type { SyncTaskStatus } from "../api/types";
import { syncProgressStatus } from "./syncJobStatus";

describe("同步进度状态", () => {
  it.each<[SyncTaskStatus, string]>([
    ["in_progress", "进行中"],
    ["paused", "已暂停"],
    ["attention", "需处理"],
    ["success", "已完成"],
  ])("历史回填由任务状态 %s 决定展示", (taskStatus, label) => {
    expect(syncProgressStatus("history_backfill", taskStatus, "pending")).toEqual({
      code: taskStatus,
      label,
    });
  });

  it("增量任务保留增量追赶状态", () => {
    expect(syncProgressStatus("update_incremental", "in_progress", "running")).toEqual({
      code: "running",
      label: "变更追赶进行中",
    });
  });
});
