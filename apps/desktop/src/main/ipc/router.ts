import { ipcMain, type IpcMain } from "electron";
import { AppError, sanitizeError } from "@nexum/shared";
import type { z } from "zod";
import { ipcChannels, type IpcResponse } from "../../ipc/contracts";
import {
  auditListPayloadSchema,
  connectionIdPayloadSchema,
  explorerChildrenPayloadSchema,
  mongodbFindDocumentsPayloadSchema,
  voidPayloadSchema,
} from "../../ipc/validation";
import {
  findMockDocuments,
  mockAuditLogs,
  mockConnections,
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

export const registerIpcHandlers = (ipc: IpcMain = ipcMain) => {
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
    () => mockConnections,
    ipc,
  );

  registerValidatedHandler(
    ipcChannels.connectionGet,
    connectionIdPayloadSchema,
    ({ connectionId }) => {
      const connection = mockConnections.find(
        (item) => item.id === connectionId,
      );

      if (!connection) {
        throw new AppError(
          "CONNECTION_NOT_FOUND",
          `Connection "${connectionId}" was not found`,
          { details: { connectionId } },
        );
      }

      return connection;
    },
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
