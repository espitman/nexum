type TopBarProps = {
  onToggleInspector: () => void;
};

export const TopBar = ({ onToggleInspector }: TopBarProps) => (
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
        onClick={onToggleInspector}
      >
        ◧
      </button>
    </div>
  </header>
);
