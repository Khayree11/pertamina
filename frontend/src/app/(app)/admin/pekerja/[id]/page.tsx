"use client";

import { ArrowLeft, CreditCard, HeartPulse, KeyRound, RefreshCw, Siren, Stethoscope } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { AreaTile } from "@/components/access";
import { FactsTable, OverrideModal, RuleTrace, type OverrideTarget } from "@/components/admin";
import { BpChart } from "@/components/charts";
import { ComorbidityForm, ReasonModal, VerifyModal } from "@/components/forms";
import { McuSmartUpload, McuVerifyModal } from "@/components/mcu-intake";
import { McuCard } from "@/components/health";
import { StatusBadge, TapBadge, VerificationBadge } from "@/components/status";
import { useToast } from "@/components/toast";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  PageLoader,
  Table,
  Tabs,
  cn,
  td,
  th,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useMeta } from "@/lib/hooks";
import { fmtDate, fmtDateTime, fmtTime, initials } from "@/lib/format";
import type {
  AccessEvent,
  AuditItem,
  BPRecord,
  CardArea,
  Comorbidity,
  EmployeeBasic,
  GeneralProfile,
  MCU,
  McuTemplate,
  NotificationItem,
  Onboarding,
  OverrideView,
  Status,
} from "@/lib/types";

type RunView = {
  id: string;
  assessed_at: string;
  trigger: string;
  actor: string;
  rule_version_label: string;
  facts: Record<string, unknown>;
  trace: any[];
  flags: string[];
  areas: Record<string, { status: Status; decisive: { code: string; short: string; detail: string }[] }>;
  valid_until: string;
  engine_error: string | null;
  urgent_ack: { at: string; by: string; note: string } | null;
};

type Detail = {
  employee: EmployeeBasic;
  general: GeneralProfile;
  onboarding: Onboarding;
  account: { username: string; last_login_at: string | null } | null;
  card: CardArea[];
  latest_run: RunView | null;
  bp_history: BPRecord[];
  mcu: MCU[];
  comorbidities: Comorbidity[];
  overrides: OverrideView[];
  notifications: NotificationItem[];
  access_events: AccessEvent[];
  audit: AuditItem[];
};

type TabId = "tensi" | "mcu" | "komorbid" | "override" | "notif" | "tap" | "audit";

const TRIGGERS: Record<string, string> = {
  BP_SUBMITTED: "Input tensi",
  MCU_SUBMITTED: "Input MCU",
  COMORBID_CHANGED: "Perubahan komorbid",
  VERIFICATION: "Verifikasi data",
  ADMIN_REASSESS: "Evaluasi ulang admin",
  RULES_ACTIVATED: "Aktivasi aturan baru",
  EXPIRY: "Kedaluwarsa harian",
  SEED: "Data awal demo",
  DEMO_REFRESH: "Penyegaran demo",
  OVERRIDE_PRECHECK: "Pra-cek override",
};

