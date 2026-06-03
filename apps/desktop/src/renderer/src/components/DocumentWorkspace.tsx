import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DatabaseSearch } from "lucide-react";
import {
  workspaceTabs,
  type NavItemLabel,
  type WorkspaceTabLabel,
} from "../mockData";
import {
  addQueryBuilderNode,
  buildMongoFilterFromQueryBuilder,
  createDefaultQueryBuilderModel,
  createQueryBuilderCondition,
  createQueryBuilderGroup,
  inferQueryBuilderFields,
  queryBuilderConditionOperators,
  removeQueryBuilderNode,
  updateQueryBuilderCondition,
  updateQueryBuilderGroup,
  type QueryBuilderConditionNode,
  type QueryBuilderConditionOperator,
  type QueryBuilderFieldInference,
  type QueryBuilderGroupNode,
} from "../queryBuilderModel";
import type {
  ConnectionProfile,
  IndexSummary,
  SchemaFieldSummary,
} from "../types";
import { ConnectionManager } from "./ConnectionManager";
import { Icon } from "./Icon";
import { IndexList, SchemaTree } from "./InspectorPanel";
import { JsonTreeView } from "./JsonTreeView";

type DocumentWorkspaceProps = {
  activeSection: NavItemLabel;
  activeWorkspaceTab: WorkspaceTabLabel;
  connections: ConnectionProfile[];
  healthLabel: string;
  indexRows: IndexSummary[];
  indexesError: string | null;
  isIndexesLoading: boolean;
  isConnectionsLoading: boolean;
  selectedConnectionId: string | null;
  selectedCollectionName: string | null;
  onConnectionError: (title: string, message: string) => void;
  onConnectionsChanged: () => Promise<void>;
  onSelectedConnectionChange: (connectionId: string | null) => void;
  onCollectionClose: () => void;
  onCollectionOpen: () => void;
  onSectionChange: (section: NavItemLabel) => void;
  onSchemaChange: (schemaFields: SchemaFieldSummary[]) => void;
  onWorkspaceTabChange: (tab: WorkspaceTabLabel) => void;
};

type DocumentViewMode = "table" | "json";

