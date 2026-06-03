import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  workspaceTabs,
  type NavItemLabel,
  type WorkspaceTabLabel,
} from "../mockData";
import type { ConnectionProfile, HealthState } from "../types";
import { ConnectionManager } from "./ConnectionManager";
import { Icon } from "./Icon";

type DocumentWorkspaceProps = {
  activeSection: NavItemLabel;
  activeWorkspaceTab: WorkspaceTabLabel;
  connections: ConnectionProfile[];
  health: HealthState;
  healthLabel: string;
  isConnectionsLoading: boolean;
  selectedConnectionId: string | null;
  selectedCollectionName: string | null;
  onConnectionError: (title: string, message: string) => void;
  onConnectionsChanged: () => Promise<void>;
  onSelectedConnectionChange: (connectionId: string | null) => void;
  onCollectionClose: () => void;
  onCollectionOpen: () => void;
  onSectionChange: (section: NavItemLabel) => void;
  onWorkspaceTabChange: (tab: WorkspaceTabLabel) => void;
};

type DocumentViewMode = "table" | "json";

type ParsedDocument = {
  ejson: string;
  id: string;
  value: Record<string, unknown>;
};

type DocumentQueryState = {
  filter: Record<string, unknown>;
  limit: number;
  projection: Record<string, unknown>;
  skip: number;
  sort: Record<string, 1 | -1>;
};

const defaultQueryState: DocumentQueryState = {
  filter: {},
  limit: 50,
  projection: {},
  skip: 0,
  sort: {},
};

const documentIdColumn = "{Document id}";

