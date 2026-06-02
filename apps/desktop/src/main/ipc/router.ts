import { ipcMain, type IpcMain } from "electron";
import { AppError, sanitizeError } from "@nexum/shared";
import type { z } from "zod";
import {
  ConnectionLifecycleService,
  ConnectionStorageService,
  ElectronConnectionMetadataStore,
  KeychainConnectionSecretStore,
  type StoredConnectionSummary,
  type StoredConnectionTestResult,
} from "../connections";
import { ipcChannels, type IpcResponse } from "../../ipc/contracts";
import {
  auditListPayloadSchema,
  connectionCreatePayloadSchema,
  connectionIdPayloadSchema,
  connectionUpdatePayloadSchema,
  explorerChildrenPayloadSchema,
  mongodbFindDocumentsPayloadSchema,
  voidPayloadSchema,
} from "../../ipc/validation";
import {
  findMockDocuments,
  mockAuditLogs,
  mockExplorerChildren,
  mockExplorerRoots,
} from "./mockData";

type IpcHandler<TPayload, TResult> = (
  payload: TPayload,
) => TResult | Promise<TResult>;

const toIpcSuccess = <TValue>(value: TValue): IpcResponse<TValue> => ({
  ok: true,
  value,
});

const toIpcFailure = (error: unknown): IpcResponse<never> => ({
  ok: false,
  error: sanitizeError(error),
});

export const createValidatedIpcHandler =
  <TSchema extends z.ZodType, TResult>(
    channel: string,
    schema: TSchema,
    handler: IpcHandler<z.infer<TSchema>, TResult>,
  ) =>
  async (payload: unknown): Promise<IpcResponse<TResult>> => {
    const parsedPayload = schema.safeParse(payload);

    if (!parsedPayload.success) {
      return toIpcFailure(
        new AppError("VALIDATION_FAILED", "Invalid IPC payload", {
          details: {
            channel,
            issues: parsedPayload.error.issues.map((issue) => ({
              code: issue.code,
              message: issue.message,
              path: issue.path,
            })),
          },
        }),
      );
    }

    try {
      return toIpcSuccess(await handler(parsedPayload.data));
    } catch (error) {
      return toIpcFailure(error);
    }
  };

const registerValidatedHandler = <TSchema extends z.ZodType, TResult>(
  channel: string,
  schema: TSchema,
  handler: IpcHandler<z.infer<TSchema>, TResult>,
  ipc: IpcMain = ipcMain,
) => {
  const validatedHandler = createValidatedIpcHandler(channel, schema, handler);

  ipc.handle(channel, (_event, payload: unknown) => validatedHandler(payload));
};

export type IpcServices = {
  connections: ConnectionLifecycleService;
};

const createDefaultIpcServices = (): IpcServices => ({
  connections: new ConnectionLifecycleService(
    new ConnectionStorageService(
      new ElectronConnectionMetadataStore(),
      new KeychainConnectionSecretStore(),
    ),
  ),
});

const unwrapResult = <TValue>(
  result: { ok: true; value: TValue } | { ok: false; error: AppError },
): TValue => {
  if (!result.ok) {
    throw result.error;
  }

  return result.value;
};

export const registerIpcHandlers = (
  ipc: IpcMain = ipcMain,
  services: IpcServices = createDefaultIpcServices(),
) => {
  registerValidatedHandler(
    ipcChannels.healthPing,
    voidPayloadSchema,
    () => ({
      ok: true,
      appName: "Nexum",
      timestamp: new Date().toISOString(),
    }),
    ipc,
  );

  registerValidatedHandler(
    ipcChannels.connectionList,
    voidPayloadSchema,
    (): StoredConnectionSummary[] => services.connections.list(),
    ipc,
  );

  registerValidatedHandler(
    ipcChannels.connectionGet,
    connectionIdPayloadSchema,
    ({ connectionId }): StoredConnectionSummary =>
      unwrapResult(services.connections.get(connectionId)),
    ipc,
  );

  registerValidatedHandler(
    ipcChannels.connectionCreate,
    connectionCreatePayloadSchema,
    async (payload): Promise<StoredConnectionSummary> =>
      unwrapResult(await services.connections.create(payload)),
    ipc,
  );

  registerValidatedHandler(
    ipcChannels.connectionUpdate,
    connectionUpdatePayloadSchema,
    async ({
      connectionId,
      environment,
      name,
      readOnly,
      uri,
    }): Promise<StoredConnectionSummary> =>
      unwrapResult(
        await services.connections.update(connectionId, {
          ...(environment !== undefined ? { environment } : {}),
          ...(name !== undefined ? { name } : {}),
          ...(readOnly !== undefined ? { readOnly } : {}),
          ...(uri !== undefined ? { uri } : {}),
        }),
      ),
    ipc,
  );

  registerValidatedHandler(
    ipcChannels.connectionDelete,
    connectionIdPayloadSchema,
    async ({ connectionId }): Promise<StoredConnectionSummary> =>
      unwrapResult(await services.connections.delete(connectionId)),
    ipc,
  );

  registerValidatedHandler(
    ipcChannels.connectionTest,
    connectionIdPayloadSchema,
    async ({ connectionId }): Promise<StoredConnectionTestResult> =>
      unwrapResult(await services.connections.test(connectionId)),
    ipc,
  );

  registerValidatedHandler(
    ipcChannels.connectionTestInput,
    connectionCreatePayloadSchema,
    async (payload): Promise<StoredConnectionTestResult> =>
      unwrapResult(await services.connections.testInput(payload)),
    ipc,
  );

  registerValidatedHandler(
    ipcChannels.connectionConnect,
    connectionIdPayloadSchema,
    async ({ connectionId }): Promise<StoredConnectionSummary> =>
      unwrapResult(await services.connections.connect(connectionId)),
    ipc,
  );

  registerValidatedHandler(
    ipcChannels.connectionDisconnect,
    connectionIdPayloadSchema,
    async ({ connectionId }): Promise<StoredConnectionSummary> =>
      unwrapResult(await services.connections.disconnect(connectionId)),
    ipc,
  );

  registerValidatedHandler(
    ipcChannels.explorerListRootNodes,
    connectionIdPayloadSchema,
    ({ connectionId }) =>
      mockExplorerRoots.filter((node) => node.connectionId === connectionId),
    ipc,
  );

  registerValidatedHandler(
    ipcChannels.explorerListChildren,
    explorerChildrenPayloadSchema,
    ({ nodeId }) => mockExplorerChildren[nodeId] ?? [],
    ipc,
  );

  registerValidatedHandler(
    ipcChannels.mongodbFindDocuments,
    mongodbFindDocumentsPayloadSchema,
    findMockDocuments,
    ipc,
  );

  registerValidatedHandler(
    ipcChannels.auditList,
    auditListPayloadSchema,
    (payload) =>
      payload?.connectionId
        ? mockAuditLogs.filter(
            (entry) => entry.connectionId === payload.connectionId,
          )
        : mockAuditLogs,
    ipc,
  );
};
