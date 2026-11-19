const TZ = "Asia/Jakarta";

const dtf = new Intl.DateTimeFormat("id-ID", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const tf = new Intl.DateTimeFormat("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const df = new Intl.DateTimeFormat("id-ID", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
const dLong = new Intl.DateTimeFormat("id-ID", {
  timeZone: TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const dShort = new Intl.DateTimeFormat("id-ID", { timeZone: TZ, day: "numeric", month: "short" });

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  // Tanggal tanpa jam (YYYY-MM-DD) diperlakukan sebagai tengah hari WIB agar tidak bergeser.
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T12:00:00+07:00`);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDateTime(v?: string | null): string {
  const d = toDate(v);
  return d ? `${dtf.format(d).replace(/\./g, ":")} WIB` : "—";
}

export function fmtTime(v?: string | null): string {
  const d = toDate(v);
  return d ? tf.format(d).replace(/\./g, ":") : "—";
}

export function fmtDate(v?: string | null): string {
  const d = toDate(v);
  return d ? df.format(d) : "—";
}

export function fmtDateLong(v?: string | Date | null): string {
  const d = toDate(v as any);
  return d ? dLong.format(d) : "—";
}

export function fmtDayShort(v?: string | null): string {
  const d = toDate(v);
  return d ? dShort.format(d) : "—";
}

export function fmtRelative(v?: string | null): string {
  const d = toDate(v);
  if (!d) return "—";
  const diff = (Date.now() - d.getTime()) / 1000;
  const future = diff < 0;
  const s = Math.abs(diff);
  let out: string;
  if (s < 60) out = "baru saja";
  else if (s < 3600) out = `${Math.round(s / 60)} menit`;
  else if (s < 86400) out = `${Math.round(s / 3600)} jam`;
  else out = `${Math.round(s / 86400)} hari`;
  if (out === "baru saja") return out;
  return future ? `${out} lagi` : `${out} lalu`;
}

export function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} menit`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} jam ${m} menit` : `${h} jam`;
}
