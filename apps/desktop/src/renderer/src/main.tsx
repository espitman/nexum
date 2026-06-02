import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type HealthState =
  | { status: "loading" }
  | { status: "ready"; timestamp: string }
  | { status: "error"; message: string };

type Connection = {
  icon: string;
  label: string;
  active?: boolean;
  more?: boolean;
};

type DatabaseNode = {
  name: string;
  type: "database" | "folder" | "collection";
  depth: number;
  active?: boolean;
  open?: boolean;
};

type DocumentRow = {
  id: string;
  email: string;
  status: "active" | "pending" | "inactive";
  createdAt: string;
  total: string;
};

const connections: Connection[] = [
  { icon: "leaf", label: "MongoDB", active: true },
  { icon: "pg", label: "PostgreSQL" },
  { icon: "rs", label: "Redis" },
  { icon: "my", label: "MySQL", more: true },
];

const navItems = [
  ["folder", "Connections"],
  ["term", "Queries"],
  ["mark", "Bookmarks"],
  ["code", "Snippets"],
  ["check", "Tasks"],
  ["gear", "Settings"],
] as const;

const workspaceTabs = [
  ["table", "Documents"],
  ["query", "Query Builder"],
  ["pipeline", "Aggregation Pipeline"],
  ["indexes", "Indexes"],
  ["schema", "Schema"],
  ["explain", "Explain"],
] as const;

type WorkspaceTabLabel = (typeof workspaceTabs)[number][1];

const inspectorTabs = ["Document", "Schema", "Indexes"] as const;

type InspectorTabLabel = (typeof inspectorTabs)[number];

