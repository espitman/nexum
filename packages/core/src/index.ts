export type ConnectionEnvironment = "local" | "development" | "staging" | "production";

export type ConnectionProfile = {
  id: string;
  pluginId: string;
  name: string;
  environment: ConnectionEnvironment;
  readOnly: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ExplorerNode = {
  id: string;
  pluginId: string;
  connectionId: string;
  type: string;
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
  connection: {
    type: string;
    validateInput(input: unknown): Promise<ValidatedConnectionInput>;
    test(input: ValidatedConnectionInput): Promise<ConnectionTestResult>;
    connect(profileId: string): Promise<void>;
    disconnect(profileId: string): Promise<void>;
  };
  explorer: {
    listRootNodes(connectionId: string): Promise<ExplorerNode[]>;
    listChildren(node: ExplorerNode): Promise<ExplorerNode[]>;
  };
  capabilities: PluginCapabilities;
};
