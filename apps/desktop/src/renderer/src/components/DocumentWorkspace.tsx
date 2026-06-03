import {
  rows,
  workspaceTabs,
  type NavItemLabel,
  type WorkspaceTabLabel,
} from "../mockData";
import type { HealthState } from "../types";
import type { ConnectionProfile } from "../types";
import { ConnectionManager } from "./ConnectionManager";
import { Icon } from "./Icon";

type DocumentWorkspaceProps = {
  activeSection: NavItemLabel;
  activeWorkspaceTab: WorkspaceTabLabel;
  connections: ConnectionProfile[];
  health: HealthState;
  healthLabel: string;
  isConnectionsLoading: boolean;
  selectedConnectionId: string | null;
  selectedCollectionName: string | null;
  onConnectionError: (title: string, message: string) => void;
  onConnectionsChanged: () => Promise<void>;
  onSelectedConnectionChange: (connectionId: string | null) => void;
  onCollectionClose: () => void;
  onCollectionOpen: () => void;
  onSectionChange: (section: NavItemLabel) => void;
  onWorkspaceTabChange: (tab: WorkspaceTabLabel) => void;
};

export const DocumentWorkspace = ({
  activeSection,
  activeWorkspaceTab,
  connections,
  health,
  healthLabel,
  isConnectionsLoading,
  selectedConnectionId,
  selectedCollectionName,
  onConnectionError,
  onConnectionsChanged,
  onSelectedConnectionChange,
  onCollectionClose,
  onCollectionOpen,
  onSectionChange,
  onWorkspaceTabChange,
}: DocumentWorkspaceProps) => {
  const selectedConnection =
    connections.find((connection) => connection.id === selectedConnectionId) ??
    null;
  const isCollectionWorkspace =
    activeSection === "Explore" && selectedCollectionName !== null;
  const isConnectionManager =
    activeSection === "Connections" && selectedCollectionName === null;
  const exploreEmptyState = getExploreEmptyState(
    selectedConnection,
    onCollectionOpen,
    () => onSectionChange("Connections"),
  );
  const emptyWorkspaceTitle =
    activeSection === "Explore" ? exploreEmptyState.title : activeSection;
  const emptyWorkspaceLabel =
    activeSection === "Explore"
      ? exploreEmptyState.label
      : "This workspace is ready for the next shell route";

  return (
    <section className="document-workspace">
      <CollectionTabBar
        isCollectionWorkspace={isCollectionWorkspace}
        selectedCollectionName={selectedCollectionName}
        onCollectionClose={onCollectionClose}
      />

      {isCollectionWorkspace ? (
        <WorkspaceTabs
          activeWorkspaceTab={activeWorkspaceTab}
          onWorkspaceTabChange={onWorkspaceTabChange}
        />
      ) : (
        <div className="workspace-tabs workspace-tabs-empty" />
      )}

      {isCollectionWorkspace ? (
        <>
          <QuerySection />
          <ResultsSection />
          <WorkspaceFooter health={health} healthLabel={healthLabel} />
        </>
      ) : isConnectionManager ? (
        <ConnectionManager
          connections={connections}
          isLoading={isConnectionsLoading}
          selectedConnectionId={selectedConnectionId}
          onConnectionsChanged={onConnectionsChanged}
          onError={onConnectionError}
          onSelectedConnectionChange={onSelectedConnectionChange}
        />
      ) : (
        <WorkspaceEmptyState
          label={emptyWorkspaceLabel}
          actionLabel={
            activeSection === "Explore" ? exploreEmptyState.actionLabel : "Open"
          }
          onAction={
            activeSection === "Explore"
              ? exploreEmptyState.onAction
              : () => onSectionChange("Explore")
          }
          title={emptyWorkspaceTitle}
        />
      )}
    </section>
  );
};

type CollectionTabBarProps = {
  isCollectionWorkspace: boolean;
  selectedCollectionName: string | null;
  onCollectionClose: () => void;
};

