import { AppError, err, ok, type Result } from "@nexum/shared";
import ElectronStore from "electron-store";
import type { ConnectionStorageState, StoredConnectionMetadata } from "./types";

export interface ConnectionMetadataRepository {
  get(connectionId: string): Result<StoredConnectionMetadata, AppError>;
  list(): StoredConnectionMetadata[];
  remove(connectionId: string): Result<StoredConnectionMetadata, AppError>;
  set(
    metadata: StoredConnectionMetadata,
  ): Result<StoredConnectionMetadata, AppError>;
}

type MetadataBackingStore = Pick<
  ElectronStore<ConnectionStorageState>,
  "get" | "set"
>;

const createDefaultStore = (): ElectronStore<ConnectionStorageState> =>
  new ElectronStore<ConnectionStorageState>({
    defaults: {
      connections: {},
    },
    name: "connections",
  });

export class ElectronConnectionMetadataStore implements ConnectionMetadataRepository {
  readonly #store: MetadataBackingStore;

  constructor(store: MetadataBackingStore = createDefaultStore()) {
    this.#store = store;
  }

  get(connectionId: string): Result<StoredConnectionMetadata, AppError> {
    const metadata = this.#store.get("connections")[connectionId];

    if (!metadata) {
      return err(connectionNotFoundError(connectionId));
    }

    return ok(metadata);
  }

  list(): StoredConnectionMetadata[] {
    return Object.values(this.#store.get("connections"));
  }

  remove(connectionId: string): Result<StoredConnectionMetadata, AppError> {
    const current = this.get(connectionId);

    if (!current.ok) {
      return current;
    }

    const { [connectionId]: _removed, ...connections } =
      this.#store.get("connections");
    this.#store.set("connections", connections);

    return current;
  }

  set(
    metadata: StoredConnectionMetadata,
  ): Result<StoredConnectionMetadata, AppError> {
    const connections = this.#store.get("connections");
    this.#store.set("connections", {
      ...connections,
      [metadata.id]: metadata,
    });

    return ok(metadata);
  }
}

export const connectionNotFoundError = (connectionId: string): AppError =>
  new AppError(
    "CONNECTION_NOT_FOUND",
    `Connection "${connectionId}" was not found`,
    { details: { connectionId } },
  );
