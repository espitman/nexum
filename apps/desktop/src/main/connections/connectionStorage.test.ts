import { AppError, err, ok, type Result } from "@nexum/shared";
import { describe, expect, it } from "vitest";
import type { ConnectionMetadataRepository } from "./connectionMetadataStore";
import { ConnectionStorageService } from "./connectionStorage";
import type { ConnectionSecretRepository } from "./keychainSecretStore";
import type { StoredConnectionMetadata } from "./types";

const mongoUri =
  "mongodb+srv://nexum-user:super-secret@cluster0.example.net/admin";

class InMemoryMetadataStore implements ConnectionMetadataRepository {
  readonly metadata = new Map<string, StoredConnectionMetadata>();

  get(connectionId: string): Result<StoredConnectionMetadata, AppError> {
    const metadata = this.metadata.get(connectionId);

    if (!metadata) {
      return err(
        new AppError("CONNECTION_NOT_FOUND", "Connection was not found", {
          details: { connectionId },
        }),
      );
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
      return err(new AppError("SECRET_NOT_FOUND", "Secret was not found"));
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

class FailingSecretStore extends InMemorySecretStore {
  async setUri(): Promise<Result<void, AppError>> {
    return err(
      new AppError("UNKNOWN", `Keychain refused ${mongoUri}`, {
        details: {
          connectionId: "conn_failure",
          uri: mongoUri,
        },
      }),
    );
  }
}

describe("ConnectionStorageService", () => {
  it("stores metadata separately from the MongoDB URI", async () => {
    const metadataStore = new InMemoryMetadataStore();
    const secretStore = new InMemorySecretStore();
    const storage = new ConnectionStorageService(metadataStore, secretStore);

    const result = await storage.create({
      environment: "production",
      id: "conn_mongodb_prod",
      name: "MongoDB Production",
      readOnly: true,
      uri: mongoUri,
    });

    expect(result.ok).toBe(true);
    expect(secretStore.secrets.get("conn_mongodb_prod")).toBe(mongoUri);
    expect(
      JSON.stringify(metadataStore.metadata.get("conn_mongodb_prod")),
    ).not.toContain("super-secret");
    expect(JSON.stringify(storage.listMetadata())).not.toContain(mongoUri);
  });

  it("updates URI in the secret store without adding it to metadata", async () => {
    const metadataStore = new InMemoryMetadataStore();
    const secretStore = new InMemorySecretStore();
    const storage = new ConnectionStorageService(metadataStore, secretStore);
    await storage.create({
      environment: "development",
      id: "conn_mongodb_dev",
      name: "MongoDB Dev",
      readOnly: false,
      uri: mongoUri,
    });

    const nextUri = "mongodb://localhost:27017/admin";
    const result = await storage.update("conn_mongodb_dev", {
      name: "MongoDB Local",
      uri: nextUri,
    });

    expect(result.ok).toBe(true);
    expect(secretStore.secrets.get("conn_mongodb_dev")).toBe(nextUri);
    expect(metadataStore.metadata.get("conn_mongodb_dev")).toMatchObject({
      id: "conn_mongodb_dev",
      name: "MongoDB Local",
    });
    expect(
      JSON.stringify(metadataStore.metadata.get("conn_mongodb_dev")),
    ).not.toContain(nextUri);
  });

  it("deletes metadata and keychain URI together", async () => {
    const metadataStore = new InMemoryMetadataStore();
    const secretStore = new InMemorySecretStore();
    const storage = new ConnectionStorageService(metadataStore, secretStore);
    await storage.create({
      environment: "local",
      id: "conn_mongodb_local",
      name: "Local",
      readOnly: false,
      uri: mongoUri,
    });

    const result = await storage.delete("conn_mongodb_local");

    expect(result.ok).toBe(true);
    expect(metadataStore.metadata.has("conn_mongodb_local")).toBe(false);
    expect(secretStore.secrets.has("conn_mongodb_local")).toBe(false);
  });

  it("sanitizes keychain errors before serialization", async () => {
    const storage = new ConnectionStorageService(
      new InMemoryMetadataStore(),
      new FailingSecretStore(),
    );

    const result = await storage.create({
      environment: "production",
      id: "conn_failure",
      name: "MongoDB Failure",
      readOnly: true,
      uri: mongoUri,
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(JSON.stringify(result.error.serialize())).not.toContain(
        "super-secret",
      );
      expect(JSON.stringify(result.error.serialize())).not.toContain(mongoUri);
    }
  });
});
