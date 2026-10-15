export const API = "/api/v1";
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) { super(message); this.name = "ApiError"; }
}
async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const { error, ...extra } = (data ?? {}) as { error?: { code?: string; message?: string } } & Record<string, unknown>;
    throw new ApiError(res.status, error?.code ?? "unknown", error?.message ?? res.statusText, extra);
  }
  return data as T;
}
export async function jsonRequest<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, { method, credentials: "same-origin",
    headers: { Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}), "X-Requested-With": "simbe" },
    body: body !== undefined ? JSON.stringify(body) : undefined });
  return parse<T>(res);
}
export async function uploadFiles<T = unknown>(path: string, files: File[]): Promise<T> {
  const form = new FormData(); files.forEach((f) => form.append("files", f));
  const res = await fetch(path, { method: "POST", credentials: "same-origin", headers: { Accept: "application/json", "X-Requested-With": "simbe" }, body: form });
  return parse<T>(res);
}
