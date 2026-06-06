# Nexum Architecture v2

## Product Name

Nexum

## Tagline

Database Workspace for Engineers

Alternative: Explore. Query. Transform.

---

## 1. Product Vision

Nexum is a modern desktop database workspace for engineering teams.

The first version focuses on MongoDB, but the architecture must support future database engines through plugins.

Phase 1:

```txt
Nexum Desktop
└── MongoDB Plugin
```

Future:

```txt
Nexum Desktop
├── MongoDB Plugin
├── PostgreSQL Plugin
├── Redis Plugin
├── Elasticsearch Plugin
├── ClickHouse Plugin
└── More database plugins
```

Nexum should not be designed as only a MongoDB client. MongoDB is the first supported data source.

---

## 2. Phase 1 Scope

Phase 1 implements the MongoDB plugin only.

Required features:

- Connect to local MongoDB
- Connect to remote MongoDB servers
- Connect to MongoDB Atlas
- Manage connection profiles
- Browse databases and collections
- View documents in table and JSON modes
- Edit single documents safely
- Build `find` queries visually
- Build and test aggregation pipelines
- Support read-only connections
- Add production safety protections
- Store secrets securely
- Keep local audit logs

---

## 3. Non-Goals For Phase 1

Do not implement yet:

- Public SaaS backend
- User accounts
- Cloud sync
- Team collaboration server
- PostgreSQL support
- Redis support
- Import/export
- Index manager
- Performance profiler
- Mongo shell terminal
- Bulk update/delete
- Drop database/collection
- Dangerous aggregation stages such as `$out` and `$merge`
- Full schema designer
- SQL-to-Mongo converter

---

## 4. Recommended Tech Stack

Desktop:

```txt
Electron
React
TypeScript
Vite
electron-vite
```

UI:

```txt
Tailwind CSS
shadcn/ui
TanStack Table
TanStack Query
TanStack Router
TanStack Virtual
Monaco Editor
Lucide Icons
```

Validation / State:

```txt
Zod
TanStack Query
Zustand only for local UI state when needed
```

TanStack usage:

- Use TanStack Query for all renderer-side server state from preload IPC calls.
- Use TanStack Router for typed desktop app routes and workspace views.
- Use TanStack Table for document grids.
- Use TanStack Virtual for large document lists and table virtualization.
- Keep Zustand optional and limited to ephemeral UI state such as open panels, selected tabs, and unsaved editor state.

Target database access:

```txt
mongodb official Node.js driver
```

Do not use Mongoose for target databases.

Reason:

- Nexum connects to arbitrary databases.
- Schemas are unknown.
- A database client should preserve raw driver behavior.
- Query builder and aggregation builder should generate raw MongoDB commands.
- Mongoose is model/schema-oriented and restrictive here.

Mongoose may be used later only for Nexum's own internal backend models if a cloud/team server is introduced.

Local app storage:

```txt
electron-store
keytar
```

Optional later:

```txt
SQLite / better-sqlite3
```

BSON / JSON:

```txt
bson EJSON
```

MongoDB documents may contain BSON types that plain JSON cannot safely represent:

```txt
ObjectId
Date
Decimal128
Long
Binary
Timestamp
Regex
```

---

## 5. High-Level Architecture

```txt
┌─────────────────────────────────────────────────────────┐
│                    Nexum Renderer                       │
│              React + TypeScript UI                      │
│                                                         │
│  - App Shell                                            │
│  - Workspace Tabs                                       │
│  - Connection Manager                                   │
│  - Database Explorer                                    │
│  - Plugin Views                                         │
│  - MongoDB Documents View                               │
│  - MongoDB Query Builder                                │
│  - MongoDB Aggregation Builder                          │
└─────────────────────────┬───────────────────────────────┘
                          │ Typed Preload API / IPC
┌─────────────────────────▼───────────────────────────────┐
│                    Nexum Main Process                    │
│                 Electron + Node.js                       │
│                                                         │
│  - Secure IPC Router                                    │
│  - Plugin Registry                                      │
│  - Connection Registry                                  │
│  - Secret Store                                         │
│  - Local Settings Store                                 │
│  - Audit Log                                            │
│  - MongoDB Plugin Runtime                               │
└─────────────────────────┬───────────────────────────────┘
                          │ Native Drivers
┌─────────────────────────▼───────────────────────────────┐
│                    External Databases                    │
│                                                         │
│  - MongoDB Local                                        │
│  - MongoDB Remote                                       │
│  - MongoDB Atlas                                        │
│  - Future: PostgreSQL / Redis / Elasticsearch / etc.     │
└─────────────────────────────────────────────────────────┘
```

