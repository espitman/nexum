import {
  indexRows,
  inspectorLines,
  inspectorTabs,
  schemaFields,
  type InspectorTabLabel,
} from "../mockData";

type InspectorPanelProps = {
  activeInspectorTab: InspectorTabLabel;
  onClose: () => void;
  onInspectorTabChange: (tab: InspectorTabLabel) => void;
};

export const InspectorPanel = ({
  activeInspectorTab,
  onClose,
  onInspectorTabChange,
}: InspectorPanelProps) => (
  <aside className="inspector-panel">
    <InspectorTabs
      activeInspectorTab={activeInspectorTab}
      onClose={onClose}
      onInspectorTabChange={onInspectorTabChange}
    />
    <InspectorToolbar />
    <InspectorBody activeInspectorTab={activeInspectorTab} />
  </aside>
);

type InspectorTabsProps = {
  activeInspectorTab: InspectorTabLabel;
  onClose: () => void;
  onInspectorTabChange: (tab: InspectorTabLabel) => void;
};

const InspectorTabs = ({
  activeInspectorTab,
  onClose,
  onInspectorTabChange,
}: InspectorTabsProps) => (
  <div className="inspector-tabs" role="tablist" aria-label="Inspector views">
    {inspectorTabs.map((tab) => (
      <button
        aria-selected={activeInspectorTab === tab}
        className={activeInspectorTab === tab ? "is-active" : ""}
        key={tab}
        onClick={() => onInspectorTabChange(tab)}
        role="tab"
        type="button"
      >
        {tab}
      </button>
    ))}
    <button
      className="close-inspector"
      type="button"
      aria-label="Close inspector"
      onClick={onClose}
    >
      ×
    </button>
  </div>
);

const InspectorToolbar = () => (
  <div className="view-row">
    <span>View</span>
    <button type="button">
      <span>Extended JSON</span>
      <span className="select-caret" />
    </button>
    <button className="plain-icon" type="button" aria-label="Copy document">
      ⧉
    </button>
    <button className="plain-icon" type="button" aria-label="Expand document">
      ⛶
    </button>
    <button className="plain-icon" type="button" aria-label="Document options">
      ▣
    </button>
  </div>
);

type InspectorBodyProps = {
  activeInspectorTab: InspectorTabLabel;
};

const InspectorBody = ({ activeInspectorTab }: InspectorBodyProps) =>
  activeInspectorTab === "Document" ? (
    <pre className="json-viewer" aria-label="Selected document JSON">
      {inspectorLines.map(([line, tone], index) => (
        <span className="json-line" key={`${index}-${line}`}>
          <span className="line-number">{index + 1}</span>
          <code className={`json-${tone}`}>{line}</code>
        </span>
      ))}
    </pre>
  ) : (
    <div className="inspector-list" role="tabpanel">
      {(activeInspectorTab === "Schema" ? schemaFields : indexRows).map(
        ([name, value, meta]) => (
          <div className="inspector-list-row" key={name}>
            <strong>{name}</strong>
            <code>{value}</code>
            <span>{meta}</span>
          </div>
        ),
      )}
    </div>
  );
