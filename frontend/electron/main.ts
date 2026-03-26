import { app, BrowserWindow, dialog, ipcMain, Menu, shell, Tray, nativeImage } from "electron";
import { writeFile } from "fs/promises";
import * as path from "path";

const isDev = !app.isPackaged;
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function createWindow(): void {
  // In test mode (NODE_ENV=test), show the window immediately so Playwright's
  // firstWindow() doesn't wait for ready-to-show which requires GPU rendering.
  const isTest = process.env.NODE_ENV === "test";

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    frame: process.platform !== "darwin",
    show: isTest,
    backgroundColor: "#030712",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    mainWindow?.setTitle(`VETA Trading Platform v${app.getVersion()}`);
  });

  mainWindow.webContents.on("page-title-updated", (e) => {
    e.preventDefault();
  });

  mainWindow.on("maximize", () =>
    mainWindow?.webContents.send("window:maximizeChange", true)
  );
  mainWindow.on("unmaximize", () =>
    mainWindow?.webContents.send("window:maximizeChange", false)
  );

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

function createTray(): void {
  const iconName = process.platform === "win32" ? "tray-icon.ico" : "tray-icon.png";
  const iconPath = path.join(__dirname, "assets", iconName);
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show VETA",
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: "separator" },
    {
      label: "Quit VETA",
      click: () => {
        tray?.destroy();
        app.quit();
      },
    },
  ]);

  tray.setToolTip(`VETA Trading Platform v${app.getVersion()}`);
  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function handleDeepLink(url: string): void {
  mainWindow?.show();
  mainWindow?.focus();
  mainWindow?.webContents.send("deeplink:navigate", url);
}

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("veta", process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient("veta");
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const url = argv.find((arg) => arg.startsWith("veta://"));
    if (url) handleDeepLink(url);
    mainWindow?.show();
    mainWindow?.focus();
  });
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  createTray();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  if (mainWindow) {
    handleDeepLink(url);
  } else {
    app.whenReady().then(() => handleDeepLink(url));
  }
});

app.on("window-all-closed", () => {
  mainWindow?.hide();
});

ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:maximize", () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on("window:close", () => mainWindow?.hide());
ipcMain.handle("window:isMaximized", () => mainWindow?.isMaximized() ?? false);

ipcMain.on("app:quit", () => {
  tray?.destroy();
  app.quit();
});

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
      submenu: [
        isMac ? { role: "close" as const } : {
          label: "Quit VETA",
          click: () => { tray?.destroy(); app.quit(); },
        },
      ],
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
