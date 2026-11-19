"use client";

import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import useSWR, { useSWRConfig } from "swr";
import { api, fetcher } from "./api";
import type { User } from "./types";

export type RegisterData = {
  username: string;
  password: string;
  full_name: string;
  employee_code: string;
  phone: string;
  email: string | null;
  consent: boolean;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  demoLogin: (username: string) => Promise<User>;
  register: (data: RegisterData) => Promise<User>;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function homeFor(user: User | null): string {
  if (!user) return "/login";
  if (user.role === "ADMIN") return "/admin";
  return user.onboarding && !user.onboarding.completed ? "/lengkapi-profil" : "/dashboard";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { mutate: globalMutate } = useSWRConfig();
  const { data, error, isLoading, mutate } = useSWR<{ user: User }>("/api/auth/me", fetcher, {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
  });

  const clearCache = useCallback(
    () => globalMutate((key) => key !== "/api/auth/me", undefined, { revalidate: false }),
    [globalMutate],
  );

  useEffect(() => {
    const onUnauthorized = () => {
      mutate(undefined, { revalidate: true });
    };
    window.addEventListener("hbac:unauthorized", onUnauthorized);
    return () => window.removeEventListener("hbac:unauthorized", onUnauthorized);
  }, [mutate]);

  const value = useMemo<AuthState>(
    () => ({
      user: error ? null : (data?.user ?? null),
      loading: isLoading,
      login: async (username, password) => {
        await clearCache();
        const r = await api<{ user: User }>("/api/auth/login", { json: { username, password } });
        await mutate(r, { revalidate: false });
        return r.user;
      },
      demoLogin: async (username) => {
        await clearCache();
        const r = await api<{ user: User }>("/api/auth/demo-login", { json: { username } });
        await mutate(r, { revalidate: false });
        return r.user;
      },
      register: async (body) => {
        await clearCache();
        const r = await api<{ user: User }>("/api/auth/register", { json: body });
        await mutate(r, { revalidate: false });
        return r.user;
      },
      refresh: () => mutate(),
      logout: async () => {
        try {
          await api("/api/auth/logout", { method: "POST" });
        } finally {
          await clearCache();
          await mutate(undefined, { revalidate: true });
        }
      },
    }),
    [data, error, isLoading, mutate, clearCache],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth harus di dalam AuthProvider");
  return ctx;
}
