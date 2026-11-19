"use client";

import { CircleCheck, CircleAlert, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { cn } from "./ui";

type ToastItem = { id: number; tone: "success" | "error" | "info"; title: string; body?: string };
type ToastApi = {
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);
let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const remove = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (tone: ToastItem["tone"], title: string, body?: string) => {
      const id = ++counter;
      setItems((xs) => [...xs.slice(-3), { id, tone, title, body }]);
      setTimeout(() => remove(id), tone === "error" ? 7000 : 4500);
    },
    [remove],
  );
  const api = useMemo<ToastApi>(
    () => ({
      success: (t, b) => push("success", t, b),
      error: (t, b) => push("error", t, b),
      info: (t, b) => push("info", t, b),
    }),
    [push],
  );
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end">
        {items.map((t) => {
          const Icon = t.tone === "success" ? CircleCheck : t.tone === "error" ? CircleAlert : Info;
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                "animate-slide-up pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl bg-white p-3.5 shadow-lg ring-1",
                t.tone === "success" && "ring-emerald-200",
                t.tone === "error" && "ring-rose-200",
                t.tone === "info" && "ring-slate-200",
              )}
            >
              <Icon
                className={cn(
                  "mt-0.5 size-5 shrink-0",
                  t.tone === "success" && "text-emerald-600",
                  t.tone === "error" && "text-rose-600",
                  t.tone === "info" && "text-brand-600",
                )}
              />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-slate-900">{t.title}</p>
                {t.body && <p className="mt-0.5 text-slate-600">{t.body}</p>}
              </div>
              <button onClick={() => remove(t.id)} className="text-slate-400 hover:text-slate-600" aria-label="Tutup notifikasi">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast harus di dalam ToastProvider");
  return ctx;
}
