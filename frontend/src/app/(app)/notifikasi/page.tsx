"use client";

import useSWR from "swr";
import { Alert, Card, CardBody, CardHeader, PageHeader, PageLoader } from "@/components/ui";
import { WhatsAppPhone } from "@/components/whatsapp";
import type { NotificationItem } from "@/lib/types";

const TEMPLATES: [string, string][] = [
  ["Pengingat tensi harian", "Dikirim pagi hari jika Anda belum screening."],
  ["Status kartu berubah", "Setiap kali status akses per area berubah."],
  ["Flag review segera", "Jika hasil screening memerlukan tindak lanjut medis."],
  ["Override oleh admin", "Saat admin mengubah akses Anda, dan saat berakhir."],
  ["Hasil verifikasi", "Saat data MCU/komorbid Anda diverifikasi atau ditolak."],
];

export default function NotifikasiPage() {
  const { data } = useSWR<{ items: NotificationItem[]; phone_masked: string }>("/api/me/notifications", { refreshInterval: 30_000 });
  return (
    <div>
      <PageHeader
        eyebrow="Notifikasi satu arah"
        title="WhatsApp (Simulasi)"
        description="Prototipe belum terhubung ke WhatsApp Business API. Semua pesan disimulasikan dan tercatat di log notifikasi."
      />
      {!data ? (
        <PageLoader />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
          <WhatsAppPhone items={data.items} phone={data.phone_masked} limit={30} />
          <div className="space-y-4">
            <Card>
              <CardHeader title="Jenis notifikasi" />
              <CardBody>
                <ul className="divide-y divide-slate-100 text-sm">
                  {TEMPLATES.map(([t, d]) => (
                    <li key={t} className="py-2.5">
                      <p className="font-semibold text-slate-800">{t}</p>
                      <p className="text-slate-500">{d}</p>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
            <Alert tone="info" title="Privasi pesan">
              Pesan WhatsApp tidak memuat nilai tensi atau diagnosis — hanya status akses dan pengingat. Detail alasan dapat dilihat di
              aplikasi setelah login.
            </Alert>
          </div>
        </div>
      )}
    </div>
  );
}
