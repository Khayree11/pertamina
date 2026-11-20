"use client";

import { CheckCircle2, Clock, Radio, ScanLine, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { AREA_ICON, TAP_META, TapBadge } from "@/components/status";
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
  PageHeader,
  PageLoader,
  Select,
  Table,
  cn,
  td,
  th,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { durationLabel, fmtDateTime, fmtTime } from "@/lib/format";
import type { AccessEvent, AreaMeta } from "@/lib/types";

type Room = { room_code: string; name: string; area: AreaMeta; location: string; description: string };

export default function SecurityDashboard() {
  const toast = useToast();
  const { data: rooms } = useSWR<{ items: Room[] }>("/api/acs/rooms");
  const { data: emps } = useSWR<{ items: { id: number; employee_code: string; full_name: string; card_number: string }[] }>(
    "/api/admin/employees",
  );
  const { data: events, mutate: reloadEvents } = useSWR<{ items: AccessEvent[] }>(`/api/acs/events?limit=20`, {
    refreshInterval: 15_000,
  });

  const [identifier, setIdentifier] = useState("");
  const [room, setRoom] = useState("HGT-01");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AccessEvent | null>(null);

  const selectedRoom = rooms?.items.find((r) => r.room_code === room);

  async function tap() {
    if (!identifier.trim()) {
      toast.error("Pilih atau masukkan kartu pekerja terlebih dahulu");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await api<AccessEvent>("/api/acs/tap", {
        json: { identifier: identifier.trim(), room_code: room },
      });
      setResult(r);
      reloadEvents();
    } catch (e) {
      toast.error("Tap gagal", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const meta = result ? TAP_META[result.result] : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Security Checkpoint"
        title="Pos Keamanan &amp; Kontrol Gerbang"
        description="Pemindaian kartu akses pekerja, verifikasi hak akses area fisik, dan monitoring gerbang secara real-time."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Simulator Pemindai Kartu di Gerbang"
            subtitle="Pindai kartu atau pilih pekerja untuk mengecek izin akses ke ruangan"
            icon={<ScanLine className="size-5" />}
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Pilih Pekerja / Kartu" htmlFor="sec-emp">
                <Select
                  id="sec-emp"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                >
                  <option value="">— Pilih dari daftar pekerja —</option>
                  {(emps?.items ?? []).map((e) => (
                    <option key={e.id} value={e.card_number}>
                      {e.employee_code} · {e.full_name} ({e.card_number})
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Atau Ketik ID / Nomor Kartu Manual" htmlFor="sec-manual">
                <Input
                  id="sec-manual"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Mis. CARD-0001001 atau PTM-1001"
                />
              </Field>
            </div>

            <Field label="Pintu / Gerbang Tujuan" htmlFor="sec-room">
              <Select id="sec-room" value={room} onChange={(e) => setRoom(e.target.value)}>
                {(rooms?.items ?? []).map((r) => (
                  <option key={r.room_code} value={r.room_code}>
                    [{r.area.short}] {r.name} — {r.location}
                  </option>
                ))}
              </Select>
            </Field>

            {selectedRoom && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-800">
                  {selectedRoom.name} ({selectedRoom.area.label})
                </p>
                <p className="mt-0.5">{selectedRoom.description || selectedRoom.location}</p>
              </div>
            )}

            <Button
              size="lg"
              className="w-full"
              loading={busy}
              onClick={tap}
              icon={<Radio className="size-4" />}
            >
              Simulasikan Tap di Gerbang
            </Button>

            {result && meta && (
              <div
                className={cn(
                  "rounded-2xl border p-5 text-white transition-all",
                  result.result === "GRANTED" && "bg-emerald-700 border-emerald-600",
                  result.result === "TEMPORARY" && "bg-amber-600 border-amber-500",
                  result.result === "DENIED" && "bg-rose-700 border-rose-600",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
                      {meta.label}
                    </span>
                    <h3 className="mt-2 text-xl font-bold">{result.message}</h3>
                    <p className="mt-1 text-sm text-white/80">
                      Pekerja: <strong>{result.holder_name || result.employee_code || result.input_identifier}</strong>
                    </p>
                  </div>
                  {result.result === "GRANTED" && <CheckCircle2 className="size-10 shrink-0 text-white/90" />}
                  {result.result === "TEMPORARY" && <Clock className="size-10 shrink-0 text-white/90" />}
                  {result.result === "DENIED" && <ShieldX className="size-10 shrink-0 text-white/90" />}
                </div>

                {result.max_duration_minutes && (
                  <p className="mt-3 text-xs text-white/90">
                    Batas durasi: {durationLabel(result.max_duration_minutes)} (s.d. {fmtTime(result.valid_until)})
                  </p>
                )}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Riwayat Pemindaian di Gerbang"
            icon={<Clock className="size-5" />}
            subtitle="20 akses terakhir"
          />
          <CardBody className="p-0">
            {(!events || events.items.length === 0) ? (
              <div className="p-6">
                <EmptyState title="Belum ada aktivitas tap" description="Pemindaian gerbang akan tercatat di sini." />
              </div>
            ) : (
              <div className="scrollbar-thin max-h-[500px] overflow-y-auto">
                <Table>
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className={th}>Waktu</th>
                      <th className={th}>Pekerja</th>
                      <th className={th}>Ruangan</th>
                      <th className={th}>Hasil</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {events.items.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50/80">
                        <td className={td}>
                          <span className="font-mono text-xs">{fmtTime(e.created_at)}</span>
                        </td>
                        <td className={td}>
                          <p className="font-medium text-slate-900">{e.holder_name || e.employee_code || "—"}</p>
                          <p className="font-mono text-[10px] text-slate-400">{e.card_number || e.input_identifier}</p>
                        </td>
                        <td className={td}>
                          <span className="text-xs text-slate-700">{e.room_name || e.room_code}</span>
                        </td>
                        <td className={td}>
                          <TapBadge result={e.result} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
