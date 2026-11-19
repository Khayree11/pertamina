"use client";

import { ClipboardCheck, FileText } from "lucide-react";
import useSWR, { useSWRConfig } from "swr";
import { McuCard } from "@/components/health";
import { McuSmartUpload } from "@/components/mcu-intake";
import { Alert, Card, CardBody, CardHeader, EmptyState, PageHeader, PageLoader } from "@/components/ui";
import type { MCU } from "@/lib/types";

export default function McuPage() {
  const { mutate } = useSWRConfig();
  const { data, mutate: reload } = useSWR<{ items: MCU[]; current_id: number | null }>("/api/me/mcu");
  const current = data?.items.find((m) => m.id === data.current_id);

  return (
    <div>
      <PageHeader
        eyebrow="Data kesehatan"
        title="MCU Tahunan"
        description="Hasil medical check-up tahunan beserta kesimpulan fit/restriksi dari dokter. MCU berlaku 12 bulan (simulasi)."
      />
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="MCU yang berlaku" icon={<ClipboardCheck className="size-5" />} />
            <CardBody>
              {!data ? (
                <PageLoader />
              ) : current ? (
                <>
                  <McuCard m={current} current />
                  {current.verification_status === "UNVERIFIED" && (
                    <Alert tone="warning" className="mt-3">
                      Menunggu verifikasi admin — selama itu area khusus berstatus NEEDS_REVIEW.
                    </Alert>
                  )}
                  {current.expired && (
                    <Alert tone="danger" className="mt-3">
                      MCU kedaluwarsa. Lakukan MCU baru dan input hasilnya.
                    </Alert>
                  )}
                </>
              ) : (
                <EmptyState
                  icon={<FileText className="size-6" />}
                  title="Belum ada data MCU"
                  description="Area khusus berstatus NEEDS_REVIEW sampai ada MCU yang terverifikasi."
                />
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Riwayat MCU" subtitle={`${data?.items.length ?? 0} catatan`} />
            <CardBody className="space-y-3">
              {data?.items.filter((m) => m.id !== data.current_id).map((m) => <McuCard key={m.id} m={m} />)}
              {data && data.items.length <= 1 && <p className="text-sm text-slate-500">Tidak ada riwayat lain.</p>}
            </CardBody>
          </Card>
        </div>
        <Card className="order-first 2xl:order-none">
          <CardHeader title="Unggah MCU tahunan" subtitle="Dokumen dibaca otomatis — periksa & koreksi variabelnya sebelum menyimpan" />
          <CardBody>
            <McuSmartUpload
              extractEndpoint="/api/me/mcu/extract"
              confirmEndpoint="/api/me/mcu/confirm"
              onDone={() => {
                reload();
                mutate("/api/me/dashboard");
                mutate("/api/me/status");
              }}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
