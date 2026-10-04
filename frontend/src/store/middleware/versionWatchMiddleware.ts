import type { Middleware } from "@reduxjs/toolkit";
import { servicesApi } from "@veta/frontend/store/servicesApi.ts";
import { setUpdateAvailable } from "@veta/frontend/store/uiSlice.ts";

const FRONTEND_VERSION_URL = "/__version";
const POLL_INTERVAL_MS = 15_000;
const STALE_FAILURE_THRESHOLD = 4;

export const versionWatchMiddleware: Middleware = (storeAPI) => {
  const backendBaseline = new Map<string, string>();
  let frontendHash: string | null = null;
  let lastNotifiedKey: string | null = null;
  let consecutiveFailures = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function notifyOnce(key: string) {
    if (lastNotifiedKey === key) return;
    lastNotifiedKey = key;
    storeAPI.dispatch(setUpdateAvailable());
  }

  function isAnonymous(): boolean {
    const state = storeAPI.getState() as {
      auth?: { user?: { id?: string } | null };
    };
    return !state.auth?.user;
  }

  function autoReloadIfSafe() {
    if (typeof window === "undefined") return;
    if (!isAnonymous()) return;
    globalThis.location.reload();
  }

  async function checkFrontendVersion() {
    try {
      const res = await fetch(FRONTEND_VERSION_URL, { cache: "no-store" });
      if (!res.ok) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= STALE_FAILURE_THRESHOLD) {
          autoReloadIfSafe();
        }
        return;
      }
      consecutiveFailures = 0;
      const { hash } = (await res.json()) as { hash: string };
      if (frontendHash === null) {
        frontendHash = hash;
      } else if (frontendHash !== hash) {
        notifyOnce(`frontend:${hash}`);
        autoReloadIfSafe();
      }
    } catch {
      consecutiveFailures += 1;
      if (consecutiveFailures >= STALE_FAILURE_THRESHOLD) {
        autoReloadIfSafe();
      }
    }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(checkFrontendVersion, POLL_INTERVAL_MS);
  }

  function installVisibilityHook() {
    if (typeof document === "undefined") return;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void checkFrontendVersion();
      }
    });
  }

  startPolling();
  installVisibilityHook();
  void checkFrontendVersion();

  return (next) => (action) => {
    const result = next(action);

    if (servicesApi.endpoints.getServicesStatus.matchFulfilled(action)) {
      const versioned = action.payload.services.filter(
        (svc) => svc.status === "ok" && svc.version !== "dev" && svc.version !== "—"
      );
      for (const svc of versioned) {
        const known = backendBaseline.get(svc.name);
        backendBaseline.set(svc.name, svc.version);
        if (known !== undefined && known !== svc.version) {
          notifyOnce(`backend:${svc.name}:${svc.version}`);
        }
      }
    }

    return result;
  };
};
