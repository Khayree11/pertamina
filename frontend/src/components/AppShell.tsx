"use client";

import {
  Bot,
  ClipboardCheck,
  HeartPulse,
  IdCard,
  Inbox,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  MessageSquare,
  Plug,
  ScanLine,
  ScrollText,
  Settings2,
  SlidersHorizontal,
  User as UserIcon,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { homeFor, useAuth } from "@/lib/auth";
import { fmtDateLong, fmtTime, initials } from "@/lib/format";
import { PatraNiagaLogo } from "./brand";
import { cn } from "./ui";

type NavItem = { href: string; label: string; icon: LucideIcon; badgeKey?: string };
type NavGroup = { title: string; items: NavItem[] };

const WORKER_NAV: NavGroup[] = [
  {
    title: "Harian",
    items: [
      { href: "/dashboard", label: "Beranda", icon: LayoutDashboard },
      { href: "/tensi", label: "Input Tensi Harian", icon: HeartPulse },
      { href: "/kartu", label: "Status Kartu", icon: IdCard },
      { href: "/tap", label: "Simulasi Tap Kartu", icon: ScanLine },
    ],
  },
  {
    title: "Data Kesehatan",
    items: [
      { href: "/mcu", label: "MCU Tahunan", icon: ClipboardCheck },
      { href: "/komorbid", label: "Penyakit Komorbid", icon: ListChecks },
    ],
  },
  {
    title: "Bantuan",
    items: [
      { href: "/asisten", label: "Asisten AI", icon: Bot },
      { href: "/notifikasi", label: "WhatsApp (Simulasi)", icon: MessageSquare },
      { href: "/profil", label: "Profil & Privasi", icon: UserIcon },
    ],
  },
];

const ADMIN_NAV: NavGroup[] = [
  {
    title: "Monitoring",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/pekerja", label: "Daftar Pekerja", icon: Users },
      { href: "/admin/review", label: "Antrian Review", icon: Inbox, badgeKey: "total" },
    ],
  },
  {
    title: "Kontrol Akses",
    items: [
      { href: "/admin/akses", label: "Kelola Akses", icon: KeyRound },
      { href: "/admin/aturan", label: "Aturan Kelayakan", icon: SlidersHorizontal },
      { href: "/tap", label: "Simulasi Tap Kartu", icon: ScanLine },
    ],
  },
  {
    title: "Sistem",
    items: [
      { href: "/admin/notifikasi", label: "Log WhatsApp", icon: MessageSquare },
      { href: "/admin/whatsapp", label: "Pengaturan WhatsApp", icon: Settings2 },
      { href: "/admin/integrasi", label: "Integrasi & Dokumen", icon: Plug },
      { href: "/admin/audit", label: "Audit Log", icon: ScrollText },
      { href: "/asisten", label: "Uji Asisten AI", icon: Bot },
    ],
  },
];

const WORKER_ONLY = ["/dashboard", "/tensi", "/kartu", "/mcu", "/komorbid", "/notifikasi", "/profil"];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function Brand() {
  return (
    <div className="text-white">
      <PatraNiagaLogo className="h-9" />
      <p className="mt-5 text-sm leading-tight font-semibold">HBAC</p>
      <p className="text-xs text-slate-400">Health-Based Access Control</p>
    </div>
  );
}

