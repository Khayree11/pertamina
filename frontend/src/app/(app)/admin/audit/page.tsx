"use client";

import { Bot, ChevronDown, Link2, Lock, ScrollText, ShieldCheck, ShieldX } from "lucide-react";
import { Fragment, useState } from "react";
import useSWR from "swr";
import { Alert, Badge, Button, Card, CardBody, EmptyState, Input, PageHeader, PageLoader, Select, Table, Tabs, cn, td, th } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import type { AuditItem } from "@/lib/types";

type AiLog = {
  id: number;
  created_at: string;
  user: string;
  intent: string;
  sanitized_question: string;
  personal_context: Record<string, unknown>;
  prompt_sent: string | null;
  model: string | null;
  provider_status: string;
  answer: string;
  sources: { n: number; title: string; heading: string; score: number }[];
  redactions: Record<string, number>;
  latency_ms: number;
  error: string | null;
};

function AuditTab() {
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [beforeId, setBeforeId] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const qs = new URLSearchParams({ action, actor, limit: "100", ...(beforeId ? { before_id: String(beforeId) } : {}) }).toString();
  const { data } = useSWR<{ items: (AuditItem & { employee_code: string | null })[]; actions: string[]; total: number }>(`/api/admin/audit?${qs}`, { keepPreviousData: true });
  const { data: chain, mutate: recheck, isValidating } = useSWR<{ ok: boolean; checked: number; broken_at_id: number | null; head_hash?: string }>("/api/admin/audit/verify");

  return (
    <div className="space-y-4">
      {chain && (
        <Alert
          tone={chain.ok ? "success" : "danger"}
          title={chain.ok ? `Rantai hash utuh — ${chain.checked} catatan terverifikasi` : `Rantai hash rusak pada catatan #${chain.broken_at_id}`}
          action={
            <Button size="sm" variant="secondary" loading={isValidating} onClick={() => recheck()}>
              Verifikasi ulang
            </Button>
          }
        >
          <span className="inline-flex flex-wrap items-center gap-1">
            {chain.ok ? <ShieldCheck className="size-4" /> : <ShieldX className="size-4" />}
            Audit log append-only: tidak ada fitur ubah/hapus, trigger database memblokir UPDATE/DELETE, dan setiap catatan memuat hash
            catatan sebelumnya.
            {chain.head_hash && <code className="ml-1 font-mono text-[11px]">head {chain.head_hash.slice(0, 16)}…</code>}
          </span>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Select
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setBeforeId(null);
          }}
          className="w-auto"
          aria-label="Aksi"
        >
          <option value="">Semua aksi</option>
          {data?.actions.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </Select>
        <Input
          value={actor}
          onChange={(e) => {
            setActor(e.target.value);
            setBeforeId(null);
          }}
          placeholder="Pelaku (username / system)"
          className="w-56"
          aria-label="Pelaku"
        />
        {beforeId && (
          <Button variant="ghost" onClick={() => setBeforeId(null)}>
            Kembali ke terbaru
          </Button>
        )}
      </div>
      <Card className="overflow-hidden">
        {!data ? (
          <PageLoader />
        ) : data.items.length === 0 ? (
          <EmptyState icon={<ScrollText className="size-6" />} title="Tidak ada catatan" />
        ) : (
          <Table>
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>#</th>
                <th className={th}>Waktu</th>
                <th className={th}>Pelaku</th>
                <th className={th}>Aksi</th>
                <th className={th}>Entitas</th>
                <th className={th}>Hash</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((a) => (
                <Fragment key={a.id}>
                  <tr className="hover:bg-slate-50/60">
                    <td className={cn(td, "tabular text-xs text-slate-400")}>{a.id}</td>
                    <td className={cn(td, "whitespace-nowrap")}>{fmtDateTime(a.created_at)}</td>
                    <td className={td}>
                      <span className="font-medium text-slate-800">{a.actor_label}</span>
                      <span className="block text-[11px] text-slate-500">{a.actor_role}</span>
                    </td>
                    <td className={cn(td, "font-mono text-xs font-semibold")}>{a.action}</td>
                    <td className={cn(td, "text-xs")}>
                      {a.entity_type}
                      {a.entity_id ? ` #${a.entity_id.length > 10 ? a.entity_id.slice(0, 8) + "…" : a.entity_id}` : ""}
                      {a.employee_code && <span className="block font-mono text-slate-500">{a.employee_code}</span>}
                    </td>
                    <td className={cn(td, "font-mono text-[11px] text-slate-400")} title={`prev: ${a.prev_hash ?? "GENESIS"}`}>
                      <span className="inline-flex items-center gap-1">
                        <Link2 className="size-3" />
                        {a.hash.slice(0, 10)}
                      </span>
                    </td>
                    <td className={td}>
                      <button onClick={() => setOpen(open === a.id ? null : a.id)} className="text-slate-400 hover:text-slate-700" aria-label="Detail">
                        <ChevronDown className={cn("size-4 transition", open === a.id && "rotate-180")} />
                      </button>
                    </td>
                  </tr>
                  {open === a.id && (
                    <tr>
                      <td colSpan={7} className="bg-slate-50 px-4 py-3">
                        <pre className="max-h-64 overflow-auto rounded-lg bg-ink-900 p-3 font-mono text-[11.5px] text-slate-200">
                          {JSON.stringify(a.details, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {data && data.items.length === 100 && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => setBeforeId(data.items[data.items.length - 1].id)}>
            Muat lebih lama
          </Button>
        </div>
      )}
      {data && <p className="text-xs text-slate-500">Total {data.total} catatan audit.</p>}
    </div>
  );
}

function AiTab() {
  const { data } = useSWR<{ items: AiLog[] }>("/api/admin/ai-logs");
  const [open, setOpen] = useState<number | null>(null);
  if (!data) return <PageLoader />;
  return (
    <div className="space-y-4">
      <Alert tone="info" title="Log prompt tersanitasi (§6)">
        Yang tersimpan adalah pertanyaan yang sudah dibersihkan dan prompt yang benar-benar dikirim ke Gemini — bukan pertanyaan asli.
        Gunakan untuk audit bahwa tidak ada data pribadi yang keluar.
      </Alert>
      {data.items.length === 0 ? (
        <EmptyState icon={<Bot className="size-6" />} title="Belum ada pertanyaan ke asisten" />
      ) : (
        data.items.map((l) => (
          <Card key={l.id}>
            <CardBody>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{fmtDateTime(l.created_at)}</span>
                <span>· {l.user}</span>
                <Badge tone={l.intent === "PERSONAL_STATUS" ? "brand" : "slate"}>{l.intent}</Badge>
                <Badge tone={l.provider_status === "GEMINI" ? "emerald" : "amber"}>{l.provider_status}</Badge>
                {l.model && <span className="font-mono">{l.model}</span>}
                <span>· {l.latency_ms} ms</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-900">“{l.sanitized_question}”</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <Lock className="size-3" /> Profil anonim:
                </span>
                <code className="rounded bg-slate-100 px-1.5 font-mono text-[11px]">{JSON.stringify(l.personal_context)}</code>
                {Object.keys(l.redactions).length > 0 && (
                  <>
                    <span className="text-slate-500">Redaksi:</span>
                    {Object.entries(l.redactions).map(([k, v]) => (
                      <Badge key={k} tone="rose">
                        {k} ×{v}
                      </Badge>
                    ))}
                  </>
                )}
              </div>
              <button onClick={() => setOpen(open === l.id ? null : l.id)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                <ChevronDown className={cn("size-3.5 transition", open === l.id && "rotate-180")} />
                {open === l.id ? "Sembunyikan" : "Lihat"} prompt & jawaban
              </button>
              {open === l.id && (
                <div className="mt-2 grid gap-3 lg:grid-cols-2">
                  <div>
                    <p className="mb-1 text-[11px] font-semibold text-slate-500 uppercase">Prompt dikirim</p>
                    <pre className="max-h-72 overflow-auto rounded-lg bg-ink-900 p-3 font-mono text-[11px] whitespace-pre-wrap text-slate-200">
                      {l.prompt_sent ?? "(tidak dikirim ke AI — mode tanpa Gemini / tanpa konteks)"}
                    </pre>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-semibold text-slate-500 uppercase">Jawaban</p>
                    <pre className="max-h-72 overflow-auto rounded-lg bg-slate-50 p-3 text-[12px] whitespace-pre-wrap text-slate-700 ring-1 ring-slate-200">{l.answer}</pre>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        ))
      )}
    </div>
  );
}

export default function AuditPage() {
  const [tab, setTab] = useState<"audit" | "ai">("audit");
  return (
    <div>
      <PageHeader
        eyebrow="Akuntabilitas"
        title="Audit Log"
        description="Seluruh input data, evaluasi aturan, perubahan akses, override, aktivasi aturan, dan akses dokumen medis oleh admin."
      />
      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "audit", label: "Audit log" },
          { id: "ai", label: "Log AI (prompt tersanitasi)" },
        ]}
      />
      {tab === "audit" ? <AuditTab /> : <AiTab />}
    </div>
  );
}