const databaseNodes: DatabaseNode[] = [
  { name: "admin", type: "database", depth: 0 },
  { name: "app", type: "database", depth: 0, open: true },
  { name: "collections", type: "folder", depth: 1, open: true },
  { name: "users", type: "collection", depth: 2, active: true },
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

const rows: DocumentRow[] = [
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

const inspectorLines = [
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

const schemaFields = [
  ["_id", "ObjectId", "Required"],
  ["email", "String", "Unique"],
  ["status", "String", "Indexed"],
  ["profile.firstName", "String", "Optional"],
  ["profile.lastName", "String", "Optional"],
  ["addresses", "Array", "Nested"],
  ["preferences.newsletter", "Boolean", "Optional"],
  ["total", "Decimal128", "Optional"],
  ["createdAt", "Date", "Indexed"],
] as const;

const indexRows = [
  ["_id_", "{ _id: 1 }", "Unique"],
  ["email_1", "{ email: 1 }", "Unique"],
  ["status_1_createdAt_-1", "{ status: 1, createdAt: -1 }", "Compound"],
  ["createdAt_-1", "{ createdAt: -1 }", "TTL-ready"],
] as const;

const Icon = ({ name }: { name: string }) => (
  <span className={`icon icon-${name}`} />
);

const App = () => {
  const [health, setHealth] = useState<HealthState>({ status: "loading" });
  const [isConnectionRailOpen, setIsConnectionRailOpen] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [activeWorkspaceTab, setActiveWorkspaceTab] =
    useState<WorkspaceTabLabel>("Documents");
  const [activeInspectorTab, setActiveInspectorTab] =
    useState<InspectorTabLabel>("Document");

  useEffect(() => {
    const checkHealth = async () => {
      if (!window.nexum) {
        throw new Error("Preload API is unavailable");
      }

      return window.nexum.health.ping();
    };

    checkHealth()
      .then((result) => {
        setHealth({ status: "ready", timestamp: result.timestamp });
      })
      .catch((error: unknown) => {
        setHealth({
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      });
  }, []);

  const healthLabel =
    health.status === "ready"
      ? "85 ms"
      : health.status === "error"
        ? "offline"
        : "checking";
  const shellClassName = [
    "app-shell",
    isConnectionRailOpen ? "" : "is-connections-closed",
    isInspectorOpen ? "" : "is-inspector-closed",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main className={shellClassName}>
      {isConnectionRailOpen ? (
        <aside className="connection-rail">
          <section className="rail-section rail-connections">
            <div className="rail-heading">
              <span>Connections</span>
              <div className="rail-heading-actions">
                <button
                  className="ghost-icon"
                  type="button"
                  aria-label="Add connection"
                >
                  +
                </button>
              </div>
            </div>
            <button
              className="close-rail"
              type="button"
              aria-label="Close connections panel"
              onClick={() => setIsConnectionRailOpen(false)}
            >
              <span className="panel-arrow panel-arrow-left" />
            </button>
            {connections.map((connection) => (
              <button
                className={`connection-row ${connection.active ? "is-active" : ""}`}
                key={connection.label}
                type="button"
              >
                <Icon name={connection.icon} />
                <span>{connection.label}</span>
                {connection.more ? <span className="row-more">...</span> : null}
              </button>
            ))}
          </section>

          <nav className="primary-nav" aria-label="Nexum sections">
            {navItems.map(([icon, label], index) => (
              <button
                className={`nav-row ${index === 0 ? "is-active" : ""}`}
                key={label}
                type="button"
              >
                <Icon name={icon} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="version-mark">
            <strong>NEXUM</strong>
            <span>v0.8.0</span>
          </div>
        </aside>
      ) : (
        <button
          className="panel-restore panel-restore-left"
          type="button"
          aria-label="Open connections panel"
          onClick={() => setIsConnectionRailOpen(true)}
        >
          <span className="panel-arrow panel-arrow-right" />
        </button>
      )}

      <header className="app-topbar">
        <div className="brand-lockup">
          <strong>Nexum</strong>
        </div>

        <div className="breadcrumb">
          <span>MongoDB 7.0.11</span>
          <span className="crumb-separator">›</span>
          <span>cluster0.us-east-1.mongodb.net:27017</span>
          <span className="crumb-separator">›</span>
          <strong>prod</strong>
        </div>

        <div className="top-actions">
          <span className="env-pill">prod</span>
          <span className="readonly-pill">READ-ONLY</span>
          <button className="run-button" type="button">
            <span className="play-icon" />
            Run
          </button>
          <button className="run-caret" type="button" aria-label="Run options">
            <span className="run-caret-icon" />
          </button>
          <button className="plain-icon" type="button" aria-label="More">
            ...
          </button>
          <button
            className="layout-icon"
            type="button"
            aria-label="Toggle panel"
            onClick={() => setIsInspectorOpen((isOpen) => !isOpen)}
          >
            ◧
          </button>
        </div>
      </header>

      <aside className="database-panel">
        <div className="panel-title-row">
          <span>DATABASES</span>
          <button
            className="plain-icon"
            type="button"
            aria-label="Refresh databases"
          >
            ↻
          </button>
        </div>
        <label className="search-box">
          <Icon name="search" />
          <input type="search" placeholder="Filter databases" />
        </label>

        <div className="tree-list">
          {databaseNodes.map((node) => (
            <button
              className={`tree-row ${node.active ? "is-active" : ""}`}
              key={`${node.depth}-${node.name}`}
              style={{ "--depth": node.depth } as React.CSSProperties}
              type="button"
            >
              <span className={`tree-caret ${node.open ? "is-open" : ""}`}>
                {node.type === "collection" ? "" : "›"}
              </span>
              <Icon name={node.type} />
              <span>{node.name}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="document-workspace">
        <div className="collection-tabbar">
          <button className="collection-tab is-active" type="button">
            <Icon name="table" />
            <span>users</span>
            <span className="close-mark">×</span>
          </button>
          <button className="tab-plus" type="button" aria-label="New tab">
            +
          </button>
        </div>

        <div
          className="workspace-tabs"
          role="tablist"
          aria-label="Collection views"
        >
          {workspaceTabs.map(([icon, label]) => (
            <button
              aria-selected={activeWorkspaceTab === label}
              className={`workspace-tab ${activeWorkspaceTab === label ? "is-active" : ""}`}
              key={label}
              onClick={() => setActiveWorkspaceTab(label)}
              role="tab"
              type="button"
            >
              <Icon name={icon} />
              {label}
            </button>
          ))}
        </div>

        <section className="query-section">
          <div className="query-line">
            <code>
              {
                '{ status: { $in: ["active", "pending"] }, createdAt: { $gte: ISODate("2024-01-01T00:00:00Z") } }'
              }
            </code>
            <span className="raw-toggle">Raw ›</span>
            <button
              className="plain-icon"
              type="button"
              aria-label="Copy query"
            >
              ⧉
            </button>
          </div>

          <div className="query-controls">
            <label>
              <span>Limit</span>
              <input value="50" readOnly />
            </label>
            <label>
              <span>Skip</span>
              <input value="0" readOnly />
            </label>
            <label className="sort-control">
              <span>Sort</span>
              <input value="createdAt: -1" readOnly />
            </label>
            <button className="run-button compact" type="button">
              <span className="play-icon" />
              Run
            </button>
            <button className="options-button" type="button">
              <span>Options</span>
              <span className="select-caret" />
            </button>
          </div>
        </section>

        <section className="results-section">
          <div className="results-header">
            <div>
              <strong>50 documents</strong>
              <button
                className="plain-icon"
                type="button"
                aria-label="Refresh results"
              >
                ↻
              </button>
            </div>
            <div className="result-tools">
              {["grid", "split", "export", "download", "upload", "link"].map(
                (tool) => (
                  <button
                    className="tool-button"
                    key={tool}
                    type="button"
                    aria-label={tool}
                  >
                    <Icon name={tool} />
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="data-grid">
            <div className="grid-row grid-head">
              <span className="checkbox" />
              <span>_id</span>
              <span>email</span>
              <span>status</span>
              <span>createdAt</span>
              <span>total</span>
            </div>
            {rows.map((row) => (
              <div className="grid-row" key={row.id}>
                <span className="checkbox" />
                <span className="mono">{row.id}</span>
                <span>{row.email}</span>
                <span>
                  <mark className={`status-badge status-${row.status}`}>
                    {row.status}
                  </mark>
                </span>
                <span>{row.createdAt}</span>
                <span>{row.total}</span>
              </div>
            ))}
          </div>
        </section>

        <footer className="workspace-footer">
          <div className="pager-group">
            <button
              className="page-icon muted"
              type="button"
              aria-label="First page"
            >
              <span className="pagination-icon pagination-first" />
            </button>
            <span>Page</span>
            <input value="1" readOnly />
            <span>of 10</span>
            <button className="page-icon" type="button" aria-label="Next page">
              <span className="pagination-icon pagination-next" />
            </button>
            <button className="page-icon" type="button" aria-label="Last page">
              <span className="pagination-icon pagination-last" />
            </button>
            <button className="page-size" type="button">
              <span>50 / page</span>
              <span className="select-caret" />
            </button>
          </div>
          <div className="range-status">
            <span>1 – 50 of 462</span>
            <span className={`health-dot health-${health.status}`} />
            <span>{healthLabel}</span>
          </div>
        </footer>
      </section>

      {isInspectorOpen ? (
        <aside className="inspector-panel">
          <div
            className="inspector-tabs"
            role="tablist"
            aria-label="Inspector views"
          >
            {inspectorTabs.map((tab) => (
              <button
                aria-selected={activeInspectorTab === tab}
                className={activeInspectorTab === tab ? "is-active" : ""}
                key={tab}
                onClick={() => setActiveInspectorTab(tab)}
                role="tab"
                type="button"
              >
                {tab}
              </button>
            ))}
            <button
              className="close-inspector"
              type="button"
              aria-label="Close inspector"
              onClick={() => setIsInspectorOpen(false)}
            >
              ×
            </button>
          </div>

          <div className="view-row">
            <span>View</span>
            <button type="button">
              <span>Extended JSON</span>
              <span className="select-caret" />
            </button>
            <button
              className="plain-icon"
              type="button"
              aria-label="Copy document"
            >
              ⧉
            </button>
            <button
              className="plain-icon"
              type="button"
              aria-label="Expand document"
            >
              ⛶
            </button>
            <button
              className="plain-icon"
              type="button"
              aria-label="Document options"
            >
              ▣
            </button>
          </div>

          {activeInspectorTab === "Document" ? (
            <pre className="json-viewer" aria-label="Selected document JSON">
              {inspectorLines.map(([line, tone], index) => (
                <span className="json-line" key={`${index}-${line}`}>
                  <span className="line-number">{index + 1}</span>
                  <code className={`json-${tone}`}>{line}</code>
                </span>
              ))}
            </pre>
          ) : (
            <div className="inspector-list" role="tabpanel">
              {(activeInspectorTab === "Schema" ? schemaFields : indexRows).map(
                ([name, value, meta]) => (
                  <div className="inspector-list-row" key={name}>
                    <strong>{name}</strong>
                    <code>{value}</code>
                    <span>{meta}</span>
                  </div>
                ),
              )}
            </div>
          )}
        </aside>
      ) : (
        <button
          className="panel-restore panel-restore-right"
          type="button"
          aria-label="Open document inspector"
          onClick={() => setIsInspectorOpen(true)}
        >
          <span className="panel-arrow panel-arrow-left" />
        </button>
      )}
    </main>
  );
};

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
