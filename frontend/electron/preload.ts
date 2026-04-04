import { contextBridge, ipcRenderer } from "electron";

const api = {
  platform: process.platform as NodeJS.Platform,
  appVersion: process.env["npm_package_version"] ?? "0.0.0",

  minimize(): void {
    ipcRenderer.send("window:minimize");
  },
  maximize(): void {
    ipcRenderer.send("window:maximize");
  },
  close(): void {
    ipcRenderer.send("window:close");
  },
  isMaximized(): Promise<boolean> {
    return ipcRenderer.invoke("window:isMaximized");
  },
  onMaximizeChange(cb: (maximized: boolean) => void): () => void {
    const handler = (_: Electron.IpcRendererEvent, maximized: boolean) =>
      cb(maximized);
    ipcRenderer.on("window:maximizeChange", handler);
    return () => ipcRenderer.off("window:maximizeChange", handler);
  },
  openExternal(url: string): void {
    ipcRenderer.send("shell:openExternal", url);
  },
  showSaveDialog(options: {
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
  }): Promise<string | null> {
    return ipcRenderer.invoke("dialog:showSave", options);
  },
  writeFile(filePath: string, content: string): Promise<void> {
    return ipcRenderer.invoke("fs:writeFile", filePath, content);
  },
  quit(): void {
    ipcRenderer.send("app:quit");
  },
  onDeepLink(cb: (url: string) => void): () => void {
    const handler = (_: Electron.IpcRendererEvent, url: string) => cb(url);
    ipcRenderer.on("deeplink:navigate", handler);
    return () => ipcRenderer.off("deeplink:navigate", handler);
  },
};

contextBridge.exposeInMainWorld("electronAPI", api);
