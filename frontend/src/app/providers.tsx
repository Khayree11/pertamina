"use client";

import { SWRConfig } from "swr";
import { ToastProvider } from "@/components/toast";
import { fetcher } from "@/lib/api";
import { AuthProvider } from "@/lib/auth";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ fetcher, revalidateOnFocus: true, dedupingInterval: 1500, errorRetryCount: 2 }}>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </SWRConfig>
  );
}
