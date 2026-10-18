export const API = "/api/v1";
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) { super(message); this.name = "ApiError"; }
}
async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown;
  if (text) {
    try { data = JSON.parse(text); } catch {
      // A 2xx body must be JSON; a non-JSON body is a broken response, not an empty success.
      if (res.ok) throw new ApiError(res.status, "invalid_response", "Expected a JSON response");
      data = undefined;
    }
  }
  if (!res.ok) {
    const { error, ...extra } = (data ?? {}) as { error?: { code?: string; message?: string } } & Record<string, unknown>;
    throw new ApiError(res.status, error?.code ?? "unknown", error?.message ?? res.statusText, extra);
  }
  return data as T;
}
async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(path, init);
  } catch (caught) {
    // Aborts belong to React Query (cancelQueries): let AbortError through untouched, wrap the rest.
    if (caught && typeof caught === "object" && (caught as { name?: string }).name === "AbortError") throw caught;
    throw new ApiError(0, "network_error", caught instanceof Error ? caught.message : "Network request failed");
  }
}
export async function jsonRequest<T = unknown>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await send(path, { method, credentials: "same-origin", signal,
    headers: { Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}), "X-Requested-With": "simbe" },
    body: body !== undefined ? JSON.stringify(body) : undefined });
  return parse<T>(res);
}
export async function uploadFiles<T = unknown>(path: string, files: File[], signal?: AbortSignal): Promise<T> {
  const form = new FormData();
  // `files[]`, not `files`: Rack's multipart parser collects repeated parts into an array only when
  // the field name ends with `[]`. With a plain repeated name it keeps the LAST part alone, so the
  // API would validate one of the seven exports. (Rails' own request specs post `files: [...]`,
  // i.e. `files[]` on the wire.)
  files.forEach((f) => form.append("files[]", f));
  const res = await send(path, { method: "POST", credentials: "same-origin", signal, headers: { Accept: "application/json", "X-Requested-With": "simbe" }, body: form });
  return parse<T>(res);
}
