import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
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
  contextNodeId: string | null;
  depth: number;
  expandedNodeIds: Set<string>;
  node: ExplorerNodeDto;
  onBookmarkMenuOpen: (
    node: ExplorerNodeDto,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => void;
  onCollectionSelect: (collectionName: string) => void;
  onToggleNode: (nodeId: string) => void;
  selectedCollectionName: string | null;
};

type ExplorerBookmarkContextMenu = {
  left: number;
  node: ExplorerNodeDto;
  top: number;
};

type ExplorerBookmarkEventDetail = {
  collection?: string;
  connectionId: string;
  connectionName: string;
  database: string;
  kind: "collection" | "database";
};

const addBookmarkEventName = "nexum:add-bookmark";

const getNodeIconName = (node: ExplorerNodeDto): string =>
  node.type === "view" ? "table" : node.type;

const getNodeSelectionKey = (node: ExplorerNodeDto): string =>
  node.path.join(".");

const encodeNodePart = (value: string): string => encodeURIComponent(value);

const createDatabaseNodeId = (
  connectionId: string,
  databaseName: string,
): string =>
  [
    "mongodb",
    encodeNodePart(connectionId),
    "database",
    encodeNodePart(databaseName),
  ].join(":");

const createFolderNodeId = (
  connectionId: string,
  databaseName: string,
  folder: "collections" | "views",
): string =>
  [
    "mongodb",
    encodeNodePart(connectionId),
    "database",
    encodeNodePart(databaseName),
    "folder",
    folder,
  ].join(":");

const isBookmarkableExplorerNode = (node: ExplorerNodeDto): boolean =>
  node.type === "database" || node.type === "collection" || node.type === "view";

const getExplorerContextMenuPosition = (
  clientX: number,
  clientY: number,
): { left: number; top: number } => ({
  left: Math.max(10, Math.min(clientX, window.innerWidth - 230)),
  top: Math.max(10, Math.min(clientY, window.innerHeight - 72)),
});

export const DatabasePanel = ({
  connectionId,
  connectionName,
  selectedCollectionName,
  onCollectionSelect,
}: DatabasePanelProps) => {
  const queryClient = useQueryClient();
  const [bookmarkMenu, setBookmarkMenu] =
    useState<ExplorerBookmarkContextMenu | null>(null);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(
    () => new Set([connectionId]),
  );
  const selectedPathExpandedNodeIds = useMemo(() => {
    const next = new Set(expandedNodeIds);

    if (!selectedCollectionName) {
      return next;
    }

    const [databaseName] = selectedCollectionName.split(".");

    if (!databaseName) {
      return next;
    }

    next.add(connectionId);
    next.add(createDatabaseNodeId(connectionId, databaseName));
    next.add(createFolderNodeId(connectionId, databaseName, "collections"));

    return next;
  }, [connectionId, expandedNodeIds, selectedCollectionName]);
  const rootNodesQuery = useQuery({
    queryKey: ["explorer", connectionId, "root"],
    queryFn: async () => {
      if (!window.nexum) {
        throw new Error("Preload API is unavailable");
      }

      return window.nexum.explorer.listRootNodes({ connectionId });
    },
  });

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

  const openBookmarkMenu = useCallback(
    (node: ExplorerNodeDto, event: ReactMouseEvent<HTMLButtonElement>) => {
      if (!isBookmarkableExplorerNode(node)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const position = getExplorerContextMenuPosition(
        event.clientX,
        event.clientY,
      );
      setBookmarkMenu({ ...position, node });
    },
    [],
  );

  const addExplorerBookmark = () => {
    if (!bookmarkMenu) {
      return;
    }

    const [database, collection] = bookmarkMenu.node.path;

    if (!database) {
      return;
    }

    const detail: ExplorerBookmarkEventDetail =
      bookmarkMenu.node.type === "database" || !collection
        ? {
            connectionId,
            connectionName,
            database,
            kind: "database",
          }
        : {
            collection,
            connectionId,
            connectionName,
            database,
            kind: "collection",
          };

    window.dispatchEvent(
      new CustomEvent<ExplorerBookmarkEventDetail>(addBookmarkEventName, {
        detail,
      }),
    );
    setBookmarkMenu(null);
  };

  useEffect(() => {
    if (!bookmarkMenu) {
      return undefined;
    }

    const closeMenu = () => setBookmarkMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("contextmenu", closeMenu);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("contextmenu", closeMenu);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [bookmarkMenu]);

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

        {selectedPathExpandedNodeIds.has(connectionId) ? (
          rootNodesQuery.isLoading ? (
            <ExplorerPanelState label="Loading databases" />
          ) : rootNodesQuery.error ? (
            <ExplorerPanelState
              label="Unable to load databases"
              actionLabel="Retry"
              onAction={() => void rootNodesQuery.refetch()}
            />
          ) : (rootNodesQuery.data ?? []).length === 0 ? (
            <ExplorerPanelState label="No databases found" />
          ) : (
            (rootNodesQuery.data ?? []).map((node) => (
              <ExplorerTreeNode
                connectionId={connectionId}
                contextNodeId={bookmarkMenu?.node.id ?? null}
                depth={1}
                expandedNodeIds={selectedPathExpandedNodeIds}
                key={node.id}
                node={node}
                onBookmarkMenuOpen={openBookmarkMenu}
                onCollectionSelect={onCollectionSelect}
                onToggleNode={toggleNode}
                selectedCollectionName={selectedCollectionName}
              />
            ))
          )
        ) : null}
      </div>
      {bookmarkMenu ? (
        <div
          className="explorer-context-menu"
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
          style={{
            left: `${bookmarkMenu.left}px`,
            top: `${bookmarkMenu.top}px`,
          }}
        >
          <button type="button" onClick={addExplorerBookmark}>
            Add to bookmarks
          </button>
        </div>
      ) : null}
    </aside>
  );
};

const ExplorerTreeNode = ({
  connectionId,
  contextNodeId,
  depth,
  expandedNodeIds,
  node,
  onBookmarkMenuOpen,
  onCollectionSelect,
  onToggleNode,
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
  const isSelectable = node.type === "collection" || node.type === "view";
  const selectionKey = getNodeSelectionKey(node);
  const isContextTarget = contextNodeId === node.id;
  const isSelected = selectionKey === selectedCollectionName;
  const rowRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isSelected) {
      return;
    }

    rowRef.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [isSelected]);

  return (
    <>
      <button
        ref={rowRef}
        className={`tree-row ${isSelected ? "is-active" : ""} ${
          isContextTarget ? "is-context-target" : ""
        }`}
        onClick={() => {
          if (isSelectable) {
            onCollectionSelect(selectionKey);
            return;
          }

          if (node.hasChildren) {
            onToggleNode(node.id);
          }
        }}
        onContextMenu={(event) => onBookmarkMenuOpen(node, event)}
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
        ) : (childrenQuery.data ?? []).length === 0 ? (
          <ExplorerPanelState depth={depth + 1} label="Empty" />
        ) : (
          (childrenQuery.data ?? []).map((childNode) => (
            <ExplorerTreeNode
              connectionId={connectionId}
              contextNodeId={contextNodeId}
              depth={depth + 1}
              expandedNodeIds={expandedNodeIds}
              key={childNode.id}
              node={childNode}
              onBookmarkMenuOpen={onBookmarkMenuOpen}
              onCollectionSelect={onCollectionSelect}
              onToggleNode={onToggleNode}
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
