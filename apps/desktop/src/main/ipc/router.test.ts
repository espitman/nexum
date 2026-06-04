import { ok, type AppError, type Result } from "@nexum/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ipcChannels,
  type ConnectionSummary,
  type DocumentQueryResult,
  type DocumentUpdateResult,
  type ExplorerNodeDto,
} from "../../ipc/contracts";
import type { StoredConnectionTestResult } from "../connections";
import { createValidatedIpcHandler, registerIpcHandlers } from "./router";

describe("createValidatedIpcHandler", () => {
  it("returns sanitized validation errors for invalid payloads", async () => {
    const handler = createValidatedIpcHandler(
      ipcChannels.connectionGet,
      z.object({ connectionId: z.string().min(1) }),
      (payload) => payload,
    );

    const response = await handler({ connectionId: "" });

    expect(response.ok).toBe(false);
    expect(response).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid IPC payload",
      },
    });
  });

  it("returns typed success envelopes for valid payloads", async () => {
    const handler = createValidatedIpcHandler(
      ipcChannels.healthPing,
      z.undefined(),
      () => ({ ok: true, appName: "Nexum", timestamp: "2026-06-02T00:00:00Z" }),
    );

    await expect(handler(undefined)).resolves.toMatchObject({
      ok: true,
      value: {
        appName: "Nexum",
        ok: true,
      },
    });
  });
});

