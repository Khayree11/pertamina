import type { CSSProperties, ReactNode } from "react";
import { cn } from "./ui";

/*
 * Logo Pertamina Patra Niaga versi satu warna.
 * Bentuknya diambil dari kanal alfa public/brand/pertamina-patra-niaga.png (258×81) dan diwarnai dengan warna teks
 * induknya (currentColor), sehingga logo selalu senada dengan tema: putih di latar gelap, tinta di latar terang.
 * Ganti warnanya cukup lewat kelas teks, mis. <PatraNiagaLogo className="h-9 text-brand-200" />.
 */
const SRC = "/brand/pertamina-patra-niaga.png";
const MASK: CSSProperties = {
  WebkitMaskImage: `url(${SRC})`,
  maskImage: `url(${SRC})`,
  WebkitMaskSize: "100% 100%",
  maskSize: "100% 100%",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
};

export function PatraNiagaLogo({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Pertamina Patra Niaga"
      style={MASK}
      className={cn("inline-block aspect-[258/81] shrink-0 bg-current", className ?? "h-10")}
    />
  );
}

/** Logo perusahaan | nama aplikasi. */
export function BrandLockup({
  tone = "dark",
  subtitle = "Health-Based Access Control",
  logoClassName = "h-9",
}: {
  tone?: "dark" | "light";
  subtitle?: ReactNode;
  logoClassName?: string;
}) {
  const dark = tone === "dark";
  return (
    <div className={cn("flex min-w-0 items-center gap-4", dark ? "text-white" : "text-ink-900")}>
      <PatraNiagaLogo className={logoClassName} />
      <span aria-hidden className={cn("h-8 w-px shrink-0", dark ? "bg-white/20" : "bg-slate-300")} />
      <div className="min-w-0 leading-tight">
        <p className="text-sm font-semibold">HBAC</p>
        <p className={cn("text-xs", dark ? "text-slate-400" : "text-slate-500")}>{subtitle}</p>
      </div>
    </div>
  );
}
