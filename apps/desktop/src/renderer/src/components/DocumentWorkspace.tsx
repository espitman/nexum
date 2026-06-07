import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import "../monacoEnvironment";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
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
  addAggregationPipelineStage,
  buildRawPipelineFromAggregationModel,
  createAggregationPipelineStage,
  createDefaultAggregationPipelineModel,
  moveAggregationPipelineStage,
  removeAggregationPipelineStage,
  setAggregationPipelineStageEnabled,
  updateAggregationPipelineStage,
  type AggregationPipelineModel,
  type AggregationPipelineStage,
  type AggregationPipelineStageType,
  type CountAggregationStage,
  type GroupAggregationStage,
  type LimitAggregationStage,
  type MatchAggregationStage,
  type ProjectAggregationStage,
  type SkipAggregationStage,
  type SortAggregationStage,
  type UnwindAggregationStage,
} from "../aggregationPipelineModel";
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
  SavedWorkspaceBookmark,
  SavedWorkspaceQuery,
  SavedWorkspaceTask,
  SchemaFieldSummary,
} from "../types";
import { ConnectionManager } from "./ConnectionManager";
import { Icon } from "./Icon";
import { IndexList, SchemaTree } from "./InspectorPanel";

loader.config({ monaco });

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
  onSelectedCollectionChange: (collectionName: string | null) => void;
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

type AggregationRunResult = {
  documents: string[];
  executionTimeMs?: number;
  message: string;
  pipeline: Record<string, unknown>[];
  status: "error" | "ready" | "running";
};

const defaultQueryState: DocumentQueryState = {
  filter: {},
  limit: 50,
  projection: {},
  skip: 0,
  sort: {},
};

const savedQueriesStorageKey = "nexum.savedQueries.v1";
const queryHistoryStorageKey = "nexum.queryHistory.v1";
const savedBookmarksStorageKey = "nexum.bookmarks.v1";
const savedTasksStorageKey = "nexum.tasks.v1";
const addBookmarkEventName = "nexum:add-bookmark";
const documentIdColumn = "{Document id}";
const documentTableHorizontalGutter = 96;
const maxAutoColumnWidth = 1400;
const maxInitialColumnWidth = 360;
const objectPreviewGap = 8;
const objectPreviewHeight = 280;
const objectPreviewWidth = 360;

