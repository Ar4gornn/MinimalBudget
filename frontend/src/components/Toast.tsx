import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Transient feedback, with undo.
 *
 * This exists because deletes used to be instant and irreversible: one mis-tap on a phone
 * destroyed an entry with no confirmation and no way back. A confirm dialog would fix the
 * accident at the cost of a second tap on every deliberate delete — the wrong trade for the
 * action people repeat most.
 *
 * Undo is the better shape. The delete happens immediately, so the common case stays one
 * tap, and the rare mistake is recoverable for as long as the toast is up. It also means
 * the server is the source of truth throughout — nothing is held back locally pretending to
 * be deleted.
 */

export interface ToastOptions {
  /** Shown as an "Undo" action while the toast is visible. */
  onUndo?: () => void | Promise<void>;
  tone?: "info" | "error";
  /** Milliseconds. Undoable toasts get longer, because you have to read them first. */
  duration?: number;
}

interface Toast extends ToastOptions {
  id: number;
  message: string;
}

interface ToastApi {
  show: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = nextId.current++;
      const duration = options.duration ?? (options.onUndo ? 7000 : 3000);
      setToasts((current) => [...current, { id, message, ...options }]);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* aria-live so the message reaches a screen reader without stealing focus. */}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone === "error" ? "toast-error" : ""}`}>
            <span>{toast.message}</span>
            {toast.onUndo && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  dismiss(toast.id);
                  void toast.onUndo?.();
                }}
              >
                Undo
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  // A no-op rather than a throw: feedback is not worth crashing a subtree over, and it
  // keeps components renderable in tests that do not care about toasts.
  return context ?? { show: () => undefined };
}
