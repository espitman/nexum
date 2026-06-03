import { inspectorTabs, type InspectorTabLabel } from "../mockData";
import type { IndexSummary, SchemaFieldSummary } from "../types";
import { JsonTreeView } from "./JsonTreeView";

type InspectorPanelProps = {
  activeInspectorTab: InspectorTabLabel;
  indexRows: IndexSummary[];
  indexesError: string | null;
  isIndexesLoading: boolean;
  onClose: () => void;
  onInspectorTabChange: (tab: InspectorTabLabel) => void;
  schemaFields: SchemaFieldSummary[];
  selectedDocument: Record<string, unknown> | null;
};

export const InspectorPanel = ({
  activeInspectorTab,
  indexRows,
  indexesError,
  isIndexesLoading,
  onClose,
  onInspectorTabChange,
  schemaFields,
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
      indexRows={indexRows}
      indexesError={indexesError}
      isIndexesLoading={isIndexesLoading}
      schemaFields={schemaFields}
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
  indexRows: IndexSummary[];
  indexesError: string | null;
  isIndexesLoading: boolean;
  schemaFields: SchemaFieldSummary[];
  selectedDocument: Record<string, unknown> | null;
};

const InspectorBody = ({
  activeInspectorTab,
  indexRows,
  indexesError,
  isIndexesLoading,
  schemaFields,
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
      {activeInspectorTab === "Schema" ? (
        <SchemaTree fields={schemaFields} />
      ) : (
        <IndexList
          error={indexesError}
          indexes={indexRows}
          isLoading={isIndexesLoading}
        />
      )}
      <div className="inspector-scroll-spacer" aria-hidden="true" />
    </div>
  );

type IndexListProps = {
  error: string | null;
  indexes: IndexSummary[];
  isLoading: boolean;
};

export const IndexList = ({ error, indexes, isLoading }: IndexListProps) => {
  if (isLoading) {
    return (
      <div className="inspector-empty-state inline">
        <strong>Loading indexes</strong>
        <span>Reading index metadata from MongoDB.</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="inspector-empty-state inline">
        <strong>Unable to load indexes</strong>
        <span>{error}</span>
      </div>
    );
  }

  if (indexes.length === 0) {
    return (
      <div className="inspector-empty-state inline">
        <strong>No indexes found</strong>
        <span>This collection did not return index metadata.</span>
      </div>
    );
  }

  return indexes.map((index) => (
    <div className="index-list-row" key={index.name}>
      <strong>{index.name}</strong>
      <code>{index.key}</code>
      <span>{index.meta}</span>
    </div>
  ));
};

type SchemaTreeNode = {
  children: SchemaTreeNode[];
  field: SchemaFieldSummary | null;
  label: string;
  path: string;
};

type MutableSchemaTreeNode = SchemaTreeNode & {
  childrenByLabel: Map<string, MutableSchemaTreeNode>;
};

type SchemaTreeProps = {
  fields: SchemaFieldSummary[];
};

export const SchemaTree = ({ fields }: SchemaTreeProps) => {
  const nodes = buildSchemaTree(fields);

  if (nodes.length === 0) {
    return (
      <div className="inspector-empty-state inline">
        <strong>No schema sample</strong>
        <span>Run a query with documents to infer this collection schema.</span>
      </div>
    );
  }

  return (
    <div className="schema-tree">
      {nodes.map((node) => (
        <SchemaTreeBranch key={node.path} node={node} />
      ))}
    </div>
  );
};

type SchemaTreeBranchProps = {
  node: SchemaTreeNode;
};

const SchemaTreeBranch = ({ node }: SchemaTreeBranchProps) => {
  const hasChildren = node.children.length > 0;
  const type = node.field?.type ?? "Object";
  const meta = node.field?.meta ?? "Inferred";

  return (
    <div className={`schema-tree-node ${hasChildren ? "has-children" : ""}`}>
      <div className="schema-tree-card" aria-label={node.path}>
        <strong>{node.label}</strong>
        <code>{type}</code>
        <span>{meta}</span>
      </div>
      {hasChildren ? (
        <div className="schema-tree-children">
          {node.children.map((child) => (
            <SchemaTreeBranch key={child.path} node={child} />
          ))}
        </div>
      ) : null}
    </div>
  );
};

const buildSchemaTree = (fields: SchemaFieldSummary[]): SchemaTreeNode[] => {
  const rootNodes = new Map<string, MutableSchemaTreeNode>();

  fields.forEach((field) => {
    const segments = field.name.split(".").filter(Boolean);
    let siblings = rootNodes;
    let currentPath = "";

    segments.forEach((segment, index) => {
      currentPath = currentPath ? `${currentPath}.${segment}` : segment;

      const node =
        siblings.get(segment) ??
        ({
          children: [],
          childrenByLabel: new Map<string, MutableSchemaTreeNode>(),
          field: null,
          label: segment,
          path: currentPath,
        } satisfies MutableSchemaTreeNode);

      if (index === segments.length - 1) {
        node.field = field;
      }

      siblings.set(segment, node);
      siblings = node.childrenByLabel;
    });
  });

  return sortSchemaTreeNodes(
    [...rootNodes.values()].map(convertSchemaTreeNode),
  );
};

const convertSchemaTreeNode = (
  node: MutableSchemaTreeNode,
): SchemaTreeNode => ({
  children: [...node.childrenByLabel.values()].map(convertSchemaTreeNode),
  field: node.field,
  label: node.label,
  path: node.path,
});

const sortSchemaTreeNodes = (nodes: SchemaTreeNode[]): SchemaTreeNode[] =>
  nodes
    .map((node) => ({
      ...node,
      children: sortSchemaTreeNodes(node.children),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
