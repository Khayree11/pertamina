"use client";

import {
  Bot,
  ChevronDown,
  Database,
  EyeOff,
  FileText,
  History,
  LoaderCircle,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { AREA_ICON, StatusBadge } from "@/components/status";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, CardBody, CardHeader, PageHeader, Toggle, cn } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDayShort, fmtTime } from "@/lib/format";
import type { AreaMeta, Status, TapResult } from "@/lib/types";

type Source = { n: number; title: string; heading: string; snippet: string; score: number };
type StatusBlock = {
  title: string;
  focus_area: string | null;
  areas: { area: AreaMeta; status: Status; status_label: string; source: string; valid_until: string | null; tap_preview: TapResult; reasons: string[]; focus: boolean }[];
};
type ChatAnswer = {
  id: number;
  intent: string;
  basis: "DOCUMENTS" | "GENERAL" | "CONVERSATION" | "SAFETY" | "OUT_OF_SCOPE";
  basis_label: string;
  answer: string;
  provider_status: string;
  provider_label: string;
  model: string | null;
  sources: Source[];
  status_block: StatusBlock | null;
  sent_to_ai: {
    sent: boolean;
    question: string;
    personal_context: Record<string, unknown>;
    redactions: Record<string, number>;
    history_turns: number;
    context_chunks: number;
  };
  disclaimer: string;
  latency_ms: number;
};
type Msg = { role: "user"; text: string; at: string } | { role: "assistant"; data: ChatAnswer; at: string } | { role: "error"; text: string; at: string };
type Info = { suggestions: string[]; ai_configured: boolean; model: string; disclaimer: string; free_tier_note: string };

/** Renderer markdown minimal & aman (tanpa innerHTML): paragraf, daftar, **tebal**, rujukan [n]. */
function RichText({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  // Penanda: ***tebal-miring***, **tebal** (boleh berisi *miring*), *miring*, _miring_, rujukan [n].
  const TOKEN = /(\*\*\*[^\n]+?\*\*\*|\*\*[^\n]+?\*\*|(?<![\w*])\*(?!\s)[^*\n]+?\*(?![\w*])|(?<!\w)_[^_\n]+_(?!\w)|\[\d+(?:\s*,\s*\d+)*\])/g;
  const inline = (s: string, key: string): React.ReactNode[] =>
    s.split(TOKEN).map((part, i) => {
      const k = `${key}-${i}`;
      if (!part) return null;
      if (/^\*\*\*[\s\S]+\*\*\*$/.test(part))
        return (
          <strong key={k}>
            <em>{part.slice(3, -3)}</em>
          </strong>
        );
      if (/^\*\*[\s\S]+\*\*$/.test(part)) return <strong key={k}>{inline(part.slice(2, -2), k)}</strong>;
      if (/^\*[^*][\s\S]*\*$/.test(part) || /^_[\s\S]+_$/.test(part)) return <em key={k}>{part.slice(1, -1)}</em>;
      if (/^\[\d+(?:\s*,\s*\d+)*\]$/.test(part))
        return (
          <sup key={k} className="mx-0.5 rounded bg-brand-100 px-1 text-[10px] font-bold text-brand-700">
            {part.slice(1, -1).replace(/\s+/g, "")}
          </sup>
        );
      return <Fragment key={k}>{part.replace(/\*{2,3}/g, "")}</Fragment>;
    });
  return (
    <div className="space-y-2.5 text-[14px] leading-relaxed text-slate-800">
      {blocks.map((b, bi) => {
        const lines = b.split("\n").filter((l) => l.trim());
        if (lines.length && lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
          const ordered = /^\s*\d+[.)]/.test(lines[0]);
          const Tag = ordered ? "ol" : "ul";
          return (
            <Tag key={bi} className={cn("space-y-1 pl-5", ordered ? "list-decimal" : "list-disc")}>
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""), `${bi}-${li}`)}</li>
              ))}
            </Tag>
          );
        }
        return (
          <p key={bi} className="whitespace-pre-line">
            {inline(b, `${bi}`)}
          </p>
        );
      })}
    </div>
  );
}

