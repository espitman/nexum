import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import type { ConnectionSummary } from "../../ipc/contracts";
import { ConnectionRail } from "./components/ConnectionRail";
import { DatabasePanel } from "./components/DatabasePanel";
import { DocumentWorkspace } from "./components/DocumentWorkspace";
import { ErrorToastSurface } from "./components/ErrorToastSurface";
import { InspectorPanel } from "./components/InspectorPanel";
import { PanelRestoreButton } from "./components/PanelRestoreButton";
import { TopBar } from "./components/TopBar";
import type {
  InspectorTabLabel,
  NavItemLabel,
  WorkspaceTabLabel,
} from "./mockData";
import type {
  ConnectionProfile,
  ConnectionStatus,
  CoreUiState,
  EnvironmentName,
  HealthState,
  IndexSummary,
  SchemaFieldSummary,
  ToastMessage,
} from "./types";

export const App = () => {
  const queryClient = useQueryClient();
  const [health, setHealth] = useState<HealthState>({ status: "loading" });
  const [coreUiState] = useState<CoreUiState>({
    connectionStatus: "checking",
    environment: "production",
    isReadOnly: true,
  });
  const [isConnectionRailOpen, setIsConnectionRailOpen] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [activeSection, setActiveSection] =
    useState<NavItemLabel>("Connections");
  const [selectedCollectionName, setSelectedCollectionName] = useState<
    string | null
  >(null);
  const [activeWorkspaceTab, setActiveWorkspaceTab] =
    useState<WorkspaceTabLabel>("Documents");
  const [activeInspectorTab, setActiveInspectorTab] =
    useState<InspectorTabLabel>("Schema");
  const [selectedInspectorDocument, setSelectedInspectorDocument] =
    useState<Record<string, unknown> | null>(null);
  const [schemaFields, setSchemaFields] = useState<SchemaFieldSummary[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(null);
  const [columnWidths, setColumnWidths] = useState({
    database: 320,
    inspector: 420,
    rail: 150,
  });

  const connectionsQuery = useQuery({
    queryKey: ["connections"],
    queryFn: async () => {
      if (!window.nexum) {
        throw new Error("Preload API is unavailable");
      }

      return window.nexum.connections.list();
    },
  });
  const connections = (connectionsQuery.data ?? []) as ConnectionProfile[];
  const selectedConnection =
    connections.find((connection) => connection.id === selectedConnectionId) ??
    null;

  useEffect(() => {
    const checkHealth = async () => {
      if (!window.nexum) {
        throw new Error("Preload API is unavailable");
      }

      return window.nexum.health.ping();
    };

    checkHealth()
      .then((result) => {
        setHealth({ status: "ready", timestamp: result.timestamp });
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Unknown error";

        setHealth({
          status: "error",
          message,
        });
        setToast({
          id: "health-check-failed",
          tone: "error",
          title: "Connection check failed",
          message,
        });
      });
  }, []);

  const connectionStatus: ConnectionStatus = selectedConnection
    ? mapConnectionStatus(selectedConnection.status)
    : health.status === "ready"
      ? "connected"
      : health.status === "error"
        ? "offline"
        : coreUiState.connectionStatus;
  const healthLabel =
    health.status === "ready"
      ? "85 ms"
      : health.status === "error"
        ? "offline"
        : "checking";
  const connectionStatusLabel =
    connectionStatus === "connected"
      ? selectedConnection?.status === "connected"
        ? "Connected"
        : "Ready"
      : connectionStatus === "offline"
        ? selectedConnection?.status === "error"
          ? "Error"
          : "Offline"
        : "Checking";
  const activeEnvironment = selectedConnection
    ? mapEnvironment(selectedConnection.environment)
    : coreUiState.environment;
  const activeReadOnly = selectedConnection
    ? selectedConnection.readOnly
    : coreUiState.isReadOnly;
  const isDatabaseConnected = selectedConnection?.status === "connected";
  const isExploreSection = activeSection === "Explore";
  const shouldShowDatabasePanel = isExploreSection && isDatabaseConnected;
  const shouldShowInspectorPanel = isExploreSection && isInspectorOpen;
  const visibleSelectedCollectionName = shouldShowDatabasePanel
    ? selectedCollectionName
    : null;
  const selectedCollectionPath = parseSelectedCollectionPath(
    visibleSelectedCollectionName,
  );
  const indexesQuery = useQuery({
    enabled:
      shouldShowInspectorPanel &&
      activeInspectorTab === "Indexes" &&
      Boolean(selectedConnectionId) &&
      selectedCollectionPath !== null,
    queryKey: [
      "indexes",
      selectedConnectionId,
      selectedCollectionPath?.database,
      selectedCollectionPath?.collection,
    ],
    queryFn: async () => {
      if (!window.nexum) {
        throw new Error("Preload API is unavailable");
      }

      if (typeof window.nexum.mongodb.listIndexes !== "function") {
        throw new Error(
          "Preload API is outdated. Restart Nexum and try again.",
        );
      }

      if (!selectedConnectionId || !selectedCollectionPath) {
        throw new Error("No collection selected");
      }

      return window.nexum.mongodb.listIndexes({
        collection: selectedCollectionPath.collection,
        connectionId: selectedConnectionId,
        database: selectedCollectionPath.database,
      });
    },
  });
  const indexRows = (indexesQuery.data ?? []) as IndexSummary[];
  const shellClassName = [
    "app-shell",
    isConnectionRailOpen ? "" : "is-connections-closed",
    shouldShowInspectorPanel ? "" : "is-inspector-closed",
    shouldShowDatabasePanel ? "" : "is-database-hidden",
  ]
    .filter(Boolean)
    .join(" ");
  const shellStyle = {
    "--database-panel-width": shouldShowDatabasePanel
      ? `${columnWidths.database}px`
      : "0px",
    "--inspector-panel-width": shouldShowInspectorPanel
      ? `${columnWidths.inspector}px`
      : "0px",
    "--rail-width": isConnectionRailOpen ? `${columnWidths.rail}px` : "0px",
  } as CSSProperties;
  const connectionListToast: ToastMessage | null = connectionsQuery.error
    ? {
        id: "connection-list-failed",
        tone: "error",
        title: "Load connections failed",
        message:
          connectionsQuery.error instanceof Error
            ? connectionsQuery.error.message
            : "Unknown error",
      }
    : null;
  const handleSectionChange = (section: NavItemLabel) => {
    setActiveSection(section);

    if (section !== "Explore") {
      setSelectedCollectionName(null);
      setSelectedInspectorDocument(null);
      setSchemaFields([]);
      return;
    }

    setSelectedConnectionId(
      (currentConnectionId) =>
        currentConnectionId ?? connections[0]?.id ?? null,
    );
  };
  const startColumnResize = (
    column: "database" | "inspector" | "rail",
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = columnWidths[column];
    const bounds = columnResizeBounds[column];
    const direction = column === "inspector" ? -1 : 1;

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const delta = (moveEvent.clientX - startX) * direction;
      const nextWidth = clamp(startWidth + delta, bounds.min, bounds.max);

      setColumnWidths((current) => ({
        ...current,
        [column]: nextWidth,
      }));
    };

    const handlePointerUp = () => {
      document.body.classList.remove("is-resizing-column");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    document.body.classList.add("is-resizing-column");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  };

  return (
    <main className={shellClassName} style={shellStyle}>
      {isConnectionRailOpen ? (
        <ConnectionRail
          activeSection={activeSection}
          connections={connections}
          onClose={() => setIsConnectionRailOpen(false)}
          onConnectionAdd={() => {
            setActiveSection("Connections");
            setSelectedConnectionId(null);
            setSelectedCollectionName(null);
            setSelectedInspectorDocument(null);
            setSchemaFields([]);
          }}
          onConnectionSelect={(connectionId) => {
            setActiveSection("Connections");
            setSelectedConnectionId(connectionId);
            setSelectedCollectionName(null);
            setSelectedInspectorDocument(null);
            setSchemaFields([]);
          }}
          onSectionChange={handleSectionChange}
          selectedConnectionId={selectedConnectionId}
        />
      ) : (
        <PanelRestoreButton
          direction="left"
          label="Open connections panel"
          onClick={() => setIsConnectionRailOpen(true)}
        />
      )}

      {isConnectionRailOpen ? (
        <ColumnResizeHandle
          label="Resize connections column"
          placement="rail"
          onPointerDown={(event) => startColumnResize("rail", event)}
        />
      ) : null}

      <TopBar
        connectionStatus={connectionStatus}
        connectionStatusLabel={connectionStatusLabel}
        environment={activeEnvironment}
        isReadOnly={activeReadOnly}
        onToggleInspector={() => setIsInspectorOpen((isOpen) => !isOpen)}
      />

      {shouldShowDatabasePanel ? (
        <DatabasePanel
          connectionId={selectedConnection.id}
          connectionName={selectedConnection.name}
          selectedCollectionName={visibleSelectedCollectionName}
          onCollectionSelect={(collectionName) => {
            setSelectedCollectionName(collectionName);
            setSelectedInspectorDocument(null);
            setSchemaFields([]);
          }}
        />
      ) : null}

      {shouldShowDatabasePanel ? (
        <ColumnResizeHandle
          label="Resize database column"
          placement="database"
          onPointerDown={(event) => startColumnResize("database", event)}
        />
      ) : null}

      <DocumentWorkspace
        activeSection={activeSection}
        activeWorkspaceTab={activeWorkspaceTab}
        connections={connections}
        isConnectionsLoading={connectionsQuery.isLoading}
        healthLabel={healthLabel}
        selectedConnectionId={selectedConnectionId}
        selectedCollectionName={visibleSelectedCollectionName}
        onConnectionError={(title, message) => {
          setToast({
            id: `${title}-${Date.now()}`,
            tone: "error",
            title,
            message,
          });
        }}
        onConnectionsChanged={() =>
          queryClient.invalidateQueries({ queryKey: ["connections"] })
        }
        onSelectedConnectionChange={(connectionId) => {
          setSelectedConnectionId(connectionId);
          setSelectedInspectorDocument(null);
          setSchemaFields([]);
        }}
        onCollectionClose={() => {
          setSelectedCollectionName(null);
          setSelectedInspectorDocument(null);
          setSchemaFields([]);
        }}
        onCollectionOpen={() => {
          if (shouldShowDatabasePanel) {
            setSelectedCollectionName("users");
            setSelectedInspectorDocument(null);
            setSchemaFields([]);
          }
        }}
        onSectionChange={handleSectionChange}
        onSchemaChange={setSchemaFields}
        onSelectedDocumentChange={setSelectedInspectorDocument}
        onWorkspaceTabChange={setActiveWorkspaceTab}
      />

      {shouldShowInspectorPanel ? (
        <InspectorPanel
          activeInspectorTab={activeInspectorTab}
          indexRows={indexRows}
          indexesError={
            indexesQuery.error instanceof Error
              ? indexesQuery.error.message
              : null
          }
          isIndexesLoading={indexesQuery.isLoading}
          onClose={() => setIsInspectorOpen(false)}
          onInspectorTabChange={setActiveInspectorTab}
          schemaFields={schemaFields}
          selectedDocument={selectedInspectorDocument}
        />
      ) : isExploreSection ? (
        <PanelRestoreButton
          direction="right"
          label="Open document inspector"
          onClick={() => setIsInspectorOpen(true)}
        />
      ) : null}

      {shouldShowInspectorPanel ? (
        <ColumnResizeHandle
          label="Resize inspector column"
          placement="inspector"
          onPointerDown={(event) => startColumnResize("inspector", event)}
        />
      ) : null}

      <ErrorToastSurface
        toast={toast ?? connectionListToast}
        onDismiss={() => {
          setToast(null);
          if (connectionListToast) {
            void connectionsQuery.refetch();
          }
        }}
      />
    </main>
  );
};

type ColumnResizeHandleProps = {
  label: string;
  placement: "database" | "inspector" | "rail";
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
};

const ColumnResizeHandle = ({
  label,
  placement,
  onPointerDown,
}: ColumnResizeHandleProps) => (
  <button
    aria-label={label}
    className={`column-resize-handle column-resize-${placement}`}
    onPointerDown={onPointerDown}
    type="button"
  />
);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const columnResizeBounds = {
  database: { max: 560, min: 220 },
  inspector: { max: 620, min: 300 },
  rail: { max: 280, min: 120 },
} as const;

const parseSelectedCollectionPath = (
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

const mapConnectionStatus = (
  status: ConnectionSummary["status"],
): ConnectionStatus =>
  status === "connected"
    ? "connected"
    : status === "checking"
      ? "checking"
      : "offline";

const mapEnvironment = (
  environment: ConnectionSummary["environment"],
): EnvironmentName => (environment === "development" ? "dev" : environment);
