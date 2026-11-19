export type FieldError = { field: string; message: string };

export class ApiError extends Error {
  status: number;
  errors?: FieldError[];
  constructor(status: number, message: string, errors?: FieldError[]) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

type Options = { method?: string; json?: unknown; form?: FormData; signal?: AbortSignal };

export async function api<T = any>(path: string, opts: Options = {}): Promise<T> {
  const hasBody = opts.json !== undefined || opts.form !== undefined;
  const headers: Record<string, string> = {};
  const init: RequestInit = {
    method: opts.method ?? (hasBody ? "POST" : "GET"),
    credentials: "include",
    headers,
    signal: opts.signal,
  };
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.json);
  } else if (opts.form) {
    init.body = opts.form;
  }

  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, "Tidak dapat terhubung ke server. Pastikan backend berjalan.");
  }
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
      window.dispatchEvent(new Event("hbac:unauthorized"));
    }
    let detail: string;
    if (typeof data?.detail === "string") detail = data.detail;
    else if (res.status >= 500) detail = "Server backend tidak merespons atau terjadi kesalahan.";
    else detail = "Permintaan gagal diproses.";
    throw new ApiError(res.status, detail, data?.errors);
  }
  return data as T;
}

export const fetcher = (url: string) => api(url);

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Terjadi kesalahan.";
}
