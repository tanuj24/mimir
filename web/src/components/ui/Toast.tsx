import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

type ToastKind = "success" | "error";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastCtx = createContext<{
  notify: (kind: ToastKind, message: string) => void;
}>({ notify: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const notify = useCallback(
    (kind: ToastKind, message: string) => {
      const id = ++counter;
      setToasts((t) => [...t, { id, kind, message }]);
      setTimeout(() => remove(id), 5000);
    },
    [remove],
  );

  return (
    <ToastCtx.Provider value={{ notify }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="card flex items-start gap-2 px-4 py-3 text-sm"
          >
            {t.kind === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            )}
            <span className="flex-1 break-words">{t.message}</span>
            <button onClick={() => remove(t.id)} className="text-ink-300 hover:text-ink-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
