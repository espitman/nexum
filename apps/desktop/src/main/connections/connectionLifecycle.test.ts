import { AppError, err, ok, type Result } from "@nexum/shared";
import { AuditLogService } from "@nexum/core";
import { describe, expect, it } from "vitest";
import {
  buildMongoUpdateOperation,
  ConnectionLifecycleService,
  parseMongoUpdateDocuments,
  type ActiveMongoConnection,
  type MongoConnectionDriver,
} from "./connectionLifecycle";
import type { ConnectionMetadataRepository } from "./connectionMetadataStore";
import { ConnectionStorageService } from "./connectionStorage";
import type { ConnectionSecretRepository } from "./keychainSecretStore";
import type {
  CreateStoredConnectionInput,
  StoredConnectionMetadata,
} from "./types";

const mongoUri = "mongodb://nexum-user:super-secret@localhost:27017/admin";

class InMemoryMetadataStore implements ConnectionMetadataRepository {
  readonly metadata = new Map<string, StoredConnectionMetadata>();

  get(connectionId: string): Result<StoredConnectionMetadata, AppError> {
    const metadata = this.metadata.get(connectionId);

    if (!metadata) {
      return err(new AppError("CONNECTION_NOT_FOUND", "Connection not found"));
    }

    return ok(metadata);
  }

  list(): StoredConnectionMetadata[] {
    return [...this.metadata.values()];
  }

  remove(connectionId: string): Result<StoredConnectionMetadata, AppError> {
    const current = this.get(connectionId);

    if (!current.ok) {
      return current;
    }

    this.metadata.delete(connectionId);
    return current;
  }

  set(
    metadata: StoredConnectionMetadata,
  ): Result<StoredConnectionMetadata, AppError> {
    this.metadata.set(metadata.id, metadata);
    return ok(metadata);
  }
}

class InMemorySecretStore implements ConnectionSecretRepository {
  readonly secrets = new Map<string, string>();
  getCount = 0;

  async getUri(connectionId: string): Promise<Result<string, AppError>> {
    this.getCount += 1;
    const uri = this.secrets.get(connectionId);

    if (!uri) {
      return err(new AppError("SECRET_NOT_FOUND", "Secret not found"));
    }

    return ok(uri);
  }

  async removeUri(connectionId: string): Promise<Result<void, AppError>> {
    this.secrets.delete(connectionId);
    return ok(undefined);
  }

  async setUri(
    connectionId: string,
    uri: string,
  ): Promise<Result<void, AppError>> {
    this.secrets.set(connectionId, uri);
    return ok(undefined);
  }
}

class FakeActiveConnection implements ActiveMongoConnection {
  closed = false;
  collections = new Map([
    [
      "app",
      [
        { name: "orders", type: "collection" as const },
        { name: "activeUsers", type: "view" as const },
        { name: "users", type: "collection" as const },
      ],
    ],
  ]);
  databases = ["admin", "app"];
  findInputs: unknown[] = [];
  aggregateInputs: unknown[] = [];
  indexInputs: unknown[] = [];
  pingCount = 0;
  updateInputs: unknown[] = [];

  async close(): Promise<void> {
    this.closed = true;
  }

  async aggregate(input: Parameters<ActiveMongoConnection["aggregate"]>[0]) {
    this.aggregateInputs.push(input);

    return {
      documents: ['{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"}}'],
      executionTimeMs: 4,
    };
  }

  async explainAggregate(
    input: Parameters<ActiveMongoConnection["explainAggregate"]>[0],
  ) {
    this.aggregateInputs.push(input);

    return {
      executionTimeMs: 2,
      plan: '{"stages":[]}',
    };
  }

  async explainFind(
    input: Parameters<ActiveMongoConnection["explainFind"]>[0],
  ) {
    this.findInputs.push(input);

    return {
      executionTimeMs: 2,
      plan: '{"queryPlanner":{"winningPlan":{"stage":"COLLSCAN"}}}',
    };
  }

  async findDocuments(
    input: Parameters<ActiveMongoConnection["findDocuments"]>[0],
  ) {
    this.findInputs.push(input);

    return {
      documents: ['{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"}}'],
      executionTimeMs: 3,
      hasMore: false,
    };
  }

  async listCollections(databaseName: string) {
    return this.collections.get(databaseName) ?? [];
  }

  async listDatabases(): Promise<string[]> {
    return this.databases;
  }

  async listIndexes(
    input: Parameters<ActiveMongoConnection["listIndexes"]>[0],
  ) {
    this.indexInputs.push(input);

    return [
      { key: '{"_id":{"$numberInt":"1"}}', meta: "Unique", name: "_id_" },
      {
        key: '{"email":{"$numberInt":"1"}}',
        meta: "Unique",
        name: "email_1",
      },
    ];
  }

