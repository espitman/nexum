import {
  AppError,
  err,
  nowIso,
  ok,
  sanitizeError,
  type Result,
} from "@nexum/shared";
import { AuditLogService, type AuditLogAction } from "@nexum/core";
import {
  BSON,
  MongoClient,
  type Document,
  type Filter,
  type Sort,
} from "mongodb";
import type { ConnectionStorageService } from "./connectionStorage";
import type {
  ConnectionRuntimeStatus,
  CreateStoredConnectionInput,
  StoredConnectionMetadata,
  StoredConnectionSummary,
  StoredConnectionTestResult,
  UpdateStoredConnectionInput,
} from "./types";

export type MongoCollectionKind = "collection" | "view";

export type MongoCollectionMetadata = {
  name: string;
  type: MongoCollectionKind;
};

export type MongoFindDocumentsInput = {
  collection: string;
  database: string;
  filter: Record<string, unknown>;
  limit: number;
  projection: Record<string, unknown>;
  skip: number;
  sort: Record<string, 1 | -1>;
};

export type MongoFindDocumentsResult = {
  documents: string[];
  executionTimeMs: number;
  hasMore: boolean;
};

export type MongoAggregateInput = {
  collection: string;
  database: string;
  limit: number;
  pipeline: Record<string, unknown>[];
};

export type MongoAggregateResult = {
  documents: string[];
  executionTimeMs: number;
};

export type MongoUpdateDocumentInput = {
  collection: string;
  confirmedProductionWrite: boolean;
  database: string;
  editedDocument: string;
  originalDocument: string;
};

export type MongoUpdateDocumentResult = {
  matchedCount: number;
  modifiedCount: number;
};

export type MongoListIndexesInput = {
  collection: string;
  database: string;
};

export type MongoIndexMetadata = {
  key: string;
  meta: string;
  name: string;
};

export interface ActiveMongoConnection {
  aggregate(input: MongoAggregateInput): Promise<MongoAggregateResult>;
  close(): Promise<void>;
  findDocuments(
    input: MongoFindDocumentsInput,
  ): Promise<MongoFindDocumentsResult>;
  listCollections(databaseName: string): Promise<MongoCollectionMetadata[]>;
  listDatabases(): Promise<string[]>;
  listIndexes(input: MongoListIndexesInput): Promise<MongoIndexMetadata[]>;
  ping(): Promise<void>;
  updateDocument(
    input: MongoUpdateDocumentInput,
  ): Promise<MongoUpdateDocumentResult>;
}

export interface MongoConnectionDriver {
  connect(uri: string): Promise<ActiveMongoConnection>;
  ping(uri: string): Promise<void>;
}

const mongoClientOptions = {
  appName: "Nexum",
  serverSelectionTimeoutMS: 5000,
};

const mongoFindMaxTimeMs = 30_000;

export const parseMongoUpdateDocuments = ({
  editedDocument,
  originalDocument,
}: MongoUpdateDocumentInput): {
  editedDocument: Document;
  originalDocument: Document;
} => {
  const original = parseEjsonDocument(originalDocument, "original document");
  const edited = parseEjsonDocument(editedDocument, "edited document");

  if (!("_id" in original)) {
    throw new AppError(
      "DOCUMENT_ID_MISSING",
      "Original document is missing _id",
    );
  }

  if (!("_id" in edited)) {
    throw new AppError("DOCUMENT_ID_MISSING", "Edited document is missing _id");
  }

  if (!areBsonValuesEqual(original._id, edited._id)) {
    throw new AppError("DOCUMENT_ID_CHANGED", "_id changes are not allowed");
  }

  return {
    editedDocument: edited,
    originalDocument: original,
  };
};

type MongoUpdateOperation = {
  $set?: Record<string, unknown>;
  $unset?: Record<string, "">;
};

export const buildMongoUpdateOperation = ({
  editedDocument,
  originalDocument,
}: {
  editedDocument: Document;
  originalDocument: Document;
}): MongoUpdateOperation | null => {
  const operation: MongoUpdateOperation = {};

  collectDocumentChanges({
    editedValue: withoutId(editedDocument),
    originalValue: withoutId(originalDocument),
    operation,
    path: "",
  });

  if (!operation.$set && !operation.$unset) {
    return null;
  }

  return operation;
};

const parseEjsonDocument = (value: string, label: string): Document => {
  try {
    const parsed = BSON.EJSON.parse(value, { relaxed: false }) as unknown;

    if (!isMongoDocument(parsed)) {
      throw new Error(`${label} must be an object`);
    }

    return parsed;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      "DOCUMENT_EJSON_INVALID",
      `Unable to parse ${label} as EJSON`,
    );
  }
};

const isMongoDocument = (value: unknown): value is Document =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const areBsonValuesEqual = (left: unknown, right: unknown): boolean =>
  BSON.EJSON.stringify(left, { relaxed: false }) ===
  BSON.EJSON.stringify(right, { relaxed: false });

const withoutId = (document: Document): Document => {
  const rest = { ...document };
  delete rest._id;

  return rest;
};