function AssistantMessage({ d }: { d: ChatAnswer }) {
  const [showSent, setShowSent] = useState(false);
  const [openSrc, setOpenSrc] = useState<number | null>(null);
  const fallback = d.provider_status.startsWith("FALLBACK");
  return (
    <div className="space-y-3">
      {d.status_block && (
        <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
          <div className="flex items-center gap-2 border-b border-brand-100 bg-brand-50 px-4 py-2.5 text-xs font-bold tracking-wide text-brand-800 uppercase">
            <Database className="size-4" /> {d.status_block.title}
          </div>
          <div className="grid gap-2 p-3 sm:grid-cols-2">
            {d.status_block.areas.map((a) => {
              const Icon = AREA_ICON[a.area.code];
              return (
                <div key={a.area.code} className={cn("rounded-xl border p-3", a.focus ? "border-brand-400 ring-1 ring-brand-400" : "border-slate-200")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                      <Icon className="size-4 text-slate-400" /> {a.area.label}
                    </span>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-600">{a.reasons.join(" · ")}</p>
                  {a.source === "OVERRIDE" && <p className="mt-1 text-[11px] font-semibold text-amber-700">Berasal dari override admin</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div
        className={cn(
          "rounded-2xl rounded-tl-sm border p-4 shadow-sm",
          d.basis === "SAFETY" ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white",
        )}
      >
        <div className="mb-2 flex flex-wrap gap-1.5">
          <span
            className={cn(
              "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
              {
                DOCUMENTS: "bg-brand-50 text-brand-700 ring-brand-200",
                GENERAL: "bg-sky-50 text-sky-700 ring-sky-200",
                CONVERSATION: "bg-slate-100 text-slate-600 ring-slate-200",
                SAFETY: "bg-rose-600 text-white ring-rose-600",
                OUT_OF_SCOPE: "bg-slate-100 text-slate-600 ring-slate-200",
              }[d.basis],
            )}
          >
            {d.basis_label}
          </span>
          {fallback && (
            <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
              {d.provider_label}
            </span>
          )}
        </div>
        <RichText text={d.answer} />
        {d.sources.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Sumber dokumen</p>
            <div className="space-y-1.5">
              {d.sources.map((s) => (
                <div key={s.n} className="rounded-lg bg-slate-50 ring-1 ring-slate-200">
                  <button
                    onClick={() => setOpenSrc(openSrc === s.n ? null : s.n)}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs"
                    aria-expanded={openSrc === s.n}
                  >
                    <span className="rounded bg-brand-100 px-1.5 text-[10px] font-bold text-brand-700">{s.n}</span>
                    <FileText className="size-3.5 shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-700">
                      {s.title}
                      {s.heading ? ` — ${s.heading}` : ""}
                    </span>
                    <ChevronDown className={cn("size-3.5 text-slate-400 transition", openSrc === s.n && "rotate-180")} />
                  </button>
                  {openSrc === s.n && <p className="px-3 pb-2.5 text-xs leading-relaxed text-slate-600">{s.snippet}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Sparkles className="size-3.5" /> {d.provider_label} · {(d.latency_ms / 1000).toFixed(1)} dtk
          </span>
          <button onClick={() => setShowSent(!showSent)} className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
            <EyeOff className="size-3.5" /> {showSent ? "Sembunyikan" : "Lihat"} data yang dikirim ke AI
          </button>
        </div>
        {showSent && (
          <div className="mt-2 rounded-xl bg-ink-900 p-3 font-mono text-[11.5px] leading-relaxed text-slate-200">
            <p className="mb-1 font-sans text-[11px] font-semibold text-amber-300">
              {d.sent_to_ai.sent ? "Payload tersanitasi yang dikirim ke Gemini:" : "Tidak ada yang dikirim ke AI (mode tanpa Gemini). Payload yang akan dikirim:"}
            </p>
            <pre className="whitespace-pre-wrap break-words">
              {JSON.stringify(
                {
                  pertanyaan: d.sent_to_ai.question,
                  profil_anonim: d.sent_to_ai.personal_context,
                  riwayat_dianonimkan: d.sent_to_ai.history_turns,
                  potongan_dokumen: d.sent_to_ai.context_chunks,
                  redaksi: d.sent_to_ai.redactions,
                },
                null,
                2,
              )}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

type ConvSummary = { id: string; title: string; updated_at: string; message_count: number };
type StoredMessage = { id: number; role: "user" | "assistant"; content: string; meta: any; created_at: string };
type ConvDetail = { id: string; title: string; messages: StoredMessage[] };

function toMsgs(messages: StoredMessage[]): Msg[] {
  return messages.map((m) =>
    m.role === "user"
      ? { role: "user", text: m.content, at: m.created_at }
      : { role: "assistant", data: { ...(m.meta as ChatAnswer), answer: m.content }, at: m.created_at },
  );
}

export default function AsistenPage() {
  const { user } = useAuth();
  const toast = useToast();
  const { data: info } = useSWR<Info>("/api/chat/info");
  const { data: convs, mutate: reloadConvs } = useSWR<{ items: ConvSummary[] }>("/api/chat/conversations");
  const [convId, setConvId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [personalize, setPersonalize] = useState(true);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const isWorker = user?.role === "WORKER";

  // Memori: muat percakapan terakhir saat halaman dibuka kembali.
  useEffect(() => {
    let alive = true;
    api<{ conversation: ConvDetail | null }>("/api/chat/conversations/latest")
      .then((r) => {
        if (alive && r.conversation) {
          setConvId(r.conversation.id);
          setMsgs(toMsgs(r.conversation.messages));
        }
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  async function openConv(id: string) {
    try {
      const r = await api<{ conversation: ConvDetail }>(`/api/chat/conversations/${id}`);
      setConvId(r.conversation.id);
      setMsgs(toMsgs(r.conversation.messages));
    } catch (e) {
      toast.error("Gagal membuka percakapan", errorMessage(e));
    }
  }

  async function newConv() {
    const r = await api<{ conversation: ConvDetail }>("/api/chat/conversations", { method: "POST" });
    setConvId(r.conversation.id);
    setMsgs([]);
    reloadConvs();
  }

  async function deleteConv() {
    if (!convId || !window.confirm("Hapus percakapan ini secara permanen?")) return;
    try {
      await api(`/api/chat/conversations/${convId}`, { method: "DELETE" });
      toast.success("Percakapan dihapus");
      await newConv();
    } catch (e) {
      toast.error("Gagal menghapus", errorMessage(e));
    }
  }

  async function ask(q: string) {
    const question = q.trim();
    if (question.length < 2 || busy) return;
    const now = new Date().toISOString();
    setMsgs((xs) => [...xs, { role: "user", text: question, at: now }]);
    setText("");
    setBusy(true);
    try {
      // Riwayat percakapan diambil server dari memori tersimpan (versi tersanitasi).
      const d = await api<ChatAnswer & { conversation_id: string }>("/api/chat", {
        json: { question, personalize, conversation_id: convId },
      });
      setConvId(d.conversation_id);
      setMsgs((xs) => [...xs, { role: "assistant", data: d, at: new Date().toISOString() }]);
      reloadConvs();
    } catch (e) {
      setMsgs((xs) => [...xs, { role: "error", text: errorMessage(e), at: new Date().toISOString() }]);
    } finally {
      setBusy(false);
    }
  }

  const convOptions = (convs?.items ?? []).filter((c) => c.message_count > 0 || c.id === convId);

  return (
    <div>
      <PageHeader
        eyebrow="RAG · dokumen SOP/FAQ"
        title="Asisten K3"
        description="Ngobrol santai seputar K3, screening, MCU, dan akses area. Jawaban mengutamakan dokumen SOP/FAQ; di luar dokumen diberi label “informasi umum”. Topik di luar K3 ditolak dengan sopan, dan status akses pribadi dijawab sistem dari database."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="flex min-h-[640px] flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
            <History className="size-4 text-slate-400" />
            <select
              value={convId ?? ""}
              onChange={(e) => e.target.value && openConv(e.target.value)}
              className="max-w-[260px] min-w-0 flex-1 truncate rounded-lg border-0 bg-slate-50 py-1.5 pr-8 pl-2 text-sm ring-1 ring-slate-200 ring-inset focus:ring-2 focus:ring-brand-600"
              aria-label="Riwayat percakapan"
            >
              {!convOptions.length && <option value="">Percakapan baru</option>}
              {convOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} · {fmtDayShort(c.updated_at)}
                </option>
              ))}
            </select>
            <span className="hidden text-xs text-slate-400 sm:inline">Tersimpan otomatis</span>
            <div className="ml-auto flex gap-1.5">
              <Button size="xs" variant="secondary" icon={<Plus className="size-3" />} onClick={newConv} disabled={busy}>
                Percakapan baru
              </Button>
              <Button size="xs" variant="ghost" icon={<Trash2 className="size-3" />} onClick={deleteConv} disabled={busy || !msgs.length}>
                Hapus
              </Button>
            </div>
          </div>
          <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto p-4 sm:p-5" style={{ maxHeight: "68vh" }}>
            {!loaded && (
              <div className="flex justify-center py-10">
                <LoaderCircle className="size-6 animate-spin text-brand-600" />
              </div>
            )}
            {loaded && msgs.length === 0 && (
              <div className="py-6 text-center">
                <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-ink-900 text-white">
                  <Bot className="size-7" />
                </div>
                <p className="mt-3 font-semibold text-slate-900">Ada yang ingin ditanyakan tentang screening atau akses area?</p>
                <p className="mt-1 text-sm text-slate-500">Asisten tidak mendiagnosis, tidak memberi saran pengobatan, dan tidak dapat mengubah akses.</p>
                <div className="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-2">
                  {(info?.suggestions ?? []).map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-left text-sm text-slate-700 shadow-sm transition hover:border-brand-300 hover:bg-brand-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end gap-2">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-2.5 text-[14px] text-white shadow-sm">
                    {m.text}
                    <p className="mt-1 text-right text-[10px] text-white/70">{fmtTime(m.at)}</p>
                  </div>
                  <div className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-200 text-slate-600">
                    <UserIcon className="size-4" />
                  </div>
                </div>
              ) : m.role === "assistant" ? (
                <div key={i} className="flex gap-2">
                  <div className="grid size-8 shrink-0 place-items-center rounded-full bg-ink-900 text-white">
                    <Bot className="size-4" />
                  </div>
                  <div className="min-w-0 max-w-[92%] flex-1">
                    <AssistantMessage d={m.data} />
                  </div>
                </div>
              ) : (
                <Alert key={i} tone="danger">
                  {m.text}
                </Alert>
              ),
            )}
            {busy && (
              <div className="flex gap-2">
                <div className="grid size-8 shrink-0 place-items-center rounded-full bg-ink-900 text-white">
                  <Bot className="size-4" />
                </div>
                <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="size-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d * 120}ms` }} />
                  ))}
                  <span className="ml-2 text-xs text-slate-500">Asisten sedang menyusun jawaban…</span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="border-t border-slate-100 p-3 sm:p-4">
            {isWorker && (
              <div className="mb-2.5">
                <Toggle checked={personalize} onChange={setPersonalize} label="Sesuaikan dengan kategori komorbid saya (dianonimkan)" />
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(text);
              }}
              className="flex items-end gap-2"
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(text);
                  }
                }}
                rows={2}
                maxLength={1000}
                placeholder="Tulis pertanyaan… (Enter untuk kirim)"
                className="max-h-40 min-h-[44px] flex-1 resize-y rounded-xl border-0 px-3.5 py-2.5 text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-brand-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy || text.trim().length < 2}
                className="grid size-11 place-items-center rounded-xl bg-brand-600 text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-40"
                aria-label="Kirim"
              >
                <Send className="size-4" />
              </button>
            </form>
            <p className="mt-2 text-[11px] text-slate-500">{info?.disclaimer}</p>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Status AI" icon={<Sparkles className="size-5" />} />
            <CardBody className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Gemini API</span>
                {info?.ai_configured ? <Badge tone="emerald">Terkonfigurasi</Badge> : <Badge tone="amber">Belum ada API key</Badge>}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Model</span>
                <span className="font-mono text-xs">{info?.model}</span>
              </div>
              {!info?.ai_configured && (
                <p className="text-xs text-slate-500">
                  Tanpa API key, asisten tetap menjawab dalam mode kutipan dokumen (retrieval tetap berjalan lokal).
                </p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Privasi dijaga sanitizer" icon={<ShieldCheck className="size-5" />} />
            <CardBody className="space-y-3 text-sm">
              <div>
                <p className="font-semibold text-emerald-700">Yang boleh dikirim ke AI</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-600">
                  <li>Pertanyaan yang sudah dibersihkan</li>
                  <li>Kategori komorbid generik (mis. “hipertensi”)</li>
                  <li>Kategori area yang ditanyakan</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-rose-700">Tidak pernah dikirim</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-600">
                  <li>Nama, Employee ID, nomor kartu/telepon</li>
                  <li>Nilai tensi, tanggal, isi dokumen MCU</li>
                  <li>Status akses pribadi (dijawab sistem)</li>
                </ul>
              </div>
              <Alert tone="warning">{info?.free_tier_note}</Alert>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
