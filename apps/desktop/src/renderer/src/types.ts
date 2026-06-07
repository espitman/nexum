export type HealthState =
  | { status: "loading" }
  | { status: "ready"; timestamp: string }
  | { status: "error"; message: string };

export type ConnectionRuntimeStatus =
  | "checking"
  | "connected"
  | "disconnected"
  | "error";

export type ConnectionStatus = "checking" | "connected" | "offline";

export type EnvironmentName = "dev" | "local" | "production" | "staging";

export type CoreUiState = {
  connectionStatus: ConnectionStatus;
  environment: EnvironmentName;
  isReadOnly: boolean;
};

export type AppSettings = {
  appearance: "system" | "light" | "dark";
  density: "comfortable" | "compact";
  localData: {
    keepAuditLogDays: number;
    metadataCache: "session" | "persistent";
  };
  query: {
    defaultPageSize: number;
    maxSampleSize: number;
    timeoutMs: number;
  };
  safety: {
    confirmProductionWrites: boolean;
    defaultReadOnly: boolean;
  };
};

export type ToastMessage = {
  id: string;
  tone: "error";
  title: string;
  message: string;
};

export type SchemaFieldSummary = {
  meta: string;
  name: string;
  type: string;
};

export type IndexSummary = {
  key: string;
  meta: string;
  name: string;
};

export type Connection = {
  icon: string;
  label: string;
  active?: boolean;
  more?: boolean;
};

export type ConnectionProfile = {
  environment: "development" | "local" | "production" | "staging";
  id: string;
  name: string;
  pluginId: string;
  readOnly: boolean;
  status: ConnectionRuntimeStatus;
};

export type DatabaseNode = {
  name: string;
  type: "database" | "folder" | "collection";
  depth: number;
  open?: boolean;
};

export type DocumentRow = {
  id: string;
  email: string;
  status: "active" | "pending" | "inactive";
  createdAt: string;
  total: string;
};

export type SavedWorkspaceQuery = {
  collection: string;
  connectionId: string;
  connectionName: string;
  createdAt: string;
  database: string;
  executionTimeMs?: number;
  filter: Record<string, unknown>;
  id: string;
  kind: "find" | "aggregation";
  lastRunAt?: string;
  limit: number;
  name: string;
  notes: string;
  pipeline?: Record<string, unknown>[];
  projection: Record<string, unknown>;
  resultCount?: number;
  skip: number;
  sort: Record<string, 1 | -1>;
  updatedAt: string;
};

export type SavedWorkspaceBookmark = {
  collection?: string;
  connectionId: string;
  connectionName: string;
  createdAt: string;
  database?: string;
  documentId?: string;
  id: string;
  kind: "database" | "collection" | "document";
  name: string;
  notes: string;
  tags: string[];
  updatedAt: string;
};

export type SavedWorkspaceTask = {
  createdAt: string;
  id: string;
  lastModifiedAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
  result?: string;
  runs: SavedWorkspaceTaskRun[];
  schedule:
    | "custom-minutes"
    | "daily"
    | "daily-at"
    | "hourly"
    | "manual"
    | "minute"
    | "weekly";
  scheduleTime?: string;
  sourceQuery: SavedWorkspaceQuery;
  status: "idle" | "running" | "success" | "failed";
  target: string;
  type: "aggregation" | "audit-cleanup" | "export" | "find" | "schema-inference";
  name: string;
};

export type SavedWorkspaceTaskRun = {
  error?: string;
  executionTimeMs?: number;
  finishedAt: string;
  id: string;
  message: string;
  resultCount?: number;
  startedAt: string;
  status: "failed" | "success";
  trigger: "manual" | "schedule";
};
