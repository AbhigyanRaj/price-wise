import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface ToastOptions {
  message: string;
  /** Rendered in mono, so a price or delta lines up. */
  value?: string;
  tone?: "pos" | "neg" | "amber" | "neutral";
  /** When present the toast offers Undo. Awaited, so the button can show that
   *  it is working rather than appearing to do nothing. */
  onUndo?: () => void | Promise<void>;
}

interface Toast extends ToastOptions {
  id: number;
}

const DISMISS_MS = 4200;

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [undoing, setUndoing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const show = useCallback(
    (options: ToastOptions) => {
      clear();
      setUndoing(false);
      // One at a time. A stack of toasts over a queue the user is working
      // through turns into a wall covering the thing they are deciding on.
      setToast({ ...options, id: nextId.current++ });
      timer.current = setTimeout(() => setToast(null), DISMISS_MS);
    },
    [clear],
  );

  useEffect(() => clear, [clear]);

  const value = useMemo(() => show, [show]);

  async function handleUndo() {
    if (!toast?.onUndo) return;
    clear();
    setUndoing(true);
    try {
      await toast.onUndo();
    } finally {
      setToast(null);
    }
  }

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Polite: a confirmation should not interrupt whatever the user is
          reading next. The queue moves on without them. */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-50">
        {toast && (
          <div className="flex justify-center pb-[26px]">
            <div
              className={cn(
                "pw-toast pointer-events-auto flex items-center gap-2.5 rounded-toast border border-line3",
                "bg-raised px-3 py-2 shadow-[var(--sh-pop)]",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  toast.tone === "pos" && "bg-pos",
                  toast.tone === "neg" && "bg-neg",
                  toast.tone === "amber" && "bg-amber",
                  (!toast.tone || toast.tone === "neutral") && "bg-t4",
                )}
              />
              <span className="text-[12.5px] text-t1">{toast.message}</span>
              {toast.value && (
                <span className="tnum font-mono text-[12.5px] text-t0">{toast.value}</span>
              )}
              {toast.onUndo && (
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={undoing}
                  className="ml-1 rounded-sm px-1.5 py-0.5 text-[12px] font-medium text-acc-t2 transition-colors duration-[110ms] hover:bg-acc-a disabled:opacity-60"
                >
                  {undoing ? "Undoing" : "Undo"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): (options: ToastOptions) => void {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside a ToastProvider");
  return context;
}