export const DocumentWorkspace = ({
  activeSection,
  activeWorkspaceTab,
  connections,
  health,
  healthLabel,
  isConnectionsLoading,
  selectedConnectionId,
  selectedCollectionName,
  onConnectionError,
  onConnectionsChanged,
  onSelectedConnectionChange,
  onCollectionClose,
  onCollectionOpen,
  onSectionChange,
  onWorkspaceTabChange,
}: DocumentWorkspaceProps) => {
  const selectedConnection =
    connections.find((connection) => connection.id === selectedConnectionId) ??
    null;
  const selectedCollectionPath = useMemo(
    () => parseCollectionPath(selectedCollectionName),
    [selectedCollectionName],
  );
  const [documentViewMode, setDocumentViewMode] =
    useState<DocumentViewMode>("table");
  const [filterInput, setFilterInput] = useState("{}");
  const [limitInput, setLimitInput] = useState("50");
  const [queryState, setQueryState] =
    useState<DocumentQueryState>(defaultQueryState);
  const [skipInput, setSkipInput] = useState("0");
  const [sortInput, setSortInput] = useState("{}");
  const [queryInputError, setQueryInputError] = useState<string | null>(null);
  const [tableDrillState, setTableDrillState] = useState<{
    collectionName: string | null;
    path: string[];
  }>({ collectionName: null, path: [] });
  const isCollectionWorkspace =
    activeSection === "Explore" && selectedCollectionName !== null;
  const isConnectionManager =
    activeSection === "Connections" && selectedCollectionName === null;
  const documentsQuery = useQuery({
    enabled:
      isCollectionWorkspace &&
      Boolean(selectedConnectionId) &&
      selectedCollectionPath !== null,
    queryKey: [
      "documents",
      selectedConnectionId,
      selectedCollectionPath?.database,
      selectedCollectionPath?.collection,
      queryState,
    ],
    queryFn: async () => {
      if (!window.nexum) {
        throw new Error("Preload API is unavailable");
      }

      if (!selectedConnectionId || !selectedCollectionPath) {
        throw new Error("No collection selected");
      }

      return window.nexum.mongodb.findDocuments({
        collection: selectedCollectionPath.collection,
        connectionId: selectedConnectionId,
        database: selectedCollectionPath.database,
        filter: queryState.filter,
        limit: queryState.limit,
        projection: queryState.projection,
        skip: queryState.skip,
        sort: queryState.sort,
      });
    },
  });
  const parsedDocuments = useMemo(
    () => parseEjsonDocuments(documentsQuery.data?.documents ?? []),
    [documentsQuery.data?.documents],
  );
  const selectedCollectionLabel = selectedCollectionName?.split(".").at(-1);
  const tablePath =
    tableDrillState.collectionName === selectedCollectionName
      ? tableDrillState.path
      : [];
  const exploreEmptyState = getExploreEmptyState(
    selectedConnection,
    onCollectionOpen,
    () => onSectionChange("Connections"),
  );
  const emptyWorkspaceTitle =
    activeSection === "Explore" ? exploreEmptyState.title : activeSection;
  const emptyWorkspaceLabel =
    activeSection === "Explore"
      ? exploreEmptyState.label
      : "This workspace is ready for the next shell route";

  const runQuery = () => {
    const nextState = parseDocumentQueryInputs({
      filterInput,
      limitInput,
      skipInput,
      sortInput,
    });

    if (!nextState.ok) {
      setQueryInputError(nextState.message);
      onConnectionError("Query input is invalid", nextState.message);
      return;
    }

    setQueryInputError(null);
    setQueryState(nextState.value);
  };

  const handleTablePathChange = (path: string[]) => {
    setTableDrillState({
      collectionName: selectedCollectionName,
      path,
    });
  };

  return (
    <section className="document-workspace">
      <CollectionTabBar
        isCollectionWorkspace={isCollectionWorkspace}
        selectedCollectionName={selectedCollectionName}
        onCollectionClose={onCollectionClose}
      />

      {isCollectionWorkspace ? (
        <WorkspaceTabs
          activeWorkspaceTab={activeWorkspaceTab}
          onWorkspaceTabChange={onWorkspaceTabChange}
        />
      ) : (
        <div className="workspace-tabs workspace-tabs-empty" />
      )}

      {isCollectionWorkspace ? (
        <>
          <QuerySection
            filterInput={filterInput}
            isFetching={documentsQuery.isFetching}
            limitInput={limitInput}
            onFilterInputChange={setFilterInput}
            onLimitInputChange={setLimitInput}
            onRunQuery={runQuery}
            onSkipInputChange={setSkipInput}
            onSortInputChange={setSortInput}
            queryInputError={queryInputError}
            skipInput={skipInput}
            sortInput={sortInput}
          />
          <ResultsSection
            collectionLabel={selectedCollectionLabel ?? "Collection"}
            documents={parsedDocuments}
            error={documentsQuery.error}
            hasMore={documentsQuery.data?.hasMore ?? false}
            isFetching={documentsQuery.isFetching}
            onRefresh={() => void documentsQuery.refetch()}
            onTablePathChange={handleTablePathChange}
            tablePath={tablePath}
            viewMode={documentViewMode}
            onViewModeChange={setDocumentViewMode}
          />
          <WorkspaceFooter
            executionTimeMs={documentsQuery.data?.executionTimeMs}
            hasMore={documentsQuery.data?.hasMore ?? false}
            health={health}
            healthLabel={healthLabel}
            limit={queryState.limit}
            resultCount={parsedDocuments.length}
            skip={queryState.skip}
          />
        </>
      ) : isConnectionManager ? (
        <ConnectionManager
          connections={connections}
          isLoading={isConnectionsLoading}
          selectedConnectionId={selectedConnectionId}
          onConnectionsChanged={onConnectionsChanged}
          onError={onConnectionError}
          onSelectedConnectionChange={onSelectedConnectionChange}
        />
      ) : (
        <WorkspaceEmptyState
          label={emptyWorkspaceLabel}
          actionLabel={
            activeSection === "Explore" ? exploreEmptyState.actionLabel : "Open"
          }
          onAction={
            activeSection === "Explore"
              ? exploreEmptyState.onAction
              : () => onSectionChange("Explore")
          }
          title={emptyWorkspaceTitle}
        />
      )}
    </section>
  );
};

