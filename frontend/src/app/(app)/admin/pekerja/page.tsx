"use client";

import { ChevronRight, KeyRound, Search, Siren, Users } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import useSWR from "swr";
import { AreaChips, AREA_SHORT, StatusLegend } from "@/components/status";
import { Badge, Card, EmptyState, Input, PageHeader, PageLoader, Select, Table, cn, td, th } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import type { BPRecord, Status } from "@/lib/types";

type WorkerRow = {
  id: number;
  employee_code: string;
  full_name: string;
  position: string;
  unit: string;
  card_number: string;
  card_active: boolean;
  registration_source?: string;
  profile_completed?: boolean;
  bp_today: { submitted: boolean; count: number; latest: BPRecord | null };
  areas: Record<string, { status: Status; source: string; valid_until: string | null }>;
  urgent: boolean;
  urgent_acknowledged: boolean;
  mcu: { status: "VALID" | "EXPIRED" | "MISSING" | "UNVERIFIED"; mcu_date: string | null; valid_through: string | null };
  pending_verifications: number;
  active_overrides: number;
};

const MCU_BADGE = {
  VALID: { tone: "emerald", label: "Berlaku" },
  EXPIRED: { tone: "rose", label: "Kedaluwarsa" },
  MISSING: { tone: "slate", label: "Belum ada" },
  UNVERIFIED: { tone: "amber", label: "Menunggu verifikasi" },
} as const;

function WorkersInner() {
  const sp = useSearchParams();
  const [q, setQ] = useState("");
  const [unit, setUnit] = useState("");
  const [screening, setScreening] = useState(sp.get("screening") ?? "");
  const [area, setArea] = useState("");
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [flag, setFlag] = useState(sp.get("flag") ?? "");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const params = new URLSearchParams({ q: debounced, unit, screening, area, status, flag }).toString();
  const { data, isLoading } = useSWR<{ items: WorkerRow[]; units: string[]; total: number }>(`/api/admin/employees?${params}`, {
    keepPreviousData: true,
    refreshInterval: 30_000,
  });

  return (
    <div>
      <PageHeader
        eyebrow="Monitoring"
        title="Daftar Pekerja"
        description="Status screening hari ini dan status kartu per area untuk seluruh pekerja."
        actions={<StatusLegend />}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, ID, kartu…" className="pl-9" aria-label="Cari pekerja" />
        </div>
        <Select value={unit} onChange={(e) => setUnit(e.target.value)} className="w-auto" aria-label="Unit">
          <option value="">Semua unit</option>
          {data?.units.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </Select>
        <Select value={screening} onChange={(e) => setScreening(e.target.value)} className="w-auto" aria-label="Screening">
          <option value="">Screening: semua</option>
          <option value="submitted">Sudah input hari ini</option>
          <option value="missing">Belum input hari ini</option>
        </Select>
        <Select value={area} onChange={(e) => setArea(e.target.value)} className="w-auto" aria-label="Area">
          <option value="">Area: semua</option>
          {Object.entries(AREA_SHORT)
            .filter(([k]) => k !== "GENERAL")
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto" aria-label="Status">
          <option value="">Status: semua</option>
          <option value="ALLOWED">ALLOWED</option>
          <option value="RESTRICTED">RESTRICTED</option>
          <option value="NEEDS_REVIEW">NEEDS_REVIEW</option>
          <option value="DENIED">DENIED</option>
        </Select>
        <Select value={flag} onChange={(e) => setFlag(e.target.value)} className="w-auto" aria-label="Tanda">
          <option value="">Tanda: semua</option>
          <option value="urgent">Flag review segera</option>
          <option value="override">Ada override aktif</option>
          <option value="pending">Menunggu verifikasi</option>
        </Select>
      </div>

      <Card className={cn("overflow-hidden transition-opacity", isLoading && data && "opacity-60")}>
        {!data ? (
          <PageLoader />
        ) : data.items.length === 0 ? (
          <EmptyState icon={<Users className="size-6" />} title="Tidak ada pekerja yang cocok dengan filter" />
        ) : (
          <Table>
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>Pekerja</th>
                <th className={th}>Tensi hari ini</th>
                <th className={th}>Status kartu per area</th>
                <th className={th}>MCU</th>
                <th className={th}>Tanda</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((r) => {
                const mb = MCU_BADGE[r.mcu.status];
                return (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className={td}>
                      <Link href={`/admin/pekerja/${r.id}`} className="block min-w-44">
                        <span className="block font-semibold text-slate-900 hover:text-brand-700">{r.full_name}</span>
                        <span className="block text-xs text-slate-500">
                          <span className="font-mono">{r.employee_code}</span> · {r.unit}
                        </span>
                      </Link>
                    </td>
                    <td className={cn(td, "whitespace-nowrap")}>
                      {r.bp_today.submitted && r.bp_today.latest ? (
                        <span>
                          <span className={cn("tabular font-semibold", (r.bp_today.latest.systolic >= 140 || r.bp_today.latest.diastolic >= 90) ? "text-rose-700" : "text-slate-900")}>
                            {r.bp_today.latest.systolic}/{r.bp_today.latest.diastolic}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {fmtTime(r.bp_today.latest.measured_at)} · {r.bp_today.count}×
                          </span>
                        </span>
                      ) : (
                        <Badge tone="rose">Belum input</Badge>
                      )}
                    </td>
                    <td className={td}>
                      <AreaChips areas={r.areas} />
                    </td>
                    <td className={td}>
                      <Badge tone={mb.tone}>{mb.label}</Badge>
                    </td>
                    <td className={td}>
                      <div className="flex flex-wrap gap-1">
                        {r.urgent && (
                          <Badge tone={r.urgent_acknowledged ? "slate" : "rose"} icon={<Siren className="size-3" />}>
                            {r.urgent_acknowledged ? "Segera (ditangani)" : "Segera"}
                          </Badge>
                        )}
                        {r.active_overrides > 0 && (
                          <Badge tone="dark" icon={<KeyRound className="size-3" />}>
                            Override {r.active_overrides}
                          </Badge>
                        )}
                        {r.pending_verifications > 0 && <Badge tone="amber">Verifikasi {r.pending_verifications}</Badge>}
                        {!r.card_active && <Badge tone="rose">Kartu nonaktif</Badge>}
                        {r.registration_source === "SELF" && <Badge tone="sky">Daftar mandiri</Badge>}
                        {r.profile_completed === false && <Badge tone="amber">Profil belum lengkap</Badge>}
                      </div>
                    </td>
                    <td className={cn(td, "text-right")}>
                      <Link href={`/admin/pekerja/${r.id}`} className="inline-flex items-center text-slate-400 hover:text-brand-700" aria-label={`Detail ${r.full_name}`}>
                        <ChevronRight className="size-5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {data && (
        <p className="mt-2 text-xs text-slate-500">
          Menampilkan {data.items.length} dari {data.total} pekerja. Garis putus-putus kuning pada chip = status dari override admin.
        </p>
      )}
    </div>
  );
}

export default function WorkersPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <WorkersInner />
    </Suspense>
  );
}
