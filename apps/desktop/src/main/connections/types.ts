export const connectionEnvironments = [
  "local",
  "development",
  "staging",
  "production",
] as const;

export type ConnectionEnvironment = (typeof connectionEnvironments)[number];

export type StoredConnectionMetadata = {
  createdAt: string;
  environment: ConnectionEnvironment;
  id: string;
  lastConnectedAt?: string;
  lastErrorMessage?: string;
  name: string;
  pluginId: string;
  readOnly: boolean;
  updatedAt: string;
};

export type CreateStoredConnectionInput = {
  environment: ConnectionEnvironment;
  id?: string;
  name: string;
  pluginId?: string;
  readOnly: boolean;
  uri: string;
};

export type UpdateStoredConnectionInput = {
  environment?: ConnectionEnvironment;
  lastConnectedAt?: string;
  lastErrorMessage?: string;
  name?: string;
  pluginId?: string;
  readOnly?: boolean;
  uri?: string;
};

export type ConnectionStorageState = {
  connections: Record<string, StoredConnectionMetadata>;
};