  async manualWrite(
    input: Parameters<ActiveMongoConnection["manualWrite"]>[0],
  ) {
    this.updateInputs.push(input);

    if (!input.operation.startsWith("update")) {
      return {
        acknowledged: true,
        operation: input.operation,
      };
    }

    return {
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
      operation: input.operation,
    };
  }

  async updateDocument(
    input: Parameters<ActiveMongoConnection["updateDocument"]>[0],
  ) {
    this.updateInputs.push(input);

    return {
      matchedCount: 1,
      modifiedCount: 1,
    };
  }

  async ping(): Promise<void> {
    this.pingCount += 1;
  }
}

class FakeMongoDriver implements MongoConnectionDriver {
  readonly activeConnections: FakeActiveConnection[] = [];
  connectedUris: string[] = [];
  failPing = false;
  pingedUris: string[] = [];

  async connect(uri: string): Promise<ActiveMongoConnection> {
    this.connectedUris.push(uri);
    const connection = new FakeActiveConnection();
    this.activeConnections.push(connection);
    return connection;
  }

  async ping(uri: string): Promise<void> {
    this.pingedUris.push(uri);

    if (this.failPing) {
      throw new Error(`Unable to reach ${uri}`);
    }
  }
}

const createLifecycle = () => {
  const metadataStore = new InMemoryMetadataStore();
  const secretStore = new InMemorySecretStore();
  const driver = new FakeMongoDriver();
  const storage = new ConnectionStorageService(metadataStore, secretStore);
  const auditLog = new AuditLogService();
  const lifecycle = new ConnectionLifecycleService(storage, driver, auditLog);

  return { auditLog, driver, lifecycle, metadataStore, secretStore };
};

const createStoredConnection = (
  lifecycle: ConnectionLifecycleService,
  overrides: Partial<CreateStoredConnectionInput> = {},
) =>
  lifecycle.create({
    environment: "local",
    id: "conn_local",
    name: "Local MongoDB",
    readOnly: false,
    uri: mongoUri,
    ...overrides,
  });

