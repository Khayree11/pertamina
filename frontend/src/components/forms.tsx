"use client";

import { FileUp, Plus, Save } from "lucide-react";
import { useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useMeta } from "@/lib/hooks";
import { AREA_ICON } from "./status";
import { useToast } from "./toast";
import { Alert, Button, Checkbox, Field, Input, Modal, Select, Textarea, Toggle, cn } from "./ui";

function todayWIB() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

/* ------------------------------------------------------------------ MCU */

export function McuForm({ endpoint, adminMode = false, onDone }: { endpoint: string; adminMode?: boolean; onDone?: () => void }) {
  const toast = useToast();
  const { data: meta } = useMeta();
  const fileRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({
    mcu_date: todayWIB(),
    provider: "",
    conclusion: "FIT",
    restricted: [] as string[],
    doctor_name: "",
    summary: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (f.conclusion === "FIT_WITH_RESTRICTION" && f.restricted.length === 0) {
      setError("Pilih minimal satu area yang direstriksi dokter.");
      return;
    }
    if (file && file.size > 5 * 1024 * 1024) {
      setError("Ukuran berkas maksimal 5 MB.");
      return;
    }
    const fd = new FormData();
    fd.set("mcu_date", f.mcu_date);
    fd.set("provider", f.provider);
    fd.set("conclusion", f.conclusion);
    fd.set("restricted_areas", f.restricted.join(","));
    fd.set("doctor_name", f.doctor_name);
    fd.set("summary", f.summary);
    if (file) fd.set("file", file);
    setBusy(true);
    try {
      await api(endpoint, { form: fd });
      toast.success("Data MCU tersimpan", adminMode ? "Tercatat sebagai terverifikasi (input admin)." : "Menunggu verifikasi admin.");
      setF({ ...f, provider: "", summary: "", doctor_name: "", restricted: [], conclusion: "FIT" });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onDone?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tanggal MCU" required htmlFor="mcu_date">
          <Input id="mcu_date" type="date" max={todayWIB()} value={f.mcu_date} onChange={(e) => setF({ ...f, mcu_date: e.target.value })} required />
        </Field>
        <Field label="Klinik / penyelenggara" htmlFor="provider">
          <Input id="provider" value={f.provider} maxLength={128} onChange={(e) => setF({ ...f, provider: e.target.value })} placeholder="Klinik perusahaan" />
        </Field>
      </div>
      <Field label="Kesimpulan dokter" required htmlFor="conclusion" hint="Sesuai lembar hasil MCU">
        <Select id="conclusion" value={f.conclusion} onChange={(e) => setF({ ...f, conclusion: e.target.value, restricted: [] })}>
          {(meta?.mcu_conclusions ?? [
            { code: "FIT", label: "Fit" },
            { code: "FIT_WITH_RESTRICTION", label: "Fit dengan restriksi" },
            { code: "UNFIT", label: "Tidak fit (unfit)" },
          ]).map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      {f.conclusion === "FIT_WITH_RESTRICTION" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <p className="mb-2 text-sm font-medium text-amber-900">Area yang direstriksi dokter</p>
          <div className="grid grid-cols-2 gap-2">
            {(meta?.areas ?? []).map((a) => {
              const Icon = AREA_ICON[a.code];
              const on = f.restricted.includes(a.code);
              return (
                <button
                  type="button"
                  key={a.code}
                  onClick={() =>
                    setF({ ...f, restricted: on ? f.restricted.filter((x) => x !== a.code) : [...f.restricted, a.code] })
                  }
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium transition",
                    on ? "border-amber-500 bg-white text-amber-900 ring-1 ring-amber-500" : "border-slate-200 bg-white text-slate-600",
                  )}
                  aria-pressed={on}
                >
                  <Icon className="size-4" /> {a.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <Field label="Dokter pemeriksa" htmlFor="doctor">
        <Input id="doctor" value={f.doctor_name} maxLength={128} onChange={(e) => setF({ ...f, doctor_name: e.target.value })} />
      </Field>
      <Field label="Hasil ringkas" htmlFor="summary" hint="Maks. 2000 karakter">
        <Textarea id="summary" rows={3} maxLength={2000} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
      </Field>
      <Field label="Unggah dokumen (opsional)" hint="PDF, JPG, atau PNG — maks. 5 MB">
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-600 hover:border-brand-400">
          <FileUp className="size-5 text-slate-400" />
          <span className="truncate">{file ? file.name : "Pilih berkas hasil MCU"}</span>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </Field>
      {!adminMode && (
        <Alert tone="info">
          MCU yang diinput mandiri berstatus <strong>menunggu verifikasi</strong>. Selama belum diverifikasi admin, area khusus
          berstatus NEEDS_REVIEW (default aman).
        </Alert>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" loading={busy} icon={<Save className="size-4" />}>
        Simpan MCU
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ Komorbid */

export function ComorbidityForm({ endpoint, adminMode = false, onDone }: { endpoint: string; adminMode?: boolean; onDone?: () => void }) {
  const toast = useToast();
  const { data: meta } = useMeta();
  const catalog = meta?.comorbidity_catalog ?? [];
  const [f, setF] = useState({ condition_code: "", other_label: "", controlled: false, diagnosed_date: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.condition_code) return setError("Pilih kondisi dari daftar.");
    if (f.condition_code === "OTHER" && !f.other_label.trim()) return setError("Sebutkan nama kondisi.");
    setBusy(true);
    try {
      await api(endpoint, {
        json: {
          condition_code: f.condition_code,
          other_label: f.condition_code === "OTHER" ? f.other_label : null,
          controlled: f.controlled,
          diagnosed_date: f.diagnosed_date || null,
          notes: f.notes || null,
        },
      });
      toast.success("Komorbid tersimpan", adminMode ? "Tercatat terverifikasi (input admin)." : "Status akses dievaluasi ulang.");
      setF({ condition_code: "", other_label: "", controlled: false, diagnosed_date: "", notes: "" });
      onDone?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Kondisi (daftar terstandar)" required htmlFor="cond">
        <Select id="cond" value={f.condition_code} onChange={(e) => setF({ ...f, condition_code: e.target.value })}>
          <option value="">— Pilih —</option>
          {catalog.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      {f.condition_code === "OTHER" && (
        <Field label="Nama kondisi" required htmlFor="other" hint="Komorbid 'lainnya' akan diklasifikasi admin (area khusus perlu review sementara).">
          <Input id="other" maxLength={128} value={f.other_label} onChange={(e) => setF({ ...f, other_label: e.target.value })} />
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tanggal diagnosis" htmlFor="diag">
          <Input id="diag" type="date" max={todayWIB()} value={f.diagnosed_date} onChange={(e) => setF({ ...f, diagnosed_date: e.target.value })} />
        </Field>
        <Field label="Status">
          <div className="flex h-[42px] items-center">
            <Toggle checked={f.controlled} onChange={(v) => setF({ ...f, controlled: v })} label={f.controlled ? "Terkontrol" : "Tidak terkontrol"} />
          </div>
        </Field>
      </div>
      <Field label="Catatan" htmlFor="cnotes">
        <Textarea id="cnotes" rows={2} maxLength={500} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </Field>
      {!adminMode && (
        <p className="text-xs text-slate-500">
          Klaim “terkontrol” baru dipercaya setelah diverifikasi admin. Data yang sudah diverifikasi hanya dapat diubah admin.
        </p>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" loading={busy} icon={<Plus className="size-4" />}>
        Tambah komorbid
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ Verifikasi (admin) */

export function VerifyModal({
  open,
  onClose,
  endpoint,
  title,
  description,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  endpoint: string;
  title: string;
  description?: React.ReactNode;
  onDone?: () => void;
}) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "VERIFIED" | "REJECTED") {
    setError(null);
    if (note.trim().length < 5) return setError("Catatan verifikasi wajib diisi (minimal 5 karakter).");
    setBusy(decision);
    try {
      await api(endpoint, { json: { decision, note } });
      toast.success(decision === "VERIFIED" ? "Data diverifikasi" : "Data ditolak", "Status akses pekerja dievaluasi ulang.");
      setNote("");
      onDone?.();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button variant="danger" loading={busy === "REJECTED"} disabled={!!busy} onClick={() => decide("REJECTED")}>
            Tolak
          </Button>
          <Button variant="success" loading={busy === "VERIFIED"} disabled={!!busy} onClick={() => decide("VERIFIED")}>
            Verifikasi
          </Button>
        </>
      }
    >
      <Alert tone="warning" className="mb-4">
        Prototipe memiliki 2 role: admin merangkap validasi medis sementara. Versi produksi memerlukan role petugas medis.
      </Alert>
      <Field label="Catatan verifikasi" required hint="Tercatat di audit log">
        <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mis. sesuai dokumen klinik perusahaan" />
      </Field>
      {error && <Alert tone="danger" className="mt-3">{error}</Alert>}
    </Modal>
  );
}

export function ReasonModal({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  tone = "danger",
  minLength = 5,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  minLength?: number;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant={tone}
            loading={busy}
            onClick={async () => {
              setError(null);
              if (reason.trim().length < minLength) return setError(`Alasan wajib diisi (minimal ${minLength} karakter).`);
              setBusy(true);
              try {
                await onConfirm(reason.trim());
                setReason("");
                onClose();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Field label="Alasan" required hint="Tercatat permanen di audit log">
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {error && <Alert tone="danger" className="mt-3">{error}</Alert>}
    </Modal>
  );
}

export { Checkbox };
