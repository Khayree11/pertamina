"use client";

import { Clock, Nfc, UserCog } from "lucide-react";
import type { CardArea, EmployeeBasic } from "@/lib/types";
import { fmtDateTime, fmtTime, initials } from "@/lib/format";
import { PatraNiagaLogo } from "./brand";
import { AREA_ICON, STATUS_META, SourceBadge, StatusBadge, TapBadge } from "./status";
import { cn } from "./ui";

export function AreaTile({ item, admin = false, action }: { item: CardArea; admin?: boolean; action?: React.ReactNode }) {
  const m = STATUS_META[item.status];
  const Icon = AREA_ICON[item.area.code];
  const StatusIcon = m.icon;
  const ov = item.override;
  return (
    <div className={cn("flex flex-col rounded-2xl border p-4 shadow-sm", m.tile)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200">
            <Icon className="size-[18px]" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-900">{item.area.label}</p>
            <p className="text-[11px] text-slate-500">{item.area.risk}</p>
          </div>
        </div>
        <div className={cn("grid size-8 shrink-0 place-items-center rounded-full", m.iconCls)}>
          <StatusIcon className="size-4" />
        </div>
      </div>

      <div className="mt-4">
        <p className={cn("text-xl leading-tight font-extrabold tracking-tight [overflow-wrap:anywhere]", m.text)}>{item.status}</p>
        <p className="text-xs font-medium text-slate-600">{m.label}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <SourceBadge source={item.source} />
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
          Di pintu: <TapBadge result={item.tap_preview} />
        </span>
      </div>

      <ul className="mt-3 space-y-1 text-[13px] text-slate-700">
        {item.reasons.map((r) => (
          <li key={r.code} className="flex gap-2">
            <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", m.dot)} />
            <span>
              {r.short}
              {admin && r.detail && <span className="block text-xs text-slate-500">{r.detail}</span>}
              {admin && <span className="ml-1 font-mono text-[10px] text-slate-400">{r.code}</span>}
            </span>
          </li>
        ))}
      </ul>

      {ov && (
        <div className="mt-3 rounded-xl bg-ink-900 p-3 text-xs text-slate-200">
          <p className="flex items-center gap-1.5 font-semibold text-amber-300">
            <UserCog className="size-3.5" /> {ov.kind_label} oleh {ov.admin_name}
          </p>
          <p className="mt-1 leading-relaxed text-slate-300">“{ov.reason}”</p>
          <p className="mt-1.5 text-slate-400">
            Status otomatis di baliknya: <span className="font-semibold text-white">{item.auto_status}</span> · berakhir{" "}
            {fmtTime(ov.valid_until)} WIB
          </p>
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" />
          {item.valid_until ? `Berlaku s.d. ${fmtDateTime(item.valid_until)}` : "Tidak berlaku"}
        </span>
        {action}
      </div>
    </div>
  );
}

export function VirtualCard({ employee, card, className }: { employee: EmployeeBasic; card: CardArea[]; className?: string }) {
  return (
    <div className={cn("self-start overflow-hidden rounded-2xl bg-ink-900 p-5 text-white shadow-sm", className)}>
      <div className="flex items-start justify-between">
        <div>
          <PatraNiagaLogo className="h-7" />
          <p className="mt-2 text-xs text-slate-400">Kartu akses pekerja</p>
        </div>
        <Nfc className="size-6 text-slate-500" />
      </div>
      <div className="mt-5 flex items-center gap-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-brand-700 text-lg font-bold text-white">
          {initials(employee.full_name)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">{employee.full_name}</p>
          <p className="truncate text-sm text-slate-300">
            {employee.position} · {employee.unit}
          </p>
          <p className="mt-0.5 font-mono text-xs text-slate-400">
            {employee.employee_code} · {employee.card_number}
          </p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-4 gap-2">
        {card.map((c) => {
          const Icon = AREA_ICON[c.area.code];
          const m = STATUS_META[c.status];
          return (
            <div key={c.area.code} className="rounded-xl bg-white/5 p-2 text-center ring-1 ring-white/10">
              <Icon className="mx-auto size-4 text-slate-300" />
              <p className="mt-1 truncate text-[10px] text-slate-400">{c.area.short}</p>
              <span className={cn("mx-auto mt-1 block h-1.5 w-8 rounded-full", m.dot)} />
              <p className="mt-1 truncate text-[10px] font-semibold text-slate-200">{m.label}</p>
            </div>
          );
        })}
      </div>
      {!employee.card_active && (
        <p className="mt-3 rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-200">Kartu dinonaktifkan admin</p>
      )}
    </div>
  );
}

export function CompactAreaRow({ card }: { card: CardArea[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {card.map((c) => {
        const Icon = AREA_ICON[c.area.code];
        return (
          <div key={c.area.code} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-700">
              <Icon className="size-4 shrink-0 text-slate-400" />
              <span className="truncate">{c.area.short}</span>
            </span>
            <StatusBadge status={c.status} />
          </div>
        );
      })}
    </div>
  );
}
