"use client";

import { Contact, Lock, Pencil, ShieldCheck, User as UserIcon } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { GeneralProfileForm } from "@/components/profile";
import { Badge, Button, Card, CardBody, CardHeader, KeyValue, PageHeader, PageLoader } from "@/components/ui";
import { fmtDate, fmtDateTime, initials } from "@/lib/format";
import type { Comorbidity, EmployeeBasic, GeneralProfile, MCU, Onboarding } from "@/lib/types";

type Profile = {
  employee: EmployeeBasic;
  general: GeneralProfile;
  onboarding: Onboarding;
  account: { username: string; role: string; last_login_at: string | null };
  health_summary: { bp_records: number; latest_mcu: MCU | null; active_comorbidities: Comorbidity[] };
  privacy: string[];
};

export default function ProfilPage() {
  const { data, mutate } = useSWR<Profile>("/api/me/profile");
  const [editing, setEditing] = useState(false);
  if (!data) return <PageLoader />;
  const e = data.employee;
  const g = data.general;
  return (
    <div>
      <PageHeader title="Profil & Privasi" description="Data pekerja dan ringkasan kesehatan sesuai kewenangan Anda." />
      <Card className="mb-6">
        <CardHeader
          title="Data umum"
          icon={<Contact className="size-5" />}
          subtitle={g.registration_source === "SELF" ? "Didaftarkan mandiri" : "Didaftarkan admin"}
          action={
            !editing && (
              <Button size="sm" variant="secondary" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
                Ubah
              </Button>
            )
          }
        />
        <CardBody>
          {editing ? (
            <GeneralProfileForm
              initial={g}
              onSaved={() => {
                mutate();
                setEditing(false);
              }}
            />
          ) : (
            <div className="grid gap-x-8 sm:grid-cols-2">
              <KeyValue
                items={[
                  ["Jabatan", g.position || "—"],
                  ["Unit", g.unit || "—"],
                  ["Lokasi kerja", g.work_location || "—"],
                  ["Tanggal lahir", fmtDate(g.birth_date)],
                  ["Jenis kelamin", g.gender === "L" ? "Laki-laki" : g.gender === "P" ? "Perempuan" : "—"],
                ]}
              />
              <KeyValue
                items={[
                  ["WhatsApp", g.phone || "—"],
                  ["Email", g.email || "—"],
                  ["Kontak darurat", g.emergency_contact_name ? `${g.emergency_contact_name} · ${g.emergency_contact_phone}` : "—"],
                  ["MCU tahunan", data.onboarding.mcu === "DONE" ? "Sudah diunggah" : "Wajib — belum diunggah"],
                ]}
              />
            </div>
          )}
        </CardBody>
      </Card>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <CardBody className="flex items-center gap-4 p-6">
            <div className="grid size-16 place-items-center rounded-2xl bg-brand-700 text-xl font-bold text-white">
              {initials(e.full_name)}
            </div>
            <div>
              <p className="text-lg font-bold">{e.full_name}</p>
              <p className="text-sm text-slate-500">{e.position}</p>
              <div className="mt-1 flex gap-1.5">
                <Badge tone="brand">{e.employee_code}</Badge>
                <Badge tone={e.card_active ? "emerald" : "rose"}>{e.card_active ? "Kartu aktif" : "Kartu nonaktif"}</Badge>
              </div>
            </div>
          </CardBody>
          <CardBody className="border-t border-slate-100">
            <KeyValue
              items={[
                ["Unit", e.unit],
                ["Lokasi kerja", e.work_location],
                ["Nomor kartu", <span key="c" className="font-mono">{e.card_number}</span>],
                ["Nomor WhatsApp", e.phone_masked],
                ["Username", data.account.username],
                ["Login terakhir", fmtDateTime(data.account.last_login_at)],
              ]}
            />
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Ringkasan kesehatan" icon={<UserIcon className="size-5" />} subtitle="Hanya Anda dan admin K3 berwenang yang dapat melihat" />
            <CardBody>
              <KeyValue
                items={[
                  ["Catatan tensi", `${data.health_summary.bp_records} pembacaan`],
                  [
                    "MCU terakhir",
                    data.health_summary.latest_mcu
                      ? `${fmtDate(data.health_summary.latest_mcu.mcu_date)} · ${data.health_summary.latest_mcu.conclusion_label} · ${data.health_summary.latest_mcu.verification_label}`
                      : "Belum ada",
                  ],
                  [
                    "Komorbid aktif",
                    data.health_summary.active_comorbidities.length
                      ? data.health_summary.active_comorbidities.map((c) => c.label).join(", ")
                      : "Tidak ada",
                  ],
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Bagaimana data Anda dilindungi" icon={<ShieldCheck className="size-5" />} />
            <CardBody>
              <ul className="space-y-2.5">
                {data.privacy.map((p) => (
                  <li key={p} className="flex gap-2.5 text-sm text-slate-700">
                    <Lock className="mt-0.5 size-4 shrink-0 text-brand-600" />
                    {p}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-slate-500">
                Data kesehatan termasuk data pribadi spesifik (UU No. 27/2022 tentang Pelindungan Data Pribadi). Hubungi admin K3 untuk
                menggunakan hak Anda atas data.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