---

## 6. Monorepo Structure

Use a monorepo from day one.

```txt
nexum/
  package.json
  pnpm-workspace.yaml
  turbo.json

  apps/
    desktop/
      package.json
      electron.vite.config.ts
      src/
        main/
        preload/
        renderer/
          app/
            router.tsx
            query-client.ts
            providers.tsx
          routes/
          features/
          components/
          styles/

  packages/
    core/
      package.json
      src/
        plugin/
        connections/
        workspace/
        audit/
        errors/
        types/

    ui/
      package.json
      src/
        components/
        layout/
        data-grid/
        json-editor/
        dialogs/
        theme/

    mongodb-plugin/
      package.json
      src/
        main/
          mongo-driver.ts
          mongo-connection.ts
          mongo-service.ts
          mongo-schemas.ts
          pipeline-validator.ts
        renderer/
          documents/
          query-builder/
          aggregation-builder/
          explorer/
        shared/
          types.ts
          bson.ts
          query-builder.ts
          aggregation.ts

    shared/
      package.json
      src/
        result.ts
        ids.ts
        date.ts
        logger.ts

  docs/
    NEXUM_ARCHITECTURE.md
    MONGODB_PLUGIN_SPEC.md
    SECURITY.md
```

Recommended package manager:

```txt
pnpm
```

---

## 7. Plugin Architecture

Nexum should support database plugins.

A plugin provides:

- Connection type
- Connection form schema
- Connection test function
- Explorer tree provider
- Data browsing views
- Query execution methods
- Optional visual builders
- Optional editors
- Safety rules
- Icon and metadata

Plugin interface:

```ts
export type NexumPlugin = {
  id: string;
  name: string;
  displayName: string;
  version: string;

  connection: {
    type: string;
    validateInput(input: unknown): Promise<ValidatedConnectionInput>;
    test(input: ValidatedConnectionInput): Promise<ConnectionTestResult>;
    connect(profileId: string): Promise<void>;
    disconnect(profileId: string): Promise<void>;
  };

  explorer: {
    listRootNodes(connectionId: string): Promise<ExplorerNode[]>;
    listChildren(node: ExplorerNode): Promise<ExplorerNode[]>;
  };

  capabilities: PluginCapabilities;
};
```

Plugin capabilities:

```ts
export type PluginCapabilities = {
  documents?: boolean;
  tableView?: boolean;
  jsonView?: boolean;
  visualQueryBuilder?: boolean;
  aggregationBuilder?: boolean;
  documentEditing?: boolean;
  schemaInference?: boolean;
  readOnlyMode?: boolean;
};
```

MongoDB Phase 1 capabilities:

```ts
export const mongodbCapabilities: PluginCapabilities = {
  documents: true,
  tableView: true,
  jsonView: true,
  visualQueryBuilder: true,
  aggregationBuilder: true,
  documentEditing: true,
  schemaInference: true,
  readOnlyMode: true,
};
```

---

## 8. Core Domain Models

Connection profile:

```ts
export type ConnectionEnvironment =
  | "local"
  | "development"
  | "staging"
  | "production";

export type ConnectionProfile = {
  id: string;
  pluginId: string;
  name: string;
  environment: ConnectionEnvironment;
  readOnly: boolean;
  createdAt: string;
  updatedAt: string;
};
```

Important: connection profiles must not contain raw secrets.

Secret reference:

```ts
export type SecretRef = {
  profileId: string;
  service: "nexum";
  account: string;
};
```

For Phase 1, store MongoDB URI in macOS Keychain using `keytar`.

```txt
keytar service: "nexum"
keytar account: connectionProfile.id
value: full MongoDB connection URI
```

Workspace:

```ts
export type Workspace = {
  id: string;
  name: string;
  connectionIds: string[];
  createdAt: string;
  updatedAt: string;
};
```

Phase 1 can use one implicit local workspace.

Explorer node:

