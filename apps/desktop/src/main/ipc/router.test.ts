import { ok, type AppError, type Result } from "@nexum/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ipcChannels,
  type ConnectionSummary,
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
    const profiles = new Map<string, ConnectionSummary>();
    const services = {
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
  });
});