type CollectionTabBarProps = {
  isCollectionWorkspace: boolean;
  selectedCollectionName: string | null;
  onCollectionClose: () => void;
};

const CollectionTabBar = ({
  isCollectionWorkspace,
  selectedCollectionName,
  onCollectionClose,
}: CollectionTabBarProps) => {
  const collectionLabel = selectedCollectionName?.split(".").at(-1);

  return (
    <div className="collection-tabbar">
      {isCollectionWorkspace ? (
        <div className="collection-tab is-active">
          <Icon name="table" />
          <span>{collectionLabel}</span>
          <button
            aria-label={`Close ${collectionLabel} tab`}
            className="close-mark"
            onClick={onCollectionClose}
            type="button"
          >
            ×
          </button>
        </div>
      ) : null}
      <button className="tab-plus" type="button" aria-label="New tab">
        +
      </button>
    </div>
  );
};

type WorkspaceTabsProps = {
  activeWorkspaceTab: WorkspaceTabLabel;
  onWorkspaceTabChange: (tab: WorkspaceTabLabel) => void;
};

const WorkspaceTabs = ({
  activeWorkspaceTab,
  onWorkspaceTabChange,
}: WorkspaceTabsProps) => (
  <div className="workspace-tabs" role="tablist" aria-label="Collection views">
    {workspaceTabs.map(([icon, label]) => (
      <button
        aria-selected={activeWorkspaceTab === label}
        className={`workspace-tab ${activeWorkspaceTab === label ? "is-active" : ""}`}
        key={label}
        onClick={() => onWorkspaceTabChange(label)}
        role="tab"
        type="button"
      >
        <Icon name={icon} />
        {label}
      </button>
    ))}
  </div>
);

type QuerySectionProps = {
  filterInput: string;
  isFetching: boolean;
  limitInput: string;
  onFilterInputChange: (value: string) => void;
  onLimitInputChange: (value: string) => void;
  onRunQuery: () => void;
  onSkipInputChange: (value: string) => void;
  onSortInputChange: (value: string) => void;
  queryInputError: string | null;
  skipInput: string;
  sortInput: string;
};

const QuerySection = ({
  filterInput,
  isFetching,
  limitInput,
  onFilterInputChange,
  onLimitInputChange,
  onRunQuery,
  onSkipInputChange,
  onSortInputChange,
  queryInputError,
  skipInput,
  sortInput,
}: QuerySectionProps) => (
  <section className="query-section">
    <label className="query-line">
      <span className="query-label">Filter</span>
      <input
        aria-label="MongoDB filter"
        value={filterInput}
        onChange={(event) => onFilterInputChange(event.target.value)}
      />
      <button className="plain-icon" type="button" aria-label="Copy query">
        ⧉
      </button>
    </label>

    <div className="query-controls">
      <label>
        <span>Limit</span>
        <input
          aria-label="Limit"
          inputMode="numeric"
          value={limitInput}
          onChange={(event) => onLimitInputChange(event.target.value)}
        />
      </label>
      <label>
        <span>Skip</span>
        <input
          aria-label="Skip"
          inputMode="numeric"
          value={skipInput}
          onChange={(event) => onSkipInputChange(event.target.value)}
        />
      </label>
      <label className="sort-control">
        <span>Sort</span>
        <input
          aria-label="Sort"
          value={sortInput}
          onChange={(event) => onSortInputChange(event.target.value)}
        />
      </label>
      <button
        className="run-button compact"
        type="button"
        disabled={isFetching}
        onClick={onRunQuery}
      >
        <span className="play-icon" />
        Run
      </button>
      <button className="options-button" type="button">
        <span>Options</span>
        <span className="select-caret" />
      </button>
    </div>
    {queryInputError ? <p className="query-error">{queryInputError}</p> : null}
  </section>
);

