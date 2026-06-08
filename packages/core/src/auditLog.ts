import { createId, nowIso } from "@nexum/shared";

export type AuditLogAction =
  | "aggregation.executed"
  | "aggregation.failed"
  | "connection.connected"
  | "connection.created"
  | "connection.updated"
  | "connection.deleted"
  | "connection.disconnected"
  | "connection.failed"
  | "connection.tested"
  | "plugin.registered"
  | "plugin.unregistered"
  | "query.executed"
  | "query.explained"
  | "query.failed"
  | "aggregation.explained"
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
      ...(entry.target ? { target: redactAuditString(entry.target) } : {}),
      ...(entry.metadata ? { metadata: sanitizeAuditMetadata(entry.metadata) } : {}),
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

const secretKeyPattern =
  /(?:password|passwd|pwd|secret|token|accessToken|refreshToken|uri|url|connectionString)/i;
const secretValuePattern =
  /(mongodb(?:\+srv)?:\/\/|postgres(?:ql)?:\/\/|mysql:\/\/|redis:\/\/|Bearer\s+)[^\s"']+/gi;

const redactAuditString = (value: string): string =>
  value.replace(secretValuePattern, "$1[REDACTED]");

const sanitizeAuditMetadata = (
  metadata: Record<string, unknown>,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      secretKeyPattern.test(key) ? "[REDACTED]" : sanitizeAuditValue(value),
    ]),
  );

const sanitizeAuditValue = (value: unknown): unknown => {
  if (typeof value === "string") {
    return redactAuditString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditValue(item));
  }

  if (value && typeof value === "object") {
    return sanitizeAuditMetadata(value as Record<string, unknown>);
  }

  return value;
};