export default function WorkerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const toast = useToast();
  const { mutate: gmutate } = useSWRConfig();
  const { data: meta } = useMeta();
  const { data, mutate, error } = useSWR<Detail>(`/api/admin/employees/${id}`);
  const [tab, setTab] = useState<TabId>("tensi");
  const [ovTarget, setOvTarget] = useState<OverrideTarget | null>(null);
  const [verify, setVerify] = useState<{ endpoint: string; title: string } | null>(null);
  const [mcuVerify, setMcuVerify] = useState<MCU | null>(null);
  const { data: mcuTemplate } = useSWR<McuTemplate>("/api/mcu/template", { revalidateOnFocus: false });
  const [revoke, setRevoke] = useState<OverrideView | null>(null);
  const [cardModal, setCardModal] = useState(false);
  const [ackModal, setAckModal] = useState(false);
  const [editCom, setEditCom] = useState<{ c: Comorbidity; body: Record<string, unknown>; label: string } | null>(null);
  const [bpOpen, setBpOpen] = useState(false);
  const [reassessing, setReassessing] = useState(false);

  if (error) return <Alert tone="danger">{error.message}</Alert>;
  if (!data) return <PageLoader />;
  const e = data.employee;
  const run = data.latest_run;
  const urgent = run?.flags.includes("URGENT_REVIEW");
  const refresh = () => {
    mutate();
    gmutate("/api/admin/badge");
  };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

  async function reassess() {
    setReassessing(true);
    try {
      const r = await api<{ changes: unknown[] }>(`/api/admin/employees/${id}/reassess`, { method: "POST" });
      toast.success("Evaluasi ulang selesai", `${r.changes.length} perubahan status.`);
      refresh();
    } catch (err) {
      toast.error("Gagal", errorMessage(err));
    } finally {
      setReassessing(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/pekerja" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Daftar pekerja
      </Link>

      <Card>
        <CardBody className="flex flex-col gap-4 p-5 xl:flex-row xl:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-700 text-lg font-bold text-white">
            {initials(e.full_name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">{e.full_name}</h1>
              <Badge tone={e.card_active ? "emerald" : "rose"}>{e.card_active ? "Kartu aktif" : "Kartu nonaktif"}</Badge>
              {urgent && (
                <Badge tone={run?.urgent_ack ? "slate" : "rose"} icon={<Siren className="size-3" />}>
                  {run?.urgent_ack ? "Flag segera — ditangani" : "Flag review segera"}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              <span className="font-mono">{e.employee_code}</span> · {e.position} · {e.unit} · {e.work_location}
            </p>
            <p className="text-xs text-slate-400">
              Kartu <span className="font-mono">{e.card_number}</span> · WA {e.phone_masked} · login terakhir {fmtDateTime(data.account?.last_login_at)}
            </p>
          </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" icon={<HeartPulse className="size-3.5" />} onClick={() => setBpOpen(true)}>
              Input tensi (petugas)
            </Button>
            <Button variant="secondary" size="sm" icon={<RefreshCw className="size-3.5" />} loading={reassessing} onClick={reassess}>
              Evaluasi ulang
            </Button>
            <Button variant={e.card_active ? "danger" : "success"} size="sm" icon={<CreditCard className="size-3.5" />} onClick={() => setCardModal(true)}>
              {e.card_active ? "Nonaktifkan kartu" : "Aktifkan kartu"}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-x-8 gap-y-1 py-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Sumber akun", data.general.registration_source === "SELF" ? "Registrasi mandiri" : "Didaftarkan admin"],
            ["Tanggal lahir", fmtDate(data.general.birth_date)],
            ["Jenis kelamin", data.general.gender === "L" ? "Laki-laki" : data.general.gender === "P" ? "Perempuan" : "—"],
            [
              "Kontak darurat",
              data.general.emergency_contact_name ? `${data.general.emergency_contact_name} · ${data.general.emergency_contact_phone}` : "—",
            ],
            ["Profil", data.onboarding.completed ? "Lengkap" : `Belum lengkap (${data.onboarding.next_step ?? "-"})`],
            ["MCU", data.onboarding.mcu === "DONE" ? "Ada" : data.onboarding.mcu === "DEFERRED" ? "Menyusul (wajib)" : "Belum ada"],
            ["Email", data.general.email || "—"],
            ["WhatsApp", data.general.phone || "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-dashed border-slate-100 py-1.5">
              <span className="text-slate-500">{k}</span>
              <span className="text-right font-medium text-slate-800">{v}</span>
            </div>
          ))}
        </CardBody>
      </Card>

      {urgent && !run?.urgent_ack && (
        <Alert
          tone="danger"
          title="Flag review segera — tensi sangat tinggi hari ini"
          action={
            <Button size="sm" variant="danger" onClick={() => setAckModal(true)}>
              Tandai ditindaklanjuti
            </Button>
          }
        >
          Semua area khusus DENIED otomatis (hard stop — tidak dapat dibuka lewat override). Pastikan pekerja sudah ditangani tenaga
          medis.
        </Alert>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Status kartu per area</h2>
            <p className="text-sm text-slate-500">Klik “Ubah akses” untuk override atau keputusan review (alasan wajib, masa berlaku pendek).</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          {data.card.map((c) => (
            <AreaTile
              key={c.area.code}
              item={c}
              admin
              action={
                <Button size="xs" variant="dark" icon={<KeyRound className="size-3" />} onClick={() => setOvTarget({ employee: e, card: c })}>
                  Ubah akses
                </Button>
              }
            />
          ))}
        </div>
      </section>

      {run && (
        <Card>
          <CardHeader
            title="Penjelasan keputusan (rule engine)"
            subtitle={`${fmtDateTime(run.assessed_at)} · pemicu: ${TRIGGERS[run.trigger] ?? run.trigger} · oleh ${run.actor} · ${run.rule_version_label}`}
            icon={<Stethoscope className="size-5" />}
          />
          <CardBody className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Fakta yang dievaluasi</p>
              <FactsTable facts={run.facts} catalog={meta?.fact_catalog} />
              {run.engine_error && <Alert tone="danger" className="mt-3">Galat engine: {run.engine_error} — semua area NEEDS_REVIEW.</Alert>}
              {run.urgent_ack && (
                <Alert tone="success" className="mt-3" title="Flag segera sudah ditindaklanjuti">
                  {run.urgent_ack.by} · {fmtDateTime(run.urgent_ack.at)} — “{run.urgent_ack.note}”
                </Alert>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Jejak aturan</p>
              <RuleTrace trace={run.trace} />
              <div className="mt-4 grid grid-cols-2 gap-2">
                {Object.entries(run.areas).map(([a, v]) => (
                  <div key={a} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-700">{a}</span>
                      <StatusBadge status={v.status} showCode />
                    </div>
                    <p className="mt-1 text-slate-500">{v.decisive.map((d) => d.code).join(", ")}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <div className="px-5 pt-3">
          <Tabs<TabId>
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "tensi", label: "Tensi", count: data.bp_history.length },
              { id: "mcu", label: "MCU", count: data.mcu.length },
              { id: "komorbid", label: "Komorbid", count: data.comorbidities.length },
              { id: "override", label: "Override", count: data.overrides.length },
              { id: "notif", label: "WhatsApp", count: data.notifications.length },
              { id: "tap", label: "Tap kartu", count: data.access_events.length },
              { id: "audit", label: "Audit", count: data.audit.length },
            ]}
          />
        </div>
        <CardBody>
          {tab === "tensi" &&
            (data.bp_history.length ? (
              <div className="space-y-5">
                <BpChart records={data.bp_history} days={30} today={today} />
                <Table className="max-h-72 rounded-xl border border-slate-200">
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
                    {data.bp_history.map((b) => (
                      <tr key={b.id}>
                        <td className={td}>{fmtDate(b.record_date)}</td>
                        <td className={cn(td, "tabular")}>{fmtTime(b.measured_at)}</td>
                        <td className={cn(td, "tabular font-semibold", (b.systolic >= 140 || b.diastolic >= 90) && "text-rose-700")}>
                          {b.systolic}/{b.diastolic}
                        </td>
                        <td className={cn(td, "tabular")}>{b.pulse ?? "—"}</td>
                        <td className={td}>{b.source_label}</td>
                        <td className={cn(td, "text-slate-500")}>{b.note ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            ) : (
              <EmptyState title="Belum ada data tensi 30 hari terakhir" />
            ))}

          {tab === "mcu" && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div className="space-y-3">
                {data.mcu.length === 0 && <EmptyState title="Belum ada MCU" />}
                {data.mcu.map((m) => (
                  <McuCard
                    key={m.id}
                    m={m}
                    actions={
                      m.verification_status === "UNVERIFIED" ? (
                        <Button size="xs" onClick={() => setMcuVerify({ ...m, employee: e })}>
                          Verifikasi
                        </Button>
                      ) : null
                    }
                  />
                ))}
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-3 text-sm font-semibold">Input MCU oleh admin (langsung terverifikasi)</p>
                <McuSmartUpload
                  extractEndpoint={`/api/admin/employees/${id}/mcu/extract`}
                  confirmEndpoint={`/api/admin/employees/${id}/mcu/confirm`}
                  adminMode
                  onDone={refresh}
                />
              </div>
            </div>
          )}

          {tab === "komorbid" && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div className="space-y-3">
                {data.comorbidities.length === 0 && <EmptyState title="Tidak ada komorbid tercatat" />}
                {data.comorbidities.map((c) => (
                  <div key={c.id} className={cn("rounded-xl border p-4", c.active ? "border-slate-200" : "border-dashed border-slate-200 opacity-60")}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{c.label}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {!c.active && <Badge>Nonaktif</Badge>}
                        <Badge tone={c.controlled ? "emerald" : "amber"}>{c.controlled ? "Terkontrol" : "Tidak terkontrol"}</Badge>
                        <VerificationBadge status={c.verification_status} />
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Diagnosis {fmtDate(c.diagnosed_date)} · diinput {c.entered_by ?? "—"} · {fmtDateTime(c.created_at)}
                      {c.verified_by ? ` · ${c.verification_label} oleh ${c.verified_by}${c.verification_note ? ` — “${c.verification_note}”` : ""}` : ""}
                    </p>
                    {c.notes && <p className="mt-1 text-sm text-slate-600">{c.notes}</p>}
                    {c.active && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {c.verification_status === "UNVERIFIED" && (
                          <Button size="xs" onClick={() => setVerify({ endpoint: `/api/admin/comorbidities/${c.id}/verify`, title: `Verifikasi komorbid: ${c.label}` })}>
                            Verifikasi
                          </Button>
                        )}
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => setEditCom({ c, body: { controlled: !c.controlled }, label: `Tandai ${c.controlled ? "tidak terkontrol" : "terkontrol"}` })}
                        >
                          Tandai {c.controlled ? "tidak terkontrol" : "terkontrol"}
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => setEditCom({ c, body: { active: false }, label: "Nonaktifkan komorbid" })}>
                          Nonaktifkan
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-3 text-sm font-semibold">Tambah komorbid (langsung terverifikasi)</p>
                <ComorbidityForm endpoint={`/api/admin/employees/${id}/comorbidities`} adminMode onDone={refresh} />
              </div>
            </div>
          )}

          {tab === "override" &&
            (data.overrides.length ? (
              <Table>
                <thead className="bg-slate-50">
                  <tr>
                    <th className={th}>Dibuat</th>
                    <th className={th}>Area</th>
                    <th className={th}>Perubahan</th>
                    <th className={th}>Alasan</th>
                    <th className={th}>Status</th>
                    <th className={th}></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.overrides.map((o) => (
                    <tr key={o.id}>
                      <td className={cn(td, "whitespace-nowrap")}>
                        {fmtDateTime(o.created_at)}
                        <span className="block text-xs text-slate-500">{o.admin_name}</span>
                      </td>
                      <td className={td}>{o.area.short}</td>
                      <td className={cn(td, "whitespace-nowrap")}>
                        <span className="text-xs text-slate-500">{o.base_auto_status} →</span> <StatusBadge status={o.new_status} />
                        <span className="block text-xs text-slate-500">
                          {o.kind_label} · s.d. {fmtTime(o.valid_until)}
                        </span>
                      </td>
                      <td className={cn(td, "max-w-xs text-slate-600")}>
                        {o.reason}
                        {o.end_reason && <span className="block text-xs text-slate-400">Berakhir: {o.end_reason}</span>}
                      </td>
                      <td className={td}>
                        <Badge tone={o.state === "ACTIVE" ? "amber" : o.state === "AUTO_REVOKED" ? "rose" : "slate"}>{o.state_label}</Badge>
                      </td>
                      <td className={td}>
                        {o.state === "ACTIVE" && (
                          <Button size="xs" variant="danger" onClick={() => setRevoke(o)}>
                            Cabut
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState title="Belum ada override" />
            ))}

          {tab === "notif" &&
            (data.notifications.length ? (
              <ul className="divide-y divide-slate-100">
                {data.notifications.map((n) => (
                  <li key={n.id} className="py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{fmtDateTime(n.created_at)}</span>
                      <Badge>{n.template}</Badge>
                      <span>
                        ke {n.recipient_label} ({n.to_masked})
                      </span>
                      <Badge tone="amber">{n.status}</Badge>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-slate-700">{n.message}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Belum ada notifikasi" />
            ))}

          {tab === "tap" &&
            (data.access_events.length ? (
              <Table>
                <thead className="bg-slate-50">
                  <tr>
                    <th className={th}>Waktu</th>
                    <th className={th}>Ruangan</th>
                    <th className={th}>Hasil</th>
                    <th className={th}>Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.access_events.map((ev) => (
                    <tr key={ev.id}>
                      <td className={cn(td, "whitespace-nowrap")}>{fmtDateTime(ev.created_at)}</td>
                      <td className={td}>{ev.room_name ?? ev.room_code}</td>
                      <td className={td}>
                        <TapBadge result={ev.result} />
                      </td>
                      <td className={cn(td, "text-slate-500")}>{ev.message}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState title="Belum ada tap kartu" />
            ))}

          {tab === "audit" && (
            <Table>
              <thead className="bg-slate-50">
                <tr>
                  <th className={th}>Waktu</th>
                  <th className={th}>Aksi</th>
                  <th className={th}>Pelaku</th>
                  <th className={th}>Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.audit.map((a) => (
                  <tr key={a.id}>
                    <td className={cn(td, "whitespace-nowrap")}>{fmtDateTime(a.created_at)}</td>
                    <td className={cn(td, "font-mono text-xs font-semibold")}>{a.action}</td>
                    <td className={td}>{a.actor_label}</td>
                    <td className={cn(td, "max-w-md")}>
                      <code className="line-clamp-2 font-mono text-[11px] break-all text-slate-500">{JSON.stringify(a.details)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <OverrideModal target={ovTarget} onClose={() => setOvTarget(null)} onDone={refresh} />
      <McuVerifyModal mcu={mcuVerify} template={mcuTemplate} onClose={() => setMcuVerify(null)} onDone={refresh} />
      <VerifyModal open={!!verify} onClose={() => setVerify(null)} endpoint={verify?.endpoint ?? ""} title={verify?.title ?? ""} onDone={refresh} />
      <ReasonModal
        open={!!revoke}
        onClose={() => setRevoke(null)}
        title="Cabut override"
        description={revoke ? `${revoke.area.label} — status kembali ke evaluasi otomatis` : undefined}
        confirmLabel="Cabut override"
        onConfirm={async (reason) => {
          await api(`/api/admin/overrides/${revoke!.id}/revoke`, { json: { reason } });
          toast.success("Override dicabut");
          refresh();
        }}
      />
      <ReasonModal
        open={cardModal}
        onClose={() => setCardModal(false)}
        title={e.card_active ? "Nonaktifkan kartu" : "Aktifkan kartu"}
        description={e.card_active ? "Semua akses (termasuk area khusus) ditolak di pintu." : "Status kartu dihitung ulang dari evaluasi otomatis."}
        confirmLabel={e.card_active ? "Nonaktifkan" : "Aktifkan"}
        tone={e.card_active ? "danger" : "primary"}
        onConfirm={async (reason) => {
          await api(`/api/admin/employees/${id}/card-status`, { json: { card_active: !e.card_active, reason } });
          toast.success(e.card_active ? "Kartu dinonaktifkan" : "Kartu diaktifkan");
          refresh();
        }}
      />
      <ReasonModal
        open={ackModal}
        onClose={() => setAckModal(false)}
        title="Tindak lanjut flag review segera"
        description="Catat tindakan yang sudah dilakukan (mis. dirujuk ke klinik)."
        confirmLabel="Simpan tindak lanjut"
        tone="primary"
        onConfirm={async (note) => {
          await api(`/api/admin/runs/${run!.id}/ack-urgent`, { json: { note } });
          toast.success("Tindak lanjut tercatat");
          refresh();
        }}
      />
      <ReasonModal
        open={!!editCom}
        onClose={() => setEditCom(null)}
        title={editCom?.label ?? ""}
        description="Perubahan oleh admin tercatat sebagai data terverifikasi."
        confirmLabel="Simpan"
        tone="primary"
        onConfirm={async (reason) => {
          await api(`/api/admin/comorbidities/${editCom!.c.id}`, { method: "PATCH", json: { ...editCom!.body, change_reason: reason } });
          toast.success("Komorbid diperbarui");
          refresh();
        }}
      />
      <OfficerBpModal open={bpOpen} onClose={() => setBpOpen(false)} employeeId={id} onDone={refresh} />
    </div>
  );
}

function OfficerBpModal({ open, onClose, employeeId, onDone }: { open: boolean; onClose: () => void; employeeId: string; onDone: () => void }) {
  const toast = useToast();
  const [s, setS] = useState("");
  const [d, setD] = useState("");
  const [p, setP] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Input tensi oleh petugas"
      description="Mitigasi akurasi input manual (§8.5): pengukuran dilakukan/disaksikan petugas."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setErr(null);
              setBusy(true);
              try {
                await api(`/api/admin/employees/${employeeId}/bp`, {
                  json: { systolic: Number(s), diastolic: Number(d), pulse: p ? Number(p) : null, note: "Diukur petugas" },
                });
                toast.success("Tensi tersimpan", "Status akses dievaluasi ulang.");
                setS("");
                setD("");
                setP("");
                onDone();
                onClose();
              } catch (e) {
                setErr(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Simpan
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label="Sistolik" required>
          <Input inputMode="numeric" value={s} onChange={(e) => setS(e.target.value)} />
        </Field>
        <Field label="Diastolik" required>
          <Input inputMode="numeric" value={d} onChange={(e) => setD(e.target.value)} />
        </Field>
        <Field label="Nadi">
          <Input inputMode="numeric" value={p} onChange={(e) => setP(e.target.value)} />
        </Field>
      </div>
      {err && <Alert tone="danger" className="mt-3">{err}</Alert>}
    </Modal>
  );
}
