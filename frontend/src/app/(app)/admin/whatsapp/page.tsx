"use client";

import { CircleCheck, KeyRound, MessageSquare, Save, Send, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Field, Input, PageHeader, PageLoader, Select, cn } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

type WASettings = {
  mode: "AKTIF" | "SIMULASI";
  provider: "SIMULATION" | "META_CLOUD" | "GENERIC_HTTP";
  provider_label: string;
  source: "db" | "env" | "none";
  values: Record<string, string>;
  secrets_set: Record<string, boolean>;
  missing: string[];
  providers: Record<string, string>;
  fields: Record<string, string[]>;
  required: Record<string, string[]>;
};

const LABELS: Record<string, { label: string; hint?: string; secret?: boolean; placeholder?: string }> = {
  api_base: { label: "API base URL", placeholder: "https://graph.facebook.com" },
  api_version: { label: "Versi Graph API", placeholder: "v23.0" },
  phone_number_id: { label: "Phone Number ID", hint: "Dari WhatsApp Manager → API Setup" },
  access_token: { label: "Access token", secret: true, hint: "Token permanen (System User) disarankan" },
  template_name: { label: "Nama template (opsional)", hint: "Untuk pesan di luar jendela 24 jam, gunakan template yang sudah disetujui Meta (1 variabel body)" },
  template_lang: { label: "Bahasa template", placeholder: "id" },
  gateway_url: { label: "URL endpoint kirim", placeholder: "https://api.fonnte.com/send" },
  gateway_token: { label: "Token / API key", secret: true },
  gateway_auth_header: { label: "Nama header token", placeholder: "Authorization" },
  gateway_phone_field: { label: "Nama field nomor tujuan", placeholder: "target" },
  gateway_message_field: { label: "Nama field pesan", placeholder: "message" },
  gateway_format: { label: "Format body", hint: "json atau form" },
};