```ts
export type ExplorerNode = {
  id: string;
  pluginId: string;
  connectionId: string;
  type: string;
  label: string;
  path: string[];
  metadata?: Record<string, unknown>;
  hasChildren: boolean;
};
```

For MongoDB:

```txt
connection
database
collection
view
```

---

## 9. Security Model

Renderer must not directly access:

- Node.js APIs
- MongoDB drivers
- Keychain
- File system, except through approved APIs
- Raw saved secrets

Electron BrowserWindow must use:

```ts
new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, "preload.js"),
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
  },
});
```

IPC rules:

- Validate all inputs with Zod.
- Use typed IPC wrappers.
- Sanitize errors before returning them to renderer.
- Do not expose stack traces in production.
- Do not log full connection URIs.
- Do not log passwords.
- Do not allow arbitrary MongoDB commands in Phase 1.

Production protection:

If `environment === "production"`:

- Display a clear production badge.
- Default to read-only when creating production connections.
- Require confirmation before writes.
- Consider requiring the user to type the collection name or database name before writing.
- Log all write attempts.

---

## 10. Preload API

Expose a minimal API.

```ts
export type NexumDesktopApi = {
  connections: {
    list(): Promise<ConnectionProfile[]>;
    create(input: CreateConnectionInput): Promise<ConnectionProfile>;
    update(
      id: string,
      input: UpdateConnectionInput,
    ): Promise<ConnectionProfile>;
    delete(id: string): Promise<void>;
    test(input: TestConnectionInput): Promise<ConnectionTestResult>;
    connect(id: string): Promise<void>;
    disconnect(id: string): Promise<void>;
    getStatus(id: string): Promise<ConnectionStatus>;
  };

  explorer: {
    listRootNodes(connectionId: string): Promise<ExplorerNode[]>;
    listChildren(node: ExplorerNode): Promise<ExplorerNode[]>;
  };

  mongodb: {
    listDatabases(connectionId: string): Promise<MongoDatabaseInfo[]>;
    listCollections(
      input: MongoListCollectionsInput,
    ): Promise<MongoCollectionInfo[]>;
    findDocuments(
      input: MongoFindDocumentsInput,
    ): Promise<MongoFindDocumentsOutput>;
    updateDocument(
      input: MongoUpdateDocumentInput,
    ): Promise<MongoUpdateDocumentOutput>;
    inferFields(input: MongoInferFieldsInput): Promise<MongoInferFieldsOutput>;
    aggregate(input: MongoAggregateInput): Promise<MongoAggregateOutput>;
  };

  audit: {
    listRecent(limit?: number): Promise<AuditEvent[]>;
  };
};
```

Renderer usage:

```ts
const databases = await window.nexum.mongodb.listDatabases(connectionId);
```

---

## 11. MongoDB Plugin — Phase 1

Connection support:

```txt
mongodb://localhost:27017
mongodb://username:password@host:port
mongodb+srv://username:password@cluster.mongodb.net
```

Connection input:

```ts
export type MongoConnectionInput = {
  name: string;
  uri: string;
  environment: ConnectionEnvironment;
  readOnly: boolean;
};
```

Connection test:

```ts
await client.db().admin().ping();
```

Connection test result:

```ts
export type ConnectionTestResult = {
  ok: boolean;
  message: string;
  latencyMs?: number;
};
```

MongoDB explorer tree:

```txt
Connection
  ├─ Database
  │   ├─ Collection
  │   └─ View
```

Database info:

```ts
export type MongoDatabaseInfo = {
  name: string;
  sizeOnDisk?: number;
  empty?: boolean;
};
```

Collection info:

```ts
export type MongoCollectionInfo = {
  name: string;
  type: "collection" | "view";
  estimatedDocumentCount?: number;
};
```

Default query:

```js
{
}
```

Default options:

```ts
{
  limit: 50,
  skip: 0,
  sort: {}
}
```

Find request:

```ts
export type MongoFindDocumentsInput = {
  connectionId: string;
  databaseName: string;
  collectionName: string;
  filter: Record<string, unknown>;
  projection?: Record<string, unknown>;
  sort?: Record<string, 1 | -1>;
  limit?: number;
  skip?: number;
};
```

Find response:

```ts
export type MongoFindDocumentsOutput = {
  documents: string[];
  executionTimeMs: number;
  hasMore: boolean;
};
```

