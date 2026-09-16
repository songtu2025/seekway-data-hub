import { useEffect, useRef, useSyncExternalStore } from "react";

import { api } from "../api/client";
import type { WorkerRuntime } from "../api/types";

const WORKER_RUNTIME_MIN_REFRESH_INTERVAL_MS = 15_000;

interface UseWorkerRuntimeOptions {
  refreshKey?: string;
}

interface WorkerRuntimeSnapshot {
  checking: boolean;
  error: unknown;
  runtime: WorkerRuntime | null;
}

let snapshot: WorkerRuntimeSnapshot = { checking: true, error: null, runtime: null };
let timer: number | undefined;
let requestInFlight = false;
let lifecycleGeneration = 0;
let requestGeneration = 0;
let refreshQueued = false;
let queuedRefreshShowsChecking = false;
const listeners = new Set<() => void>();

function emit(nextSnapshot: WorkerRuntimeSnapshot) {
  snapshot = nextSnapshot;
  listeners.forEach((listener) => listener());
}

function clearRefreshTimer() {
  if (timer !== undefined) window.clearTimeout(timer);
  timer = undefined;
}

function scheduleRefresh(intervalMs: number) {
  clearRefreshTimer();
  if (listeners.size === 0 || document.visibilityState !== "visible") return;
  timer = window.setTimeout(() => void refreshRuntime(false), intervalMs);
}

async function refreshRuntime(showChecking: boolean) {
  if (listeners.size === 0 || document.visibilityState !== "visible") return;
  if (requestInFlight) {
    // 刷新条件变化时废弃当前响应，并在请求完成后立即读取最新状态。
    requestGeneration += 1;
    refreshQueued = true;
    queuedRefreshShowsChecking ||= showChecking;
    if (showChecking) emit({ ...snapshot, checking: true });
    return;
  }
  const lifecycleAtStart = lifecycleGeneration;
  const requestAtStart = ++requestGeneration;
  requestInFlight = true;
  clearRefreshTimer();
  if (showChecking) emit({ ...snapshot, checking: true });
  let refreshIntervalMs = WORKER_RUNTIME_MIN_REFRESH_INTERVAL_MS;
  try {
    const runtime = await api.getWorkerRuntime();
    refreshIntervalMs = Math.max(
      runtime.pollIntervalSeconds * 1000,
      WORKER_RUNTIME_MIN_REFRESH_INTERVAL_MS,
    );
    if (
      lifecycleAtStart === lifecycleGeneration &&
      requestAtStart === requestGeneration &&
      listeners.size > 0
    ) {
      emit({ checking: false, error: null, runtime });
    }
  } catch (error) {
    if (
      lifecycleAtStart === lifecycleGeneration &&
      requestAtStart === requestGeneration &&
      listeners.size > 0
    ) {
      emit({ checking: false, error, runtime: snapshot.runtime });
    }
  } finally {
    requestInFlight = false;
    const lifecycleChanged = lifecycleAtStart !== lifecycleGeneration;
    const shouldRefreshAgain = refreshQueued || (lifecycleChanged && listeners.size > 0);
    const nextRefreshShowsChecking = queuedRefreshShowsChecking || lifecycleChanged;
    refreshQueued = false;
    queuedRefreshShowsChecking = false;
    if (shouldRefreshAgain) void refreshRuntime(nextRefreshShowsChecking);
    else if (!lifecycleChanged) scheduleRefresh(refreshIntervalMs);
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible") void refreshRuntime(false);
  else clearRefreshTimer();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void refreshRuntime(true);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      lifecycleGeneration += 1;
      refreshQueued = false;
      queuedRefreshShowsChecking = false;
      clearRefreshTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      snapshot = { checking: true, error: null, runtime: null };
    }
  };
}

function getSnapshot() {
  return snapshot;
}

export function useWorkerRuntime({ refreshKey = "" }: UseWorkerRuntimeOptions = {}) {
  const runtimeSnapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const previousRefreshKeyRef = useRef(refreshKey);

  useEffect(() => {
    if (previousRefreshKeyRef.current === refreshKey) return;
    previousRefreshKeyRef.current = refreshKey;
    void refreshRuntime(false);
  }, [refreshKey]);

  return {
    ...runtimeSnapshot,
    reloadStatus: () => void refreshRuntime(true),
  };
}
