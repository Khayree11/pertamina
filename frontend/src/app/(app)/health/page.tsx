"use client";

import {
  ArrowRight,
  ClipboardList,
  HeartPulse,
  Inbox,
  Siren,
  Users,
} from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { AreaSegmentedBars } from "@/components/charts";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  PageLoader,
  Stat,
  Table,
  td,
  th,
} from "@/components/ui";
import { fmtDateLong } from "@/lib/format";
import type { AuditItem, AccessEvent, Status } from "@/lib/types";

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

export default function HealthDashboard() {
  const { data } = useSWR<Dash>("/api/admin/dashboard", { refreshInterval: 30_000 });
  if (!data) return <PageLoader />;
  const k = data.kpi;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={fmtDateLong(data.date)}
        title="Dashboard Klinik &amp; Kesehatan K3"
        description="Monitoring kepatuhan screening tensi, antrian verifikasi MCU/komorbid, dan pekerja berisiko tinggi."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/review">
              <Button icon={<Inbox className="size-4" />}>
                Antrian Review MCU ({k.pending_verifications ?? 0})
              </Button>
            </Link>
            <Link href="/admin/pekerja">
              <Button variant="secondary" icon={<Users className="size-4" />}>
                Daftar Pekerja
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total pekerja" value={k.total_workers ?? 0} hint="Terdaftar aktif" />
        <Stat
          label="Sudah screening hari ini"
          value={k.bp_submitted_today ?? 0}
          hint={`${k.compliance_pct ?? 0}% kepatuhan`}
          tone={(k.compliance_pct ?? 0) >= 80 ? "emerald" : "amber"}
        />
        <Stat
          label="Belum screening"
          value={k.bp_missing_today ?? 0}
          hint="Akses khusus ditahan"
          tone={(k.bp_missing_today ?? 0) > 0 ? "amber" : "slate"}
        />
        <Stat
          label="Perlu review mendesak"
          value={k.urgent_flags ?? 0}
          hint="Tensi krisis / flag merah"
          tone={(k.urgent_flags ?? 0) > 0 ? "rose" : "emerald"}
        />
      </div>

      {data.urgent.length > 0 && (
        <Card className="border-rose-300 bg-rose-50/60">
          <CardHeader
            title="Perhatian Medis Segera"
            subtitle="Pekerja dengan pembacaan tensi sangat tinggi atau flag review urgent hari ini"
            icon={<Siren className="size-5 text-rose-600" />}
          />
          <CardBody>
            <ul className="divide-y divide-rose-200">
              {data.urgent.map((u) => (
                <li key={u.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-semibold text-rose-950">{u.full_name}</p>
                    <p className="text-xs text-rose-700">
                      {u.employee_code} · {u.unit}
                    </p>
                  </div>
                  <Link href={`/admin/pekerja/${u.id}`}>
                    <Button size="sm" variant="danger">
                      Buka rekam medis
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Status Kelayakan per Area" icon={<HeartPulse className="size-5" />} subtitle="Hasil evaluasi otomatis hari ini" />
          <CardBody>
            <AreaSegmentedBars summary={data.area_summary} total={k.total_workers ?? 0} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Pekerja Belum Screening Tensi"
            icon={<ClipboardList className="size-5" />}
            subtitle={`${data.missing_bp.length} pekerja belum input hari ini`}
          />
          <CardBody className="p-0">
            {data.missing_bp.length === 0 ? (
              <div className="p-6">
                <EmptyState title="Semua pekerja sudah screening" description="Seluruh pekerja telah menginput tensi harian." />
              </div>
            ) : (
              <Table>
                <thead className="bg-slate-50">
                  <tr>
                    <th className={th}>Pekerja</th>
                    <th className={th}>Unit</th>
                    <th className={th}>Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.missing_bp.slice(0, 7).map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/80">
                      <td className={td}>
                        <p className="font-medium text-slate-900">{m.full_name}</p>
                        <p className="font-mono text-xs text-slate-500">{m.employee_code}</p>
                      </td>
                      <td className={td}>
                        <span className="text-xs text-slate-600">{m.unit}</span>
                      </td>
                      <td className={td}>
                        <Link href={`/admin/pekerja/${m.id}`}>
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                            Input di klinik <ArrowRight className="size-3" />
                          </span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
