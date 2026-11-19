"use client";

import { ChevronDown, Download } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { MCU, McuTemplate } from "@/lib/types";
import { McuDetailsView } from "./mcu-intake";
import { AREA_ICON, VerificationBadge } from "./status";
import { Badge, cn } from "./ui";

export function McuCard({ m, current, actions }: { m: MCU; current?: boolean; actions?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { data: template } = useSWR<McuTemplate>(m.details ? "/api/mcu/template" : null, { revalidateOnFocus: false });
  const attention = Object.values(m.field_status ?? {}).filter((s) => s === "PERHATIAN").length;
  return (
    <div className={cn("rounded-xl border p-4", current ? "border-brand-200 bg-brand-50/30" : "border-slate-200 bg-white")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            MCU {fmtDate(m.mcu_date)}
            {current && (
              <Badge tone="brand" className="ml-2">
                Dipakai evaluasi
              </Badge>
            )}
          </p>
          <p className="text-xs text-slate-500">
            {m.provider || "—"} · {m.doctor_name || "dokter tidak dicatat"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <VerificationBadge status={m.verification_status} />
          {actions}
        </div>
      </div>
      {(m.extraction_label || attention > 0 || !!m.edited_fields?.length) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {m.extraction_label && <Badge tone="sky">{m.extraction_label}</Badge>}
          {attention > 0 && <Badge tone="amber">{attention} variabel perlu perhatian</Badge>}
          {!!m.edited_fields?.length && <Badge tone="rose">{m.edited_fields.length} variabel diubah dari hasil baca</Badge>}
        </div>
      )}
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs text-slate-500">Kesimpulan</p>
          <p className="font-semibold">{m.conclusion_label}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Berlaku s.d.</p>
          <p className={cn("font-semibold", m.expired && "text-rose-700")}>
            {fmtDate(m.valid_through)} {m.expired ? "(kedaluwarsa)" : `(${m.days_left} hari lagi)`}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Restriksi</p>
          {m.restricted_areas.length ? (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {m.restricted_areas.map((a) => {
                const Icon = AREA_ICON[a.code];
                return (
                  <Badge key={a.code} tone="amber" icon={<Icon className="size-3" />}>
                    {a.short}
                  </Badge>
                );
              })}
            </div>
          ) : (
            <p className="font-semibold">—</p>
          )}
        </div>
      </div>
      {m.summary && <p className="mt-3 rounded-lg bg-white/70 p-2.5 text-sm text-slate-600 ring-1 ring-slate-100">{m.summary}</p>}
      {m.details && (
        <button onClick={() => setOpen(!open)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
          <ChevronDown className={cn("size-3.5 transition", open && "rotate-180")} />
          {open ? "Sembunyikan" : "Lihat"} variabel MCU
        </button>
      )}
      {open && m.details && template && (
        <div className="mt-3">
          <McuDetailsView template={template} details={m.details} editedFields={m.edited_fields} extractedValues={m.extracted_values} />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {m.verified_by
            ? `${m.verification_status === "REJECTED" ? "Ditolak" : "Diverifikasi"} oleh ${m.verified_by} · ${fmtDateTime(m.verified_at)}${
                m.verification_note ? ` — “${m.verification_note}”` : ""
              }`
            : `Diinput ${fmtDateTime(m.created_at)}${m.entered_by ? ` oleh ${m.entered_by}` : ""}`}
        </span>
        {m.has_document && (
          <a
            href={`/api/files/mcu/${m.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline"
          >
            <Download className="size-3.5" /> {m.document_filename ?? "Dokumen"}
          </a>
        )}
      </div>
    </div>
  );
}
