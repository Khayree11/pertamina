"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BPRecord, Status } from "@/lib/types";
import { fmtDayShort, fmtTime } from "@/lib/format";
import { AREA_ICON, AREA_ORDER, AREA_SHORT, STATUS_META, STATUS_ORDER } from "./status";
import { cn } from "./ui";

/* Token chart (lihat skill dataviz: palet referensi, sudah divalidasi — 2 seri, light). */
const C = {
  s1: "#2a78d6", // sistolik
  s2: "#eb6834", // diastolik
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  muted: "#898781",
  ink2: "#52514e",
  ink: "#0b0b0b",
  surface: "#ffffff",
};

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => setW(Math.floor(entries[0].contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00+07:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ Riwayat tensi */

export function BpChart({
  records,
  days,
  today,
  thresholds = [140, 90],
}: {
  records: BPRecord[];
  days: number;
  today: string;
  thresholds?: [number, number];
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  // Satu titik per hari: pembacaan terakhir hari itu (semua pembacaan tetap ada di tabel).
  const series = useMemo(() => {
    const byDay = new Map<string, BPRecord>();
    const sorted = [...records].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
    for (const r of sorted) byDay.set(r.record_date, r);
    const out: { date: string; rec: BPRecord | null }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = addDays(today, -i);
      out.push({ date: d, rec: byDay.get(d) ?? null });
    }
    return out;
  }, [records, days, today]);

  const values = series.flatMap((p) => (p.rec ? [p.rec.systolic, p.rec.diastolic] : []));
  const lo = Math.min(60, ...values.map((v) => v - 10));
  const hi = Math.max(160, ...values.map((v) => v + 10), thresholds[0] + 20);
  const yMin = Math.floor(lo / 20) * 20;
  const yMax = Math.ceil(hi / 20) * 20;

  const H = 250;
  const m = { top: 28, right: 40, bottom: 30, left: 40 };
  const pw = Math.max(0, width - m.left - m.right);
  const ph = H - m.top - m.bottom;
  const x = (i: number) => m.left + (series.length <= 1 ? pw / 2 : (i / (series.length - 1)) * pw);
  const y = (v: number) => m.top + ph - ((v - yMin) / (yMax - yMin)) * ph;
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax; v += 20) ticks.push(v);

  function segments(key: "systolic" | "diastolic") {
    const segs: string[] = [];
    let cur: string[] = [];
    series.forEach((p, i) => {
      if (p.rec) cur.push(`${x(i).toFixed(1)},${y(p.rec[key]).toFixed(1)}`);
      else if (cur.length) {
        segs.push(cur.join(" "));
        cur = [];
      }
    });
    if (cur.length) segs.push(cur.join(" "));
    return segs;
  }

  const labelEvery = pw / series.length < 26 ? Math.ceil(26 / Math.max(1, pw / series.length)) * 2 : 1;
  const lastIdx = (() => {
    for (let i = series.length - 1; i >= 0; i--) if (series[i].rec) return i;
    return -1;
  })();

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round((px / rect.width) * (series.length - 1));
    setHover(Math.max(0, Math.min(series.length - 1, i)));
  }

  const hp = hover !== null ? series[hover] : null;

  return (
    <div className="relative" ref={ref}>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: C.s1 }} /> Sistolik
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: C.s2 }} /> Diastolik
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="16" height="2" aria-hidden>
            <line x1="0" y1="1" x2="16" y2="1" stroke={C.muted} strokeDasharray="3 3" />
          </svg>
          Ambang simulasi {thresholds[0]}/{thresholds[1]}
        </span>
        <span className="text-slate-400">· 1 titik = pembacaan terakhir per hari; celah = tidak ada input</span>
      </div>
      {width > 0 && (
        <svg
          width={width}
          height={H}
          role="img"
          aria-label={`Grafik tensi ${days} hari terakhir. ${series.filter((s) => s.rec).length} hari dengan input.`}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? series.length) - 1));
            if (e.key === "ArrowRight") setHover((h) => Math.min(series.length - 1, (h ?? -1) + 1));
            if (e.key === "Escape") setHover(null);
          }}
          onBlur={() => setHover(null)}
          className="block outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={m.left + pw} y1={y(t)} y2={y(t)} stroke={t === yMin ? C.axis : C.grid} strokeWidth={1} />
              <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={C.muted} className="tabular">
                {t}
              </text>
            </g>
          ))}
          {thresholds.map((t, i) => (
            <g key={`th${i}`}>
              <line x1={m.left} x2={m.left + pw} y1={y(t)} y2={y(t)} stroke={C.muted} strokeDasharray="4 4" strokeWidth={1} />
              <text x={m.left + 4} y={y(t) - 5} fontSize={10.5} fill={C.muted}>
                {i === 0 ? `ambang sistolik ${t}` : `ambang diastolik ${t}`}
              </text>
            </g>
          ))}
          {series.map((p, i) =>
            (i % labelEvery === 0 && series.length - 1 - i >= Math.max(2, labelEvery)) || i === series.length - 1 ? (
              <text key={p.date} x={x(i)} y={H - 10} textAnchor="middle" fontSize={11} fill={C.muted}>
                {i === series.length - 1 ? "Hari ini" : fmtDayShort(p.date)}
              </text>
            ) : null,
          )}
          {hp && <line x1={x(hover!)} x2={x(hover!)} y1={m.top} y2={m.top + ph} stroke={C.axis} strokeWidth={1} />}
          {(["systolic", "diastolic"] as const).map((k) =>
            segments(k).map((pts, i) =>
              pts.includes(" ") ? (
                <polyline
                  key={`${k}${i}`}
                  points={pts}
                  fill="none"
                  stroke={k === "systolic" ? C.s1 : C.s2}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null,
            ),
          )}
          {series.map((p, i) =>
            p.rec ? (
              <g key={`pt${p.date}`}>
                {(["systolic", "diastolic"] as const).map((k) => (
                  <circle
                    key={k}
                    cx={x(i)}
                    cy={y(p.rec![k])}
                    r={hover === i ? 5.5 : 4}
                    fill={k === "systolic" ? C.s1 : C.s2}
                    stroke={C.surface}
                    strokeWidth={2}
                  />
                ))}
              </g>
            ) : null,
          )}
          {lastIdx >= 0 && series[lastIdx].rec && (
            <g>
              <text x={x(lastIdx) + 9} y={y(series[lastIdx].rec!.systolic)} dy="0.32em" fontSize={11.5} fontWeight={600} fill={C.ink2}>
                {series[lastIdx].rec!.systolic}
              </text>
              <text x={x(lastIdx) + 9} y={y(series[lastIdx].rec!.diastolic)} dy="0.32em" fontSize={11.5} fontWeight={600} fill={C.ink2}>
                {series[lastIdx].rec!.diastolic}
              </text>
            </g>
          )}
          <rect
            x={m.left - 8}
            y={m.top}
            width={pw + 16}
            height={ph}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}
      {hp && width > 0 && (
        <div
          className="pointer-events-none absolute z-10 w-44 rounded-lg bg-white p-2.5 text-xs shadow-lg ring-1 ring-black/10"
          style={{
            left: Math.min(Math.max(x(hover!) - 88, 0), width - 176),
            top: 36,
          }}
        >
          <p className="font-semibold text-slate-500">{hover === series.length - 1 ? "Hari ini" : fmtDayShort(hp.date)}</p>
          {hp.rec ? (
            <div className="mt-1 space-y-0.5">
              <p className="flex items-center gap-2">
                <span className="h-0.5 w-3 rounded" style={{ background: C.s1 }} />
                <span className="tabular text-sm font-bold text-slate-900">{hp.rec.systolic}</span>
                <span className="text-slate-500">sistolik</span>
              </p>
              <p className="flex items-center gap-2">
                <span className="h-0.5 w-3 rounded" style={{ background: C.s2 }} />
                <span className="tabular text-sm font-bold text-slate-900">{hp.rec.diastolic}</span>
                <span className="text-slate-500">diastolik</span>
              </p>
              <p className="pt-0.5 text-slate-500">
                {hp.rec.pulse ? `Nadi ${hp.rec.pulse} bpm · ` : ""}
                {fmtTime(hp.rec.measured_at)} WIB
              </p>
            </div>
          ) : (
            <p className="mt-1 text-slate-500">Tidak ada input tensi</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Tren kepatuhan (kolom, 1 seri) */

export function ComplianceColumns({ data }: { data: { date: string; pct: number; submitted: number; total: number }[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 190;
  const m = { top: 22, right: 8, bottom: 26, left: 44 };
  const pw = Math.max(0, width - m.left - m.right);
  const ph = H - m.top - m.bottom;
  const band = data.length ? pw / data.length : 0;
  const bw = Math.min(24, Math.max(6, band - 6));
  const y = (v: number) => m.top + ph - (v / 100) * ph;
  const labelEvery = band < 34 ? 2 : 1;
  const r = 4;

  return (
    <div className="relative" ref={ref}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label="Persentase pekerja yang input tensi per hari, 14 hari terakhir">
          {[0, 50, 100].map((t) => (
            <g key={t}>
              <line x1={m.left} x2={m.left + pw} y1={y(t)} y2={y(t)} stroke={t === 0 ? C.axis : C.grid} />
              <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={C.muted} className="tabular">
                {t}%
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = m.left + band * i + band / 2;
            const top = y(d.pct);
            const h = Math.max(0, m.top + ph - top);
            const x0 = cx - bw / 2;
            const rr = Math.min(r, h, bw / 2);
            const path =
              h <= 0
                ? ""
                : `M${x0},${m.top + ph} L${x0},${top + rr} Q${x0},${top} ${x0 + rr},${top} L${x0 + bw - rr},${top} Q${x0 + bw},${top} ${x0 + bw},${top + rr} L${x0 + bw},${m.top + ph} Z`;
            const isLast = i === data.length - 1;
            return (
              <g key={d.date}>
                {path && <path d={path} fill={C.s1} opacity={hover === null || hover === i ? 1 : 0.55} />}
                {isLast && (
                  <text x={cx} y={top - 6} textAnchor="middle" fontSize={11.5} fontWeight={600} fill={C.ink2}>
                    {d.pct}%
                  </text>
                )}
                {((i % labelEvery === 0 && data.length - 1 - i >= labelEvery + 1) || isLast) && (
                  <text x={cx} y={H - 8} textAnchor="middle" fontSize={10.5} fill={C.muted}>
                    {isLast ? "Hari ini" : fmtDayShort(d.date).replace(/ .*/, "")}
                  </text>
                )}
                <rect
                  x={cx - band / 2}
                  y={m.top}
                  width={band}
                  height={ph}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${fmtDayShort(d.date)}: ${d.pct}% (${d.submitted} dari ${d.total} pekerja)`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="outline-none"
                />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg bg-white px-2.5 py-2 text-xs shadow-lg ring-1 ring-black/10"
          style={{ left: Math.min(Math.max(m.left + band * hover + band / 2 - 70, 0), Math.max(0, width - 140)), top: 0 }}
        >
          <p className="tabular text-sm font-bold text-slate-900">{data[hover].pct}%</p>
          <p className="text-slate-500">
            {fmtDayShort(data[hover].date)} · {data[hover].submitted} dari {data[hover].total} pekerja
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Bar tersegmentasi per area */

export function AreaSegmentedBars({ summary, total }: { summary: Record<string, Partial<Record<Status, number>>>; total: number }) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {STATUS_ORDER.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", STATUS_META[s].solid)} />
            {STATUS_META[s].label}
          </span>
        ))}
      </div>
      <div className="space-y-3">
        {AREA_ORDER.map((a) => {
          const row = summary[a] ?? {};
          const Icon = AREA_ICON[a];
          const aria = STATUS_ORDER.map((s) => `${STATUS_META[s].label} ${row[s] ?? 0}`).join(", ");
          return (
            <div key={a} className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
                <Icon className="size-4 text-slate-400" /> {AREA_SHORT[a]}
              </span>
              <div className="flex h-7 gap-[2px]" role="img" aria-label={`${AREA_SHORT[a]}: ${aria}`}>
                {STATUS_ORDER.map((s) => {
                  const n = row[s] ?? 0;
                  if (!n || !total) return null;
                  const pct = (n / total) * 100;
                  const key = `${a}-${s}`;
                  return (
                    <div
                      key={s}
                      className={cn(
                        "relative flex items-center rounded-[4px] px-1.5 text-xs font-bold text-white transition",
                        STATUS_META[s].solid,
                        hover && hover !== key && "opacity-60",
                      )}
                      style={{ width: `${pct}%` }}
                      onPointerEnter={() => setHover(key)}
                      onPointerLeave={() => setHover(null)}
                      tabIndex={0}
                      onFocus={() => setHover(key)}
                      onBlur={() => setHover(null)}
                      title={`${STATUS_META[s].label}: ${n} pekerja (${Math.round(pct)}%)`}
                    >
                      {pct >= 9 && <span className="tabular">{n}</span>}
                      {hover === key && (
                        <span className="pointer-events-none absolute -top-9 left-0 z-10 rounded-md bg-white px-2 py-1 text-xs font-medium whitespace-nowrap text-slate-700 shadow-lg ring-1 ring-black/10">
                          <strong className="text-slate-900">{n}</strong> {STATUS_META[s].label} · {Math.round(pct)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