type ResultsSectionProps = {
  collectionLabel: string;
  documents: ParsedDocument[];
  error: Error | null;
  hasMore: boolean;
  isFetching: boolean;
  onRefresh: () => void;
  onTablePathChange: (path: string[]) => void;
  tablePath: string[];
  onViewModeChange: (mode: DocumentViewMode) => void;
  viewMode: DocumentViewMode;
};

const ResultsSection = ({
  collectionLabel,
  documents,
  error,
  hasMore,
  isFetching,
  onRefresh,
  onTablePathChange,
  tablePath,
  onViewModeChange,
  viewMode,
}: ResultsSectionProps) => {
  const tableDocuments = useMemo(
    () => projectDocumentsForTable(documents, tablePath),
    [documents, tablePath],
  );
  const handleObjectOpen = useCallback(
    (field: string) => onTablePathChange([...tablePath, field]),
    [onTablePathChange, tablePath],
  );

  return (
    <section className="results-section">
      <ResultsHeader
        collectionLabel={collectionLabel}
        count={documents.length}
        hasMore={hasMore}
        isFetching={isFetching}
        onRefresh={onRefresh}
        onTablePathChange={onTablePathChange}
        onViewModeChange={onViewModeChange}
        tablePath={tablePath}
        viewMode={viewMode}
      />
      {error ? (
        <ResultsState title="Unable to load documents" label={error.message} />
      ) : viewMode === "json" ? (
        <JsonResults documents={documents} />
      ) : (
        <DocumentTable
          key={`${tablePath.join(".")}:${tableDocuments[0]?.id ?? "empty"}:${tableDocuments.length}`}
          documents={tableDocuments}
          onObjectOpen={handleObjectOpen}
        />
      )}
    </section>
  );
};

type ResultsHeaderProps = {
  collectionLabel: string;
  count: number;
  hasMore: boolean;
  isFetching: boolean;
  onRefresh: () => void;
  onTablePathChange: (path: string[]) => void;
  onViewModeChange: (mode: DocumentViewMode) => void;
  tablePath: string[];
  viewMode: DocumentViewMode;
};

const ResultsHeader = ({
  collectionLabel,
  count,
  hasMore,
  isFetching,
  onRefresh,
  onTablePathChange,
  onViewModeChange,
  tablePath,
  viewMode,
}: ResultsHeaderProps) => (
  <div className="results-header">
    <div>
      {viewMode === "table" && tablePath.length > 0 ? (
        <DocumentBreadcrumbs
          collectionLabel={collectionLabel}
          onTablePathChange={onTablePathChange}
          tablePath={tablePath}
        />
      ) : (
        <strong>
          {count}
          {hasMore ? "+" : ""} documents
        </strong>
      )}
      <button
        className="plain-icon"
        type="button"
        aria-label="Refresh results"
        disabled={isFetching}
        onClick={onRefresh}
      >
        ↻
      </button>
    </div>
    <div className="result-tools">
      <div className="view-mode-toggle" role="tablist" aria-label="View mode">
        <button
          aria-selected={viewMode === "table"}
          className={viewMode === "table" ? "is-active" : ""}
          onClick={() => onViewModeChange("table")}
          role="tab"
          type="button"
        >
          Table
        </button>
        <button
          aria-selected={viewMode === "json"}
          className={viewMode === "json" ? "is-active" : ""}
          onClick={() => onViewModeChange("json")}
          role="tab"
          type="button"
        >
          JSON
        </button>
      </div>
      {["export", "download", "upload", "link"].map((tool) => (
        <button
          className="tool-button"
          key={tool}
          type="button"
          aria-label={tool}
        >
          <Icon name={tool} />
        </button>
      ))}
    </div>
  </div>
);

type DocumentBreadcrumbsProps = {
  collectionLabel: string;
  onTablePathChange: (path: string[]) => void;
  tablePath: string[];
};

