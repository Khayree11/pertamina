"use client";

import useSWR from "swr";
import type { Meta } from "./types";

export function useMeta() {
  return useSWR<Meta>("/api/meta", { revalidateOnFocus: false, dedupingInterval: 60_000 });
}
