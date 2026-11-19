"use client";

import {
  ArrowRight,
  Bot,
  CircleAlert,
  ClipboardCheck,
  HeartPulse,
  ListChecks,
  MessageSquare,
  ScanLine,
  Siren,
} from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { AreaTile, VirtualCard } from "@/components/access";
import { StatusLegend, VerificationBadge } from "@/components/status";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, PageLoader } from "@/components/ui";
import { WhatsAppPhone } from "@/components/whatsapp";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import type { AssessmentMeta, BPRecord, CardArea, Comorbidity, EmployeeBasic, MCU, NotificationItem } from "@/lib/types";

type Dashboard = {
  employee: EmployeeBasic;
  today: { date: string; bp_submitted: boolean; latest_bp: BPRecord | null; readings_count: number };
  card: CardArea[];
  assessment: AssessmentMeta | null;
  mcu: MCU | null;
  comorbidities: Comorbidity[];
  notifications: NotificationItem[];
  pending: { type: string; label: string; href: string }[];
  disclaimer: string;
};

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false }).format(new Date()));
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 18) return "Selamat sore";
  return "Selamat malam";
}

export default function WorkerDashboard() {
  const { user } = useAuth();
  const { data, error } = useSWR<Dashboard>("/api/me/dashboard", { refreshInterval: 60_000 });
  if (error) return <Alert tone="danger">{error.message}</Alert>;
  if (!data) return <PageLoader />;
  const first = (user?.full_name ?? "").split(" ")[0];
  const urgent = data.assessment?.flags?.includes("URGENT_REVIEW");
  const bp = data.today.latest_bp;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">
          {data.employee.employee_code} · {data.employee.unit}
        </p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
          {greeting()}, {first}
        </h1>
        <p className="mt-1 text-sm text-slate-500">Lakukan screening tensi harian sebelum memasuki area khusus.</p>
      </div>

      {urgent && (
        <Alert tone="danger" title="Hasil screening Anda memerlukan perhatian segera">
          Mohon segera menemui petugas kesehatan/klinik terdekat. Akses area khusus dinonaktifkan sementara dan petugas K3 sudah
          diberi tahu.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {!data.today.bp_submitted ? (
          <Card className="border-rose-200 bg-rose-50/40">
            <CardBody className="flex h-full flex-col justify-between gap-5 p-6">
              <div className="flex items-start gap-4">
                <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-rose-600 text-white">
                  <HeartPulse className="size-6" />
                </div>
                <div>
                  <Badge tone="rose">Belum input hari ini</Badge>
                  <h2 className="mt-2 text-xl font-bold tracking-tight">Screening tensi harian belum dilakukan</h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    Selama tensi hari ini belum diinput, <strong>semua area khusus berstatus DENIED</strong> — hanya akses umum yang
                    aktif. Ukur tensi dengan benar, lalu input hasilnya.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/tensi">
                  <Button size="lg" icon={<HeartPulse className="size-4" />}>
                    Input tensi sekarang
                  </Button>
                </Link>
                <Link href="/asisten">
                  <Button size="lg" variant="secondary" icon={<Bot className="size-4" />}>
                    Cara mengukur yang benar
                  </Button>
                </Link>
              </div>
            </CardBody>
          </Card>
        ) : (
          <Card className="border-emerald-200 bg-emerald-50/40">
            <CardBody className="flex h-full flex-col justify-between gap-5 p-6">
              <div className="flex items-start gap-4">
                <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white">
                  <HeartPulse className="size-6" />
                </div>
                <div className="min-w-0">
                  <Badge tone="emerald">Sudah screening hari ini</Badge>
                  <p className="mt-2 text-sm text-slate-500">Pengukuran terakhir · {fmtTime(bp?.measured_at)} WIB</p>
                  <p className="mt-1 text-4xl font-extrabold tracking-tight text-slate-900">
                    {bp?.systolic}
                    <span className="text-slate-400">/</span>
                    {bp?.diastolic}
                    <span className="ml-2 text-base font-semibold text-slate-500">mmHg</span>
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {bp?.pulse ? `Nadi ${bp.pulse} bpm · ` : ""}
                    {data.today.readings_count} pengukuran hari ini · {bp?.source_label}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/kartu">
                  <Button icon={<ArrowRight className="size-4" />}>Lihat status kartu</Button>
                </Link>
                <Link href="/tensi">
                  <Button variant="secondary">Riwayat &amp; ukur ulang</Button>
                </Link>
              </div>
            </CardBody>
          </Card>
        )}
        <VirtualCard employee={data.employee} card={data.card} />
      </div>

      <section>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Status akses per area</h2>
            <p className="text-sm text-slate-500">
              {data.assessment
                ? `Dievaluasi ${fmtDateTime(data.assessment.assessed_at)} · aturan ${data.assessment.rule_version_label}`
                : "Belum dievaluasi"}
            </p>
          </div>
          <StatusLegend />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          {data.card.map((c) => (
            <AreaTile key={c.area.code} item={c} />
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Perlu tindakan" icon={<CircleAlert className="size-5" />} />
          <CardBody className="space-y-2">
            {data.pending.length === 0 ? (
              <p className="text-sm text-slate-500">Tidak ada. Semua data Anda lengkap.</p>
            ) : (
              data.pending.map((p) => (
                <Link
                  key={p.type}
                  href={p.href}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:border-brand-300 hover:bg-brand-50/40"
                >
                  {p.label}
                  <ArrowRight className="size-4 text-slate-400" />
                </Link>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="MCU tahunan"
            icon={<ClipboardCheck className="size-5" />}
            action={
              <Link href="/mcu" className="text-xs font-semibold text-brand-700 hover:underline">
                Kelola
              </Link>
            }
          />
          <CardBody>
            {data.mcu ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Tanggal MCU</span>
                  <span className="font-semibold">{fmtDate(data.mcu.mcu_date)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Berlaku s.d.</span>
                  <span className={data.mcu.expired ? "font-semibold text-rose-700" : "font-semibold"}>
                    {fmtDate(data.mcu.valid_through)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Kesimpulan</span>
                  <span className="font-semibold">{data.mcu.conclusion_label}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Verifikasi</span>
                  <VerificationBadge status={data.mcu.verification_status} />
                </div>
                {data.mcu.expired ? (
                  <Alert tone="warning">MCU kedaluwarsa — area khusus perlu review.</Alert>
                ) : data.mcu.days_left <= 30 ? (
                  <Alert tone="warning">MCU berakhir dalam {data.mcu.days_left} hari.</Alert>
                ) : null}
              </div>
            ) : (
              <EmptyState title="Belum ada data MCU" action={<Link href="/mcu"><Button size="sm">Input MCU</Button></Link>} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Komorbid aktif"
            icon={<ListChecks className="size-5" />}
            action={
              <Link href="/komorbid" className="text-xs font-semibold text-brand-700 hover:underline">
                Kelola
              </Link>
            }
          />
          <CardBody>
            {data.comorbidities.length === 0 ? (
              <p className="text-sm text-slate-500">Tidak ada komorbid tercatat.</p>
            ) : (
              <ul className="space-y-2">
                {data.comorbidities.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-slate-800">{c.label}</span>
                    <span className="flex gap-1">
                      <Badge tone={c.controlled ? "emerald" : "amber"}>{c.controlled ? "Terkontrol" : "Tidak terkontrol"}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <MessageSquare className="size-5 text-brand-600" /> Notifikasi WhatsApp
            </h2>
            <Link href="/notifikasi" className="text-xs font-semibold text-brand-700 hover:underline">
              Semua pesan
            </Link>
          </div>
          <WhatsAppPhone items={data.notifications} phone={data.employee.phone_masked} limit={5} />
        </div>
        <div className="space-y-4">
          <h2 className="text-lg font-bold tracking-tight">Pintasan</h2>
          <Link href="/tap" className="block">
            <Card className="flex items-center gap-4 p-5 transition hover:border-brand-300 hover:shadow-md">
              <div className="grid size-12 place-items-center rounded-2xl bg-brand-600 text-white">
                <ScanLine className="size-6" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">Simulasi tap kartu</p>
                <p className="text-sm text-slate-500">Uji kartu Anda di pintu area: GRANTED / TEMPORARY / DENIED.</p>
              </div>
              <ArrowRight className="size-5 text-slate-300" />
            </Card>
          </Link>
          <Link href="/asisten" className="block">
            <Card className="flex items-center gap-4 p-5 transition hover:border-brand-300 hover:shadow-md">
              <div className="grid size-12 place-items-center rounded-2xl bg-ink-900 text-white">
                <Bot className="size-6" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">Tanya Asisten K3</p>
                <p className="text-sm text-slate-500">Jawaban dari SOP & FAQ — tanpa data pribadi dikirim ke AI.</p>
              </div>
              <ArrowRight className="size-5 text-slate-300" />
            </Card>
          </Link>
          <Alert tone="neutral" title="Penting">
            {data.disclaimer}
          </Alert>
          {data.assessment?.flags?.includes("URGENT_REVIEW") && (
            <Alert tone="danger" title="Flag review segera">
              <span className="inline-flex items-center gap-1">
                <Siren className="size-4" /> Petugas K3 sudah menerima notifikasi.
              </span>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
