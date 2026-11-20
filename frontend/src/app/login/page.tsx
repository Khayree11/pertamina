"use client";

import { ArrowRight, LogIn, ShieldCheck, Stethoscope, UserCog } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { BrandLockup } from "@/components/brand";
import { Alert, Button, Field, Input, Spinner, cn } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { homeFor, useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";

type DemoAccount = { username: string; full_name: string; role: string; employee_code: string | null; scenario: string };

const POINTS: [string, string][] = [
  ["Screening harian", "Tensi diinput setiap hari sebelum mulai bekerja."],
  ["Aturan kelayakan", "Aturan tertulis yang dapat diperiksa dan disetujui dokter perusahaan."],
  ["Area khusus", "Wilayah dingin, area panas, ketinggian, serta area paparan BBM."],
  ["Kartu akses", "Hasil tap di pintu selalu mengikuti status terbaru pekerja."],
];

export default function LoginPage() {
  const { user, loading, login, demoLogin } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: demo } = useSWR<{ enabled: boolean; accounts: DemoAccount[] }>("/api/auth/demo-accounts");

  useEffect(() => {
    if (!loading && user) router.replace(homeFor(user));
  }, [loading, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("form");
    try {
      const u = await login(username, password);
      router.replace(homeFor(u));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function quick(acc: DemoAccount) {
    setError(null);
    setBusy(acc.username);
    try {
      const u = await demoLogin(acc.username);
      router.replace(homeFor(u));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  const accounts = demo?.accounts ?? [];
  const admins = accounts.filter((a) => a.role === "ADMIN");
  const healthAccounts = accounts.filter((a) => a.role === "HEALTH");
  const securityAccounts = accounts.filter((a) => a.role === "SECURITY");
  const workers = accounts.filter((a) => a.role === "WORKER");

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <section className="hidden bg-ink-900 px-12 py-10 text-white lg:flex lg:flex-col xl:px-16">
        <BrandLockup logoClassName="h-10" />
        <div className="mt-auto max-w-lg pt-16">
          <h1 className="text-[2rem] leading-tight font-semibold tracking-tight">Akses area kerja mengikuti kondisi kesehatan harian.</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-300">
            Pekerja mengisi tensi setiap hari sebelum bertugas. Bersama hasil MCU tahunan dan data komorbid, sistem menentukan area
            yang boleh dimasuki, lalu memperbarui hak akses kartu pekerja.
          </p>
          <dl className="mt-10 divide-y divide-white/10 border-y border-white/10 text-sm">
            {POINTS.map(([term, desc]) => (
              <div key={term} className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-4 py-3">
                <dt className="font-medium text-white">{term}</dt>
                <dd className="text-slate-400">{desc}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="mt-12 text-xs text-slate-500">
          Prototipe untuk keperluan tender. Bukan alat diagnosis medis; aturan dan data di dalamnya bersifat simulasi.
        </p>
      </section>

      <section className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-10 lg:hidden">
            <BrandLockup tone="light" logoClassName="h-8" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Masuk</h2>
          <p className="mt-1 text-sm text-slate-500">Gunakan akun pekerja atau admin K3.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Username" htmlFor="username">
              <Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            {error && <Alert tone="danger">{error}</Alert>}
            <Button type="submit" className="w-full" size="lg" loading={busy === "form"} icon={<LogIn className="size-4" />}>
              Masuk
            </Button>
            <p className="text-center text-sm text-slate-500">
              Pekerja baru?{" "}
              <Link href="/register" className="font-semibold text-brand-700 hover:underline">
                Daftar akun
              </Link>
            </p>
          </form>

          {demo?.enabled && (
            <div className="mt-10 border-t border-slate-200 pt-6">
              <p className="text-sm font-semibold text-slate-900">Akun demo</p>
              <p className="mt-0.5 text-xs text-slate-500">Masuk dengan satu klik ke akun contoh berdata fiktif.</p>
              <div className="mt-4 space-y-2">
                {admins.map((a) => (
                  <DemoRow key={a.username} acc={a} busy={busy} onClick={() => quick(a)} admin />
                ))}
                {healthAccounts.map((a) => (
                  <DemoRow key={a.username} acc={a} busy={busy} onClick={() => quick(a)} admin />
                ))}
                {securityAccounts.map((a) => (
                  <DemoRow key={a.username} acc={a} busy={busy} onClick={() => quick(a)} admin />
                ))}
              </div>
              <div className="scrollbar-thin mt-2 max-h-[340px] space-y-2 overflow-y-auto pr-1">
                {workers.map((a) => (
                  <DemoRow key={a.username} acc={a} busy={busy} onClick={() => quick(a)} />
                ))}
              </div>
            </div>
          )}
          {!demo && (
            <div className="mt-8 flex justify-center">
              <Spinner />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

const STAFF_ICON: Record<string, typeof UserCog> = { ADMIN: UserCog, HEALTH: Stethoscope, SECURITY: ShieldCheck };

function DemoRow({ acc, busy, onClick, admin }: { acc: DemoAccount; busy: string | null; onClick: () => void; admin?: boolean }) {
  const StaffIcon = STAFF_ICON[acc.role] ?? UserCog;
  return (
    <button
      onClick={onClick}
      disabled={!!busy}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl border bg-white px-3 py-2.5 text-left transition hover:border-brand-300 hover:shadow-sm disabled:opacity-60",
        admin ? "border-brand-200 bg-brand-50/40" : "border-slate-200",
      )}
    >
      <div
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold",
          admin ? "bg-ink-900 text-white" : "bg-slate-100 text-slate-700",
        )}
      >
        {admin ? <StaffIcon className="size-4" /> : initials(acc.full_name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">
          {acc.full_name}
          {acc.employee_code && <span className="ml-1.5 font-mono text-xs font-medium text-slate-400">{acc.employee_code}</span>}
        </p>
        <p className="truncate text-xs text-slate-500">
          {acc.scenario || (admin ? (acc.role === "HEALTH" ? "Petugas Kesehatan" : acc.role === "SECURITY" ? "Petugas Keamanan" : "Admin K3") : "Pekerja")}
        </p>
      </div>
      {busy === acc.username ? (
        <Spinner className="size-4" />
      ) : (
        <ArrowRight className="size-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
      )}
    </button>
  );
}
