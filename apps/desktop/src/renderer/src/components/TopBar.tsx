import type { ConnectionStatus, EnvironmentName } from "../types";

type TopBarProps = {
  connectionStatus: ConnectionStatus;
  connectionStatusLabel: string;
  environment: EnvironmentName;
  isReadOnly: boolean;
};

export const TopBar = ({
  connectionStatus,
  connectionStatusLabel,
  environment,
  isReadOnly,
}: TopBarProps) => (
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
    </div>
  </header>
);

const environmentLabel: Record<EnvironmentName, string> = {
  dev: "dev",
  local: "local",
  production: "prod",
  staging: "staging",
};