const DocumentBreadcrumbs = ({
  collectionLabel,
  onTablePathChange,
  tablePath,
}: DocumentBreadcrumbsProps) => (
  <nav className="document-breadcrumbs" aria-label="Document object path">
    <button type="button" onClick={() => onTablePathChange([])}>
      {collectionLabel}
    </button>
    {tablePath.map((segment, index) => (
      <span className="document-breadcrumb-segment" key={`${segment}-${index}`}>
        <span className="breadcrumb-separator">›</span>
        <button
          type="button"
          onClick={() => onTablePathChange(tablePath.slice(0, index + 1))}
        >
          {segment}
        </button>
      </span>
    ))}
  </nav>
);

type DocumentTableProps = {
  documents: ParsedDocument[];
  onObjectOpen: (field: string) => void;
};

const DocumentTable = ({ documents, onObjectOpen }: DocumentTableProps) => {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const columns = useMemo<ColumnDef<ParsedDocument>[]>(
    () => createDocumentColumns(documents, onObjectOpen),
    [documents, onObjectOpen],
  );
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columnResizeMode: "onChange",
    columns,
    data: documents,
    enableColumnResizing: true,
    getCoreRowModel: getCoreRowModel(),
    onColumnSizingChange: setColumnSizing,
    state: {
      columnSizing,
    },
  });
  const rows = table.getRowModel().rows;
  const columnTemplate = table
    .getVisibleLeafColumns()
    .map((column) => `${column.getSize()}px`)
    .join(" ");
  const tableWidth = table.getTotalSize();
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 46,
    getScrollElement: () => parentRef.current,
    overscan: 8,
  });

  if (documents.length === 0) {
    return (
      <ResultsState
        title="No documents"
        label="This query returned no documents."
      />
    );
  }

  return (
    <div className="data-grid" ref={parentRef}>
      <div className="document-table" style={{ width: `${tableWidth}px` }}>
        <div
          className="document-table-head"
          style={{ gridTemplateColumns: columnTemplate }}
        >
          {table.getFlatHeaders().map((header) => (
            <div
              className="document-table-cell document-table-header-cell"
              key={header.id}
            >
              <span className="document-table-cell-content">
                {flexRender(
                  header.column.columnDef.header,
                  header.getContext(),
                )}
              </span>
              {header.column.getCanResize() ? (
                <button
                  aria-label={`Resize ${header.column.id} column`}
                  className="document-table-resizer"
                  onMouseDown={header.getResizeHandler()}
                  onTouchStart={header.getResizeHandler()}
                  type="button"
                />
              ) : null}
            </div>
          ))}
        </div>
        <div
          className="document-table-body"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];

            if (!row) {
              return null;
            }

            return (
              <div
                className="document-table-row"
                key={row.id}
                style={{
                  gridTemplateColumns: columnTemplate,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <div className="document-table-cell" key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

type JsonResultsProps = {
  documents: ParsedDocument[];
};

const JsonResults = ({ documents }: JsonResultsProps) => {
  const parentRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: documents.length,
    estimateSize: () => 176,
    getScrollElement: () => parentRef.current,
    overscan: 4,
  });

  if (documents.length === 0) {
    return (
      <ResultsState
        title="No documents"
        label="This query returned no documents."
      />
    );
  }

  return (
    <div className="json-results" ref={parentRef}>
      <div
        className="json-results-inner"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const document = documents[virtualRow.index];

          if (!document) {
            return null;
          }

          return (
            <pre
              className="json-document"
              key={document.id}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              {formatJson(document.ejson)}
            </pre>
          );
        })}
      </div>
    </div>
  );
};

type ResultsStateProps = {
  label: string;
  title: string;
};

const ResultsState = ({ label, title }: ResultsStateProps) => (
  <div className="results-state">
    <Icon name="table" />
    <strong>{title}</strong>
    <span>{label}</span>
  </div>
);