type ParsedDocument = {
  ejson: string;
  id: string;
  rootValue: Record<string, unknown>;
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
const documentTableHorizontalGutter = 96;
const maxAutoColumnWidth = 1400;
const maxInitialColumnWidth = 360;
const objectPreviewGap = 8;
const objectPreviewHeight = 280;
const objectPreviewWidth = 360;

export const DocumentWorkspace = ({
  activeSection,
  activeWorkspaceTab,
  connections,
  healthLabel,
  indexRows,
  indexesError,
  isIndexesLoading,
  isConnectionsLoading,
  selectedConnectionId,
  selectedCollectionName,
  onConnectionError,
  onConnectionsChanged,
  onSelectedConnectionChange,
  onCollectionClose,
  onCollectionOpen,
  onSectionChange,
  onSchemaChange,
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
  const [projectionInput, setProjectionInput] = useState("{}");
  const [queryState, setQueryState] =
    useState<DocumentQueryState>(defaultQueryState);
  const [queryBuilderModel, setQueryBuilderModel] =
    useState<QueryBuilderGroupNode>(() => createDefaultQueryBuilderModel());
  const [skipInput, setSkipInput] = useState("0");
  const [sortInput, setSortInput] = useState("{}");
  const [queryInputError, setQueryInputError] = useState<string | null>(null);
  const [isQueryBuilderOpen, setIsQueryBuilderOpen] = useState(false);
  const [tableDrillState, setTableDrillState] = useState<{
    collectionName: string | null;
    path: string[];
  }>({ collectionName: null, path: [] });
  const isCollectionWorkspace =
    activeSection === "Explore" && selectedCollectionName !== null;
  const isMetadataWorkspace =
    activeWorkspaceTab === "Schema" || activeWorkspaceTab === "Indexes";
  const shouldShowQueryBuilderPanel =
    isCollectionWorkspace && !isMetadataWorkspace && isQueryBuilderOpen;
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
  const schemaFields = useMemo(
    () => inferDocumentSchema(parsedDocuments),
    [parsedDocuments],
  );
  const queryBuilderFields = useMemo(
    () =>
      inferQueryBuilderFields(
        parsedDocuments.map((document) => document.rootValue),
      ),
    [parsedDocuments],
  );
  const queryBuilderFilter = useMemo(
    () => buildMongoFilterFromQueryBuilder(queryBuilderModel),
    [queryBuilderModel],
  );
  const queryBuilderPreview = useMemo(
    () => JSON.stringify(queryBuilderFilter, null, 2),
    [queryBuilderFilter],
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
      projectionInput,
      skipInput,
      sortInput,
    });

    if (!nextState.ok) {
      setQueryInputError(nextState.message);
      onConnectionError("Query input is invalid", nextState.message);
      return;
    }

    setQueryInputError(null);
    setFilterInput(JSON.stringify(nextState.value.filter));
    setProjectionInput(JSON.stringify(nextState.value.projection));
    setSortInput(JSON.stringify(nextState.value.sort));
    setQueryState(nextState.value);
  };

  const runQueryBuilder = () => {
    setQueryInputError(null);
    setFilterInput(queryBuilderPreview);
    setSkipInput("0");
    setQueryState((currentState) => ({
      ...currentState,
      filter: queryBuilderFilter,
      skip: 0,
    }));
  };

  const applyCellFilter = ({ operation, path, value }: CellFilterRequest) => {
    const parsedFilter = parseJsonObject(filterInput, "Filter");
    const baseFilter = parsedFilter.ok ? parsedFilter.value : queryState.filter;
    const filterCondition = buildCellFilterCondition(path, value, operation);
    const nextFilter = mergeMongoFilters(baseFilter, filterCondition);

    setQueryInputError(null);
    setFilterInput(JSON.stringify(nextFilter));
    setSkipInput("0");
    setQueryState((currentState) => ({
      ...currentState,
      filter: nextFilter,
      skip: 0,
    }));
  };

  useEffect(() => {
    onSchemaChange(isCollectionWorkspace ? schemaFields : []);
  }, [isCollectionWorkspace, onSchemaChange, schemaFields]);

  const updatePagination = ({
    limit,
    skip,
  }: {
    limit: number;
    skip: number;
  }) => {
    setQueryInputError(null);
    setLimitInput(String(limit));
    setSkipInput(String(skip));
    setQueryState((currentState) => ({
      ...currentState,
      limit,
      skip,
    }));
  };

  const goToPage = (page: number) => {
    if (!Number.isInteger(page) || page < 1) {
      return;
    }

    updatePagination({
      limit: queryState.limit,
      skip: (page - 1) * queryState.limit,
    });
  };

  const updatePageSize = (limit: number) => {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      return;
    }

    updatePagination({ limit, skip: 0 });
  };

  const handleTablePathChange = (path: string[]) => {
    setTableDrillState({
      collectionName: selectedCollectionName,
      path,
    });
  };

  return (
    <section
      className={`document-workspace ${
        shouldShowQueryBuilderPanel ? "is-query-builder" : ""
      }`}
    >
      <CollectionTabBar
        isCollectionWorkspace={isCollectionWorkspace}
        selectedCollectionName={selectedCollectionName}
        onCollectionClose={onCollectionClose}
      />

      {isCollectionWorkspace ? (
        <WorkspaceTabs
          activeWorkspaceTab={activeWorkspaceTab}
          isQueryBuilderOpen={isQueryBuilderOpen}
          onQueryBuilderToggle={() =>
            setIsQueryBuilderOpen((currentValue) => !currentValue)
          }
          onWorkspaceTabChange={onWorkspaceTabChange}
        />
      ) : (
        <div className="workspace-tabs workspace-tabs-empty" />
      )}

      {isCollectionWorkspace ? (
        <>
          {isMetadataWorkspace ? (
            <MetadataWorkspace
              activeWorkspaceTab={activeWorkspaceTab}
              indexRows={indexRows}
              indexesError={indexesError}
              isIndexesLoading={isIndexesLoading}
              schemaFields={schemaFields}
            />
          ) : null}
          {!isMetadataWorkspace ? (
            <>
              <QuerySection
                filterInput={filterInput}
                isFetching={documentsQuery.isFetching}
                limitInput={limitInput}
                onFilterInputChange={setFilterInput}
                onLimitInputChange={setLimitInput}
                onProjectionInputChange={setProjectionInput}
                onRunQuery={runQuery}
                onSkipInputChange={setSkipInput}
                onSortInputChange={setSortInput}
                projectionInput={projectionInput}
                queryInputError={queryInputError}
                schemaFields={schemaFields}
                skipInput={skipInput}
                sortInput={sortInput}
              />
              <ResultsSection
                collectionLabel={selectedCollectionLabel ?? "Collection"}
                documents={parsedDocuments}
                error={documentsQuery.error}
                hasMore={documentsQuery.data?.hasMore ?? false}
                isFetching={documentsQuery.isFetching}
                isInitialLoading={documentsQuery.isLoading}
                onCellFilter={applyCellFilter}
                onRefresh={() => void documentsQuery.refetch()}
                onTablePathChange={handleTablePathChange}
                tablePath={tablePath}
                viewMode={documentViewMode}
                onViewModeChange={setDocumentViewMode}
              />
              <WorkspaceFooter
                canGoNext={documentsQuery.data?.hasMore ?? false}
                canGoPrevious={queryState.skip > 0}
                executionTimeMs={documentsQuery.data?.executionTimeMs}
                hasMore={documentsQuery.data?.hasMore ?? false}
                healthLabel={healthLabel}
                limit={queryState.limit}
                onFirstPage={() => goToPage(1)}
                onNextPage={() =>
                  goToPage(Math.floor(queryState.skip / queryState.limit) + 2)
                }
                onPageChange={goToPage}
                onPageSizeChange={updatePageSize}
                onPreviousPage={() =>
                  goToPage(
                    Math.max(Math.floor(queryState.skip / queryState.limit), 1),
                  )
                }
                resultCount={parsedDocuments.length}
                skip={queryState.skip}
              />
              {shouldShowQueryBuilderPanel ? (
                <QueryBuilderSection
                  fields={queryBuilderFields}
                  isFetching={documentsQuery.isFetching}
                  model={queryBuilderModel}
                  onModelChange={setQueryBuilderModel}
                  onRunQuery={runQueryBuilder}
                  preview={queryBuilderPreview}
                />
              ) : null}
            </>
          ) : null}
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
  isQueryBuilderOpen: boolean;
  onQueryBuilderToggle: () => void;
  onWorkspaceTabChange: (tab: WorkspaceTabLabel) => void;
};

const WorkspaceTabs = ({
  activeWorkspaceTab,
  isQueryBuilderOpen,
  onQueryBuilderToggle,
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
    <button
      aria-label={
        isQueryBuilderOpen ? "Close query builder" : "Open query builder"
      }
      aria-pressed={isQueryBuilderOpen}
      data-tooltip="Query Builder"
      className={`workspace-tool-button ${
        isQueryBuilderOpen ? "is-active" : ""
      }`}
      onClick={onQueryBuilderToggle}
      type="button"
    >
      <DatabaseSearch aria-hidden="true" size={17} strokeWidth={1.9} />
    </button>
  </div>
);

type QuerySectionProps = {
  filterInput: string;
  isFetching: boolean;
  limitInput: string;
  onFilterInputChange: (value: string) => void;
  onLimitInputChange: (value: string) => void;
  onProjectionInputChange: (value: string) => void;
  onRunQuery: () => void;
  onSkipInputChange: (value: string) => void;
  onSortInputChange: (value: string) => void;
  projectionInput: string;
  queryInputError: string | null;
  schemaFields: SchemaFieldSummary[];
  skipInput: string;
  sortInput: string;
};

const QuerySection = ({
  filterInput,
  isFetching,
  limitInput,
  onFilterInputChange,
  onLimitInputChange,
  onProjectionInputChange,
  onRunQuery,
  onSkipInputChange,
  onSortInputChange,
  projectionInput,
  queryInputError,
  schemaFields,
  skipInput,
  sortInput,
}: QuerySectionProps) => {
  const fieldSuggestions = schemaFields;

  return (
    <section className="query-section">
      <label className="query-line">
        <span className="query-label">Filter</span>
        <QueryFieldAutocompleteInput
          aria-label="MongoDB filter"
          canClear
          copyLabel="Copy filter"
          fields={fieldSuggestions}
          mode="filter"
          value={filterInput}
          onChange={onFilterInputChange}
          onCopy={() => void navigator.clipboard?.writeText(filterInput)}
          onEnter={onRunQuery}
        />
      </label>

      <div className="query-controls">
        <label className="projection-control">
          <span>Projection</span>
          <QueryFieldAutocompleteInput
            aria-label="Projection"
            canClear
            fields={fieldSuggestions}
            mode="projection"
            placeholder='{ "email": 1 }'
            value={projectionInput}
            onChange={onProjectionInputChange}
            onEnter={onRunQuery}
          />
        </label>
        <label>
          <span>Limit</span>
          <input
            aria-label="Limit"
            inputMode="numeric"
            value={limitInput}
            onChange={(event) => onLimitInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onRunQuery();
              }
            }}
          />
        </label>
        <label>
          <span>Skip</span>
          <input
            aria-label="Skip"
            inputMode="numeric"
            value={skipInput}
            onChange={(event) => onSkipInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onRunQuery();
              }
            }}
          />
        </label>
        <label className="sort-control">
          <span>Sort</span>
          <input
            aria-label="Sort"
            value={sortInput}
            onChange={(event) => onSortInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onRunQuery();
              }
            }}
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
      </div>
      {queryInputError ? (
        <p className="query-error">{queryInputError}</p>
      ) : null}
    </section>
  );
};

type QueryFieldAutocompleteInputProps = {
  "aria-label": string;
  canClear?: boolean;
  copyLabel?: string;
  fields: SchemaFieldSummary[];
  mode: "field" | "filter" | "projection";
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onCopy?: () => void;
  onEnter?: () => void;
};

