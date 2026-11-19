"use client";

import { BookOpen, Bot, Cable, Eye, FileUp, MessageSquare, RefreshCw, Server, SlidersHorizontal, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import useSWR from "swr";
import { AREA_SHORT } from "@/components/status";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, CardBody, CardHeader, KeyValue, Modal, PageHeader, PageLoader, Table, Toggle, cn, td, th } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { fmtDateTime, fmtRelative } from "@/lib/format";

type Integrations = {
  access_control: {
    adapter: string;
    simulate_outage: boolean;
    last_success_at: string | null;
    last_failure_at: string | null;
    last_error: string | null;
    success_count: number;
    failure_count: number;
    card_sync_counts: Record<string, number>;
    recent_syncs: { id: number; created_at: string; employee_code: string; status: string; error: string | null; permissions: { area: string; permission: string; reason_category: string; valid_until: string | null }[] }[];
    device_api: { tap_endpoint: string; permissions_endpoint: string; auth_header: string; key_configured: boolean };
    fallback_policy: string;
  };
  whatsapp: {
    provider: string;
    provider_label: string;
    mode: "AKTIF" | "SIMULASI";
    source: string;
    missing: string[];
    sent_today: number;
    queued: number;
    failed: number;
    last_message_at: string | null;
  };
  database: { engine: string; label?: string; host: string | null; database: string | null };
  ai: { configured: boolean; model_chain: string[]; api_base: string; stats: Record<string, any>; chat_total: number; chat_by_status: Record<string, number>; note: string };
  rag: { retriever: string; documents: number; chunks: number };
  rule_engine: { active_version: number; label: string; approved_by_name: string | null };
};
type Doc = { id: number; title: string; source_file: string; category: string; is_sample: boolean; is_active: boolean; chunk_count: number; updated_at: string };