type WorkspaceFooterProps = {
  executionTimeMs: number | undefined;
  hasMore: boolean;
  health: HealthState;
  healthLabel: string;
  limit: number;
  resultCount: number;
  skip: number;
};

const WorkspaceFooter = ({
  executionTimeMs,
  hasMore,
  health,
  healthLabel,
  limit,
  resultCount,
  skip,
}: WorkspaceFooterProps) => (
  <footer className="workspace-footer">
    <div className="pager-group">
      <button className="page-icon muted" type="button" aria-label="First page">
        <span className="pagination-icon pagination-first" />
      </button>
      <span>Skip</span>
      <input value={skip} readOnly />
      <span>Limit</span>
      <input value={limit} readOnly />
      <button className="page-icon" type="button" aria-label="Next page">
        <span className="pagination-icon pagination-next" />
      </button>
      <button className="page-size" type="button">
        <span>{limit} / page</span>
        <span className="select-caret" />
      </button>
    </div>
    <div className="range-status">
      <span>
        {resultCount} shown{hasMore ? "+" : ""}
      </span>
      {executionTimeMs !== undefined ? <span>{executionTimeMs} ms</span> : null}
      <span className={`health-dot health-${health.status}`} />
      <span>{healthLabel}</span>
    </div>
  </footer>
);

type WorkspaceEmptyStateProps = {
  actionLabel: string;
  label: string;
  title: string;
  onAction: () => void;
};

const WorkspaceEmptyState = ({
  actionLabel,
  label,
  title,
  onAction,
}: WorkspaceEmptyStateProps) => (
  <section className="workspace-empty-state">
    <div>
      <Icon name="folder" />
      <h1>{title}</h1>
      <p>{label}</p>
      <button className="run-button compact" type="button" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  </section>
);

const createDocumentColumns = (
  documents: ParsedDocument[],
  onObjectOpen: (field: string) => void,
): ColumnDef<ParsedDocument>[] => {
  const keys = orderDocumentColumnKeys([
    ...new Set(documents.flatMap((document) => Object.keys(document.value))),
  ]);
  const visibleKeys = keys.length > 0 ? keys : ["document"];

  return [
    {
      cell: ({ row }) => (
        <span className="checkbox" aria-label={`Row ${row.index + 1}`} />
      ),
      enableResizing: false,
      header: "",
      id: "select",
      maxSize: 42,
      minSize: 42,
      size: 42,
    },
    ...visibleKeys.map(
      (key): ColumnDef<ParsedDocument> => ({
        accessorFn: (document) =>
          key === "document" ? document.value : document.value[key],
        cell: ({ getValue }) => {
          const value = getValue();
          const displayValue = formatTableCellValue(value);
          const canOpenObject =
            key !== documentIdColumn && isDrillableTableValue(value);

          return canOpenObject ? (
            <button
              className="object-cell"
              onDoubleClick={() => onObjectOpen(key)}
              title={formatCellValue(value)}
              type="button"
            >
              <span className="object-cell-icon" />
              <span>{displayValue}</span>
            </button>
          ) : (
            <span className={key === "_id" ? "mono" : ""} title={displayValue}>
              {displayValue}
            </span>
          );
        },
        header: key,
        id: key,
        maxSize: 1400,
        minSize: key === "_id" ? 230 : 92,
        size: getInitialColumnSize(key, documents),
      }),
    ),
  ];
};

const orderDocumentColumnKeys = (keys: string[]): string[] => {
  const uniqueKeys = [...new Set(keys)];

  if (!uniqueKeys.includes(documentIdColumn)) {
    return uniqueKeys;
  }

  return [
    documentIdColumn,
    ...uniqueKeys.filter((key) => key !== documentIdColumn),
  ];
};