const QueryFieldAutocompleteInput = ({
  "aria-label": ariaLabel,
  canClear = false,
  copyLabel,
  fields,
  mode,
  placeholder,
  value,
  onChange,
  onCopy,
  onEnter,
}: QueryFieldAutocompleteInputProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [caretIndex, setCaretIndex] = useState(value.length);
  const [isFocused, setIsFocused] = useState(false);
  const context = useMemo(
    () => getQueryFieldSuggestionContext(value, caretIndex),
    [caretIndex, value],
  );
  const suggestions = useMemo(
    () => (context ? getQueryFieldSuggestions(fields, context.fragment) : []),
    [context, fields],
  );
  const shouldShowSuggestions = isFocused && suggestions.length > 0;
  const canClearValue = canClear && value.trim() !== "{}";
  const hasActions = canClear || onCopy;

  const syncCaret = () => {
    const input = inputRef.current;

    if (!input) {
      return;
    }

    setCaretIndex(input.selectionStart ?? value.length);
  };

  const applySuggestion = (suggestion: QueryFieldSuggestion) => {
    if (!context) {
      return;
    }

    const nextValue = insertQueryFieldSuggestion({
      context,
      mode,
      path: suggestion.path,
      value,
    });

    onChange(nextValue);
    setIsFocused(false);
    window.requestAnimationFrame(() => {
      const input = inputRef.current;

      if (!input) {
        return;
      }

      const afterSuggestion = value.slice(
        context.start + context.fragment.length,
      );
      const insertedKey = getFormattedQueryFieldKey(context, suggestion.path);
      const insertedValueSuffix =
        mode === "field"
          ? ""
          : getQueryFieldSuggestionValueSuffix(afterSuggestion, mode);
      const nextCaret = Math.min(
        nextValue.length,
        mode === "field"
          ? suggestion.path.length
          : context.start + insertedKey.length + insertedValueSuffix.length,
      );
      input.focus();
      input.setSelectionRange(nextCaret, nextCaret);
      setCaretIndex(nextCaret);
    });
  };

  return (
    <span className={`query-autocomplete ${hasActions ? "has-actions" : ""}`}>
      <input
        aria-label={ariaLabel}
        autoComplete="off"
        placeholder={placeholder}
        ref={inputRef}
        value={value}
        onBlur={() => window.setTimeout(() => setIsFocused(false), 140)}
        onChange={(event) => {
          onChange(event.target.value);
          setIsFocused(true);
          setActiveIndex(0);
          setCaretIndex(
            event.target.selectionStart ?? event.target.value.length,
          );
        }}
        onClick={syncCaret}
        onFocus={() => {
          setIsFocused(true);
          syncCaret();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !shouldShowSuggestions) {
            event.preventDefault();
            event.stopPropagation();
            onEnter?.();
            return;
          }

          if (!shouldShowSuggestions) {
            return;
          }

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((currentIndex) =>
              Math.min(currentIndex + 1, suggestions.length - 1),
            );
            return;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((currentIndex) => Math.max(currentIndex - 1, 0));
            return;
          }

          if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            event.stopPropagation();
            const activeSuggestion =
              suggestions[Math.min(activeIndex, suggestions.length - 1)];

            if (activeSuggestion) {
              applySuggestion(activeSuggestion);
            }
          }
        }}
        onSelect={syncCaret}
      />
      {hasActions ? (
        <span className="query-autocomplete-actions">
          {onCopy ? (
            <button
              aria-label={copyLabel ?? "Copy"}
              className="query-autocomplete-action"
              data-tooltip={copyLabel ?? "Copy"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={onCopy}
              type="button"
            >
              ⧉
            </button>
          ) : null}
          {canClear ? (
            <button
              aria-label={`Clear ${ariaLabel}`}
              className="query-autocomplete-action query-autocomplete-clear"
              data-tooltip="Clear"
              disabled={!canClearValue}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange("{}");
                setCaretIndex(1);
                inputRef.current?.focus();
                inputRef.current?.setSelectionRange(1, 1);
              }}
              type="button"
            >
              ×
            </button>
          ) : null}
        </span>
      ) : null}
      {shouldShowSuggestions ? (
        <div className="query-autocomplete-menu" role="listbox">
          {suggestions.map((suggestion, index) => (
            <button
              className={index === activeIndex ? "is-active" : ""}
              key={suggestion.path}
              onMouseDown={(event) => {
                event.preventDefault();
                applySuggestion(suggestion);
              }}
              role="option"
              type="button"
            >
              <span className="field-kind-icon">f</span>
              <span>{suggestion.label}</span>
              <small>{suggestion.type}</small>
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
};

type MetadataWorkspaceProps = {
  activeWorkspaceTab: WorkspaceTabLabel;
  indexRows: IndexSummary[];
  indexesError: string | null;
  isIndexesLoading: boolean;
  schemaFields: SchemaFieldSummary[];
};

const MetadataWorkspace = ({
  activeWorkspaceTab,
  indexRows,
  indexesError,
  isIndexesLoading,
  schemaFields,
}: MetadataWorkspaceProps) => (
  <section className="metadata-workspace">
    <div className="metadata-workspace-body">
      {activeWorkspaceTab === "Schema" ? (
        <SchemaTree fields={schemaFields} />
      ) : (
        <IndexList
          error={indexesError}
          indexes={indexRows}
          isLoading={isIndexesLoading}
        />
      )}
    </div>
  </section>
);

type QueryBuilderSectionProps = {
  fields: QueryBuilderFieldInference[];
  isFetching: boolean;
  model: QueryBuilderGroupNode;
  onModelChange: (model: QueryBuilderGroupNode) => void;
  onRunQuery: () => void;
  preview: string;
};

const QueryBuilderSection = ({
  fields,
  isFetching,
  model,
  onModelChange,
  onRunQuery,
  preview,
}: QueryBuilderSectionProps) => {
  const [activeBuilderTab, setActiveBuilderTab] = useState<"Preview" | "Query">(
    "Query",
  );

  return (
    <section className="query-builder-section">
      <div className="query-builder-shell">
        <div className="query-builder-header">
          <div
            className="query-builder-tabs"
            role="tablist"
            aria-label="Query builder panels"
          >
            {(["Query", "Preview"] as const).map((tab) => (
              <button
                aria-selected={activeBuilderTab === tab}
                className={activeBuilderTab === tab ? "is-active" : ""}
                key={tab}
                onClick={() => setActiveBuilderTab(tab)}
                role="tab"
                type="button"
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {activeBuilderTab === "Query" ? (
          <div className="query-builder-panel" role="tabpanel">
            <QueryBuilderGroup
              fields={fields}
              group={model}
              isRoot
              root={model}
              onRunQuery={onRunQuery}
              onRootChange={onModelChange}
            />
          </div>
        ) : (
          <div className="query-builder-preview" role="tabpanel">
            <pre>{preview}</pre>
          </div>
        )}

        <div className="query-builder-footer">
          <button
            className="run-button compact"
            disabled={isFetching}
            onClick={onRunQuery}
            type="button"
          >
            <span className="play-icon" />
            Run
          </button>
        </div>
      </div>
    </section>
  );
};

type QueryBuilderGroupProps = {
  fields: QueryBuilderFieldInference[];
  group: QueryBuilderGroupNode;
  isRoot?: boolean;
  root: QueryBuilderGroupNode;
  onRunQuery: () => void;
  onRootChange: (root: QueryBuilderGroupNode) => void;
};

const QueryBuilderGroup = ({
  fields,
  group,
  isRoot = false,
  onRunQuery,
  root,
  onRootChange,
}: QueryBuilderGroupProps) => (
  <div className={`query-builder-group ${isRoot ? "is-root" : ""}`}>
    <div className="query-builder-group-toolbar">
      <label>
        <span>{isRoot ? "Match" : "Group"}</span>
        <select
          aria-label={`${isRoot ? "Root" : "Nested"} group combinator`}
          value={group.combinator}
          onChange={(event) =>
            onRootChange(
              updateQueryBuilderGroup(root, group.id, {
                combinator: event.target
                  .value as QueryBuilderGroupNode["combinator"],
              }),
            )
          }
        >
          <option value="and">All conditions</option>
          <option value="or">Any condition</option>
        </select>
      </label>
      <div className="query-builder-actions">
        <button
          className="secondary-button"
          onClick={() =>
            onRootChange(
              addQueryBuilderNode(
                root,
                group.id,
                createQueryBuilderCondition(),
              ),
            )
          }
          type="button"
        >
          Add condition
        </button>
        <button
          className="secondary-button"
          onClick={() =>
            onRootChange(
              addQueryBuilderNode(
                root,
                group.id,
                createQueryBuilderGroup({
                  children: [createQueryBuilderCondition()],
                }),
              ),
            )
          }
          type="button"
        >
          Add group
        </button>
        {!isRoot ? (
          <button
            className="query-builder-remove"
            onClick={() => onRootChange(removeQueryBuilderNode(root, group.id))}
            type="button"
          >
            Remove
          </button>
        ) : null}
      </div>
    </div>

    <div className="query-builder-children">
      {group.children.length === 0 ? (
        <div className="query-builder-empty">No conditions in this group.</div>
      ) : (
        group.children.map((child) =>
          child.kind === "group" ? (
            <QueryBuilderGroup
              fields={fields}
              group={child}
              key={child.id}
              onRunQuery={onRunQuery}
              root={root}
              onRootChange={onRootChange}
            />
          ) : (
            <QueryBuilderCondition
              condition={child}
              fields={fields}
              key={child.id}
              onRunQuery={onRunQuery}
              root={root}
              onRootChange={onRootChange}
            />
          ),
        )
      )}
    </div>
  </div>
);

type QueryBuilderConditionProps = {
  condition: QueryBuilderConditionNode;
  fields: QueryBuilderFieldInference[];
  root: QueryBuilderGroupNode;
  onRunQuery: () => void;
  onRootChange: (root: QueryBuilderGroupNode) => void;
};

const QueryBuilderCondition = ({
  condition,
  fields,
  onRunQuery,
  root,
  onRootChange,
}: QueryBuilderConditionProps) => {
  const inferredField = fields.find((field) => field.path === condition.field);
  const requiresValue = condition.operator !== "exists";
  const autocompleteFields = useMemo(
    () =>
      fields.map((field) => ({
        meta: `${field.occurrenceCount}`,
        name: field.path,
        type: field.types.join(" | "),
      })),
    [fields],
  );

  return (
    <div className="query-builder-condition">
      <QueryFieldAutocompleteInput
        aria-label="Field"
        fields={autocompleteFields}
        mode="field"
        placeholder="field.path"
        value={condition.field}
        onEnter={onRunQuery}
        onChange={(field) =>
          onRootChange(
            updateQueryBuilderCondition(root, condition.id, {
              field,
            }),
          )
        }
      />
      <select
        aria-label="Operator"
        value={condition.operator}
        onChange={(event) =>
          onRootChange(
            updateQueryBuilderCondition(root, condition.id, {
              operator: event.target.value as QueryBuilderConditionOperator,
            }),
          )
        }
      >
        {queryBuilderConditionOperators.map((operator) => (
          <option key={operator} value={operator}>
            {formatQueryBuilderOperator(operator)}
          </option>
        ))}
      </select>
      {requiresValue ? (
        <input
          aria-label="Value"
          className="query-builder-value"
          placeholder="value"
          value={formatQueryBuilderInputValue(condition.value)}
          onChange={(event) =>
            onRootChange(
              updateQueryBuilderCondition(root, condition.id, {
                value: parseQueryBuilderInputValue(
                  event.target.value,
                  condition.operator,
                ),
              }),
            )
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onRunQuery();
            }
          }}
        />
      ) : (
        <select
          aria-label="Exists value"
          className="query-builder-value"
          value={condition.value === false ? "false" : "true"}
          onChange={(event) =>
            onRootChange(
              updateQueryBuilderCondition(root, condition.id, {
                value: event.target.value === "true",
              }),
            )
          }
        >
          <option value="true">exists</option>
          <option value="false">missing</option>
        </select>
      )}
      <span className="query-builder-field-meta">
        {inferredField
          ? `${inferredField.types.join(" | ")} · ${inferredField.occurrenceCount}`
          : "custom"}
      </span>
      <button
        className="query-builder-remove"
        onClick={() => onRootChange(removeQueryBuilderNode(root, condition.id))}
        type="button"
      >
        Remove
      </button>
    </div>
  );
};

type ResultsSectionProps = {
  collectionLabel: string;
  documents: ParsedDocument[];
  error: Error | null;
  hasMore: boolean;
  isFetching: boolean;
  isInitialLoading: boolean;
  onCellFilter: (request: CellFilterRequest) => void;
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
  isInitialLoading,
  onCellFilter,
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
      ) : isInitialLoading ? (
        <ResultsLoadingState />
      ) : viewMode === "json" ? (
        <JsonResults documents={documents} />
      ) : (
        <DocumentTable
          key={`${tablePath.join(".")}:${tableDocuments[0]?.id ?? "empty"}:${tableDocuments.length}`}
          documents={tableDocuments}
          onCellFilter={onCellFilter}
          onObjectOpen={handleObjectOpen}
          tablePath={tablePath}
        />
      )}
    </section>
  );
};

const ResultsLoadingState = () => (
  <div className="results-loading-state">
    {Array.from({ length: 10 }, (_, index) => (
      <span key={index} />
    ))}
  </div>
);

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
  onCellFilter: (request: CellFilterRequest) => void;
  onObjectOpen: (field: string) => void;
  tablePath: string[];
};

type ObjectPreviewState = {
  content: string;
  left: number;
  top: number;
};

type SelectedDocumentCell = {
  cellId: string;
  rowId: string;
};

type CellContextMenuState = {
  fieldPath: string;
  left: number;
  top: number;
  value: unknown;
};

type CellFilterOperation =
  | "contains"
  | "endsWith"
  | "eq"
  | "exists"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "ne"
  | "notContains"
  | "notEndsWith"
  | "notExists"
  | "notStartsWith"
  | "startsWith";

type CellFilterRequest = {
  operation: CellFilterOperation;
  path: string;
  value: unknown;
};

const DocumentTable = ({
  documents,
  onCellFilter,
  onObjectOpen,
  tablePath,
}: DocumentTableProps) => {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const objectPreviewHideTimer = useRef<number | null>(null);
  const objectPreviewShowTimer = useRef<number | null>(null);
  const [cellContextMenu, setCellContextMenu] =
    useState<CellContextMenuState | null>(null);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [objectPreview, setObjectPreview] = useState<ObjectPreviewState | null>(
    null,
  );
  const [selectedCell, setSelectedCell] = useState<SelectedDocumentCell | null>(
    null,
  );
  const cancelObjectPreviewShow = useCallback(() => {
    if (objectPreviewShowTimer.current !== null) {
      window.clearTimeout(objectPreviewShowTimer.current);
      objectPreviewShowTimer.current = null;
    }
  }, []);
  const cancelObjectPreviewHide = useCallback(() => {
    if (objectPreviewHideTimer.current !== null) {
      window.clearTimeout(objectPreviewHideTimer.current);
      objectPreviewHideTimer.current = null;
    }
  }, []);
  const scheduleObjectPreviewHide = useCallback(() => {
    cancelObjectPreviewShow();
    cancelObjectPreviewHide();
    objectPreviewHideTimer.current = window.setTimeout(() => {
      setObjectPreview(null);
      objectPreviewHideTimer.current = null;
    }, 180);
  }, [cancelObjectPreviewHide, cancelObjectPreviewShow]);
  const closeCellContextMenu = useCallback(() => {
    setCellContextMenu(null);
  }, []);
  const handleCellContextMenu = useCallback(
    (
      event: ReactMouseEvent<HTMLDivElement>,
      cellId: string,
      rowId: string,
      fieldKey: string,
      value: unknown,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      cancelObjectPreviewShow();
      cancelObjectPreviewHide();
      setObjectPreview(null);
      setSelectedCell({ cellId, rowId });
      setCellContextMenu({
        fieldPath: getCellFilterPath(tablePath, fieldKey),
        left: getContextMenuLeft(event.clientX),
        top: getContextMenuTop(event.clientY),
        value,
      });
    },
    [cancelObjectPreviewHide, cancelObjectPreviewShow, tablePath],
  );
  const columns = useMemo<ColumnDef<ParsedDocument>[]>(
    () =>
      createDocumentColumns(
        documents,
        onObjectOpen,
        (event, value) => {
          cancelObjectPreviewShow();
          cancelObjectPreviewHide();
          const rect = event.currentTarget.getBoundingClientRect();

          objectPreviewShowTimer.current = window.setTimeout(() => {
            const content = formatPreviewJson(value);
            const previewHeight = getObjectPreviewHeight(content);

            setObjectPreview({
              content,
              left: getObjectPreviewLeft(rect),
              top: getObjectPreviewTop(rect, previewHeight),
            });
            objectPreviewShowTimer.current = null;
          }, 1000);
        },
        scheduleObjectPreviewHide,
      ),
    [
      cancelObjectPreviewHide,
      cancelObjectPreviewShow,
      documents,
      onObjectOpen,
      scheduleObjectPreviewHide,
    ],
  );
  const autoColumnSizes = useMemo(
    () => getAutoColumnSizes(documents),
    [documents],
  );
  const initialColumnSizes = useMemo(
    () => getInitialColumnSizes(documents),
    [documents],
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
  const scrollableTableWidth = tableWidth + documentTableHorizontalGutter;
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 46,
    getScrollElement: () => parentRef.current,
    overscan: 8,
  });

  useEffect(() => {
    if (!cellContextMenu) {
      return undefined;
    }

    const handleWindowClick = () => closeCellContextMenu();
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeCellContextMenu();
      }
    };

    window.addEventListener("click", handleWindowClick);
    window.addEventListener("contextmenu", handleWindowClick);
    window.addEventListener("keydown", handleWindowKeyDown);
    window.addEventListener("resize", handleWindowClick);
    window.addEventListener("scroll", handleWindowClick, true);

    return () => {
      window.removeEventListener("click", handleWindowClick);
      window.removeEventListener("contextmenu", handleWindowClick);
      window.removeEventListener("keydown", handleWindowKeyDown);
      window.removeEventListener("resize", handleWindowClick);
      window.removeEventListener("scroll", handleWindowClick, true);
    };
  }, [cellContextMenu, closeCellContextMenu]);

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
      <div
        className="document-table"
        style={{ width: `${scrollableTableWidth}px` }}
      >
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
                <>
                  <button
                    aria-label={`Auto fit ${header.column.id} column`}
                    className="document-table-autofit"
                    onClick={() => {
                      const autoSize = autoColumnSizes[header.column.id];
                      const initialSize = initialColumnSizes[header.column.id];

                      if (autoSize !== undefined && initialSize !== undefined) {
                        const isAutoFit =
                          Math.abs(header.column.getSize() - autoSize) < 1;
                        const nextSize = isAutoFit ? initialSize : autoSize;

                        setColumnSizing((currentSizing) => ({
                          ...currentSizing,
                          [header.column.id]: nextSize,
                        }));
                      }
                    }}
                    type="button"
                  >
                    ↔
                  </button>
                  <button
                    aria-label={`Resize ${header.column.id} column`}
                    className="document-table-resizer"
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    type="button"
                  />
                </>
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
                className={`document-table-row ${
                  selectedCell?.rowId === row.id ? "is-row-selected" : ""
                }`}
                key={row.id}
                style={{
                  gridTemplateColumns: columnTemplate,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <div
                    className={`document-table-cell ${
                      selectedCell?.cellId === cell.id ? "is-selected" : ""
                    }`}
                    key={cell.id}
                    onClick={() => {
                      setSelectedCell({
                        cellId: cell.id,
                        rowId: row.id,
                      });
                    }}
                    onContextMenu={(event) =>
                      handleCellContextMenu(
                        event,
                        cell.id,
                        row.id,
                        cell.column.id,
                        cell.getValue(),
                      )
                    }
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      {objectPreview ? (
        <div
          className="object-preview-popover"
          onMouseEnter={cancelObjectPreviewHide}
          onMouseLeave={scheduleObjectPreviewHide}
          style={{
            left: `${objectPreview.left}px`,
            top: `${objectPreview.top}px`,
          }}
        >
          <pre>{objectPreview.content}</pre>
        </div>
      ) : null}
      {cellContextMenu ? (
        <CellContextMenu
          menu={cellContextMenu}
          onApplyFilter={(request) => {
            onCellFilter(request);
            closeCellContextMenu();
          }}
          onClose={closeCellContextMenu}
        />
      ) : null}
    </div>
  );
};