function SidebarContent({
  groups,
  pathname,
  badges,
  onNavigate,
}: {
  groups: NavGroup[];
  pathname: string;
  badges?: Record<string, number>;
  onNavigate?: () => void;
}) {
  const { user, logout } = useAuth();
  const router = useRouter();
  return (
    <div className="flex h-full flex-col bg-ink-900">
      <div className="px-5 pt-6 pb-4">
        <Brand />
        <p className="mt-3 flex items-center gap-2 text-[11px] text-amber-200/90">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-amber-400" />
          Prototipe tender · aturan &amp; data simulasi
        </p>
      </div>
      <nav className="scrollbar-thin flex-1 overflow-y-auto border-t border-white/10 px-3 pt-2 pb-4">
        {groups.map((g) => (
          <div key={g.title} className="mt-4 first:mt-1">
            <p className="px-2.5 pb-1 text-xs font-medium text-slate-500">{g.title}</p>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = isActive(pathname, it.href);
                const count = it.badgeKey ? badges?.[it.badgeKey] : undefined;
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      onClick={onNavigate}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition",
                        active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white",
                      )}
                    >
                      <it.icon className={cn("size-[18px] shrink-0", active ? "text-brand-300" : "text-slate-400 group-hover:text-slate-200")} />
                      <span className="flex-1 truncate">{it.label}</span>
                      {!!count && (
                        <span className="tabular rounded-full bg-rose-500 px-1.5 py-px text-[11px] font-bold text-white">{count}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      {user && (
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-700 text-xs font-bold text-white ring-2 ring-white/10">
              {initials(user.full_name)}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold text-white">{user.full_name}</p>
              <p className="truncate text-[11px] text-slate-400">
                {user.role === "ADMIN" ? "Admin K3" : `${user.employee?.employee_code} · Pekerja`}
              </p>
            </div>
            <button
              onClick={async () => {
                await logout();
                router.replace("/login");
              }}
              className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
              title="Keluar"
              aria-label="Keluar"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkerScreeningChip() {
  const { data } = useSWR<{ bp_submitted: boolean; latest_bp_at: string | null; urgent: boolean }>("/api/me/status", {
    refreshInterval: 60_000,
  });
  if (!data) return null;
  if (data.urgent)
    return (
      <Link href="/kartu" className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm">
        <span className="size-2 animate-pulse rounded-full bg-white" /> Perlu tindak lanjut medis
      </Link>
    );
  return data.bp_submitted ? (
    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
      <span className="size-2 rounded-full bg-emerald-500" /> Sudah screening · {fmtTime(data.latest_bp_at)}
    </span>
  ) : (
    <Link
      href="/tensi"
      className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-600/25 hover:bg-rose-100"
    >
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose-400 opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-rose-500" />
      </span>
      Belum input tensi hari ini
    </Link>
  );
}

const MOBILE_WORKER_TABS = [
  { href: "/dashboard", label: "Beranda", icon: LayoutDashboard },
  { href: "/tensi", label: "Tensi", icon: HeartPulse },
  { href: "/kartu", label: "Kartu", icon: IdCard },
  { href: "/asisten", label: "Asisten", icon: Bot },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const now = useClock();
  const isAdmin = user?.role === "ADMIN";
  const groups = isAdmin ? ADMIN_NAV : WORKER_NAV;
  const { data: badges } = useSWR<Record<string, number>>(isAdmin ? "/api/admin/badge" : null, { refreshInterval: 30_000 });

  // Penjaga peran sederhana di sisi klien (otorisasi sebenarnya tetap di backend).
  useEffect(() => {
    if (!user) return;
    if (pathname.startsWith("/admin") && user.role !== "ADMIN") router.replace(homeFor(user));
    if (WORKER_ONLY.some((p) => pathname === p || pathname.startsWith(p + "/")) && user.role !== "WORKER") router.replace(homeFor(user));
  }, [user, pathname, router]);

  useEffect(() => setOpen(false), [pathname]);

  const title = useMemo(() => {
    if (pathname.startsWith("/admin/pekerja/")) return "Detail Pekerja";
    for (const g of groups) for (const it of g.items) if (isActive(pathname, it.href)) return it.label;
    return "HBAC";
  }, [groups, pathname]);

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        <SidebarContent groups={groups} pathname={pathname} badges={badges} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="animate-fade-in absolute inset-0 bg-ink-950/60" onClick={() => setOpen(false)} />
          <div className="animate-slide-up absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-3 z-10 rounded-lg p-1.5 text-slate-300 hover:bg-white/10"
              aria-label="Tutup menu"
            >
              <X className="size-5" />
            </button>
            <SidebarContent groups={groups} pathname={pathname} badges={badges} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur sm:px-6 lg:px-8">
        <button
          onClick={() => setOpen(true)}
          className="-ml-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Buka menu"
        >
          <Menu className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-slate-900">{title}</p>
          <p className="hidden truncate text-xs text-slate-500 sm:block">
            {now ? `${fmtDateLong(now)} · ${fmtTime(now.toISOString())} WIB` : " "}
          </p>
        </div>
        {user?.role === "WORKER" && <WorkerScreeningChip />}
        {isAdmin && !!badges?.urgent && (
          <Link
            href="/admin/review"
            className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm"
          >
            <span className="size-2 animate-pulse rounded-full bg-white" />
            {badges.urgent} flag review segera
          </Link>
        )}
      </header>

      <main className={cn("mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8", !isAdmin && "pb-24 lg:pb-8")}>{children}</main>

      <footer className={cn("mx-auto max-w-7xl px-4 pb-8 text-xs text-slate-400 sm:px-6 lg:px-8", !isAdmin && "pb-24 lg:pb-8")}>
        Prototipe tender — sistem ini alat bantu keputusan, <strong className="font-semibold text-slate-500">bukan diagnosis medis</strong>.
        Ambang batas dan aturan adalah contoh simulasi yang wajib divalidasi dokter perusahaan &amp; pemilik kebijakan K3. Semua data
        pekerja fiktif.
      </footer>

      {!isAdmin && user && (
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {MOBILE_WORKER_TABS.map((t) => {
            const active = isActive(pathname, t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold", active ? "text-brand-700" : "text-slate-500")}
              >
                <t.icon className="size-5" />
                {t.label}
              </Link>
            );
          })}
          <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold text-slate-500">
            <Menu className="size-5" />
            Lainnya
          </button>
        </nav>
      )}
    </div>
  );
}
