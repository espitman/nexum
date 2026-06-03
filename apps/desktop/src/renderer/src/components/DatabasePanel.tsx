import React from "react";
import { databaseNodes, type NavItemLabel } from "../mockData";
import { Icon } from "./Icon";

type DatabasePanelProps = {
  selectedCollectionName: string | null;
  onCollectionSelect: (collectionName: string) => void;
  onSectionChange: (section: NavItemLabel) => void;
};

export const DatabasePanel = ({
  selectedCollectionName,
  onCollectionSelect,
  onSectionChange,
}: DatabasePanelProps) => (
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
          className={`tree-row ${node.name === selectedCollectionName ? "is-active" : ""}`}
          key={`${node.depth}-${node.name}`}
          onClick={() => {
            if (node.type === "collection") {
              onCollectionSelect(node.name);
              onSectionChange("Explore");
            }
          }}
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
);