const PERM_CLS: Record<string, string> = {
  GRANT: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  TEMPORARY: "bg-amber-50 text-amber-800 ring-amber-600/25",
  DENY: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

export default function IntegrasiPage() {
  const toast = useToast();
  const { data, mutate } = useSWR<Integrations>("/api/admin/integrations", { refreshInterval: 15_000 });
  const { data: docs, mutate: reloadDocs } = useSWR<{ items: Doc[] }>("/api/admin/documents");
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<{ title: string; chunks: { index: number; heading: string; content: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!data) return <PageLoader />;
  const acs = data.access_control;

  async function act(key: string, fn: () => Promise<any>, ok: string) {
    setBusy(key);
    try {
      const r = await fn();
      toast.success(ok, typeof r === "string" ? r : undefined);
      mutate();
      reloadDocs();
    } catch (e) {
      toast.error("Gagal", errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Status integrasi"
        title="Integrasi & Dokumen"
        description="Semua integrasi eksternal pada prototipe berupa mock dengan antarmuka yang siap diganti adapter vendor."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className={acs.simulate_outage ? "border-rose-300" : ""}>
          <CardHeader
            title="Sistem kartu akses (ACS)"
            subtitle={acs.adapter}
            icon={<Cable className="size-5" />}
            action={acs.simulate_outage ? <Badge tone="rose" icon={<WifiOff className="size-3" />}>GANGGUAN (simulasi)</Badge> : <Badge tone="emerald">Terhubung</Badge>}
          />
          <CardBody className="space-y-4">
            <KeyValue
              items={[
                ["Sinkron berhasil terakhir", acs.last_success_at ? `${fmtDateTime(acs.last_success_at)} (${fmtRelative(acs.last_success_at)})` : "—"],
                ["Gagal terakhir", acs.last_failure_at ? `${fmtDateTime(acs.last_failure_at)} — ${acs.last_error}` : "—"],
                ["Status sinkron kartu", Object.entries(acs.card_sync_counts).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"],
                ["Device API", <span key="d" className="font-mono text-xs">{acs.device_api.tap_endpoint}</span>],
                ["Autentikasi reader", `${acs.device_api.auth_header} ${acs.device_api.key_configured ? "(terkonfigurasi)" : "(belum)"}`],
              ]}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <Toggle
                checked={acs.simulate_outage}
                disabled={busy === "outage"}
                onChange={(v) =>
                  act("outage", () => api("/api/admin/integrations/acs-outage", { json: { simulate_outage: v } }), v ? "Gangguan ACS disimulasikan" : "ACS pulih — sinkron ulang dijalankan")
                }
                label="Simulasikan gangguan ACS"
              />
              <Button size="sm" variant="secondary" icon={<RefreshCw className="size-3.5" />} loading={busy === "resync"} onClick={() => act("resync", () => api("/api/admin/integrations/acs-resync", { method: "POST" }), "Sinkron ulang selesai")}>
                Sinkron ulang semua
              </Button>
            </div>
            <Alert tone={acs.simulate_outage ? "warning" : "neutral"} title="Kebijakan fallback (§8.7)">
              {acs.fallback_policy}
            </Alert>
          </CardBody>
        </Card>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader
              title="Gemini API (chatbot)"
              subtitle={data.ai.api_base}
              icon={<Bot className="size-5" />}
              action={data.ai.configured ? <Badge tone="emerald">API key terpasang</Badge> : <Badge tone="amber">Belum ada API key</Badge>}
            />
            <CardBody className="space-y-3">
              <KeyValue
                items={[
                  ["Rantai model", <span key="m" className="font-mono text-xs">{data.ai.model_chain.join(" → ")}</span>],
                  ["Panggilan (sejak start)", `${data.ai.stats.calls ?? 0} · OK ${data.ai.stats.ok ?? 0} · kuota habis ${data.ai.stats.quota_exhausted ?? 0} · error ${data.ai.stats.errors ?? 0}`],
                  ["Status terakhir", data.ai.stats.last_status ? `${data.ai.stats.last_status} · ${fmtDateTime(data.ai.stats.last_call_at)}` : "—"],
                  ["Total pertanyaan", `${data.ai.chat_total} (${Object.entries(data.ai.chat_by_status).map(([k, v]) => `${k}: ${v}`).join(", ") || "—"})`],
                ]}
              />
              <Alert tone="warning">{data.ai.note}</Alert>
            </CardBody>
          </Card>
          <div className="grid gap-6 sm:grid-cols-2">
            <Card>
              <CardHeader
                title="WhatsApp"
                icon={<MessageSquare className="size-5" />}
                action={<Badge tone={data.whatsapp.mode === "AKTIF" ? "emerald" : "amber"}>{data.whatsapp.mode}</Badge>}
              />
              <CardBody className="text-sm">
                <p className="text-slate-600">{data.whatsapp.provider_label}</p>
                <p className="mt-2 text-2xl font-bold">{data.whatsapp.sent_today}</p>
                <p className="text-xs text-slate-500">
                  pesan hari ini · antre {data.whatsapp.queued} · gagal {data.whatsapp.failed} · terakhir {fmtRelative(data.whatsapp.last_message_at)}
                </p>
                <Link href="/admin/whatsapp" className="mt-2 inline-block text-xs font-semibold text-brand-700 hover:underline">
                  Atur WhatsApp API →
                </Link>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Rule engine & DB" icon={<SlidersHorizontal className="size-5" />} action={<Badge tone="emerald">v{data.rule_engine.active_version}</Badge>} />
              <CardBody className="text-sm">
                <p className="font-medium text-slate-800">{data.rule_engine.label}</p>
                <p className="mt-1 text-xs text-slate-500">Disetujui: {data.rule_engine.approved_by_name ?? "—"}</p>
                <p className="mt-2 text-xs text-slate-600">
                  Database: <strong>{data.database.label ?? data.database.engine}</strong>
                  {data.database.host ? ` @ ${data.database.host}` : ""} · {data.database.database}
                </p>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Sinkronisasi kartu terbaru"
          subtitle="Payload yang dikirim ke sistem kartu — hanya izin per area, tanpa data medis"
          icon={<Server className="size-5" />}
        />
        <Table>
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>Waktu</th>
              <th className={th}>Pekerja</th>
              <th className={th}>Status</th>
              <th className={th}>Izin per area (payload)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {acs.recent_syncs.map((s) => (
              <tr key={s.id}>
                <td className={cn(td, "whitespace-nowrap")}>{fmtDateTime(s.created_at)}</td>
                <td className={cn(td, "font-mono text-xs")}>{s.employee_code}</td>
                <td className={td}>
                  <Badge tone={s.status === "SUCCESS" ? "emerald" : "rose"}>{s.status}</Badge>
                  {s.error && <span className="block text-xs text-rose-600">{s.error}</span>}
                </td>
                <td className={td}>
                  <div className="flex flex-wrap gap-1">
                    {s.permissions.map((p) => (
                      <span key={p.area} className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset", PERM_CLS[p.permission])} title={p.reason_category}>
                        {AREA_SHORT[p.area]}: {p.permission}
                        <span className="ml-1 font-mono font-normal opacity-70">{p.reason_category}</span>
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Dokumen sumber RAG"
          subtitle={`${data.rag.retriever} · ${data.rag.documents} dokumen aktif · ${data.rag.chunks} potongan`}
          icon={<BookOpen className="size-5" />}
          action={
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={<RefreshCw className="size-3.5" />} loading={busy === "reindex"} onClick={() => act("reindex", () => api("/api/admin/documents/reindex", { method: "POST" }), "Indeks diperbarui")}>
                Indeks ulang
              </Button>
              <Button size="sm" icon={<FileUp className="size-3.5" />} loading={busy === "upload"} onClick={() => fileRef.current?.click()}>
                Unggah .md / .txt
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".md,.txt,text/markdown,text/plain"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const fd = new FormData();
                  fd.set("file", f);
                  fd.set("category", "SOP");
                  act("upload", () => api("/api/admin/documents", { form: fd }), `Dokumen “${f.name}” diindeks`).finally(() => {
                    if (fileRef.current) fileRef.current.value = "";
                  });
                }}
              />
            </div>
          }
        />
        <Table>
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>Dokumen</th>
              <th className={th}>Potongan</th>
              <th className={th}>Jenis</th>
              <th className={th}>Diperbarui</th>
              <th className={th}>Aktif</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {docs?.items.map((d) => (
              <tr key={d.id} className={d.is_active ? "" : "opacity-50"}>
                <td className={td}>
                  <span className="font-semibold text-slate-900">{d.title}</span>
                  <span className="block font-mono text-xs text-slate-500">{d.source_file}</span>
                </td>
                <td className={cn(td, "tabular")}>{d.chunk_count}</td>
                <td className={td}>{d.is_sample ? <Badge tone="amber">Contoh simulasi</Badge> : <Badge tone="brand">Unggahan</Badge>}</td>
                <td className={cn(td, "whitespace-nowrap text-xs")}>{fmtDateTime(d.updated_at)}</td>
                <td className={td}>
                  <Toggle
                    checked={d.is_active}
                    onChange={() => act(`t${d.id}`, () => api(`/api/admin/documents/${d.id}/toggle`, { method: "POST" }), d.is_active ? "Dokumen dinonaktifkan" : "Dokumen diaktifkan")}
                  />
                </td>
                <td className={td}>
                  <Button
                    size="xs"
                    variant="ghost"
                    icon={<Eye className="size-3.5" />}
                    onClick={async () => {
                      try {
                        setView(await api(`/api/admin/documents/${d.id}`));
                      } catch (e) {
                        toast.error("Gagal memuat", errorMessage(e));
                      }
                    }}
                  >
                    Potongan
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Modal open={!!view} onClose={() => setView(null)} title={view?.title ?? ""} description={`${view?.chunks.length ?? 0} potongan (chunk) yang diindeks`} size="xl">
        <div className="space-y-3">
          {view?.chunks.map((c) => (
            <div key={c.index} className="rounded-xl border border-slate-200 p-3">
              <p className="text-xs font-semibold text-brand-700">
                #{c.index} · {c.heading || "—"}
              </p>
              <p className="mt-1 text-sm whitespace-pre-line text-slate-700">{c.content}</p>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