export default function WhatsAppSettingsPage() {
  const toast = useToast();
  const { data, mutate } = useSWR<WASettings>("/api/admin/settings/whatsapp");
  const [provider, setProvider] = useState<WASettings["provider"]>("SIMULATION");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; status: string; detail: string | null; mode: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setProvider(data.source === "none" ? "SIMULATION" : data.provider);
    setValues(data.values);
  }, [data]);

  if (!data) return <PageLoader />;
  const fields = data.fields[provider] ?? [];
  const required = data.required[provider] ?? [];

  async function save() {
    setBusy("save");
    try {
      const r = await api<WASettings>("/api/admin/settings/whatsapp", { method: "PUT", json: { provider, values } });
      await mutate(r, { revalidate: false });
      toast.success(r.mode === "AKTIF" ? "WhatsApp API aktif" : "Disimpan — mode simulasi", r.missing.length ? `Belum lengkap: ${r.missing.join(", ")}` : undefined);
    } catch (e) {
      toast.error("Gagal menyimpan", errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    setTestResult(null);
    try {
      setTestResult(await api("/api/admin/settings/whatsapp/test", { json: { to } }));
    } catch (e) {
      toast.error("Uji kirim gagal", errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Integrasi notifikasi"
        title="Pengaturan WhatsApp API"
        description="Isi kredensial penyedia WhatsApp di sini. Jika kosong atau belum lengkap, sistem otomatis memakai mode SIMULASI (pesan hanya dicatat, tidak dikirim)."
      />

      <Alert
        tone={data.mode === "AKTIF" ? "success" : "warning"}
        className="mb-6"
        title={data.mode === "AKTIF" ? `Mode AKTIF — ${data.provider_label}` : "Mode SIMULASI"}
      >
        {data.mode === "AKTIF"
          ? `Notifikasi dikirim sungguhan lewat penyedia ini (sumber konfigurasi: ${data.source === "db" ? "pengaturan admin" : ".env"}). Pesan tidak memuat nilai/diagnosis medis.`
          : data.missing.length
            ? `Konfigurasi ${data.provider_label} belum lengkap (${data.missing.join(", ")}) — sementara memakai simulasi.`
            : "Belum ada kredensial WhatsApp. Semua notifikasi disimulasikan dan tercatat di Log WhatsApp."}
      </Alert>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Penyedia & kredensial" icon={<KeyRound className="size-5" />} subtitle="Token disimpan di server dan hanya ditampilkan bertopeng" />
          <CardBody className="space-y-4">
            <Field label="Penyedia">
              <div className="grid gap-2 sm:grid-cols-3">
                {Object.entries(data.providers).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setProvider(k as WASettings["provider"])}
                    aria-pressed={provider === k}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-left text-sm",
                      provider === k ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-slate-200 hover:border-slate-300",
                    )}
                  >
                    <span className="font-semibold text-slate-900">{k === "SIMULATION" ? "Simulasi" : k === "META_CLOUD" ? "Meta Cloud API" : "Gateway HTTP"}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{label}</span>
                  </button>
                ))}
              </div>
            </Field>
            {provider === "SIMULATION" ? (
              <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Tidak ada pengiriman nyata. Pilih penyedia lain untuk mengaktifkan WhatsApp.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {fields.map((k) => {
                  const meta = LABELS[k] ?? { label: k };
                  return (
                    <Field
                      key={k}
                      label={meta.label}
                      required={required.includes(k)}
                      hint={meta.secret && data.secrets_set[k] ? "Tersimpan — kosongkan untuk mempertahankan" : meta.hint}
                      htmlFor={`wa-${k}`}
                    >
                      {k === "gateway_format" ? (
                        <Select id={`wa-${k}`} value={values[k] || "json"} onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}>
                          <option value="json">json</option>
                          <option value="form">form</option>
                        </Select>
                      ) : (
                        <Input
                          id={`wa-${k}`}
                          type={meta.secret ? "password" : "text"}
                          autoComplete="off"
                          placeholder={meta.secret && data.secrets_set[k] ? values[k] : meta.placeholder}
                          value={meta.secret && values[k]?.startsWith("•") ? "" : (values[k] ?? "")}
                          onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                        />
                      )}
                    </Field>
                  );
                })}
              </div>
            )}
            <Button loading={busy === "save"} onClick={save} icon={<Save className="size-4" />}>
              Simpan pengaturan
            </Button>
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Uji kirim" icon={<Send className="size-5" />} subtitle="Kirim pesan uji ke satu nomor" />
            <CardBody className="space-y-3">
              <Field label="Nomor tujuan" hint="Format 08xx atau +62xx">
                <Input inputMode="tel" value={to} onChange={(e) => setTo(e.target.value)} placeholder="0812xxxxxxx" />
              </Field>
              <Button variant="secondary" loading={busy === "test"} disabled={to.trim().length < 9} onClick={test} icon={<MessageSquare className="size-4" />}>
                Kirim pesan uji
              </Button>
              {testResult && (
                <Alert tone={testResult.ok ? "success" : "danger"} title={`Status: ${testResult.status}`}>
                  <span className="inline-flex items-center gap-1">
                    {testResult.ok ? <CircleCheck className="size-4" /> : <TriangleAlert className="size-4" />}
                    {testResult.mode === "SIMULASI" ? "Mode simulasi — pesan hanya dicatat." : testResult.detail}
                  </span>
                </Alert>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Catatan" />
            <CardBody className="space-y-2 text-sm text-slate-600">
              <p>
                <Badge tone="brand">Meta Cloud API</Badge> — pesan bebas (text) hanya terkirim dalam jendela 24 jam setelah pekerja
                mengirim pesan. Untuk notifikasi satu arah, gunakan <strong>template</strong> yang disetujui Meta.
              </p>
              <p>
                <Badge tone="brand">Gateway HTTP</Badge> — untuk penyedia lokal (mis. Fonnte/Wablas/Qontak): isi URL, token, dan nama
                field sesuai dokumentasi penyedia.
              </p>
              <p>Prioritas konfigurasi: pengaturan di halaman ini → variabel <code className="font-mono text-xs">WHATSAPP_*</code> di .env → simulasi.</p>
              <p>Pesan dikirim di latar belakang (antrian), sehingga gangguan penyedia tidak memperlambat input tensi.</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