const CollectionTabBar = ({
  isCollectionWorkspace,
  selectedCollectionName,
  onCollectionClose,
}: CollectionTabBarProps) => {
  const collectionLabel = selectedCollectionName?.split(".").at(-1);

  return (
    <div className="collection-tabbar">
      {isCollectionWorkspace ? (
        <div className="collection-tab is-active">
          <Icon name="table" />
          <span>{collectionLabel}</span>
          <button
            aria-label={`Close ${collectionLabel} tab`}
            className="close-mark"
            onClick={onCollectionClose}
            type="button"
          >
            ×
          </button>
        </div>
      ) : null}
      <button className="tab-plus" type="button" aria-label="New tab">
        +
      </button>
    </div>
  );
};

type WorkspaceTabsProps = {
  activeWorkspaceTab: WorkspaceTabLabel;
  onWorkspaceTabChange: (tab: WorkspaceTabLabel) => void;
};

const WorkspaceTabs = ({
  activeWorkspaceTab,
  onWorkspaceTabChange,
}: WorkspaceTabsProps) => (
  <div className="workspace-tabs" role="tablist" aria-label="Collection views">
    {workspaceTabs.map(([icon, label]) => (
      <button
        aria-selected={activeWorkspaceTab === label}
        className={`workspace-tab ${activeWorkspaceTab === label ? "is-active" : ""}`}
        key={label}
        onClick={() => onWorkspaceTabChange(label)}
        role="tab"
        type="button"
      >
        <Icon name={icon} />
        {label}
      </button>
    ))}
  </div>
);

const QuerySection = () => (
  <section className="query-section">
    <div className="query-line">
      <code>
        {
          '{ status: { $in: ["active", "pending"] }, createdAt: { $gte: ISODate("2024-01-01T00:00:00Z") } }'
        }
      </code>
      <span className="raw-toggle">Raw ›</span>
      <button className="plain-icon" type="button" aria-label="Copy query">
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
);

const ResultsSection = () => (
  <section className="results-section">
    <ResultsHeader />
    <ResultsGrid />
  </section>
);

const ResultsHeader = () => (
  <div className="results-header">
    <div>
      <strong>50 documents</strong>
      <button className="plain-icon" type="button" aria-label="Refresh results">
        ↻
      </button>
    </div>
    <div className="result-tools">
      {["grid", "split", "export", "download", "upload", "link"].map((tool) => (
        <button
          className="tool-button"
          key={tool}
          type="button"
          aria-label={tool}
        >
          <Icon name={tool} />
        </button>
      ))}
    </div>
  </div>
);

const ResultsGrid = () => (
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
);

type WorkspaceFooterProps = {
  health: HealthState;
  healthLabel: string;
};

const WorkspaceFooter = ({ health, healthLabel }: WorkspaceFooterProps) => (
  <footer className="workspace-footer">
    <div className="pager-group">
      <button className="page-icon muted" type="button" aria-label="First page">
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
);

type WorkspaceEmptyStateProps = {
  actionLabel: string;
  label: string;
  title: string;
  onAction: () => void;
};

const WorkspaceEmptyState = ({
  actionLabel,
  label,
  title,
  onAction,
}: WorkspaceEmptyStateProps) => (
  <section className="workspace-empty-state">
    <div>
      <Icon name="folder" />
      <h1>{title}</h1>
      <p>{label}</p>
      <button className="run-button compact" type="button" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  </section>
);

const getExploreEmptyState = (
  selectedConnection: ConnectionProfile | null,
  onCollectionOpen: () => void,
  onConnectionsOpen: () => void,
) => {
  if (!selectedConnection) {
    return {
      actionLabel: "Open connections",
      label: "Select a saved connection before exploring databases.",
      onAction: onConnectionsOpen,
      title: "No connection selected",
    };
  }

  if (selectedConnection.status !== "connected") {
    return {
      actionLabel: "Open connection",
      label: "Connect the selected profile before browsing databases.",
      onAction: onConnectionsOpen,
      title: "Connection is not active",
    };
  }

  return {
    actionLabel: "Open users",
    label: "Select a collection from the database tree.",
    onAction: onCollectionOpen,
    title: "No collection selected",
  };
};