const projectDocumentsForTable = (
  documents: ParsedDocument[],
  tablePath: string[],
): ParsedDocument[] => {
  if (tablePath.length === 0) {
    return documents;
  }

  return documents.map((document) => {
    const nestedValue = getValueAtPath(document.value, tablePath);
    const projectedValue = getProjectedTableValue(document.id, nestedValue);

    return {
      ...document,
      value: projectedValue,
    };
  });
};

const getProjectedTableValue = (
  documentId: string,
  value: unknown,
): Record<string, unknown> => {
  const baseValue: Record<string, unknown> = {
    [documentIdColumn]: documentId,
  };

  if (Array.isArray(value)) {
    return {
      ...baseValue,
      ...Object.fromEntries(value.map((item, index) => [String(index), item])),
    };
  }

  if (isRecord(value)) {
    return {
      ...baseValue,
      ...value,
    };
  }

  return {
    ...baseValue,
    value,
  };
};

const getValueAtPath = (
  value: Record<string, unknown>,
  tablePath: string[],
): unknown =>
  tablePath.reduce<unknown>((currentValue, segment) => {
    if (Array.isArray(currentValue)) {
      return currentValue[Number(segment)];
    }

    if (isRecord(currentValue)) {
      return currentValue[segment];
    }

    return undefined;
  }, value);

const getInitialColumnSize = (
  key: string,
  documents: ParsedDocument[],
): number => {
  const samples = [
    key,
    ...documents
      .slice(0, 50)
      .map((document) =>
        formatTableCellValue(
          key === "document" ? document.value : document.value[key],
        ),
      ),
  ];
  const widestText = samples.reduce(
    (widest, sample) => Math.max(widest, getDisplayWidth(sample)),
    0,
  );
  const paddedWidth = widestText + 42;
  const minWidth = key === "_id" ? 250 : 112;

  return Math.min(Math.max(paddedWidth, minWidth), 1400);
};

const getDisplayWidth = (value: string): number =>
  Array.from(value).reduce((width, character) => {
    if (/[\u0600-\u06ff]/.test(character)) {
      return width + 10;
    }

    if (/[A-Z0-9]/.test(character)) {
      return width + 8;
    }

    return width + 7;
  }, 0);

const parseCollectionPath = (
  selectedCollectionName: string | null,
): { collection: string; database: string } | null => {
  if (!selectedCollectionName) {
    return null;
  }

  const [database, ...collectionParts] = selectedCollectionName.split(".");
  const collection = collectionParts.join(".");

  if (!database || !collection) {
    return null;
  }

  return { collection, database };
};

const parseDocumentQueryInputs = ({
  filterInput,
  limitInput,
  skipInput,
  sortInput,
}: {
  filterInput: string;
  limitInput: string;
  skipInput: string;
  sortInput: string;
}):
  | { ok: true; value: DocumentQueryState }
  | { message: string; ok: false } => {
  const filter = parseJsonObject(filterInput, "Filter");
  const sort = parseSortInput(sortInput);
  const limit = Number(limitInput);
  const skip = Number(skipInput);

  if (!filter.ok) {
    return filter;
  }

  if (!sort.ok) {
    return sort;
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    return {
      message: "Limit must be an integer between 1 and 500.",
      ok: false,
    };
  }

  if (!Number.isInteger(skip) || skip < 0) {
    return { message: "Skip must be a non-negative integer.", ok: false };
  }

  return {
    ok: true,
    value: {
      filter: filter.value,
      limit,
      projection: {},
      skip,
      sort: sort.value,
    },
  };
};

const parseJsonObject = (
  value: string,
  label: string,
):
  | { ok: true; value: Record<string, unknown> }
  | { message: string; ok: false } => {
  try {
    const parsed = JSON.parse(value.trim() || "{}") as unknown;

    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return { message: `${label} must be a JSON object.`, ok: false };
    }

    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { message: `${label} must be valid JSON.`, ok: false };
  }
};