const collectDocumentChanges = ({
  editedValue,
  originalValue,
  operation,
  path,
}: {
  editedValue: unknown;
  originalValue: unknown;
  operation: MongoUpdateOperation;
  path: string;
}): void => {
  if (!isPlainObject(originalValue) || !isPlainObject(editedValue)) {
    if (path && !areBsonValuesEqual(originalValue, editedValue)) {
      operation.$set = {
        ...operation.$set,
        [path]: editedValue,
      };
    }

    return;
  }

  const keys = new Set([
    ...Object.keys(originalValue),
    ...Object.keys(editedValue),
  ]);

  for (const key of keys) {
    const nextPath = path ? `${path}.${key}` : key;
    const hasOriginal = Object.prototype.hasOwnProperty.call(
      originalValue,
      key,
    );
    const hasEdited = Object.prototype.hasOwnProperty.call(editedValue, key);

    if (!hasEdited && hasOriginal) {
      operation.$unset = {
        ...operation.$unset,
        [nextPath]: "",
      };
      continue;
    }

    if (hasEdited && !hasOriginal) {
      operation.$set = {
        ...operation.$set,
        [nextPath]: editedValue[key],
      };
      continue;
    }

    collectDocumentChanges({
      editedValue: editedValue[key],
      originalValue: originalValue[key],
      operation,
      path: nextPath,
    });
  }
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
};

export class MongoDriverConnectionClient implements MongoConnectionDriver {
  async connect(uri: string): Promise<ActiveMongoConnection> {
    const client = new MongoClient(uri, mongoClientOptions);
    await client.connect();
    await pingClient(client);

    return {
      async aggregate(input) {
        const startedAt = performance.now();
        const documents = await client
          .db(input.database)
          .collection(input.collection)
          .aggregate(input.pipeline as Document[], {
            allowDiskUse: false,
            maxTimeMS: mongoFindMaxTimeMs,
          })
          .limit(input.limit)
          .toArray();

        return {
          documents: documents.map((document) =>
            BSON.EJSON.stringify(document, { relaxed: false }),
          ),
          executionTimeMs: Math.round(performance.now() - startedAt),
        };
      },
      close: () => client.close(true),
      async findDocuments(input) {
        const startedAt = performance.now();
        const documents = await client
          .db(input.database)
          .collection(input.collection)
          .find(input.filter as Filter<Document>, {
            maxTimeMS: mongoFindMaxTimeMs,
            projection: input.projection,
          })
          .sort(input.sort as Sort)
          .skip(input.skip)
          .limit(input.limit + 1)
          .toArray();
        const hasMore = documents.length > input.limit;

        return {
          documents: documents
            .slice(0, input.limit)
            .map((document) =>
              BSON.EJSON.stringify(document, { relaxed: false }),
            ),
          executionTimeMs: Math.round(performance.now() - startedAt),
          hasMore,
        };
      },
      async listCollections(databaseName) {
        const collections = await client
          .db(databaseName)
          .listCollections({}, { nameOnly: true })
          .toArray();

        return collections
          .map(
            (collection): MongoCollectionMetadata => ({
              name: collection.name,
              type: collection.type === "view" ? "view" : "collection",
            }),
          )
          .sort((left, right) => left.name.localeCompare(right.name));
      },
      async listDatabases() {
        const result = await client
          .db("admin")
          .admin()
          .listDatabases({ nameOnly: true });

        return result.databases
          .map((database) => database.name)
          .sort((left, right) => left.localeCompare(right));
      },
      async listIndexes(input) {
        const indexes = await client
          .db(input.database)
          .collection(input.collection)
          .listIndexes()
          .toArray();

        return indexes.map((index) => ({
          key: BSON.EJSON.stringify(index.key ?? {}, { relaxed: false }),
          meta: formatIndexMetadata(index),
          name: index.name ?? "unnamed",
        }));
      },
      async ping() {
        await pingClient(client);
      },
      async updateDocument(input) {
        const { editedDocument, originalDocument } =
          parseMongoUpdateDocuments(input);
        const updateOperation = buildMongoUpdateOperation({
          editedDocument,
          originalDocument,
        });

        if (!updateOperation) {
          return {
            matchedCount: 1,
            modifiedCount: 0,
          };
        }

        const result = await client
          .db(input.database)
          .collection(input.collection)
          .updateOne({ _id: originalDocument._id }, updateOperation);

        return {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
        };
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
  readonly #auditLog: AuditLogService;
  readonly #driver: MongoConnectionDriver;
  readonly #sessions = new Map<string, ActiveMongoConnection>();
  readonly #statuses = new Map<string, ConnectionRuntimeStatus>();
  readonly #storage: ConnectionStorageService;

  constructor(
    storage: ConnectionStorageService,
    driver: MongoConnectionDriver = new MongoDriverConnectionClient(),
    auditLog: AuditLogService = new AuditLogService(),
  ) {
    this.#auditLog = auditLog;
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

  findDocuments(
    connectionId: string,
    input: MongoFindDocumentsInput,
  ): Result<Promise<MongoFindDocumentsResult>, AppError> {
    const session = this.#sessions.get(connectionId);

    if (!session) {
      return err(
        new AppError("CONNECTION_NOT_ACTIVE", "Connection is not active", {
          details: { connectionId },
        }),
      );
    }

    return ok(session.findDocuments(input));
  }

  aggregate(
    connectionId: string,
    input: MongoAggregateInput,
  ): Result<Promise<MongoAggregateResult>, AppError> {
    const session = this.#sessions.get(connectionId);

    if (!session) {
      return err(
        new AppError("CONNECTION_NOT_ACTIVE", "Connection is not active", {
          details: { connectionId },
        }),
      );
    }

    return ok(session.aggregate(input));
  }

  list(): StoredConnectionSummary[] {
    return this.#storage
      .listMetadata()
      .map((metadata) => this.#toSummary(metadata));
  }

  listCollections(
    connectionId: string,
    databaseName: string,
  ): Result<Promise<MongoCollectionMetadata[]>, AppError> {
    const session = this.#sessions.get(connectionId);

    if (!session) {
      return err(
        new AppError("CONNECTION_NOT_ACTIVE", "Connection is not active", {
          details: { connectionId },
        }),
      );
    }

    return ok(session.listCollections(databaseName));
  }

  listDatabases(connectionId: string): Result<Promise<string[]>, AppError> {
    const session = this.#sessions.get(connectionId);

    if (!session) {
      return err(
        new AppError("CONNECTION_NOT_ACTIVE", "Connection is not active", {
          details: { connectionId },
        }),
      );
    }

    return ok(session.listDatabases());
  }

  listIndexes(
    connectionId: string,
    input: MongoListIndexesInput,
  ): Result<Promise<MongoIndexMetadata[]>, AppError> {
    const session = this.#sessions.get(connectionId);

    if (!session) {
      return err(
        new AppError("CONNECTION_NOT_ACTIVE", "Connection is not active", {
          details: { connectionId },
        }),
      );
    }

    return ok(session.listIndexes(input));
  }

  updateDocument(
    connectionId: string,
    input: MongoUpdateDocumentInput,
  ): Result<Promise<MongoUpdateDocumentResult>, AppError> {
    const metadata = this.#storage.getMetadata(connectionId);

    if (!metadata.ok) {
      return metadata;
    }

    const target = `${input.database}.${input.collection}`;
    this.#recordDocumentWrite(metadata.value, "document.write.attempted", {
      target,
      metadata: {
        environment: metadata.value.environment,
        readOnly: metadata.value.readOnly,
      },
    });

    if (metadata.value.readOnly) {
      this.#recordDocumentWrite(metadata.value, "document.write.blocked", {
        target,
        metadata: { reason: "read_only" },
      });

      return err(
        new AppError("READ_ONLY_VIOLATION", "Connection is read-only", {
          details: { connectionId },
        }),
      );
    }

    if (
      metadata.value.environment === "production" &&
      !input.confirmedProductionWrite
    ) {
      this.#recordDocumentWrite(metadata.value, "document.write.blocked", {
        target,
        metadata: {
          environment: metadata.value.environment,
          reason: "production_confirmation_required",
        },
      });

      return err(
        new AppError(
          "WRITE_CONFIRMATION_REQUIRED",
          "Production writes require confirmation",
          {
            details: {
              connectionId,
              environment: metadata.value.environment,
            },
          },
        ),
      );
    }

