"use client";

import { ArrowRight, HeartPulse, Info, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { BpChart } from "@/components/charts";
import { StatusBadge } from "@/components/status";
import { useToast } from "@/components/toast";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  PageLoader,
  Stat,
  Table,
  cn,
  td,
  th,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { fmtDate, fmtTime } from "@/lib/format";
import type { BPRecord, CardArea, Status } from "@/lib/types";

type History = {
  records: BPRecord[];
  stats: {
    days: number;
    submitted_days: number;
    compliance_pct: number;
    streak_days: number;
    avg7_systolic: number | null;
    avg7_diastolic: number | null;
  };
  thresholds: { high: [number, number]; very_high: [number, number] };
  today: string;
};

type SubmitResult = {
  record: BPRecord;
  card: CardArea[];
  changes: { area: string; old_status: Status | null; new_status: Status; note?: string }[];
};

const GUIDE = [
  "Hindari kopi, rokok, dan olahraga berat ±30 menit sebelumnya.",
  "Duduk tenang ±5 menit, punggung bersandar, kaki menapak lantai.",
  "Manset setinggi jantung, ukuran sesuai lengan, jangan berbicara.",
  "Jika mengulang, beri jeda 1–2 menit. Jangan mengulang demi angka lebih rendah.",
];

export default function TensiPage() {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [days, setDays] = useState(30);
  const { data, mutate: reload } = useSWR<History>(`/api/me/bp?days=${days}`);
  const [form, setForm] = useState({ systolic: "", diastolic: "", pulse: "", note: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const todayCount = data?.records.filter((r) => r.record_date === data.today).length ?? 0;

  function validate() {
    const e: Record<string, string> = {};
    const s = Number(form.systolic);
    const d = Number(form.diastolic);
    if (!form.systolic) e.systolic = "Wajib diisi";
    else if (!Number.isInteger(s) || s < 70 || s > 250) e.systolic = "Rentang valid 70–250 mmHg";
    if (!form.diastolic) e.diastolic = "Wajib diisi";
    else if (!Number.isInteger(d) || d < 40 || d > 150) e.diastolic = "Rentang valid 40–150 mmHg";
    if (!e.systolic && !e.diastolic && s <= d) e.diastolic = "Diastolik harus lebih kecil dari sistolik";
    if (form.pulse) {
      const p = Number(form.pulse);
      if (!Number.isInteger(p) || p < 30 || p > 200) e.pulse = "Rentang valid 30–200 bpm";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      const r = await api<SubmitResult>("/api/me/bp", {
        json: {
          systolic: Number(form.systolic),
          diastolic: Number(form.diastolic),
          pulse: form.pulse ? Number(form.pulse) : null,
          note: form.note || null,
        },
      });
      setResult(r);
      setForm({ systolic: "", diastolic: "", pulse: "", note: "" });
      toast.success("Tensi tersimpan", "Status kartu dievaluasi ulang otomatis.");
      reload();
      mutate("/api/me/status");
      mutate("/api/me/dashboard");
    } catch (e) {
      if (e instanceof ApiError && e.errors?.length) {
        const fe: Record<string, string> = {};
        e.errors.forEach((x) => (fe[x.field || "form"] = x.message));
        setErrors(fe);
      }
      toast.error("Gagal menyimpan", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <PageHeader
        eyebrow="Wajib setiap hari"
        title="Input Tensi Harian"
        description="Hasil tensi hari ini dievaluasi bersama data MCU dan komorbid oleh rule engine untuk menentukan status akses per area."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Pengukuran baru"
            subtitle={`${todayCount} pengukuran hari ini · maksimal 6 per hari`}
            icon={<HeartPulse className="size-5" />}
          />
          <CardBody>
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Sistolik (atas)" required error={errors.systolic} htmlFor="sys" hint="mmHg">
                  <Input
                    id="sys"
                    inputMode="numeric"
                    placeholder="120"
                    value={form.systolic}
                    onChange={set("systolic")}
                    className="text-2xl font-bold tracking-tight"
                    aria-invalid={!!errors.systolic}
                  />
                </Field>
                <Field label="Diastolik (bawah)" required error={errors.diastolic} htmlFor="dia" hint="mmHg">
                  <Input
                    id="dia"
                    inputMode="numeric"
                    placeholder="80"
                    value={form.diastolic}
                    onChange={set("diastolic")}
                    className="text-2xl font-bold tracking-tight"
                    aria-invalid={!!errors.diastolic}
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
                <Field label="Nadi (opsional)" error={errors.pulse} htmlFor="pulse" hint="bpm">
                  <Input id="pulse" inputMode="numeric" placeholder="72" value={form.pulse} onChange={set("pulse")} />
                </Field>
                <Field label="Catatan (opsional)" htmlFor="note" error={errors.note}>
                  <Input id="note" maxLength={300} value={form.note} onChange={set("note")} placeholder="Mis. diukur ulang setelah istirahat" />
                </Field>
              </div>
              {errors.form && <Alert tone="danger">{errors.form}</Alert>}
              <Button type="submit" size="lg" className="w-full sm:w-auto" loading={busy} icon={<Send className="size-4" />}>
                Simpan &amp; evaluasi akses
              </Button>
              <p className="text-xs text-slate-500">
                Memasukkan angka yang tidak sesuai hasil pengukuran adalah pelanggaran K3. Selisih besar antar-pengukuran di hari
                yang sama otomatis memicu status NEEDS_REVIEW.
              </p>
            </form>

            {result && (
              <div className="animate-slide-up mt-5 rounded-2xl border border-brand-200 bg-brand-50/50 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  Tersimpan {fmtTime(result.record.measured_at)} WIB — {result.record.systolic}/{result.record.diastolic} mmHg
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {result.changes.length > 0 ? `${result.changes.length} area berubah status` : "Tidak ada perubahan status akses"}
                </p>
                <ul className="mt-3 divide-y divide-brand-100 rounded-xl bg-white ring-1 ring-brand-100">
                  {result.card.map((c) => {
                    const ch = result.changes.find((x) => x.area === c.area.code);
                    return (
                      <li key={c.area.code} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="font-medium text-slate-700">{c.area.label}</span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          {ch?.old_status && ch.old_status !== c.status && (
                            <>
                              <StatusBadge status={ch.old_status} className="opacity-60" />
                              <ArrowRight className="size-3.5 text-slate-400" />
                            </>
                          )}
                          <StatusBadge status={c.status} />
                        </span>
                        {c.reasons[0] && <span className="w-full text-xs text-slate-500">{c.reasons.map((r) => r.short).join(" · ")}</span>}
                        {ch?.note && <span className="w-full text-xs font-medium text-amber-700">{ch.note}</span>}
                      </li>
                    );
                  })}
                </ul>
                <Link href="/kartu" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
                  Lihat detail status kartu <ArrowRight className="size-4" />
                </Link>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Cara mengukur yang benar" icon={<Info className="size-5" />} subtitle="Ringkasan dari FAQ screening (contoh)" />
          <CardBody>
            <ol className="space-y-3">
              {GUIDE.map((g, i) => (
                <li key={i} className="flex gap-3 text-sm text-slate-700">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{i + 1}</span>
                  {g}
                </li>
              ))}
            </ol>
            <Alert tone="warning" className="mt-4" title="Ambang simulasi">
              ≥ 140/90 mmHg: Panas &amp; Ketinggian ditolak, area lain perlu review. ≥ 180/110 mmHg: semua area khusus ditolak dan
              petugas K3 diberi tahu. Ambang ini contoh — wajib divalidasi dokter perusahaan.
            </Alert>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Riwayat tensi"
          subtitle="Grafik dan tabel — semua pembacaan tersimpan"
          action={
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
              {[14, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={cn("rounded-md px-2.5 py-1", days === d ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
                >
                  {d} hari
                </button>
              ))}
            </div>
          }
        />
        <CardBody>
          {!data ? (
            <PageLoader />
          ) : (
            <>
              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Kepatuhan" value={`${data.stats.compliance_pct}%`} hint={`${data.stats.submitted_days} dari ${data.stats.days} hari`} />
                <Stat label="Beruntun" value={`${data.stats.streak_days} hari`} hint="Input tanpa terlewat" />
                <Stat
                  label="Rata-rata 7 hari"
                  value={data.stats.avg7_systolic ? `${data.stats.avg7_systolic}/${data.stats.avg7_diastolic}` : "—"}
                  hint="mmHg (pembacaan terakhir/hari)"
                />
                <Stat label="Total pembacaan" value={data.records.length} hint={`${days} hari terakhir`} />
              </div>
              {data.records.length === 0 ? (
                <EmptyState icon={<HeartPulse className="size-6" />} title="Belum ada riwayat" />
              ) : (
                <>
                  <BpChart records={data.records} days={days} today={data.today} thresholds={data.thresholds.high} />
                  <Table className="mt-6 max-h-80 rounded-xl border border-slate-200">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr>
                        <th className={th}>Tanggal</th>
                        <th className={th}>Jam</th>
                        <th className={th}>Tensi</th>
                        <th className={th}>Nadi</th>
                        <th className={th}>Sumber</th>
                        <th className={th}>Catatan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.records.map((r) => {
                        const high = r.systolic >= 140 || r.diastolic >= 90;
                        return (
                          <tr key={r.id}>
                            <td className={td}>{fmtDate(r.record_date)}</td>
                            <td className={cn(td, "tabular")}>{fmtTime(r.measured_at)}</td>
                            <td className={cn(td, "tabular font-semibold", high ? "text-rose-700" : "text-slate-900")}>
                              {r.systolic}/{r.diastolic}
                              {high && <span className="ml-1.5 text-[11px] font-medium text-rose-600">≥ ambang</span>}
                            </td>
                            <td className={cn(td, "tabular")}>{r.pulse ?? "—"}</td>
                            <td className={td}>{r.source_label}</td>
                            <td className={cn(td, "max-w-56 truncate text-slate-500")}>{r.note ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </>
              )}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