const parseSortInput = (
  value: string,
):
  | { ok: true; value: Record<string, 1 | -1> }
  | { message: string; ok: false } => {
  const parsed = parseJsonObject(value, "Sort");

  if (!parsed.ok) {
    return parsed;
  }

  const sort: Record<string, 1 | -1> = {};

  for (const [key, direction] of Object.entries(parsed.value)) {
    if (direction !== 1 && direction !== -1) {
      return {
        message: "Sort values must be 1 or -1.",
        ok: false,
      };
    }

    sort[key] = direction;
  }

  return { ok: true, value: sort };
};

const parseEjsonDocuments = (documents: string[]): ParsedDocument[] =>
  documents.map((document, index) => {
    const value = parseEjsonDocument(document);

    return {
      ejson: document,
      id: getDocumentId(value, index),
      value,
    };
  });

const parseEjsonDocument = (document: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(document) as unknown;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return { document };
  }

  return { document };
};

const getDocumentId = (
  document: Record<string, unknown>,
  index: number,
): string => {
  const id = document._id;

  return id === undefined ? `document-${index}` : formatCellValue(id);
};

const formatTableCellValue = (value: unknown): string => {
  const displayValue = unwrapEjsonValue(value);

  if (Array.isArray(displayValue) && displayValue.length > 0) {
    return `[ ${displayValue.length} items ]`;
  }

  if (isRecord(displayValue) && Object.keys(displayValue).length > 0) {
    return `{ ${Object.keys(displayValue).length} fields }`;
  }

  return formatCellValue(displayValue);
};

const isDrillableTableValue = (value: unknown): boolean => {
  const displayValue = unwrapEjsonValue(value);

  if (Array.isArray(displayValue)) {
    return displayValue.length > 0;
  }

  return isRecord(displayValue) && Object.keys(displayValue).length > 0;
};

const formatCellValue = (value: unknown): string => {
  const displayValue = unwrapEjsonValue(value);

  if (displayValue === null) {
    return "null";
  }

  if (displayValue === undefined) {
    return "";
  }

  if (typeof displayValue === "object") {
    return JSON.stringify(displayValue);
  }

  return String(displayValue);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const unwrapEjsonValue = (value: unknown): unknown => {
  if (value === null) {
    return value;
  }

  if (value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => unwrapEjsonValue(item));
  }

  if (typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);

  if (keys.length === 1) {
    const key = keys[0];

    if (!key) {
      return value;
    }

    const ejsonValue = record[key];

    if (ejsonDisplayKeys.has(key)) {
      return unwrapEjsonScalar(ejsonValue);
    }
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, nestedValue]) => [
      key,
      unwrapEjsonValue(nestedValue),
    ]),
  );
};

const ejsonDisplayKeys = new Set([
  "$date",
  "$numberDecimal",
  "$numberDouble",
  "$numberInt",
  "$numberLong",
  "$oid",
]);

const unwrapEjsonScalar = (value: unknown): unknown => {
  if (isRecord(value) && "$numberLong" in value) {
    return (value as { $numberLong: unknown }).$numberLong;
  }

  return value;
};

const formatJson = (value: string): string => {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};

const getExploreEmptyState = (
  selectedConnection: ConnectionProfile | null,
  onCollectionOpen: () => void,
  onConnectionsOpen: () => void,
) => {
  if (!selectedConnection) {
    return {
      actionLabel: "Open connections",
      label: "Select a saved connection before exploring databases.",
      onAction: onConnectionsOpen,
      title: "No connection selected",
    };
  }

  if (selectedConnection.status !== "connected") {
    return {
      actionLabel: "Open connection",
      label: "Connect the selected profile before browsing databases.",
      onAction: onConnectionsOpen,
      title: "Connection is not active",
    };
  }

  return {
    actionLabel: "Open users",
    label: "Select a collection from the database tree.",
    onAction: onCollectionOpen,
    title: "No collection selected",
  };
};
