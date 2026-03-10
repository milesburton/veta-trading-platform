import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import { writeFile } from "fs/promises";
import * as path from "path";

// ── Environment ───────────────────────────────────────────────────────────────
const isDev = !app.isPackaged;
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];

// ── Window management ─────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    frame: process.platform !== "darwin",
    show: false,
    backgroundColor: "#030712", // matches bg-gray-950
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  mainWindow.on("maximize", () =>
    mainWindow?.webContents.send("window:maximizeChange", true)
  );
  mainWindow.on("unmaximize", () =>
    mainWindow?.webContents.send("window:maximizeChange", false)
  );

  // New windows: allow same-origin pop-outs (panel pop-outs), block everything else
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const allowed =
      url.startsWith("http://localhost") || url.startsWith("file://");
    if (allowed) {
      return {
        action: "allow" as const,
        overrideBrowserWindowOptions: {
          webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      };
    }
    shell.openExternal(url);
    return { action: "deny" as const };
  });

  if (isDev && VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => { mainWindow = null; });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:maximize", () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on("window:close", () => mainWindow?.close());
ipcMain.handle("window:isMaximized", () => mainWindow?.isMaximized() ?? false);

ipcMain.on("shell:openExternal", (_, url: string) => {
  if (typeof url === "string" && /^https?:\/\//.test(url)) shell.openExternal(url);
});

ipcMain.handle(
  "dialog:showSave",
  async (_, options: { defaultPath?: string; filters?: Electron.FileFilter[] }) => {
    const result = await dialog.showSaveDialog(mainWindow!, options);
    return result.canceled ? null : result.filePath;
  }
);

ipcMain.handle("fs:writeFile", async (_, filePath: string, content: string) => {
  if (typeof filePath !== "string" || typeof content !== "string") {
    throw new Error("Invalid arguments");
  }
  await writeFile(filePath, content, "utf-8");
});

// ── Native menu ───────────────────────────────────────────────────────────────
function buildMenu(): void {
  const isMac = process.platform === "darwin";

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: "about" as const },
            { type: "separator" as const },
            { role: "services" as const },
            { type: "separator" as const },
            { role: "hide" as const },
            { role: "hideOthers" as const },
            { role: "unhide" as const },
            { type: "separator" as const },
            { role: "quit" as const },
          ],
        }]
      : []),
    {
      label: "File",
      submenu: [isMac ? { role: "close" as const } : { role: "quit" as const }],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" as const },
        { role: "redo" as const },
        { type: "separator" as const },
        { role: "cut" as const },
        { role: "copy" as const },
        { role: "paste" as const },
        { role: "selectAll" as const },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" as const },
        { role: "forceReload" as const },
        ...(isDev ? [{ role: "toggleDevTools" as const }] : []),
        { type: "separator" as const },
        { role: "resetZoom" as const },
        { role: "zoomIn" as const },
        { role: "zoomOut" as const },
        { type: "separator" as const },
        { role: "togglefullscreen" as const },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" as const },
        { role: "zoom" as const },
        ...(isMac
          ? [{ type: "separator" as const }, { role: "front" as const }]
          : [{ role: "close" as const }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
