import type { Middleware } from "@reduxjs/toolkit";
import { servicesApi } from "../servicesApi.ts";
import { setUpdateAvailable } from "../uiSlice.ts";

const FRONTEND_VERSION_URL = "/__version";
const POLL_INTERVAL_MS = 30_000;

export const versionWatchMiddleware: Middleware = (storeAPI) => {
  const backendBaseline = new Map<string, string>();
  let frontendHash: string | null = null;
  let lastNotifiedKey: string | null = null;

  function notifyOnce(key: string) {
    if (lastNotifiedKey === key) return;
    lastNotifiedKey = key;
    storeAPI.dispatch(setUpdateAvailable());
  }

  async function checkFrontendVersion() {
    try {
      const res = await fetch(FRONTEND_VERSION_URL, { cache: "no-store" });
      if (!res.ok) return;
      const { hash } = (await res.json()) as { hash: string };
      if (frontendHash === null) {
        frontendHash = hash;
      } else if (frontendHash !== hash) {
        notifyOnce(`frontend:${hash}`);
      }
    } catch {
      // network unavailable — skip
    }
  }

  setInterval(checkFrontendVersion, POLL_INTERVAL_MS);
  checkFrontendVersion();

  return (next) => (action) => {
    const result = next(action);

    if (servicesApi.endpoints.getServiceHealth.matchFulfilled(action)) {
      const svc = action.payload;
      if (svc.state !== "ok" || svc.version === "dev" || svc.version === "—") {
        return result;
      }
      const known = backendBaseline.get(svc.name);
      if (known === undefined) {
        backendBaseline.set(svc.name, svc.version);
      } else if (known !== svc.version) {
        backendBaseline.set(svc.name, svc.version);
        notifyOnce(`backend:${svc.name}:${svc.version}`);
      }
    }

    return result;
  };
};