describe("registerIpcHandlers connection lifecycle", () => {
  it("accepts create, test, and delete payloads from the preload API", async () => {
    const handlers = new Map<
      string,
      (_event: unknown, payload: unknown) => Promise<unknown>
    >();
    const ipc = {
      handle(channel: string, handler: never) {
        handlers.set(channel, handler);
      },
    };
    const findPayloads: unknown[] = [];
    const profiles = new Map<string, ConnectionSummary>();
    const services = {
      audit: {
        list() {
          return [];
        },
        listByConnection() {
          return [];
        },
      },
      connections: {
        async connect(): Promise<Result<ConnectionSummary, AppError>> {
          throw new Error("unused");
        },
        async create(): Promise<Result<ConnectionSummary, AppError>> {
          const profile: ConnectionSummary = {
            environment: "local",
            id: "conn_test",
            name: "Local MongoDB",
            pluginId: "mongodb",
            readOnly: true,
            status: "disconnected",
          };
          profiles.set(profile.id, profile);
          return ok(profile);
        },
        async delete(): Promise<Result<ConnectionSummary, AppError>> {
          const profile = profiles.get("conn_test");

          if (!profile) {
            throw new Error("missing profile");
          }

          profiles.delete(profile.id);
          return ok(profile);
        },
        async disconnect(): Promise<Result<ConnectionSummary, AppError>> {
          throw new Error("unused");
        },
        get(): Result<ConnectionSummary, AppError> {
          throw new Error("unused");
        },
        list(): ConnectionSummary[] {
          return [...profiles.values()];
        },
        findDocuments(
          _connectionId: string,
          payload: unknown,
        ): Result<Promise<DocumentQueryResult>, AppError> {
          findPayloads.push(payload);

          return ok(
            Promise.resolve({
              documents: ['{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"}}'],
              executionTimeMs: 4,
              hasMore: false,
            }),
          );
        },
        listIndexes(): Result<
          Promise<Array<{ key: string; meta: string; name: string }>>,
          AppError
        > {
          return ok(
            Promise.resolve([
              {
                key: '{"_id":{"$numberInt":"1"}}',
                meta: "Unique",
                name: "_id_",
              },
            ]),
          );
        },
        updateDocument(
          _connectionId: string,
          payload: unknown,
        ): Result<Promise<DocumentUpdateResult>, AppError> {
          findPayloads.push(payload);

          return ok(
            Promise.resolve({
              matchedCount: 1,
              modifiedCount: 1,
            }),
          );
        },
        async test(): Promise<Result<StoredConnectionTestResult, AppError>> {
          return ok({
            latencyMs: 1,
            message: "MongoDB ping succeeded",
            ok: true,
          });
        },
        async testInput(): Promise<
          Result<StoredConnectionTestResult, AppError>
        > {
          return ok({
            latencyMs: 1,
            message: "MongoDB ping succeeded",
            ok: true,
          });
        },
        async update(): Promise<Result<ConnectionSummary, AppError>> {
          throw new Error("unused");
        },
      },
      explorer: {
        async listChildren(): Promise<Result<ExplorerNodeDto[], AppError>> {
          return ok([
            {
              connectionId: "conn_test",
              hasChildren: false,
              id: "mongodb:conn_test:database:app:collection:users",
              label: "users",
              path: ["app", "users"],
              pluginId: "mongodb",
              type: "collection",
            },
          ]);
        },
        async listRootNodes(): Promise<Result<ExplorerNodeDto[], AppError>> {
          return ok([
            {
              connectionId: "conn_test",
              hasChildren: true,
              id: "mongodb:conn_test:database:app",
              label: "app",
              path: ["app"],
              pluginId: "mongodb",
              type: "database",
            },
          ]);
        },
      },
    };

    registerIpcHandlers(ipc as never, services as never);

    await expect(
      handlers.get(ipcChannels.connectionCreate)?.(undefined, {
        environment: "local",
        name: "Local MongoDB",
        readOnly: true,
        uri: "mongodb://user:password@mongo-stg-a.alibaba.local:27017,mongo-stg-b.alibaba.local:27017,mongo-stg-c.alibaba.local:27017/merchandising-db?replicaSet=rs0&authSource=admin",
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      handlers.get(ipcChannels.connectionTest)?.(undefined, {
        connectionId: "conn_test",
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      handlers.get(ipcChannels.connectionTestInput)?.(undefined, {
        environment: "local",
        name: "Local MongoDB",
        readOnly: true,
        uri: "mongodb://user:password@mongo-stg-a.alibaba.local:27017,mongo-stg-b.alibaba.local:27017,mongo-stg-c.alibaba.local:27017/merchandising-db?replicaSet=rs0&authSource=admin",
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      handlers.get(ipcChannels.connectionDelete)?.(undefined, {
        connectionId: "conn_test",
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      handlers.get(ipcChannels.explorerListRootNodes)?.(undefined, {
        connectionId: "conn_test",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: [{ label: "app", type: "database" }],
    });
    await expect(
      handlers.get(ipcChannels.explorerListChildren)?.(undefined, {
        connectionId: "conn_test",
        nodeId: "mongodb:conn_test:database:app",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: [{ label: "users", type: "collection" }],
    });
    await expect(
      handlers.get(ipcChannels.mongodbFindDocuments)?.(undefined, {
        collection: "users",
        connectionId: "conn_test",
        database: "app",
        filter: { status: "active" },
        limit: 50,
        projection: { email: 1 },
        skip: 0,
        sort: { createdAt: -1 },
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        documents: ['{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"}}'],
        hasMore: false,
      },
    });
    await expect(
      handlers.get(ipcChannels.mongodbListIndexes)?.(undefined, {
        collection: "users",
        connectionId: "conn_test",
        database: "app",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: [{ key: '{"_id":{"$numberInt":"1"}}', name: "_id_" }],
    });
    await expect(
      handlers.get(ipcChannels.mongodbUpdateDocument)?.(undefined, {
        collection: "users",
        connectionId: "conn_test",
        database: "app",
        editedDocument:
          '{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"},"email":"updated@example.com"}',
        originalDocument:
          '{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"},"email":"old@example.com"}',
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        matchedCount: 1,
        modifiedCount: 1,
      },
    });
    expect(findPayloads.at(-1)).toEqual({
      collection: "users",
      confirmedProductionWrite: false,
      connectionId: "conn_test",
      database: "app",
      editedDocument:
        '{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"},"email":"updated@example.com"}',
      originalDocument:
        '{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"},"email":"old@example.com"}',
    });
    await expect(
      handlers.get(ipcChannels.mongodbFindDocuments)?.(undefined, {
        collection: "users",
        connectionId: "conn_test",
        database: "app",
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(findPayloads.at(-1)).toEqual({
      collection: "users",
      connectionId: "conn_test",
      database: "app",
      filter: {},
      limit: 50,
      projection: {},
      skip: 0,
      sort: {},
    });
  });
});
