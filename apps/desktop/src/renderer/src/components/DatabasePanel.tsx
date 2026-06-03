import { useMemo, useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExplorerNodeDto } from "../../../ipc/contracts";
import { Icon } from "./Icon";

type DatabasePanelProps = {
  connectionId: string;
  connectionName: string;
  selectedCollectionName: string | null;
  onCollectionSelect: (collectionName: string) => void;
};

type ExplorerTreeNodeProps = {
  connectionId: string;
  depth: number;
  expandedNodeIds: Set<string>;
  node: ExplorerNodeDto;
  onCollectionSelect: (collectionName: string) => void;
  onToggleNode: (nodeId: string) => void;
  queryText: string;
  selectedCollectionName: string | null;
};

const getNodeIconName = (node: ExplorerNodeDto): string =>
  node.type === "view" ? "table" : node.type;

const getNodeSelectionKey = (node: ExplorerNodeDto): string =>
  node.path.join(".");

const matchesQuery = (label: string, queryText: string): boolean =>
  label.toLowerCase().includes(queryText.toLowerCase());

export const DatabasePanel = ({
  connectionId,
  connectionName,
  selectedCollectionName,
  onCollectionSelect,
}: DatabasePanelProps) => {
  const queryClient = useQueryClient();
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(
    () => new Set([connectionId]),
  );
  const [queryText, setQueryText] = useState("");
  const rootNodesQuery = useQuery({
    queryKey: ["explorer", connectionId, "root"],
    queryFn: async () => {
      if (!window.nexum) {
        throw new Error("Preload API is unavailable");
      }

      return window.nexum.explorer.listRootNodes({ connectionId });
    },
  });
  const visibleRootNodes = useMemo(
    () =>
      (rootNodesQuery.data ?? []).filter((node) =>
        queryText.trim() ? matchesQuery(node.label, queryText.trim()) : true,
      ),
    [queryText, rootNodesQuery.data],
  );

  const toggleNode = (nodeId: string) => {
    setExpandedNodeIds((current) => {
      const next = new Set(current);

      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }

      return next;
    });
  };

  const refreshExplorer = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["explorer", connectionId],
    });
  };

  return (
    <aside className="database-panel">
      <div className="panel-title-row">
        <span>DATABASES</span>
        <button
          className="plain-icon"
          type="button"
          aria-label="Refresh databases"
          onClick={() => void refreshExplorer()}
        >
          ↻
        </button>
      </div>
      <label className="search-box">
        <Icon name="search" />
        <input
          type="search"
          placeholder="Filter databases"
          value={queryText}
          onChange={(event) => setQueryText(event.target.value)}
        />
      </label>

      <div className="tree-list">
        <button
          className="tree-row explorer-root-row is-open"
          onClick={() => toggleNode(connectionId)}
          style={{ "--depth": 0 } as CSSProperties}
          type="button"
        >
          <span className="tree-caret is-open">›</span>
          <Icon name="leaf" />
          <span>{connectionName}</span>
        </button>

        {expandedNodeIds.has(connectionId) ? (
          rootNodesQuery.isLoading ? (
            <ExplorerPanelState label="Loading databases" />
          ) : rootNodesQuery.error ? (
            <ExplorerPanelState
              label="Unable to load databases"
              actionLabel="Retry"
              onAction={() => void rootNodesQuery.refetch()}
            />
          ) : visibleRootNodes.length === 0 ? (
            <ExplorerPanelState label="No databases found" />
          ) : (
            visibleRootNodes.map((node) => (
              <ExplorerTreeNode
                connectionId={connectionId}
                depth={1}
                expandedNodeIds={expandedNodeIds}
                key={node.id}
                node={node}
                onCollectionSelect={onCollectionSelect}
                onToggleNode={toggleNode}
                queryText={queryText.trim()}
                selectedCollectionName={selectedCollectionName}
              />
            ))
          )
        ) : null}
      </div>
    </aside>
  );
};

const ExplorerTreeNode = ({
  connectionId,
  depth,
  expandedNodeIds,
  node,
  onCollectionSelect,
  onToggleNode,
  queryText,
  selectedCollectionName,
}: ExplorerTreeNodeProps) => {
  const isExpanded = expandedNodeIds.has(node.id);
  const childrenQuery = useQuery({
    enabled: node.hasChildren && isExpanded,
    queryKey: ["explorer", connectionId, "children", node.id],
    queryFn: async () => {
      if (!window.nexum) {
        throw new Error("Preload API is unavailable");
      }

      return window.nexum.explorer.listChildren({
        connectionId,
        nodeId: node.id,
      });
    },
  });
  const visibleChildren = useMemo(
    () =>
      (childrenQuery.data ?? []).filter((childNode) =>
        queryText ? matchesQuery(childNode.label, queryText) : true,
      ),
    [childrenQuery.data, queryText],
  );
  const isSelectable = node.type === "collection" || node.type === "view";
  const selectionKey = getNodeSelectionKey(node);

  return (
    <>
      <button
        className={`tree-row ${selectionKey === selectedCollectionName ? "is-active" : ""}`}
        onClick={() => {
          if (isSelectable) {
            onCollectionSelect(selectionKey);
            return;
          }

          if (node.hasChildren) {
            onToggleNode(node.id);
          }
        }}
        style={{ "--depth": depth } as CSSProperties}
        type="button"
      >
        <span className={`tree-caret ${isExpanded ? "is-open" : ""}`}>
          {node.hasChildren ? "›" : ""}
        </span>
        <Icon name={getNodeIconName(node)} />
        <span>{node.label}</span>
      </button>

      {node.hasChildren && isExpanded ? (
        childrenQuery.isLoading ? (
          <ExplorerPanelState depth={depth + 1} label="Loading" />
        ) : childrenQuery.error ? (
          <ExplorerPanelState
            depth={depth + 1}
            label="Unable to load"
            actionLabel="Retry"
            onAction={() => void childrenQuery.refetch()}
          />
        ) : visibleChildren.length === 0 ? (
          <ExplorerPanelState depth={depth + 1} label="Empty" />
        ) : (
          visibleChildren.map((childNode) => (
            <ExplorerTreeNode
              connectionId={connectionId}
              depth={depth + 1}
              expandedNodeIds={expandedNodeIds}
              key={childNode.id}
              node={childNode}
              onCollectionSelect={onCollectionSelect}
              onToggleNode={onToggleNode}
              queryText={queryText}
              selectedCollectionName={selectedCollectionName}
            />
          ))
        )
      ) : null}
    </>
  );
};

type ExplorerPanelStateProps = {
  actionLabel?: string;
  depth?: number;
  label: string;
  onAction?: () => void;
};

const ExplorerPanelState = ({
  actionLabel,
  depth = 1,
  label,
  onAction,
}: ExplorerPanelStateProps) => (
  <div
    className="explorer-panel-state"
    style={{ "--depth": depth } as CSSProperties}
  >
    <span>{label}</span>
    {actionLabel && onAction ? (
      <button type="button" onClick={onAction}>
        {actionLabel}
      </button>
    ) : null}
  </div>
);