type CellContextMenuProps = {
  menu: CellContextMenuState;
  onApplyFilter: (request: CellFilterRequest) => void;
  onClose: () => void;
};

const CellContextMenu = ({
  menu,
  onApplyFilter,
  onClose,
}: CellContextMenuProps) => {
  const items = getCellFilterMenuItems(menu.fieldPath, menu.value);

  return (
    <div
      className="cell-context-menu"
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
      style={{
        left: `${menu.left}px`,
        top: `${menu.top}px`,
      }}
    >
      {items.length > 0 ? (
        <div className="cell-context-submenu-item">
          <button type="button">
            <span>Filter by &quot;{menu.fieldPath}&quot;</span>
            <span aria-hidden="true">›</span>
          </button>
          <div className="cell-context-submenu">
            {items.map((item) => (
              <button
                key={item.operation}
                type="button"
                onClick={() =>
                  onApplyFilter({
                    operation: item.operation,
                    path: menu.fieldPath,
                    value: menu.value,
                  })
                }
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button disabled type="button">
          Filter unavailable for nested value
        </button>
      )}
      <span className="cell-context-menu-separator" />
      <button type="button" onClick={onClose}>
        Close
      </button>
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
    estimateSize: () => 260,
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
            <article
              className="json-document-card"
              key={document.id}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <header className="json-document-card-header">
                <span>Document</span>
                <strong>{document.id}</strong>
              </header>
              <div className="json-document-tree">
                <JsonTreeView data={document.value} />
              </div>
            </article>
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
  canGoNext: boolean;
  canGoPrevious: boolean;
  executionTimeMs: number | undefined;
  hasMore: boolean;
  healthLabel: string;
  limit: number;
  onFirstPage: () => void;
  onNextPage: () => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (limit: number) => void;
  onPreviousPage: () => void;
  resultCount: number;
  skip: number;
};

const WorkspaceFooter = ({
  canGoNext,
  canGoPrevious,
  executionTimeMs,
  hasMore,
  healthLabel,
  limit,
  onFirstPage,
  onNextPage,
  onPageChange,
  onPageSizeChange,
  onPreviousPage,
  resultCount,
  skip,
}: WorkspaceFooterProps) => {
  const page = Math.floor(skip / limit) + 1;

  return (
    <footer className="workspace-footer">
      <div className="pager-group">
        <button
          className={`page-icon ${canGoPrevious ? "" : "muted"}`}
          type="button"
          aria-label="First page"
          disabled={!canGoPrevious}
          onClick={onFirstPage}
        >
          <span className="pagination-icon pagination-first" />
        </button>
        <button
          className={`page-icon ${canGoPrevious ? "" : "muted"}`}
          type="button"
          aria-label="Previous page"
          disabled={!canGoPrevious}
          onClick={onPreviousPage}
        >
          <span className="pagination-icon pagination-prev" />
        </button>
        <span>Page</span>
        <input
          aria-label="Page"
          inputMode="numeric"
          min={1}
          onChange={(event) => onPageChange(Number(event.target.value))}
          type="number"
          value={page}
        />
        <button
          className={`page-icon ${canGoNext ? "" : "muted"}`}
          type="button"
          aria-label="Next page"
          disabled={!canGoNext}
          onClick={onNextPage}
        >
          <span className="pagination-icon pagination-next" />
        </button>
        <select
          aria-label="Page size"
          className="page-size-select"
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          value={limit}
        >
          {[25, 50, 100, 250, 500].map((pageSize) => (
            <option key={pageSize} value={pageSize}>
              {pageSize} / page
            </option>
          ))}
        </select>
      </div>
      <div className="range-status">
        <span className="status-metric">
          {resultCount} shown{hasMore ? "+" : ""}
        </span>
        {executionTimeMs !== undefined ? (
          <span className="status-metric">
            <span className="status-label">query</span>
            {executionTimeMs} ms
          </span>
        ) : null}
        <span className="status-metric">
          <span className="status-label">latency</span>
          {healthLabel}
        </span>
      </div>
    </footer>
  );
};

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
  onObjectPreviewShow: (
    event: { currentTarget: HTMLButtonElement },
    value: unknown,
  ) => void,
  onObjectPreviewHide: () => void,
): ColumnDef<ParsedDocument>[] => {
  const keys = orderDocumentColumnKeys([
    ...new Set(documents.flatMap((document) => Object.keys(document.value))),
  ]);
  const visibleKeys = keys.length > 0 ? keys : ["document"];

  return visibleKeys.map(
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
            onMouseEnter={(event) => onObjectPreviewShow(event, value)}
            onMouseLeave={onObjectPreviewHide}
            onFocus={(event) => onObjectPreviewShow(event, value)}
            onBlur={onObjectPreviewHide}
            type="button"
          >
            <span className="object-cell-icon" />
            <span>{displayValue}</span>
          </button>
        ) : (
          <span className={key === "_id" ? "mono" : ""}>{displayValue}</span>
        );
      },
      header: key,
      id: key,
      maxSize: maxAutoColumnWidth,
      minSize: key === "_id" ? 230 : 92,
      size: getInitialColumnSize(key, documents),
    }),
  );
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

