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