type AddBookmarkEventDetail = {
  collection?: string;
  connectionId: string;
  connectionName: string;
  database: string;
  documentId?: string;
  kind: SavedWorkspaceBookmark["kind"];
};

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
  onSelectedCollectionChange,
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
  const [savedQueries, setSavedQueries] = useState<SavedWorkspaceQuery[]>(() =>
    readStoredQueries(savedQueriesStorageKey),
  );
  const [queryHistory, setQueryHistory] = useState<SavedWorkspaceQuery[]>(() =>
    readStoredQueries(queryHistoryStorageKey),
  );
  const [bookmarks, setBookmarks] = useState<SavedWorkspaceBookmark[]>(() =>
    readStoredBookmarks(savedBookmarksStorageKey),
  );
  const [tasks, setTasks] = useState<SavedWorkspaceTask[]>(() =>
    readStoredTasks(savedTasksStorageKey),
  );
  const [aggregationPipelineModel, setAggregationPipelineModel] =
    useState<AggregationPipelineModel>(() =>
      addAggregationPipelineStage(
        createDefaultAggregationPipelineModel(),
        createAggregationPipelineStage("match", { id: "match_stage" }),
      ),
    );
  const [aggregationRunResult, setAggregationRunResult] =
    useState<AggregationRunResult | null>(null);
  const [skipInput, setSkipInput] = useState("0");
  const [sortInput, setSortInput] = useState("{}");
  const [queryInputError, setQueryInputError] = useState<string | null>(null);
  const [isQueryBuilderOpen, setIsQueryBuilderOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] =
    useState<ParsedDocument | null>(null);
  const lastRecordedHistoryIdRef = useRef<string | null>(null);
  const [editorDocument, setEditorDocument] = useState<ParsedDocument | null>(
    null,
  );
  const runningTaskIdsRef = useRef<Set<string>>(new Set());
  const cancelRequestedTaskIdsRef = useRef<Set<string>>(new Set());
  const [pendingInlineDocuments, setPendingInlineDocuments] = useState<
    Map<string, ParsedDocument>
  >(() => new Map());
  const [tableDrillState, setTableDrillState] = useState<{
    collectionName: string | null;
    path: string[];
  }>({ collectionName: null, path: [] });
  const isCollectionWorkspace =
    activeSection === "Explore" && selectedCollectionName !== null;
  const isMetadataWorkspace =
    activeWorkspaceTab === "Schema" || activeWorkspaceTab === "Indexes";
  const isAggregationWorkspace = activeWorkspaceTab === "Aggregation Pipeline";
  const shouldShowQueryBuilderPanel =
    isCollectionWorkspace &&
    !isMetadataWorkspace &&
    !isAggregationWorkspace &&
    isQueryBuilderOpen;
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
  const schemaDocumentsQuery = useQuery({
    enabled:
      isCollectionWorkspace &&
      Boolean(selectedConnectionId) &&
      selectedCollectionPath !== null,
    queryKey: [
      "schema-documents",
      selectedConnectionId,
      selectedCollectionPath?.database,
      selectedCollectionPath?.collection,
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
        filter: {},
        limit: 100,
        projection: {},
        skip: 0,
        sort: {},
      });
    },
  });
  const parsedDocuments = useMemo(
    () => parseEjsonDocuments(documentsQuery.data?.documents ?? []),
    [documentsQuery.data?.documents],
  );
  const displayedDocuments = useMemo(() => {
    if (pendingInlineDocuments.size === 0) {
      return parsedDocuments;
    }

    return parsedDocuments.map(
      (document) => pendingInlineDocuments.get(document.id) ?? document,
    );
  }, [parsedDocuments, pendingInlineDocuments]);
  const schemaParsedDocuments = useMemo(
    () => parseEjsonDocuments(schemaDocumentsQuery.data?.documents ?? []),
    [schemaDocumentsQuery.data?.documents],
  );
  const schemaFields = useMemo(
    () =>
      inferDocumentSchema(
        schemaParsedDocuments.length > 0
          ? schemaParsedDocuments
          : parsedDocuments,
      ),
    [parsedDocuments, schemaParsedDocuments],
  );
  const queryBuilderFields = useMemo(
    () =>
      inferQueryBuilderFields(
        (schemaParsedDocuments.length > 0
          ? schemaParsedDocuments
          : parsedDocuments
        ).map((document) => document.rootValue),
      ),
    [parsedDocuments, schemaParsedDocuments],
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
  const currentQueryTarget =
    selectedConnection && selectedCollectionPath
      ? {
          collection: selectedCollectionPath.collection,
          connectionId: selectedConnection.id,
          connectionName: selectedConnection.name,
          database: selectedCollectionPath.database,
        }
      : null;
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
    setSelectedDocument(null);
    setEditorDocument(null);
    setFilterInput(JSON.stringify(nextState.value.filter));
    setProjectionInput(JSON.stringify(nextState.value.projection));
    setSortInput(JSON.stringify(nextState.value.sort));
    setQueryState(nextState.value);
    recordQueryRun(nextState.value);
  };

  const runQueryBuilder = () => {
    setQueryInputError(null);
    setSelectedDocument(null);
    setEditorDocument(null);
    setFilterInput(queryBuilderPreview);
    setSkipInput("0");
    setQueryState((currentState) => ({
      ...currentState,
      filter: queryBuilderFilter,
      skip: 0,
    }));
    recordQueryRun({
      ...queryState,
      filter: queryBuilderFilter,
      skip: 0,
    });
  };

  const buildQuerySnapshot = (
    state: DocumentQueryState,
    overrides: Partial<SavedWorkspaceQuery> = {},
  ): SavedWorkspaceQuery | null => {
    if (!currentQueryTarget) {
      return null;
    }

    const now = new Date().toISOString();

    return {
      collection: currentQueryTarget.collection,
      connectionId: currentQueryTarget.connectionId,
      connectionName: currentQueryTarget.connectionName,
      createdAt: now,
      database: currentQueryTarget.database,
      filter: state.filter,
      id: `query_${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
      kind: "find",
      lastRunAt: now,
      limit: state.limit,
      name: `${currentQueryTarget.collection} find`,
      notes: "",
      projection: state.projection,
      skip: state.skip,
      sort: state.sort,
      updatedAt: now,
      ...overrides,
    };
  };

  const recordQueryRun = (state: DocumentQueryState) => {
    const snapshot = buildQuerySnapshot(state, {
      id: `history_${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
      name: `${currentQueryTarget?.collection ?? "Query"} run`,
    });

    if (!snapshot) {
      return;
    }

    setQueryHistory((currentHistory) =>
      [snapshot, ...currentHistory].slice(0, 50),
    );
    lastRecordedHistoryIdRef.current = snapshot.id;
  };

  const recordAggregationRun = (
    pipeline: Record<string, unknown>[],
    result: { documents: string[]; executionTimeMs?: number },
  ) => {
    const snapshot = buildQuerySnapshot(defaultQueryState, {
      id: `history_${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
      kind: "aggregation",
      name: `${currentQueryTarget?.collection ?? "Pipeline"} aggregation`,
      pipeline,
      resultCount: result.documents.length,
      ...(result.executionTimeMs !== undefined
        ? { executionTimeMs: result.executionTimeMs }
        : {}),
    });

    if (!snapshot) {
      return;
    }

    setQueryHistory((currentHistory) =>
      [snapshot, ...currentHistory].slice(0, 50),
    );
  };

  const saveCurrentQuery = () => {
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

    const snapshot = buildQuerySnapshot(nextState.value, {
      name: createSavedQueryName(
        currentQueryTarget?.collection ?? "Collection",
        nextState.value.filter,
      ),
    });

    if (!snapshot) {
      onConnectionError(
        "Save query failed",
        "Select a connected collection before saving a query.",
      );
      return;
    }

    setQueryInputError(null);
    const { lastRunAt: _lastRunAt, ...savedSnapshot } = snapshot;

    setSavedQueries((currentQueries) => [savedSnapshot, ...currentQueries]);
  };

  const deleteSavedQuery = (queryId: string) => {
    setSavedQueries((currentQueries) =>
      currentQueries.filter((query) => query.id !== queryId),
    );
  };

  const duplicateSavedQuery = (query: SavedWorkspaceQuery) => {
    const now = new Date().toISOString();

    setSavedQueries((currentQueries) => [
      {
        ...query,
        createdAt: now,
        id: `query_${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
        name: `${query.name} copy`,
        updatedAt: now,
      },
      ...currentQueries,
    ]);
  };

  const renameSavedQuery = (queryId: string, name: string) => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    setSavedQueries((currentQueries) =>
      currentQueries.map((query) =>
        query.id === queryId
          ? {
              ...query,
              name: trimmedName,
              updatedAt: new Date().toISOString(),
            }
          : query,
      ),
    );
  };

  const updateSavedQueryNotes = (queryId: string, notes: string) => {
    setSavedQueries((currentQueries) =>
      currentQueries.map((query) =>
        query.id === queryId
          ? {
              ...query,
              notes,
              updatedAt: new Date().toISOString(),
            }
          : query,
      ),
    );
  };

  const openSavedQuery = (query: SavedWorkspaceQuery) => {
    onSelectedConnectionChange(query.connectionId);
    onSelectedCollectionChange(`${query.database}.${query.collection}`);
    setSelectedDocument(null);
    setEditorDocument(null);
    setTableDrillState({ collectionName: null, path: [] });
    setFilterInput(JSON.stringify(query.filter));
    setProjectionInput(JSON.stringify(query.projection));
    setSortInput(JSON.stringify(query.sort));
    setLimitInput(String(query.limit));
    setSkipInput(String(query.skip));
    setQueryState({
      filter: query.filter,
      limit: query.limit,
      projection: query.projection,
      skip: query.skip,
      sort: query.sort,
    });
    onWorkspaceTabChange("Documents");
    onSectionChange("Explore");
  };

  const executeTask = useCallback(
    async (task: SavedWorkspaceTask, trigger: "manual" | "schedule") => {
      if (runningTaskIdsRef.current.has(task.id)) {
        return;
      }

      const startedAt = new Date().toISOString();
      runningTaskIdsRef.current.add(task.id);
      setTasks((currentTasks) =>
        currentTasks.map((currentTask) =>
          currentTask.id === task.id
            ? {
                ...currentTask,
                lastModifiedAt: startedAt,
                status: "running",
              }
            : currentTask,
        ),
      );

      try {
        const query = task.sourceQuery;
        let executionTimeMs: number | undefined;
        let resultCount: number | undefined;
        let message: string;

        if (task.type === "audit-cleanup") {
          const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
          const removedRuns = tasks.reduce(
            (total, currentTask) =>
              total +
              (currentTask.runs ?? []).filter((run) => {
                const finishedAt = Date.parse(run.finishedAt);

                return Number.isFinite(finishedAt) && finishedAt < cutoff;
              }).length,
            0,
          );

          setTasks((currentTasks) =>
            currentTasks.map((currentTask) => {
              const currentRuns = currentTask.runs ?? [];
              const keptRuns = currentRuns.filter((run) => {
                const finishedAt = Date.parse(run.finishedAt);

                return !Number.isFinite(finishedAt) || finishedAt >= cutoff;
              });

              return keptRuns.length === currentRuns.length
                ? currentTask
                : {
                    ...currentTask,
                    runs: keptRuns,
                  };
            }),
          );

          message =
            removedRuns === 0
              ? "No local task run records needed cleanup."
              : `Cleaned ${removedRuns} local task run record${
                  removedRuns === 1 ? "" : "s"
                } older than 30 days.`;
        } else {
          if (!window.nexum) {
            throw new Error("Preload API is unavailable");
          }

          if (task.type === "schema-inference") {
            const result = await window.nexum.mongodb.findDocuments({
              collection: query.collection,
              connectionId: query.connectionId,
              database: query.database,
              filter: {},
              limit: 100,
              projection: {},
              skip: 0,
              sort: {},
            });
            const fields = inferDocumentSchema(
              parseEjsonDocuments(result.documents),
            );

            executionTimeMs = result.executionTimeMs;
            resultCount = fields.length;
            message = `Inferred ${fields.length} schema field${
              fields.length === 1 ? "" : "s"
            } from ${result.documents.length} sampled document${
              result.documents.length === 1 ? "" : "s"
            }.`;
          } else {
            const result =
              query.kind === "aggregation"
                ? await window.nexum.mongodb.aggregate({
                    collection: query.collection,
                    connectionId: query.connectionId,
                    database: query.database,
                    limit: query.limit,
                    pipeline: query.pipeline ?? [],
                  })
                : await window.nexum.mongodb.findDocuments({
                    collection: query.collection,
                    connectionId: query.connectionId,
                    database: query.database,
                    filter: query.filter,
                    limit: query.limit,
                    projection: query.projection,
                    skip: query.skip,
                    sort: query.sort,
                  });

            executionTimeMs = result.executionTimeMs;
            resultCount = result.documents.length;
            message =
              task.type === "export"
                ? `Prepared JSON export for ${result.documents.length} document${
                    result.documents.length === 1 ? "" : "s"
                  } in ${result.executionTimeMs} ms.`
                : `${result.documents.length} document${
                    result.documents.length === 1 ? "" : "s"
                  } returned in ${result.executionTimeMs} ms.`;
          }
        }

        const finishedAt = new Date().toISOString();

        if (cancelRequestedTaskIdsRef.current.has(task.id)) {
          cancelRequestedTaskIdsRef.current.delete(task.id);

          throw new Error("Task canceled by user.");
        }

        const run: SavedWorkspaceTask["runs"][number] = {
          ...(executionTimeMs !== undefined ? { executionTimeMs } : {}),
          finishedAt,
          id: `task_run_${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
          message,
          ...(resultCount !== undefined ? { resultCount } : {}),
          startedAt,
          status: "success",
          trigger,
        };

        setTasks((currentTasks) =>
          currentTasks.map((currentTask) => {
            if (currentTask.id !== task.id) {
              return currentTask;
            }

            const nextTask: SavedWorkspaceTask = {
              ...currentTask,
              lastModifiedAt: finishedAt,
              lastRunAt: finishedAt,
              result: message,
              runs: [run, ...(currentTask.runs ?? [])].slice(0, 20),
              status: "success",
            };

            if (currentTask.schedule !== "manual") {
              nextTask.nextRunAt = getNextTaskRunAt(
                currentTask.schedule,
                currentTask.scheduleTime,
              );
            }

            return nextTask;
          }),
        );
      } catch (error) {
        const finishedAt = new Date().toISOString();
        const message =
          error instanceof Error ? error.message : "Task execution failed.";
        const run: SavedWorkspaceTask["runs"][number] = {
          error: message,
          finishedAt,
          id: `task_run_${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
          message,
          startedAt,
          status: "failed",
          trigger,
        };

        setTasks((currentTasks) =>
          currentTasks.map((currentTask) => {
            if (currentTask.id !== task.id) {
              return currentTask;
            }

            const nextTask: SavedWorkspaceTask = {
              ...currentTask,
              lastModifiedAt: finishedAt,
              lastRunAt: finishedAt,
              result: message,
              runs: [run, ...(currentTask.runs ?? [])].slice(0, 20),
              status: "failed",
            };

            if (currentTask.schedule !== "manual") {
              nextTask.nextRunAt = getNextTaskRunAt(
                currentTask.schedule,
                currentTask.scheduleTime,
              );
            }

            return nextTask;
          }),
        );
      } finally {
        runningTaskIdsRef.current.delete(task.id);
        cancelRequestedTaskIdsRef.current.delete(task.id);
      }
    },
    [setTasks, tasks],
  );

  const createTaskFromQuery = (
    query: SavedWorkspaceQuery,
    type: SavedWorkspaceTask["type"] = query.kind === "aggregation"
      ? "aggregation"
      : "find",
  ) => {
    const now = new Date().toISOString();
    const task: SavedWorkspaceTask = {
      createdAt: now,
      id: `task_${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
      lastModifiedAt: now,
      name: `${query.name} ${getTaskTypeSuffix(type)}`,
      schedule: "manual",
      runs: [],
      sourceQuery: query,
      status: "idle",
      target: `${query.database}.${query.collection}`,
      type,
    };

    setTasks((currentTasks) => [task, ...currentTasks]);
  };

  const createTaskFromCurrentQuery = (
    type: SavedWorkspaceTask["type"] = "find",
  ) => {
    const nextState = parseDocumentQueryInputs({
      filterInput,
      limitInput,
      projectionInput,
      skipInput,
      sortInput,
    });

    if (!nextState.ok) {
      onConnectionError("Create task failed", nextState.message);
      return;
    }

    const snapshot = buildQuerySnapshot(nextState.value, {
      name: createSavedQueryName(
        currentQueryTarget?.collection ?? "Collection",
        nextState.value.filter,
      ),
    });

    if (!snapshot) {
      onConnectionError(
        "Create task failed",
        "Select a connected collection before creating a task.",
      );
      return;
    }

    createTaskFromQuery(snapshot, type);
  };

  const previewTask = (task: SavedWorkspaceTask) => {
    openSavedQuery(task.sourceQuery);
  };

  const performTask = (task: SavedWorkspaceTask) => {
    void executeTask(task, "manual");
  };

  const cancelTask = (task: SavedWorkspaceTask) => {
    if (!runningTaskIdsRef.current.has(task.id)) {
      return;
    }

    const now = new Date().toISOString();
    cancelRequestedTaskIdsRef.current.add(task.id);
    setTasks((currentTasks) =>
      currentTasks.map((currentTask) =>
        currentTask.id === task.id
          ? {
              ...currentTask,
              lastModifiedAt: now,
              result: "Cancel requested. The active operation will be ignored.",
              status: "failed",
            }
          : currentTask,
      ),
    );
  };

  const retryTask = (task: SavedWorkspaceTask) => {
    void executeTask(task, "manual");
  };

  const cloneTask = (task: SavedWorkspaceTask) => {
    const now = new Date().toISOString();
    const nextTask: SavedWorkspaceTask = {
      ...task,
      createdAt: now,
      id: `task_${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
      lastModifiedAt: now,
      name: `${task.name} copy`,
      runs: [],
      status: "idle",
    };

    if (task.schedule !== "manual") {
      nextTask.nextRunAt = getNextTaskRunAt(task.schedule, task.scheduleTime);
    } else {
      delete nextTask.nextRunAt;
    }

    setTasks((currentTasks) => [nextTask, ...currentTasks]);
  };

  const scheduleTask = (
    taskId: string,
    schedule: Exclude<SavedWorkspaceTask["schedule"], "manual">,
    scheduleTime?: string,
  ) => {
    const now = new Date().toISOString();

    setTasks((currentTasks) =>
      currentTasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const { scheduleTime: _scheduleTime, ...nextTask } = task;

        return {
              ...nextTask,
              lastModifiedAt: now,
              nextRunAt: getNextTaskRunAt(schedule, scheduleTime),
              schedule,
              ...(scheduleTime ? { scheduleTime } : {}),
            };
      }),
    );
  };

  const unscheduleTask = (taskId: string) => {
    const now = new Date().toISOString();

    setTasks((currentTasks) =>
      currentTasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const { nextRunAt: _nextRunAt, ...nextTask } = task;
        const { scheduleTime: _scheduleTime, ...manualTask } = nextTask;

        return {
          ...manualTask,
          lastModifiedAt: now,
          schedule: "manual",
        };
      }),
    );
  };

  const removeTask = (taskId: string) => {
    setTasks((currentTasks) =>
      currentTasks.filter((task) => task.id !== taskId),
    );
  };

  const createBookmark = useCallback(
    (detail: AddBookmarkEventDetail) => {
      const bookmark = buildBookmarkSnapshot({
        kind: detail.kind,
        target: detail,
      });

      if (!bookmark.ok) {
        onConnectionError("Save bookmark failed", bookmark.message);
        return;
      }

      setBookmarks((currentBookmarks) => [bookmark.value, ...currentBookmarks]);
    },
    [onConnectionError, setBookmarks],
  );

  const createDocumentBookmark = useCallback(
    (document: ParsedDocument) => {
      if (!selectedConnection || !selectedCollectionPath) {
        onConnectionError(
          "Save bookmark failed",
          "Select a connected collection before saving a document bookmark.",
        );
        return;
      }

      createBookmark({
        collection: selectedCollectionPath.collection,
        connectionId: selectedConnection.id,
        connectionName: selectedConnection.name,
        database: selectedCollectionPath.database,
        documentId: document.id,
        kind: "document",
      });
    },
    [
      createBookmark,
      onConnectionError,
      selectedCollectionPath,
      selectedConnection,
    ],
  );

  const deleteBookmark = (bookmarkId: string) => {
    setBookmarks((currentBookmarks) =>
      currentBookmarks.filter((bookmark) => bookmark.id !== bookmarkId),
    );
  };

  const moveBookmark = (bookmarkId: string, direction: -1 | 1) => {
    setBookmarks((currentBookmarks) => {
      const index = currentBookmarks.findIndex(
        (bookmark) => bookmark.id === bookmarkId,
      );
      const nextIndex = index + direction;

      if (
        index < 0 ||
        nextIndex < 0 ||
        nextIndex >= currentBookmarks.length
      ) {
        return currentBookmarks;
      }

      const nextBookmarks = [...currentBookmarks];
      const [bookmark] = nextBookmarks.splice(index, 1);

      if (!bookmark) {
        return currentBookmarks;
      }

      nextBookmarks.splice(nextIndex, 0, bookmark);
      return nextBookmarks;
    });
  };

  const updateBookmark = (
    bookmarkId: string,
    updates: Pick<SavedWorkspaceBookmark, "notes" | "tags">,
  ) => {
    setBookmarks((currentBookmarks) =>
      currentBookmarks.map((bookmark) =>
        bookmark.id === bookmarkId
          ? {
              ...bookmark,
              notes: updates.notes,
              tags: updates.tags,
              updatedAt: new Date().toISOString(),
            }
          : bookmark,
      ),
    );
  };

  const openBookmark = (bookmark: SavedWorkspaceBookmark) => {
    onSelectedConnectionChange(bookmark.connectionId);

    if (bookmark.database && bookmark.collection) {
      onSelectedCollectionChange(`${bookmark.database}.${bookmark.collection}`);
      onWorkspaceTabChange("Documents");
      onSectionChange("Explore");
      return;
    }

    if (bookmark.database) {
      onSelectedCollectionChange(null);
      onSectionChange("Explore");
      return;
    }

    onSelectedCollectionChange(null);
    onSectionChange("Connections");
  };

  const updateDocumentMutation = useMutation({
    mutationFn: async ({
      confirmedProductionWrite,
      documentId: _documentId,
      editedDocument,
      originalDocument,
    }: {
      confirmedProductionWrite: boolean;
      documentId: string;
      editedDocument: string;
      originalDocument: string;
    }) => {
      if (!window.nexum) {
        throw new Error("Preload API is unavailable");
      }

      if (!selectedConnectionId || !selectedCollectionPath) {
        throw new Error("No collection selected");
      }

      return window.nexum.mongodb.updateDocument({
        collection: selectedCollectionPath.collection,
        confirmedProductionWrite,
        connectionId: selectedConnectionId,
        database: selectedCollectionPath.database,
        editedDocument,
        originalDocument,
      });
    },
    onError(error, variables) {
      setPendingInlineDocuments((currentDocuments) => {
        if (!currentDocuments.has(variables.documentId)) {
          return currentDocuments;
        }

        const nextDocuments = new Map(currentDocuments);
        nextDocuments.delete(variables.documentId);
        return nextDocuments;
      });
      const message =
        error instanceof Error
          ? getSafeWorkspaceErrorMessage(error)
          : "Unable to save document.";
      onConnectionError("Save document failed", message);
    },
    async onSuccess(_data, variables) {
      setEditorDocument(null);
      await documentsQuery.refetch();
      setPendingInlineDocuments((currentDocuments) => {
        if (!currentDocuments.has(variables.documentId)) {
          return currentDocuments;
        }

        const nextDocuments = new Map(currentDocuments);
        nextDocuments.delete(variables.documentId);
        return nextDocuments;
      });
    },
  });

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

  const applyCellProjection = ({ mode, path }: CellProjectionRequest) => {
    const parsedProjection = parseJsonObject(projectionInput, "Projection");
    const baseProjection = parsedProjection.ok
      ? parsedProjection.value
      : queryState.projection;
    const nextProjection = {
      ...baseProjection,
      [path]: mode === "include" ? 1 : 0,
    };

    setQueryInputError(null);
    setProjectionInput(JSON.stringify(nextProjection));
    setSkipInput("0");
    setQueryState((currentState) => ({
      ...currentState,
      projection: nextProjection,
      skip: 0,
    }));
  };

  const applyCellEdit = ({
    document,
    path,
    rawValue,
    schemaField,
    value,
  }: CellEditRequest) => {
    if (selectedConnection?.environment === "production") {
      onConnectionError(
        "Inline edit blocked",
        "Production writes require opening the document editor and confirming the save.",
      );
      return;
    }

    const editedDocument = buildInlineEditedDocument({
      document: document.ejson,
      path,
      rawValue,
      schemaField,
      value,
    });

    if (!editedDocument.ok) {
      onConnectionError("Save document failed", editedDocument.message);
      return;
    }

    const optimisticDocument = parseEjsonDocuments([editedDocument.value])[0];

    if (optimisticDocument) {
      setPendingInlineDocuments((currentDocuments) => {
        const nextDocuments = new Map(currentDocuments);
        nextDocuments.set(document.id, optimisticDocument);
        return nextDocuments;
      });
    }

    updateDocumentMutation.mutate({
      confirmedProductionWrite: false,
      documentId: document.id,
      editedDocument: editedDocument.value,
      originalDocument: document.ejson,
    });
  };

  useEffect(() => {
    onSchemaChange(isCollectionWorkspace ? schemaFields : []);
  }, [isCollectionWorkspace, onSchemaChange, schemaFields]);

  useEffect(() => {
    writeStoredQueries(savedQueriesStorageKey, savedQueries);
  }, [savedQueries]);

  useEffect(() => {
    writeStoredQueries(queryHistoryStorageKey, queryHistory);
  }, [queryHistory]);

  useEffect(() => {
    writeStoredBookmarks(savedBookmarksStorageKey, bookmarks);
  }, [bookmarks]);

  useEffect(() => {
    writeStoredTasks(savedTasksStorageKey, tasks);
  }, [tasks]);

  useEffect(() => {
    const runDueTasks = () => {
      const now = Date.now();
      const dueTasks = tasks.filter(
        (task) =>
          task.schedule !== "manual" &&
          task.nextRunAt !== undefined &&
          Date.parse(task.nextRunAt) <= now &&
          !runningTaskIdsRef.current.has(task.id),
      );

      for (const task of dueTasks) {
        void executeTask(task, "schedule");
      }
    };

    runDueTasks();
    const intervalId = window.setInterval(runDueTasks, 15_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [executeTask, tasks]);

  useEffect(() => {
    const handleAddBookmark = (event: Event) => {
      const detail = (event as CustomEvent<AddBookmarkEventDetail>).detail;

      if (!isAddBookmarkEventDetail(detail)) {
        onConnectionError(
          "Save bookmark failed",
          "The bookmark target is incomplete.",
        );
        return;
      }

      createBookmark(detail);
    };

    window.addEventListener(addBookmarkEventName, handleAddBookmark);

    return () => {
      window.removeEventListener(addBookmarkEventName, handleAddBookmark);
    };
  }, [createBookmark, onConnectionError]);

  useEffect(() => {
    const lastHistoryId = lastRecordedHistoryIdRef.current;

    if (!lastHistoryId || !documentsQuery.data) {
      return;
    }

    setQueryHistory((currentHistory) =>
      currentHistory.map((query) =>
        query.id === lastHistoryId
          ? {
              ...query,
              executionTimeMs: documentsQuery.data.executionTimeMs,
              resultCount: documentsQuery.data.documents.length,
              updatedAt: new Date().toISOString(),
            }
          : query,
      ),
    );
    lastRecordedHistoryIdRef.current = null;
  }, [documentsQuery.data]);

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
      {activeSection === "Queries" ? (
        <QueriesWorkspace
          currentTarget={currentQueryTarget}
          history={queryHistory}
          savedQueries={savedQueries}
          onDelete={deleteSavedQuery}
          onDuplicate={duplicateSavedQuery}
          onOpen={openSavedQuery}
          onNotesChange={updateSavedQueryNotes}
          onRename={renameSavedQuery}
          onSaveCurrent={saveCurrentQuery}
        />
      ) : null}

      {activeSection === "Bookmarks" ? (
        <BookmarksWorkspace
          bookmarks={bookmarks}
          onDelete={deleteBookmark}
          onMove={moveBookmark}
          onOpen={openBookmark}
          onUpdate={updateBookmark}
        />
      ) : null}

      {activeSection === "Tasks" ? (
        <TasksWorkspace
          history={queryHistory}
          savedQueries={savedQueries}
          tasks={tasks}
          onCancel={cancelTask}
          onClone={cloneTask}
          onCreateFromCurrent={createTaskFromCurrentQuery}
          onCreateFromQuery={createTaskFromQuery}
          onPerform={performTask}
          onPreview={previewTask}
          onRemove={removeTask}
          onRetry={retryTask}
          onSchedule={scheduleTask}
          onUnschedule={unscheduleTask}
        />
      ) : null}

      {activeSection === "Queries" ||
      activeSection === "Bookmarks" ||
      activeSection === "Tasks" ? null : (
        <>
      {isConnectionManager ? null : (
        <CollectionTabBar
          isCollectionWorkspace={isCollectionWorkspace}
          selectedCollectionName={selectedCollectionName}
          onCollectionClose={onCollectionClose}
        />
      )}

      {isConnectionManager ? null : isCollectionWorkspace ? (
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
          {isAggregationWorkspace ? (
            <AggregationPipelineWorkspace
              model={aggregationPipelineModel}
              result={aggregationRunResult}
              schemaFields={schemaFields}
              onModelChange={(nextModel) => {
                setAggregationPipelineModel(nextModel);
                setAggregationRunResult(null);
              }}
              onRunPipeline={() => {
                try {
                  const pipeline = buildRawPipelineFromAggregationModel(
                    aggregationPipelineModel,
                  );

                  if (!window.nexum) {
                    throw new Error("Preload API is unavailable");
                  }

                  if (!selectedConnectionId || !selectedCollectionPath) {
                    throw new Error("No collection selected");
                  }

                  if (pipeline.length === 0) {
                    setAggregationRunResult({
                      documents: [],
                      message:
                        "Pipeline is empty. Add an enabled complete stage to run.",
                      pipeline,
                      status: "error",
                    });
                    return;
                  }

                  setAggregationRunResult({
                    documents: [],
                    message:
                      "Running aggregation pipeline against the selected collection.",
                    pipeline,
                    status: "running",
                  });
                  void window.nexum.mongodb
                    .aggregate({
                      collection: selectedCollectionPath.collection,
                      connectionId: selectedConnectionId,
                      database: selectedCollectionPath.database,
                      limit: 50,
                      pipeline,
                    })
                    .then((result) => {
                      recordAggregationRun(pipeline, result);
                      setAggregationRunResult({
                        documents: result.documents,
                        executionTimeMs: result.executionTimeMs,
                        message: `${result.documents.length} document${result.documents.length === 1 ? "" : "s"} returned.`,
                        pipeline,
                        status: "ready",
                      });
                    })
                    .catch((error: unknown) => {
                      const message =
                        error instanceof Error
                          ? getSafeWorkspaceErrorMessage(error)
                          : "Aggregation failed.";
                      setAggregationRunResult({
                        documents: [],
                        message,
                        pipeline,
                        status: "error",
                      });
                      onConnectionError("Aggregation failed", message);
                    });
                } catch (error) {
                  setAggregationRunResult({
                    documents: [],
                    message:
                      error instanceof Error
                        ? error.message
                        : "Pipeline is invalid.",
                    pipeline: [],
                    status: "error",
                  });
                }
              }}
            />
          ) : null}
          {!isMetadataWorkspace && !isAggregationWorkspace ? (
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
                documents={displayedDocuments}
                error={documentsQuery.error}
                hasMore={documentsQuery.data?.hasMore ?? false}
                isFetching={documentsQuery.isFetching}
                isInitialLoading={documentsQuery.isLoading}
                isSavingDocument={updateDocumentMutation.isPending}
                onCellEdit={applyCellEdit}
                onCellFilter={applyCellFilter}
                onCellProjection={applyCellProjection}
                onDocumentBookmark={createDocumentBookmark}
                onDocumentOpen={setEditorDocument}
                onDocumentSelect={setSelectedDocument}
                onRefresh={() => void documentsQuery.refetch()}
                onTablePathChange={handleTablePathChange}
                schemaFields={schemaFields}
                selectedDocumentId={selectedDocument?.id ?? null}
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
                resultCount={displayedDocuments.length}
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
          {editorDocument ? (
            <DocumentEditorPanel
              key={`${selectedCollectionName ?? "collection"}:${editorDocument.id}:${editorDocument.ejson}`}
              document={editorDocument}
              isProduction={selectedConnection?.environment === "production"}
              isReadOnly={selectedConnection?.readOnly ?? true}
              isSaving={updateDocumentMutation.isPending}
              onClose={() => setEditorDocument(null)}
              onSave={(editedDocument, confirmedProductionWrite) =>
                updateDocumentMutation.mutate({
                  confirmedProductionWrite,
                  documentId: editorDocument.id,
                  editedDocument,
                  originalDocument: editorDocument.ejson,
                })
              }
            />
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
        </>
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

type QueriesWorkspaceProps = {
  currentTarget: {
    collection: string;
    connectionId: string;
    connectionName: string;
    database: string;
  } | null;
  history: SavedWorkspaceQuery[];
  savedQueries: SavedWorkspaceQuery[];
  onDelete: (queryId: string) => void;
  onDuplicate: (query: SavedWorkspaceQuery) => void;
  onOpen: (query: SavedWorkspaceQuery) => void;
  onNotesChange: (queryId: string, notes: string) => void;
  onRename: (queryId: string, name: string) => void;
  onSaveCurrent: () => void;
};

const QueriesWorkspace = ({
  currentTarget,
  history,
  savedQueries,
  onDelete,
  onDuplicate,
  onOpen,
  onNotesChange,
  onRename,
  onSaveCurrent,
}: QueriesWorkspaceProps) => {
  const [activeQueryList, setActiveQueryList] = useState<"history" | "saved">(
    "history",
  );
  const [editingQueryName, setEditingQueryName] = useState("");
  const [renamingQueryId, setRenamingQueryId] = useState<string | null>(null);
  const [selectedQueryId, setSelectedQueryId] = useState<string | null>(
    history[0]?.id ?? savedQueries[0]?.id ?? null,
  );
  const visibleQueries =
    activeQueryList === "saved" ? savedQueries : history;
  const visibleEmptyLabel =
    activeQueryList === "saved"
      ? "No saved queries yet."
      : "Run a query to build history.";
  const selectedQuery =
    visibleQueries.find((query) => query.id === selectedQueryId) ??
    visibleQueries[0] ??
    null;
  const isSelectedSavedQuery =
    selectedQuery !== null &&
    savedQueries.some((query) => query.id === selectedQuery.id);

  const startRenameSelectedQuery = () => {
    if (!selectedQuery || !isSelectedSavedQuery) {
      return;
    }

    setRenamingQueryId(selectedQuery.id);
    setEditingQueryName(selectedQuery.name);
  };

  const commitRename = () => {
    if (!renamingQueryId) {
      return;
    }

    onRename(renamingQueryId, editingQueryName);
    setRenamingQueryId(null);
    setEditingQueryName("");
  };

  const cancelRename = () => {
    setRenamingQueryId(null);
    setEditingQueryName("");
  };

  const showSavedQueries = () => {
    setActiveQueryList("saved");
    setSelectedQueryId(savedQueries[0]?.id ?? null);
    cancelRename();
  };

  const showQueryHistory = () => {
    setActiveQueryList("history");
    setSelectedQueryId(history[0]?.id ?? null);
    cancelRename();
  };

  return (
    <section className="queries-workspace">
      <header className="queries-header">
        <div>
          <h1>Queries</h1>
          <p>
            Saved queries and recent runs stay local on this device. No
            connection secrets are stored here.
          </p>
        </div>
        <button
          className="run-button compact"
          disabled={!currentTarget}
          onClick={onSaveCurrent}
          type="button"
        >
          Save current query
        </button>
      </header>

      <div className="queries-layout">
        <section className="queries-list-panel">
          <div className="query-list-tabs" role="tablist" aria-label="Queries">
            <button
              aria-selected={activeQueryList === "history"}
              className={activeQueryList === "history" ? "is-active" : ""}
              onClick={showQueryHistory}
              role="tab"
              type="button"
            >
              History
              <span>{history.length}</span>
            </button>
            <button
              aria-selected={activeQueryList === "saved"}
              className={activeQueryList === "saved" ? "is-active" : ""}
              onClick={showSavedQueries}
              role="tab"
              type="button"
            >
              Saved
              <span>{savedQueries.length}</span>
            </button>
          </div>
          <QueryList
            emptyLabel={visibleEmptyLabel}
            queries={visibleQueries}
            selectedQueryId={selectedQuery?.id ?? null}
            onSelect={setSelectedQueryId}
          />
        </section>

        <section className="query-detail-panel">
          {selectedQuery ? (
            <>
              <div className="query-detail-header">
                <div>
                  <span className="query-kind-badge">
                    {selectedQuery.kind === "aggregation" ? "Pipeline" : "Find"}
                  </span>
                  {renamingQueryId === selectedQuery.id ? (
                    <input
                      aria-label="Query name"
                      className="query-rename-input"
                      autoFocus
                      value={editingQueryName}
                      onChange={(event) =>
                        setEditingQueryName(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitRename();
                        }

                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelRename();
                        }
                      }}
                    />
                  ) : (
                    <h2>{selectedQuery.name}</h2>
                  )}
                  <p>
                    {selectedQuery.connectionName} · {selectedQuery.database}.
                    {selectedQuery.collection}
                  </p>
                </div>
                <div className="query-detail-actions">
                  <button type="button" onClick={() => onOpen(selectedQuery)}>
                    Open
                  </button>
                  {isSelectedSavedQuery ? (
                    <>
                      {renamingQueryId === selectedQuery.id ? (
                        <>
                          <button type="button" onClick={commitRename}>
                            Save name
                          </button>
                          <button type="button" onClick={cancelRename}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={startRenameSelectedQuery}>
                          Rename
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDuplicate(selectedQuery)}
                      >
                        Duplicate
                      </button>
                      <button
                        className="danger-text-button"
                        type="button"
                        onClick={() => onDelete(selectedQuery.id)}
                      >
                        Delete
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onDuplicate(selectedQuery)}
                    >
                      Save from history
                    </button>
                  )}
                </div>
              </div>

              {isSelectedSavedQuery ? (
                <label className="query-notes-field">
                  <span>Notes</span>
                  <textarea
                    placeholder="Optional notes for this saved query"
                    value={selectedQuery.notes}
                    onChange={(event) =>
                      onNotesChange(selectedQuery.id, event.target.value)
                    }
                  />
                </label>
              ) : null}

              <div className="query-detail-grid">
                <QueryCodeBlock
                  label="Filter"
                  value={selectedQuery.filter}
                />
                <QueryCodeBlock
                  label="Projection"
                  value={selectedQuery.projection}
                />
                <QueryCodeBlock label="Sort" value={selectedQuery.sort} />
                {selectedQuery.pipeline ? (
                  <QueryCodeBlock
                    label="Pipeline"
                    value={selectedQuery.pipeline}
                  />
                ) : null}
              </div>

              <footer className="query-detail-footer">
                <span>Limit {selectedQuery.limit}</span>
                <span>Skip {selectedQuery.skip}</span>
                {selectedQuery.lastRunAt ? (
                  <span>Last run {formatRelativeTime(selectedQuery.lastRunAt)}</span>
                ) : null}
                {selectedQuery.executionTimeMs !== undefined ? (
                  <span>{selectedQuery.executionTimeMs} ms</span>
                ) : null}
              </footer>
            </>
          ) : (
            <div className="queries-empty">
              <Icon name="term" />
              <strong>No queries yet</strong>
              <span>
                Open a collection, run a query, then save it here for reuse.
              </span>
            </div>
          )}
        </section>
      </div>
    </section>
  );
};

type QueryListProps = {
  emptyLabel: string;
  queries: SavedWorkspaceQuery[];
  selectedQueryId: string | null;
  onSelect: (queryId: string) => void;
};

const QueryList = ({
  emptyLabel,
  queries,
  selectedQueryId,
  onSelect,
}: QueryListProps) => (
  <div className="query-list-block">
    {queries.length > 0 ? (
      <div className="query-list">
        {queries.map((query) => (
          <button
            className={`query-list-item ${
              selectedQueryId === query.id ? "is-active" : ""
            }`}
            key={query.id}
            onClick={() => onSelect(query.id)}
            type="button"
          >
            <span className="query-list-item-main">
              <strong>{query.name}</strong>
              <small>
                {query.database}.{query.collection}
              </small>
            </span>
            <span className="query-kind-badge">
              {query.kind === "aggregation" ? "Pipeline" : "Find"}
            </span>
          </button>
        ))}
      </div>
    ) : (
      <p className="query-list-empty">{emptyLabel}</p>
    )}
  </div>
);

const QueryCodeBlock = ({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) => (
  <div className="query-code-block">
    <span>{label}</span>
    <pre>{JSON.stringify(value, null, 2)}</pre>
  </div>
);

type TasksWorkspaceProps = {
  history: SavedWorkspaceQuery[];
  savedQueries: SavedWorkspaceQuery[];
  tasks: SavedWorkspaceTask[];
  onCancel: (task: SavedWorkspaceTask) => void;
  onClone: (task: SavedWorkspaceTask) => void;
  onCreateFromCurrent: (type?: SavedWorkspaceTask["type"]) => void;
  onCreateFromQuery: (
    query: SavedWorkspaceQuery,
    type?: SavedWorkspaceTask["type"],
  ) => void;
  onPerform: (task: SavedWorkspaceTask) => void;
  onPreview: (task: SavedWorkspaceTask) => void;
  onRemove: (taskId: string) => void;
  onRetry: (task: SavedWorkspaceTask) => void;
  onSchedule: (
    taskId: string,
    schedule: Exclude<SavedWorkspaceTask["schedule"], "manual">,
    scheduleTime?: string,
  ) => void;
  onUnschedule: (taskId: string) => void;
};

const TasksWorkspace = ({
  history,
  savedQueries,
  tasks,
  onCancel,
  onClone,
  onCreateFromCurrent,
  onCreateFromQuery,
  onPerform,
  onPreview,
  onRemove,
  onRetry,
  onSchedule,
  onUnschedule,
}: TasksWorkspaceProps) => {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    tasks[0]?.id ?? null,
  );
  const [isNewTaskMenuOpen, setIsNewTaskMenuOpen] = useState(false);
  const [customScheduleMinutes, setCustomScheduleMinutes] = useState("5");
  const [dailyScheduleTime, setDailyScheduleTime] = useState("09:00");
  const [scheduleCountdownNow, setScheduleCountdownNow] = useState(() =>
    Date.now(),
  );
  const [scheduleModalTaskId, setScheduleModalTaskId] = useState<string | null>(
    null,
  );
  const [selectedRun, setSelectedRun] = useState<{
    run: SavedWorkspaceTask["runs"][number];
    task: SavedWorkspaceTask;
  } | null>(null);
  const [taskContextMenu, setTaskContextMenu] = useState<{
    taskId: string;
    x: number;
    y: number;
  } | null>(null);
  const newTaskMenuRef = useRef<HTMLDivElement | null>(null);
  const taskContextMenuRef = useRef<HTMLDivElement | null>(null);
  const querySources = [...savedQueries, ...history].slice(0, 10);
  const selectedTask =
    tasks.find((task) => task.id === selectedTaskId) ?? tasks[0] ?? null;
  const contextTask = taskContextMenu
    ? (tasks.find((task) => task.id === taskContextMenu.taskId) ?? null)
    : null;
  const scheduleModalTask = scheduleModalTaskId
    ? (tasks.find((task) => task.id === scheduleModalTaskId) ?? null)
    : null;
  const hasScheduledFutureTask = tasks.some((task) => {
    if (!task.nextRunAt) {
      return false;
    }

    const nextRunAt = Date.parse(task.nextRunAt);

    return Number.isFinite(nextRunAt) && nextRunAt > scheduleCountdownNow;
  });
  const openScheduleModal = (task: SavedWorkspaceTask) => {
    if (task.schedule === "custom-minutes" && task.scheduleTime) {
      setCustomScheduleMinutes(task.scheduleTime);
    }

    if (task.schedule === "daily-at" && task.scheduleTime) {
      setDailyScheduleTime(task.scheduleTime);
    }

    setScheduleModalTaskId(task.id);
  };

  useEffect(() => {
    if (!hasScheduledFutureTask) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setScheduleCountdownNow(Date.now());
    }, 1_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hasScheduledFutureTask]);

  useEffect(() => {
    if (!isNewTaskMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (
        target instanceof Node &&
        newTaskMenuRef.current?.contains(target)
      ) {
        return;
      }

      setIsNewTaskMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsNewTaskMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNewTaskMenuOpen]);

  useEffect(() => {
    if (!selectedRun && !scheduleModalTaskId) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      setSelectedRun(null);
      setScheduleModalTaskId(null);
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [scheduleModalTaskId, selectedRun]);

  useEffect(() => {
    if (!taskContextMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (
        target instanceof Node &&
        taskContextMenuRef.current?.contains(target)
      ) {
        return;
      }

      setTaskContextMenu(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTaskContextMenu(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [taskContextMenu]);

  return (
    <section className="tasks-workspace">
      <header className="tasks-header">
        <div>
          <h1>Tasks</h1>
          <p>
            Run saved queries, pipelines, and operational jobs from one local
            queue.
          </p>
        </div>
      </header>
      <div className="tasks-toolbar">
        <button
          disabled={!selectedTask || selectedTask.status === "running"}
          onClick={() => selectedTask && onPerform(selectedTask)}
          type="button"
        >
          <Icon name="term" />
          Perform
        </button>
        <button
          disabled={!selectedTask || selectedTask.status === "running"}
          onClick={() => selectedTask && onRetry(selectedTask)}
          type="button"
        >
          Retry
        </button>
        <button
          disabled={!selectedTask || selectedTask.status !== "running"}
          onClick={() => selectedTask && onCancel(selectedTask)}
          type="button"
        >
          Cancel
        </button>
        <button
          disabled={!selectedTask}
          onClick={() => selectedTask && onPreview(selectedTask)}
          type="button"
        >
          <Icon name="table" />
          Preview
        </button>
        <div className="task-new-menu" ref={newTaskMenuRef}>
          <button
            className="is-primary"
            onClick={() => setIsNewTaskMenuOpen((isOpen) => !isOpen)}
            type="button"
          >
            <span>+</span>
            New Task
          </button>
          {isNewTaskMenuOpen ? (
            <div className="task-new-menu-popover">
              <button
                type="button"
                onClick={() => {
                  onCreateFromCurrent();
                  setIsNewTaskMenuOpen(false);
                }}
              >
                Current document query
              </button>
              <button
                type="button"
                onClick={() => {
                  onCreateFromCurrent("export");
                  setIsNewTaskMenuOpen(false);
                }}
              >
                Export current result
              </button>
              <button
                type="button"
                onClick={() => {
                  onCreateFromCurrent("schema-inference");
                  setIsNewTaskMenuOpen(false);
                }}
              >
                Analyze current schema
              </button>
              <button
                type="button"
                onClick={() => {
                  onCreateFromCurrent("audit-cleanup");
                  setIsNewTaskMenuOpen(false);
                }}
              >
                Clean local task history
              </button>
              <div className="task-new-menu-divider" />
              {querySources.length > 0 ? (
                querySources.map((query) => (
                  <div className="task-new-query-group" key={query.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onCreateFromQuery(query);
                        setIsNewTaskMenuOpen(false);
                      }}
                    >
                      <span>{query.name}</span>
                      <small>
                        {query.kind === "aggregation" ? "Pipeline" : "Find"} ·{" "}
                        {query.database}.{query.collection}
                      </small>
                    </button>
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          onCreateFromQuery(query, "export");
                          setIsNewTaskMenuOpen(false);
                        }}
                      >
                        Export
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onCreateFromQuery(query, "schema-inference");
                          setIsNewTaskMenuOpen(false);
                        }}
                      >
                        Schema
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p>No saved queries or history yet.</p>
              )}
            </div>
          ) : null}
        </div>
        <button
          disabled={!selectedTask}
          onClick={() => selectedTask && onClone(selectedTask)}
          type="button"
        >
          Clone
        </button>
        <button
          className="danger-text-button"
          disabled={!selectedTask}
          onClick={() => selectedTask && onRemove(selectedTask.id)}
          type="button"
        >
          Remove
        </button>
        <button
          disabled={!selectedTask}
          onClick={() => selectedTask && openScheduleModal(selectedTask)}
          type="button"
        >
          Schedule
        </button>
        <button
          disabled={!selectedTask || selectedTask.schedule === "manual"}
          onClick={() => selectedTask && onUnschedule(selectedTask.id)}
          type="button"
        >
          Unschedule
        </button>
      </div>

      <div className="tasks-layout">
        <section className="tasks-table-panel">
          {tasks.length > 0 ? (
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Task Name</th>
                  <th>Type</th>
                  <th>Target</th>
                  <th>Status</th>
                  <th>Schedule</th>
                  <th>Last Modified</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr
                    className={selectedTaskId === task.id ? "is-active" : ""}
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setSelectedTaskId(task.id);
                      setTaskContextMenu({
                        taskId: task.id,
                        x: event.clientX,
                        y: event.clientY,
                      });
                    }}
                  >
                    <td>{task.name}</td>
                    <td>{formatTaskType(task)}</td>
                    <td>{task.target}</td>
                    <td>
                      <span className={`task-status is-${task.status}`}>
                        {formatTaskStatus(task.status)}
                      </span>
                    </td>
                    <td>
                      {formatTaskSchedule(task.schedule, task.scheduleTime)}
                      {task.nextRunAt ? (
                        <small className="task-next-run">
                          Next{" "}
                          {formatTaskNextRun(task.nextRunAt, scheduleCountdownNow)}
                        </small>
                      ) : null}
                    </td>
                    <td>{formatAbsoluteTime(task.lastModifiedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="tasks-empty">
              <Icon name="check" />
              <strong>No tasks yet</strong>
              <span>
                Create a task from the current query, a saved query, or recent
                history.
              </span>
            </div>
          )}
        </section>

        <aside className="task-detail-panel">
          {selectedTask ? (
            <>
              <div>
                <span className={`task-status is-${selectedTask.status}`}>
                  {formatTaskStatus(selectedTask.status)}
                </span>
                <h2>{selectedTask.name}</h2>
                <p>
                  {selectedTask.sourceQuery.connectionName} ·{" "}
                  {selectedTask.target}
                </p>
              </div>
              <dl>
                <div>
                  <dt>Type</dt>
                  <dd>{formatTaskType(selectedTask)}</dd>
                </div>
                <div>
                  <dt>Schedule</dt>
                  <dd>
                    {formatTaskSchedule(
                      selectedTask.schedule,
                      selectedTask.scheduleTime,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Next run</dt>
                  <dd>
                    {selectedTask.nextRunAt
                      ? formatTaskNextRun(
                          selectedTask.nextRunAt,
                          scheduleCountdownNow,
                        )
                      : "Not scheduled"}
                  </dd>
                </div>
                <div>
                  <dt>Last run</dt>
                  <dd>
                    {selectedTask.lastRunAt
                      ? formatAbsoluteTime(selectedTask.lastRunAt)
                      : "Never"}
                  </dd>
                </div>
              </dl>
              <QueryCodeBlock
                label={
                  selectedTask.type === "audit-cleanup"
                    ? "Cleanup"
                    : selectedTask.sourceQuery.kind === "aggregation"
                    ? "Pipeline"
                    : "Filter"
                }
                value={
                  selectedTask.type === "audit-cleanup"
                    ? { retention: "30 days", scope: "local task run history" }
                    :
                  selectedTask.sourceQuery.pipeline ??
                  selectedTask.sourceQuery.filter
                }
              />
              {selectedTask.result ? (
                <p className="task-result">{selectedTask.result}</p>
              ) : null}
              <section className="task-runs-panel">
                <div className="task-runs-header">
                  <strong>Runs</strong>
                  <span>{selectedTask.runs.length}</span>
                </div>
                {selectedTask.runs.length > 0 ? (
                  <div className="task-runs-list">
                    {selectedTask.runs.map((run) => (
                      <button
                        className="task-run-item"
                        key={run.id}
                        onClick={() => setSelectedRun({ run, task: selectedTask })}
                        type="button"
                      >
                        <span className={`task-status is-${run.status}`}>
                          {run.status === "success" ? "Succeeded" : "Failed"}
                        </span>
                        <strong>{run.message}</strong>
                        <small>
                          {formatAbsoluteTime(run.finishedAt)} · {run.trigger}
                          {run.executionTimeMs !== undefined
                            ? ` · ${run.executionTimeMs} ms`
                            : ""}
                        </small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="task-runs-empty">
                    Scheduled and manual executions will appear here.
                  </p>
                )}
              </section>
            </>
          ) : (
            <div className="tasks-empty">
              <Icon name="check" />
              <strong>Select a task</strong>
              <span>Task details and last result will appear here.</span>
            </div>
          )}
        </aside>
      </div>
      {taskContextMenu && contextTask ? (
        <TaskContextMenu
          menuRef={taskContextMenuRef}
          task={contextTask}
          x={taskContextMenu.x}
          y={taskContextMenu.y}
          onClone={() => {
            onClone(contextTask);
            setTaskContextMenu(null);
          }}
          onCancel={() => {
            onCancel(contextTask);
            setTaskContextMenu(null);
          }}
          onPerform={() => {
            onPerform(contextTask);
            setTaskContextMenu(null);
          }}
          onPreview={() => {
            onPreview(contextTask);
            setTaskContextMenu(null);
          }}
          onRemove={() => {
            onRemove(contextTask.id);
            setTaskContextMenu(null);
          }}
          onRetry={() => {
            onRetry(contextTask);
            setTaskContextMenu(null);
          }}
          onSchedule={() => {
            openScheduleModal(contextTask);
            setTaskContextMenu(null);
          }}
          onUnschedule={() => {
            onUnschedule(contextTask.id);
            setTaskContextMenu(null);
          }}
        />
      ) : null}
      {selectedRun ? (
        <TaskRunResultModal
          run={selectedRun.run}
          task={selectedRun.task}
          onClose={() => setSelectedRun(null)}
        />
      ) : null}
      {scheduleModalTask ? (
        <TaskScheduleModal
          customScheduleMinutes={customScheduleMinutes}
          dailyScheduleTime={dailyScheduleTime}
          now={scheduleCountdownNow}
          task={scheduleModalTask}
          onClose={() => setScheduleModalTaskId(null)}
          onCustomScheduleMinutesChange={setCustomScheduleMinutes}
          onDailyScheduleTimeChange={setDailyScheduleTime}
          onSchedule={(schedule, scheduleTime) => {
            onSchedule(scheduleModalTask.id, schedule, scheduleTime);
            setScheduleModalTaskId(null);
          }}
        />
      ) : null}
    </section>
  );
};

type TaskRunResultModalProps = {
  run: SavedWorkspaceTask["runs"][number];
  task: SavedWorkspaceTask;
  onClose: () => void;
};

const TaskRunResultModal = ({
  run,
  task,
  onClose,
}: TaskRunResultModalProps) => (
  <div
    aria-modal="true"
    className="task-run-modal-overlay"
    role="dialog"
    onClick={onClose}
  >
    <div className="task-run-modal" onClick={(event) => event.stopPropagation()}>
      <header>
        <div>
          <span className={`task-status is-${run.status}`}>
            {run.status === "success" ? "Succeeded" : "Failed"}
          </span>
          <h2>Run result</h2>
          <p>{task.name}</p>
        </div>
        <button aria-label="Close run result" onClick={onClose} type="button">
          ×
        </button>
      </header>
      <div className="task-run-modal-summary">
        <div>
          <span>Target</span>
          <strong>{task.target}</strong>
        </div>
        <div>
          <span>Trigger</span>
          <strong>{run.trigger}</strong>
        </div>
        <div>
          <span>Started</span>
          <strong>{formatAbsoluteTime(run.startedAt)}</strong>
        </div>
        <div>
          <span>Finished</span>
          <strong>{formatAbsoluteTime(run.finishedAt)}</strong>
        </div>
        {run.executionTimeMs !== undefined ? (
          <div>
            <span>Duration</span>
            <strong>{run.executionTimeMs} ms</strong>
          </div>
        ) : null}
        {run.resultCount !== undefined ? (
          <div>
            <span>Result</span>
            <strong>
              {run.resultCount} document{run.resultCount === 1 ? "" : "s"}
            </strong>
          </div>
        ) : null}
      </div>
      <section className="task-run-modal-message">
        <span>Message</span>
        <p>{run.message}</p>
      </section>
      {run.error ? (
        <section className="task-run-modal-message is-error">
          <span>Error</span>
          <p>{run.error}</p>
        </section>
      ) : null}
    </div>
  </div>
);

type TaskScheduleModalProps = {
  customScheduleMinutes: string;
  dailyScheduleTime: string;
  now: number;
  task: SavedWorkspaceTask;
  onClose: () => void;
  onCustomScheduleMinutesChange: (value: string) => void;
  onDailyScheduleTimeChange: (value: string) => void;
  onSchedule: (
    schedule: Exclude<SavedWorkspaceTask["schedule"], "manual">,
    scheduleTime?: string,
  ) => void;
};

const TaskScheduleModal = ({
  customScheduleMinutes,
  dailyScheduleTime,
  now,
  task,
  onClose,
  onCustomScheduleMinutesChange,
  onDailyScheduleTimeChange,
  onSchedule,
}: TaskScheduleModalProps) => {
  const customMinutes = parseTaskScheduleMinutes(customScheduleMinutes);
  const isCustomMinutesValid = customMinutes !== null;
  const customScheduleLabel = isCustomMinutesValid
    ? formatTaskSchedule("custom-minutes", customScheduleMinutes)
    : "Every N minutes";

  return (
    <div
      aria-modal="true"
      className="task-run-modal-overlay"
      role="dialog"
      onClick={onClose}
    >
      <div
        className="task-run-modal task-schedule-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="task-status is-idle">Schedule</span>
            <h2>Schedule task</h2>
            <p>{task.name}</p>
          </div>
          <button aria-label="Close schedule" onClick={onClose} type="button">
            ×
          </button>
        </header>
        <div className="task-schedule-options">
          {(["minute", "hourly", "daily", "weekly"] as const).map((schedule) => (
            <button
              className={task.schedule === schedule ? "is-active" : ""}
              key={schedule}
              onClick={() => onSchedule(schedule)}
              type="button"
            >
              <span>{formatTaskSchedule(schedule)}</span>
              <small>Next {formatTaskNextRun(getNextTaskRunAt(schedule), now)}</small>
            </button>
          ))}
        </div>
        <div className="task-schedule-daily-at">
          <label>
            <span>Every few minutes</span>
            <input
              min="1"
              step="1"
              type="number"
              value={customScheduleMinutes}
              onChange={(event) =>
                onCustomScheduleMinutesChange(event.target.value)
              }
            />
          </label>
          <button
            className={task.schedule === "custom-minutes" ? "is-active" : ""}
            disabled={!isCustomMinutesValid}
            onClick={() => onSchedule("custom-minutes", customScheduleMinutes)}
            type="button"
          >
            <span>{customScheduleLabel}</span>
            <small>
              {isCustomMinutesValid
                ? `Next ${formatTaskNextRun(
                    getNextTaskRunAt("custom-minutes", customScheduleMinutes),
                    now,
                  )}`
                : "Enter at least 1 minute"}
            </small>
          </button>
        </div>
        <div className="task-schedule-daily-at">
          <label>
            <span>Every day at</span>
            <input
              type="time"
              value={dailyScheduleTime}
              onChange={(event) => onDailyScheduleTimeChange(event.target.value)}
            />
          </label>
          <button
            className={task.schedule === "daily-at" ? "is-active" : ""}
            onClick={() => onSchedule("daily-at", dailyScheduleTime)}
            type="button"
          >
            <span>{formatTaskSchedule("daily-at", dailyScheduleTime)}</span>
            <small>
              Next{" "}
              {formatTaskNextRun(
                getNextTaskRunAt("daily-at", dailyScheduleTime),
                now,
              )}
            </small>
          </button>
        </div>
      </div>
    </div>
  );
};

type TaskContextMenuProps = {
  menuRef: RefObject<HTMLDivElement | null>;
  task: SavedWorkspaceTask;
  x: number;
  y: number;
  onCancel: () => void;
  onClone: () => void;
  onPerform: () => void;
  onPreview: () => void;
  onRemove: () => void;
  onRetry: () => void;
  onSchedule: () => void;
  onUnschedule: () => void;
};

const TaskContextMenu = ({
  menuRef,
  task,
  x,
  y,
  onCancel,
  onClone,
  onPerform,
  onPreview,
  onRemove,
  onRetry,
  onSchedule,
  onUnschedule,
}: TaskContextMenuProps) => {
  const left = Math.min(x, Math.max(12, window.innerWidth - 260));
  const top = Math.min(y, Math.max(12, window.innerHeight - 360));

  return (
    <div
      className="task-context-menu"
      ref={menuRef}
      style={{ left, top }}
      role="menu"
    >
    <button
      type="button"
      role="menuitem"
      disabled={task.status === "running"}
      onClick={onPerform}
    >
      Perform
    </button>
    <button
      type="button"
      role="menuitem"
      disabled={task.status === "running"}
      onClick={onRetry}
    >
      Retry
    </button>
    <button
      type="button"
      role="menuitem"
      disabled={task.status !== "running"}
      onClick={onCancel}
    >
      Cancel
    </button>
    <button type="button" role="menuitem" onClick={onPreview}>
      Preview
    </button>
    <button type="button" role="menuitem" onClick={onSchedule}>
      Schedule
    </button>
    <button
      type="button"
      role="menuitem"
      disabled={task.schedule === "manual"}
      onClick={onUnschedule}
    >
      Unschedule
    </button>
    <div className="task-context-menu-divider" />
    <button type="button" role="menuitem" onClick={onClone}>
      Clone
    </button>
    <button
      className="danger-text-button"
      type="button"
      role="menuitem"
      onClick={onRemove}
    >
      Remove
    </button>
    </div>
  );
};

type BookmarksWorkspaceProps = {
  bookmarks: SavedWorkspaceBookmark[];
  onDelete: (bookmarkId: string) => void;
  onMove: (bookmarkId: string, direction: -1 | 1) => void;
  onOpen: (bookmark: SavedWorkspaceBookmark) => void;
  onUpdate: (
    bookmarkId: string,
    updates: Pick<SavedWorkspaceBookmark, "notes" | "tags">,
  ) => void;
};

const BookmarksWorkspace = ({
  bookmarks,
  onDelete,
  onMove,
  onOpen,
  onUpdate,
}: BookmarksWorkspaceProps) => {
  const [filterMode, setFilterMode] = useState<"tags" | "type">("type");
  const [kindFilter, setKindFilter] = useState<
    "all" | SavedWorkspaceBookmark["kind"]
  >("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selectedBookmarkId, setSelectedBookmarkId] = useState<string | null>(
    bookmarks[0]?.id ?? null,
  );
  const availableTags = useMemo(() => getBookmarkTags(bookmarks), [bookmarks]);
  const taggedBookmarksCount = useMemo(
    () => bookmarks.filter((bookmark) => bookmark.tags.length > 0).length,
    [bookmarks],
  );
  const visibleBookmarks = useMemo(
    () => {
      if (filterMode === "tags") {
        return tagFilter
          ? bookmarks.filter((bookmark) => bookmark.tags.includes(tagFilter))
          : bookmarks.filter((bookmark) => bookmark.tags.length > 0);
      }

      return kindFilter === "all"
        ? bookmarks
        : bookmarks.filter((bookmark) => bookmark.kind === kindFilter);
    },
    [bookmarks, filterMode, kindFilter, tagFilter],
  );
  const selectedBookmark =
    visibleBookmarks.find((bookmark) => bookmark.id === selectedBookmarkId) ??
    visibleBookmarks[0] ??
    null;
  const groupedBookmarks = groupBookmarks(visibleBookmarks);
  const filterOptions: Array<{
    count: number;
    kind: "all" | SavedWorkspaceBookmark["kind"];
    label: string;
  }> = [
    { count: bookmarks.length, kind: "all", label: "All" },
    {
      count: bookmarks.filter((bookmark) => bookmark.kind === "database").length,
      kind: "database",
      label: "Databases",
    },
    {
      count: bookmarks.filter((bookmark) => bookmark.kind === "collection")
        .length,
      kind: "collection",
      label: "Collections",
    },
    {
      count: bookmarks.filter((bookmark) => bookmark.kind === "document").length,
      kind: "document",
      label: "Documents",
    },
  ];

  return (
    <section className="bookmarks-workspace">
      <header className="bookmarks-header">
        <div>
          <h1>Bookmarks</h1>
          <p>
            Save databases, collections, and documents from their context menus.
          </p>
        </div>
      </header>

      <div className="bookmarks-layout">
        <section className="bookmark-create-panel">
          <div
            className="bookmark-filter-tabs"
            role="tablist"
            aria-label="Bookmark filters"
          >
            <button
              aria-selected={filterMode === "type"}
              className={filterMode === "type" ? "is-active" : ""}
              role="tab"
              type="button"
              onClick={() => {
                setFilterMode("type");
                setSelectedBookmarkId(null);
              }}
            >
              Type
            </button>
            <button
              aria-selected={filterMode === "tags"}
              className={filterMode === "tags" ? "is-active" : ""}
              role="tab"
              type="button"
              onClick={() => {
                setFilterMode("tags");
                setSelectedBookmarkId(null);
              }}
            >
              Tags
            </button>
          </div>

          {filterMode === "type" ? (
            <div className="bookmark-type-filter" role="list">
              {filterOptions.map((option) => (
                <button
                  className={kindFilter === option.kind ? "is-active" : ""}
                  key={option.kind}
                  type="button"
                  onClick={() => {
                    setKindFilter(option.kind);
                    setSelectedBookmarkId(null);
                  }}
                >
                  <span>{option.label}</span>
                  <strong>{option.count}</strong>
                </button>
              ))}
            </div>
          ) : (
            <div className="bookmark-type-filter" role="list">
              {availableTags.length > 0 ? (
                <>
                  <button
                    className={!tagFilter ? "is-active" : ""}
                    type="button"
                    onClick={() => {
                      setTagFilter(null);
                      setSelectedBookmarkId(null);
                    }}
                  >
                    <span>All tagged</span>
                    <strong>{taggedBookmarksCount}</strong>
                  </button>
                  {availableTags.map((tag) => (
                    <button
                      className={tagFilter === tag ? "is-active" : ""}
                      key={tag}
                      type="button"
                      onClick={() => {
                        setTagFilter(tag);
                        setSelectedBookmarkId(null);
                      }}
                    >
                      <span>{tag}</span>
                      <strong>
                        {
                          bookmarks.filter((bookmark) =>
                            bookmark.tags.includes(tag),
                          ).length
                        }
                      </strong>
                    </button>
                  ))}
                </>
              ) : (
                <p className="bookmark-filter-empty">
                  Add tags to bookmarks to filter by them here.
                </p>
              )}
            </div>
          )}
        </section>

        <section className="bookmark-list-panel">
          {groupedBookmarks.length > 0 ? (
            groupedBookmarks.map((group) => (
              <div className="bookmark-group" key={group.key}>
                <div className="bookmark-group-title">
                  <strong>{group.connectionName}</strong>
                  <span>{group.databaseName}</span>
                </div>
                <div className="bookmark-list">
                  {group.bookmarks.map((bookmark) => (
                    <button
                      className={`bookmark-list-item ${
                        selectedBookmark?.id === bookmark.id ? "is-active" : ""
                      }`}
                      key={bookmark.id}
                      type="button"
                      onClick={() => setSelectedBookmarkId(bookmark.id)}
                    >
                      <span className="query-kind-badge">
                        {formatBookmarkKind(bookmark.kind)}
                      </span>
                      <span>
                        <strong>{bookmark.name}</strong>
                        <small>{formatBookmarkTarget(bookmark)}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="queries-empty">
              <Icon name="mark" />
              <strong>No bookmarks yet</strong>
              <span>Right-click a database, collection, or document to save it.</span>
            </div>
          )}
        </section>

        <section className="bookmark-detail-panel">
          {selectedBookmark ? (
            <BookmarkDetail
              key={selectedBookmark.id}
              bookmark={selectedBookmark}
              onDelete={onDelete}
              onMove={onMove}
              onOpen={onOpen}
              onUpdate={onUpdate}
              tagOptions={availableTags}
            />
          ) : (
            <div className="queries-empty">
              <Icon name="mark" />
              <strong>Select a bookmark</strong>
              <span>Details, notes, and tags appear here.</span>
            </div>
          )}
        </section>
      </div>
    </section>
  );
};

type BookmarkDetailProps = {
  bookmark: SavedWorkspaceBookmark;
  onDelete: (bookmarkId: string) => void;
  onMove: (bookmarkId: string, direction: -1 | 1) => void;
  onOpen: (bookmark: SavedWorkspaceBookmark) => void;
  tagOptions: string[];
  onUpdate: (
    bookmarkId: string,
    updates: Pick<SavedWorkspaceBookmark, "notes" | "tags">,
  ) => void;
};

const BookmarkDetail = ({
  bookmark,
  onDelete,
  onMove,
  onOpen,
  tagOptions,
  onUpdate,
}: BookmarkDetailProps) => {
  const [notes, setNotes] = useState(bookmark.notes);
  const [saveState, setSaveState] = useState<"idle" | "saved">("idle");
  const [tagDraft, setTagDraft] = useState("");
  const [tags, setTags] = useState<string[]>(bookmark.tags);
  const unusedTagOptions = tagOptions.filter((tag) => !tags.includes(tag));
  const isDirty =
    notes !== bookmark.notes || tags.join("\u0000") !== bookmark.tags.join("\u0000");

  const saveMetadata = () => {
    onUpdate(bookmark.id, {
      notes,
      tags,
    });
    setSaveState("saved");
  };

  const updateNotes = (value: string) => {
    setNotes(value);
    setSaveState("idle");
  };

  const addTag = (value: string) => {
    const nextTag = value.trim();

    if (!nextTag || tags.includes(nextTag)) {
      setTagDraft("");
      return;
    }

    setTags((currentTags) => [...currentTags, nextTag]);
    setTagDraft("");
    setSaveState("idle");
  };

  const removeTag = (tag: string) => {
    setTags((currentTags) =>
      currentTags.filter((currentTag) => currentTag !== tag),
    );
    setSaveState("idle");
  };

  return (
    <>
      <div className="bookmark-detail-header">
        <div>
          <span className="query-kind-badge">
            {formatBookmarkKind(bookmark.kind)}
          </span>
          <h2>{bookmark.name}</h2>
          <p>{formatBookmarkTarget(bookmark)}</p>
        </div>
        <div className="query-detail-actions">
          <button type="button" onClick={() => onOpen(bookmark)}>
            Open
          </button>
          <button type="button" onClick={() => onMove(bookmark.id, -1)}>
            Up
          </button>
          <button type="button" onClick={() => onMove(bookmark.id, 1)}>
            Down
          </button>
          <button
            className="danger-text-button"
            type="button"
            onClick={() => onDelete(bookmark.id)}
          >
            Remove
          </button>
        </div>
      </div>
      <div className="bookmark-detail-body">
        <label>
          <span>Notes</span>
          <textarea
            value={notes}
            onChange={(event) => updateNotes(event.target.value)}
          />
        </label>
        <label>
          <span>Tags</span>
          <div className="bookmark-tags-editor">
            <div className="bookmark-tag-chips">
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove ${tag} tag`}
                >
                  <span>{tag}</span>
                  <span aria-hidden="true">×</span>
                </button>
              ))}
              <input
                placeholder={tags.length > 0 ? "Add tag" : "prod, important"}
                value={tagDraft}
                onBlur={() => {
                  if (tagDraft.trim()) {
                    addTag(tagDraft);
                  }
                }}
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault();
                    addTag(tagDraft);
                  }

                  if (
                    event.key === "Backspace" &&
                    !tagDraft &&
                    tags.length > 0
                  ) {
                    removeTag(tags[tags.length - 1] ?? "");
                  }
                }}
              />
            </div>
            {unusedTagOptions.length > 0 ? (
              <div className="bookmark-tag-options" aria-label="Existing tags">
                {unusedTagOptions.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      addTag(tag);
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </label>
        <div className="bookmark-metadata-actions">
          <button
            className="run-button compact"
            type="button"
            disabled={!isDirty && saveState === "saved"}
            onClick={saveMetadata}
          >
            {saveState === "saved" && !isDirty ? "Saved" : "Save metadata"}
          </button>
          {saveState === "saved" && !isDirty ? (
            <span>Saved locally</span>
          ) : null}
        </div>
      </div>
    </>
  );
};

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
      type: suggestion.type,
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
          : getQueryFieldSuggestionValueSuffix(
              afterSuggestion,
              mode,
              suggestion.type,
            );
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

type AggregationPipelineWorkspaceProps = {
  model: AggregationPipelineModel;
  result: AggregationRunResult | null;
  schemaFields: SchemaFieldSummary[];
  onModelChange: (model: AggregationPipelineModel) => void;
  onRunPipeline: () => void;
};

const AggregationPipelineWorkspace = ({
  model,
  result,
  schemaFields,
  onModelChange,
  onRunPipeline,
}: AggregationPipelineWorkspaceProps) => {
  const [activeStageId, setActiveStageId] = useState<string | null>(
    model.stages[0]?.id ?? null,
  );
  const [resultTablePath, setResultTablePath] = useState<string[]>([]);
  const [resultViewMode, setResultViewMode] =
    useState<DocumentViewMode>("table");
  const [selectedResultDocument, setSelectedResultDocument] =
    useState<ParsedDocument | null>(null);
  const [newStageType, setNewStageType] =
    useState<AggregationPipelineStageType>("match");
  const activeStage =
    model.stages.find((stage) => stage.id === activeStageId) ??
    model.stages[0] ??
    null;
  const rawPipeline = useMemo(() => {
    try {
      return {
        ok: true as const,
        value: buildRawPipelineFromAggregationModel(model),
      };
    } catch (error) {
      return {
        message: error instanceof Error ? error.message : "Pipeline is invalid.",
        ok: false as const,
      };
    }
  }, [model]);
  const rawPipelineText = useMemo(
    () =>
      rawPipeline.ok
        ? JSON.stringify(rawPipeline.value, null, 2)
        : rawPipeline.message,
    [rawPipeline],
  );
  const resultDocuments = useMemo(
    () => parseEjsonDocuments(result?.documents ?? []),
    [result?.documents],
  );
  const resultTableDocuments = useMemo(
    () => projectDocumentsForTable(resultDocuments, resultTablePath),
    [resultDocuments, resultTablePath],
  );
  const handleResultObjectOpen = useCallback(
    (field: string) => setResultTablePath((path) => [...path, field]),
    [],
  );
  const updateStage = (
    stageId: string,
    patch: Parameters<typeof updateAggregationPipelineStage>[2],
  ) => onModelChange(updateAggregationPipelineStage(model, stageId, patch));

  return (
    <section className="aggregation-workspace">
      <div className="aggregation-generator">
        <div className="aggregation-stage-list">
          <div className="aggregation-toolbar">
            <select
              aria-label="Stage type"
              value={newStageType}
              onChange={(event) =>
                setNewStageType(
                  event.target.value as AggregationPipelineStageType,
                )
              }
            >
              {aggregationStageOptions.map((stageType) => (
                <option key={stageType} value={stageType}>
                  {formatAggregationStageType(stageType)}
                </option>
              ))}
            </select>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                const stage = createAggregationPipelineStage(newStageType);
                onModelChange(addAggregationPipelineStage(model, stage));
                setActiveStageId(stage.id);
              }}
            >
              Add stage
            </button>
          </div>

          <div className="aggregation-stages" aria-label="Pipeline stages">
            {model.stages.length === 0 ? (
              <div className="aggregation-empty">No stages yet.</div>
            ) : (
              model.stages.map((stage, index) => (
                <button
                  aria-pressed={activeStage?.id === stage.id}
                  className={`aggregation-stage-card ${
                    activeStage?.id === stage.id ? "is-active" : ""
                  } ${stage.enabled ? "" : "is-disabled"}`}
                  key={stage.id}
                  type="button"
                  onClick={() => setActiveStageId(stage.id)}
                >
                  <span className="aggregation-stage-index">{index + 1}</span>
                  <span>
                    <strong>{formatAggregationStageType(stage.type)}</strong>
                    <small>{getAggregationStageSummary(stage)}</small>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="aggregation-stage-editor">
          {activeStage ? (
            <>
              <div className="aggregation-editor-header">
                <div>
                  <strong>{formatAggregationStageType(activeStage.type)}</strong>
                  <span>{activeStage.enabled ? "Enabled" : "Disabled"}</span>
                </div>
                <div className="aggregation-editor-actions">
                  <button
                    className="secondary-button compact-button"
                    type="button"
                    onClick={() =>
                      onModelChange(
                        setAggregationPipelineStageEnabled(
                          model,
                          activeStage.id,
                          !activeStage.enabled,
                        ),
                      )
                    }
                  >
                    {activeStage.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    className="secondary-button compact-button"
                    type="button"
                    onClick={() =>
                      onModelChange(
                        moveAggregationPipelineStage(
                          model,
                          activeStage.id,
                          "up",
                        ),
                      )
                    }
                  >
                    Up
                  </button>
                  <button
                    className="secondary-button compact-button"
                    type="button"
                    onClick={() =>
                      onModelChange(
                        moveAggregationPipelineStage(
                          model,
                          activeStage.id,
                          "down",
                        ),
                      )
                    }
                  >
                    Down
                  </button>
                  <button
                    className="query-builder-remove compact-button"
                    type="button"
                    onClick={() => {
                      onModelChange(
                        removeAggregationPipelineStage(model, activeStage.id),
                      );
                      setActiveStageId(model.stages[0]?.id ?? null);
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <AggregationStageEditor
                schemaFields={schemaFields}
                stage={activeStage}
                onStageChange={(patch) => updateStage(activeStage.id, patch)}
              />
            </>
          ) : (
            <div className="aggregation-editor-empty">
              Add a stage to start building a pipeline.
            </div>
          )}
        </div>

        <div className="aggregation-preview">
          <div className="aggregation-preview-panel">
            <header>
              <strong>Raw pipeline</strong>
              <span>{rawPipeline.ok ? "Valid" : "Invalid"}</span>
            </header>
            <RawPipelineEditor value={rawPipelineText} />
          </div>
          <button
            className="run-button compact aggregation-run-button"
            type="button"
            onClick={onRunPipeline}
          >
            <span className="play-icon" />
            Run pipeline
          </button>
        </div>
      </div>

      <section className="aggregation-data-explorer">
        <ResultsHeader
          collectionLabel="Aggregation"
          count={resultDocuments.length}
          hasMore={false}
          isFetching={result?.status === "running"}
          onRefresh={onRunPipeline}
          onTablePathChange={setResultTablePath}
          onViewModeChange={setResultViewMode}
          tablePath={resultTablePath}
          viewMode={resultViewMode}
        />
        {result?.status === "running" ? (
          <ResultsLoadingState />
        ) : result?.status === "error" ? (
          <ResultsState
            title="Unable to run pipeline"
            label={result.message}
            actionLabel="Run again"
            onAction={onRunPipeline}
          />
        ) : resultDocuments.length === 0 ? (
          <ResultsState
            title={result ? "No aggregation results" : "No results yet"}
            label={
              result
                ? result.message
                : "Run the pipeline to explore aggregation output."
            }
          />
        ) : resultViewMode === "json" ? (
          <AggregationJsonResults documents={resultDocuments} />
        ) : (
          <DocumentTable
            key={`aggregation:${resultTablePath.join(".")}:${
              resultTableDocuments[0]?.id ?? "empty"
            }:${resultTableDocuments.length}`}
            allowCellEdit={false}
            documents={resultTableDocuments}
            isSavingDocument={false}
            onCellEdit={() => undefined}
            onCellFilter={() => undefined}
            onCellProjection={() => undefined}
            onDocumentOpen={() => undefined}
            onDocumentSelect={setSelectedResultDocument}
            onObjectOpen={handleResultObjectOpen}
            schemaFields={schemaFields}
            selectedDocumentId={selectedResultDocument?.id ?? null}
            tablePath={resultTablePath}
          />
        )}
      </section>
    </section>
  );
};

type RawPipelineEditorProps = {
  value: string;
};

const RawPipelineEditor = ({ value }: RawPipelineEditorProps) => (
  <div className="document-editor-monaco aggregation-raw-editor">
    <Editor
      defaultLanguage="json"
      height="100%"
      loading={<div className="document-editor-loading">Loading editor</div>}
      path="aggregation-raw-pipeline.json"
      value={value}
      options={{
        automaticLayout: true,
        folding: true,
        fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
        fontSize: 12,
        lineHeight: 19,
        minimap: { enabled: false },
        readOnly: true,
        renderLineHighlight: "none",
        scrollBeyondLastLine: false,
        tabSize: 2,
        wordWrap: "off",
      }}
      theme="vs"
    />
  </div>
);

type AggregationStageEditorProps = {
  schemaFields: SchemaFieldSummary[];
  stage: AggregationPipelineStage;
  onStageChange: (
    patch: Parameters<typeof updateAggregationPipelineStage>[2],
  ) => void;
};

const AggregationStageEditor = ({
  schemaFields,
  stage,
  onStageChange,
}: AggregationStageEditorProps) => {
  switch (stage.type) {
    case "match":
      return (
        <AggregationAutocompleteObjectField
          key={`${stage.id}:filter`}
          fields={schemaFields}
          label="Filter"
          mode="filter"
          placeholder='{ "status": "active" }'
          value={stage.filter}
          onChange={(filter) =>
            onStageChange({ filter } satisfies Partial<MatchAggregationStage>)
          }
        />
      );
    case "project":
      return (
        <AggregationAutocompleteObjectField
          key={`${stage.id}:projection`}
          fields={schemaFields}
          label="Projection"
          mode="projection"
          placeholder='{ "email": 1 }'
          value={stage.projection}
          onChange={(projection) =>
            onStageChange({
              projection,
            } satisfies Partial<ProjectAggregationStage>)
          }
        />
      );
    case "sort":
      return (
        <AggregationJsonObjectField
          key={`${stage.id}:sort`}
          label="Sort"
          placeholder='{ "createdAt": -1 }'
          value={stage.sort}
          onChange={(sort) =>
            onStageChange({
              sort: normalizeAggregationSort(sort),
            } satisfies Partial<SortAggregationStage>)
          }
        />
      );
    case "limit":
      return (
        <AggregationNumberField
          label="Limit"
          min={1}
          value={stage.limit}
          onChange={(limit) =>
            onStageChange({ limit } satisfies Partial<LimitAggregationStage>)
          }
        />
      );
    case "skip":
      return (
        <AggregationNumberField
          label="Skip"
          min={0}
          value={stage.skip}
          onChange={(skip) =>
            onStageChange({ skip } satisfies Partial<SkipAggregationStage>)
          }
        />
      );
    case "count":
      return (
        <label className="aggregation-field">
          <span>Output field</span>
          <input
            value={stage.field}
            onChange={(event) =>
              onStageChange({
                field: event.target.value,
              } satisfies Partial<CountAggregationStage>)
            }
          />
        </label>
      );
    case "group":
      return (
        <>
          <label className="aggregation-field">
            <span>Group _id expression</span>
            <input
              placeholder="$status"
              value={formatAggregationExpressionInput(stage.idExpression)}
              onChange={(event) =>
                onStageChange({
                  idExpression: parseAggregationExpressionInput(
                    event.target.value,
                  ),
                } satisfies Partial<GroupAggregationStage>)
              }
            />
          </label>
          <AggregationJsonObjectField
            key={`${stage.id}:accumulators`}
            label="Accumulators"
            placeholder='{ "total": { "$sum": 1 } }'
            value={stage.accumulators}
            onChange={(accumulators) =>
              onStageChange({
                accumulators,
              } satisfies Partial<GroupAggregationStage>)
            }
          />
        </>
      );
    case "unwind":
      return (
        <>
          <label className="aggregation-field">
            <span>Array path</span>
            <QueryFieldAutocompleteInput
              aria-label="Unwind path"
              fields={schemaFields}
              mode="field"
              placeholder="items"
              value={stage.path}
              onChange={(path) =>
                onStageChange({ path } satisfies Partial<UnwindAggregationStage>)
              }
            />
          </label>
          <label className="aggregation-field">
            <span>Include array index</span>
            <input
              placeholder="itemIndex"
              value={stage.includeArrayIndex ?? ""}
              onChange={(event) =>
                onStageChange({
                  includeArrayIndex: event.target.value,
                } satisfies Partial<UnwindAggregationStage>)
              }
            />
          </label>
          <label className="aggregation-checkbox">
            <input
              checked={stage.preserveNullAndEmptyArrays ?? false}
              type="checkbox"
              onChange={(event) =>
                onStageChange({
                  preserveNullAndEmptyArrays: event.target.checked,
                } satisfies Partial<UnwindAggregationStage>)
              }
            />
            Preserve null and empty arrays
          </label>
        </>
      );
  }
};

type AggregationJsonObjectFieldProps = {
  label: string;
  placeholder: string;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
};

const AggregationJsonObjectField = ({
  label,
  placeholder,
  value,
  onChange,
}: AggregationJsonObjectFieldProps) => {
  const [draftValue, setDraftValue] = useState(() =>
    JSON.stringify(value, null, 2),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  return (
    <label className="aggregation-field aggregation-json-field">
      <span>{label}</span>
      <textarea
        placeholder={placeholder}
        value={draftValue}
        onBlur={() => {
          const parsed = parseJsonObject(draftValue, label);

          if (!parsed.ok) {
            setErrorMessage(parsed.message);
            return;
          }

          setErrorMessage(null);
          onChange(parsed.value);
        }}
        onChange={(event) => {
          setDraftValue(event.target.value);
          setErrorMessage(null);
        }}
      />
      {errorMessage ? <small>{errorMessage}</small> : null}
    </label>
  );
};

type AggregationAutocompleteObjectFieldProps = {
  fields: SchemaFieldSummary[];
  label: string;
  mode: "filter" | "projection";
  placeholder: string;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
};

const AggregationAutocompleteObjectField = ({
  fields,
  label,
  mode,
  placeholder,
  value,
  onChange,
}: AggregationAutocompleteObjectFieldProps) => {
  const [draftValue, setDraftValue] = useState(() => JSON.stringify(value));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const commitDraftValue = (nextValue = draftValue) => {
    const parsed = parseJsonObject(nextValue, label);

    if (!parsed.ok) {
      setErrorMessage(parsed.message);
      return;
    }

    setErrorMessage(null);
    onChange(parsed.value);
  };

  return (
    <label className="aggregation-field aggregation-autocomplete-field">
      <span>{label}</span>
      <QueryFieldAutocompleteInput
        aria-label={label}
        canClear
        fields={fields}
        mode={mode}
        placeholder={placeholder}
        value={draftValue}
        onChange={(nextValue) => {
          setDraftValue(nextValue);
          setErrorMessage(null);
          const parsed = parseJsonObject(nextValue, label);

          if (parsed.ok) {
            onChange(parsed.value);
          }
        }}
        onEnter={() => commitDraftValue()}
      />
      <button
        className="secondary-button compact-button"
        type="button"
        onClick={() => commitDraftValue()}
      >
        Apply
      </button>
      {errorMessage ? <small>{errorMessage}</small> : null}
    </label>
  );
};

type AggregationNumberFieldProps = {
  label: string;
  min: number;
  value: number;
  onChange: (value: number) => void;
};

const AggregationNumberField = ({
  label,
  min,
  value,
  onChange,
}: AggregationNumberFieldProps) => (
  <label className="aggregation-field">
    <span>{label}</span>
    <input
      inputMode="numeric"
      min={min}
      type="number"
      value={value}
      onChange={(event) => {
        const nextValue = Number(event.target.value);

        if (Number.isInteger(nextValue) && nextValue >= min) {
          onChange(nextValue);
        }
      }}
    />
  </label>
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
  isSavingDocument: boolean;
  onCellEdit: (request: CellEditRequest) => void;
  onCellFilter: (request: CellFilterRequest) => void;
  onCellProjection: (request: CellProjectionRequest) => void;
  onDocumentBookmark: (document: ParsedDocument) => void;
  onDocumentOpen: (document: ParsedDocument) => void;
  onDocumentSelect: (document: ParsedDocument) => void;
  onRefresh: () => void;
  onTablePathChange: (path: string[]) => void;
  schemaFields: SchemaFieldSummary[];
  selectedDocumentId: string | null;
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
  isSavingDocument,
  onCellEdit,
  onCellFilter,
  onCellProjection,
  onDocumentBookmark,
  onDocumentOpen,
  onDocumentSelect,
  onRefresh,
  onTablePathChange,
  schemaFields,
  selectedDocumentId,
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
        <ResultsState
          title="Unable to load documents"
          label={getSafeWorkspaceErrorMessage(error)}
          actionLabel="Retry"
          onAction={onRefresh}
        />
      ) : isInitialLoading ? (
        <ResultsLoadingState />
      ) : viewMode === "json" ? (
        <JsonResults documents={documents} onDocumentOpen={onDocumentOpen} />
      ) : (
        <DocumentTable
          key={`${tablePath.join(".")}:${tableDocuments[0]?.id ?? "empty"}:${tableDocuments.length}`}
          documents={tableDocuments}
          isSavingDocument={isSavingDocument}
          onCellEdit={onCellEdit}
          onCellFilter={onCellFilter}
          onCellProjection={onCellProjection}
          onDocumentBookmark={onDocumentBookmark}
          onDocumentOpen={onDocumentOpen}
          onDocumentSelect={onDocumentSelect}
          onObjectOpen={handleObjectOpen}
          schemaFields={schemaFields}
          selectedDocumentId={selectedDocumentId}
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
  allowCellEdit?: boolean;
  documents: ParsedDocument[];
  isSavingDocument: boolean;
  onCellEdit: (request: CellEditRequest) => void;
  onCellFilter: (request: CellFilterRequest) => void;
  onCellProjection: (request: CellProjectionRequest) => void;
  onDocumentBookmark?: (document: ParsedDocument) => void;
  onDocumentOpen: (document: ParsedDocument) => void;
  onDocumentSelect: (document: ParsedDocument) => void;
  onObjectOpen: (field: string) => void;
  schemaFields: SchemaFieldSummary[];
  selectedDocumentId: string | null;
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
  document: ParsedDocument;
  fieldPath: string;
  left: number;
  submenuDirection: "left" | "right";
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

type CellProjectionRequest = {
  mode: "exclude" | "include";
  path: string;
};

type CellEditRequest = {
  document: ParsedDocument;
  path: string;
  rawValue: string;
  schemaField: SchemaFieldSummary | null;
  value: unknown;
};

type EditingDocumentCell = {
  cellId: string;
  document: ParsedDocument;
  path: string;
  schemaField: SchemaFieldSummary | null;
  value: unknown;
};

const DocumentTable = ({
  allowCellEdit = true,
  documents,
  isSavingDocument,
  onCellEdit,
  onCellFilter,
  onCellProjection,
  onDocumentBookmark,
  onDocumentOpen,
  onDocumentSelect,
  onObjectOpen,
  schemaFields,
  selectedDocumentId,
  tablePath,
}: DocumentTableProps) => {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const objectPreviewHideTimer = useRef<number | null>(null);
  const objectPreviewShowTimer = useRef<number | null>(null);
  const [cellContextMenu, setCellContextMenu] =
    useState<CellContextMenuState | null>(null);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [editingCell, setEditingCell] = useState<EditingDocumentCell | null>(
    null,
  );
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
      document: ParsedDocument,
      rowId: string,
      fieldKey: string,
      value: unknown,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      cancelObjectPreviewShow();
      cancelObjectPreviewHide();
      setObjectPreview(null);
      setEditingCell(null);
      setSelectedCell({ cellId, rowId });
      const rect = event.currentTarget.getBoundingClientRect();
      const left = getContextMenuLeft(rect.left);
      setCellContextMenu({
        document,
        fieldPath: getCellFilterPath(tablePath, fieldKey),
        left,
        submenuDirection: getContextSubmenuDirection(left),
        top: getContextMenuTop(rect.top),
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
                  selectedDocumentId === row.original.id ||
                  selectedCell?.rowId === row.id
                    ? "is-row-selected"
                    : ""
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
                      onDocumentSelect(row.original);
                      setSelectedCell({
                        cellId: cell.id,
                        rowId: row.id,
                      });
                    }}
                    onDoubleClick={(event) => {
                      const path = getCellFilterPath(tablePath, cell.column.id);
                      const schemaField = getSchemaFieldForPath(
                        schemaFields,
                        path,
                      );
                      const value = cell.getValue();

                      if (
                        allowCellEdit &&
                        !isSavingDocument &&
                        isInlineEditableTableValue(path, value, schemaField)
                      ) {
                        event.stopPropagation();
                        setEditingCell({
                          cellId: cell.id,
                          document: row.original,
                          path,
                          schemaField,
                          value,
                        });
                        setSelectedCell({
                          cellId: cell.id,
                          rowId: row.id,
                        });
                      }
                    }}
                    onContextMenu={(event) =>
                      handleCellContextMenu(
                        event,
                        cell.id,
                        row.original,
                        row.id,
                        cell.column.id,
                        cell.getValue(),
                      )
                    }
                  >
                    {editingCell?.cellId === cell.id ? (
                      <InlineCellEditor
                        schemaField={editingCell.schemaField}
                        value={editingCell.value}
                        onCancel={() => setEditingCell(null)}
                        onCommit={(rawValue) => {
                          onCellEdit({
                            document: editingCell.document,
                            path: editingCell.path,
                            rawValue,
                            schemaField: editingCell.schemaField,
                            value: editingCell.value,
                          });
                          setEditingCell(null);
                        }}
                      />
                    ) : (
                      flexRender(cell.column.columnDef.cell, cell.getContext())
                    )}
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
          onApplyProjection={(request) => {
            onCellProjection(request);
            closeCellContextMenu();
          }}
          onEditDocument={(document) => {
            onDocumentOpen(document);
            closeCellContextMenu();
          }}
          {...(onDocumentBookmark
            ? {
                onBookmarkDocument: (document: ParsedDocument) => {
                  onDocumentBookmark(document);
                  closeCellContextMenu();
                },
              }
            : {})}
          onClose={closeCellContextMenu}
        />
      ) : null}
    </div>
  );
};

type InlineCellEditorProps = {
  schemaField: SchemaFieldSummary | null;
  value: unknown;
  onCancel: () => void;
  onCommit: (rawValue: string) => void;
};

const InlineCellEditor = ({
  schemaField,
  value,
  onCancel,
  onCommit,
}: InlineCellEditorProps) => {
  const initialValue = useMemo(() => formatCellValue(value), [value]);
  const schemaKind = getInlineSchemaKind(schemaField);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const hasFinished = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState(initialValue);
  const finish = useCallback(
    (action: "cancel" | "commit") => {
      if (hasFinished.current) {
        return;
      }

      hasFinished.current = true;

      if (action === "cancel") {
        onCancel();
        return;
      }

      if (draftValue === initialValue) {
        onCancel();
        return;
      }

      const validation = validateInlineCellDraft(draftValue, schemaField);

      if (!validation.ok) {
        hasFinished.current = false;
        setErrorMessage(validation.message);
        return;
      }

      onCommit(draftValue);
    },
    [draftValue, initialValue, onCancel, onCommit, schemaField],
  );

  useEffect(() => {
    const input = inputRef.current;

    if (input) {
      input.focus();
      input.select();
      return;
    }

    selectRef.current?.focus();
  }, []);

  return (
    <span className="inline-cell-editor-wrap">
      {schemaKind === "boolean" ? (
        <select
          ref={selectRef}
          className="inline-cell-editor"
          value={draftValue === "false" ? "false" : "true"}
          onBlur={() => finish("commit")}
          onChange={(event) => {
            setDraftValue(event.target.value);
            setErrorMessage(null);
          }}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event: ReactKeyboardEvent<HTMLSelectElement>) => {
            if (event.key === "Enter") {
              event.preventDefault();
              finish("commit");
            }

            if (event.key === "Escape") {
              event.preventDefault();
              finish("cancel");
            }
          }}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : (
        <input
          ref={inputRef}
          className="inline-cell-editor"
          inputMode={schemaKind === "number" ? "decimal" : "text"}
          value={draftValue}
          onBlur={() => finish("commit")}
          onChange={(event) => {
            setDraftValue(event.target.value);
            setErrorMessage(null);
          }}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") {
              event.preventDefault();
              finish("commit");
            }

            if (event.key === "Escape") {
              event.preventDefault();
              finish("cancel");
            }
          }}
          type={schemaKind === "number" ? "number" : "text"}
        />
      )}
      {errorMessage ? (
        <span className="inline-cell-editor-error">{errorMessage}</span>
      ) : null}
    </span>
  );
};

type CellContextMenuProps = {
  menu: CellContextMenuState;
  onApplyFilter: (request: CellFilterRequest) => void;
  onApplyProjection: (request: CellProjectionRequest) => void;
  onBookmarkDocument?: (document: ParsedDocument) => void;
  onEditDocument: (document: ParsedDocument) => void;
  onClose: () => void;
};

const CellContextMenu = ({
  menu,
  onApplyFilter,
  onApplyProjection,
  onBookmarkDocument,
  onEditDocument,
  onClose,
}: CellContextMenuProps) => {
  const items = getCellFilterMenuItems(menu.fieldPath, menu.value);
  const canProject = Boolean(menu.fieldPath);

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
        <div
          className={`cell-context-submenu-item opens-${menu.submenuDirection}`}
        >
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
      {canProject ? (
        <div
          className={`cell-context-submenu-item opens-${menu.submenuDirection}`}
        >
          <button type="button">
            <span>Project by &quot;{menu.fieldPath}&quot;</span>
            <span aria-hidden="true">›</span>
          </button>
          <div className="cell-context-submenu">
            <button
              type="button"
              onClick={() =>
                onApplyProjection({
                  mode: "include",
                  path: menu.fieldPath,
                })
              }
            >
              Include Selected &quot;{menu.fieldPath}&quot;
            </button>
            <button
              type="button"
              onClick={() =>
                onApplyProjection({
                  mode: "exclude",
                  path: menu.fieldPath,
                })
              }
            >
              Exclude Selected &quot;{menu.fieldPath}&quot;
            </button>
          </div>
        </div>
      ) : null}
      <span className="cell-context-menu-separator" />
      {onBookmarkDocument ? (
        <button type="button" onClick={() => onBookmarkDocument(menu.document)}>
          Add document to bookmarks
        </button>
      ) : null}
      <button type="button" onClick={() => onEditDocument(menu.document)}>
        Edit document
      </button>
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  );
};

type JsonResultsProps = {
  documents: ParsedDocument[];
  onDocumentOpen: (document: ParsedDocument) => void;
};

const JsonResults = ({ documents, onDocumentOpen }: JsonResultsProps) => {
  const parentRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: documents.length,
    estimateSize: () => 320,
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
                <button
                  className="secondary-button compact-button"
                  onClick={() => onDocumentOpen(document)}
                  type="button"
                >
                  Edit
                </button>
              </header>
              <ReadOnlyJsonDocumentEditor
                path={`document-json-${document.id}.json`}
                value={formatEditableEjson(document.ejson)}
              />
            </article>
          );
        })}
      </div>
    </div>
  );
};

type AggregationJsonResultsProps = {
  documents: ParsedDocument[];
};

const AggregationJsonResults = ({ documents }: AggregationJsonResultsProps) => {
  const parentRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: documents.length,
    estimateSize: () => 320,
    getScrollElement: () => parentRef.current,
    overscan: 4,
  });

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
                <span>Result</span>
                <strong>{document.id}</strong>
              </header>
              <ReadOnlyJsonDocumentEditor
                path={`aggregation-json-${document.id}.json`}
                value={formatEditableEjson(document.ejson)}
              />
            </article>
          );
        })}
      </div>
    </div>
  );
};

type ReadOnlyJsonDocumentEditorProps = {
  path: string;
  value: string;
};

const ReadOnlyJsonDocumentEditor = ({
  path,
  value,
}: ReadOnlyJsonDocumentEditorProps) => (
  <div className="document-editor-monaco json-document-editor">
    <Editor
      defaultLanguage="json"
      height="100%"
      loading={<div className="document-editor-loading">Loading editor</div>}
      path={path}
      value={value}
      options={{
        automaticLayout: true,
        folding: true,
        fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
        fontSize: 12,
        lineHeight: 19,
        minimap: { enabled: false },
        readOnly: true,
        renderLineHighlight: "none",
        scrollBeyondLastLine: false,
        tabSize: 2,
        wordWrap: "off",
      }}
      theme="vs"
    />
  </div>
);

type DocumentEditorPanelProps = {
  document: ParsedDocument;
  isProduction: boolean;
  isReadOnly: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (editedDocument: string, confirmedProductionWrite: boolean) => void;
};

const DocumentEditorPanel = ({
  document,
  isProduction,
  isReadOnly,
  isSaving,
  onClose,
  onSave,
}: DocumentEditorPanelProps) => {
  const initialValue = useMemo(
    () => formatEditableEjson(document.ejson),
    [document.ejson],
  );
  const [editorValue, setEditorValue] = useState(initialValue);
  const [isConfirmingSave, setIsConfirmingSave] = useState(false);
  const validation = useMemo(
    () => validateEditedDocument(document.ejson, editorValue),
    [document.ejson, editorValue],
  );
  const isDirty = editorValue !== initialValue;
  const canSave = !isReadOnly && !isSaving && isDirty && validation.ok;

  return (
    <aside
      aria-label={`Edit document ${document.id}`}
      className="document-editor-panel"
    >
      <header className="document-editor-header">
        <div>
          <span>Document editor</span>
          <strong>{document.id}</strong>
        </div>
        <button
          aria-label="Close document editor"
          className="plain-icon"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </header>

      <div className="document-editor-body">
        {isReadOnly ? (
          <div className="document-editor-notice">
            This connection is read-only. Saving is disabled.
          </div>
        ) : null}
        {isProduction ? (
          <div className="document-editor-notice is-warning">
            Production write. Saving requires confirmation.
          </div>
        ) : null}
        <div className="document-editor-field">
          <div className="document-editor-field-label">
            EJSON
            <small>{isDirty ? "Modified" : "Saved"}</small>
          </div>
          <div className="document-editor-monaco">
            <Editor
              defaultLanguage="json"
              height="100%"
              loading={
                <div className="document-editor-loading">Loading editor</div>
              }
              path={`document-${document.id}.json`}
              value={editorValue}
              onMount={(editor) => {
                editor.focus();
                editor.updateOptions({ domReadOnly: false, readOnly: false });
              }}
              onChange={(value) => {
                setEditorValue(value ?? "");
                setIsConfirmingSave(false);
              }}
              options={{
                automaticLayout: true,
                folding: true,
                fontFamily:
                  '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
                fontSize: 12,
                lineHeight: 19,
                minimap: { enabled: false },
                readOnly: false,
                renderValidationDecorations: "on",
                renderLineHighlight: "none",
                scrollBeyondLastLine: false,
                tabSize: 2,
                wordWrap: "off",
              }}
              theme="vs"
            />
          </div>
        </div>
        {!validation.ok ? (
          <p className="document-editor-error">{validation.message}</p>
        ) : null}
      </div>

      <footer className="document-editor-footer">
        {isConfirmingSave ? (
          <div className="document-editor-confirm">
            <span>
              Save changes to this document
              {isProduction ? " in production" : ""}?
            </span>
            <button
              className="secondary-button"
              disabled={isSaving}
              onClick={() => setIsConfirmingSave(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="run-button compact"
              disabled={isSaving}
              onClick={() => onSave(editorValue, isProduction)}
              type="button"
            >
              <span className="play-icon" />
              Confirm save
            </button>
          </div>
        ) : (
          <>
            <button
              className="secondary-button"
              disabled={isSaving}
              onClick={onClose}
              type="button"
            >
              Close
            </button>
            <button
              className="run-button compact"
              disabled={!canSave}
              onClick={() => setIsConfirmingSave(true)}
              type="button"
            >
              <span className="play-icon" />
              {isSaving ? "Saving" : "Save"}
            </button>
          </>
        )}
      </footer>
    </aside>
  );
};

type ResultsStateProps = {
  actionLabel?: string;
  label: string;
  onAction?: () => void;
  title: string;
};

const ResultsState = ({
  actionLabel,
  label,
  onAction,
  title,
}: ResultsStateProps) => (
  <div className="results-state">
    <Icon name="table" />
    <strong>{title}</strong>
    <span>{label}</span>
    {actionLabel && onAction ? (
      <button className="secondary-button compact-button" onClick={onAction} type="button">
        {actionLabel}
      </button>
    ) : null}
  </div>
);

const getSafeWorkspaceErrorMessage = (error: Error): string => {
  const code = (error as { code?: string }).code;

  if (code === "CONNECTION_NOT_ACTIVE") {
    return "Connect to the profile and retry the operation.";
  }

  if (code === "READ_ONLY_VIOLATION") {
    return "This connection is read-only. Write operations are blocked.";
  }

  if (code === "WRITE_CONFIRMATION_REQUIRED") {
    return "Production writes require explicit confirmation.";
  }

  if (code === "VALIDATION_FAILED") {
    return "The request is invalid. Check the query inputs and try again.";
  }

  if (code === "SECRET_NOT_FOUND") {
    return "The saved secret is missing. Edit the connection and save the URI again.";
  }

  return error.message || "Something went wrong. Try again.";
};

const readStoredQueries = (storageKey: string): SavedWorkspaceQuery[] => {
  try {
    const rawValue = globalThis.localStorage?.getItem(storageKey);

    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .filter(isSavedWorkspaceQuery)
      .map(normalizeSavedWorkspaceQuery);
  } catch {
    return [];
  }
};

const writeStoredQueries = (
  storageKey: string,
  queries: SavedWorkspaceQuery[],
) => {
  try {
    globalThis.localStorage?.setItem(storageKey, JSON.stringify(queries));
  } catch {
    // Local query storage is best-effort and should never break the workspace.
  }
};

const readStoredBookmarks = (storageKey: string): SavedWorkspaceBookmark[] => {
  try {
    const rawValue = globalThis.localStorage?.getItem(storageKey);

    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter(isSavedWorkspaceBookmark);
  } catch {
    return [];
  }
};

const writeStoredBookmarks = (
  storageKey: string,
  bookmarks: SavedWorkspaceBookmark[],
) => {
  try {
    globalThis.localStorage?.setItem(storageKey, JSON.stringify(bookmarks));
  } catch {
    // Local bookmark storage is best-effort and should not break navigation.
  }
};

const readStoredTasks = (storageKey: string): SavedWorkspaceTask[] => {
  try {
    const rawValue = globalThis.localStorage?.getItem(storageKey);

    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .filter(isSavedWorkspaceTask)
      .map(normalizeSavedWorkspaceTask);
  } catch {
    return [];
  }
};

const writeStoredTasks = (
  storageKey: string,
  tasks: SavedWorkspaceTask[],
) => {
  try {
    globalThis.localStorage?.setItem(storageKey, JSON.stringify(tasks));
  } catch {
    // Local task storage is best-effort and should never block the app shell.
  }
};

const isSavedWorkspaceQuery = (value: unknown): value is SavedWorkspaceQuery => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const query = value as Partial<SavedWorkspaceQuery>;

  return (
    typeof query.collection === "string" &&
    typeof query.connectionId === "string" &&
    typeof query.connectionName === "string" &&
    typeof query.database === "string" &&
    typeof query.id === "string" &&
    (query.kind === "find" || query.kind === "aggregation") &&
    typeof query.limit === "number" &&
    typeof query.name === "string" &&
    typeof query.skip === "number"
  );
};

const normalizeSavedWorkspaceQuery = (
  query: SavedWorkspaceQuery,
): SavedWorkspaceQuery => ({
  ...query,
  notes: typeof query.notes === "string" ? query.notes : "",
});

const isSavedWorkspaceBookmark = (
  value: unknown,
): value is SavedWorkspaceBookmark => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const bookmark = value as Partial<SavedWorkspaceBookmark>;

  return (
    typeof bookmark.connectionId === "string" &&
    typeof bookmark.connectionName === "string" &&
    typeof bookmark.createdAt === "string" &&
    typeof bookmark.id === "string" &&
    typeof bookmark.name === "string" &&
    typeof bookmark.notes === "string" &&
    Array.isArray(bookmark.tags) &&
    bookmark.tags.every((tag) => typeof tag === "string") &&
    typeof bookmark.updatedAt === "string" &&
    (bookmark.kind === "database" ||
      bookmark.kind === "collection" ||
      bookmark.kind === "document") &&
    typeof bookmark.database === "string" &&
    (bookmark.kind === "database" || typeof bookmark.collection === "string") &&
    (bookmark.kind !== "document" || typeof bookmark.documentId === "string")
  );
};

const isSavedWorkspaceTask = (value: unknown): value is SavedWorkspaceTask => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const task = value as Partial<SavedWorkspaceTask>;

  return (
    typeof task.createdAt === "string" &&
    typeof task.id === "string" &&
    typeof task.lastModifiedAt === "string" &&
    typeof task.name === "string" &&
    (task.schedule === "manual" ||
      task.schedule === "custom-minutes" ||
      task.schedule === "minute" ||
      task.schedule === "hourly" ||
      task.schedule === "daily" ||
      task.schedule === "daily-at" ||
      task.schedule === "weekly") &&
    (task.nextRunAt === undefined || typeof task.nextRunAt === "string") &&
    (task.scheduleTime === undefined || typeof task.scheduleTime === "string") &&
    (task.runs === undefined ||
      (Array.isArray(task.runs) &&
        task.runs.every((run) => isSavedWorkspaceTaskRun(run)))) &&
    (task.status === "idle" ||
      task.status === "running" ||
      task.status === "success" ||
      task.status === "failed") &&
    typeof task.target === "string" &&
    isSavedWorkspaceTaskType(task.type) &&
    task.sourceQuery !== undefined &&
    isSavedWorkspaceQuery(task.sourceQuery)
  );
};

const isSavedWorkspaceTaskType = (
  value: unknown,
): value is SavedWorkspaceTask["type"] =>
  value === "find" ||
  value === "aggregation" ||
  value === "export" ||
  value === "schema-inference" ||
  value === "audit-cleanup";

const isSavedWorkspaceTaskRun = (
  value: unknown,
): value is SavedWorkspaceTask["runs"][number] => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const run = value as Partial<SavedWorkspaceTask["runs"][number]>;

  return (
    typeof run.finishedAt === "string" &&
    typeof run.id === "string" &&
    typeof run.message === "string" &&
    typeof run.startedAt === "string" &&
    (run.status === "failed" || run.status === "success") &&
    (run.trigger === "manual" || run.trigger === "schedule") &&
    (run.error === undefined || typeof run.error === "string") &&
    (run.executionTimeMs === undefined ||
      typeof run.executionTimeMs === "number") &&
    (run.resultCount === undefined || typeof run.resultCount === "number")
  );
};

const normalizeSavedWorkspaceTask = (
  task: SavedWorkspaceTask,
): SavedWorkspaceTask => {
  const normalizedTask: SavedWorkspaceTask = {
    ...task,
    runs: Array.isArray(task.runs) ? task.runs : [],
    status: task.status === "running" ? "idle" : task.status,
  };

  if (task.status === "running") {
    normalizedTask.result = "Interrupted before completion.";
  }

  return normalizedTask;
};

const isAddBookmarkEventDetail = (
  value: unknown,
): value is AddBookmarkEventDetail => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const detail = value as Partial<AddBookmarkEventDetail>;

  return (
    typeof detail.connectionId === "string" &&
    typeof detail.connectionName === "string" &&
    typeof detail.database === "string" &&
    (detail.kind === "database" ||
      detail.kind === "collection" ||
      detail.kind === "document") &&
    (detail.kind === "database" || typeof detail.collection === "string") &&
    (detail.kind !== "document" || typeof detail.documentId === "string")
  );
};

type BookmarkSnapshotTarget = {
  collection?: string;
  connectionId: string;
  connectionName: string;
  database: string;
  documentId?: string;
};

const buildBookmarkSnapshot = ({
  kind,
  target,
}: {
  kind: SavedWorkspaceBookmark["kind"];
  target: BookmarkSnapshotTarget;
}):
  | { ok: true; value: SavedWorkspaceBookmark }
  | { ok: false; message: string } => {
  if ((kind === "collection" || kind === "document") && !target.collection) {
    return {
      message: "Select a collection before saving this bookmark.",
      ok: false,
    };
  }

  if (kind === "document" && !target.documentId) {
    return { message: "Select a document before saving it.", ok: false };
  }

  const now = new Date().toISOString();
  const bookmark: SavedWorkspaceBookmark = {
    connectionId: target.connectionId,
    connectionName: target.connectionName,
    createdAt: now,
    id: `bookmark_${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
    kind,
    name: createBookmarkName(kind, target),
    notes: "",
    tags: [],
    updatedAt: now,
    database: target.database,
    ...(target.collection ? { collection: target.collection } : {}),
    ...(kind === "document" && target.documentId
      ? { documentId: target.documentId }
      : {}),
  };

  return { ok: true, value: bookmark };
};

const createBookmarkName = (
  kind: SavedWorkspaceBookmark["kind"],
  target: BookmarkSnapshotTarget,
): string => {
  if (kind === "document") {
    return target.documentId ?? "Document";
  }

  if (kind === "collection") {
    return target.collection ?? "Collection";
  }

  if (kind === "database") {
    return target.database ?? "Database";
  }

  return target.connectionName;
};

const groupBookmarks = (
  bookmarks: SavedWorkspaceBookmark[],
): Array<{
  bookmarks: SavedWorkspaceBookmark[];
  connectionName: string;
  databaseName: string;
  key: string;
}> => {
  const groups = new Map<
    string,
    {
      bookmarks: SavedWorkspaceBookmark[];
      connectionName: string;
      databaseName: string;
      key: string;
    }
  >();

  for (const bookmark of bookmarks) {
    const databaseName = bookmark.database ?? "Connection";
    const key = `${bookmark.connectionId}:${databaseName}`;
    const group =
      groups.get(key) ??
      {
        bookmarks: [],
        connectionName: bookmark.connectionName,
        databaseName,
        key,
      };

    group.bookmarks.push(bookmark);
    groups.set(key, group);
  }

  return [...groups.values()];
};

const getBookmarkTags = (bookmarks: SavedWorkspaceBookmark[]): string[] =>
  [
    ...new Set(
      bookmarks.flatMap((bookmark) =>
        bookmark.tags.map((tag) => tag.trim()).filter(Boolean),
      ),
    ),
  ].sort((firstTag, secondTag) => firstTag.localeCompare(secondTag));

const formatBookmarkKind = (kind: SavedWorkspaceBookmark["kind"]): string =>
  kind.charAt(0).toUpperCase() + kind.slice(1);

const formatBookmarkTarget = (bookmark: SavedWorkspaceBookmark): string => {
  const path = [bookmark.database, bookmark.collection]
    .filter(Boolean)
    .join(".");

  if (bookmark.documentId) {
    return `${path} · ${bookmark.documentId}`;
  }

  return path || bookmark.connectionName;
};

const createSavedQueryName = (
  collectionName: string,
  filter: Record<string, unknown>,
): string => {
  const keys = Object.keys(filter);

  if (keys.length === 0) {
    return `${collectionName} find all`;
  }

  return `${collectionName} by ${keys.slice(0, 2).join(", ")}`;
};

const getTaskTypeSuffix = (type: SavedWorkspaceTask["type"]): string => {
  if (type === "export") {
    return "export";
  }

  if (type === "schema-inference") {
    return "schema task";
  }

  if (type === "audit-cleanup") {
    return "cleanup task";
  }

  return "task";
};

const formatTaskType = (task: SavedWorkspaceTask): string => {
  if (task.type === "export") {
    return "Export";
  }

  if (task.type === "schema-inference") {
    return "Schema inference";
  }

  if (task.type === "audit-cleanup") {
    return "Audit cleanup";
  }

  return task.type === "aggregation" ? "Aggregation" : "Find query";
};

const formatTaskSchedule = (
  schedule: SavedWorkspaceTask["schedule"],
  scheduleTime?: string,
): string => {
  if (schedule === "custom-minutes") {
    const minutes = parseTaskScheduleMinutes(scheduleTime);

    return minutes === null
      ? "Every few minutes"
      : `Every ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  if (schedule === "minute") {
    return "Every minute";
  }

  if (schedule === "hourly") {
    return "Every hour";
  }

  if (schedule === "daily-at") {
    return `Every day at ${scheduleTime ?? "09:00"}`;
  }

  if (schedule === "daily") {
    return "Every day";
  }

  if (schedule === "weekly") {
    return "Every week";
  }

  return "Manual";
};

const formatTaskStatus = (status: SavedWorkspaceTask["status"]): string => {
  if (status === "idle") {
    return "Idle";
  }

  if (status === "running") {
    return "Running";
  }

  if (status === "success") {
    return "Succeeded";
  }

  return "Failed";
};

const getNextTaskRunAt = (
  schedule: Exclude<SavedWorkspaceTask["schedule"], "manual">,
  scheduleTime?: string,
): string => {
  const nextRunAt = new Date();

  if (schedule === "custom-minutes") {
    nextRunAt.setMinutes(
      nextRunAt.getMinutes() + (parseTaskScheduleMinutes(scheduleTime) ?? 1),
    );
  } else if (schedule === "minute") {
    nextRunAt.setMinutes(nextRunAt.getMinutes() + 1);
  } else if (schedule === "hourly") {
    nextRunAt.setHours(nextRunAt.getHours() + 1);
  } else if (schedule === "daily-at") {
    const [hours = "9", minutes = "0"] = (scheduleTime ?? "09:00").split(":");
    nextRunAt.setHours(Number(hours), Number(minutes), 0, 0);

    if (nextRunAt.getTime() <= Date.now()) {
      nextRunAt.setDate(nextRunAt.getDate() + 1);
    }
  } else if (schedule === "daily") {
    nextRunAt.setDate(nextRunAt.getDate() + 1);
  } else {
    nextRunAt.setDate(nextRunAt.getDate() + 7);
  }

  return nextRunAt.toISOString();
};

const parseTaskScheduleMinutes = (value: string | undefined): number | null => {
  const minutes = Number(value);

  if (!Number.isInteger(minutes) || minutes < 1) {
    return null;
  }

  return minutes;
};

const formatTaskNextRun = (isoDate: string, now: number): string => {
  const timestamp = Date.parse(isoDate);

  if (!Number.isFinite(timestamp)) {
    return "recently";
  }

  const millisecondsUntilRun = timestamp - now;

  if (millisecondsUntilRun > 0 && millisecondsUntilRun <= 60_000) {
    return `in ${Math.max(1, Math.ceil(millisecondsUntilRun / 1000))}s`;
  }

  return formatRelativeTime(isoDate);
};

const formatAbsoluteTime = (isoDate: string): string => {
  const timestamp = Date.parse(isoDate);

  if (!Number.isFinite(timestamp)) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
};

const formatRelativeTime = (isoDate: string): string => {
  const timestamp = Date.parse(isoDate);

  if (!Number.isFinite(timestamp)) {
    return "recently";
  }

  const deltaSeconds = Math.floor((Date.now() - timestamp) / 1000);
  const isFuture = deltaSeconds < 0;
  const seconds = Math.max(1, Math.abs(deltaSeconds));

  const format = (value: number, unit: string) =>
    isFuture ? `in ${value}${unit}` : `${value}${unit} ago`;

  if (seconds < 60) {
    return format(seconds, "s");
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return format(minutes, "m");
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return format(hours, "h");
  }

  return format(Math.floor(hours / 24), "d");
};

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
const contextMenuEstimatedHeight = 112;
const contextSubmenuWidth = 380;

const getContextMenuLeft = (clientX: number): number =>
  Math.max(10, Math.min(clientX, window.innerWidth - contextMenuWidth - 10));

const getContextMenuTop = (clientY: number): number =>
  Math.max(
    10,
    Math.min(clientY, window.innerHeight - contextMenuEstimatedHeight - 10),
  );

const getContextSubmenuDirection = (menuLeft: number): "left" | "right" =>
  menuLeft + contextMenuWidth + contextSubmenuWidth + 10 > window.innerWidth
    ? "left"
    : "right";

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

const aggregationStageOptions: AggregationPipelineStageType[] = [
  "match",
  "project",
  "sort",
  "limit",
  "skip",
  "count",
  "group",
  "unwind",
];

const formatAggregationStageType = (
  type: AggregationPipelineStageType,
): string => {
  switch (type) {
    case "match":
      return "$match";
    case "project":
      return "$project";
    case "sort":
      return "$sort";
    case "limit":
      return "$limit";
    case "skip":
      return "$skip";
    case "count":
      return "$count";
    case "group":
      return "$group";
    case "unwind":
      return "$unwind";
  }
};

const getAggregationStageSummary = (stage: AggregationPipelineStage): string => {
  switch (stage.type) {
    case "match":
      return summarizeObjectKeys(stage.filter, "empty filter");
    case "project":
      return summarizeObjectKeys(stage.projection, "empty projection");
    case "sort":
      return summarizeObjectKeys(stage.sort, "no sort fields");
    case "limit":
      return `${stage.limit} documents`;
    case "skip":
      return `${stage.skip} skipped`;
    case "count":
      return stage.field.trim() || "missing output field";
    case "group":
      return summarizeObjectKeys(stage.accumulators, "no accumulators");
    case "unwind":
      return stage.path.trim() || "missing path";
  }
};

const summarizeObjectKeys = (
  value: Record<string, unknown>,
  emptyLabel: string,
): string => {
  const keys = Object.keys(value);

  if (keys.length === 0) {
    return emptyLabel;
  }

  if (keys.length === 1) {
    return keys[0] ?? emptyLabel;
  }

  return `${keys.length} fields`;
};

const normalizeAggregationSort = (
  value: Record<string, unknown>,
): Record<string, 1 | -1> =>
  Object.fromEntries(
    Object.entries(value).flatMap(([field, direction]) =>
      direction === 1 || direction === -1 ? [[field, direction]] : [],
    ),
  );

const formatAggregationExpressionInput = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
};

const parseAggregationExpressionInput = (value: string): unknown => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  try {
    return JSON.parse(normalizeMongoJsonInput(trimmedValue));
  } catch {
    return trimmedValue;
  }
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
  type,
  value,
}: {
  context: QueryFieldSuggestionContext;
  mode: "field" | "filter" | "projection";
  path: string;
  type: string;
  value: string;
}): string => {
  if (mode === "field") {
    return path;
  }

  const trimmedValue = value.trim();
  const fieldValue = getQueryFieldSuggestionDefaultValue(mode, type);

  if (!trimmedValue || trimmedValue === "{}") {
    return `{"${path}":${fieldValue}}`;
  }

  if (!trimmedValue.startsWith("{")) {
    return `{"${path}":${fieldValue}}`;
  }

  const before = value.slice(0, context.start);
  const after = value.slice(context.start + context.fragment.length);
  const formattedKey = getFormattedQueryFieldKey(context, path);
  const valueSuffix = getQueryFieldSuggestionValueSuffix(after, mode, type);
  const nextValue = `${before}${formattedKey}${valueSuffix}${after}`;

  return trimmedValue.endsWith("}") ? nextValue : `${nextValue}}`;
};

const getFormattedQueryFieldKey = (
  context: QueryFieldSuggestionContext,
  path: string,
): string => (context.hasOpeningQuote ? path : `"${path}"`);

const getQueryFieldSuggestionValueSuffix = (
  after: string,
  mode: "filter" | "projection",
  type: string,
): string => {
  const nextAfter = after.trimStart();

  if (nextAfter.startsWith(":") || nextAfter.startsWith('"')) {
    return "";
  }

  return `:${getQueryFieldSuggestionDefaultValue(mode, type)}`;
};

const getQueryFieldSuggestionDefaultValue = (
  mode: "filter" | "projection",
  type: string,
): string => {
  if (mode === "projection") {
    return "1";
  }

  const normalizedType = type.toLowerCase();

  if (/\b(bool|boolean)\b/.test(normalizedType)) {
    return "true";
  }

  if (
    /\b(int|int32|int64|long|double|decimal|decimal128|number|float)\b/.test(
      normalizedType,
    )
  ) {
    return "0";
  }

  if (/\b(array)\b/.test(normalizedType)) {
    return "[]";
  }

  if (/\b(object)\b/.test(normalizedType)) {
    return "{}";
  }

  return '""';
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

const formatEditableEjson = (document: string): string => {
  try {
    return JSON.stringify(JSON.parse(document), null, 2);
  } catch {
    return document;
  }
};

const validateEditedDocument = (
  originalDocument: string,
  editedDocument: string,
): { ok: true } | { ok: false; message: string } => {
  const original = parseStrictJsonDocument(originalDocument);

  if (!original.ok) {
    return { ok: false, message: "Original document is not valid EJSON." };
  }

  const edited = parseStrictJsonDocument(editedDocument);

  if (!edited.ok) {
    return { ok: false, message: "Edited document is not valid EJSON." };
  }

  if (!("_id" in original.value) || !("_id" in edited.value)) {
    return { ok: false, message: "Document _id is required." };
  }

  if (JSON.stringify(original.value._id) !== JSON.stringify(edited.value._id)) {
    return { ok: false, message: "_id changes are not allowed." };
  }

  return { ok: true };
};

const parseStrictJsonDocument = (
  document: string,
): { ok: true; value: Record<string, unknown> } | { ok: false } => {
  try {
    const parsed = JSON.parse(document) as unknown;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ok: true, value: parsed as Record<string, unknown> };
    }
  } catch {
    return { ok: false };
  }

  return { ok: false };
};

const buildInlineEditedDocument = ({
  document,
  path,
  rawValue,
  schemaField,
  value,
}: {
  document: string;
  path: string;
  rawValue: string;
  schemaField: SchemaFieldSummary | null;
  value: unknown;
}): { ok: true; value: string } | { ok: false; message: string } => {
  const parsed = parseStrictJsonDocument(document);

  if (!parsed.ok) {
    return { ok: false, message: "Document is not valid EJSON." };
  }

  if (!path || path === "_id" || path.startsWith("_id.")) {
    return { ok: false, message: "_id cannot be edited inline." };
  }

  const parsedValue = parseInlineCellValue(rawValue, value, schemaField);

  if (!parsedValue.ok) {
    return parsedValue;
  }

  const updatedDocument = structuredClone(parsed.value);
  const didSet = setValueAtPath(
    updatedDocument,
    path.split("."),
    parsedValue.value,
  );

  if (!didSet) {
    return { ok: false, message: "Unable to update field path." };
  }

  return {
    ok: true,
    value: JSON.stringify(updatedDocument),
  };
};

const setValueAtPath = (
  target: Record<string, unknown> | unknown[],
  path: string[],
  value: unknown,
): boolean => {
  const [head, ...tail] = path;

  if (!head) {
    return false;
  }

  if (Array.isArray(target)) {
    const index = Number(head);

    if (!Number.isInteger(index) || index < 0 || index >= target.length) {
      return false;
    }

    if (tail.length === 0) {
      target[index] = value;
      return true;
    }

    const nextValue = target[index];

    if (!isRecord(nextValue) && !Array.isArray(nextValue)) {
      return false;
    }

    return setValueAtPath(nextValue, tail, value);
  }

  if (tail.length === 0) {
    target[head] = value;
    return true;
  }

  const nextValue = target[head];

  if (!isRecord(nextValue) && !Array.isArray(nextValue)) {
    return false;
  }

  return setValueAtPath(nextValue, tail, value);
};

const parseInlineCellValue = (
  rawValue: string,
  originalValue: unknown,
  schemaField: SchemaFieldSummary | null,
): { ok: true; value: unknown } | { ok: false; message: string } => {
  const trimmedValue = rawValue.trim();
  const schemaKind = getInlineSchemaKind(schemaField);

  if (isRecord(originalValue)) {
    const ejsonKey = getEjsonScalarKey(originalValue);

    if (ejsonKey) {
      return parseInlineEjsonScalar(
        trimmedValue,
        originalValue,
        ejsonKey,
        schemaField,
      );
    }
  }

  const unwrappedValue = unwrapEjsonValue(originalValue);

  if (schemaKind === "boolean" || typeof unwrappedValue === "boolean") {
    if (trimmedValue === "true") {
      return { ok: true, value: true };
    }

    if (trimmedValue === "false") {
      return { ok: true, value: false };
    }

    return { ok: false, message: "Boolean values must be true or false." };
  }

  if (schemaKind === "number" || typeof unwrappedValue === "number") {
    const numericValue = Number(trimmedValue);

    if (Number.isNaN(numericValue)) {
      return { ok: false, message: "Number values must be numeric." };
    }

    return { ok: true, value: numericValue };
  }

  if (unwrappedValue === null) {
    if (trimmedValue === "null") {
      return { ok: true, value: null };
    }

    return { ok: true, value: rawValue };
  }

  return { ok: true, value: rawValue };
};

const parseInlineEjsonScalar = (
  rawValue: string,
  originalValue: Record<string, unknown>,
  ejsonKey: string,
  schemaField: SchemaFieldSummary | null,
): { ok: true; value: unknown } | { ok: false; message: string } => {
  const schemaKind = getInlineSchemaKind(schemaField);
  const isNumericEjson =
    ejsonKey === "$numberInt" ||
    ejsonKey === "$numberLong" ||
    ejsonKey === "$numberDouble" ||
    ejsonKey === "$numberDecimal";

  if (schemaKind === "boolean") {
    return { ok: false, message: "Boolean fields must be true or false." };
  }

  if (schemaKind === "number" || isNumericEjson) {
    if (rawValue === "" || Number.isNaN(Number(rawValue))) {
      return { ok: false, message: "EJSON numeric values must be numeric." };
    }
  }

  return {
    ok: true,
    value: {
      ...originalValue,
      [ejsonKey]: rawValue,
    },
  };
};

type InlineSchemaKind = "boolean" | "number" | "string" | null;

const getSchemaFieldForPath = (
  schemaFields: SchemaFieldSummary[],
  path: string,
): SchemaFieldSummary | null =>
  schemaFields.find((field) => field.name === path) ?? null;

const getInlineSchemaKind = (
  schemaField: SchemaFieldSummary | null,
): InlineSchemaKind => {
  if (!schemaField) {
    return null;
  }

  const types = schemaField.type.split("|").map((type) => type.trim());

  if (types.length === 0) {
    return null;
  }

  if (types.every((type) => type === "Boolean")) {
    return "boolean";
  }

  if (
    types.every((type) =>
      ["Decimal128", "Double", "Int32", "Long", "Number"].includes(type),
    )
  ) {
    return "number";
  }

  if (types.every((type) => type === "String")) {
    return "string";
  }

  return null;
};

const validateInlineCellDraft = (
  rawValue: string,
  schemaField: SchemaFieldSummary | null,
): { ok: true } | { ok: false; message: string } => {
  const schemaKind = getInlineSchemaKind(schemaField);
  const trimmedValue = rawValue.trim();

  if (schemaKind === "boolean") {
    return trimmedValue === "true" || trimmedValue === "false"
      ? { ok: true }
      : { ok: false, message: "true / false" };
  }

  if (schemaKind === "number") {
    return trimmedValue !== "" && !Number.isNaN(Number(trimmedValue))
      ? { ok: true }
      : { ok: false, message: "number only" };
  }

  return { ok: true };
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

const isInlineEditableTableValue = (
  path: string,
  value: unknown,
  schemaField: SchemaFieldSummary | null,
): boolean => {
  if (path === "_id" || path.startsWith("_id.")) {
    return false;
  }

  if (
    schemaField?.type
      .split("|")
      .some((type) => ["Array", "Object"].includes(type.trim()))
  ) {
    return false;
  }

  return !isDrillableTableValue(value) && unwrapEjsonValue(value) !== undefined;
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

const getEjsonScalarKey = (value: Record<string, unknown>): string | null => {
  const keys = Object.keys(value);

  if (keys.length !== 1) {
    return null;
  }

  const key = keys[0];

  return key && ejsonDisplayKeys.has(key) ? key : null;
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
