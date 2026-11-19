"use client";

import { ClipboardCheck, KeyRound, ListChecks, ShieldQuestionMark, Siren } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { OverrideModal, type OverrideTarget } from "@/components/admin";
import { ReasonModal, VerifyModal } from "@/components/forms";
import { AREA_ICON } from "@/components/status";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, PageHeader, PageLoader } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import type { AreaMeta, CardArea, Comorbidity, EmployeeBasic, MCU, McuTemplate } from "@/lib/types";
import { McuVerifyModal } from "@/components/mcu-intake";

type Queue = {
  urgent: { employee: EmployeeBasic; run_id: string; assessed_at: string; bp: { systolic: number; diastolic: number }; acknowledged: boolean; ack_note: string | null }[];
  needs_review: { employee: EmployeeBasic; area: AreaMeta; source: string; reasons: { code: string; short: string; detail: string }[]; since: string | null }[];
  pending_mcu: MCU[];
  pending_comorbidities: Comorbidity[];
};

export default function ReviewPage() {
  const toast = useToast();
  const { mutate: gm } = useSWRConfig();
  const { data, mutate } = useSWR<Queue>("/api/admin/review-queue", { refreshInterval: 30_000 });
  const [target, setTarget] = useState<OverrideTarget | null>(null);
  const [verify, setVerify] = useState<{ endpoint: string; title: string } | null>(null);
  const [mcuVerify, setMcuVerify] = useState<MCU | null>(null);
  const { data: mcuTemplate } = useSWR<McuTemplate>("/api/mcu/template", { revalidateOnFocus: false });
  const [ack, setAck] = useState<string | null>(null);
  const [loadingCard, setLoadingCard] = useState<string | null>(null);
  const refresh = () => {
    mutate();
    gm("/api/admin/badge");
  };
  if (!data) return <PageLoader />;

  async function decide(item: Queue["needs_review"][number]) {
    const key = `${item.employee.id}-${item.area.code}`;
    setLoadingCard(key);
    try {
      const d = await api<{ employee: EmployeeBasic; card: CardArea[] }>(`/api/admin/employees/${item.employee.id}`);
      const card = d.card.find((c) => c.area.code === item.area.code)!;
      setTarget({ employee: d.employee, card, kind: "REVIEW_DECISION" });
    } finally {
      setLoadingCard(null);
    }
  }

  const pendingUrgent = data.urgent.filter((u) => !u.acknowledged);
  return (
    <div>
      <PageHeader
        eyebrow="Tindak lanjut"
        title="Antrian Review"
        description="Pada prototipe 2 role, status NEEDS_REVIEW diselesaikan admin K3 dengan catatan wajib (§8.2). Versi produksi memerlukan role petugas medis."
      />

      <div className="space-y-6">
        <Card className={pendingUrgent.length ? "border-rose-200" : ""}>
          <CardHeader title="Flag review segera" subtitle="Tensi sangat tinggi hari ini — hard stop, tidak dapat di-override" icon={<Siren className="size-5 text-rose-600" />} />
          <CardBody className="space-y-2">
            {data.urgent.length === 0 ? (
              <p className="text-sm text-slate-500">Tidak ada flag hari ini.</p>
            ) : (
              data.urgent.map((u) => (
                <div key={u.run_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                  <div>
                    <Link href={`/admin/pekerja/${u.employee.id}`} className="font-semibold text-slate-900 hover:text-brand-700">
                      {u.employee.full_name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {u.employee.employee_code} · {u.employee.unit} · {fmtTime(u.assessed_at)} WIB · tensi{" "}
                      <strong className="text-rose-700">
                        {u.bp.systolic}/{u.bp.diastolic}
                      </strong>
                    </p>
                    {u.acknowledged && <p className="mt-1 text-xs text-emerald-700">Ditindaklanjuti: “{u.ack_note}”</p>}
                  </div>
                  {u.acknowledged ? (
                    <Badge tone="emerald">Sudah ditindaklanjuti</Badge>
                  ) : (
                    <Button size="sm" variant="danger" onClick={() => setAck(u.run_id)}>
                      Catat tindak lanjut
                    </Button>
                  )}
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Status NEEDS_REVIEW"
            subtitle={`${data.needs_review.length} pasangan pekerja-area menunggu keputusan`}
            icon={<ShieldQuestionMark className="size-5 text-violet-600" />}
          />
          <CardBody className="space-y-2">
            {data.needs_review.length === 0 ? (
              <EmptyState title="Tidak ada yang perlu direview" />
            ) : (
              data.needs_review.map((n) => {
                const Icon = AREA_ICON[n.area.code];
                const key = `${n.employee.id}-${n.area.code}`;
                return (
                  <div key={key} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/pekerja/${n.employee.id}`} className="font-semibold text-slate-900 hover:text-brand-700">
                          {n.employee.full_name}
                        </Link>
                        <span className="font-mono text-xs text-slate-500">{n.employee.employee_code}</span>
                        <Badge tone="violet" icon={<Icon className="size-3" />}>
                          {n.area.label}
                        </Badge>
                      </div>
                      <ul className="mt-1 text-xs text-slate-600">
                        {n.reasons.map((r) => (
                          <li key={r.code}>
                            • {r.short} <span className="text-slate-400">— {r.detail}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Button size="sm" variant="dark" icon={<KeyRound className="size-3.5" />} loading={loadingCard === key} onClick={() => decide(n)}>
                      Putuskan review
                    </Button>
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Verifikasi MCU" subtitle={`${data.pending_mcu.length} menunggu`} icon={<ClipboardCheck className="size-5" />} />
            <CardBody className="space-y-2">
              {data.pending_mcu.length === 0 ? (
                <p className="text-sm text-slate-500">Tidak ada MCU yang menunggu verifikasi.</p>
              ) : (
                data.pending_mcu.map((m) => (
                  <div key={m.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">{m.employee?.full_name}</p>
                        <p className="text-xs text-slate-500">
                          MCU {fmtDate(m.mcu_date)} · {m.conclusion_label} · {m.provider || "—"} · diinput {fmtDateTime(m.created_at)}
                        </p>
                      </div>
                      <Button size="xs" onClick={() => setMcuVerify(m)}>
                        Verifikasi
                      </Button>
                    </div>
                    {m.summary && <p className="mt-2 text-sm text-slate-600">{m.summary}</p>}
                    {m.has_document && (
                      <a href={`/api/files/mcu/${m.id}`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-semibold text-brand-700 hover:underline">
                        Buka dokumen ({m.document_filename}) — akses dicatat di audit log
                      </a>
                    )}
                  </div>
                ))
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Verifikasi komorbid" subtitle={`${data.pending_comorbidities.length} menunggu`} icon={<ListChecks className="size-5" />} />
            <CardBody className="space-y-2">
              {data.pending_comorbidities.length === 0 ? (
                <p className="text-sm text-slate-500">Tidak ada komorbid yang menunggu verifikasi.</p>
              ) : (
                data.pending_comorbidities.map((c) => (
                  <div key={c.id} className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 p-3">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {c.employee?.full_name} — {c.label}
                      </p>
                      <p className="text-xs text-slate-500">
                        {c.controlled ? "Diklaim terkontrol" : "Tidak terkontrol"} · diagnosis {fmtDate(c.diagnosed_date)} · diinput {fmtDateTime(c.created_at)}
                      </p>
                      {c.notes && <p className="mt-1 text-sm text-slate-600">{c.notes}</p>}
                    </div>
                    <Button size="xs" onClick={() => setVerify({ endpoint: `/api/admin/comorbidities/${c.id}/verify`, title: `Verifikasi komorbid — ${c.employee?.full_name}` })}>
                      Verifikasi
                    </Button>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>
        <Alert tone="neutral">
          Setiap keputusan review bersifat sementara (masa berlaku pendek) dan tercatat di audit log. Jika kondisi pekerja memburuk,
          keputusan yang membuka akses dicabut otomatis.
        </Alert>
      </div>

      <OverrideModal target={target} onClose={() => setTarget(null)} onDone={refresh} />
      <McuVerifyModal mcu={mcuVerify} template={mcuTemplate} onClose={() => setMcuVerify(null)} onDone={refresh} />
      <VerifyModal open={!!verify} onClose={() => setVerify(null)} endpoint={verify?.endpoint ?? ""} title={verify?.title ?? ""} onDone={refresh} />
      <ReasonModal
        open={!!ack}
        onClose={() => setAck(null)}
        title="Tindak lanjut flag review segera"
        description="Catat tindakan yang sudah dilakukan (mis. dirujuk ke klinik, istirahat, dipulangkan)."
        confirmLabel="Simpan tindak lanjut"
        tone="primary"
        onConfirm={async (note) => {
          await api(`/api/admin/runs/${ack}/ack-urgent`, { json: { note } });
          toast.success("Tindak lanjut tercatat");
          refresh();
        }}
      />
    </div>
  );
}
