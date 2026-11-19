"use client";

import {
  ArrowRight,
  BellRing,
  ClipboardList,
  HeartPulse,
  KeyRound,
  ScanLine,
  ScrollText,
  ShieldQuestionMark,
  Siren,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { AreaSegmentedBars, ComplianceColumns } from "@/components/charts";
import { TapBadge } from "@/components/status";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, CardBody, CardHeader, EmptyState, PageHeader, PageLoader, Stat, Table, cn, td, th } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { fmtDateLong, fmtRelative, fmtTime } from "@/lib/format";
import type { AccessEvent, AuditItem, Status } from "@/lib/types";

type Dash = {
  date: string;
  kpi: Record<string, number>;
  area_summary: Record<string, Partial<Record<Status, number>>>;
  missing_bp: { id: number; employee_code: string; full_name: string; unit: string; position: string }[];
  urgent: { id: number; employee_code: string; full_name: string; unit: string }[];
  compliance_trend: { date: string; submitted: number; total: number; pct: number }[];
  recent_audit: AuditItem[];
  recent_taps: AccessEvent[];
};

export default function AdminDashboard() {
  const toast = useToast();
  const { data, mutate } = useSWR<Dash>("/api/admin/dashboard", { refreshInterval: 30_000 });
  const [sending, setSending] = useState(false);
  const [trendTable, setTrendTable] = useState(false);
  if (!data) return <PageLoader />;
  const k = data.kpi;

  async function remind() {
    setSending(true);
    try {
      const r = await api<{ sent: number; skipped_already_reminded: number }>("/api/admin/notifications/remind-missing-bp", { method: "POST" });
      toast.success(`${r.sent} pengingat WA (simulasi) terkirim`, r.skipped_already_reminded ? `${r.skipped_already_reminded} pekerja sudah diingatkan hari ini.` : undefined);
      mutate();
    } catch (e) {
      toast.error("Gagal mengirim pengingat", errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={fmtDateLong(data.date)}
        title="Dashboard K3"
        description="Kepatuhan screening harian, status akses per area, dan hal yang perlu ditindaklanjuti hari ini."
        actions={
          <>
            <Link href="/admin/review">
              <Button variant="secondary" icon={<ClipboardList className="size-4" />}>
                Antrian review
              </Button>
            </Link>
            <Link href="/admin/akses">
              <Button icon={<KeyRound className="size-4" />}>Kelola akses</Button>
            </Link>
          </>
        }
      />

      {data.urgent.length > 0 && (
        <Alert
          tone="danger"
          title={`${data.urgent.length} flag review segera hari ini`}
          action={
            <Link href="/admin/review">
              <Button size="sm" variant="danger">
                Tindak lanjuti
              </Button>
            </Link>
          }
        >
          {data.urgent.map((u) => `${u.full_name} (${u.employee_code}, ${u.unit})`).join(" · ")} — tensi sangat tinggi; akses area
          khusus ditolak otomatis.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Kepatuhan hari ini" value={`${k.compliance_pct}%`} hint={`${k.bp_submitted_today} dari ${k.total_workers} pekerja`} icon={<HeartPulse className="size-4" />} tone="brand" />
        <Stat label="Belum input tensi" value={k.bp_missing_today} hint="Semua area khusus DENIED" icon={<Users className="size-4" />} tone="rose" href="/admin/pekerja?screening=missing" />
        <Stat label="Perlu review" value={k.workers_needing_review} hint={`${k.needs_review_pairs} pasangan pekerja-area`} icon={<ShieldQuestionMark className="size-4" />} tone="violet" href="/admin/review" />
        <Stat label="Flag segera" value={k.urgent_flags} hint="Belum ditindaklanjuti" icon={<Siren className="size-4" />} tone={k.urgent_flags ? "rose" : "slate"} href="/admin/review" />
        <Stat label="Override aktif" value={k.active_overrides} hint="Akses sementara oleh admin" icon={<KeyRound className="size-4" />} tone="amber" href="/admin/akses" />
        <Stat label="Tap ditolak" value={`${k.taps_denied_today}/${k.taps_today}`} hint="Hari ini (ditolak/total)" icon={<ScanLine className="size-4" />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Status akses per area"
            subtitle={`Distribusi ${k.total_workers} pekerja saat ini`}
            action={
              <Link href="/admin/pekerja" className="text-xs font-semibold text-brand-700 hover:underline">
                Lihat pekerja
              </Link>
            }
          />
          <CardBody>
            <AreaSegmentedBars summary={data.area_summary} total={k.total_workers} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Kepatuhan input tensi"
            subtitle="% pekerja yang input tensi, 14 hari terakhir"
            action={
              <button onClick={() => setTrendTable(!trendTable)} className="text-xs font-semibold text-brand-700 hover:underline">
                {trendTable ? "Grafik" : "Tabel"}
              </button>
            }
          />
          <CardBody>
            {trendTable ? (
              <Table className="max-h-56">
                <thead>
                  <tr>
                    <th className={th}>Tanggal</th>
                    <th className={th}>Input</th>
                    <th className={th}>%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...data.compliance_trend].reverse().map((d) => (
                    <tr key={d.date}>
                      <td className={cn(td, "py-1.5")}>{d.date}</td>
                      <td className={cn(td, "tabular py-1.5")}>
                        {d.submitted}/{d.total}
                      </td>
                      <td className={cn(td, "tabular py-1.5 font-semibold")}>{d.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <ComplianceColumns data={data.compliance_trend} />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader
            title="Belum input tensi hari ini"
            subtitle={`${data.missing_bp.length} pekerja`}
            icon={<HeartPulse className="size-5" />}
            action={
              <Button size="sm" variant="outline" loading={sending} onClick={remind} icon={<BellRing className="size-3.5" />} disabled={!data.missing_bp.length}>
                Kirim pengingat WA
              </Button>
            }
          />
          <CardBody className="space-y-1.5">
            {data.missing_bp.length === 0 ? (
              <EmptyState title="Semua pekerja sudah screening" />
            ) : (
              data.missing_bp.map((e) => (
                <Link key={e.id} href={`/admin/pekerja/${e.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-slate-50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-800">{e.full_name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {e.employee_code} · {e.unit}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-slate-300" />
                </Link>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Tap kartu terbaru" icon={<ScanLine className="size-5" />} action={<Link href="/tap" className="text-xs font-semibold text-brand-700 hover:underline">Simulator</Link>} />
          <CardBody className="space-y-2">
            {data.recent_taps.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">
                    {t.employee_code ?? t.input_identifier} → {t.room_name ?? t.room_code}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {fmtTime(t.created_at)} · {t.message}
                  </span>
                </span>
                <TapBadge result={t.result} />
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Aktivitas audit terbaru" icon={<ScrollText className="size-5" />} action={<Link href="/admin/audit" className="text-xs font-semibold text-brand-700 hover:underline">Audit log</Link>} />
          <CardBody className="space-y-2">
            {data.recent_audit.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs font-semibold text-slate-700">{a.action}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {a.actor_label} · {a.entity_type}
                    {a.entity_id ? ` #${a.entity_id.slice(0, 8)}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">{fmtRelative(a.created_at)}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