Important: `documents` should be EJSON strings when crossing IPC boundaries.

---

## 12. BSON / EJSON Handling

Use:

```ts
import { EJSON } from "bson";
```

From MongoDB to renderer:

```ts
const serialized = EJSON.stringify(document, { relaxed: false });
```

From renderer to MongoDB:

```ts
const parsed = EJSON.parse(serializedDocument);
```

Example Extended JSON:

```json
{
  "_id": { "$oid": "665f1fcbadf1e1e9e0b55a21" },
  "createdAt": { "$date": "2025-01-01T12:00:00Z" }
}
```

---

## 13. Document Editing

Rules:

- Edit one document at a time.
- Use Extended JSON.
- Validate before save.
- Save with `replaceOne`.
- Do not allow `_id` changes.
- Block write if connection is read-only.
- Require confirmation for production.

Request:

```ts
export type MongoUpdateDocumentInput = {
  connectionId: string;
  databaseName: string;
  collectionName: string;
  originalDocumentEjson: string;
  editedDocumentEjson: string;
};
```

Implementation idea:

```ts
const originalDoc = EJSON.parse(input.originalDocumentEjson);
const editedDoc = EJSON.parse(input.editedDocumentEjson);

if (!deepEqual(originalDoc._id, editedDoc._id)) {
  throw new AppError("DOCUMENT_ID_CHANGED", "_id cannot be changed");
}

await collection.replaceOne({ _id: originalDoc._id }, editedDoc);
```

Response:

```ts
export type MongoUpdateDocumentOutput = {
  matchedCount: number;
  modifiedCount: number;
};
```

---

## 14. Visual Query Builder

Supported operators:

```txt
equals
not equals
greater than
greater than or equal
less than
less than or equal
contains
exists
in
not in
regex
```

Mapping:

```txt
equals                 => { field: value }
not equals             => { field: { $ne: value } }
greater than           => { field: { $gt: value } }
greater than or equal  => { field: { $gte: value } }
less than              => { field: { $lt: value } }
less than or equal     => { field: { $lte: value } }
contains               => { field: { $regex: value, $options: "i" } }
exists                 => { field: { $exists: true } }
in                     => { field: { $in: values } }
not in                 => { field: { $nin: values } }
regex                  => { field: { $regex: pattern, $options: flags } }
```

Data model:

```ts
export type QueryCondition = {
  id: string;
  field: string;
  operator:
    | "eq"
    | "ne"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "contains"
    | "exists"
    | "in"
    | "nin"
    | "regex";
  value?: unknown;
};

export type QueryGroup = {
  id: string;
  combinator: "and" | "or";
  conditions: Array<QueryCondition | QueryGroup>;
};
```

UI requirements:

```txt
[AND/OR selector]
  [field input] [operator select] [value input] [remove]
  [field input] [operator select] [value input] [remove]

[+ Add condition]
[+ Add group]
[Run Query]
[Raw JSON Preview]
```

---

## 15. Field Inference

Infer fields from a sample of documents.

Request:

```ts
export type MongoInferFieldsInput = {
  connectionId: string;
  databaseName: string;
  collectionName: string;
  sampleSize?: number;
};
```

Response:

```ts
export type MongoInferFieldsOutput = {
  fields: Array<{
    path: string;
    detectedTypes: string[];
    occurrenceCount: number;
  }>;
};
```

Rules:

- Sample default: 100 documents
- Use dot notation for nested fields
- Do not infer from entire huge collection
- Include type hints when possible

---

## 16. Aggregation Pipeline Builder

Supported stages for MVP:

```txt
$match
$project
$sort
$limit
$skip
$count
$group
$unwind
```

Blocked stages for MVP:

```txt
$out
$merge
$function
$accumulator
```

Pipeline stage model:

```ts
export type AggregationStage = {
  id: string;
  type:
    | "$match"
    | "$project"
    | "$sort"
    | "$limit"
    | "$skip"
    | "$count"
    | "$group"
    | "$unwind";
  enabled: boolean;
  value: Record<string, unknown> | number | string;
};
```

Pipeline builder:

```ts
export function buildPipeline(
  stages: AggregationStage[],
): Record<string, unknown>[] {
  return stages
    .filter((stage) => stage.enabled)
    .map((stage) => ({
      [stage.type]: stage.value,
    }));
}
```

