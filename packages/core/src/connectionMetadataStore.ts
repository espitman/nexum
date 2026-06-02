import { AppError, err, ok, type Result } from "@nexum/shared";
import type { ConnectionMetadata } from "./contracts";

export interface ConnectionMetadataStore {
  get(connectionId: string): Result<ConnectionMetadata>;
  list(): ConnectionMetadata[];
  set(metadata: ConnectionMetadata): Result<ConnectionMetadata>;
  remove(connectionId: string): Result<ConnectionMetadata>;
}

export class InMemoryConnectionMetadataStore implements ConnectionMetadataStore {
  readonly #metadata = new Map<string, ConnectionMetadata>();

  get(connectionId: string): Result<ConnectionMetadata> {
    const metadata = this.#metadata.get(connectionId);

    if (!metadata) {
      return err(
        new AppError(
          "CONNECTION_NOT_FOUND",
          `Connection metadata "${connectionId}" was not found`,
          { details: { connectionId } },
        ),
      );
    }

    return ok(metadata);
  }

  list(): ConnectionMetadata[] {
    return [...this.#metadata.values()];
  }

  set(metadata: ConnectionMetadata): Result<ConnectionMetadata> {
    this.#metadata.set(metadata.id, metadata);
    return ok(metadata);
  }

  remove(connectionId: string): Result<ConnectionMetadata> {
    const metadata = this.get(connectionId);

    if (!metadata.ok) {
      return metadata;
    }

    this.#metadata.delete(connectionId);
    return metadata;
  }
}
