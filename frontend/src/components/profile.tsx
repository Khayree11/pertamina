"use client";

import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import type { GeneralProfile, Onboarding } from "@/lib/types";
import { useToast } from "./toast";
import { Alert, Button, Field, Input, Select } from "./ui";

type Form = {
  full_name: string;
  position: string;
  unit: string;
  work_location: string;
  phone: string;
  email: string;
  birth_date: string;
  gender: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
};

const EMPTY: Form = {
  full_name: "",
  position: "",
  unit: "",
  work_location: "",
  phone: "",
  email: "",
  birth_date: "",
  gender: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
};

const UNIT_OPTIONS = ["MOR I", "MOR II", "MOR III", "MOR IV", "MOR V"] as const;

/** Form data umum pekerja (dipakai di wizard lengkapi profil & halaman profil). */
export function GeneralProfileForm({
  initial,
  submitLabel = "Simpan data umum",
  onSaved,
}: {
  initial?: Partial<GeneralProfile> | null;
  submitLabel?: string;
  onSaved?: (r: { status: Onboarding; profile: GeneralProfile }) => void;
}) {
  const toast = useToast();
  const [f, setF] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!initial) return;
    setF({
      ...EMPTY,
      ...Object.fromEntries(Object.entries(initial).filter(([k, v]) => k in EMPTY && v != null)),
    } as Form);
  }, [initial]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const req: (keyof Form)[] = ["full_name", "position", "unit", "work_location", "phone", "birth_date", "gender", "emergency_contact_name", "emergency_contact_phone"];
    const missing = Object.fromEntries(req.filter((k) => !String(f[k]).trim()).map((k) => [k, "Wajib diisi"]));
    setErrors(missing);
    if (Object.keys(missing).length) return;
    setBusy(true);
    try {
      const r = await api<{ status: Onboarding; profile: GeneralProfile }>("/api/me/profile/general", {
        method: "PUT",
        json: { ...f, email: f.email || null },
      });
      toast.success("Data umum tersimpan");
      onSaved?.(r);
    } catch (err) {
      if (err instanceof ApiError && err.errors?.length) {
        setErrors(Object.fromEntries(err.errors.map((x) => [x.field || "form", x.message])));
      } else {
        setErrors({ form: err instanceof Error ? err.message : "Gagal menyimpan" });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama lengkap" required error={errors.full_name} htmlFor="g-name">
          <Input id="g-name" value={f.full_name} onChange={set("full_name")} maxLength={128} autoComplete="name" />
        </Field>
        <Field label="Jabatan" required error={errors.position} htmlFor="g-pos">
          <Input id="g-pos" value={f.position} onChange={set("position")} maxLength={128} placeholder="Mis. Operator Kilang" />
        </Field>
        <Field label="Unit / departemen" required error={errors.unit} htmlFor="g-unit">
          <Select id="g-unit" value={f.unit} onChange={set("unit")}>
            <option value="">— Pilih Unit —</option>
            {UNIT_OPTIONS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Lokasi kerja" required error={errors.work_location} htmlFor="g-loc">
          <Input id="g-loc" value={f.work_location} onChange={set("work_location")} maxLength={128} placeholder="Mis. Kilang Unit II" />
        </Field>
        <Field label="Tanggal lahir" required error={errors.birth_date} htmlFor="g-bd">
          <Input id="g-bd" type="date" value={f.birth_date} onChange={set("birth_date")} />
        </Field>
        <Field label="Jenis kelamin" required error={errors.gender} htmlFor="g-gender">
          <Select id="g-gender" value={f.gender} onChange={set("gender")}>
            <option value="">— Pilih —</option>
            <option value="L">Laki-laki</option>
            <option value="P">Perempuan</option>
          </Select>
        </Field>
        <Field label="Nomor WhatsApp" required error={errors.phone} htmlFor="g-phone" hint="Untuk notifikasi status akses (tanpa data medis)">
          <Input id="g-phone" inputMode="tel" value={f.phone} onChange={set("phone")} placeholder="0812xxxxxxx" autoComplete="tel" />
        </Field>
        <Field label="Email (opsional)" error={errors.email} htmlFor="g-email">
          <Input id="g-email" type="email" value={f.email} onChange={set("email")} autoComplete="email" />
        </Field>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <p className="mb-3 text-sm font-semibold text-slate-800">Kontak darurat</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama" required error={errors.emergency_contact_name} htmlFor="g-ecn">
            <Input id="g-ecn" value={f.emergency_contact_name} onChange={set("emergency_contact_name")} maxLength={128} />
          </Field>
          <Field label="Nomor telepon" required error={errors.emergency_contact_phone} htmlFor="g-ecp">
            <Input id="g-ecp" inputMode="tel" value={f.emergency_contact_phone} onChange={set("emergency_contact_phone")} />
          </Field>
        </div>
      </div>
      {errors.form && <Alert tone="danger">{errors.form}</Alert>}
      <Button type="submit" loading={busy} icon={<Save className="size-4" />}>
        {submitLabel}
      </Button>
    </form>
  );
}