const contextMenuWidth = 300;
const contextMenuEstimatedHeight = 366;

const getContextMenuLeft = (clientX: number): number =>
  Math.max(10, Math.min(clientX, window.innerWidth - contextMenuWidth - 10));

const getContextMenuTop = (clientY: number): number =>
  Math.max(
    10,
    Math.min(clientY, window.innerHeight - contextMenuEstimatedHeight - 10),
  );

const getCellFilterPath = (tablePath: string[], fieldKey: string): string => {
  if (fieldKey === documentIdColumn) {
    return "_id";
  }

  if (fieldKey === "document") {
    return tablePath.join(".");
  }

  return [...tablePath, fieldKey].filter(Boolean).join(".");
};

const getCellFilterMenuItems = (
  fieldPath: string,
  value: unknown,
): { label: string; operation: CellFilterOperation }[] => {
  const filterValue = getCellFilterValue(value);

  if (!fieldPath || !isFilterableScalarValue(filterValue)) {
    return [];
  }

  const valueLabel = formatFilterValueLabel(filterValue);
  const items: { label: string; operation: CellFilterOperation }[] = [
    { label: `"${fieldPath}" = ${valueLabel}`, operation: "eq" },
    { label: `"${fieldPath}" <> ${valueLabel}`, operation: "ne" },
  ];

  if (typeof filterValue === "string" && filterValue.length > 0) {
    items.push(
      { label: `"${fieldPath}" contains ${valueLabel}`, operation: "contains" },
      {
        label: `"${fieldPath}" not contains ${valueLabel}`,
        operation: "notContains",
      },
      {
        label: `"${fieldPath}" starts with ${valueLabel}`,
        operation: "startsWith",
      },
      {
        label: `"${fieldPath}" not starts with ${valueLabel}`,
        operation: "notStartsWith",
      },
      {
        label: `"${fieldPath}" ends with ${valueLabel}`,
        operation: "endsWith",
      },
      {
        label: `"${fieldPath}" not ends with ${valueLabel}`,
        operation: "notEndsWith",
      },
    );
  }

  if (
    typeof filterValue === "number" ||
    typeof filterValue === "string" ||
    filterValue instanceof Date
  ) {
    items.push(
      { label: `"${fieldPath}" > ${valueLabel}`, operation: "gt" },
      { label: `"${fieldPath}" >= ${valueLabel}`, operation: "gte" },
      { label: `"${fieldPath}" < ${valueLabel}`, operation: "lt" },
      { label: `"${fieldPath}" <= ${valueLabel}`, operation: "lte" },
    );
  }

  items.push(
    { label: `"${fieldPath}" exists`, operation: "exists" },
    { label: `"${fieldPath}" not exists`, operation: "notExists" },
  );

  return items;
};

