import {
  AppError,
  err,
  nowIso,
  ok,
  sanitizeError,
  type Result,
} from "@nexum/shared";
import { MongoClient } from "mongodb";
import type { ConnectionStorageService } from "./connectionStorage";
import type {
  ConnectionRuntimeStatus,
  CreateStoredConnectionInput,
  StoredConnectionMetadata,
  StoredConnectionSummary,
  StoredConnectionTestResult,
  UpdateStoredConnectionInput,
} from "./types";

export interface ActiveMongoConnection {
  close(): Promise<void>;
  ping(): Promise<void>;
}

export interface MongoConnectionDriver {
  connect(uri: string): Promise<ActiveMongoConnection>;
  ping(uri: string): Promise<void>;
}

const mongoClientOptions = {
  appName: "Nexum",
  serverSelectionTimeoutMS: 5000,
};

export class MongoDriverConnectionClient implements MongoConnectionDriver {
  async connect(uri: string): Promise<ActiveMongoConnection> {
    const client = new MongoClient(uri, mongoClientOptions);
    await client.connect();
    await pingClient(client);

    return {
      close: () => client.close(true),
      async ping() {
        await pingClient(client);
      },
    };
  }

  async ping(uri: string): Promise<void> {
    const client = new MongoClient(uri, mongoClientOptions);

    try {
      await client.connect();
      await pingClient(client);
    } finally {
      await client.close(true);
    }
  }
}

export class ConnectionLifecycleService {
  readonly #driver: MongoConnectionDriver;
  readonly #sessions = new Map<string, ActiveMongoConnection>();
  readonly #statuses = new Map<string, ConnectionRuntimeStatus>();
  readonly #storage: ConnectionStorageService;

  constructor(
    storage: ConnectionStorageService,
    driver: MongoConnectionDriver = new MongoDriverConnectionClient(),
  ) {
    this.#driver = driver;
    this.#storage = storage;
  }

