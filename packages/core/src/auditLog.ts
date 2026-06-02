import { createId, nowIso } from "@nexum/shared";

export type AuditLogAction =
  | "connection.created"
  | "connection.updated"
  | "connection.deleted"
  | "connection.tested"
  | "plugin.registered"
  | "plugin.unregistered"
  | "document.read"
  | "document.write.attempted"
  | "document.write.blocked"
  | "document.write.completed";

export type AuditLogEntry = {
  id: string;
  action: AuditLogAction;
  actorId?: string;
  connectionId?: string;
  pluginId?: string;
  target?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type CreateAuditLogEntry = Omit<AuditLogEntry, "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
};

export class AuditLogService {
  readonly #entries: AuditLogEntry[] = [];

  record(entry: CreateAuditLogEntry): AuditLogEntry {
    const nextEntry: AuditLogEntry = {
      id: entry.id ?? createId("audit"),
      action: entry.action,
      createdAt: entry.createdAt ?? nowIso(),
      ...(entry.actorId ? { actorId: entry.actorId } : {}),
      ...(entry.connectionId ? { connectionId: entry.connectionId } : {}),
      ...(entry.pluginId ? { pluginId: entry.pluginId } : {}),
      ...(entry.target ? { target: entry.target } : {}),
      ...(entry.metadata ? { metadata: entry.metadata } : {}),
    };

    this.#entries.push(nextEntry);
    return nextEntry;
  }

  list(): AuditLogEntry[] {
    return [...this.#entries];
  }

  listByConnection(connectionId: string): AuditLogEntry[] {
    return this.#entries.filter((entry) => entry.connectionId === connectionId);
  }

  clear(): void {
    this.#entries.length = 0;
  }
}