const buildCellFilterCondition = (
  fieldPath: string,
  value: unknown,
  operation: CellFilterOperation,
): Record<string, unknown> => {
  const filterValue = getCellFilterValue(value);

  switch (operation) {
    case "eq":
      return { [fieldPath]: filterValue };
    case "ne":
      return { [fieldPath]: { $ne: filterValue } };
    case "contains":
      return {
        [fieldPath]: {
          $options: "i",
          $regex: escapeRegex(String(filterValue)),
        },
      };
    case "notContains":
      return {
        [fieldPath]: {
          $not: { $options: "i", $regex: escapeRegex(String(filterValue)) },
        },
      };
    case "startsWith":
      return {
        [fieldPath]: {
          $options: "i",
          $regex: `^${escapeRegex(String(filterValue))}`,
        },
      };
    case "notStartsWith":
      return {
        [fieldPath]: {
          $not: {
            $options: "i",
            $regex: `^${escapeRegex(String(filterValue))}`,
          },
        },
      };
    case "endsWith":
      return {
        [fieldPath]: {
          $options: "i",
          $regex: `${escapeRegex(String(filterValue))}$`,
        },
      };
    case "notEndsWith":
      return {
        [fieldPath]: {
          $not: {
            $options: "i",
            $regex: `${escapeRegex(String(filterValue))}$`,
          },
        },
      };
    case "gt":
      return { [fieldPath]: { $gt: filterValue } };
    case "gte":
      return { [fieldPath]: { $gte: filterValue } };
    case "lt":
      return { [fieldPath]: { $lt: filterValue } };
    case "lte":
      return { [fieldPath]: { $lte: filterValue } };
    case "exists":
      return { [fieldPath]: { $exists: true } };
    case "notExists":
      return { [fieldPath]: { $exists: false } };
  }
};

