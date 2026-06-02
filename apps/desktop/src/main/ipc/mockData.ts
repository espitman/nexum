import type {
  AuditLogDto,
  ConnectionSummary,
  DocumentQueryResult,
  ExplorerNodeDto,
} from "../../ipc/contracts";
import type { MongodbFindDocumentsPayload } from "../../ipc/validation";

export const mockConnections: ConnectionSummary[] = [
  {
    id: "conn_mongodb_prod",
    pluginId: "mongodb",
    name: "MongoDB",
    environment: "production",
    readOnly: true,
    status: "connected",
  },
];

export const mockExplorerRoots: ExplorerNodeDto[] = [
  {
    id: "mongo:app",
    pluginId: "mongodb",
    connectionId: "conn_mongodb_prod",
    type: "database",
    label: "app",
    path: ["app"],
    hasChildren: true,
  },
  {
    id: "mongo:analytics",
    pluginId: "mongodb",
    connectionId: "conn_mongodb_prod",
    type: "database",
    label: "analytics",
    path: ["analytics"],
    hasChildren: true,
  },
];

export const mockExplorerChildren: Record<string, ExplorerNodeDto[]> = {
  "mongo:app": [
    {
      id: "mongo:app:users",
      pluginId: "mongodb",
      connectionId: "conn_mongodb_prod",
      type: "collection",
      label: "users",
      path: ["app", "users"],
      hasChildren: false,
      metadata: { estimatedDocumentCount: 462 },
    },
    {
      id: "mongo:app:orders",
      pluginId: "mongodb",
      connectionId: "conn_mongodb_prod",
      type: "collection",
      label: "orders",
      path: ["app", "orders"],
      hasChildren: false,
      metadata: { estimatedDocumentCount: 128 },
    },
  ],
  "mongo:analytics": [
    {
      id: "mongo:analytics:events",
      pluginId: "mongodb",
      connectionId: "conn_mongodb_prod",
      type: "collection",
      label: "events",
      path: ["analytics", "events"],
      hasChildren: false,
      metadata: { estimatedDocumentCount: 2048 },
    },
  ],
};

export const mockAuditLogs: AuditLogDto[] = [
  {
    id: "audit_shell_boot",
    action: "connection.tested",
    connectionId: "conn_mongodb_prod",
    pluginId: "mongodb",
    createdAt: "2026-06-02T00:00:00.000Z",
  },
];

const mockDocuments: Record<string, unknown>[] = [
  {
    _id: { $oid: "6649f8c3e7b1d2a4f8c9a1b2" },
    email: "olivia.martin@example.com",
    status: "active",
  },
];

export const findMockDocuments = (
  payload: MongodbFindDocumentsPayload,
): DocumentQueryResult => ({
  documents: mockDocuments.slice(payload.skip, payload.skip + payload.limit),
  executionTimeMs: 12,
});
