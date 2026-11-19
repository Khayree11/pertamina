"use client";

import { LoaderCircle, X, Info, CircleCheck, TriangleAlert, CircleAlert } from "lucide-react";
import { useEffect, useRef } from "react";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ Button */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success" | "outline" | "dark";
  size?: "xs" | "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
};

const BTN_VARIANTS = {
  primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800",
  secondary: "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  danger: "bg-rose-600 text-white shadow-sm hover:bg-rose-700",
  success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700",
  outline: "text-brand-700 ring-1 ring-inset ring-brand-300 hover:bg-brand-50",
  dark: "bg-ink-900 text-white hover:bg-ink-800",
};
const BTN_SIZES = {
  xs: "h-7 px-2.5 text-xs gap-1",
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-semibold whitespace-nowrap transition",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
        "disabled:cursor-not-allowed disabled:opacity-50",
        BTN_VARIANTS[variant],
        BTN_SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ Card */

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03]", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 shrink-0 text-brand-600">{icon}</div>}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

/* ------------------------------------------------------------------ Badge */

const BADGE_TONES = {
  slate: "bg-slate-100 text-slate-700 ring-slate-500/20",
  brand: "bg-brand-50 text-brand-700 ring-brand-600/20",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/25",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
  rose: "bg-rose-50 text-rose-700 ring-rose-600/20",
  sky: "bg-sky-50 text-sky-700 ring-sky-600/20",
  dark: "bg-ink-900 text-white ring-ink-900",
};
export type Tone = keyof typeof BADGE_TONES;

export function Badge({
  tone = "slate",
  children,
  className,
  icon,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset",
        BADGE_TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ Form */

export const inputClass =
  "block rounded-lg border-0 bg-white px-3 py-2.5 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 " +
  "placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-brand-600 focus:outline-none " +
  "disabled:bg-slate-50 disabled:text-slate-500";

/** Lebar penuh kecuali pemanggil memberi kelas lebar sendiri (w-*), agar tidak bentrok. */
function widthCls(className?: string) {
  return /(^|\s)w-/.test(className ?? "") ? "" : "w-full";
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
  htmlFor,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-rose-600">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, widthCls(className), className)} {...rest} />;
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputClass, widthCls(className), "pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputClass, widthCls(className), "min-h-20", className)} {...rest} />;
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3", disabled && "cursor-not-allowed opacity-60")}>
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 rounded border-slate-300 accent-brand-600"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-sm">
        <span className="font-medium text-slate-800">{label}</span>
        {description && <span className="mt-0.5 block text-slate-500">{description}</span>}
      </span>
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2.5", disabled && "cursor-not-allowed opacity-60")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-brand-600" : "bg-slate-300",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-5",
          )}
        />
      </button>
      {label && <span className="text-sm font-medium text-slate-700">{label}</span>}
    </label>
  );
}

/* ------------------------------------------------------------------ Alert */

const ALERT = {
  info: { cls: "bg-sky-50 text-sky-900 ring-sky-200", icon: Info, ic: "text-sky-600" },
  success: { cls: "bg-emerald-50 text-emerald-900 ring-emerald-200", icon: CircleCheck, ic: "text-emerald-600" },
  warning: { cls: "bg-amber-50 text-amber-900 ring-amber-200", icon: TriangleAlert, ic: "text-amber-600" },
  danger: { cls: "bg-rose-50 text-rose-900 ring-rose-200", icon: CircleAlert, ic: "text-rose-600" },
  neutral: { cls: "bg-slate-50 text-slate-800 ring-slate-200", icon: Info, ic: "text-slate-500" },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
  action,
}: {
  tone?: keyof typeof ALERT;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  const a = ALERT[tone];
  const Icon = a.icon;
  return (
    <div className={cn("flex gap-3 rounded-xl px-4 py-3 text-sm ring-1 ring-inset", a.cls, className)} role={tone === "danger" ? "alert" : undefined}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", a.ic)} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title ? "mt-0.5" : "", "leading-relaxed opacity-90")}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Misc */

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn("size-5 animate-spin text-brand-600", className)} aria-label="Memuat" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-slate-200/70", className)} />;
}

export function PageLoader({ label = "Memuat data…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-slate-500">
      <Spinner className="size-6" />
      {label}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-10 text-center", className)}>
      {icon && <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-400">{icon}</div>}
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-0.5 text-sm text-slate-500">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = "slate",
  href,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "slate" | "emerald" | "amber" | "violet" | "rose" | "brand";
  href?: string;
}) {
  const toneCls = {
    slate: "bg-slate-100 text-slate-600",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    violet: "bg-violet-100 text-violet-700",
    rose: "bg-rose-100 text-rose-700",
    brand: "bg-brand-100 text-brand-700",
  }[tone];
  const body = (
    <Card className={cn("h-full p-4", href && "transition hover:border-brand-300 hover:shadow-md")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
        {icon && <div className={cn("rounded-lg p-1.5", toneCls)}>{icon}</div>}
      </div>
      <p className="tabular mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
  return href ? (
    <a href={href} className="block h-full">
      {body}
    </a>
  ) : (
    body
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: T; label: React.ReactNode; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("scrollbar-thin -mx-1 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200 px-1", className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition",
            value === t.id
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span
              className={cn(
                "tabular rounded-full px-1.5 py-px text-[11px]",
                value === t.id ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-600",
              )}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="animate-fade-in absolute inset-0 bg-ink-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panelRef}
        className={cn(
          "animate-slide-up relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl",
          w,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Tutup">
            <X className="size-5" />
          </button>
        </div>
        <div className="scrollbar-thin overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] text-slate-700">{children}</code>;
}

export function KeyValue({ items, className }: { items: [React.ReactNode, React.ReactNode][]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-slate-100 text-sm", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="flex items-start justify-between gap-4 py-2">
          <dt className="shrink-0 text-slate-500">{k}</dt>
          <dd className="min-w-0 text-right font-medium break-words text-slate-800">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("scrollbar-thin overflow-x-auto", className)}>
      <table className="min-w-full text-left text-sm">{children}</table>
    </div>
  );
}

export const th = "px-4 py-2.5 text-xs font-semibold tracking-wide text-slate-500 uppercase whitespace-nowrap";
export const td = "px-4 py-3 align-top text-slate-700";
