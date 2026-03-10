// Type augmentation: window.electronAPI is only present inside Electron.
// Guard all usage with: if (window.electronAPI) { ... }

interface ElectronAPI {
  platform: "darwin" | "win32" | "linux";
  appVersion: string;
  minimize(): void;
  maximize(): void;
  close(): void;
  isMaximized(): Promise<boolean>;
  onMaximizeChange(cb: (maximized: boolean) => void): () => void;
  openExternal(url: string): void;
  showSaveDialog(options: {
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
  }): Promise<string | null>;
  writeFile(filePath: string, content: string): Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
