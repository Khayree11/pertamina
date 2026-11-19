"use client";

import { CircleCheck, CircleHelp, FilePen, FileUp, Lightbulb, Plus, RotateCcw, Save, ScanText, TriangleAlert, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import type { FieldStatus, MCU, McuField, McuReview, McuSuggestion, McuTemplate } from "@/lib/types";
import { AREA_ICON, AREA_SHORT } from "./status";
import { useToast } from "./toast";
import { Alert, Badge, Button, Card, CardBody, Checkbox, Field, Input, Select, Spinner, Textarea, cn } from "./ui";

const AREAS = ["COLD", "HOT", "HEIGHT", "RESTRICTED_GAS"];
const CONCLUSIONS: [string, string][] = [
  ["PENDING", "Belum ada penilaian dokter perusahaan"],
  ["FIT", "Fit"],
  ["FIT_WITH_RESTRICTION", "Fit dengan restriksi"],
  ["UNFIT", "Tidak fit (unfit)"],
];

/** Replika aturan patokan backend (app/mcu/template.py) agar status berubah langsung saat diedit. */
export function fieldStatus(f: McuField, value: any): FieldStatus {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return "KOSONG";
  if (f.type === "list") return (value as any[]).some((x) => String(x).trim()) ? "PERHATIAN" : "KOSONG";
  if (f.type === "number") {
    if (!f.ref) return "INFO";
    const v = parseFloat(String(value).replace(",", "."));
    if (Number.isNaN(v)) return "PERHATIAN";
    if ((f.ref.min !== undefined && v < f.ref.min) || (f.ref.max !== undefined && v > f.ref.max)) return "PERHATIAN";
    return "NORMAL";
  }
  if (f.normal_text?.length) {
    const low = String(value).trim().toLowerCase();
    if (f.normal_text.some((n) => low === n || low.startsWith(n))) return "NORMAL";
    return f.info ? "INFO" : "PERHATIAN";
  }
  return "INFO";
}

const STATUS_CHIP: Record<FieldStatus, { label: string; cls: string }> = {
  NORMAL: { label: "Normal", cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  PERHATIAN: { label: "Perlu perhatian", cls: "bg-amber-50 text-amber-800 ring-amber-600/30" },
  INFO: { label: "Info", cls: "bg-slate-100 text-slate-600 ring-slate-500/20" },
  KOSONG: { label: "Kosong", cls: "bg-white text-slate-400 ring-slate-300" },
};

function StatusChip({ s }: { s: FieldStatus }) {
  const c = STATUS_CHIP[s];
  return <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ring-1 ring-inset", c.cls)}>{c.label}</span>;
}

function same(f: McuField, a: any, b: any) {
  if (f.type === "list") return JSON.stringify((a ?? []).map((x: any) => String(x).trim().toLowerCase())) === JSON.stringify((b ?? []).map((x: any) => String(x).trim().toLowerCase()));
  if (f.type === "number") {
    const x = a === null || a === "" || a === undefined ? null : parseFloat(String(a).replace(",", "."));
    const y = b === null || b === "" || b === undefined ? null : parseFloat(String(b).replace(",", "."));
    return x === y;
  }
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

const SUMMARY_KEYS = ["ekg", "audiometri", "spirometri", "rontgen", "kimia_darah", "urinalisa", "hematologi", "faeces", "romberg", "srq"];

/** Replika parser.summary_text (backend) agar ringkasan ikut berubah saat variabel dikoreksi. */
function buildSummary(byKey: Record<string, McuField>, v: Record<string, any>): string {
  const num = (x: any) => {
    const n = parseFloat(String(x ?? "").replace(",", "."));
    return Number.isNaN(n) ? null : n;
  };
  const parts: string[] = [];
  const bmi = num(v.bmi);
  if (bmi !== null) parts.push(`BMI ${bmi}` + (v.bmi_category ? ` (${v.bmi_category})` : ""));
  const sys = num(v.bp_systolic);
  if (sys !== null) parts.push(`TD ${sys}/${num(v.bp_diastolic) ?? 0}` + (v.bp_category ? ` (${v.bp_category})` : ""));
  for (const k of SUMMARY_KEYS) {
    const f = byKey[k];
    if (f && v[k] && fieldStatus(f, v[k]) === "PERHATIAN") parts.push(`${f.label}: ${v[k]}`);
  }
  for (const k of ["lab_other", "nonlab_other"]) for (const x of v[k] ?? []) if (String(x).trim()) parts.push(String(x).trim());
  const hasClinical = ["bmi", "bp_systolic", ...SUMMARY_KEYS].some((k) => v[k] !== null && v[k] !== undefined && v[k] !== "");
  return parts.join("; ").slice(0, 2000) || (hasClinical ? "Hasil dalam batas normal." : "");
}

function SuggestionList({ items }: { items: McuSuggestion[] }) {
  if (!items.length) return null;
  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardBody className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <Lightbulb className="size-4" /> Temuan yang relevan untuk keputusan akses (saran sistem — keputusan akhir oleh dokter/admin K3)
        </p>
        <ul className="space-y-1.5 text-sm">
          {items.map((s, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <span className="text-slate-700">• {s.text}</span>
              {s.areas.map((a) => {
                const Icon = AREA_ICON[a];
                return (
                  <Badge key={a} tone="amber" icon={<Icon className="size-3" />}>
                    {AREA_SHORT[a]}
                  </Badge>
                );
              })}
              {s.comorbid && <Badge tone="violet">Pertimbangkan komorbid: {s.comorbid === "HYPERTENSION" ? "Hipertensi" : s.comorbid}</Badge>}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ Unggah → baca → validasi → simpan */

export function McuSmartUpload({
  extractEndpoint,
  confirmEndpoint,
  templateEndpoint = "/api/mcu/template",
  adminMode = false,
  onDone,
}: {
  extractEndpoint: string;
  confirmEndpoint: string;
  templateEndpoint?: string;
  adminMode?: boolean;
  onDone?: () => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [review, setReview] = useState<McuReview | null>(null);
  const [values, setValues] = useState<Record<string, any>>({});
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conclusion, setConclusion] = useState("PENDING");
  const [areas, setAreas] = useState<string[]>([]);
  // null = ringkasan otomatis (mengikuti variabel); string = sudah disunting manual oleh pengguna.
  const [summaryEdit, setSummaryEdit] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const fields = useMemo(() => review?.template.sections.flatMap((s) => s.fields) ?? [], [review]);
  const byKey = useMemo(() => Object.fromEntries(fields.map((f) => [f.key, f])), [fields]);
  const autoSummary = useMemo(() => buildSummary(byKey, values), [byKey, values]);
  const summary = summaryEdit ?? autoSummary;
  const original = review?.values ?? {};
  const edited = fields.filter((f) => !f.readonly && review?.upload_id && review.found_count > 0 && !same(f, original[f.key], values[f.key]));

  function start(r: McuReview) {
    setReview(r);
    setValues({ ...r.values });
    const c = adminMode && r.suggested.conclusion === "PENDING" ? "FIT" : r.suggested.conclusion;
    setConclusion(c);
    setAreas([]);
    setSummaryEdit(null);
    setConfirmed(false);
    setError(null);
  }

  async function read(file: File) {
    setError(null);
    if (file.size > 5 * 1024 * 1024) return setError("Ukuran berkas maksimal 5 MB.");
    const fd = new FormData();
    fd.set("file", file);
    setReading(true);
    try {
      const r = await api<McuReview>(extractEndpoint, { form: fd });
      start(r);
      if (r.found_count > 0) toast.success(`${r.found_count} variabel terbaca`, "Periksa & koreksi sebelum menyimpan.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function manual() {
    setError(null);
    try {
      const template = await api<McuTemplate>(templateEndpoint);
      const empty = Object.fromEntries(template.sections.flatMap((s) => s.fields).map((f) => [f.key, f.type === "list" ? [] : null]));
      start({
        upload_id: null,
        status: "MANUAL",
        status_label: "Diisi manual",
        found_count: 0,
        template,
        values: empty,
        sources: {},
        field_status: {},
        suggestions: [],
        warnings: [],
        identity: { name_match: null, birth_date_match: null },
        profile: { full_name: "", birth_date: null },
        suggested: { mcu_date: null, conclusion: adminMode ? "FIT" : "PENDING", provider: "", doctor_name: "", summary: "" },
      });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function save() {
    setError(null);
    if (!values.mcu_date) return setError("Tanggal MCU wajib diisi.");
    if (conclusion === "FIT_WITH_RESTRICTION" && !areas.length) return setError("Pilih area yang direstriksi dokter.");
    if (!confirmed) return setError("Centang pernyataan bahwa variabel sudah diperiksa.");
    setSaving(true);
    try {
      await api(confirmEndpoint, {
        json: {
          upload_id: review?.upload_id ?? null,
          mcu_date: values.mcu_date,
          conclusion,
          restricted_areas: conclusion === "FIT_WITH_RESTRICTION" ? areas : [],
          provider: values.provider ?? "",
          doctor_name: values.doctor_name ?? "",
          summary,
          details: values,
          confirmed,
        },
      });
      toast.success("MCU tersimpan", adminMode ? "Tercatat terverifikasi (input admin)." : "Menunggu verifikasi admin K3.");
      setReview(null);
      onDone?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const set = (k: string, v: any) => setValues((x) => ({ ...x, [k]: v }));

  if (!review)
    return (
      <div className="space-y-3">
        <label
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center transition hover:border-brand-400 hover:bg-brand-50/40",
            reading && "pointer-events-none opacity-70",
          )}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) read(f);
          }}
        >
          {reading ? <Spinner className="size-7" /> : <FileUp className="size-7 text-brand-600" />}
          <span className="text-sm font-semibold text-slate-800">{reading ? "Membaca dokumen MCU…" : "Unggah hasil MCU (PDF, JPG, atau PNG)"}</span>
          <span className="text-xs text-slate-500">
            PDF format “Kesimpulan Medical Check Up” dibaca otomatis lalu ditampilkan untuk Anda periksa & koreksi. Maks. 5 MB.
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) read(f);
            }}
          />
        </label>
        <button type="button" onClick={manual} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
          <FilePen className="size-4" /> Isi variabel MCU secara manual (tanpa berkas)
        </button>
        <p className="text-xs text-slate-500">
          Dokumen dibaca di server HBAC sendiri — isi MCU tidak dikirim ke layanan AI eksternal. NIK hanya disimpan 4 digit terakhir.
        </p>
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    );

  const changedKeys = new Set(edited.map((f) => f.key));
  const liveSuggestions = review.suggestions;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink-900 px-4 py-3 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <ScanText className="size-5 shrink-0 text-brand-300" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{review.filename ?? "Isi manual"}</p>
            <p className="text-xs text-slate-300">
              {review.status_label}
              {review.found_count > 0 && ` · ${review.found_count} variabel terbaca`}
              {edited.length > 0 && ` · ${edited.length} diubah`}
            </p>
          </div>
        </div>
        <Button size="sm" variant="ghost" className="text-slate-200 hover:bg-white/10 hover:text-white" icon={<RotateCcw className="size-3.5" />} onClick={() => setReview(null)}>
          Ganti berkas
        </Button>
      </div>

      {review.warnings.map((w) => (
        <Alert key={w} tone="warning">
          {w}
        </Alert>
      ))}

      {review.upload_id && review.found_count > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["Nama di dokumen vs profil", review.identity.name_match],
              ["Tanggal lahir di dokumen vs profil", review.identity.birth_date_match],
            ] as [string, boolean | null][]
          ).map(([label, ok]) => (
            <div
              key={label}
              className={cn(
                "flex items-center gap-2 rounded-xl px-3 py-2 text-sm ring-1",
                ok === true ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : ok === false ? "bg-rose-50 text-rose-800 ring-rose-200" : "bg-slate-50 text-slate-600 ring-slate-200",
              )}
            >
              {ok === true ? <CircleCheck className="size-4" /> : ok === false ? <TriangleAlert className="size-4" /> : <CircleHelp className="size-4" />}
              <span className="font-medium">{label}:</span> {ok === true ? "cocok" : ok === false ? "TIDAK cocok — pastikan ini MCU Anda" : "tidak dapat dibandingkan"}
            </div>
          ))}
        </div>
      )}

      {review.template.sections.map((sec) => (
        <Card key={sec.key}>
          <CardBody className="space-y-3">
            <p className="text-sm font-bold text-slate-900">{sec.label}</p>
            <div className="divide-y divide-slate-100">
              {sec.fields.map((f) => {
                const v = values[f.key];
                const st = fieldStatus(f, v);
                const changed = changedKeys.has(f.key);
                return (
                  <div key={f.key} className="grid gap-2 py-2.5 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)_minmax(0,200px)] md:items-start">
                    <div className="pt-1.5 text-sm">
                      <span className="font-medium text-slate-800">{f.label}</span>
                      {f.required && <span className="text-rose-600"> *</span>}
                      {f.unit && <span className="text-xs text-slate-400"> ({f.unit})</span>}
                    </div>
                    <div title={review.sources[f.key] ? `Dibaca dari: ${review.sources[f.key]}` : undefined}>
                      {f.readonly ? (
                        <p className="pt-2 font-mono text-sm text-slate-600">{v || "—"}</p>
                      ) : f.type === "list" ? (
                        <div className="space-y-1.5">
                          {((v as string[]) ?? []).map((item, i) => (
                            <div key={i} className="flex gap-1.5">
                              <Input value={item} onChange={(e) => set(f.key, (v as string[]).map((x, j) => (j === i ? e.target.value : x)))} />
                              <Button size="sm" variant="ghost" aria-label="Hapus" onClick={() => set(f.key, (v as string[]).filter((_, j) => j !== i))}>
                                <X className="size-4" />
                              </Button>
                            </div>
                          ))}
                          <Button size="xs" variant="secondary" icon={<Plus className="size-3" />} onClick={() => set(f.key, [...((v as string[]) ?? []), ""])}>
                            Tambah temuan
                          </Button>
                        </div>
                      ) : f.type === "longtext" ? (
                        <Textarea rows={f.key === "advice" ? 5 : 2} value={v ?? ""} onChange={(e) => set(f.key, e.target.value)} />
                      ) : f.type === "enum" ? (
                        <Select value={v ?? ""} onChange={(e) => set(f.key, e.target.value)}>
                          <option value="">—</option>
                          {Object.entries(f.options ?? {}).map(([k, l]) => (
                            <option key={k} value={k}>
                              {l}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Input
                          type={f.type === "date" ? "date" : "text"}
                          inputMode={f.type === "number" ? "decimal" : undefined}
                          value={v ?? ""}
                          list={f.key === "provider" ? "mcu-providers" : undefined}
                          onChange={(e) => set(f.key, e.target.value)}
                          className={cn(changed && "ring-2 ring-amber-400")}
                        />
                      )}
                      {changed && (
                        <p className="mt-1 text-[11px] text-amber-700">
                          Diubah dari hasil baca: <span className="font-mono">{Array.isArray(original[f.key]) ? original[f.key].join("; ") || "—" : String(original[f.key] ?? "—")}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 md:flex-col md:items-start">
                      {f.type !== "longtext" && <StatusChip s={st} />}
                      {f.ref_label && <span>Patokan: {f.ref_label}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      ))}
      <datalist id="mcu-providers">
        <option value="Kimia Farma Laboratorium & Klinik" />
        <option value="Klinik Perusahaan" />
      </datalist>

      <SuggestionList items={liveSuggestions} />

      <Card className="border-brand-200">
        <CardBody className="space-y-4">
          <p className="text-sm font-bold text-slate-900">Kesimpulan & penyimpanan</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kesimpulan (sesuai dokumen / dokter)" required hint={!adminMode ? "Jika dokumen tidak memuat penilaian (“-”), pilih “Belum ada penilaian” — admin/dokter yang menetapkan saat verifikasi." : undefined}>
              <Select value={conclusion} onChange={(e) => setConclusion(e.target.value)}>
                {CONCLUSIONS.filter(([k]) => !(adminMode && k === "PENDING")).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Klinik / laboratorium" hint="Sama dengan variabel “Klinik / laboratorium” di atas">
              <Input value={values.provider ?? ""} list="mcu-providers" onChange={(e) => set("provider", e.target.value)} />
            </Field>
            <Field label="Dokter pemeriksa" hint="Sama dengan variabel “Dokter pemeriksa (validasi)” di atas">
              <Input value={values.doctor_name ?? ""} onChange={(e) => set("doctor_name", e.target.value)} />
            </Field>
            <Field
              label="Ringkasan hasil"
              hint={summaryEdit === null ? "Disusun otomatis dari variabel — ikut berubah saat variabel dikoreksi" : "Disunting manual — tidak lagi mengikuti variabel"}
            >
              <Textarea rows={2} value={summary} onChange={(e) => setSummaryEdit(e.target.value)} />
              {summaryEdit !== null && (
                <button
                  type="button"
                  onClick={() => setSummaryEdit(null)}
                  className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                >
                  <RotateCcw className="size-3" /> Susun ulang otomatis
                </button>
              )}
            </Field>
          </div>
          {conclusion === "FIT_WITH_RESTRICTION" && (
            <div className="flex flex-wrap gap-2">
              {AREAS.map((a) => {
                const on = areas.includes(a);
                const Icon = AREA_ICON[a];
                return (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setAreas(on ? areas.filter((x) => x !== a) : [...areas, a])}
                    className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium", on ? "border-amber-500 bg-amber-50 text-amber-900" : "border-slate-200 text-slate-600")}
                  >
                    <Icon className="size-4" /> {AREA_SHORT[a]}
                  </button>
                );
              })}
            </div>
          )}
          <Checkbox
            checked={confirmed}
            onChange={setConfirmed}
            label="Saya sudah memeriksa variabel di atas dan sesuai dengan dokumen MCU."
            description={edited.length ? `${edited.length} variabel diubah dari hasil baca otomatis — perubahan ini terlihat oleh admin K3 saat verifikasi.` : undefined}
          />
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button loading={saving} onClick={save} icon={<Save className="size-4" />}>
              Simpan & kirim untuk verifikasi
            </Button>
            <Button variant="ghost" onClick={() => setReview(null)}>
              Batal
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ Tampilan baca-saja (riwayat & verifikasi) */

export function McuDetailsView({
  template,
  details,
  editedFields = [],
  extractedValues = {},
}: {
  template: McuTemplate;
  details: Record<string, any>;
  editedFields?: string[];
  extractedValues?: Record<string, any>;
}) {
  const fmt = (f: McuField, v: any) => {
    if (Array.isArray(v)) return v.length ? v.join("; ") : "—";
    if (v === null || v === undefined || v === "") return "—";
    if (f.type === "date") return fmtDate(String(v));
    if (f.type === "enum") return f.options?.[String(v)] ?? String(v);
    return String(v);
  };
  return (
    <div className="space-y-3">
      {template.sections.map((sec) => (
        <div key={sec.key} className="rounded-xl border border-slate-200">
          <p className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-bold tracking-wide text-slate-600 uppercase">{sec.label}</p>
          <dl className="divide-y divide-slate-100 text-sm">
            {sec.fields
              .filter((f) => details[f.key] !== undefined && f.key !== "advice")
              .map((f) => {
                const st = fieldStatus(f, details[f.key]);
                const changed = editedFields.includes(f.key);
                return (
                  <div key={f.key} className={cn("flex flex-wrap items-start justify-between gap-2 px-3 py-1.5", changed && "bg-amber-50")}>
                    <dt className="text-slate-500">{f.label}</dt>
                    <dd className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 text-right">
                      <span className="font-medium break-words text-slate-800">
                        {fmt(f, details[f.key])}
                        {f.unit && details[f.key] !== null && details[f.key] !== "" ? ` ${f.unit}` : ""}
                      </span>
                      {f.type !== "longtext" && st !== "INFO" && st !== "KOSONG" && <StatusChip s={st} />}
                      {changed && (
                        <span className="w-full text-[11px] text-amber-700">diubah dari hasil baca otomatis: {fmt(f, extractedValues[f.key])}</span>
                      )}
                    </dd>
                  </div>
                );
              })}
          </dl>
        </div>
      ))}
      {details.advice && (
        <div className="rounded-xl border border-slate-200 p-3 text-sm">
          <p className="mb-1 text-xs font-bold tracking-wide text-slate-600 uppercase">Saran</p>
          <p className="whitespace-pre-line text-slate-700">{details.advice}</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Verifikasi MCU oleh admin */

export function McuVerifyModal({
  mcu,
  template,
  onClose,
  onDone,
}: {
  mcu: MCU | null;
  template: McuTemplate | undefined;
  onClose: () => void;
  onDone?: () => void;
}) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [conclusion, setConclusion] = useState("");
  const [areas, setAreas] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!mcu) return null;
  const pending = mcu.conclusion === "PENDING";
  const idc = mcu.identity_check;

  async function decide(decision: "VERIFIED" | "REJECTED") {
    setError(null);
    if (note.trim().length < 5) return setError("Catatan verifikasi wajib diisi (minimal 5 karakter).");
    if (decision === "VERIFIED" && pending && !conclusion) return setError("Tetapkan kesimpulan akhir terlebih dahulu.");
    if (conclusion === "FIT_WITH_RESTRICTION" && !areas.length) return setError("Pilih area yang direstriksi.");
    setBusy(decision);
    try {
      await api(`/api/admin/mcu/${mcu!.id}/verify`, {
        json: { decision, note, conclusion: decision === "VERIFIED" && conclusion ? conclusion : null, restricted_areas: areas },
      });
      toast.success(decision === "VERIFIED" ? "MCU diverifikasi" : "MCU ditolak", "Status akses pekerja dievaluasi ulang.");
      setNote("");
      setConclusion("");
      setAreas([]);
      onDone?.();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-950/50" onClick={onClose} />
      <div className="animate-slide-up relative flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="font-semibold">Verifikasi MCU {mcu.employee?.full_name ? `— ${mcu.employee.full_name}` : ""}</h3>
            <p className="text-sm text-slate-500">
              {mcu.extraction_label ?? "—"} · kesimpulan diinput: {mcu.conclusion_label}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Tutup">
            <X className="size-5" />
          </button>
        </div>
        <div className="scrollbar-thin space-y-4 overflow-y-auto px-5 py-4">
          {idc && (idc.name_match === false || idc.birth_date_match === false) && (
            <Alert tone="danger" title="Identitas dokumen tidak cocok dengan profil">
              {idc.name_match === false && "Nama di dokumen berbeda. "}
              {idc.birth_date_match === false && "Tanggal lahir di dokumen berbeda. "}Pastikan dokumen milik pekerja ini.
            </Alert>
          )}
          {!!mcu.edited_fields?.length && (
            <Alert tone="warning" title={`${mcu.edited_fields.length} variabel diubah pekerja dari hasil baca otomatis`}>
              Baris yang diubah ditandai kuning beserta nilai hasil baca aslinya. Cocokkan dengan dokumen.
            </Alert>
          )}
          {mcu.has_document && (
            <a href={`/api/files/mcu/${mcu.id}`} target="_blank" rel="noreferrer" className="inline-block text-sm font-semibold text-brand-700 hover:underline">
              Buka dokumen asli ({mcu.document_filename}) — akses dicatat di audit log
            </a>
          )}
          {mcu.details && template ? (
            <McuDetailsView template={template} details={mcu.details} editedFields={mcu.edited_fields} extractedValues={mcu.extracted_values} />
          ) : (
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{mcu.summary || "Tidak ada variabel terstruktur."}</p>
          )}
          <SuggestionList items={mcu.suggestions ?? []} />
          <div className="grid gap-4 rounded-xl border border-brand-200 p-4 sm:grid-cols-2">
            <Field
              label={pending ? "Kesimpulan akhir (wajib)" : "Ubah kesimpulan (opsional)"}
              hint="Ditetapkan dokter/admin K3 — prototipe 2 role (§8.2)"
            >
              <Select value={conclusion} onChange={(e) => setConclusion(e.target.value)}>
                <option value="">{pending ? "— Pilih —" : `Tetap: ${mcu.conclusion_label}`}</option>
                {CONCLUSIONS.filter(([k]) => k !== "PENDING").map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Catatan verifikasi" required hint="Tercatat di audit log">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mis. sesuai dokumen asli klinik" />
            </Field>
            {conclusion === "FIT_WITH_RESTRICTION" && (
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                {AREAS.map((a) => {
                  const on = areas.includes(a);
                  const Icon = AREA_ICON[a];
                  return (
                    <button
                      key={a}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setAreas(on ? areas.filter((x) => x !== a) : [...areas, a])}
                      className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium", on ? "border-amber-500 bg-amber-50 text-amber-900" : "border-slate-200 text-slate-600")}
                    >
                      <Icon className="size-4" /> {AREA_SHORT[a]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button variant="danger" loading={busy === "REJECTED"} disabled={!!busy} onClick={() => decide("REJECTED")}>
            Tolak
          </Button>
          <Button variant="success" loading={busy === "VERIFIED"} disabled={!!busy} onClick={() => decide("VERIFIED")}>
            Verifikasi
          </Button>
        </div>
      </div>
    </div>
  );
}

export { SuggestionList };
