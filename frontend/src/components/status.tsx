"use client";

import {
  Building2,
  Flame,
  Fuel,
  Mountain,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestionMark,
  ShieldX,
  Snowflake,
  UserCog,
  Cpu,
  Timer,
  type LucideIcon,
} from "lucide-react";
import type { Status, TapResult } from "@/lib/types";
import { cn } from "./ui";

export const STATUS_META: Record<
  Status,
  { label: string; icon: LucideIcon; badge: string; tile: string; iconCls: string; dot: string; solid: string; text: string }
> = {
  ALLOWED: {
    label: "Diizinkan",
    icon: ShieldCheck,
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/25",
    tile: "border-emerald-200 bg-emerald-50/50",
    iconCls: "bg-emerald-600 text-white",
    dot: "bg-emerald-500",
    solid: "bg-emerald-600",
    text: "text-emerald-700",
  },
  RESTRICTED: {
    label: "Terbatas",
    icon: ShieldAlert,
    badge: "bg-amber-50 text-amber-800 ring-amber-600/30",
    tile: "border-amber-200 bg-amber-50/50",
    iconCls: "bg-amber-500 text-white",
    dot: "bg-amber-500",
    solid: "bg-amber-500",
    text: "text-amber-700",
  },
  NEEDS_REVIEW: {
    label: "Perlu Review",
    icon: ShieldQuestionMark,
    badge: "bg-violet-50 text-violet-700 ring-violet-600/25",
    tile: "border-violet-200 bg-violet-50/50",
    iconCls: "bg-violet-600 text-white",
    dot: "bg-violet-500",
    solid: "bg-violet-500",
    text: "text-violet-700",
  },
  DENIED: {
    label: "Ditolak",
    icon: ShieldX,
    badge: "bg-rose-50 text-rose-700 ring-rose-600/25",
    tile: "border-rose-200 bg-rose-50/50",
    iconCls: "bg-rose-600 text-white",
    dot: "bg-rose-500",
    solid: "bg-rose-500",
    text: "text-rose-700",
  },
};

export const STATUS_ORDER: Status[] = ["ALLOWED", "RESTRICTED", "NEEDS_REVIEW", "DENIED"];

export const TAP_META: Record<TapResult, { label: string; panel: string; badge: string; icon: LucideIcon }> = {
  GRANTED: {
    label: "Akses diberikan",
    panel: "bg-emerald-600",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/25",
    icon: ShieldCheck,
  },
  TEMPORARY: {
    label: "Akses sementara",
    panel: "bg-amber-500",
    badge: "bg-amber-50 text-amber-800 ring-amber-600/30",
    icon: Timer,
  },
  DENIED: {
    label: "Akses ditolak",
    panel: "bg-rose-600",
    badge: "bg-rose-50 text-rose-700 ring-rose-600/25",
    icon: ShieldX,
  },
};

export const AREA_ICON: Record<string, LucideIcon> = {
  COLD: Snowflake,
  HOT: Flame,
  HEIGHT: Mountain,
  RESTRICTED_GAS: Fuel,
  GENERAL: Building2,
};

export const AREA_SHORT: Record<string, string> = {
  COLD: "Dingin",
  HOT: "Panas",
  HEIGHT: "Ketinggian",
  RESTRICTED_GAS: "Gas/BBM",
  GENERAL: "Umum",
};

export const AREA_ORDER = ["COLD", "HOT", "HEIGHT", "RESTRICTED_GAS"] as const;

export function StatusBadge({ status, showCode = false, className }: { status: Status; showCode?: boolean; className?: string }) {
  const m = STATUS_META[status] ?? STATUS_META.DENIED;
  const Icon = m.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset",
        m.badge,
        className,
      )}
      title={status}
    >
      <Icon className="size-3.5" aria-hidden />
      {showCode ? status : m.label}
    </span>
  );
}

export function TapBadge({ result, className }: { result: TapResult; className?: string }) {
  const m = TAP_META[result] ?? TAP_META.DENIED;
  const Icon = m.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ring-1 ring-inset", m.badge, className)}>
      <Icon className="size-3.5" aria-hidden />
      {result}
    </span>
  );
}

export function AreaIcon({ code, className }: { code: string; className?: string }) {
  const Icon = AREA_ICON[code] ?? Building2;
  return <Icon className={cn("size-4", className)} aria-hidden />;
}

export function SourceBadge({ source }: { source: "AUTO" | "OVERRIDE" }) {
  return source === "OVERRIDE" ? (
    <span className="inline-flex items-center gap-1 rounded-md bg-ink-900 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-amber-300 uppercase">
      <UserCog className="size-3" aria-hidden /> Override admin
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-slate-600 uppercase">
      <Cpu className="size-3" aria-hidden /> Otomatis
    </span>
  );
}

/** Deretan 4 chip area (untuk tabel). */
export function AreaChips({
  areas,
  compact = false,
}: {
  areas: Record<string, { status: Status; source: string }>;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {AREA_ORDER.map((a) => {
        const v = areas[a];
        if (!v) return null;
        const m = STATUS_META[v.status];
        return (
          <span
            key={a}
            title={`${AREA_SHORT[a]}: ${m.label}${v.source === "OVERRIDE" ? " (override)" : ""}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
              m.badge,
              v.source === "OVERRIDE" && "outline-2 outline-offset-1 outline-amber-400 outline-dashed",
            )}
          >
            <AreaIcon code={a} className="size-3" />
            {compact ? m.label.split(" ")[0] : `${AREA_SHORT[a]}`}
          </span>
        );
      })}
    </div>
  );
}

export function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
      {STATUS_ORDER.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-sm", STATUS_META[s].dot)} />
          {s} · {STATUS_META[s].label}
        </span>
      ))}
    </div>
  );
}

export function VerificationBadge({ status }: { status: "UNVERIFIED" | "VERIFIED" | "REJECTED" }) {
  if (status === "VERIFIED")
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20 ring-inset">
        Terverifikasi
      </span>
    );
  if (status === "REJECTED")
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-600/20 ring-inset">
        Ditolak
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-600/25 ring-inset">
      Menunggu verifikasi
    </span>
  );
}
