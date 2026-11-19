"use client";

import { History, ScanLine } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { AreaTile, VirtualCard } from "@/components/access";
import { AREA_ICON, StatusBadge, StatusLegend, TapBadge } from "@/components/status";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, PageHeader, PageLoader, Table, cn, td, th } from "@/components/ui";
import { fmtDateTime, fmtTime } from "@/lib/format";
import type { AccessEvent, AssessmentMeta, CardArea, EmployeeBasic, OverrideView } from "@/lib/types";

type CardData = {
  employee: EmployeeBasic;
  card: CardArea[];
  assessment: AssessmentMeta | null;
  overrides: OverrideView[];
  access_events: AccessEvent[];
  disclaimer: string;
};

export default function KartuPage() {
  const { data } = useSWR<CardData>("/api/me/card", { refreshInterval: 30_000 });
  if (!data) return <PageLoader />;
  return (
    <div>
      <PageHeader
        eyebrow="Hak akses"
        title="Status Kartu"
        description="Status per area dihitung otomatis dari tensi hari ini, MCU, dan komorbid. Alasan ditampilkan singkat tanpa membuka detail medis berlebih."
        actions={
          <Link href="/tap">
            <Button icon={<ScanLine className="size-4" />}>Simulasi tap</Button>
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <VirtualCard employee={data.employee} card={data.card} />
        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Dievaluasi</span>
                <span className="text-right font-medium">{fmtDateTime(data.assessment?.assessed_at)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Versi aturan</span>
                <span className="text-right font-medium">{data.assessment?.rule_version_label ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Status otomatis berlaku s.d.</span>
                <span className="text-right font-medium">{fmtDateTime(data.assessment?.valid_until)}</span>
              </div>
              <div className="pt-2">
                <StatusLegend />
              </div>
            </CardBody>
          </Card>
          <Alert tone="neutral">{data.disclaimer}</Alert>
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {data.card.map((c) => (
          <AreaTile key={c.area.code} item={c} />
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Riwayat tap kartu" icon={<ScanLine className="size-5" />} subtitle="10 terakhir" />
          {data.access_events.length === 0 ? (
            <EmptyState title="Belum ada tap" />
          ) : (
            <Table>
              <thead className="bg-slate-50">
                <tr>
                  <th className={th}>Waktu</th>
                  <th className={th}>Ruangan</th>
                  <th className={th}>Hasil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.access_events.map((e) => {
                  const Icon = e.area ? AREA_ICON[e.area.code] : null;
                  return (
                    <tr key={e.id}>
                      <td className={cn(td, "tabular whitespace-nowrap")}>{fmtDateTime(e.created_at)}</td>
                      <td className={td}>
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                          {Icon && <Icon className="size-3.5 text-slate-400" />}
                          {e.room_name ?? e.room_code}
                        </span>
                        <span className="block text-xs text-slate-500">{e.message}</span>
                      </td>
                      <td className={td}>
                        <TapBadge result={e.result} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Riwayat perubahan oleh admin" icon={<History className="size-5" />} subtitle="Override & keputusan review" />
          <CardBody className="space-y-3">
            {data.overrides.length === 0 ? (
              <p className="text-sm text-slate-500">Belum pernah ada perubahan akses oleh admin.</p>
            ) : (
              data.overrides.map((o) => (
                <div key={o.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {o.area.short}: {o.base_auto_status} → <StatusBadge status={o.new_status} />
                    </span>
                    <Badge tone={o.state === "ACTIVE" ? "amber" : "slate"}>{o.state_label}</Badge>
                  </div>
                  <p className="mt-1 text-slate-600">“{o.reason}”</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {o.kind_label} oleh {o.admin_name} · {fmtDateTime(o.created_at)} · s.d. {fmtTime(o.valid_until)} WIB
                    {o.end_reason ? ` · ${o.end_reason}` : ""}
                  </p>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
