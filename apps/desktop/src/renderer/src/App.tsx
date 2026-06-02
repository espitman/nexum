import { useEffect, useState } from "react";
import { ConnectionRail } from "./components/ConnectionRail";
import { DatabasePanel } from "./components/DatabasePanel";
import { DocumentWorkspace } from "./components/DocumentWorkspace";
import { InspectorPanel } from "./components/InspectorPanel";
import { PanelRestoreButton } from "./components/PanelRestoreButton";
import { TopBar } from "./components/TopBar";
import type {
  InspectorTabLabel,
  NavItemLabel,
  WorkspaceTabLabel,
} from "./mockData";
import type { HealthState } from "./types";

export const App = () => {
  const [health, setHealth] = useState<HealthState>({ status: "loading" });
  const [isConnectionRailOpen, setIsConnectionRailOpen] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
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
        setHealth({
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      });
  }, []);

  const healthLabel =
    health.status === "ready"
      ? "85 ms"
      : health.status === "error"
        ? "offline"
        : "checking";
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
    </main>
  );
};
