import { AppError, createId, err, nowIso, type Result } from "@nexum/shared";
import {
  connectionNotFoundError,
  type ConnectionMetadataRepository,
} from "./connectionMetadataStore";
import type { ConnectionSecretRepository } from "./keychainSecretStore";
import type {
  CreateStoredConnectionInput,
  StoredConnectionMetadata,
  UpdateStoredConnectionInput,
} from "./types";

export class ConnectionStorageService {
  readonly #metadataStore: ConnectionMetadataRepository;
  readonly #secretStore: ConnectionSecretRepository;

  constructor(
    metadataStore: ConnectionMetadataRepository,
    secretStore: ConnectionSecretRepository,
  ) {
    this.#metadataStore = metadataStore;
    this.#secretStore = secretStore;
  }

  async create(
    input: CreateStoredConnectionInput,
  ): Promise<Result<StoredConnectionMetadata, AppError>> {
    const timestamp = nowIso();
    const metadata: StoredConnectionMetadata = {
      createdAt: timestamp,
      environment: input.environment,
      id: input.id ?? createId("conn"),
      name: input.name,
      pluginId: input.pluginId ?? "mongodb",
      readOnly: input.readOnly,
      updatedAt: timestamp,
    };
    const existing = this.#metadataStore.get(metadata.id);

    if (existing.ok) {
      return err(
        new AppError(
          "CONNECTION_ALREADY_EXISTS",
          `Connection "${metadata.id}" already exists`,
          { details: { connectionId: metadata.id } },
        ),
      );
    }

    const secretResult = await this.#secretStore.setUri(metadata.id, input.uri);

    if (!secretResult.ok) {
      return secretResult;
    }

    const metadataResult = this.#metadataStore.set(metadata);

    if (!metadataResult.ok) {
      await this.#secretStore.removeUri(metadata.id);
      return metadataResult;
    }

    return metadataResult;
  }

  async delete(
    connectionId: string,
  ): Promise<Result<StoredConnectionMetadata, AppError>> {
    const current = this.#metadataStore.get(connectionId);

    if (!current.ok) {
      return current;
    }

    const secretResult = await this.#secretStore.removeUri(connectionId);

    if (!secretResult.ok) {
      return secretResult;
    }

    return this.#metadataStore.remove(connectionId);
  }

  getMetadata(
    connectionId: string,
  ): Result<StoredConnectionMetadata, AppError> {
    return this.#metadataStore.get(connectionId);
  }

  getUri(connectionId: string): Promise<Result<string, AppError>> {
    return this.#secretStore.getUri(connectionId);
  }

  listMetadata(): StoredConnectionMetadata[] {
    return this.#metadataStore.list();
  }

  async update(
    connectionId: string,
    patch: UpdateStoredConnectionInput,
  ): Promise<Result<StoredConnectionMetadata, AppError>> {
    const current = this.#metadataStore.get(connectionId);

    if (!current.ok) {
      return current;
    }

    const secretPatch = Object.hasOwn(patch, "uri");

    if (secretPatch) {
      if (typeof patch.uri !== "string") {
        return err(invalidSecretPatchError(connectionId));
      }

      const secretResult = await this.#secretStore.setUri(
        connectionId,
        patch.uri,
      );

      if (!secretResult.ok) {
        return secretResult;
      }
    }

    const metadata = updateMetadata(current.value, patch);
    return this.#metadataStore.set(metadata);
  }
}

const invalidSecretPatchError = (connectionId: string): AppError =>
  new AppError("VALIDATION_FAILED", "Connection secret patch is invalid", {
    details: { connectionId },
  });

const updateMetadata = (
  current: StoredConnectionMetadata,
  patch: UpdateStoredConnectionInput,
): StoredConnectionMetadata => {
  const metadata: StoredConnectionMetadata = {
    ...current,
    updatedAt: nowIso(),
  };

  if (patch.environment !== undefined) {
    metadata.environment = patch.environment;
  }

  if (patch.lastConnectedAt !== undefined) {
    if (patch.lastConnectedAt === null) {
      delete metadata.lastConnectedAt;
    } else {
      metadata.lastConnectedAt = patch.lastConnectedAt;
    }
  }

  if (patch.lastErrorMessage !== undefined) {
    if (patch.lastErrorMessage === null) {
      delete metadata.lastErrorMessage;
    } else {
      metadata.lastErrorMessage = patch.lastErrorMessage;
    }
  }

  if (patch.name !== undefined) {
    metadata.name = patch.name;
  }

  if (patch.pluginId !== undefined) {
    metadata.pluginId = patch.pluginId;
  }

  if (patch.readOnly !== undefined) {
    metadata.readOnly = patch.readOnly;
  }

  return metadata;
};

export const createMissingConnectionResult = (
  connectionId: string,
): Result<never, AppError> => err(connectionNotFoundError(connectionId));
