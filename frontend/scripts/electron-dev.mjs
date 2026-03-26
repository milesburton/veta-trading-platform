/**
 * electron-dev.mjs
 *
 * Orchestrates the Electron dev workflow:
 *   1. Starts the Vite renderer dev server (no electron plugin — main/preload already compiled by tsc)
 *   2. Waits for the Vite server to be ready
 *   3. Launches Electron with VITE_DEV_SERVER_URL pointing at the Vite server
 *   4. Kills everything on exit
 */

import { spawn } from "child_process";
import { createServer } from "http";

const VITE_PORT = 5173;
const VITE_URL = `http://localhost:${VITE_PORT}`;

function waitForServer(url, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    function poll() {
      const req = (url.startsWith("https") ? null : createServer()).request
        ? null
        : null;
      import("http").then(({ get }) => {
        get(url, (res) => {
          if (res.statusCode < 500) resolve();
          else if (Date.now() < deadline) setTimeout(poll, 500);
          else reject(new Error("Vite server returned error status"));
        }).on("error", () => {
          if (Date.now() < deadline) setTimeout(poll, 500);
          else reject(new Error(`Timed out waiting for ${url}`));
        });
      });
    }
    poll();
  });
}

// Start Vite renderer (plain vite, no electron plugin)
const vite = spawn("node_modules/.bin/vite", ["--port", String(VITE_PORT), "--mode", "electron"], {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_BUILD: "0" },
});

vite.on("error", (err) => {
  console.error("Vite error:", err);
  process.exit(1);
});

console.log(`Waiting for Vite at ${VITE_URL}...`);
waitForServer(VITE_URL).then(() => {
  console.log("Vite ready — launching Electron");

  // ELECTRON_RUN_AS_NODE is set by VS Code (which is itself an Electron app).
  // It makes the Electron binary behave as Node.js — require("electron") returns
  // a path string instead of the Electron API. Must be unset before launching.
  const { ELECTRON_RUN_AS_NODE: _drop, ...cleanEnv } = process.env;

  // Determine display args — prefer Wayland if the socket exists, fall back to X11
  const useWayland = !!process.env.WAYLAND_DISPLAY;
  const extraArgs = useWayland
    ? ["--ozone-platform=wayland", "--enable-features=UseOzonePlatform"]
    : [];

  const electron = spawn(
    "node_modules/.bin/electron",
    [
      "dist-electron/main.js",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      ...extraArgs,
    ],
    {
      stdio: "inherit",
      env: {
        ...cleanEnv,
        VITE_DEV_SERVER_URL: VITE_URL,
        NODE_ENV: "development",
        DISPLAY: process.env.DISPLAY ?? ":0",
        WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY ?? "",
        XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR ?? "/tmp",
      },
    }
  );

  electron.on("close", (code) => {
    console.log(`Electron exited (${code}) — stopping Vite`);
    vite.kill();
    process.exit(code ?? 0);
  });

  process.on("SIGINT", () => {
    electron.kill();
    vite.kill();
    process.exit(0);
  });
}).catch((err) => {
  console.error("Failed to start:", err);
  vite.kill();
  process.exit(1);
});
