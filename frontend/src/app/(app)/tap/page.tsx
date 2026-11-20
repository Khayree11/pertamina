"use client";

import { Clock, Nfc, Radio, ScanLine, ShieldCheck, Timer } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { AREA_ICON, TAP_META, TapBadge } from "@/components/status";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Select, Table, cn, td, th } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { durationLabel, fmtDateTime, fmtTime } from "@/lib/format";
import type { AccessEvent, AreaMeta } from "@/lib/types";

type Room = { room_code: string; name: string; area: AreaMeta; location: string; description: string };

export default function TapPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isStaff = user?.role === "ADMIN" || user?.role === "HEALTH" || user?.role === "SECURITY";
  const { data: rooms } = useSWR<{ items: Room[] }>("/api/acs/rooms");
  const { data: emps } = useSWR<{ items: { id: number; employee_code: string; full_name: string; card_number: string }[] }>(
    isStaff ? "/api/admin/employees" : null,
  );
  const { data: events, mutate: reloadEvents } = useSWR<{ items: AccessEvent[] }>(`/api/acs/events?limit=15`, { refreshInterval: 20_000 });
  const ownCard = user?.employee?.card_number ?? "";
  const [identifier, setIdentifier] = useState("");
  const [room, setRoom] = useState("HGT-01");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AccessEvent | null>(null);
  const ident = isStaff ? identifier : ownCard;

  const grouped = useMemo(() => {
    const g: Record<string, Room[]> = {};
    for (const r of rooms?.items ?? []) (g[r.area.code] ??= []).push(r);
    return g;
  }, [rooms]);
  const order = ["GENERAL", "COLD", "HOT", "HEIGHT", "RESTRICTED_GAS"];
  const selectedRoom = rooms?.items.find((r) => r.room_code === room);

  async function tap() {
    if (!ident) {
      toast.error("Pilih kartu terlebih dahulu");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await api<AccessEvent>("/api/acs/tap", { json: { identifier: ident, room_code: room } });
      await new Promise((res) => setTimeout(res, 350));
      setResult(r);
      reloadEvents();
    } catch (e) {
      toast.error("Tap gagal", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const meta = result ? TAP_META[result.result] : null;
  const ResultIcon = meta?.icon ?? ShieldCheck;

  return (
    <div>
      <PageHeader
        eyebrow="Simulasi reader"
        title="Simulasi Tap Kartu"
        description="Tempelkan kartu (Employee ID / nomor kartu) ke reader ruangan. Reader memutuskan dari cache izin di sistem kartu — tanpa data medis."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="1. Kartu & ruangan" icon={<Nfc className="size-5" />} />
          <CardBody className="space-y-5">
            {isStaff ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Pilih pekerja">
                  <Select value={identifier} onChange={(e) => setIdentifier(e.target.value)}>
                    <option value="">— Pilih —</option>
                    {emps?.items.map((e) => (
                      <option key={e.id} value={e.card_number}>
                        {e.employee_code} · {e.full_name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="…atau ketik Employee ID / kartu" hint="Coba juga ID yang tidak terdaftar">
                  <Input value={identifier} onChange={(e) => setIdentifier(e.target.value.toUpperCase())} placeholder="PTM-1001 / CARD-0001001" />
                </Field>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <Nfc className="size-5 text-brand-600" />
                <div className="text-sm">
                  <p className="font-semibold text-slate-900">{user?.full_name}</p>
                  <p className="font-mono text-xs text-slate-500">
                    {user?.employee?.employee_code} · {ownCard}
                  </p>
                </div>
                <span className="ml-auto text-xs text-slate-500">Kartu Anda</span>
              </div>
            )}

            <div className="space-y-3">
              {order.map((code) =>
                grouped[code]?.length ? (
                  <div key={code}>
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      {(() => {
                        const Icon = AREA_ICON[code];
                        return <Icon className="size-3.5" />;
                      })()}
                      {grouped[code][0].area.label}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {grouped[code].map((r) => (
                        <button
                          key={r.room_code}
                          onClick={() => setRoom(r.room_code)}
                          aria-pressed={room === r.room_code}
                          className={cn(
                            "rounded-xl border px-3 py-2.5 text-left transition",
                            room === r.room_code
                              ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
                              : "border-slate-200 bg-white hover:border-slate-300",
                          )}
                        >
                          <p className="text-sm font-semibold text-slate-900">{r.name}</p>
                          <p className="font-mono text-[11px] text-slate-500">
                            {r.room_code} · {r.location}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null,
              )}
            </div>
            <Button size="lg" className="w-full" onClick={tap} loading={busy} icon={<ScanLine className="size-5" />}>
              Tap kartu di {selectedRoom?.name ?? room}
            </Button>
          </CardBody>
        </Card>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-[1.75rem] bg-ink-900 p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between px-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
              <span className="inline-flex items-center gap-1.5">
                <Radio className="size-3.5 text-emerald-400" /> Reader · {selectedRoom?.room_code ?? "—"}
              </span>
              <span>Mock ACS</span>
            </div>
            <div
              className={cn(
                "relative flex min-h-[300px] flex-col items-center justify-center overflow-hidden rounded-2xl p-6 text-center text-white transition-all",
                result ? meta!.panel : "bg-slate-800",
              )}
              aria-live="assertive"
            >
              {busy ? (
                <>
                  <Nfc className="size-14 animate-pulse text-slate-300" />
                  <p className="mt-3 text-sm text-slate-300">Membaca kartu…</p>
                </>
              ) : result ? (
                <div className="animate-pop">
                  <div className="mx-auto grid size-16 place-items-center rounded-full bg-white/20 ring-4 ring-white/20">
                    <ResultIcon className="size-8" />
                  </div>
                  <p className="mt-3 text-4xl font-extrabold tracking-tight">{result.result}</p>
                  <p className="text-sm font-semibold text-white/90">{result.result_label}</p>
                  <p className="mt-3 max-w-xs text-sm text-white/90">{result.message}</p>
                  {(result.valid_until || result.max_duration_minutes) && (
                    <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs font-semibold">
                      {result.valid_until && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-black/20 px-2.5 py-1">
                          <Clock className="size-3.5" /> s.d. {fmtTime(result.valid_until)} WIB
                        </span>
                      )}
                      {result.max_duration_minutes && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-black/20 px-2.5 py-1">
                          <Timer className="size-3.5" /> maks. {durationLabel(result.max_duration_minutes)}/entri
                        </span>
                      )}
                    </div>
                  )}
                  <p className="mt-4 text-xs text-white/75">
                    {result.holder_name ?? "Tidak dikenal"} · {result.room_name ?? result.room_code}
                  </p>
                </div>
              ) : (
                <>
                  <Nfc className="size-14 text-slate-400" />
                  <p className="mt-3 text-sm font-semibold text-slate-200">Tempelkan kartu ke reader</p>
                  <p className="mt-1 text-xs text-slate-400">Hasil: GRANTED · TEMPORARY · DENIED</p>
                </>
              )}
            </div>
          </div>
          {result && (
            <Alert tone="neutral" title="Dasar keputusan">
              {result.decided_by} — {result.decision_basis} Kategori alasan: <code className="font-mono text-xs">{result.reason_category}</code>
            </Alert>
          )}
          <Alert tone="info" title="Batas integrasi">
            Sistem kesehatan hanya mengirim izin per area (GRANT/TEMPORARY/DENY + masa berlaku) ke sistem kartu. Saat sinkronisasi
            gagal, reader memakai cache izin terakhir sampai masa berlakunya habis.
          </Alert>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="Log tap terbaru" subtitle={isStaff ? "Semua reader" : "Kartu Anda"} />
        {!events?.items.length ? (
          <EmptyState title="Belum ada tap" />
        ) : (
          <Table>
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>Waktu</th>
                {isStaff && <th className={th}>Kartu</th>}
                <th className={th}>Ruangan</th>
                <th className={th}>Hasil</th>
                <th className={th}>Keterangan</th>
                <th className={th}>Sumber</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.items.map((e) => (
                <tr key={e.id}>
                  <td className={cn(td, "tabular whitespace-nowrap")}>{fmtDateTime(e.created_at)}</td>
                  {isStaff && <td className={cn(td, "font-mono text-xs")}>{e.employee_code ?? e.input_identifier}</td>}
                  <td className={td}>{e.room_name ?? e.room_code}</td>
                  <td className={td}>
                    <TapBadge result={e.result} />
                  </td>
                  <td className={cn(td, "text-slate-500")}>{e.message}</td>
                  <td className={cn(td, "text-xs text-slate-500")}>{e.source === "DEVICE_API" ? e.device_id : "Simulator"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
