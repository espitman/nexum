import type { Result } from "@nexum/shared";

export type ConnectionEnvironment =
  | "local"
  | "development"
  | "staging"
  | "production";

export type ConnectionProfile = {
  id: string;
  pluginId: string;
  name: string;
  environment: ConnectionEnvironment;
  readOnly: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ConnectionMetadata = ConnectionProfile & {
  lastConnectedAt?: string;
  lastErrorMessage?: string;
};

export type ExplorerNodeType =
  | "connection"
  | "database"
  | "folder"
  | "collection"
  | "view"
  | "document"
  | string;

export type ExplorerNode = {
  id: string;
  pluginId: string;
  connectionId: string;
  type: ExplorerNodeType;
  label: string;
  path: string[];
  metadata?: Record<string, unknown>;
  hasChildren: boolean;
};

export type ConnectionTestResult = {
  ok: boolean;
  message: string;
  latencyMs?: number;
};

export type PluginCapabilities = {
  documents?: boolean;
  tableView?: boolean;
  jsonView?: boolean;
  visualQueryBuilder?: boolean;
  aggregationBuilder?: boolean;
  documentEditing?: boolean;
  schemaInference?: boolean;
  readOnlyMode?: boolean;
};

export type ValidatedConnectionInput = Record<string, unknown>;

export type NexumPlugin = {
  id: string;
  name: string;
  displayName: string;
  version: string;
  capabilities: PluginCapabilities;
  connection: {
    type: string;
    validateInput(
      input: unknown,
    ): Promise<Result<ValidatedConnectionInput, Error>>;
    test(
      input: ValidatedConnectionInput,
    ): Promise<Result<ConnectionTestResult, Error>>;
    connect(profileId: string): Promise<Result<void, Error>>;
    disconnect(profileId: string): Promise<Result<void, Error>>;
  };
  explorer: {
    listRootNodes(connectionId: string): Promise<Result<ExplorerNode[], Error>>;
    listChildren(node: ExplorerNode): Promise<Result<ExplorerNode[], Error>>;
  };
};
