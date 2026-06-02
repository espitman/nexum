import { navItems, type NavItemLabel } from "../mockData";
import type { ConnectionProfile } from "../types";
import { Icon } from "./Icon";

type ConnectionRailProps = {
  activeSection: NavItemLabel;
  connections: ConnectionProfile[];
  onClose: () => void;
  onConnectionAdd: () => void;
  onConnectionSelect: (connectionId: string) => void;
  onSectionChange: (section: NavItemLabel) => void;
  selectedConnectionId: string | null;
};

export const ConnectionRail = ({
  activeSection,
  connections,
  onClose,
  onConnectionAdd,
  onConnectionSelect,
  onSectionChange,
  selectedConnectionId,
}: ConnectionRailProps) => (
  <aside className="connection-rail">
    <section className="rail-section rail-connections">
      <div className="rail-heading">
        <span>Connections</span>
        <div className="rail-heading-actions">
          <button
            className="ghost-icon"
            type="button"
            aria-label="Add connection"
            onClick={onConnectionAdd}
          >
            +
          </button>
        </div>
      </div>
      <button
        className="close-rail"
        type="button"
        aria-label="Close connections panel"
        onClick={onClose}
      >
        <span className="panel-arrow panel-arrow-left" />
      </button>
      {connections.length === 0 ? (
        <button
          className="connection-row muted-row"
          type="button"
          onClick={onConnectionAdd}
        >
          <Icon name="leaf" />
          <span>New MongoDB</span>
        </button>
      ) : (
        connections.map((connection) => (
          <button
            className={`connection-row ${
              connection.id === selectedConnectionId ? "is-active" : ""
            }`}
            key={connection.id}
            onClick={() => onConnectionSelect(connection.id)}
            type="button"
          >
            <Icon name="leaf" />
            <span>{connection.name}</span>
            <span className={`rail-status-dot status-${connection.status}`} />
          </button>
        ))
      )}
    </section>

    <nav className="primary-nav" aria-label="Nexum sections">
      {navItems.map(([icon, label]) => (
        <button
          className={`nav-row ${activeSection === label ? "is-active" : ""}`}
          key={label}
          onClick={() => onSectionChange(label)}
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
);
