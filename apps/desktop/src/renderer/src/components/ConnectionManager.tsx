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
  const selectedConnection = useMemo(
    () =>
      connections.find(
        (connection) => connection.id === selectedConnectionId,
      ) ?? null,
    [connections, selectedConnectionId],
  );
  const normalizedName = form.name.trim();
  const normalizedUri = form.uri.trim();
  const canSave =
    normalizedName.length > 0 &&
    (formMode === "edit" || normalizedUri.length > 0);
  const canTestDraft = normalizedName.length > 0 && normalizedUri.length > 0;

  useEffect(() => {
    if (connections.length === 0) {
      onSelectedConnectionChange(null);
      return;
    }

    if (
      selectedConnectionId === null ||
      !connections.some((connection) => connection.id === selectedConnectionId)
    ) {
      onSelectedConnectionChange(connections[0]?.id ?? null);
    }
  }, [connections, onSelectedConnectionChange, selectedConnectionId]);

  const resetForm = () => {
    setFormMode("create");
    setForm(defaultFormState);
    setNotice(null);
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
    if (!selectedConnection) {
      return;
    }

    const isConfirmed = window.confirm(
      `Delete "${selectedConnection.name}"? This removes the saved profile and its secret from this device.`,
    );

    if (!isConfirmed) {
      return;
    }

    await runAction("Delete failed", async () => {
      await window.nexum.connections.delete({
        connectionId: selectedConnection.id,
      });
      onSelectedConnectionChange(null);
      resetForm();
      return "Connection deleted";
    });
  };

  return (
    <section className="connection-manager">
      <div className="connection-manager-list">
        <header className="connection-manager-header">
          <strong>Connections</strong>
          <button
            className="run-button compact"
            type="button"
            onClick={resetForm}
          >
            New
          </button>
        </header>

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
                onClick={() => onSelectedConnectionChange(connection.id)}
                type="button"
              >
                <span
                  className={`profile-status-dot status-${connection.status}`}
                />
                <span>
                  <strong>{connection.name}</strong>
                  <small>
                    {connection.pluginId} · {connection.environment}
                  </small>
                </span>
                {connection.readOnly ? <em>RO</em> : null}
              </button>
            ))
          )}
        </div>
      </div>

      <form
        className="connection-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submitForm();
        }}
      >
        <header className="connection-form-header">
          <div>
            <span>
              {formMode === "create" ? "New profile" : "Edit profile"}
            </span>
            <strong>
              {formMode === "create" ? "MongoDB" : selectedConnection?.name}
            </strong>
          </div>
          {selectedConnection ? (
            <div className="connection-form-actions">
              <button
                className="plain-action"
                type="button"
                onClick={editSelectedConnection}
              >
                Edit
              </button>
              <button
                className="plain-action danger"
                disabled={isSubmitting}
                onClick={() => void deleteSelectedConnection()}
                type="button"
              >
                Delete
              </button>
            </div>
          ) : null}
        </header>

        <label className="field-row">
          <span>Name</span>
          <input
            autoComplete="off"
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="MongoDB Production"
            required
            value={form.name}
          />
        </label>

        <label className="field-row">
          <span>URI</span>
          <input
            autoComplete="off"
            onChange={(event) =>
              setForm((current) => ({ ...current, uri: event.target.value }))
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

        <fieldset className="environment-selector">
          <legend>Environment</legend>
          <div>
            {environments.map(([value, label]) => (
              <button
                aria-pressed={form.environment === value}
                className={form.environment === value ? "is-active" : ""}
                key={value}
                onClick={() =>
                  setForm((current) => ({ ...current, environment: value }))
                }
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="readonly-toggle">
          <span>
            <strong>Read-only</strong>
            <small>{form.readOnly ? "Writes blocked" : "Writes allowed"}</small>
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

        <footer className="connection-form-footer">
          <button
            className="secondary-button"
            disabled={isSubmitting || isTestingDraft || !canTestDraft}
            onClick={() => void testDraftConnection()}
            type="button"
          >
            <Icon name="indexes" />
            Test
          </button>
          <button
            className="run-button compact"
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
    </section>
  );
};

const getApiErrorMessage = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return "Unknown error";
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
