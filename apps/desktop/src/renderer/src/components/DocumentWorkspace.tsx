import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
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
            documents={parsedDocuments}
            error={documentsQuery.error}
            hasMore={documentsQuery.data?.hasMore ?? false}
            isFetching={documentsQuery.isFetching}
            onRefresh={() => void documentsQuery.refetch()}
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
  documents: ParsedDocument[];
  error: Error | null;
  hasMore: boolean;
  isFetching: boolean;
  onRefresh: () => void;
  onViewModeChange: (mode: DocumentViewMode) => void;
  viewMode: DocumentViewMode;
};

const ResultsSection = ({
  documents,
  error,
  hasMore,
  isFetching,
  onRefresh,
  onViewModeChange,
  viewMode,
}: ResultsSectionProps) => (
  <section className="results-section">
    <ResultsHeader
      count={documents.length}
      hasMore={hasMore}
      isFetching={isFetching}
      onRefresh={onRefresh}
      onViewModeChange={onViewModeChange}
      viewMode={viewMode}
    />
    {error ? (
      <ResultsState title="Unable to load documents" label={error.message} />
    ) : viewMode === "json" ? (
      <JsonResults documents={documents} />
    ) : (
      <DocumentTable documents={documents} />
    )}
  </section>
);

type ResultsHeaderProps = {
  count: number;
  hasMore: boolean;
  isFetching: boolean;
  onRefresh: () => void;
  onViewModeChange: (mode: DocumentViewMode) => void;
  viewMode: DocumentViewMode;
};

const ResultsHeader = ({
  count,
  hasMore,
  isFetching,
  onRefresh,
  onViewModeChange,
  viewMode,
}: ResultsHeaderProps) => (
  <div className="results-header">
    <div>
      <strong>
        {count}
        {hasMore ? "+" : ""} documents
      </strong>
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

type DocumentTableProps = {
  documents: ParsedDocument[];
};

const DocumentTable = ({ documents }: DocumentTableProps) => {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const columns = useMemo<ColumnDef<ParsedDocument>[]>(
    () => createDocumentColumns(documents),
    [documents],
  );
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columns,
    data: documents,
    getCoreRowModel: getCoreRowModel(),
  });
  const rows = table.getRowModel().rows;
  const columnTemplate = `42px repeat(${Math.max(columns.length - 1, 1)}, minmax(164px, 1fr))`;
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
      <div className="document-table">
        <div
          className="document-table-head"
          style={{ gridTemplateColumns: columnTemplate }}
        >
          {table.getFlatHeaders().map((header) => (
            <div className="document-table-cell" key={header.id}>
              {flexRender(header.column.columnDef.header, header.getContext())}
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
): ColumnDef<ParsedDocument>[] => {
  const keys = [
    ...new Set(documents.flatMap((document) => Object.keys(document.value))),
  ].slice(0, 24);
  const visibleKeys = keys.length > 0 ? keys : ["document"];

  return [
    {
      cell: ({ row }) => (
        <span className="checkbox" aria-label={`Row ${row.index + 1}`} />
      ),
      header: "",
      id: "select",
    },
    ...visibleKeys.map(
      (key): ColumnDef<ParsedDocument> => ({
        accessorFn: (document) =>
          key === "document" ? document.value : document.value[key],
        cell: ({ getValue }) => (
          <span className={key === "_id" ? "mono" : ""}>
            {formatCellValue(getValue())}
          </span>
        ),
        header: key,
        id: key,
      }),
    ),
  ];
};

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

  return id === undefined ? `document-${index}` : JSON.stringify(id);
};

const formatCellValue = (value: unknown): string => {
  if (value === null) {
    return "null";
  }

  if (value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
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