describe("ConnectionLifecycleService", () => {
  it("creates profiles and returns summaries without secrets", async () => {
    const { lifecycle, secretStore } = createLifecycle();

    const result = await createStoredConnection(lifecycle);

    expect(result).toMatchObject({
      ok: true,
      value: {
        id: "conn_local",
        name: "Local MongoDB",
        status: "disconnected",
      },
    });
    expect(secretStore.secrets.get("conn_local")).toBe(mongoUri);
    expect(JSON.stringify(lifecycle.list())).not.toContain("super-secret");
  });

  it("tests saved profiles with MongoDB ping", async () => {
    const { driver, lifecycle, metadataStore } = createLifecycle();
    await createStoredConnection(lifecycle);

    const result = await lifecycle.test("conn_local");

    expect(result).toMatchObject({
      ok: true,
      value: {
        message: "MongoDB ping succeeded",
        ok: true,
      },
    });
    expect(driver.pingedUris).toEqual([mongoUri]);
    expect(metadataStore.metadata.get("conn_local")?.lastConnectedAt).toEqual(
      expect.any(String),
    );
    expect(lifecycle.get("conn_local")).toMatchObject({
      ok: true,
      value: { status: "disconnected" },
    });
  });

  it("tests draft input without reading or writing saved secrets", async () => {
    const { driver, lifecycle, secretStore } = createLifecycle();

    const result = await lifecycle.testInput({
      environment: "local",
      name: "Draft MongoDB",
      readOnly: true,
      uri: mongoUri,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        message: "MongoDB ping succeeded",
        ok: true,
      },
    });
    expect(driver.pingedUris).toEqual([mongoUri]);
    expect(secretStore.getCount).toBe(0);
    expect(secretStore.secrets.size).toBe(0);
  });

  it("sanitizes failed ping results and marks the profile as errored", async () => {
    const { driver, lifecycle, metadataStore } = createLifecycle();
    driver.failPing = true;
    await createStoredConnection(lifecycle);

    const result = await lifecycle.test("conn_local");

    expect(result).toMatchObject({
      ok: true,
      value: {
        ok: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain("super-secret");
    expect(
      metadataStore.metadata.get("conn_local")?.lastErrorMessage,
    ).not.toContain("super-secret");
    expect(lifecycle.get("conn_local")).toMatchObject({
      ok: true,
      value: { status: "error" },
    });
  });

  it("connects, disconnects, and closes active sessions", async () => {
    const { auditLog, driver, lifecycle } = createLifecycle();
    await createStoredConnection(lifecycle);

    const connectResult = await lifecycle.connect("conn_local");

    expect(connectResult).toMatchObject({
      ok: true,
      value: { status: "connected" },
    });
    expect(driver.connectedUris).toEqual([mongoUri]);

    const disconnectResult = await lifecycle.disconnect("conn_local");

    expect(disconnectResult).toMatchObject({
      ok: true,
      value: { status: "disconnected" },
    });
    expect(driver.activeConnections[0]?.closed).toBe(true);
    expect(auditLog.list().map((entry) => entry.action)).toEqual([
      "connection.created",
      "connection.connected",
      "connection.disconnected",
    ]);
  });

  it("lists databases and collections from active sessions", async () => {
    const { lifecycle } = createLifecycle();
    await createStoredConnection(lifecycle);
    await lifecycle.connect("conn_local");

    const databasesResult = lifecycle.listDatabases("conn_local");
    expect(databasesResult).toMatchObject({ ok: true });
    await expect(
      databasesResult.ok ? databasesResult.value : Promise.resolve([]),
    ).resolves.toEqual(["admin", "app"]);

    const collectionsResult = lifecycle.listCollections("conn_local", "app");
    expect(collectionsResult).toMatchObject({ ok: true });
    await expect(
      collectionsResult.ok ? collectionsResult.value : Promise.resolve([]),
    ).resolves.toEqual([
      { name: "orders", type: "collection" },
      { name: "activeUsers", type: "view" },
      { name: "users", type: "collection" },
    ]);
  });

  it("finds documents through active sessions and audits query metadata", async () => {
    const { auditLog, driver, lifecycle } = createLifecycle();
    await createStoredConnection(lifecycle);
    await lifecycle.connect("conn_local");

    const result = lifecycle.findDocuments("conn_local", {
      collection: "users",
      database: "app",
      filter: { status: "active" },
      limit: 50,
      projection: { email: 1 },
      skip: 0,
      sort: { createdAt: -1 },
    });

    expect(result).toMatchObject({ ok: true });
    await expect(
      result.ok
        ? result.value
        : Promise.resolve({
            documents: [],
            executionTimeMs: 0,
            hasMore: false,
          }),
    ).resolves.toMatchObject({
      documents: ['{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"}}'],
      hasMore: false,
    });
    expect(driver.activeConnections[0]?.findInputs).toEqual([
      {
        collection: "users",
        database: "app",
        filter: { status: "active" },
        limit: 50,
        projection: { email: 1 },
        skip: 0,
        sort: { createdAt: -1 },
      },
    ]);
    expect(
      auditLog.list().find((entry) => entry.action === "query.executed"),
    ).toMatchObject({
      action: "query.executed",
      connectionId: "conn_local",
      metadata: {
        executionTimeMs: 3,
        filterFields: ["status"],
        limit: 50,
        projectionFields: ["email"],
        resultCount: 1,
        sortFields: ["createdAt"],
      },
      target: "app.users",
    });
  });

  it("runs aggregation pipelines through active sessions and audits execution time", async () => {
    const { auditLog, driver, lifecycle } = createLifecycle();
    await createStoredConnection(lifecycle);
    await lifecycle.connect("conn_local");

    const result = lifecycle.aggregate("conn_local", {
      collection: "users",
      database: "app",
      limit: 25,
      pipeline: [
        { $match: { status: "active" } },
        { $project: { email: 1 } },
      ],
    });

    expect(result).toMatchObject({ ok: true });
    await expect(
      result.ok
        ? result.value
        : Promise.resolve({
            documents: [],
            executionTimeMs: 0,
          }),
    ).resolves.toEqual({
      documents: ['{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"}}'],
      executionTimeMs: 4,
    });
    expect(driver.activeConnections[0]?.aggregateInputs).toEqual([
      {
        collection: "users",
        database: "app",
        limit: 25,
        pipeline: [
          { $match: { status: "active" } },
          { $project: { email: 1 } },
        ],
      },
    ]);
    expect(
      auditLog
        .list()
        .find((entry) => entry.action === "aggregation.executed"),
    ).toMatchObject({
      action: "aggregation.executed",
      connectionId: "conn_local",
      metadata: {
        executionTimeMs: 4,
        limit: 25,
        resultCount: 1,
        stageCount: 2,
        stages: ["$match", "$project"],
      },
      target: "app.users",
    });
  });

  it("lists indexes through active sessions", async () => {
    const { driver, lifecycle } = createLifecycle();
    await createStoredConnection(lifecycle);
    await lifecycle.connect("conn_local");

    const result = lifecycle.listIndexes("conn_local", {
      collection: "users",
      database: "app",
    });

    expect(result).toMatchObject({ ok: true });
    await expect(
      result.ok ? result.value : Promise.resolve([]),
    ).resolves.toEqual([
      { key: '{"_id":{"$numberInt":"1"}}', meta: "Unique", name: "_id_" },
      {
        key: '{"email":{"$numberInt":"1"}}',
        meta: "Unique",
        name: "email_1",
      },
    ]);
    expect(driver.activeConnections[0]?.indexInputs).toEqual([
      {
        collection: "users",
        database: "app",
      },
    ]);
  });

  it("updates documents through active sessions", async () => {
    const { driver, lifecycle } = createLifecycle();
    await createStoredConnection(lifecycle);
    await lifecycle.connect("conn_local");

    const result = lifecycle.updateDocument("conn_local", {
      collection: "users",
      confirmedProductionWrite: false,
      database: "app",
      editedDocument:
        '{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"},"email":"updated@example.com"}',
      originalDocument:
        '{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"},"email":"old@example.com"}',
    });

    expect(result).toMatchObject({ ok: true });
    await expect(
      result.ok
        ? result.value
        : Promise.resolve({ matchedCount: 0, modifiedCount: 0 }),
    ).resolves.toEqual({
      matchedCount: 1,
      modifiedCount: 1,
    });
    expect(driver.activeConnections[0]?.updateInputs).toEqual([
      {
        collection: "users",
        confirmedProductionWrite: false,
        database: "app",
        editedDocument:
          '{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"},"email":"updated@example.com"}',
        originalDocument:
          '{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"},"email":"old@example.com"}',
      },
    ]);
  });

  it("parses EJSON update documents and rejects _id changes", () => {
    const parsed = parseMongoUpdateDocuments({
      collection: "users",
      confirmedProductionWrite: false,
      database: "app",
      editedDocument:
        '{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"},"loginCount":{"$numberInt":"2"}}',
      originalDocument:
        '{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"},"loginCount":{"$numberInt":"1"}}',
    });

    expect(parsed.editedDocument.loginCount).toMatchObject({ value: 2 });
    expect(() =>
      parseMongoUpdateDocuments({
        collection: "users",
        confirmedProductionWrite: false,
        database: "app",
        editedDocument:
          '{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b3"},"loginCount":{"$numberInt":"2"}}',
        originalDocument:
          '{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"},"loginCount":{"$numberInt":"1"}}',
      }),
    ).toThrow("_id changes are not allowed");
  });

  it("builds field-level document updates so projected saves preserve hidden fields", () => {
    const parsed = parseMongoUpdateDocuments({
      collection: "rooms",
      confirmedProductionWrite: false,
      database: "app",
      editedDocument:
        '{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"},"title":{"en":"New"},"visible":false}',
      originalDocument:
        '{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"},"title":{"en":"Old"},"visible":true}',
    });

    expect(buildMongoUpdateOperation(parsed)).toEqual({
      $set: {
        "title.en": "New",
        visible: false,
      },
    });
  });

  it("only unsets fields that were present in the loaded document", () => {
    const parsed = parseMongoUpdateDocuments({
      collection: "rooms",
      confirmedProductionWrite: false,
      database: "app",
      editedDocument: '{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"}}',
      originalDocument:
        '{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"},"projectedOnly":true}',
    });

    expect(buildMongoUpdateOperation(parsed)).toEqual({
      $unset: {
        projectedOnly: "",
      },
    });
  });

  it("rejects explorer reads without an active session", async () => {
    const { lifecycle } = createLifecycle();
    await createStoredConnection(lifecycle);

    expect(lifecycle.listDatabases("conn_local")).toMatchObject({
      ok: false,
      error: { code: "CONNECTION_NOT_ACTIVE" },
    });
    expect(lifecycle.listCollections("conn_local", "app")).toMatchObject({
      ok: false,
      error: { code: "CONNECTION_NOT_ACTIVE" },
    });
    expect(
      lifecycle.findDocuments("conn_local", {
        collection: "users",
        database: "app",
        filter: {},
        limit: 50,
        projection: {},
        skip: 0,
        sort: {},
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "CONNECTION_NOT_ACTIVE" },
    });
    expect(
      lifecycle.listIndexes("conn_local", {
        collection: "users",
        database: "app",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "CONNECTION_NOT_ACTIVE" },
    });
    expect(
      lifecycle.aggregate("conn_local", {
        collection: "users",
        database: "app",
        limit: 50,
        pipeline: [{ $match: {} }],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "CONNECTION_NOT_ACTIVE" },
    });
    expect(
      lifecycle.updateDocument("conn_local", {
        collection: "users",
        confirmedProductionWrite: false,
        database: "app",
        editedDocument: "{}",
        originalDocument: "{}",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "CONNECTION_NOT_ACTIVE" },
    });
  });

  it("blocks document writes on read-only connections and audits the attempt", async () => {
    const { auditLog, driver, lifecycle } = createLifecycle();
    await createStoredConnection(lifecycle, { readOnly: true });
    await lifecycle.connect("conn_local");

    const result = lifecycle.updateDocument("conn_local", {
      collection: "users",
      confirmedProductionWrite: false,
      database: "app",
      editedDocument:
        '{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"},"email":"updated@example.com"}',
      originalDocument:
        '{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"},"email":"old@example.com"}',
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "READ_ONLY_VIOLATION" },
    });
    expect(driver.activeConnections[0]?.updateInputs).toEqual([]);
    expect(
      auditLog
        .list()
        .filter((entry) => entry.action.startsWith("document.write.")),
    ).toMatchObject([
      {
        action: "document.write.attempted",
        connectionId: "conn_local",
        metadata: { readOnly: true },
        target: "app.users",
      },
      {
        action: "document.write.blocked",
        connectionId: "conn_local",
        metadata: { reason: "read_only" },
        target: "app.users",
      },
    ]);
  });

  it("requires explicit confirmation before production document writes", async () => {
    const { auditLog, driver, lifecycle } = createLifecycle();
    await createStoredConnection(lifecycle, { environment: "production" });
    await lifecycle.connect("conn_local");

    const unconfirmed = lifecycle.updateDocument("conn_local", {
      collection: "users",
      confirmedProductionWrite: false,
      database: "app",
      editedDocument:
        '{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"},"email":"updated@example.com"}',
      originalDocument:
        '{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"},"email":"old@example.com"}',
    });

    expect(unconfirmed).toMatchObject({
      ok: false,
      error: { code: "WRITE_CONFIRMATION_REQUIRED" },
    });

    const confirmed = lifecycle.updateDocument("conn_local", {
      collection: "users",
      confirmedProductionWrite: true,
      database: "app",
      editedDocument:
        '{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"},"email":"updated@example.com"}',
      originalDocument:
        '{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"},"email":"old@example.com"}',
    });

    expect(confirmed).toMatchObject({ ok: true });
    await expect(
      confirmed.ok
        ? confirmed.value
        : Promise.resolve({ matchedCount: 0, modifiedCount: 0 }),
    ).resolves.toEqual({
      matchedCount: 1,
      modifiedCount: 1,
    });
    expect(driver.activeConnections[0]?.updateInputs).toEqual([
      {
        collection: "users",
        confirmedProductionWrite: true,
        database: "app",
        editedDocument:
          '{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"},"email":"updated@example.com"}',
        originalDocument:
          '{"_id":{"$oid":"6649f8c3e7b1d2a4f8c9a1b2"},"email":"old@example.com"}',
      },
    ]);
    expect(
      auditLog
        .list()
        .filter((entry) => entry.action.startsWith("document.write."))
        .map((entry) => entry.action),
    ).toEqual([
      "document.write.attempted",
      "document.write.blocked",
      "document.write.attempted",
      "document.write.completed",
    ]);
  });

  it("closes active sessions before update and delete", async () => {
    const { auditLog, driver, lifecycle, metadataStore, secretStore } =
      createLifecycle();
    await createStoredConnection(lifecycle);
    await lifecycle.connect("conn_local");

    const updateResult = await lifecycle.update("conn_local", {
      name: "Updated Local",
      uri: "mongodb://localhost:27018/admin",
    });

    expect(updateResult).toMatchObject({
      ok: true,
      value: {
        name: "Updated Local",
        status: "disconnected",
      },
    });
    expect(driver.activeConnections[0]?.closed).toBe(true);
    expect(secretStore.secrets.get("conn_local")).toBe(
      "mongodb://localhost:27018/admin",
    );

    await lifecycle.connect("conn_local");
    const deleteResult = await lifecycle.delete("conn_local");

    expect(deleteResult.ok).toBe(true);
    expect(driver.activeConnections[1]?.closed).toBe(true);
    expect(metadataStore.metadata.has("conn_local")).toBe(false);
    expect(secretStore.secrets.has("conn_local")).toBe(false);
    expect(auditLog.list().map((entry) => entry.action)).toContain(
      "connection.updated",
    );
    expect(auditLog.list().map((entry) => entry.action)).toContain(
      "connection.deleted",
    );
    expect(JSON.stringify(auditLog.list())).not.toContain("27018");
  });
});
