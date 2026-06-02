import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type HealthState =
  | { status: "idle" | "loading" }
  | { status: "ready"; timestamp: string }
  | { status: "error"; message: string };

const App = () => {
  const [health, setHealth] = useState<HealthState>({ status: "idle" });

  useEffect(() => {
    setHealth({ status: "loading" });

    window.nexum.health
      .ping()
      .then((result) => {
        setHealth({ status: "ready", timestamp: result.timestamp });
      })
      .catch((error: unknown) => {
        setHealth({
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      });
  }, []);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">N</span>
          <div>
            <h1>Nexum</h1>
            <p>Database Workspace</p>
          </div>
        </div>

        <section className="sidebar-section">
          <p className="section-label">Connections</p>
          <button className="connection active" type="button">
            <span className="status-dot" />
            Local MongoDB
          </button>
        </section>
      </aside>

      <section className="workspace">
        <header className="top-bar">
          <div>
            <p className="eyebrow">Active workspace</p>
            <h2>MongoDB Documents</h2>
          </div>
          <div className="top-bar-actions">
            <span className="badge">local</span>
            <span className="badge subtle">read-write</span>
            <button type="button">Run</button>
          </div>
        </header>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Preload health check</p>
              <h3>Typed IPC is wired</h3>
            </div>
            <p className={`health health-${health.status}`}>
              {health.status === "ready"
                ? `ready at ${new Date(health.timestamp).toLocaleTimeString()}`
                : health.status}
            </p>
          </div>

          <div className="query-preview">
            <code>{"{}"}</code>
          </div>

          <div className="empty-grid">
            <div>_id</div>
            <div>email</div>
            <div>status</div>
            <div>createdAt</div>
          </div>
        </section>
      </section>
    </main>
  );
};

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
