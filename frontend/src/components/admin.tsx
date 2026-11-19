"use client";

import { CircleCheck, CircleMinus, CircleX, KeyRound, OctagonX, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useMeta } from "@/lib/hooks";
import { durationLabel } from "@/lib/format";
import type { CardArea, Status } from "@/lib/types";
import { AREA_ICON, AREA_SHORT, STATUS_META, StatusBadge } from "./status";
import { useToast } from "./toast";
import { Alert, Button, Checkbox, Field, Modal, Textarea, cn } from "./ui";

const SEV: Record<Status, number> = { ALLOWED: 0, RESTRICTED: 1, NEEDS_REVIEW: 2, DENIED: 3 };

export type OverrideTarget = {
  employee: { id: number; full_name: string; employee_code: string };
  card: CardArea;
  kind?: "OVERRIDE" | "REVIEW_DECISION";
};

export function OverrideModal({ target, onClose, onDone }: { target: OverrideTarget | null; onClose: () => void; onDone?: () => void }) {
  const toast = useToast();
  const { data: meta } = useMeta();
  const maxH = meta?.settings.override_max_hours ?? 12;
  const defH = meta?.settings.override_default_hours ?? 4;
  const hardStops = meta?.settings.override_hard_stop_reasons ?? ["BP_VERY_HIGH", "MCU_UNFIT"];
  const [newStatus, setNewStatus] = useState<Status | null>("ALLOWED");
  const [minutes, setMinutes] = useState(defH * 60);
  const [kind, setKind] = useState<"OVERRIDE" | "REVIEW_DECISION">("OVERRIDE");
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const auto = (target?.card.auto_status ?? target?.card.status ?? "DENIED") as Status;
  const autoCodes = (target?.card.auto_reasons ?? []).map((r) => r.code);
  const hardStop = autoCodes.filter((c) => hardStops.includes(c));
  // Opsi terkunci: membuka akses saat hard stop, atau sama dengan status efektif saat ini.
  const isBlocked = (s: Status) => (SEV[s] < SEV[auto] && hardStop.length > 0) || s === target?.card.status;

  useEffect(() => {
    if (!target) return;
    setKind(target.kind ?? (target.card.status === "NEEDS_REVIEW" ? "REVIEW_DECISION" : "OVERRIDE"));
    const prefer: Status[] = target.card.status === "ALLOWED" ? ["DENIED", "RESTRICTED"] : ["ALLOWED", "RESTRICTED", "DENIED"];
    setNewStatus(prefer.find((s) => !isBlocked(s)) ?? null);
    setMinutes(defH * 60);
    setReason("");
    setAck(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, defH, hardStop.length]);

  const elevating = newStatus !== null && SEV[newStatus] < SEV[auto];
  const options = useMemo(() => [30, 60, 120, 240, 480, 720].filter((m) => m <= maxH * 60), [maxH]);

  if (!target) return null;
  const Icon = AREA_ICON[target.card.area.code];

  async function submit() {
    setError(null);
    if (!newStatus) return setError("Tidak ada perubahan status yang diizinkan untuk area ini.");
    if (reason.trim().length < 10) return setError("Alasan wajib diisi (minimal 10 karakter).");
    if (elevating && !ack) return setError("Centang konfirmasi risiko keselamatan untuk membuka akses.");
    setBusy(true);
    try {
      await api("/api/admin/overrides", {
        json: {
          employee_id: target!.employee.id,
          area_code: target!.card.area.code,
          new_status: newStatus,
          duration_minutes: minutes,
          reason: reason.trim(),
          kind,
          risk_acknowledged: ack,
        },
      });
      toast.success("Akses diperbarui", `${target!.card.area.label} → ${STATUS_META[newStatus].label} selama ${durationLabel(minutes)}.`);
      onDone?.();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      size="lg"
      title={
        <span className="inline-flex items-center gap-2">
          <KeyRound className="size-4 text-brand-600" /> Ubah akses area
        </span>
      }
      description={`${target.employee.full_name} · ${target.employee.employee_code}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={submit} loading={busy} disabled={!newStatus} variant={elevating ? "danger" : "primary"}>
            {!newStatus ? "Tidak ada perubahan yang diizinkan" : elevating ? "Buka akses sementara" : "Simpan perubahan"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <div className="grid size-9 place-items-center rounded-lg bg-white ring-1 ring-slate-200">
            <Icon className="size-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{target.card.area.label}</p>
            <p className="text-xs text-slate-500">
              Efektif: {target.card.status} · Otomatis: {auto}
              {target.card.source === "OVERRIDE" && " · ada override aktif (akan digantikan)"}
            </p>
          </div>
          <StatusBadge status={target.card.status} />
        </div>
        {target.card.auto_reasons.length > 0 && (
          <ul className="space-y-1 text-sm text-slate-600">
            {target.card.auto_reasons.map((r) => (
              <li key={r.code}>
                • {r.short} {r.detail && <span className="text-slate-400">— {r.detail}</span>}
              </li>
            ))}
          </ul>
        )}

        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Jenis</p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["REVIEW_DECISION", "Keputusan review", "Menyelesaikan NEEDS_REVIEW"],
                ["OVERRIDE", "Override admin", "Perubahan akses darurat/khusus"],
              ] as const
            ).map(([k, l, d]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left",
                  kind === k ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-slate-200",
                )}
              >
                <p className="text-sm font-semibold">{l}</p>
                <p className="text-xs text-slate-500">{d}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Status baru</p>
          <div className="grid grid-cols-3 gap-2">
            {(["ALLOWED", "RESTRICTED", "DENIED"] as Status[]).map((s) => {
              const m = STATUS_META[s];
              const SIcon = m.icon;
              const blocked = isBlocked(s);
              return (
                <button
                  key={s}
                  type="button"
                  disabled={blocked}
                  onClick={() => setNewStatus(s)}
                  aria-pressed={newStatus === s}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
                    newStatus === s ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  <SIcon className={cn("size-5", m.text)} />
                  {s}
                  <span className="text-[11px] font-medium text-slate-500">{m.label}</span>
                </button>
              );
            })}
          </div>
          {hardStop.length > 0 && (
            <Alert tone="danger" className="mt-3" title="Hard stop — akses tidak dapat dibuka lewat override">
              Status otomatis disebabkan kondisi yang harus ditangani tenaga medis ({hardStop.join(", ")}). Admin hanya dapat
              mempertahankan atau memperketat akses.
            </Alert>
          )}
        </div>

        <Field label="Masa berlaku" hint={`Override dibuat pendek: maksimal ${maxH} jam (aturan aktif). Setelah berakhir, status kembali otomatis.`}>
          <div className="flex flex-wrap gap-2">
            {options.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMinutes(m)}
                aria-pressed={minutes === m}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm font-semibold",
                  minutes === m ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600",
                )}
              >
                {durationLabel(m)}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Alasan" required hint="Wajib, minimal 10 karakter — tercatat permanen di audit log dan terlihat oleh pekerja.">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Mis. hasil review dr. perusahaan: kondisi stabil, izin dengan pendamping" />
        </Field>

        {elevating && hardStop.length === 0 && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-rose-800">
              <ShieldAlert className="size-4" /> Override ini MEMBUKA akses ke area berisiko
            </p>
            <Checkbox
              checked={ack}
              onChange={setAck}
              label="Saya memahami risiko keselamatan dan bertanggung jawab atas keputusan ini."
              description="Override dicabut otomatis jika kondisi pekerja memburuk (mis. input tensi baru lebih tinggi)."
            />
          </div>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Penjelasan keputusan */

const OUTCOME = {
  MATCHED: { label: "Cocok", icon: CircleCheck, cls: "text-rose-700 bg-rose-50 ring-rose-200" },
  NOT_MATCHED: { label: "Tidak cocok", icon: CircleMinus, cls: "text-slate-500 bg-slate-50 ring-slate-200" },
  UNCERTAIN: { label: "Tidak pasti", icon: OctagonX, cls: "text-violet-700 bg-violet-50 ring-violet-200" },
  DISABLED: { label: "Nonaktif", icon: CircleX, cls: "text-slate-400 bg-slate-50 ring-slate-200" },
} as const;

export function RuleTrace({ trace }: { trace: { rule_id: string; name: string; reason: string; outcome: keyof typeof OUTCOME; effects?: Record<string, Status>; error?: string }[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? trace : trace.filter((t) => t.outcome !== "NOT_MATCHED");
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {trace.filter((t) => t.outcome === "MATCHED").length} aturan cocok · {trace.filter((t) => t.outcome === "UNCERTAIN").length} tidak pasti
          · {trace.length} dievaluasi
        </p>
        <button onClick={() => setAll(!all)} className="text-xs font-semibold text-brand-700 hover:underline">
          {all ? "Sembunyikan yang tidak cocok" : "Tampilkan semua aturan"}
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Tidak ada aturan pembatas yang cocok — semua area ALLOWED.</p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((t) => {
            const o = OUTCOME[t.outcome] ?? OUTCOME.NOT_MATCHED;
            const OIcon = o.icon;
            return (
              <li key={t.rule_id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm">
                <span className="font-mono text-xs font-semibold text-slate-500">{t.rule_id}</span>
                <span className="min-w-0 flex-1 font-medium text-slate-800">{t.name}</span>
                <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1", o.cls)}>
                  <OIcon className="size-3" />
                  {o.label}
                </span>
                {t.effects && (
                  <span className="flex w-full flex-wrap gap-1 pl-9">
                    {Object.entries(t.effects).map(([a, s]) => {
                      const AIcon = AREA_ICON[a];
                      return (
                        <span key={a} className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset", STATUS_META[s].badge)}>
                          <AIcon className="size-3" /> {AREA_SHORT[a] ?? a}: {s}
                        </span>
                      );
                    })}
                  </span>
                )}
                {t.error && <span className="w-full pl-9 text-xs text-violet-700">Galat: {t.error}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function FactsTable({ facts, catalog }: { facts: Record<string, unknown>; catalog?: Record<string, { label: string }> }) {
  const fmt = (v: unknown) => {
    if (v === null || v === undefined) return <span className="text-violet-600">tidak ada (null)</span>;
    if (v === true) return "ya";
    if (v === false) return "tidak";
    if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
    return String(v);
  };
  return (
    <dl className="grid gap-x-6 gap-y-1.5 text-sm 2xl:grid-cols-2">
      {Object.entries(facts).map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-3 border-b border-dashed border-slate-100 py-1">
          <dt className="min-w-0 text-slate-500">
            <span className="block truncate">{catalog?.[k]?.label ?? k}</span>
            <span className="font-mono text-[10px] text-slate-400">{k}</span>
          </dt>
          <dd className="shrink-0 text-right font-semibold text-slate-800">{fmt(v)}</dd>
        </div>
      ))}
    </dl>
  );
}
