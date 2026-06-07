import { Activity, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  ConnectionCreatePayload,
  ConnectionUpdatePayload,
} from "../../../ipc/validation";
import type { ConnectionProfile } from "../types";
import { Icon } from "./Icon";

type ConnectionManagerProps = {
  connections: ConnectionProfile[];
  isLoading: boolean;
  selectedConnectionId: string | null;
  onConnectionsChanged: () => Promise<void>;
  onError: (title: string, message: string) => void;
  onSelectedConnectionChange: (connectionId: string | null) => void;
};

type ConnectionFormState = {
  environment: ConnectionCreatePayload["environment"];
  name: string;
  readOnly: boolean;
  uri: string;
};

const defaultFormState: ConnectionFormState = {
  environment: "local",
  name: "",
  readOnly: true,
  uri: "",
};

const environments = [
  ["local", "Local"],
  ["development", "Dev"],
  ["staging", "Staging"],
  ["production", "Prod"],
] as const;

export const ConnectionManager = ({
  connections,
  isLoading,
  selectedConnectionId,
  onConnectionsChanged,
  onError,
  onSelectedConnectionChange,
}: ConnectionManagerProps) => {
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<ConnectionFormState>(defaultFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTestingDraft, setIsTestingDraft] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] =
    useState<ConnectionProfile | null>(null);
  const selectedConnection = useMemo(
    () =>
      connections.find(
        (connection) => connection.id === selectedConnectionId,
      ) ?? null,
    [connections, selectedConnectionId],
  );

  useEffect(() => {
    if (!deleteCandidate || isSubmitting) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDeleteCandidate(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [deleteCandidate, isSubmitting]);
  const normalizedName = form.name.trim();
  const normalizedUri = form.uri.trim();
  const canSave =
    normalizedName.length > 0 &&
    (formMode === "edit" || normalizedUri.length > 0);
  const canTestDraft = normalizedName.length > 0 && normalizedUri.length > 0;

  useEffect(() => {
    if (connections.length === 0 && selectedConnectionId !== null) {
      onSelectedConnectionChange(null);
      return;
    }

    if (
      selectedConnectionId !== null &&
      !connections.some((connection) => connection.id === selectedConnectionId)
    ) {
      onSelectedConnectionChange(null);
    }
  }, [connections, onSelectedConnectionChange, selectedConnectionId]);

  const resetForm = () => {
    setFormMode("create");
    setForm(defaultFormState);
    setNotice(null);
  };

  const startNewConnection = () => {
    onSelectedConnectionChange(null);
    resetForm();
  };

  const selectConnection = (connectionId: string) => {
    onSelectedConnectionChange(connectionId);
    resetForm();
  };

  const editSelectedConnection = () => {
    if (!selectedConnection) {
      return;
    }

    setFormMode("edit");
    setForm({
      environment: selectedConnection.environment,
      name: selectedConnection.name,
      readOnly: selectedConnection.readOnly,
      uri: "",
    });
    setNotice(null);
  };

  const runAction = async (
    title: string,
    action: () => Promise<string | null | undefined>,
  ) => {
    setIsSubmitting(true);
    setNotice(null);

    try {
      const message = await action();
      await onConnectionsChanged();
      setNotice(message ?? null);
    } catch (error) {
      onError(title, getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitForm = async () => {
    await runAction(
      formMode === "create" ? "Create connection failed" : "Update failed",
      async () => {
        if (formMode === "create") {
          const created = await window.nexum.connections.create({
            environment: form.environment,
            name: normalizedName,
            readOnly: form.readOnly,
            uri: normalizedUri,
          });
          onSelectedConnectionChange(created.id);
          resetForm();
          return "Connection saved";
        }

        if (!selectedConnection) {
          return null;
        }

        const patch: ConnectionUpdatePayload = {
          connectionId: selectedConnection.id,
          environment: form.environment,
          name: normalizedName,
          readOnly: form.readOnly,
          ...(normalizedUri ? { uri: normalizedUri } : {}),
        };
        await window.nexum.connections.update(patch);
        resetForm();
        return "Connection updated";
      },
    );
  };

  const testDraftConnection = async () => {
    setIsTestingDraft(true);
    setNotice(null);

    try {
      const result = await window.nexum.connections.testInput({
        environment: form.environment,
        name: normalizedName,
        readOnly: form.readOnly,
        uri: normalizedUri,
      });

      setNotice(
        result.ok
          ? `Ping succeeded${result.latencyMs ? ` in ${result.latencyMs} ms` : ""}`
          : result.message,
      );
    } catch (error) {
      onError("Test connection failed", getApiErrorMessage(error));
    } finally {
      setIsTestingDraft(false);
    }
  };

  const testSelectedConnection = async () => {
    if (!selectedConnection) {
      return;
    }

    await runAction("Test connection failed", async () => {
      const result = await window.nexum.connections.test({
        connectionId: selectedConnection.id,
      });

      return result.ok
        ? `Ping succeeded${result.latencyMs ? ` in ${result.latencyMs} ms` : ""}`
        : result.message;
    });
  };

  const connectSelectedConnection = async () => {
    if (!selectedConnection) {
      return;
    }

    await runAction("Connect failed", async () => {
      await window.nexum.connections.connect({
        connectionId: selectedConnection.id,
      });
      return "Connected";
    });
  };

  const disconnectSelectedConnection = async () => {
    if (!selectedConnection) {
      return;
    }

    await runAction("Disconnect failed", async () => {
      await window.nexum.connections.disconnect({
        connectionId: selectedConnection.id,
      });
      return "Disconnected";
    });
  };

  const deleteSelectedConnection = async () => {
    if (!deleteCandidate) {
      return;
    }

    await runAction("Delete failed", async () => {
      await window.nexum.connections.delete({
        connectionId: deleteCandidate.id,
      });
      setDeleteCandidate(null);
      onSelectedConnectionChange(null);
      resetForm();
      return "Connection deleted";
    });
  };

  return (
    <section className="connection-manager">
      <div className="connection-manager-list">
        <header className="connection-manager-header">
          <div className="connection-manager-title">
            <strong>Connections</strong>
          </div>
          <div className="connection-manager-tools">
            <button
              className="run-button compact"
              type="button"
              onClick={startNewConnection}
            >
              New
            </button>
            <button
              aria-label="Search connections"
              className="connection-icon-button"
              type="button"
            >
              <Icon name="search" />
            </button>
          </div>
        </header>

        <div className="connection-list-label">Saved profiles</div>
        <div className="connection-profile-list">
          {isLoading ? (
            <div className="connection-profile-empty">Loading</div>
          ) : connections.length === 0 ? (
            <div className="connection-profile-empty">No connections</div>
          ) : (
            connections.map((connection) => (
              <button
                className={`connection-profile-card ${
                  connection.id === selectedConnectionId ? "is-active" : ""
                }`}
                key={connection.id}
                onClick={() => selectConnection(connection.id)}
                type="button"
              >
                <span
                  className={`profile-status-dot status-${connection.status}`}
                />
                <span>
                  <strong>{connection.name}</strong>
                  <small>
                    {connection.pluginId} · {getEnvironmentLabel(connection.environment)}
                  </small>
                </span>
                <span className="connection-profile-meta">
                  <em className={`env-${connection.environment}`}>
                    {getEnvironmentLabel(connection.environment)}
                  </em>
                  {connection.readOnly ? <small>Read-only</small> : null}
                </span>
              </button>
            ))
          )}
        </div>

        <footer className="connection-list-footer">
          <span>{connections.length} profiles</span>
          <span>Sorted by name</span>
        </footer>
      </div>

      {selectedConnection && formMode !== "edit" ? (
        <article className="connection-form connection-detail-panel">
          <header className="connection-editor-header">
            <div className="connection-editor-title">
              <span
                className={`profile-status-dot status-${selectedConnection.status}`}
              />
              <h1>{selectedConnection.name}</h1>
              <span className="connection-plugin-pill">
                <Icon name="database" />
                MongoDB
              </span>
              <span
                className={`connection-env-pill env-${selectedConnection.environment}`}
              >
                {getEnvironmentLabel(selectedConnection.environment)}
              </span>
            </div>
            <div className="connection-form-actions">
              <button
                className="secondary-button connection-header-test-button"
                disabled={isSubmitting}
                onClick={() => void testSelectedConnection()}
                type="button"
              >
                <Activity aria-hidden="true" size={16} strokeWidth={2} />
                Test
              </button>
              <button
                aria-label="Delete connection"
                className="connection-delete-button"
                disabled={isSubmitting}
                onClick={() => setDeleteCandidate(selectedConnection)}
                type="button"
              >
                <Trash2 aria-hidden="true" size={16} strokeWidth={2} />
              </button>
            </div>
            <p>
              Last connected: recently <span aria-hidden="true">·</span>{" "}
              Version: 7.0.11
            </p>
          </header>

          <div className="connection-form-sections">
            <section className="connection-form-section">
              <div className="connection-section-title">
                <strong>Profile</strong>
              </div>
              <label className="field-row">
                <span>Name</span>
                <input readOnly value={selectedConnection.name} />
              </label>
            </section>

            <section className="connection-form-section">
              <div className="connection-section-title">
                <strong>Endpoint</strong>
              </div>
              <label className="field-row">
                <span>URI</span>
                <input readOnly value="Saved securely in Keychain" />
              </label>
            </section>

            <section className="connection-form-section">
              <div className="connection-section-title">
                <strong>Environment</strong>
                <span>Choose the target environment for this connection.</span>
              </div>
              <fieldset className="environment-selector">
                <legend>Environment</legend>
                <div>
                  {environments.map(([value, label]) => (
                    <button
                      aria-pressed={selectedConnection.environment === value}
                      className={
                        selectedConnection.environment === value
                          ? "is-active"
                          : ""
                      }
                      disabled
                      key={value}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </section>

            <section className="connection-form-section">
              <div className="connection-section-title">
                <strong>Safety</strong>
              </div>
              <label className="readonly-toggle">
                <span>
                  <strong>Read-only</strong>
                  <small>
                    {selectedConnection.readOnly
                      ? "When enabled, write operations are blocked."
                      : "Write operations are allowed."}
                  </small>
                </span>
                <input
                  checked={selectedConnection.readOnly}
                  readOnly
                  type="checkbox"
                />
              </label>
            </section>
          </div>

          <footer className="connection-form-footer">
            {selectedConnection.status === "connected" ? (
              <button
                className="secondary-button"
                disabled={isSubmitting}
                onClick={() => void disconnectSelectedConnection()}
                type="button"
              >
                Disconnect
              </button>
            ) : (
              <button
                className="secondary-button"
                disabled={isSubmitting}
                onClick={() => void connectSelectedConnection()}
                type="button"
              >
                Connect
              </button>
            )}
            <button
              className="run-button compact"
              type="button"
              onClick={editSelectedConnection}
            >
              Edit profile
            </button>
          </footer>

          <footer className="connection-editor-statusbar">
            <div>
              <span className="status-ok-mark">✓</span>
              <span>
                {notice ??
                  (selectedConnection.status === "connected"
                    ? "Connection healthy"
                    : getStatusLabel(selectedConnection.status))}
              </span>
            </div>
            {notice ? null : (
              <div>
                <span>Status: {getStatusLabel(selectedConnection.status)}</span>
                <span aria-hidden="true">·</span>
                <span>
                  Mode: {selectedConnection.readOnly ? "Read-only" : "Writable"}
                </span>
              </div>
            )}
          </footer>
        </article>
      ) : (
        <form
          className="connection-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submitForm();
          }}
        >
          <header className="connection-editor-header">
            <div className="connection-editor-title">
              <span className="profile-status-dot status-disconnected" />
              <h1>
                {formMode === "create"
                  ? "New MongoDB profile"
                  : `Edit ${selectedConnection?.name ?? "profile"}`}
              </h1>
              <span className="connection-plugin-pill">
                <Icon name="database" />
                MongoDB
              </span>
              <span className={`connection-env-pill env-${form.environment}`}>
                {getEnvironmentLabel(form.environment)}
              </span>
            </div>
            {selectedConnection ? (
              <div className="connection-form-actions">
                <button
                  className="plain-action danger"
                  disabled={isSubmitting}
                  onClick={() => setDeleteCandidate(selectedConnection)}
                  type="button"
                >
                  Delete
                </button>
              </div>
            ) : null}
            <p>
              {formMode === "create"
                ? "Create a saved profile and keep its secret on this device."
                : "Update profile metadata or replace the saved URI."}
            </p>
          </header>

          <div className="connection-form-sections">
            <section className="connection-form-section">
              <div className="connection-section-title">
                <strong>Profile</strong>
                <span>Saved locally on this device</span>
              </div>
              <label className="field-row">
                <span>Name</span>
                <input
                  autoComplete="off"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="MongoDB Production"
                  required
                  value={form.name}
                />
              </label>
            </section>

            <section className="connection-form-section">
              <div className="connection-section-title">
                <strong>Endpoint</strong>
                <span>Connection string is stored securely</span>
              </div>
              <label className="field-row">
                <span>URI</span>
                <input
                  autoComplete="off"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      uri: event.target.value,
                    }))
                  }
                  placeholder={
                    formMode === "edit"
                      ? "Leave blank to keep saved URI"
                      : "mongodb://localhost:27017/admin"
                  }
                  required={formMode === "create"}
                  type="text"
                  value={form.uri}
                />
              </label>
            </section>

            <section className="connection-form-section">
              <div className="connection-section-title">
                <strong>Environment</strong>
                <span>Used for badges and safety behavior</span>
              </div>
              <fieldset className="environment-selector">
                <legend>Environment</legend>
                <div>
                  {environments.map(([value, label]) => (
                    <button
                      aria-pressed={form.environment === value}
                      className={form.environment === value ? "is-active" : ""}
                      key={value}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          environment: value,
                          readOnly:
                            value === "production" ? true : current.readOnly,
                        }))
                      }
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </section>

            <section className="connection-form-section">
              <div className="connection-section-title">
                <strong>Safety</strong>
                <span>Default protection for write operations</span>
              </div>
              <label className="readonly-toggle">
                <span>
                  <strong>Read-only</strong>
                  <small>
                    {form.environment === "production"
                      ? "Production profiles default to read-only"
                      : form.readOnly
                        ? "Writes blocked"
                        : "Writes allowed"}
                  </small>
                </span>
                <input
                  checked={form.readOnly}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      readOnly: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
              </label>
            </section>
          </div>

          <footer className="connection-form-footer">
            <button
              className="secondary-button connection-action-button test-connection-button"
              disabled={isSubmitting || isTestingDraft || !canTestDraft}
              onClick={() => void testDraftConnection()}
              type="button"
            >
              <Activity aria-hidden="true" size={16} strokeWidth={2} />
              Test connection
            </button>
            <button
              className="run-button compact connection-action-button connection-save-button"
              disabled={isSubmitting || !canSave}
              type="submit"
            >
              Save
            </button>
          </footer>

          {selectedConnection ? (
            <div className="connection-runtime-actions">
              <button
                className="secondary-button"
                disabled={isSubmitting}
                onClick={() => void testSelectedConnection()}
                type="button"
              >
                Test saved
              </button>
              {selectedConnection.status === "connected" ? (
                <button
                  className="secondary-button"
                  disabled={isSubmitting}
                  onClick={() => void disconnectSelectedConnection()}
                  type="button"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  className="secondary-button"
                  disabled={isSubmitting}
                  onClick={() => void connectSelectedConnection()}
                  type="button"
                >
                  Connect
                </button>
              )}
            </div>
          ) : null}

          {notice ? <p className="connection-notice">{notice}</p> : null}
        </form>
      )}

      {deleteCandidate ? (
        <div
          aria-labelledby="delete-connection-title"
          aria-modal="true"
          className="confirm-overlay"
          role="dialog"
        >
          <div className="confirm-dialog">
            <div>
              <h2 id="delete-connection-title">
                Delete "{deleteCandidate.name}"?
              </h2>
              <p>
                This removes the saved profile and its secret from this device.
              </p>
            </div>
            <div className="confirm-dialog-actions">
              <button
                className="confirm-button cancel"
                disabled={isSubmitting}
                onClick={() => setDeleteCandidate(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="confirm-button ok"
                disabled={isSubmitting}
                onClick={() => void deleteSelectedConnection()}
                type="button"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};

const getApiErrorMessage = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return "Unknown error";
  }

  const code = (error as { code?: string }).code;

  if (code === "READ_ONLY_VIOLATION") {
    return "This connection is read-only. Disable read-only mode before writing.";
  }

  if (code === "WRITE_CONFIRMATION_REQUIRED") {
    return "Production writes require explicit confirmation.";
  }

  if (code === "CONNECTION_NOT_ACTIVE") {
    return "Connect to the profile and try again.";
  }

  if (code === "SECRET_NOT_FOUND") {
    return "The saved secret is missing. Edit the profile and save the URI again.";
  }

  if (code === "VALIDATION_FAILED") {
    return "Check the highlighted fields and try again.";
  }

  const details = (error as { details?: Record<string, unknown> }).details;
  const issues = Array.isArray(details?.issues) ? details.issues : [];
  const issueMessages = issues
    .map((issue) =>
      issue && typeof issue === "object" && "message" in issue
        ? String(issue.message)
        : null,
    )
    .filter((message): message is string => Boolean(message));

  return issueMessages[0] ?? error.message;
};

const getEnvironmentLabel = (
  environment: ConnectionProfile["environment"],
): string =>
  environments.find(([value]) => value === environment)?.[1] ?? environment;

const getStatusLabel = (status: ConnectionProfile["status"]): string =>
  status === "connected"
    ? "Connected"
    : status === "checking"
      ? "Checking"
      : status === "error"
        ? "Error"
        : "Disconnected";
