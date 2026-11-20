"use client";

import { ListChecks, Lock } from "lucide-react";
import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { ComorbidityForm } from "@/components/forms";
import { VerificationBadge } from "@/components/status";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, PageHeader, PageLoader, cn } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { Comorbidity } from "@/lib/types";

const IMPACT = [
  ["Penyakit jantung", "Panas, Ketinggian, Paparan BBM → perlu review"],
  ["Asma / PPOK", "Paparan BBM → perlu review"],
  ["Hipertensi / diabetes tidak terkontrol", "Ketinggian, Panas → perlu review"],
  ["Epilepsi / riwayat kejang", "Ketinggian → perlu review"],
  ["Lainnya (belum diklasifikasi)", "Semua area khusus → perlu review"],
];

export default function KomorbidPage() {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const { data, mutate: reload } = useSWR<{ items: Comorbidity[] }>("/api/me/comorbidities");
  const [busy, setBusy] = useState<number | null>(null);

  const refreshAll = () => {
    reload();
    mutate("/api/me/dashboard");
    mutate("/api/me/status");
  };

  async function patch(c: Comorbidity, body: Record<string, unknown>, msg: string) {
    setBusy(c.id);
    try {
      await api(`/api/me/comorbidities/${c.id}`, { method: "PATCH", json: body });
      toast.success(msg, "Status akses dievaluasi ulang.");
      refreshAll();
    } catch (e) {
      toast.error("Gagal memperbarui", errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Data kesehatan"
        title="Penyakit Komorbid"
        description="Laporkan penyakit penyerta dengan jujur. Data ini membantu menentukan area kerja yang aman bagi Anda."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Komorbid tercatat" icon={<ListChecks className="size-5" />} subtitle={`${data?.items.length ?? 0} catatan`} />
          <CardBody className="space-y-3">
            {!data ? (
              <PageLoader />
            ) : data.items.length === 0 ? (
              <EmptyState icon={<ListChecks className="size-6" />} title="Belum ada komorbid tercatat" description="Jika tidak memiliki penyakit penyerta, Anda tidak perlu mengisi apa pun." />
            ) : (
              data.items.map((c) => {
                const editable = c.verification_status === "UNVERIFIED" && c.active;
                return (
                  <div key={c.id} className={cn("rounded-xl border p-4", c.active ? "border-slate-200" : "border-dashed border-slate-200 bg-slate-50 opacity-70")}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">{c.label}</p>
                        <p className="text-xs text-slate-500">
                          Diagnosis {fmtDate(c.diagnosed_date)} · diinput {fmtDateTime(c.created_at)}
                          {c.entered_by ? ` oleh ${c.entered_by}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {!c.active && <Badge>Nonaktif</Badge>}
                        <Badge tone={c.controlled ? "emerald" : "amber"}>{c.controlled ? "Terkontrol" : "Tidak terkontrol"}</Badge>
                        <VerificationBadge status={c.verification_status} />
                      </div>
                    </div>
                    {c.notes && <p className="mt-2 text-sm text-slate-600">{c.notes}</p>}
                    {c.verified_by && (
                      <p className="mt-2 text-xs text-slate-500">
                        {c.verification_status === "REJECTED" ? "Ditolak" : "Diverifikasi"} oleh {c.verified_by} · {fmtDateTime(c.verified_at)}
                        {c.verification_note ? ` — “${c.verification_note}”` : ""}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {editable ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={busy === c.id}
                            onClick={() => patch(c, { controlled: !c.controlled }, "Status terkontrol diperbarui")}
                          >
                            Tandai {c.controlled ? "tidak terkontrol" : "terkontrol"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy === c.id}
                            onClick={() => patch(c, { active: false }, "Data dinonaktifkan")}
                          >
                            Hapus (salah input)
                          </Button>
                        </>
                      ) : (
                        c.active && (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                            <Lock className="size-3.5" /> Sudah diverifikasi — perubahan hanya oleh admin
                          </span>
                        )
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Tambah komorbid" subtitle="Pilih dari daftar terstandar" />
            <CardBody>
              <ComorbidityForm endpoint="/api/me/comorbidities" onDone={refreshAll} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Pengaruh ke akses (aturan simulasi)" />
            <CardBody>
              <ul className="space-y-2 text-sm">
                {IMPACT.map(([k, v]) => (
                  <li key={k} className="flex flex-col rounded-lg bg-slate-50 px-3 py-2">
                    <span className="font-medium text-slate-800">{k}</span>
                    <span className="text-slate-500">{v}</span>
                  </li>
                ))}
              </ul>
              <Alert tone="neutral" className="mt-3">
                Aturan contoh — wajib divalidasi dokter perusahaan. NEEDS_REVIEW diselesaikan admin K3 dengan catatan wajib.
              </Alert>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
