"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import AppShell from "@/components/AppShell";
import { PageLoader } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const needsOnboarding = user?.role === "WORKER" && !!user.onboarding && !user.onboarding.completed;
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (needsOnboarding) router.replace("/lengkapi-profil");
  }, [loading, user, needsOnboarding, router]);
  if (loading || !user || needsOnboarding) return <PageLoader label="Memeriksa sesi…" />;
  return <AppShell>{children}</AppShell>;
}
