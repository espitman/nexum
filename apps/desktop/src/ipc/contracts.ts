import type { SerializedAppError } from "@nexum/shared";

export const ipcChannels = {
  auditList: "nexum:audit:list",
  connectionGet: "nexum:connections:get",
  connectionList: "nexum:connections:list",
  explorerListChildren: "nexum:explorer:list-children",
  explorerListRootNodes: "nexum:explorer:list-root-nodes",
  healthPing: "nexum:health:ping",
  mongodbFindDocuments: "nexum:mongodb:find-documents",
} as const;

export type IpcChannel = (typeof ipcChannels)[keyof typeof ipcChannels];

export type IpcResponse<TValue> =
  | { ok: true; value: TValue }
  | { ok: false; error: SerializedAppError };

export type HealthCheckResult = {
  ok: boolean;
  appName: string;
  timestamp: string;
};

export type ConnectionSummary = {
  id: string;
  pluginId: string;
  name: string;
  environment: "local" | "development" | "staging" | "production";
  readOnly: boolean;
  status: "connected" | "disconnected" | "checking" | "error";
};

export type ExplorerNodeDto = {
  id: string;
  pluginId: string;
  connectionId: string;
  type: "connection" | "database" | "folder" | "collection" | "view";
  label: string;
  path: string[];
  hasChildren: boolean;
  metadata?: Record<string, unknown>;
};

export type DocumentQueryResult = {
  documents: Record<string, unknown>[];
  executionTimeMs: number;
};

export type AuditLogDto = {
  id: string;
  action: string;
  connectionId?: string;
  pluginId?: string;
  createdAt: string;
};
