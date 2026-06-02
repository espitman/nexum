import { contextBridge, ipcRenderer } from "electron";
import {
  ipcChannels,
  type AuditLogDto,
  type ConnectionSummary,
  type DocumentQueryResult,
  type ExplorerNodeDto,
  type HealthCheckResult,
  type IpcChannel,
  type IpcResponse,
} from "../ipc/contracts";
import type {
  AuditListPayload,
  ConnectionIdPayload,
  ExplorerChildrenPayload,
  MongodbFindDocumentsPayload,
} from "../ipc/validation";

export type NexumDesktopApiError = Error & {
  code?: string;
  details?: Record<string, unknown>;
};

const createApiError = (
  response: IpcResponse<unknown>,
): NexumDesktopApiError => {
  if (response.ok) {
    return new Error("Unexpected successful IPC response");
  }

  const error = new Error(response.error.message) as NexumDesktopApiError;
  error.name = "NexumDesktopApiError";
  error.code = response.error.code;
  if (response.error.details) {
    error.details = response.error.details;
  }
  return error;
};

const invoke = async <TValue>(
  channel: IpcChannel,
  payload?: unknown,
): Promise<TValue> => {
  const response = (await ipcRenderer.invoke(
    channel,
    payload,
  )) as IpcResponse<TValue>;

  if (!response.ok) {
    throw createApiError(response);
  }

  return response.value;
};

export type NexumDesktopApi = {
  audit: {
    list(payload?: AuditListPayload): Promise<AuditLogDto[]>;
  };
  connections: {
    get(payload: ConnectionIdPayload): Promise<ConnectionSummary>;
    list(): Promise<ConnectionSummary[]>;
  };
  explorer: {
    listChildren(payload: ExplorerChildrenPayload): Promise<ExplorerNodeDto[]>;
    listRootNodes(payload: ConnectionIdPayload): Promise<ExplorerNodeDto[]>;
  };
  health: {
    ping(): Promise<HealthCheckResult>;
  };
  mongodb: {
    findDocuments(
      payload: MongodbFindDocumentsPayload,
    ): Promise<DocumentQueryResult>;
  };
};

const api: NexumDesktopApi = {
  audit: {
    list: (payload) => invoke(ipcChannels.auditList, payload),
  },
  connections: {
    get: (payload) => invoke(ipcChannels.connectionGet, payload),
    list: () => invoke(ipcChannels.connectionList),
  },
  explorer: {
    listChildren: (payload) =>
      invoke(ipcChannels.explorerListChildren, payload),
    listRootNodes: (payload) =>
      invoke(ipcChannels.explorerListRootNodes, payload),
  },
  health: {
    ping: () => invoke(ipcChannels.healthPing),
  },
  mongodb: {
    findDocuments: (payload) =>
      invoke(ipcChannels.mongodbFindDocuments, payload),
  },
};

contextBridge.exposeInMainWorld("nexum", Object.freeze(api));
