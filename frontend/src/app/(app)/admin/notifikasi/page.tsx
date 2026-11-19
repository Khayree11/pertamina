"use client";

import { BellRing, MessageSquare } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, EmptyState, PageHeader, PageLoader, Select, Table, cn, td, th } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { NotificationItem } from "@/lib/types";

export default function AdminNotifikasiPage() {
  const toast = useToast();
  const [template, setTemplate] = useState("");
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const qs = new URLSearchParams({ template, recipient_type: recipient, limit: "200" }).toString();
  const { data, mutate, isLoading } = useSWR<{ items: NotificationItem[]; templates: Record<string, string> }>(`/api/admin/notifications?${qs}`, {
    keepPreviousData: true,
    refreshInterval: 30_000,
  });

  async function remind() {
    setBusy(true);
    try {
      const r = await api<{ sent: number; skipped_already_reminded: number }>("/api/admin/notifications/remind-missing-bp", { method: "POST" });
      toast.success(`${r.sent} pengingat terkirim (simulasi)`, r.skipped_already_reminded ? `${r.skipped_already_reminded} sudah diingatkan hari ini` : undefined);
      mutate();
    } catch (e) {
      toast.error("Gagal", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Notifikasi satu arah"
        title="Log WhatsApp (Simulasi)"
        description="Semua notifikasi tercatat di sini. Provider masih MOCK — tidak ada pesan yang benar-benar dikirim."
        actions={
          <Button icon={<BellRing className="size-4" />} loading={busy} onClick={remind}>
            Kirim pengingat tensi
          </Button>
        }
      />
      <Alert tone="info" className="mb-4">
        Pesan tidak memuat nilai tensi atau diagnosis. Nomor tujuan disamarkan di log. Tahap lanjut: ganti adapter mock dengan WhatsApp
        Business API / provider resmi.
      </Alert>
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={template} onChange={(e) => setTemplate(e.target.value)} className="w-auto" aria-label="Jenis">
          <option value="">Semua jenis</option>
          {Object.entries(data?.templates ?? {}).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select value={recipient} onChange={(e) => setRecipient(e.target.value)} className="w-auto" aria-label="Penerima">
          <option value="">Semua penerima</option>
          <option value="WORKER">Pekerja</option>
          <option value="K3_ONDUTY">Petugas K3 on-duty</option>
        </Select>
      </div>
      <Card className={cn("overflow-hidden", isLoading && data && "opacity-60")}>
        {!data ? (
          <PageLoader />
        ) : data.items.length === 0 ? (
          <EmptyState icon={<MessageSquare className="size-6" />} title="Belum ada notifikasi" />
        ) : (
          <Table>
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>Waktu</th>
                <th className={th}>Penerima</th>
                <th className={th}>Jenis</th>
                <th className={th}>Pesan</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((n) => (
                <tr key={n.id}>
                  <td className={cn(td, "whitespace-nowrap")}>{fmtDateTime(n.created_at)}</td>
                  <td className={cn(td, "min-w-44")}>
                    <span className="font-medium text-slate-800">{n.recipient_label}</span>
                    <span className="block font-mono text-xs text-slate-500">{n.to_masked}</span>
                  </td>
                  <td className={td}>
                    <Badge tone={n.recipient_type === "K3_ONDUTY" ? "rose" : "slate"}>{data.templates[n.template] ?? n.template}</Badge>
                  </td>
                  <td className={cn(td, "max-w-xl whitespace-pre-line text-slate-600")}>{n.message}</td>
                  <td className={td}>
                    <Badge tone="amber">{n.status}</Badge>
                    <span className="mt-0.5 block text-[11px] text-slate-400">{n.provider}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
