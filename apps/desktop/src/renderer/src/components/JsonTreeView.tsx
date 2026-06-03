import { collapseAllNested, JsonView } from "react-json-view-lite";
import type { Props as JsonViewProps } from "react-json-view-lite";

const jsonTreeViewerStyles: NonNullable<JsonViewProps["style"]> = {
  basicChildStyle: "json-tree-viewer-child",
  booleanValue: "json-tree-viewer-boolean",
  childFieldsContainer: "json-tree-viewer-children",
  clickableLabel: "json-tree-viewer-clickable-label",
  collapsedContent: "json-tree-viewer-collapsed-content",
  collapseIcon: "json-tree-viewer-collapse-icon",
  container: "json-tree-viewer",
  expandIcon: "json-tree-viewer-expand-icon",
  label: "json-tree-viewer-label",
  nullValue: "json-tree-viewer-null",
  numberValue: "json-tree-viewer-number",
  otherValue: "json-tree-viewer-other",
  punctuation: "json-tree-viewer-punctuation",
  quotesForFieldNames: false,
  stringValue: "json-tree-viewer-string",
  undefinedValue: "json-tree-viewer-undefined",
};

type JsonTreeViewProps = {
  data: JsonViewProps["data"];
};

export const JsonTreeView = ({ data }: JsonTreeViewProps) => (
  <JsonView
    clickToExpandNode
    compactTopLevel
    data={data}
    shouldExpandNode={collapseAllNested}
    style={jsonTreeViewerStyles}
  />
);
