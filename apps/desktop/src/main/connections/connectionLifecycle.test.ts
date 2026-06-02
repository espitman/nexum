import { AppError, err, ok, type Result } from "@nexum/shared";
import { describe, expect, it } from "vitest";
import {
  ConnectionLifecycleService,
  type ActiveMongoConnection,
  type MongoConnectionDriver,
} from "./connectionLifecycle";
import type { ConnectionMetadataRepository } from "./connectionMetadataStore";
import { ConnectionStorageService } from "./connectionStorage";
import type { ConnectionSecretRepository } from "./keychainSecretStore";
import type { StoredConnectionMetadata } from "./types";

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

  async getUri(connectionId: string): Promise<Result<string, AppError>> {
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
  pingCount = 0;

  async close(): Promise<void> {
    this.closed = true;
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
  const lifecycle = new ConnectionLifecycleService(storage, driver);

  return { driver, lifecycle, metadataStore, secretStore };
};

const createStoredConnection = (lifecycle: ConnectionLifecycleService) =>
  lifecycle.create({
    environment: "local",
    id: "conn_local",
    name: "Local MongoDB",
    readOnly: false,
    uri: mongoUri,
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
    const { driver, lifecycle } = createLifecycle();
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
  });

  it("closes active sessions before update and delete", async () => {
    const { driver, lifecycle, metadataStore, secretStore } = createLifecycle();
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
  });
});
