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

const Icon = ({ name }: { name: string }) => (
  <span className={`icon icon-${name}`} />
);

const App = () => {
  const [health, setHealth] = useState<HealthState>({ status: "loading" });

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

  return (
    <main className="app-shell">
      <aside className="connection-rail">
        <section className="rail-section rail-connections">
          <div className="rail-heading">
            <span>Connections</span>
            <button
              className="ghost-icon"
              type="button"
              aria-label="Add connection"
            >
              +
            </button>
          </div>
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

      <header className="app-topbar">
        <div className="brand-lockup">
          <span className="brand-orbit" />
          <strong>Nexum</strong>
          <span className="chevron">⌄</span>
        </div>

        <div className="breadcrumb">
          <span className="mongo-dot" />
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
            ⌄
          </button>
          <button className="plain-icon" type="button" aria-label="More">
            ...
          </button>
          <button
            className="layout-icon"
            type="button"
            aria-label="Toggle panel"
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

        <div className="workspace-tabs">
          {workspaceTabs.map(([icon, label], index) => (
            <button
              className={`workspace-tab ${index === 0 ? "is-active" : ""}`}
              key={label}
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
              Options⌄
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
              className="plain-icon muted"
              type="button"
              aria-label="First page"
            >
              ≪
            </button>
            <span>Page</span>
            <input value="1" readOnly />
            <span>of 10</span>
            <button className="plain-icon" type="button" aria-label="Next page">
              ›
            </button>
            <button className="plain-icon" type="button" aria-label="Last page">
              ≫
            </button>
            <button className="page-size" type="button">
              50 / page⌄
            </button>
          </div>
          <div className="range-status">
            <span>1 – 50 of 462</span>
            <span className={`health-dot health-${health.status}`} />
            <span>{healthLabel}</span>
          </div>
        </footer>
      </section>

      <aside className="inspector-panel">
        <div className="inspector-tabs">
          <button className="is-active" type="button">
            Document
          </button>
          <button type="button">Schema</button>
          <button type="button">Indexes</button>
          <button
            className="close-inspector"
            type="button"
            aria-label="Close inspector"
          >
            ×
          </button>
        </div>

        <div className="view-row">
          <span>View</span>
          <button type="button">Extended JSON⌄</button>
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

        <pre className="json-viewer" aria-label="Selected document JSON">
          {inspectorLines.map(([line, tone], index) => (
            <span className="json-line" key={`${index}-${line}`}>
              <span className="line-number">{index + 1}</span>
              <code className={`json-${tone}`}>{line}</code>
            </span>
          ))}
        </pre>
      </aside>
    </main>
  );
};

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
