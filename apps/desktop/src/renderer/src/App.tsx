import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [activeSection, setActiveSection] =
    useState<NavItemLabel>("Connections");
  const [selectedCollectionName, setSelectedCollectionName] = useState<
    string | null
  >(null);
  const [activeWorkspaceTab, setActiveWorkspaceTab] =
    useState<WorkspaceTabLabel>("Documents");
  const [activeInspectorTab, setActiveInspectorTab] =
    useState<InspectorTabLabel>("Document");
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(null);

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
  const shellClassName = [
    "app-shell",
    isConnectionRailOpen ? "" : "is-connections-closed",
    shouldShowInspectorPanel ? "" : "is-inspector-closed",
    shouldShowDatabasePanel ? "" : "is-database-hidden",
  ]
    .filter(Boolean)
    .join(" ");
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
      return;
    }

    setSelectedConnectionId(
      (currentConnectionId) =>
        currentConnectionId ?? connections[0]?.id ?? null,
    );
  };

  return (
    <main className={shellClassName}>
      {isConnectionRailOpen ? (
        <ConnectionRail
          activeSection={activeSection}
          connections={connections}
          onClose={() => setIsConnectionRailOpen(false)}
          onConnectionAdd={() => {
            setActiveSection("Connections");
            setSelectedConnectionId(null);
            setSelectedCollectionName(null);
          }}
          onConnectionSelect={(connectionId) => {
            setActiveSection("Connections");
            setSelectedConnectionId(connectionId);
            setSelectedCollectionName(null);
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

      <TopBar
        connectionStatus={connectionStatus}
        connectionStatusLabel={connectionStatusLabel}
        environment={activeEnvironment}
        isReadOnly={activeReadOnly}
        onToggleInspector={() => setIsInspectorOpen((isOpen) => !isOpen)}
      />

      {shouldShowDatabasePanel ? (
        <DatabasePanel
          selectedCollectionName={visibleSelectedCollectionName}
          onCollectionSelect={setSelectedCollectionName}
          onSectionChange={setActiveSection}
        />
      ) : null}

      <DocumentWorkspace
        activeSection={activeSection}
        activeWorkspaceTab={activeWorkspaceTab}
        connections={connections}
        isConnectionsLoading={connectionsQuery.isLoading}
        health={health}
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
        onSelectedConnectionChange={setSelectedConnectionId}
        onCollectionClose={() => setSelectedCollectionName(null)}
        onCollectionOpen={() => {
          if (shouldShowDatabasePanel) {
            setSelectedCollectionName("users");
          }
        }}
        onSectionChange={handleSectionChange}
        onWorkspaceTabChange={setActiveWorkspaceTab}
      />

      {shouldShowInspectorPanel ? (
        <InspectorPanel
          activeInspectorTab={activeInspectorTab}
          onClose={() => setIsInspectorOpen(false)}
          onInspectorTabChange={setActiveInspectorTab}
        />
      ) : isExploreSection ? (
        <PanelRestoreButton
          direction="right"
          label="Open document inspector"
          onClick={() => setIsInspectorOpen(true)}
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
