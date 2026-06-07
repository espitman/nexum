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
import { TopBar } from "./components/TopBar";
import type { NavItemLabel, WorkspaceTabLabel } from "./mockData";
import type {
  ConnectionProfile,
  ConnectionStatus,
  CoreUiState,
  EnvironmentName,
  HealthState,
  AppSettings,
  IndexSummary,
  SchemaFieldSummary,
  ToastMessage,
} from "./types";

const appSettingsStorageKey = "nexum.settings.v1";

export const App = () => {
  const queryClient = useQueryClient();
  const [health, setHealth] = useState<HealthState>({ status: "loading" });
  const [coreUiState] = useState<CoreUiState>({
    connectionStatus: "checking",
    environment: "production",
    isReadOnly: true,
  });
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [activeSection, setActiveSection] =
    useState<NavItemLabel>("Connections");
  const [selectedCollectionName, setSelectedCollectionName] = useState<
    string | null
  >(null);
  const [activeWorkspaceTab, setActiveWorkspaceTab] =
    useState<WorkspaceTabLabel>("Documents");
  const [, setSchemaFields] = useState<SchemaFieldSummary[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(null);
  const [settings, setSettings] = useState<AppSettings>(() =>
    readStoredAppSettings(),
  );
  const [columnWidths, setColumnWidths] = useState({
    database: 320,
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
  const visibleSelectedCollectionName = shouldShowDatabasePanel
    ? selectedCollectionName
    : null;
  const selectedCollectionPath = parseSelectedCollectionPath(
    visibleSelectedCollectionName,
  );
  const indexesQuery = useQuery({
    enabled:
      activeWorkspaceTab === "Indexes" &&
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
    shouldShowDatabasePanel ? "" : "is-database-hidden",
    `density-${settings.density}`,
    `appearance-${settings.appearance}`,
  ]
    .filter(Boolean)
    .join(" ");
  const shellStyle = {
    "--database-panel-width": shouldShowDatabasePanel
      ? `${columnWidths.database}px`
      : "0px",
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

    if (
      section !== "Explore" &&
      section !== "Queries" &&
      section !== "Bookmarks"
    ) {
      setSelectedCollectionName(null);
      setSchemaFields([]);
      return;
    }

    setSelectedConnectionId(
      (currentConnectionId) =>
        currentConnectionId ?? connections[0]?.id ?? null,
    );
  };
  const startColumnResize = (
    column: "database",
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = columnWidths[column];
    const bounds = columnResizeBounds[column];
    const direction = 1;

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
      <ConnectionRail
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
      />

      <TopBar
        collectionName={visibleSelectedCollectionName}
        connectionName={selectedConnection?.name ?? null}
        connectionStatus={connectionStatus}
        connectionStatusLabel={connectionStatusLabel}
        environment={activeEnvironment}
        isReadOnly={activeReadOnly}
      />

      {shouldShowDatabasePanel ? (
        <DatabasePanel
          connectionId={selectedConnection.id}
          connectionName={selectedConnection.name}
          selectedCollectionName={visibleSelectedCollectionName}
          onCollectionSelect={(collectionName) => {
            setSelectedCollectionName(collectionName);
            setActiveWorkspaceTab("Documents");
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
        indexRows={indexRows}
        indexesError={
          indexesQuery.error instanceof Error
            ? indexesQuery.error.message
            : null
        }
        settings={settings}
        selectedConnectionId={selectedConnectionId}
        selectedCollectionName={selectedCollectionName}
        isIndexesLoading={indexesQuery.isLoading}
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
          setSchemaFields([]);
        }}
        onSelectedCollectionChange={(collectionName) => {
          setSelectedCollectionName(collectionName);
          setSchemaFields([]);
        }}
        onCollectionClose={() => {
          setSelectedCollectionName(null);
          setSchemaFields([]);
        }}
        onCollectionOpen={() => {
          if (shouldShowDatabasePanel) {
            setSelectedCollectionName("users");
            setSchemaFields([]);
          }
        }}
        onSectionChange={handleSectionChange}
        onSchemaChange={setSchemaFields}
        onSettingsChange={(nextSettings) => {
          setSettings(nextSettings);
          writeStoredAppSettings(nextSettings);
        }}
        onWorkspaceTabChange={setActiveWorkspaceTab}
      />

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
  placement: "database";
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

const defaultAppSettings: AppSettings = {
  appearance: "light",
  density: "comfortable",
  localData: {
    keepAuditLogDays: 30,
    metadataCache: "persistent",
  },
  query: {
    defaultPageSize: 50,
    maxSampleSize: 100,
    timeoutMs: 15_000,
  },
  safety: {
    confirmProductionWrites: true,
    defaultReadOnly: true,
  },
};

const readStoredAppSettings = (): AppSettings => {
  try {
    const rawValue = window.localStorage.getItem(appSettingsStorageKey);

    if (!rawValue) {
      return defaultAppSettings;
    }

    return normalizeAppSettings(JSON.parse(rawValue));
  } catch {
    return defaultAppSettings;
  }
};

const writeStoredAppSettings = (settings: AppSettings) => {
  try {
    window.localStorage.setItem(appSettingsStorageKey, JSON.stringify(settings));
  } catch {
    // Local settings are best-effort and should never prevent the app shell.
  }
};

const normalizeAppSettings = (value: unknown): AppSettings => {
  const settings = value as Partial<AppSettings>;
  const appearance =
    settings.appearance === "system" ||
    settings.appearance === "light" ||
    settings.appearance === "dark"
      ? settings.appearance
      : defaultAppSettings.appearance;
  const density =
    settings.density === "comfortable" || settings.density === "compact"
      ? settings.density
      : defaultAppSettings.density;
  const query = settings.query ?? ({} as Partial<AppSettings["query"]>);
  const safety = settings.safety ?? ({} as Partial<AppSettings["safety"]>);
  const localData =
    settings.localData ?? ({} as Partial<AppSettings["localData"]>);

  return {
    appearance,
    density,
    localData: {
      keepAuditLogDays: clampSettingNumber(
        localData.keepAuditLogDays,
        1,
        365,
        defaultAppSettings.localData.keepAuditLogDays,
      ),
      metadataCache:
        localData.metadataCache === "session" ||
        localData.metadataCache === "persistent"
          ? localData.metadataCache
          : defaultAppSettings.localData.metadataCache,
    },
    query: {
      defaultPageSize: clampSettingNumber(
        query.defaultPageSize,
        1,
        500,
        defaultAppSettings.query.defaultPageSize,
      ),
      maxSampleSize: clampSettingNumber(
        query.maxSampleSize,
        10,
        1_000,
        defaultAppSettings.query.maxSampleSize,
      ),
      timeoutMs: clampSettingNumber(
        query.timeoutMs,
        1_000,
        120_000,
        defaultAppSettings.query.timeoutMs,
      ),
    },
    safety: {
      confirmProductionWrites:
        typeof safety.confirmProductionWrites === "boolean"
          ? safety.confirmProductionWrites
          : defaultAppSettings.safety.confirmProductionWrites,
      defaultReadOnly:
        typeof safety.defaultReadOnly === "boolean"
          ? safety.defaultReadOnly
          : defaultAppSettings.safety.defaultReadOnly,
    },
  };
};

const clampSettingNumber = (
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return clamp(Math.round(value), min, max);
};