const mergeMongoFilters = (
  baseFilter: Record<string, unknown>,
  filterCondition: Record<string, unknown>,
): Record<string, unknown> => {
  if (Object.keys(baseFilter).length === 0) {
    return filterCondition;
  }

  if (Array.isArray(baseFilter.$and)) {
    return {
      ...baseFilter,
      $and: [...baseFilter.$and, filterCondition],
    };
  }

  return { $and: [baseFilter, filterCondition] };
};

const getCellFilterValue = (value: unknown): unknown => {
  if (!isRecord(value)) {
    return unwrapEjsonValue(value);
  }

  if ("$numberInt" in value) {
    return Number(value.$numberInt);
  }

  if ("$numberDouble" in value) {
    return Number(value.$numberDouble);
  }

  if ("$numberLong" in value) {
    return Number(value.$numberLong);
  }

  if ("$numberDecimal" in value) {
    return Number(value.$numberDecimal);
  }

  return unwrapEjsonValue(value);
};

const isFilterableScalarValue = (value: unknown): boolean =>
  value === null ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean" ||
  value instanceof Date;

const formatFilterValueLabel = (value: unknown): string => {
  if (typeof value === "string") {
    return `"${value}"`;
  }

  if (value === null) {
    return "null";
  }

  return String(value);
};

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getObjectPreviewLeft = (rect: DOMRect): number => {
  return Math.max(
    12,
    Math.min(rect.left, window.innerWidth - objectPreviewWidth - 12),
  );
};

const getObjectPreviewTop = (rect: DOMRect, previewHeight: number): number => {
  const belowTop = rect.bottom + objectPreviewGap;

  if (belowTop + previewHeight <= window.innerHeight - 12) {
    return belowTop;
  }

  const aboveTop = rect.top - previewHeight - objectPreviewGap;

  if (aboveTop >= 12) {
    return aboveTop;
  }

  return Math.max(12, window.innerHeight - previewHeight - 12);
};

const getObjectPreviewHeight = (content: string): number => {
  const lineCount = content.split("\n").length;
  const estimatedContentHeight = lineCount * 18.6 + 26;

  return Math.min(Math.max(estimatedContentHeight, 58), objectPreviewHeight);
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
  const autoSize = getAutoColumnSize(key, documents);
  const headerWidth = getDisplayWidth(key) + 86;
  const minWidth = key === "_id" ? 250 : 112;

  return Math.max(
    Math.min(Math.max(autoSize, minWidth), maxInitialColumnWidth),
    headerWidth,
  );
};

const getInitialColumnSizes = (
  documents: ParsedDocument[],
): Record<string, number> =>
  Object.fromEntries(
    orderDocumentColumnKeys([
      ...new Set(documents.flatMap((document) => Object.keys(document.value))),
    ]).map((key) => [key, getInitialColumnSize(key, documents)]),
  );

const getAutoColumnSizes = (
  documents: ParsedDocument[],
): Record<string, number> =>
  Object.fromEntries(
    orderDocumentColumnKeys([
      ...new Set(documents.flatMap((document) => Object.keys(document.value))),
    ]).map((key) => [key, getAutoColumnSize(key, documents)]),
  );

const getAutoColumnSize = (
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

  return Math.min(Math.max(paddedWidth, minWidth), maxAutoColumnWidth);
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
  projectionInput,
  skipInput,
  sortInput,
}: {
  filterInput: string;
  limitInput: string;
  projectionInput: string;
  skipInput: string;
  sortInput: string;
}):
  | { ok: true; value: DocumentQueryState }
  | { message: string; ok: false } => {
  const filter = parseJsonObject(filterInput, "Filter");
  const projection = parseJsonObject(projectionInput, "Projection");
  const sort = parseSortInput(sortInput);
  const limit = Number(limitInput);
  const skip = Number(skipInput);

  if (!filter.ok) {
    return filter;
  }

  if (!projection.ok) {
    return projection;
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
      projection: projection.value,
      skip,
      sort: sort.value,
    },
  };
};

type QueryFieldSuggestionContext = {
  fragment: string;
  hasOpeningQuote: boolean;
  start: number;
};

type QueryFieldSuggestion = {
  label: string;
  path: string;
  type: string;
};

const getQueryFieldSuggestionContext = (
  value: string,
  caretIndex: number,
): QueryFieldSuggestionContext | null => {
  const prefix = value.slice(0, caretIndex);
  const match = /(?:^|[,{]\s*)"?([\w.$-]*\.?)$/.exec(prefix);

  if (!match) {
    return null;
  }

  const fragment = match[1] ?? "";

  return {
    fragment,
    hasOpeningQuote: prefix[prefix.length - fragment.length - 1] === '"',
    start: prefix.length - fragment.length,
  };
};

const getQueryFieldSuggestions = (
  fields: SchemaFieldSummary[],
  fragment: string,
): QueryFieldSuggestion[] => {
  const normalizedFragment = fragment.trim();
  const fragmentParts = normalizedFragment.split(".");
  const parentParts =
    normalizedFragment.endsWith(".") || fragmentParts.length > 1
      ? fragmentParts.slice(0, -1)
      : [];
  const typedSegment = normalizedFragment.endsWith(".")
    ? ""
    : (fragmentParts.at(-1) ?? "");
  const parentPath = parentParts.join(".");
  const suggestions = new Map<string, QueryFieldSuggestion>();

  for (const field of fields) {
    const parts = field.name.split(".");

    if (parentParts.some((part, index) => parts[index] !== part)) {
      continue;
    }

    const child = parts[parentParts.length];

    if (!child || !child.toLowerCase().startsWith(typedSegment.toLowerCase())) {
      continue;
    }

    const path = parentPath ? `${parentPath}.${child}` : child;
    const exactField = fields.find((item) => item.name === path);

    suggestions.set(path, {
      label: child,
      path,
      type: exactField?.type ?? "Object",
    });
  }

  return [...suggestions.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
};

const insertQueryFieldSuggestion = ({
  context,
  mode,
  path,
  value,
}: {
  context: QueryFieldSuggestionContext;
  mode: "field" | "filter" | "projection";
  path: string;
  value: string;
}): string => {
  if (mode === "field") {
    return path;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue || trimmedValue === "{}") {
    return `{"${path}":${mode === "filter" ? '""' : "1"}}`;
  }

  const before = value.slice(0, context.start);
  const after = value.slice(context.start + context.fragment.length);
  const formattedKey = getFormattedQueryFieldKey(context, path);
  const valueSuffix = getQueryFieldSuggestionValueSuffix(after, mode);

  return `${before}${formattedKey}${valueSuffix}${after}`;
};

const getFormattedQueryFieldKey = (
  context: QueryFieldSuggestionContext,
  path: string,
): string => (context.hasOpeningQuote ? path : `"${path}"`);

const getQueryFieldSuggestionValueSuffix = (
  after: string,
  mode: "filter" | "projection",
): string => {
  const nextAfter = after.trimStart();

  if (nextAfter.startsWith(":") || nextAfter.startsWith('"')) {
    return "";
  }

  return mode === "filter" ? ':""' : ":1";
};

const parseJsonObject = (
  value: string,
  label: string,
):
  | { ok: true; value: Record<string, unknown> }
  | { message: string; ok: false } => {
  try {
    const parsed = JSON.parse(normalizeMongoJsonInput(value)) as unknown;

    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return { message: `${label} must be a JSON object.`, ok: false };
    }

    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { message: `${label} must be valid JSON.`, ok: false };
  }
};

const normalizeMongoJsonInput = (value: string): string => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "{}";
  }

  return trimmedValue
    .replace(/([{,]\s*)([A-Za-z_$][\w$.-]*)(\s*:)/g, '$1"$2"$3')
    .replace(/,\s*([}\]])/g, "$1");
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

