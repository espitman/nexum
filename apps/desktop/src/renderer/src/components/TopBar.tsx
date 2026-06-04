import type { ConnectionStatus, EnvironmentName } from "../types";

type TopBarProps = {
  collectionName: string | null;
  connectionName: string | null;
  connectionStatus: ConnectionStatus;
  connectionStatusLabel: string;
  environment: EnvironmentName;
  isReadOnly: boolean;
};

export const TopBar = ({
  collectionName,
  connectionName,
  connectionStatus,
  connectionStatusLabel,
  environment,
  isReadOnly,
}: TopBarProps) => {
  const crumbs = getBreadcrumbItems({
    collectionName,
    connectionName,
    environment,
  });

  return (
    <header className="app-topbar">
      <div className="brand-lockup">
        <strong>Nexum</strong>
      </div>

      <nav className="breadcrumb" aria-label="Connection context">
        {crumbs.map((crumb, index) => (
          <span className="breadcrumb-item" key={`${crumb}-${index}`}>
            {index > 0 ? (
              <span className="crumb-separator" aria-hidden="true">
                ›
              </span>
            ) : null}
            {index === crumbs.length - 1 ? <strong>{crumb}</strong> : crumb}
          </span>
        ))}
      </nav>

      <div className="top-actions">
        <span
          className={`connection-status-pill connection-status-${connectionStatus}`}
        >
          <span className="connection-status-dot" />
          {connectionStatusLabel}
        </span>
        <span className={`env-pill env-${environment}`}>
          {environmentLabel[environment]}
        </span>
        {isReadOnly ? <span className="readonly-pill">READ-ONLY</span> : null}
      </div>
    </header>
  );
};

const getBreadcrumbItems = ({
  collectionName,
  connectionName,
  environment,
}: {
  collectionName: string | null;
  connectionName: string | null;
  environment: EnvironmentName;
}): string[] => {
  const selectedPath = parseCollectionPath(collectionName);

  return [
    "MongoDB",
    connectionName ?? "No connection",
    ...(selectedPath ? [selectedPath.database, selectedPath.collection] : []),
    environmentLabel[environment],
  ];
};

const parseCollectionPath = (
  collectionName: string | null,
): { collection: string; database: string } | null => {
  if (!collectionName) {
    return null;
  }

  const [database, ...collectionParts] = collectionName.split(".");
  const collection = collectionParts.join(".");

  if (!database || !collection) {
    return null;
  }

  return { collection, database };
};

const environmentLabel: Record<EnvironmentName, string> = {
  dev: "dev",
  local: "local",
  production: "prod",
  staging: "staging",
};
