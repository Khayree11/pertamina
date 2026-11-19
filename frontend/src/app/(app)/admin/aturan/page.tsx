"use client";

import { ArrowRight, FlaskConical, History, Play, RotateCcw, Save, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { AREA_SHORT, STATUS_META, StatusBadge } from "@/components/status";
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
  KeyValue,
  Modal,
  PageHeader,
  PageLoader,
  Table,
  Tabs,
  Textarea,
  cn,
  td,
  th,
} from "@/components/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { Status } from "@/lib/types";

type RuleSummary = {
  id: number;
  version: number;
  label: string;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  notes: string | null;
  created_at: string;
  created_by: string;
  activated_at: string | null;
  activated_by: string | null;
  approved_by_name: string | null;
  approval_note: string | null;
  rule_count: number;
};
type Cond = { all?: Cond[]; any?: Cond[]; not?: Cond; fact?: string; op?: string; value?: unknown };
type Rule = {
  id: string;
  name: string;
  origin?: string;
  when: Cond;
  effects?: Record<string, Status>;
  effects_from_fact?: { fact: string; status: Status };
  reason: string;
  flags?: string[];
  enabled?: boolean;
};
type Config = {
  label: string;
  disclaimer: string;
  special_areas: string[];
  settings: Record<string, unknown>;
  comorbidity_catalog: { code: string; label: string }[];
  reason_catalog: Record<string, { short: string; detail?: string }>;
  rules: Rule[];
};
type Preview = { changes: { employee: { employee_code: string; full_name: string }; area: { code: string }; current: Status; draft: Status; draft_reasons: string[] }[]; unchanged_pairs: number };

const OPS: Record<string, string> = {
  "==": "=",
  "!=": "≠",
  ">": ">",
  ">=": "≥",
  "<": "<",
  "<=": "≤",
  in: "∈",
  not_in: "∉",
  contains: "berisi",
  not_contains: "tidak berisi",
  exists: "ada",
  not_exists: "tidak ada",
  is_true: "= ya",
  is_false: "= tidak",
};

function CondView({ c, depth = 0 }: { c: Cond; depth?: number }): React.ReactElement {
  if (c.all || c.any) {
    const items = (c.all ?? c.any)!;
    const join = c.all ? "DAN" : "ATAU";
    return (
      <span className={cn(depth > 0 && "rounded bg-slate-100 px-1 py-0.5")}>
        {depth > 0 && "("}
        {items.map((x, i) => (
          <span key={i}>
            {i > 0 && <span className="mx-1 text-[10px] font-bold text-brand-700">{join}</span>}
            <CondView c={x} depth={depth + 1} />
          </span>
        ))}
        {depth > 0 && ")"}
      </span>
    );
  }
  if (c.not) {
    return (
      <span>
        <span className="mr-1 text-[10px] font-bold text-rose-700">BUKAN</span>
        <CondView c={c.not} depth={depth + 1} />
      </span>
    );
  }
  const needsValue = !["exists", "not_exists", "is_true", "is_false"].includes(c.op ?? "");
  return (
    <span className="font-mono text-[12px]">
      <span className="text-slate-700">{c.fact}</span> <span className="font-bold text-slate-900">{OPS[c.op ?? ""] ?? c.op}</span>
      {needsValue && <span className="text-brand-700"> {JSON.stringify(c.value)}</span>}
    </span>
  );
}

function Effects({ r }: { r: Rule }) {
  if (r.effects_from_fact)
    return (
      <span className="text-xs">
        Area pada <code className="font-mono">{r.effects_from_fact.fact}</code> → <StatusBadge status={r.effects_from_fact.status} showCode />
      </span>
    );
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(r.effects ?? {}).map(([k, s]) => (
        <span key={k} className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset", STATUS_META[s].badge)}>
          {k === "ALL_SPECIAL" ? "Semua area" : k === "OTHERS" ? "Area lain" : AREA_SHORT[k] ?? k}: {s}
        </span>
      ))}
    </div>
  );
}

type TabId = "rules" | "settings" | "versions" | "editor";

