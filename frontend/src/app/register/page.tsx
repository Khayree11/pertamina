"use client";

import { UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandLockup } from "@/components/brand";
import { Alert, Button, Card, Checkbox, Field, Input, Select } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { homeFor, useAuth } from "@/lib/auth";

const UNIT_OPTIONS = ["MOR I", "MOR II", "MOR III", "MOR IV", "MOR V"] as const;

export default function RegisterPage() {
  const { user, loading, register } = useAuth();
  const router = useRouter();
  const [f, setF] = useState({ full_name: "", employee_code: "", username: "", unit: "", phone: "", email: "", password: "", confirm: "" });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace(homeFor(user));
  }, [loading, user, router]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    for (const k of ["full_name", "employee_code", "username", "unit", "phone", "password"] as const) if (!f[k].trim()) er[k] = "Wajib diisi";
    if (f.password && (f.password.length < 8 || !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)))
      er.password = "Minimal 8 karakter, memuat huruf dan angka";
    if (f.password !== f.confirm) er.confirm = "Konfirmasi password tidak sama";
    if (!consent) er.consent = "Persetujuan wajib dicentang";
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      const u = await register({
        username: f.username.trim().toLowerCase(),
        password: f.password,
        full_name: f.full_name,
        employee_code: f.employee_code,
        unit: f.unit,
        phone: f.phone,
        email: f.email || null,
        consent,
      });
      router.replace(homeFor(u));
    } catch (err) {
      if (err instanceof ApiError && err.errors?.length) setErrors(Object.fromEntries(err.errors.map((x) => [x.field || "form", x.message])));
      else setErrors({ form: err instanceof Error ? err.message : "Registrasi gagal" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink-900 px-4 py-10">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-8">
          <BrandLockup subtitle="Registrasi pekerja" />
        </div>
        <Card className="p-6 sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight">Buat akun pekerja</h1>
          <p className="mt-1 text-sm text-slate-500">
            Setelah mendaftar, Anda akan diminta melengkapi profil: data umum, MCU tahunan (boleh menyusul), dan data komorbid.
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nama lengkap" required error={errors.full_name} htmlFor="r-name">
                <Input id="r-name" value={f.full_name} onChange={set("full_name")} autoComplete="name" maxLength={128} />
              </Field>
              <Field label="Employee ID" required error={errors.employee_code} htmlFor="r-code" hint="Sesuai ID pekerja Anda">
                <Input id="r-code" value={f.employee_code} onChange={set("employee_code")} placeholder="PTM-2xxx" maxLength={32} />
              </Field>
              <Field label="Unit" required error={errors.unit} htmlFor="r-unit">
                <Select id="r-unit" value={f.unit} onChange={set("unit")}>
                  <option value="">— Pilih Unit —</option>
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Username" required error={errors.username} htmlFor="r-user" hint="Huruf kecil, angka, titik, strip">
                <Input id="r-user" value={f.username} onChange={set("username")} autoComplete="username" maxLength={32} />
              </Field>
              <Field label="Nomor WhatsApp" required error={errors.phone} htmlFor="r-phone">
                <Input id="r-phone" inputMode="tel" value={f.phone} onChange={set("phone")} placeholder="0812xxxxxxx" autoComplete="tel" />
              </Field>
              <Field label="Email (opsional)" error={errors.email} htmlFor="r-email" className="sm:col-span-2">
                <Input id="r-email" type="email" value={f.email} onChange={set("email")} autoComplete="email" />
              </Field>
              <Field label="Password" required error={errors.password} htmlFor="r-pw" hint="Min. 8 karakter, huruf & angka">
                <Input id="r-pw" type="password" value={f.password} onChange={set("password")} autoComplete="new-password" />
              </Field>
              <Field label="Ulangi password" required error={errors.confirm} htmlFor="r-pw2">
                <Input id="r-pw2" type="password" value={f.confirm} onChange={set("confirm")} autoComplete="new-password" />
              </Field>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <Checkbox
                checked={consent}
                onChange={setConsent}
                label="Saya menyetujui pemrosesan data kesehatan saya untuk penilaian kelayakan akses area kerja."
                description="Data kesehatan termasuk data pribadi spesifik (UU No. 27/2022). Data hanya dilihat Anda & admin K3 berwenang, sistem kartu hanya menerima status izin, dan chatbot AI hanya menerima data teranonimkan."
              />
              {errors.consent && <p className="mt-2 text-xs font-medium text-rose-600">{errors.consent}</p>}
            </div>
            {errors.form && <Alert tone="danger">{errors.form}</Alert>}
            <Button type="submit" size="lg" className="w-full" loading={busy} icon={<UserPlus className="size-4" />}>
              Daftar &amp; lanjut lengkapi profil
            </Button>
            <p className="text-center text-sm text-slate-500">
              Sudah punya akun?{" "}
              <Link href="/login" className="font-semibold text-brand-700 hover:underline">
                Masuk
              </Link>
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}
