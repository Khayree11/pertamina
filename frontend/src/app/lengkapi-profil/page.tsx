"use client";

import { ArrowRight, Check, ClipboardCheck, Clock, ListChecks, LogOut, PartyPopper, UserRound } from "lucide-react";
import { PatraNiagaLogo } from "@/components/brand";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { ComorbidityForm } from "@/components/forms";
import { McuSmartUpload } from "@/components/mcu-intake";
import { GeneralProfileForm } from "@/components/profile";
import { VerificationBadge } from "@/components/status";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, CardBody, PageLoader, cn } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Comorbidity, GeneralProfile, Onboarding } from "@/lib/types";

type StepId = "general" | "mcu" | "comorbid" | "done";
const STEPS: { id: StepId; label: string; icon: typeof UserRound }[] = [
  { id: "general", label: "Data umum", icon: UserRound },
  { id: "mcu", label: "MCU tahunan", icon: ClipboardCheck },
  { id: "comorbid", label: "Komorbid", icon: ListChecks },
  { id: "done", label: "Selesai", icon: Check },
];

export default function LengkapiProfilPage() {
  const { user, loading, logout, refresh } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const isWorker = user?.role === "WORKER";
  const { data, mutate } = useSWR<{ status: Onboarding; profile: GeneralProfile }>(isWorker ? "/api/me/onboarding" : null);
  const { data: com, mutate: reloadCom } = useSWR<{ items: Comorbidity[] }>(isWorker ? "/api/me/comorbidities" : null);
  const [step, setStep] = useState<StepId | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (user.role !== "WORKER") router.replace("/admin");
  }, [loading, user, router]);

  useEffect(() => {
    if (data && step === null) setStep(data.status.next_step ?? "done");
  }, [data, step]);

  if (!data || !step) return <PageLoader label="Menyiapkan formulir profil…" />;
  const st = data.status;
  const done: Record<StepId, boolean> = {
    general: st.general_done,
    mcu: st.mcu !== "MISSING",
    comorbid: st.comorbid_done,
    done: st.completed,
  };
  const activeComorbids = (com?.items ?? []).filter((c) => c.active);

  async function act(key: string, path: string, next: StepId, msg: string) {
    setBusy(key);
    try {
      await api(path, { method: "POST" });
      await mutate();
      toast.success(msg);
      setStep(next);
    } catch (e) {
      toast.error("Gagal", errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function finish() {
    setBusy("finish");
    try {
      await api("/api/me/onboarding/complete", { method: "POST" });
      await refresh();
      toast.success("Profil lengkap", "Selamat datang di HBAC!");
      router.replace("/dashboard");
    } catch (e) {
      toast.error("Belum bisa diselesaikan", errorMessage(e));
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-ink-900 text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex min-w-0 items-center gap-4">
            <PatraNiagaLogo className="h-8" />
            <span aria-hidden className="h-8 w-px shrink-0 bg-white/20" />
            <div className="min-w-0 leading-tight">
              <p className="font-semibold">Lengkapi profil</p>
              <p className="truncate text-xs text-slate-400">
                {data.profile.full_name} · {data.profile.employee_code} · kartu {data.profile.card_number}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-300 hover:bg-white/10 hover:text-white"
            icon={<LogOut className="size-4" />}
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
          >
            Keluar
          </Button>
        </div>
        <div className="mx-auto max-w-4xl px-4 pb-5">
          <ol className="grid grid-cols-4 gap-2">
            {STEPS.map((s, i) => {
              const active = step === s.id;
              const ok = done[s.id];
              return (
                <li key={s.id}>
                  <button
                    onClick={() => setStep(s.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold transition sm:text-sm",
                      active ? "bg-white text-ink-900" : "bg-white/5 text-slate-300 hover:bg-white/10",
                    )}
                    aria-current={active ? "step" : undefined}
                  >
                    <span
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-full text-[11px]",
                        ok ? "bg-emerald-500 text-white" : active ? "bg-brand-600 text-white" : "bg-white/10",
                      )}
                    >
                      {ok ? <Check className="size-3.5" /> : i + 1}
                    </span>
                    <span className="truncate">{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        {step === "general" && (
          <Card>
            <CardBody className="p-5 sm:p-6">
              <h2 className="text-lg font-bold">1. Data umum</h2>
              <p className="mb-5 text-sm text-slate-500">Data diri & kontak darurat. Nomor WhatsApp dipakai untuk notifikasi status akses.</p>
              <GeneralProfileForm
                initial={data.profile}
                submitLabel="Simpan & lanjut"
                onSaved={async () => {
                  await mutate();
                  setStep("mcu");
                }}
              />
            </CardBody>
          </Card>
        )}

        {step === "mcu" && (
          <Card>
            <CardBody className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold">2. MCU tahunan</h2>
                  <p className="text-sm text-slate-500">Wajib. Unggah hasil MCU (gambar JPG/PNG atau PDF) — boleh menyusul.</p>
                </div>
                <Badge tone={st.mcu === "DONE" ? "emerald" : st.mcu === "DEFERRED" ? "amber" : "rose"}>
                  {st.mcu === "DONE" ? "Sudah diunggah" : st.mcu === "DEFERRED" ? "Menyusul" : "Belum ada"}
                </Badge>
              </div>
              {st.mcu === "DONE" ? (
                <div className="mt-5 space-y-4">
                  <Alert tone="success" title="MCU sudah tersimpan">
                    Data MCU Anda menunggu verifikasi admin K3. Selama belum diverifikasi, area khusus berstatus NEEDS_REVIEW.
                  </Alert>
                  <Button icon={<ArrowRight className="size-4" />} onClick={() => setStep("comorbid")}>
                    Lanjut ke komorbid
                  </Button>
                </div>
              ) : (
                <div className="mt-5 space-y-5">
                  <Alert tone="warning" title="Jika MCU menyusul">
                    Akses area khusus (Dingin, Panas, Ketinggian, Gas/BBM) berstatus NEEDS_REVIEW sampai MCU diunggah dan diverifikasi.
                    Pengingat akan tampil di Beranda.
                  </Alert>
                  <McuSmartUpload
                    extractEndpoint="/api/me/mcu/extract"
                    confirmEndpoint="/api/me/mcu/confirm"
                    onDone={async () => {
                      await mutate();
                      setStep("comorbid");
                    }}
                  />
                  <div className="border-t border-slate-100 pt-4">
                    <Button
                      variant="secondary"
                      icon={<Clock className="size-4" />}
                      loading={busy === "defer"}
                      onClick={() => act("defer", "/api/me/onboarding/mcu-defer", "comorbid", "MCU ditandai menyusul")}
                    >
                      Isi nanti — lanjut ke komorbid
                    </Button>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        )}

        {step === "comorbid" && (
          <Card>
            <CardBody className="p-5 sm:p-6">
              <h2 className="text-lg font-bold">3. Penyakit komorbid</h2>
              <p className="mb-5 text-sm text-slate-500">
                Laporkan penyakit penyerta dengan jujur (mis. hipertensi, diabetes, asma/PPOK, jantung). Jika tidak ada, nyatakan di bawah.
              </p>
              {activeComorbids.length > 0 && (
                <ul className="mb-5 space-y-2">
                  {activeComorbids.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                      <span className="font-semibold">{c.label}</span>
                      <span className="flex gap-1.5">
                        <Badge tone={c.controlled ? "emerald" : "amber"}>{c.controlled ? "Terkontrol" : "Tidak terkontrol"}</Badge>
                        <VerificationBadge status={c.verification_status} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
                <div className="rounded-xl border border-slate-200 p-4">
                  <ComorbidityForm
                    endpoint="/api/me/comorbidities"
                    onDone={async () => {
                      await Promise.all([reloadCom(), mutate()]);
                    }}
                  />
                </div>
                <div className="space-y-3">
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={activeComorbids.length > 0}
                    loading={busy === "none"}
                    onClick={() => act("none", "/api/me/onboarding/comorbid-none", "done", "Tercatat: tidak ada komorbid")}
                  >
                    Saya tidak memiliki komorbid
                  </Button>
                  <Button className="w-full" disabled={!st.comorbid_done} icon={<ArrowRight className="size-4" />} onClick={() => setStep("done")}>
                    Lanjut
                  </Button>
                  <p className="text-xs text-slate-500">Klaim “terkontrol” baru dipercaya setelah diverifikasi admin K3.</p>
                </div>
              </div>
            </CardBody>
          </Card>
        )}

        {step === "done" && (
          <Card>
            <CardBody className="p-6 text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-600 text-white">
                <PartyPopper className="size-7" />
              </div>
              <h2 className="mt-3 text-xl font-bold">Hampir selesai</h2>
              <ul className="mx-auto mt-5 max-w-sm space-y-2 text-left text-sm">
                <li className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                  Data umum {st.general_done ? <Badge tone="emerald">Lengkap</Badge> : <Badge tone="rose">Belum</Badge>}
                </li>
                <li className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                  MCU tahunan
                  {st.mcu === "DONE" ? <Badge tone="emerald">Diunggah</Badge> : st.mcu === "DEFERRED" ? <Badge tone="amber">Menyusul (wajib)</Badge> : <Badge tone="rose">Belum</Badge>}
                </li>
                <li className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                  Komorbid {st.comorbid_done ? <Badge tone="emerald">{st.comorbid_count ? `${st.comorbid_count} dicatat` : "Tidak ada"}</Badge> : <Badge tone="rose">Belum</Badge>}
                </li>
              </ul>
              {!st.can_complete ? (
                <Alert tone="warning" className="mx-auto mt-5 max-w-md text-left">
                  Lengkapi langkah yang belum selesai terlebih dahulu.
                </Alert>
              ) : (
                <p className="mx-auto mt-5 max-w-md text-sm text-slate-500">
                  Berikutnya: lakukan <strong>screening tensi harian</strong> sebelum memasuki area khusus.
                </p>
              )}
              <Button size="lg" className="mt-5" disabled={!st.can_complete} loading={busy === "finish"} onClick={finish} icon={<ArrowRight className="size-4" />}>
                Selesai &amp; masuk Beranda
              </Button>
            </CardBody>
          </Card>
        )}
      </main>
    </div>
  );
}
