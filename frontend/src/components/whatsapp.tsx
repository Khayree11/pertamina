"use client";

import { CheckCheck, MessageSquare, ShieldCheck } from "lucide-react";
import type { NotificationItem } from "@/lib/types";
import { fmtDayShort, fmtTime } from "@/lib/format";
import { cn } from "./ui";

/** Tampilan ponsel tiruan untuk notifikasi WhatsApp satu arah (SIMULASI). */
export function WhatsAppPhone({
  items,
  phone,
  title = "HBAC Notifikasi",
  className,
  limit = 8,
}: {
  items: NotificationItem[];
  phone?: string;
  title?: string;
  className?: string;
  limit?: number;
}) {
  const list = [...items].slice(0, limit).reverse();
  let lastDay = "";
  return (
    <div className={cn("mx-auto w-full max-w-sm overflow-hidden rounded-[2rem] border-[6px] border-ink-900 bg-ink-900 shadow-xl", className)}>
      <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
        <div className="grid size-9 place-items-center rounded-full bg-white/15">
          <ShieldCheck className="size-5" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-[11px] text-white/70">Akun bisnis · satu arah{phone ? ` · ke ${phone}` : ""}</p>
        </div>
        <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-ink-900">SIMULASI</span>
      </div>
      <div className="scrollbar-thin h-[420px] space-y-2 overflow-y-auto bg-[#e5ddd5] px-3 py-3" aria-live="polite">
        {list.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center text-xs text-slate-600">
            <MessageSquare className="mb-2 size-6 text-slate-500" />
            Belum ada pesan.
          </div>
        )}
        {list.map((n) => {
          const day = fmtDayShort(n.created_at);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <div key={n.id}>
              {showDay && (
                <div className="my-2 flex justify-center">
                  <span className="rounded-md bg-white/80 px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow-sm">{day}</span>
                </div>
              )}
              <div className="max-w-[88%] rounded-lg rounded-tl-none bg-white px-3 py-2 text-[13px] leading-snug text-slate-800 shadow-sm">
                <p className="whitespace-pre-line">{n.message}</p>
                <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-400">
                  {fmtTime(n.created_at)} <CheckCheck className="size-3 text-sky-500" />
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="bg-[#f0f0f0] px-4 py-2 text-center text-[11px] text-slate-500">
        Notifikasi satu arah — balasan tidak diproses. Tidak memuat nilai/diagnosis medis.
      </div>
    </div>
  );
}
