"use client";

import { KeyRound, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { OverrideModal, type OverrideTarget } from "@/components/admin";
import { AREA_ICON, StatusBadge, SourceBadge } from "@/components/status";
import { ReasonModal } from "@/components/forms";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, PageHeader, PageLoader, Select, Table, cn, td, th } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDateTime, fmtRelative, fmtTime } from "@/lib/format";
import type { CardArea, EmployeeBasic, OverrideView } from "@/lib/types";

const CONTROLS = [
  ["Alasan wajib", "Minimal 10 karakter, terlihat oleh pekerja."],
  ["Audit log tak bisa dihapus", "Append-only + rantai hash."],
  ["Masa berlaku pendek", "Bawaan 4 jam, maks. 12 jam (aturan aktif)."],
  ["Konfirmasi risiko", "Wajib untuk override yang membuka akses."],
  ["Hard stop", "Tensi sangat tinggi & MCU UNFIT tidak dapat di-override."],
  ["Dicabut otomatis", "Jika status otomatis memburuk setelah override."],
  ["Tampil jelas", "Ditandai “Override admin” di kartu & TEMPORARY di pintu."],
];

export default function AksesPage() {
  const toast = useToast();
  const { mutate: gm } = useSWRConfig();
  const [empId, setEmpId] = useState("");
  const [state, setState] = useState("");
  const [target, setTarget] = useState<OverrideTarget | null>(null);
  const [revoke, setRevoke] = useState<OverrideView | null>(null);
  const { data: emps } = useSWR<{ items: { id: number; employee_code: string; full_name: string; unit: string }[] }>("/api/admin/employees");
  const { data: detail, mutate: reloadDetail } = useSWR<{ employee: EmployeeBasic; card: CardArea[] }>(empId ? `/api/admin/employees/${empId}` : null);
  const { data: active, mutate: reloadActive } = useSWR<{ items: OverrideView[] }>("/api/admin/overrides?state=ACTIVE", { refreshInterval: 30_000 });
  const { data: history, mutate: reloadHistory } = useSWR<{ items: OverrideView[] }>(`/api/admin/overrides?limit=100${state ? `&state=${state}` : ""}`);

  const refresh = () => {
    reloadDetail();
    reloadActive();
    reloadHistory();
    gm("/api/admin/badge");
  };

  return (
    <div>
      <PageHeader
        eyebrow="Kontrol akses"
        title="Kelola Akses"
        description="Ubah akses area per pekerja beserta masa berlakunya. Setiap perubahan wajib beralasan dan tercatat di audit log."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Ubah akses pekerja" icon={<KeyRound className="size-5" />} />
          <CardBody className="space-y-4">
            <Field label="Pilih pekerja">
              <Select value={empId} onChange={(e) => setEmpId(e.target.value)}>
                <option value="">— Pilih pekerja —</option>
                {emps?.items.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.employee_code} · {e.full_name} · {e.unit}
                  </option>
                ))}
              </Select>
            </Field>
            {empId && !detail && <PageLoader />}
            {detail && (
              <div className="grid gap-3 sm:grid-cols-2">
                {detail.card.map((c) => {
                  const Icon = AREA_ICON[c.area.code];
                  return (
                    <div key={c.area.code} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2 text-sm font-semibold">
                          <Icon className="size-4 text-slate-400" /> {c.area.label}
                        </span>
                        <StatusBadge status={c.status} />
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <SourceBadge source={c.source} />
                        {c.source === "OVERRIDE" && <span className="text-xs text-slate-500">otomatis: {c.auto_status}</span>}
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs text-slate-500">{c.reasons.map((r) => r.short).join(" · ")}</p>
                      <Button
                        size="sm"
                        variant="dark"
                        className="mt-3 w-full"
                        icon={<KeyRound className="size-3.5" />}
                        onClick={() => setTarget({ employee: detail.employee, card: c })}
                      >
                        Ubah akses
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
            {!empId && <EmptyState title="Pilih pekerja untuk melihat dan mengubah akses per area" />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Kontrol keselamatan override" icon={<ShieldAlert className="size-5" />} subtitle="§8.3 dokumen perencanaan" />
          <CardBody>
            <ul className="space-y-2.5">
              {CONTROLS.map(([t, d]) => (
                <li key={t} className="text-sm">
                  <p className="font-semibold text-slate-800">{t}</p>
                  <p className="text-slate-500">{d}</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Override aktif" subtitle={`${active?.items.length ?? 0} akses sementara sedang berlaku`} />
        {!active ? (
          <PageLoader />
        ) : active.items.length === 0 ? (
          <EmptyState title="Tidak ada override aktif" />
        ) : (
          <Table>
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>Pekerja</th>
                <th className={th}>Area</th>
                <th className={th}>Perubahan</th>
                <th className={th}>Berakhir</th>
                <th className={th}>Alasan</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {active.items.map((o) => (
                <tr key={o.id}>
                  <td className={td}>
                    <Link href={`/admin/pekerja/${o.employee?.id}`} className="font-semibold text-slate-900 hover:text-brand-700">
                      {o.employee?.full_name}
                    </Link>
                    <span className="block font-mono text-xs text-slate-500">{o.employee?.employee_code}</span>
                  </td>
                  <td className={td}>{o.area.short}</td>
                  <td className={cn(td, "whitespace-nowrap")}>
                    <span className="text-xs text-slate-500">{o.base_auto_status} →</span> <StatusBadge status={o.new_status} />
                    <span className="block text-xs text-slate-500">{o.kind_label}</span>
                  </td>
                  <td className={cn(td, "whitespace-nowrap")}>
                    {fmtTime(o.valid_until)} WIB<span className="block text-xs text-slate-500">{fmtRelative(o.valid_until)}</span>
                  </td>
                  <td className={cn(td, "max-w-sm text-slate-600")}>
                    {o.reason}
                    <span className="block text-xs text-slate-400">oleh {o.admin_name}</span>
                  </td>
                  <td className={td}>
                    <Button size="xs" variant="danger" onClick={() => setRevoke(o)}>
                      Cabut
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Riwayat perubahan akses"
          subtitle="Semua override & keputusan review"
          action={
            <Select value={state} onChange={(e) => setState(e.target.value)} className="h-8 w-auto py-1 text-xs" aria-label="Filter status">
              <option value="">Semua status</option>
              <option value="ACTIVE">Aktif</option>
              <option value="EXPIRED">Berakhir</option>
              <option value="REVOKED">Dicabut admin</option>
              <option value="AUTO_REVOKED">Dicabut otomatis</option>
              <option value="SUPERSEDED">Tidak diperlukan lagi</option>
              <option value="REPLACED">Digantikan</option>
            </Select>
          }
        />
        {!history ? (
          <PageLoader />
        ) : history.items.length === 0 ? (
          <EmptyState title="Belum ada riwayat" />
        ) : (
          <Table>
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>Dibuat</th>
                <th className={th}>Pekerja</th>
                <th className={th}>Area</th>
                <th className={th}>Perubahan</th>
                <th className={th}>Status</th>
                <th className={th}>Akhir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.items.map((o) => (
                <tr key={o.id}>
                  <td className={cn(td, "whitespace-nowrap")}>
                    {fmtDateTime(o.created_at)}
                    <span className="block text-xs text-slate-500">{o.admin_name}</span>
                  </td>
                  <td className={td}>
                    {o.employee?.full_name}
                    <span className="block font-mono text-xs text-slate-500">{o.employee?.employee_code}</span>
                  </td>
                  <td className={td}>{o.area.short}</td>
                  <td className={cn(td, "whitespace-nowrap")}>
                    <span className="text-xs text-slate-500">{o.base_auto_status} →</span> <StatusBadge status={o.new_status} />
                  </td>
                  <td className={td}>
                    <Badge tone={o.state === "ACTIVE" ? "amber" : o.state === "AUTO_REVOKED" ? "rose" : "slate"}>{o.state_label}</Badge>
                  </td>
                  <td className={cn(td, "max-w-xs text-xs text-slate-500")}>
                    {o.ended_at ? `${fmtDateTime(o.ended_at)} · ${o.ended_by ?? ""}` : `s.d. ${fmtDateTime(o.valid_until)}`}
                    {o.end_reason && <span className="block">{o.end_reason}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <OverrideModal target={target} onClose={() => setTarget(null)} onDone={refresh} />
      <ReasonModal
        open={!!revoke}
        onClose={() => setRevoke(null)}
        title="Cabut override"
        description={revoke ? `${revoke.employee?.full_name} — ${revoke.area.label}` : undefined}
        confirmLabel="Cabut override"
        onConfirm={async (reason) => {
          await api(`/api/admin/overrides/${revoke!.id}/revoke`, { json: { reason } });
          toast.success("Override dicabut", "Status kembali mengikuti evaluasi otomatis.");
          refresh();
        }}
      />
    </div>
  );
}