export default function AturanPage() {
  const toast = useToast();
  const { mutate: gm } = useSWRConfig();
  const { data: list, mutate: reloadList } = useSWR<{ items: RuleSummary[] }>("/api/admin/rules");
  const active = list?.items.find((r) => r.status === "ACTIVE");
  const { data: activeDetail } = useSWR<RuleSummary & { config: Config }>(active ? `/api/admin/rules/${active.id}` : null);
  const [tab, setTab] = useState<TabId>("rules");
  const [json, setJson] = useState("");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [activate, setActivate] = useState<RuleSummary | null>(null);
  const [approver, setApprover] = useState("");
  const [approvalNote, setApprovalNote] = useState("");

  useEffect(() => {
    if (activeDetail && !json) setJson(JSON.stringify(activeDetail.config, null, 2));
  }, [activeDetail, json]);

  const parsed = useMemo(() => {
    try {
      return { ok: true as const, value: JSON.parse(json) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [json]);

  if (!list || !activeDetail) return <PageLoader />;
  const cfg = activeDetail.config;

  async function runPreview() {
    setErrors([]);
    setPreview(null);
    if (!parsed.ok) return setErrors([`JSON tidak valid: ${parsed.error}`]);
    setBusy("preview");
    try {
      setPreview(await api<Preview>("/api/admin/rules/preview", { json: { config: parsed.value } }));
    } catch (e) {
      setErrors(e instanceof ApiError && e.errors ? e.errors.map((x: any) => (typeof x === "string" ? x : x.message)) : [errorMessage(e)]);
    } finally {
      setBusy(null);
    }
  }

  async function saveDraft() {
    setErrors([]);
    if (!parsed.ok) return setErrors([`JSON tidak valid: ${parsed.error}`]);
    if (label.trim().length < 3) return setErrors(["Label versi wajib diisi (minimal 3 karakter)."]);
    setBusy("save");
    try {
      const r = await api<RuleSummary>("/api/admin/rules", { json: { label, notes: notes || null, config: parsed.value } });
      toast.success(`Draft v${r.version} tersimpan`, "Aktifkan setelah disetujui dokter perusahaan.");
      reloadList();
      setTab("versions");
    } catch (e) {
      setErrors(e instanceof ApiError && e.errors ? e.errors.map((x: any) => (typeof x === "string" ? x : x.message)) : [errorMessage(e)]);
    } finally {
      setBusy(null);
    }
  }

  async function doActivate() {
    if (!activate) return;
    setBusy("activate");
    try {
      const r = await api<{ activated: number; reassessed: number }>(`/api/admin/rules/${activate.id}/activate`, {
        json: { approved_by_name: approver, approval_note: approvalNote },
      });
      toast.success(`Aturan v${r.activated} aktif`, `${r.reassessed} pekerja dievaluasi ulang.`);
      setActivate(null);
      setApprover("");
      setApprovalNote("");
      setJson("");
      reloadList();
      gm("/api/meta");
      gm("/api/admin/badge");
    } catch (e) {
      toast.error("Gagal mengaktifkan", errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Rule engine"
        title="Aturan Kelayakan"
        description="Deterministik, dapat dijelaskan — bukan LLM. Aturan disimpan sebagai konfigurasi berversi sehingga bisa diubah tanpa deploy ulang."
      />
      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="border-brand-200">
          <CardBody className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
              <SlidersHorizontal className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-bold">v{activeDetail.version}</p>
                <Badge tone="emerald">AKTIF</Badge>
                <span className="text-sm text-slate-600">{activeDetail.label}</span>
              </div>
              <KeyValue
                className="mt-2"
                items={[
                  ["Disetujui oleh", activeDetail.approved_by_name ?? "—"],
                  ["Catatan persetujuan", activeDetail.approval_note ?? "—"],
                  ["Aktif sejak", fmtDateTime(activeDetail.activated_at)],
                  ["Jumlah aturan", `${activeDetail.rule_count} aturan`],
                ]}
              />
            </div>
          </CardBody>
        </Card>
        <Alert tone="warning" title="Siapa yang menetapkan aturan?">
          {cfg.disclaimer}
        </Alert>
      </div>

      <Card>
        <div className="px-5 pt-3">
          <Tabs<TabId>
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "rules", label: "Aturan aktif", count: cfg.rules.length },
              { id: "settings", label: "Pengaturan & katalog" },
              { id: "versions", label: "Riwayat versi", count: list.items.length },
              { id: "editor", label: "Buat versi baru" },
            ]}
          />
        </div>
        <CardBody>
          {tab === "rules" && (
            <>
              <p className="mb-3 text-sm text-slate-500">
                Kombinasi beberapa aturan selalu mengambil status <strong>paling ketat</strong> (DENIED &gt; NEEDS_REVIEW &gt; RESTRICTED &gt; ALLOWED).
                Fakta yang tidak tersedia membuat aturan bernilai <em>tidak pasti</em> → NEEDS_REVIEW (default aman).
              </p>
              <Table className="rounded-xl border border-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={th}>ID</th>
                    <th className={th}>Aturan</th>
                    <th className={th}>Kondisi</th>
                    <th className={th}>Efek</th>
                    <th className={th}>Alasan (ke pekerja)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cfg.rules.map((r) => (
                    <tr key={r.id} className={r.enabled === false ? "opacity-50" : ""}>
                      <td className={cn(td, "font-mono text-xs font-semibold")}>{r.id}</td>
                      <td className={cn(td, "min-w-48")}>
                        <span className="font-semibold text-slate-900">{r.name}</span>
                        {r.flags?.length ? (
                          <Badge tone="rose" className="ml-1.5">
                            {r.flags.join(", ")}
                          </Badge>
                        ) : null}
                        {r.origin && <span className="mt-0.5 block text-xs text-slate-500">{r.origin}</span>}
                      </td>
                      <td className={cn(td, "min-w-64 leading-relaxed")}>
                        <CondView c={r.when} />
                      </td>
                      <td className={cn(td, "min-w-52")}>
                        <Effects r={r} />
                      </td>
                      <td className={cn(td, "min-w-48 text-xs text-slate-600")}>
                        {cfg.reason_catalog[r.reason]?.short}
                        <span className="block font-mono text-[10px] text-slate-400">{r.reason}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          )}

          {tab === "settings" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-semibold">Pengaturan</p>
                <KeyValue items={Object.entries(cfg.settings).map(([k, v]) => [<code key={k} className="font-mono text-xs">{k}</code>, Array.isArray(v) ? v.join(", ") : String(v)])} />
                <p className="mt-4 mb-2 text-sm font-semibold">Katalog komorbid terstandar</p>
                <div className="flex flex-wrap gap-1.5">
                  {cfg.comorbidity_catalog.map((c) => (
                    <Badge key={c.code}>
                      {c.label} <span className="font-mono text-[10px] text-slate-400">{c.code}</span>
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold">Katalog alasan</p>
                <ul className="divide-y divide-slate-100 text-sm">
                  {Object.entries(cfg.reason_catalog).map(([k, v]) => (
                    <li key={k} className="py-2">
                      <code className="font-mono text-[11px] text-slate-500">{k}</code>
                      <p className="font-medium text-slate-800">{v.short}</p>
                      {v.detail && <p className="text-xs text-slate-500">{v.detail}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {tab === "versions" && (
            <Table>
              <thead className="bg-slate-50">
                <tr>
                  <th className={th}>Versi</th>
                  <th className={th}>Status</th>
                  <th className={th}>Dibuat</th>
                  <th className={th}>Persetujuan</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.items.map((r) => (
                  <tr key={r.id}>
                    <td className={td}>
                      <span className="font-bold">v{r.version}</span> <span className="text-slate-600">{r.label}</span>
                      {r.notes && <span className="block text-xs text-slate-500">{r.notes}</span>}
                    </td>
                    <td className={td}>
                      <Badge tone={r.status === "ACTIVE" ? "emerald" : r.status === "DRAFT" ? "amber" : "slate"}>{r.status}</Badge>
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-xs")}>
                      {fmtDateTime(r.created_at)}
                      <span className="block text-slate-500">{r.created_by}</span>
                    </td>
                    <td className={cn(td, "text-xs")}>
                      {r.approved_by_name ? (
                        <>
                          {r.approved_by_name}
                          <span className="block text-slate-500">
                            {r.approval_note} · {fmtDateTime(r.activated_at)}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={td}>
                      {r.status !== "ACTIVE" && (
                        <Button size="xs" variant={r.status === "DRAFT" ? "primary" : "secondary"} icon={r.status === "DRAFT" ? <Play className="size-3" /> : <History className="size-3" />} onClick={() => setActivate(r)}>
                          {r.status === "DRAFT" ? "Aktifkan" : "Pulihkan"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          {tab === "editor" && (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Label versi" required>
                    <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Mis. Ambang tensi revisi dr. perusahaan" />
                  </Field>
                  <Field label="Catatan perubahan">
                    <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Apa yang berubah dan mengapa" />
                  </Field>
                </div>
                <Field label="Konfigurasi (JSON)" hint={parsed.ok ? "JSON valid — jalankan validasi & simulasi dampak sebelum menyimpan" : `JSON tidak valid: ${parsed.error}`}>
                  <Textarea
                    value={json}
                    onChange={(e) => setJson(e.target.value)}
                    spellCheck={false}
                    className={cn("h-[460px] font-mono text-[12px] leading-relaxed", !parsed.ok && "ring-rose-400")}
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" icon={<FlaskConical className="size-4" />} loading={busy === "preview"} onClick={runPreview}>
                    Validasi &amp; simulasi dampak
                  </Button>
                  <Button icon={<Save className="size-4" />} loading={busy === "save"} onClick={saveDraft}>
                    Simpan sebagai draft
                  </Button>
                  <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => setJson(JSON.stringify(cfg, null, 2))}>
                    Muat ulang dari versi aktif
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                <Alert tone="info" title="Alur tata kelola aturan">
                  1) Ubah JSON → 2) validasi &amp; simulasi dampak ke seluruh pekerja → 3) simpan draft → 4) aktifkan dengan nama dokter
                  penyetuju. Semua pekerja dievaluasi ulang dan setiap langkah tercatat di audit log.
                </Alert>
                {errors.length > 0 && (
                  <Alert tone="danger" title="Konfigurasi tidak valid">
                    <ul className="list-disc space-y-0.5 pl-4">
                      {errors.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </Alert>
                )}
                {preview && (
                  <Card>
                    <CardHeader title="Simulasi dampak" subtitle={`${preview.changes.length} perubahan · ${preview.unchanged_pairs} pasangan tetap`} />
                    <CardBody className="max-h-[420px] space-y-1.5 overflow-y-auto">
                      {preview.changes.length === 0 ? (
                        <EmptyState title="Tidak ada perubahan status" description="Draft menghasilkan status yang sama untuk semua pekerja saat ini." />
                      ) : (
                        preview.changes.map((c, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 text-xs">
                            <span className="w-36 truncate font-semibold text-slate-800">{c.employee.full_name}</span>
                            <span className="w-16 text-slate-500">{AREA_SHORT[c.area.code]}</span>
                            <StatusBadge status={c.current} showCode />
                            <ArrowRight className="size-3 text-slate-400" />
                            <StatusBadge status={c.draft} showCode />
                          </div>
                        ))
                      )}
                    </CardBody>
                  </Card>
                )}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={!!activate}
        onClose={() => setActivate(null)}
        title={`Aktifkan aturan v${activate?.version}`}
        description={activate?.label}
        footer={
          <>
            <Button variant="secondary" onClick={() => setActivate(null)}>
              Batal
            </Button>
            <Button loading={busy === "activate"} disabled={approver.trim().length < 3 || approvalNote.trim().length < 5} onClick={doActivate}>
              Aktifkan &amp; evaluasi ulang semua pekerja
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="warning" title="Persetujuan dokter perusahaan">
            <span className="inline-flex items-start gap-1">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /> Sistem hanya mengeksekusi aturan yang disetujui dokter perusahaan &amp; pemilik
              kebijakan K3 (§8.6).
            </span>
          </Alert>
          <Field label="Nama penyetuju (dokter perusahaan)" required>
            <Input value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="dr. …" />
          </Field>
          <Field label="Catatan persetujuan" required>
            <Textarea rows={3} value={approvalNote} onChange={(e) => setApprovalNote(e.target.value)} placeholder="Nomor memo / ringkasan persetujuan" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