  async connect(
    connectionId: string,
  ): Promise<Result<StoredConnectionSummary, AppError>> {
    const metadata = this.#storage.getMetadata(connectionId);

    if (!metadata.ok) {
      return metadata;
    }

    const uri = await this.#storage.getUri(connectionId);

    if (!uri.ok) {
      return uri;
    }

    await this.#closeSession(connectionId);
    this.#setStatus(connectionId, "checking");

    try {
      const client = await this.#driver.connect(uri.value);
      this.#sessions.set(connectionId, client);
      this.#setStatus(connectionId, "connected");
      const updated = await this.#markConnectionSuccess(connectionId);

      if (!updated.ok) {
        return updated;
      }

      return ok(this.#toSummary(updated.value));
    } catch (error) {
      return this.#recordConnectionError(connectionId, error);
    }
  }

  async create(
    input: CreateStoredConnectionInput,
  ): Promise<Result<StoredConnectionSummary, AppError>> {
    const result = await this.#storage.create(input);

    if (!result.ok) {
      return result;
    }

    this.#setStatus(result.value.id, "disconnected");
    return ok(this.#toSummary(result.value));
  }

  async delete(
    connectionId: string,
  ): Promise<Result<StoredConnectionSummary, AppError>> {
    const metadata = this.#storage.getMetadata(connectionId);

    if (!metadata.ok) {
      return metadata;
    }

    const summary = this.#toSummary(metadata.value);
    const closeResult = await this.#closeSession(connectionId);

    if (!closeResult.ok) {
      return closeResult;
    }

    const deleted = await this.#storage.delete(connectionId);

    if (!deleted.ok) {
      return deleted;
    }

    this.#statuses.delete(connectionId);
    return ok(summary);
  }

  async disconnect(
    connectionId: string,
  ): Promise<Result<StoredConnectionSummary, AppError>> {
    const metadata = this.#storage.getMetadata(connectionId);

    if (!metadata.ok) {
      return metadata;
    }

    const closeResult = await this.#closeSession(connectionId);

    if (!closeResult.ok) {
      return closeResult;
    }

    this.#setStatus(connectionId, "disconnected");
    return ok(this.#toSummary(metadata.value));
  }

  get(connectionId: string): Result<StoredConnectionSummary, AppError> {
    const metadata = this.#storage.getMetadata(connectionId);

    if (!metadata.ok) {
      return metadata;
    }

    return ok(this.#toSummary(metadata.value));
  }

  list(): StoredConnectionSummary[] {
    return this.#storage
      .listMetadata()
      .map((metadata) => this.#toSummary(metadata));
  }

  async test(
    connectionId: string,
  ): Promise<Result<StoredConnectionTestResult, AppError>> {
    const metadata = this.#storage.getMetadata(connectionId);

    if (!metadata.ok) {
      return metadata;
    }

    const uri = await this.#storage.getUri(connectionId);

    if (!uri.ok) {
      return uri;
    }

    this.#setStatus(connectionId, "checking");
    const startedAt = performance.now();

    try {
      await this.#driver.ping(uri.value);
      const latencyMs = Math.round(performance.now() - startedAt);
      const updated = await this.#markConnectionSuccess(connectionId);

      if (!updated.ok) {
        return updated;
      }

      this.#setStatus(
        connectionId,
        this.#sessions.has(connectionId) ? "connected" : "disconnected",
      );

      return ok({
        latencyMs,
        message: "MongoDB ping succeeded",
        ok: true,
      });
    } catch (error) {
      const message = sanitizeError(error).message;
      await this.#storage.update(connectionId, {
        lastErrorMessage: message,
      });
      this.#setStatus(connectionId, "error");

      return ok({
        message,
        ok: false,
      });
    }
  }

  async testInput(
    input: CreateStoredConnectionInput,
  ): Promise<Result<StoredConnectionTestResult, AppError>> {
    const startedAt = performance.now();

    try {
      await this.#driver.ping(input.uri);
      return ok({
        latencyMs: Math.round(performance.now() - startedAt),
        message: "MongoDB ping succeeded",
        ok: true,
      });
    } catch (error) {
      return ok({
        message: sanitizeError(error).message,
        ok: false,
      });
    }
  }

  async update(
    connectionId: string,
    patch: UpdateStoredConnectionInput,
  ): Promise<Result<StoredConnectionSummary, AppError>> {
    const closeResult = await this.#closeSession(connectionId);

    if (!closeResult.ok) {
      return closeResult;
    }

    const result = await this.#storage.update(connectionId, patch);

    if (!result.ok) {
      return result;
    }

    this.#setStatus(connectionId, "disconnected");
    return ok(this.#toSummary(result.value));
  }

  async #closeSession(connectionId: string): Promise<Result<void, AppError>> {
    const session = this.#sessions.get(connectionId);

    if (!session) {
      return ok(undefined);
    }

    try {
      await session.close();
      this.#sessions.delete(connectionId);
      return ok(undefined);
    } catch (error) {
      return err(
        new AppError("UNKNOWN", "Unable to close MongoDB connection", {
          cause: error,
          details: { connectionId },
        }),
      );
    }
  }

  async #markConnectionSuccess(
    connectionId: string,
  ): Promise<Result<StoredConnectionMetadata, AppError>> {
    return this.#storage.update(connectionId, {
      lastConnectedAt: nowIso(),
      lastErrorMessage: null,
    });
  }

  async #recordConnectionError(
    connectionId: string,
    error: unknown,
  ): Promise<Result<StoredConnectionSummary, AppError>> {
    const message = sanitizeError(error).message;
    await this.#storage.update(connectionId, {
      lastErrorMessage: message,
    });
    this.#setStatus(connectionId, "error");

    return err(
      new AppError("UNKNOWN", "Unable to connect MongoDB profile", {
        cause: error,
        details: { connectionId },
      }),
    );
  }

  #setStatus(connectionId: string, status: ConnectionRuntimeStatus): void {
    this.#statuses.set(connectionId, status);
  }

  #toSummary(metadata: StoredConnectionMetadata): StoredConnectionSummary {
    return {
      ...metadata,
      status:
        this.#statuses.get(metadata.id) ??
        (metadata.lastErrorMessage ? "error" : "disconnected"),
    };
  }
}

const pingClient = async (client: MongoClient): Promise<void> => {
  await client.db("admin").command({ ping: 1 });
};
