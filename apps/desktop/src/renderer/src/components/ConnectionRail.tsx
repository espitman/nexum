import { connections, navItems, type NavItemLabel } from "../mockData";
import { Icon } from "./Icon";

type ConnectionRailProps = {
  activeSection: NavItemLabel;
  onClose: () => void;
  onSectionChange: (section: NavItemLabel) => void;
};

export const ConnectionRail = ({
  activeSection,
  onClose,
  onSectionChange,
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