Pipeline validator:

```ts
const ALLOWED_STAGES = new Set([
  "$match",
  "$project",
  "$sort",
  "$limit",
  "$skip",
  "$count",
  "$group",
  "$unwind",
]);

const BLOCKED_STAGES = new Set(["$out", "$merge", "$function", "$accumulator"]);

export function validatePipeline(pipeline: Record<string, unknown>[]) {
  for (const stage of pipeline) {
    const keys = Object.keys(stage);

    if (keys.length !== 1) {
      throw new Error(
        "Each aggregation stage must contain exactly one operator",
      );
    }

    const stageName = keys[0];

    if (BLOCKED_STAGES.has(stageName)) {
      throw new Error(`Blocked aggregation stage: ${stageName}`);
    }

    if (!ALLOWED_STAGES.has(stageName)) {
      throw new Error(`Unsupported aggregation stage in MVP: ${stageName}`);
    }
  }
}
```

Aggregate request:

```ts
export type MongoAggregateInput = {
  connectionId: string;
  databaseName: string;
  collectionName: string;
  pipeline: Record<string, unknown>[];
  limit?: number;
};
```

Aggregate response:

```ts
export type MongoAggregateOutput = {
  documents: string[];
  executionTimeMs: number;
};
```

Execution:

```ts
collection.aggregate(pipeline, {
  maxTimeMS: 30_000,
  allowDiskUse: false,
});
```

---

## 17. UI / UX Design

App layout:

```txt
┌──────────────────────────────────────────────────────────┐
│ Top Bar: Nexum / Active Connection / Environment / Run    │
├───────────────────┬──────────────────────────────────────┤
│ Left Sidebar       │ Main Workspace                       │
│                   │                                      │
│ Connections        │ Collection Tabs:                     │
│ Database Tree      │ - Documents                          │
│ Saved Items later  │ - Query Builder                      │
│                   │ - Aggregation Pipeline               │
└───────────────────┴──────────────────────────────────────┘
```

Important UI elements:

- App name: Nexum
- Environment badge: local/dev/staging/prod
- Read-only badge
- Connection status
- Error toast
- Audit log access

Documents tab:

```txt
[Raw Filter Preview] [Run] [Limit] [Skip] [Sort]
------------------------------------------------
Table View / JSON View
------------------------------------------------
Result count / Execution time / Pagination
```

Query Builder tab:

```txt
Visual condition builder
Raw generated filter preview
Run button
Results preview
```

Aggregation tab:

```txt
Stage list
Stage editor
Raw pipeline preview
Run button
Results preview
```

---

## 18. Error Model

```ts
export type AppErrorCode =
  | "CONNECTION_FAILED"
  | "AUTH_FAILED"
  | "QUERY_TIMEOUT"
  | "INVALID_JSON"
  | "INVALID_PIPELINE"
  | "READ_ONLY_CONNECTION"
  | "PRODUCTION_CONFIRMATION_REQUIRED"
  | "DOCUMENT_ID_CHANGED"
  | "PLUGIN_NOT_FOUND"
  | "SECRET_NOT_FOUND"
  | "UNKNOWN_ERROR";

export type AppError = {
  code: AppErrorCode;
  message: string;
  details?: unknown;
};
```

Rules:

- Keep messages user-readable.
- Keep details safe.
- No raw stack traces in production.
- No full connection URIs in errors.

---

## 19. Audit Log

MVP should keep local audit logs.

```ts
export type AuditEvent = {
  id: string;
  timestamp: string;
  pluginId: string;
  connectionId?: string;
  databaseName?: string;
  collectionName?: string;
  action:
    | "connection.created"
    | "connection.updated"
    | "connection.deleted"
    | "connection.tested"
    | "connection.connected"
    | "connection.disconnected"
    | "query.executed"
    | "aggregation.executed"
    | "document.updated";
  metadata?: Record<string, unknown>;
};
```

Do not store secrets.

---

## 20. Main Process Services

Recommended services:

```txt
ConnectionStore
SecretStore
ConnectionRegistry
PluginRegistry
AuditLogService
MongoService
MongoFieldInferenceService
MongoPipelineValidator
ErrorSanitizer
```

