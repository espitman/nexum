import {
  indexRows,
  inspectorTabs,
  schemaFields,
  type InspectorTabLabel,
} from "../mockData";
import { JsonTreeView } from "./JsonTreeView";

type InspectorPanelProps = {
  activeInspectorTab: InspectorTabLabel;
  onClose: () => void;
  onInspectorTabChange: (tab: InspectorTabLabel) => void;
  selectedDocument: Record<string, unknown> | null;
};

export const InspectorPanel = ({
  activeInspectorTab,
  onClose,
  onInspectorTabChange,
  selectedDocument,
}: InspectorPanelProps) => (
  <aside className="inspector-panel">
    <InspectorTabs
      activeInspectorTab={activeInspectorTab}
      onClose={onClose}
      onInspectorTabChange={onInspectorTabChange}
    />
    <InspectorToolbar />
    <InspectorBody
      activeInspectorTab={activeInspectorTab}
      selectedDocument={selectedDocument}
    />
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
  selectedDocument: Record<string, unknown> | null;
};

const InspectorBody = ({
  activeInspectorTab,
  selectedDocument,
}: InspectorBodyProps) =>
  activeInspectorTab === "Document" ? (
    selectedDocument ? (
      <div
        className="inspector-document-viewer"
        role="tabpanel"
        aria-label="Selected document JSON"
      >
        <JsonTreeView data={selectedDocument} />
      </div>
    ) : (
      <div className="inspector-empty-state" role="tabpanel">
        <strong>No document selected</strong>
        <span>Select a row in Documents to inspect its JSON.</span>
      </div>
    )
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
