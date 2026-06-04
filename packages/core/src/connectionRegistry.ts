import { AppError, err, ok, type Result } from "@nexum/shared";
import type { ConnectionProfile } from "./contracts.ts";

export class ConnectionRegistry {
  readonly #profiles = new Map<string, ConnectionProfile>();

  add(profile: ConnectionProfile): Result<ConnectionProfile> {
    if (this.#profiles.has(profile.id)) {
      return err(
        new AppError(
          "CONNECTION_ALREADY_EXISTS",
          `Connection "${profile.id}" already exists`,
          { details: { connectionId: profile.id } },
        ),
      );
    }

    this.#profiles.set(profile.id, profile);
    return ok(profile);
  }

  get(connectionId: string): Result<ConnectionProfile> {
    const profile = this.#profiles.get(connectionId);

    if (!profile) {
      return err(
        new AppError(
          "CONNECTION_NOT_FOUND",
          `Connection "${connectionId}" was not found`,
          { details: { connectionId } },
        ),
      );
    }

    return ok(profile);
  }

  list(): ConnectionProfile[] {
    return [...this.#profiles.values()];
  }

  listByPlugin(pluginId: string): ConnectionProfile[] {
    return this.list().filter((profile) => profile.pluginId === pluginId);
  }

  update(
    connectionId: string,
    patch: Partial<Omit<ConnectionProfile, "id" | "createdAt">>,
  ): Result<ConnectionProfile> {
    const current = this.get(connectionId);

    if (!current.ok) {
      return current;
    }

    const next = { ...current.value, ...patch };
    this.#profiles.set(connectionId, next);
    return ok(next);
  }

  remove(connectionId: string): Result<ConnectionProfile> {
    const profile = this.get(connectionId);

    if (!profile.ok) {
      return profile;
    }

    this.#profiles.delete(connectionId);
    return profile;
  }
}