    const session = this.#sessions.get(connectionId);

    if (!session) {
      this.#recordDocumentWrite(metadata.value, "document.write.blocked", {
        target,
        metadata: { reason: "connection_not_active" },
      });

      return err(
        new AppError("CONNECTION_NOT_ACTIVE", "Connection is not active", {
          details: { connectionId },
        }),
      );
    }

    return ok(
      session
        .updateDocument(input)
        .then((result) => {
          this.#recordDocumentWrite(
            metadata.value,
            "document.write.completed",
            {
              target,
              metadata: {
                matchedCount: result.matchedCount,
                modifiedCount: result.modifiedCount,
              },
            },
          );

          return result;
        })
        .catch((error: unknown) => {
          this.#recordDocumentWrite(metadata.value, "document.write.blocked", {
            target,
            metadata: {
              error: sanitizeError(error),
              reason: "driver_error",
            },
          });

          throw error;
        }),
    );
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

  #recordDocumentWrite(
    connection: StoredConnectionMetadata,
    action: AuditLogAction,
    input: {
      metadata?: Record<string, unknown>;
      target: string;
    },
  ): void {
    this.#auditLog.record({
      action,
      connectionId: connection.id,
      pluginId: connection.pluginId,
      target: input.target,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    });
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

const formatIndexMetadata = (index: Document): string => {
  const details: string[] = [];
  const key = index.key;

  if (index.unique === true) {
    details.push("Unique");
  }

  if (index.sparse === true) {
    details.push("Sparse");
  }

  if (typeof index.expireAfterSeconds === "number") {
    details.push(`TTL ${index.expireAfterSeconds}s`);
  }

  if (
    key &&
    typeof key === "object" &&
    !Array.isArray(key) &&
    Object.keys(key).length > 1
  ) {
    details.push("Compound");
  }

  return details.length > 0 ? details.join(" · ") : "Standard";
};
