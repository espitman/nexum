import type { SerializedAppError } from "@nexum/shared";

export const ipcChannels = {
  auditList: "nexum:audit:list",
  connectionConnect: "nexum:connections:connect",
  connectionCreate: "nexum:connections:create",
  connectionDelete: "nexum:connections:delete",
  connectionDisconnect: "nexum:connections:disconnect",
  connectionGet: "nexum:connections:get",
  connectionList: "nexum:connections:list",
  connectionTest: "nexum:connections:test",
  connectionTestInput: "nexum:connections:test-input",
  connectionUpdate: "nexum:connections:update",
  explorerListChildren: "nexum:explorer:list-children",
  explorerListRootNodes: "nexum:explorer:list-root-nodes",
  healthPing: "nexum:health:ping",
  mongodbAggregate: "nexum:mongodb:aggregate",
  mongodbExplainAggregate: "nexum:mongodb:explain-aggregate",
  mongodbExplainFind: "nexum:mongodb:explain-find",
  mongodbFindDocuments: "nexum:mongodb:find-documents",
  mongodbListIndexes: "nexum:mongodb:list-indexes",
  mongodbUpdateDocument: "nexum:mongodb:update-document",
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

export type ConnectionTestResult = {
  latencyMs?: number;
  message: string;
  ok: boolean;
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
  documents: string[];
  executionTimeMs: number;
  hasMore: boolean;
};

export type DocumentUpdateResult = {
  matchedCount: number;
  modifiedCount: number;
};

export type MongoAggregateResult = {
  documents: string[];
  executionTimeMs: number;
};

export type MongoExplainResult = {
  executionTimeMs: number;
  plan: string;
};

export type MongoIndexDto = {
  key: string;
  meta: string;
  name: string;
};

export type AuditLogDto = {
  id: string;
  action: string;
  actorId?: string;
  connectionId?: string;
  pluginId?: string;
  target?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};
