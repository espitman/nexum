import { useEffect, useState } from "react";
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
  ConnectionStatus,
  CoreUiState,
  HealthState,
  ToastMessage,
} from "./types";

export const App = () => {
  const [health, setHealth] = useState<HealthState>({ status: "loading" });
  const [coreUiState] = useState<CoreUiState>({
    connectionStatus: "checking",
    environment: "prod",
    isReadOnly: true,
  });
  const [isConnectionRailOpen, setIsConnectionRailOpen] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [activeSection, setActiveSection] =
    useState<NavItemLabel>("Connections");
  const [selectedCollectionName, setSelectedCollectionName] = useState<
    string | null
  >("users");
  const [activeWorkspaceTab, setActiveWorkspaceTab] =
    useState<WorkspaceTabLabel>("Documents");
  const [activeInspectorTab, setActiveInspectorTab] =
    useState<InspectorTabLabel>("Document");

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

  const connectionStatus: ConnectionStatus =
    health.status === "ready"
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
      ? "Connected"
      : connectionStatus === "offline"
        ? "Offline"
        : "Checking";
  const shellClassName = [
    "app-shell",
    isConnectionRailOpen ? "" : "is-connections-closed",
    isInspectorOpen ? "" : "is-inspector-closed",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main className={shellClassName}>
      {isConnectionRailOpen ? (
        <ConnectionRail
          activeSection={activeSection}
          onClose={() => setIsConnectionRailOpen(false)}
          onSectionChange={setActiveSection}
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
        environment={coreUiState.environment}
        isReadOnly={coreUiState.isReadOnly}
        onToggleInspector={() => setIsInspectorOpen((isOpen) => !isOpen)}
      />

      <DatabasePanel
        selectedCollectionName={selectedCollectionName}
        onCollectionSelect={setSelectedCollectionName}
        onSectionChange={setActiveSection}
      />

      <DocumentWorkspace
        activeSection={activeSection}
        activeWorkspaceTab={activeWorkspaceTab}
        health={health}
        healthLabel={healthLabel}
        selectedCollectionName={selectedCollectionName}
        onCollectionClose={() => setSelectedCollectionName(null)}
        onCollectionOpen={() => setSelectedCollectionName("users")}
        onSectionChange={setActiveSection}
        onWorkspaceTabChange={setActiveWorkspaceTab}
      />

      {isInspectorOpen ? (
        <InspectorPanel
          activeInspectorTab={activeInspectorTab}
          onClose={() => setIsInspectorOpen(false)}
          onInspectorTabChange={setActiveInspectorTab}
        />
      ) : (
        <PanelRestoreButton
          direction="right"
          label="Open document inspector"
          onClick={() => setIsInspectorOpen(true)}
        />
      )}

      <ErrorToastSurface toast={toast} onDismiss={() => setToast(null)} />
    </main>
  );
};
