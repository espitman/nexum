import type { Connection, DatabaseNode, DocumentRow } from "./types";

export const connections: Connection[] = [
  { icon: "leaf", label: "MongoDB", active: true },
  { icon: "pg", label: "PostgreSQL" },
  { icon: "rs", label: "Redis" },
  { icon: "my", label: "MySQL", more: true },
];

export const navItems = [
  ["folder", "Connections"],
  ["database", "Explore"],
  ["term", "Queries"],
  ["mark", "Bookmarks"],
  ["code", "Snippets"],
  ["check", "Tasks"],
  ["gear", "Settings"],
] as const;

export type NavItemLabel = (typeof navItems)[number][1];

export const workspaceTabs = [
  ["table", "Documents"],
  ["query", "Query Builder"],
  ["pipeline", "Aggregation Pipeline"],
  ["indexes", "Indexes"],
  ["schema", "Schema"],
  ["explain", "Explain"],
] as const;

export type WorkspaceTabLabel = (typeof workspaceTabs)[number][1];

export const inspectorTabs = ["Schema", "Indexes", "Document"] as const;

export type InspectorTabLabel = (typeof inspectorTabs)[number];

export const databaseNodes: DatabaseNode[] = [
  { name: "admin", type: "database", depth: 0 },
  { name: "app", type: "database", depth: 0, open: true },
  { name: "collections", type: "folder", depth: 1, open: true },
  { name: "users", type: "collection", depth: 2 },
  { name: "orders", type: "collection", depth: 2 },
  { name: "products", type: "collection", depth: 2 },
  { name: "sessions", type: "collection", depth: 2 },
  { name: "events", type: "collection", depth: 2 },
  { name: "views", type: "folder", depth: 1 },
  { name: "system", type: "folder", depth: 1 },
  { name: "analytics", type: "database", depth: 0 },
  { name: "logs", type: "database", depth: 0 },
  { name: "reporting", type: "database", depth: 0 },
];

export const rows: DocumentRow[] = [
  {
    id: "6649f8c3e7b1d2a4f8c9a1b2",
    email: "olivia.martin@example.com",
    status: "active",
    createdAt: "2024-05-18T14:32:21.123Z",
    total: "1,245.50",
  },
  {
    id: "6649f8c3e7b1d2a4f8c9a1b3",
    email: "liam.johnson@example.com",
    status: "active",
    createdAt: "2024-05-18T14:21:09.987Z",
    total: "320.00",
  },
  {
    id: "6649f8c3e7b1d2a4f8c9a1b4",
    email: "emma.smith@example.com",
    status: "pending",
    createdAt: "2024-05-18T13:11:42.556Z",
    total: "89.99",
  },
  {
    id: "6649f8c3e7b1d2a4f8c9a1b5",
    email: "noah.williams@example.com",
    status: "active",
    createdAt: "2024-05-18T12:08:33.201Z",
    total: "560.75",
  },
  {
    id: "6649f8c3e7b1d2a4f8c9a1b6",
    email: "ava.brown@example.com",
    status: "inactive",
    createdAt: "2024-05-18T11:55:12.001Z",
    total: "0.00",
  },
  {
    id: "6649f8c3e7b1d2a4f8c9a1b7",
    email: "william.jones@example.com",
    status: "active",
    createdAt: "2024-05-18T11:44:59.421Z",
    total: "780.10",
  },
  {
    id: "6649f8c3e7b1d2a4f8c9a1b8",
    email: "sophia.davis@example.com",
    status: "pending",
    createdAt: "2024-05-18T10:31:07.654Z",
    total: "150.00",
  },
  {
    id: "6649f8c3e7b1d2a4f8c9a1b9",
    email: "james.miller@example.com",
    status: "active",
    createdAt: "2024-05-18T10:15:22.180Z",
    total: "2,299.00",
  },
  {
    id: "6649f8c3e7b1d2a4f8c9a1ba",
    email: "mia.garcia@example.com",
    status: "inactive",
    createdAt: "2024-05-18T09:59:41.310Z",
    total: "0.00",
  },
  {
    id: "6649f8c3e7b1d2a4f8c9a1bb",
    email: "ben.rodriguez@example.com",
    status: "active",
    createdAt: "2024-05-18T09:22:18.742Z",
    total: "410.00",
  },
];

export const inspectorLines = [
  ["{", "plain"],
  ['  "_id": {', "key"],
  ['    "$oid": "6649f8c3e7b1d2a4f8c9a1b2"', "string"],
  ["  },", "plain"],
  ['  "email": "olivia.martin@example.com",', "string"],
  ['  "status": "active",', "string"],
  ['  "profile": {', "key"],
  ['    "firstName": "Olivia",', "string"],
  ['    "lastName": "Martin",', "string"],
  ['    "phone": "+1-555-0134",', "string"],
  ['    "locale": "en-US"', "string"],
  ["  },", "plain"],
  ['  "addresses": [', "key"],
  ["    {", "plain"],
  ['      "type": "shipping",', "string"],
  ['      "line1": "123 Main St",', "string"],
  ['      "line2": "Apt 4B",', "string"],
  ['      "city": "Austin",', "string"],
  ['      "state": "TX",', "string"],
  ['      "postalCode": "78701",', "string"],
  ['      "country": "US"', "string"],
  ["    }", "plain"],
  ["  ],", "plain"],
  ['  "preferences": {', "key"],
  ['    "newsletter": true,', "boolean"],
  ['    "sms": false,', "boolean"],
  ['    "theme": "light"', "string"],
  ["  },", "plain"],
  ['  "total": {', "key"],
  ['    "$numberDecimal": "1245.50"', "string"],
  ["  },", "plain"],
  ['  "createdAt": { "$date": "2024-05-18T14:32:21.123Z" },', "string"],
  ['  "updatedAt": { "$date": "2024-05-18T14:32:21.123Z" },', "string"],
  ['  "__v": { "$numberInt": "0" }', "string"],
  ["}", "plain"],
] as const;

export const indexRows = [
  ["_id_", "{ _id: 1 }", "Unique"],
  ["email_1", "{ email: 1 }", "Unique"],
  ["status_1_createdAt_-1", "{ status: 1, createdAt: -1 }", "Compound"],
  ["createdAt_-1", "{ createdAt: -1 }", "TTL-ready"],
] as const;
