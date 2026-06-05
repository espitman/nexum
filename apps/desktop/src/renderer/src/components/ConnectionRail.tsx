import { navItems, type NavItemLabel } from "../mockData";
import { Icon } from "./Icon";

type ConnectionRailProps = {
  activeSection: NavItemLabel;
  onSectionChange: (section: NavItemLabel) => void;
};

export const ConnectionRail = ({
  activeSection,
  onSectionChange,
}: ConnectionRailProps) => (
  <aside className="connection-rail">
    <nav className="primary-nav" aria-label="Nexum sections">
      {navItems.map(([icon, label]) => (
        <button
          className={`nav-row ${activeSection === label ? "is-active" : ""}`}
          key={label}
          onClick={() => onSectionChange(label)}
          type="button"
        >
          <span className="nav-row-content">
            <Icon name={icon} />
            <span className="nav-row-label">{label}</span>
          </span>
        </button>
      ))}
    </nav>
  </aside>
);
