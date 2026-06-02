import type { ToastMessage } from "../types";

type ErrorToastSurfaceProps = {
  toast: ToastMessage | null;
  onDismiss: () => void;
};

export const ErrorToastSurface = ({
  toast,
  onDismiss,
}: ErrorToastSurfaceProps) => {
  if (!toast) {
    return null;
  }

  return (
    <section className="toast-surface" aria-live="polite" aria-label="Alerts">
      <article className={`toast-card toast-${toast.tone}`}>
        <div>
          <strong>{toast.title}</strong>
          <p>{toast.message}</p>
        </div>
        <button type="button" aria-label="Dismiss alert" onClick={onDismiss}>
          ×
        </button>
      </article>
    </section>
  );
};