Connection registry:

```ts
class ConnectionRegistry {
  private clients = new Map<string, MongoClient>();

  getClient(connectionId: string): MongoClient {
    const client = this.clients.get(connectionId);
    if (!client) throw new Error("Connection is not active");
    return client;
  }

  setClient(connectionId: string, client: MongoClient) {
    this.clients.set(connectionId, client);
  }

  async disconnect(connectionId: string) {
    const client = this.clients.get(connectionId);
    if (client) await client.close();
    this.clients.delete(connectionId);
  }
}
```

Mongo service example:

```ts
class MongoService {
  constructor(private registry: ConnectionRegistry) {}

  async listDatabases(connectionId: string) {
    const client = this.registry.getClient(connectionId);
    const result = await client.db().admin().listDatabases();
    return result.databases;
  }

  async listCollections(connectionId: string, databaseName: string) {
    const client = this.registry.getClient(connectionId);
    return client.db(databaseName).listCollections().toArray();
  }

  async findDocuments(input: MongoFindDocumentsInput) {
    const startedAt = Date.now();
    const client = this.registry.getClient(input.connectionId);

    const documents = await client
      .db(input.databaseName)
      .collection(input.collectionName)
      .find(input.filter ?? {})
      .project(input.projection ?? {})
      .sort(input.sort ?? {})
      .skip(input.skip ?? 0)
      .limit(input.limit ?? 50)
      .maxTimeMS(30_000)
      .toArray();

    return {
      documents: documents.map((document) =>
        EJSON.stringify(document, { relaxed: false }),
      ),
      executionTimeMs: Date.now() - startedAt,
      hasMore: documents.length === (input.limit ?? 50),
    };
  }
}
```

---

## 21. Development Milestones

### Milestone 0 — Monorepo Bootstrap

- Create pnpm monorepo
- Add `apps/desktop`
- Add `packages/core`
- Add `packages/ui`
- Add `packages/mongodb-plugin`
- Add TypeScript configs
- Add lint/typecheck scripts
- Add Electron + React app shell
- Add TanStack Query provider
- Add TanStack Router setup
- Add typed preload health check

Acceptance:

```txt
Nexum desktop app opens on macOS.
Renderer can call main process through typed preload API.
Renderer has TanStack Query and TanStack Router configured.
```

### Milestone 1 — Nexum App Shell

- Build main layout
- Add sidebar
- Add top bar
- Add empty workspace
- Add typed app routes with TanStack Router
- Add theme support
- Add environment badge component
- Add read-only badge component

Acceptance:

```txt
App visually displays as Nexum.
The shell is ready for plugin views.
```

### Milestone 2 — Connection Manager

- Create connection form
- Save connection metadata
- Store URI in Keychain
- Test MongoDB connection
- Connect/disconnect
- Show connection status

Acceptance:

```txt
User can add local MongoDB and Atlas connections.
Secrets are not stored in plain JSON.
```

### Milestone 3 — MongoDB Explorer

- List databases
- List collections
- Render explorer tree
- Select collection

Acceptance:

```txt
User can browse MongoDB databases and collections.
```

### Milestone 4 — MongoDB Document Viewer

- Run default `find({})`
- Show documents in table view
- Show documents in JSON view
- Support limit and skip
- Show execution time
- Use EJSON across IPC

Acceptance:

```txt
User can view first 50 documents in a selected collection.
```

### Milestone 5 — Document Editor

- Open document editor
- Edit EJSON
- Validate before save
- Save with `replaceOne`
- Block `_id` changes
- Respect read-only mode
- Add production confirmation

Acceptance:

```txt
User can safely edit one document.
Read-only mode blocks writes.
_id cannot be changed.
```

### Milestone 6 — Visual Query Builder

- Add conditions
- Add AND/OR groups
- Generate raw MongoDB filter JSON
- Infer field names
- Run generated query
- Show results

Acceptance:

```txt
User can build and run common MongoDB find queries visually.
```

### Milestone 7 — Aggregation Builder

- Add stage list
- Add stage editors
- Reorder stages
- Enable/disable stages
- Generate raw pipeline
- Validate allowed stages
- Run aggregation
- Show results

Acceptance:

```txt
User can build and run simple aggregation pipelines.
Blocked stages are rejected.
```

