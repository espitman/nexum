import { describe, expect, it } from "vitest";
import { AppError, sanitizeError } from "@nexum/shared";
import {
  AuditLogService,
  ConnectionRegistry,
  InMemoryConnectionMetadataStore,
  InMemorySecretStore,
  PluginRegistry,
  type ConnectionProfile,
  type NexumPlugin,
} from ".";

const profile: ConnectionProfile = {
  id: "conn_1",
  pluginId: "mongodb",
  name: "Production MongoDB",
  environment: "production",
  readOnly: true,
  createdAt: "2026-06-02T00:00:00.000Z",
  updatedAt: "2026-06-02T00:00:00.000Z",
};

const plugin: NexumPlugin = {
  id: "mongodb",
  name: "mongodb",
  displayName: "MongoDB",
  version: "0.0.0",
  capabilities: {
    documents: true,
    readOnlyMode: true,
  },
  connection: {
    type: "mongodb",
    async validateInput() {
      return { ok: true, value: {} };
    },
    async test() {
      return { ok: true, value: { ok: true, message: "ready" } };
    },
    async connect() {
      return { ok: true, value: undefined };
    },
    async disconnect() {
      return { ok: true, value: undefined };
    },
  },
  explorer: {
    async listRootNodes() {
      return { ok: true, value: [] };
    },
    async listChildren() {
      return { ok: true, value: [] };
    },
  },
};

describe("PluginRegistry", () => {
  it("registers plugins and rejects duplicate ids", () => {
    const registry = new PluginRegistry();

    expect(registry.register(plugin).ok).toBe(true);
    const duplicate = registry.register(plugin);

    expect(duplicate.ok).toBe(false);
    expect(registry.list()).toHaveLength(1);
  });
});

describe("ConnectionRegistry", () => {
  it("stores, updates, and removes connection profiles", () => {
    const registry = new ConnectionRegistry();

    expect(registry.add(profile).ok).toBe(true);
    expect(registry.get(profile.id)).toMatchObject({
      ok: true,
      value: { name: "Production MongoDB" },
    });

    const updated = registry.update(profile.id, {
      name: "Prod MongoDB",
      updatedAt: "2026-06-02T01:00:00.000Z",
    });

    expect(updated).toMatchObject({
      ok: true,
      value: { name: "Prod MongoDB" },
    });
    expect(registry.remove(profile.id).ok).toBe(true);
    expect(registry.get(profile.id).ok).toBe(false);
  });
});

describe("InMemoryConnectionMetadataStore", () => {
  it("sets and lists metadata", () => {
    const store = new InMemoryConnectionMetadataStore();

    expect(
      store.set({
        ...profile,
        lastConnectedAt: "2026-06-02T02:00:00.000Z",
      }).ok,
    ).toBe(true);
    expect(store.list()).toHaveLength(1);
    expect(store.get(profile.id)).toMatchObject({
      ok: true,
      value: { lastConnectedAt: "2026-06-02T02:00:00.000Z" },
    });
  });
});

describe("InMemorySecretStore", () => {
  it("stores and retrieves secrets behind a ref", async () => {
    const store = new InMemorySecretStore();
    const ref = { namespace: "connections", key: profile.id };

    await expect(
      store.setSecret(ref, "mongodb://user:pass@localhost"),
    ).resolves.toMatchObject({ ok: true });
    await expect(store.getSecret(ref)).resolves.toMatchObject({
      ok: true,
      value: "mongodb://user:pass@localhost",
    });

    await store.deleteSecret(ref);
    await expect(store.getSecret(ref)).resolves.toMatchObject({ ok: false });
  });
});

describe("AuditLogService", () => {
  it("records immutable audit entries", () => {
    const auditLog = new AuditLogService();

    const entry = auditLog.record({
      action: "connection.tested",
      connectionId: profile.id,
      pluginId: profile.pluginId,
      createdAt: "2026-06-02T03:00:00.000Z",
    });

    expect(entry.id).toMatch(/^audit_/);
    expect(auditLog.listByConnection(profile.id)).toHaveLength(1);
  });
});

describe("sanitizeError", () => {
  it("redacts known secret fields and connection strings", () => {
    const sanitized = sanitizeError(
      new AppError(
        "VALIDATION_FAILED",
        "Failed for mongodb://user:pass@localhost/admin",
        {
          details: {
            password: "super-secret",
            nested: { token: "abc123" },
          },
        },
      ),
    );

    expect(sanitized.message).toBe("Failed for mongodb://[REDACTED]");
    expect(sanitized.details).toMatchObject({
      password: "[REDACTED]",
      nested: { token: "[REDACTED]" },
    });
  });
});
