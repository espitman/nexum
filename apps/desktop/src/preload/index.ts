import { contextBridge, ipcRenderer } from "electron";

export type HealthCheckResult = {
  ok: boolean;
  appName: string;
  timestamp: string;
};

export type NexumDesktopApi = {
  health: {
    ping(): Promise<HealthCheckResult>;
  };
};

const api: NexumDesktopApi = {
  health: {
    ping: () => ipcRenderer.invoke("nexum:health:ping")
  }
};

contextBridge.exposeInMainWorld("nexum", api);