---

## 22. Codex Implementation Prompt

Use this prompt to start implementation.

```txt
You are implementing Nexum, a macOS desktop database workspace for engineers.

Nexum must be built as a plugin-based desktop app. MongoDB is the first plugin.

Use:
- pnpm monorepo
- Electron
- React
- TypeScript
- Vite / electron-vite
- Tailwind CSS
- shadcn/ui
- TanStack Query
- TanStack Router
- TanStack Table
- TanStack Virtual
- Zod
- official mongodb Node.js driver
- bson EJSON
- keytar
- electron-store

Do not use Mongoose for target databases.

Create this structure:

nexum/
  apps/
    desktop/
  packages/
    core/
    ui/
    mongodb-plugin/
    shared/
  docs/

Core requirements:
- Renderer must not connect directly to databases.
- Use TanStack Query for renderer-side server state from typed preload API calls.
- Use TanStack Router for typed app/workspace routing.
- Use TanStack Table and TanStack Virtual for document grids and large result sets.
- Use secure typed preload API.
- Use IPC between renderer and main.
- Disable nodeIntegration.
- Enable contextIsolation.
- Validate IPC inputs with Zod.
- Store secrets in macOS Keychain with keytar.
- Store only non-secret metadata in local app storage.
- Use official mongodb driver for MongoDB.
- Use EJSON for BSON-safe IPC serialization.
- Return sanitized errors.
- Keep app modular so future PostgreSQL/Redis/etc. plugins can be added.

Phase 1 features:
1. Nexum app shell
2. MongoDB connection manager
3. MongoDB database/collection explorer
4. MongoDB document viewer with table and JSON modes
5. Safe single-document editor
6. Visual MongoDB query builder
7. MongoDB aggregation pipeline builder
8. Local audit log
9. Read-only mode
10. Production safety confirmation

MongoDB plugin:
- Support mongodb:// and mongodb+srv:// URIs
- Support local, remote, and Atlas connections
- Test connection using ping
- List databases
- List collections
- Run find queries
- Run allowed aggregation pipelines
- Block dangerous aggregation stages: $out, $merge, $function, $accumulator
- Default query limit: 50
- Max query time: 30 seconds
- Use read-only mode to block writes
- Block _id changes in document editor

Start by implementing:
1. Monorepo setup
2. Electron desktop app shell
3. TanStack Query provider and TanStack Router setup
4. Core plugin types
5. Typed preload API
6. Connection store and secret store
7. MongoDB connection test
8. MongoDB explorer
9. Basic document viewer with TanStack Table

Keep code modular, typed, and production-friendly.
```

---

## 23. MVP Done Checklist

```txt
[ ] App name is Nexum
[ ] Monorepo exists
[ ] Core plugin types exist
[ ] MongoDB plugin exists
[ ] Desktop app opens on macOS
[ ] Renderer uses typed preload API
[ ] Renderer has no direct database access
[ ] MongoDB URI secrets stored in Keychain
[ ] Can test local MongoDB connection
[ ] Can test MongoDB Atlas connection
[ ] Can connect/disconnect
[ ] Can list databases
[ ] Can list collections
[ ] Can view documents
[ ] Can switch table/json modes
[ ] Documents use EJSON safely
[ ] Can edit and save one document
[ ] Cannot change _id
[ ] Read-only mode blocks writes
[ ] Production confirmation exists
[ ] Visual query builder generates correct filters
[ ] Field inference works on sample documents
[ ] Aggregation builder supports MVP stages
[ ] Dangerous aggregation stages are blocked
[ ] Query timeout exists
[ ] Errors are sanitized
[ ] Local audit log exists
```

---

## 24. Future Roadmap

v0.2:

```txt
Saved queries
Saved aggregation pipelines
Connection profile import/export
Index viewer
Schema summary
Better field inference
Result export to JSON/CSV
```

v0.3:

```txt
PostgreSQL plugin
Redis plugin
Plugin marketplace/internal plugin registry
Workspace-level settings
```

v0.4:

```txt
Team server
User accounts
Role-based access control
Centralized audit logs
Cloud sync
SSO
```

v1.0:

```txt
Stable multi-database workspace
MongoDB/PostgreSQL/Redis support
Team collaboration
Production-safe workflows
Query review process
```
