import { StrictMode } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useVisiblePolling } from "./useVisiblePolling";

function Harness({ enabled = true, onPoll }: { enabled?: boolean; onPoll: () => Promise<void> }) {
  useVisiblePolling({ enabled, intervalMs: 1000, onPoll });
  return null;
}

describe("useVisiblePolling", () => {
  let visibility: "hidden" | "visible";

  beforeEach(() => {
    vi.useFakeTimers();
    visibility = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("StrictMode 下只保留一个定时器并按间隔轮询", async () => {
    const onPoll = vi.fn().mockResolvedValue(undefined);
    render(
      <StrictMode>
        <Harness onPoll={onPoll} />
      </StrictMode>,
    );

    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(onPoll).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(onPoll).toHaveBeenCalledTimes(2);
  });

  it("页面隐藏时暂停，恢复可见时立即刷新一次", async () => {
    const onPoll = vi.fn().mockResolvedValue(undefined);
    render(<Harness onPoll={onPoll} />);

    visibility = "hidden";
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(onPoll).not.toHaveBeenCalled();

    visibility = "visible";
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(onPoll).toHaveBeenCalledTimes(1);
  });

  it("请求未完成时不重叠，恢复可见只排队一次补刷", async () => {
    let resolveRequest: (() => void) | undefined;
    const onPoll = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    render(<Harness onPoll={onPoll} />);

    await act(async () => vi.advanceTimersByTimeAsync(1000));
    visibility = "hidden";
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    visibility = "visible";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(onPoll).toHaveBeenCalledTimes(1);

    await act(async () => resolveRequest?.());
    expect(onPoll).toHaveBeenCalledTimes(2);
  });

  it("停用或卸载后不再调度", async () => {
    const onPoll = vi.fn().mockResolvedValue(undefined);
    const view = render(<Harness onPoll={onPoll} />);
    view.rerender(<Harness enabled={false} onPoll={onPoll} />);
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(onPoll).not.toHaveBeenCalled();

    view.rerender(<Harness onPoll={onPoll} />);
    view.unmount();
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(onPoll).not.toHaveBeenCalled();
  });

  it("请求进行中卸载，完成后也不会重新调度", async () => {
    let resolveRequest: (() => void) | undefined;
    const onPoll = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const view = render(<Harness onPoll={onPoll} />);
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(onPoll).toHaveBeenCalledTimes(1);

    view.unmount();
    await act(async () => resolveRequest?.());
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(onPoll).toHaveBeenCalledTimes(1);
  });
});