const formatQueryBuilderOperator = (
  operator: QueryBuilderConditionOperator,
): string => {
  switch (operator) {
    case "equals":
      return "Equals";
    case "notEquals":
      return "Not equals";
    case "greaterThan":
      return "Greater than";
    case "greaterThanOrEqual":
      return "Greater than or equal";
    case "lessThan":
      return "Less than";
    case "lessThanOrEqual":
      return "Less than or equal";
    case "contains":
      return "Contains";
    case "exists":
      return "Exists";
    case "in":
      return "In";
    case "notIn":
      return "Not in";
    case "regex":
      return "Regex";
  }
};

const formatQueryBuilderInputValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
};

const parseQueryBuilderInputValue = (
  value: string,
  operator: QueryBuilderConditionOperator,
): unknown => {
  if (operator === "in" || operator === "notIn") {
    return parseQueryBuilderListValue(value);
  }

  return parseQueryBuilderScalarValue(value);
};

const parseQueryBuilderListValue = (value: string): unknown[] => {
  const parsed = parseQueryBuilderJsonValue(value);

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed !== undefined) {
    return [parsed];
  }

  return value
    .split(",")
    .map((item) => parseQueryBuilderScalarValue(item.trim()))
    .filter((item) => item !== "");
};

const parseQueryBuilderScalarValue = (value: string): unknown => {
  const parsed = parseQueryBuilderJsonValue(value);

  if (parsed !== undefined) {
    return parsed;
  }

  return value;
};

const parseQueryBuilderJsonValue = (value: string): unknown => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  try {
    return JSON.parse(trimmedValue) as unknown;
  } catch {
    return undefined;
  }
};

const parseEjsonDocuments = (documents: string[]): ParsedDocument[] =>
  documents.map((document, index) => {
    const value = parseEjsonDocument(document);

    return {
      ejson: document,
      id: getDocumentId(value, index),
      rootValue: value,
      value,
    };
  });

type SchemaAccumulator = {
  presentInDocuments: Set<number>;
  sampleCount: number;
  types: Set<string>;
};

const inferDocumentSchema = (
  documents: ParsedDocument[],
): SchemaFieldSummary[] => {
  const fields = new Map<string, SchemaAccumulator>();

  documents.forEach((document, index) => {
    const seenPaths = new Set<string>();
    collectSchemaFields(document.rootValue, "", fields, seenPaths);

    for (const path of seenPaths) {
      fields.get(path)?.presentInDocuments.add(index);
    }
  });

  return [...fields.entries()]
    .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath))
    .map(([path, field]) => ({
      meta:
        field.presentInDocuments.size === documents.length
          ? "Required"
          : "Optional",
      name: path,
      type: formatSchemaTypes(field.types),
    }));
};

const collectSchemaFields = (
  value: Record<string, unknown>,
  prefix: string,
  fields: Map<string, SchemaAccumulator>,
  seenPaths: Set<string>,
) => {
  for (const [key, fieldValue] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    addSchemaSample(path, fieldValue, fields, seenPaths);

    if (isPlainSchemaObject(fieldValue)) {
      collectSchemaFields(
        fieldValue as Record<string, unknown>,
        path,
        fields,
        seenPaths,
      );
      continue;
    }

    if (Array.isArray(fieldValue)) {
      fieldValue.forEach((item) => {
        if (isPlainSchemaObject(item)) {
          collectSchemaFields(
            item as Record<string, unknown>,
            path,
            fields,
            seenPaths,
          );
        }
      });
    }
  }
};

const addSchemaSample = (
  path: string,
  value: unknown,
  fields: Map<string, SchemaAccumulator>,
  seenPaths: Set<string>,
) => {
  const field = fields.get(path) ?? {
    presentInDocuments: new Set<number>(),
    sampleCount: 0,
    types: new Set<string>(),
  };

  field.sampleCount += 1;
  field.types.add(getSchemaValueType(value));
  fields.set(path, field);
  seenPaths.add(path);
};

const formatSchemaTypes = (types: Set<string>): string =>
  [...types].sort().join(" | ");

const getSchemaValueType = (value: unknown): string => {
  const ejsonType = getEjsonSchemaType(value);

  if (ejsonType) {
    return ejsonType;
  }

  if (value === null) {
    return "Null";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "Array";
    }

    const itemTypes = new Set(value.map((item) => getSchemaValueType(item)));

    return `Array<${formatSchemaTypes(itemTypes)}>`;
  }

  if (isRecord(value)) {
    return "Object";
  }

  if (typeof value === "boolean") {
    return "Boolean";
  }

  if (typeof value === "number") {
    return "Number";
  }

  if (typeof value === "string") {
    return "String";
  }

  return "Unknown";
};

const getEjsonSchemaType = (value: unknown): string | null => {
  if (!isRecord(value)) {
    return null;
  }

  const keys = Object.keys(value);

  if (keys.length !== 1) {
    return null;
  }

  switch (keys[0]) {
    case "$binary":
      return "Binary";
    case "$date":
      return "Date";
    case "$numberDecimal":
      return "Decimal128";
    case "$numberDouble":
      return "Double";
    case "$numberInt":
      return "Int32";
    case "$numberLong":
      return "Long";
    case "$oid":
      return "ObjectId";
    case "$regularExpression":
      return "Regex";
    case "$timestamp":
      return "Timestamp";
    default:
      return null;
  }
};

const isPlainSchemaObject = (value: unknown): boolean =>
  isRecord(value) && getEjsonSchemaType(value) === null;

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

const formatPreviewJson = (value: unknown): string =>
  JSON.stringify(unwrapEjsonValue(value), null, 2);

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
