"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageLoader } from "@/components/ui";
import { homeFor, useAuth } from "@/lib/auth";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading) router.replace(homeFor(user));
  }, [user, loading, router]);
  return <PageLoader label="Membuka HBAC…" />;
}
