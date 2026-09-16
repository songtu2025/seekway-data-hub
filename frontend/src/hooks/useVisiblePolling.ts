import { useEffect, useRef } from "react";

interface UseVisiblePollingOptions {
  enabled: boolean;
  intervalMs: number;
  onPoll: () => Promise<void> | void;
}

export function useVisiblePolling({ enabled, intervalMs, onPoll }: UseVisiblePollingOptions) {
  const onPollRef = useRef(onPoll);
  onPollRef.current = onPoll;

  useEffect(() => {
    if (!enabled) return undefined;

    let active = true;
    let timer: number | undefined;
    let inFlight: Promise<void> | null = null;
    let rerunRequested = false;

    const clearTimer = () => {
      if (timer === undefined) return;
      window.clearTimeout(timer);
      timer = undefined;
    };

    const schedule = () => {
      clearTimer();
      if (!active || document.visibilityState !== "visible") return;
      timer = window.setTimeout(() => void run(), intervalMs);
    };

    const run = async () => {
      clearTimer();
      if (!active || document.visibilityState !== "visible") return;
      if (inFlight) {
        rerunRequested = true;
        return;
      }

      const request = Promise.resolve().then(() => onPollRef.current());
      inFlight = request;
      try {
        await request;
      } catch {
        // 请求错误由页面负责展示，轮询仍按原节奏继续。
      } finally {
        if (inFlight === request) inFlight = null;
        if (active && document.visibilityState === "visible") {
          if (rerunRequested) {
            rerunRequested = false;
            void run();
          } else {
            schedule();
          }
        }
      }
    };

    const handleVisibilityChange = () => {
      clearTimer();
      if (!active || document.visibilityState !== "visible") {
        rerunRequested = false;
        return;
      }
      void run();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    schedule();
    return () => {
      active = false;
      rerunRequested = false;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, intervalMs]);
}
