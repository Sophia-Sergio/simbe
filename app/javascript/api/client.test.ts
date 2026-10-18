import { jsonRequest, uploadFiles, ApiError } from "./client";
afterEach(() => vi.unstubAllGlobals());
it("sends CSRF header and JSON body", async () => {
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200 })); vi.stubGlobal("fetch", f);
  await expect(jsonRequest("POST", "/api/v1/x", { a: 1 })).resolves.toEqual({ ok: 1 });
  const init = f.mock.calls[0][1];
  expect(init.headers["X-Requested-With"]).toBe("simbe"); expect(init.headers["Content-Type"]).toBe("application/json"); expect(init.credentials).toBe("same-origin");
});
it("returns undefined on 204", async () => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 }))); await expect(jsonRequest("DELETE", "/api/v1/x")).resolves.toBeUndefined(); });
it("throws ApiError with code, message and extra keys", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "unknown_coordinator", message: "no" }, valid_names: ["A"] }), { status: 422 })));
  await expect(jsonRequest("POST", "/api/v1/x", {})).rejects.toMatchObject({ status: 422, code: "unknown_coordinator", extra: { valid_names: ["A"] } });
});
it("maps non-JSON failures to ApiError unknown", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 502 })));
  await expect(jsonRequest("GET", "/api/v1/x")).rejects.toBeInstanceOf(ApiError);
});
it("uploadFiles posts multipart without a manual content type", async () => {
  const f = vi.fn().mockResolvedValue(new Response("{}", { status: 201 })); vi.stubGlobal("fetch", f);
  await uploadFiles("/api/v1/snapshot_uploads", [new File(["a"], "leads.csv")]);
  const init = f.mock.calls[0][1];
  expect(init.body).toBeInstanceOf(FormData); expect(init.headers["Content-Type"]).toBeUndefined(); expect(init.headers["X-Requested-With"]).toBe("simbe");
});
it("uploadFiles sends every file under `files[]` so Rack keeps them all", async () => {
  // A plain repeated `files` field makes Rack keep only the last part (the real API then validates
  // 1 of 7 files); only `files[]` becomes an array.
  const f = vi.fn().mockResolvedValue(new Response("{}", { status: 201 })); vi.stubGlobal("fetch", f);
  await uploadFiles("/api/v1/snapshot_uploads", [new File(["a"], "leads.csv"), new File(["b"], "stage_history.csv")]);
  const body = f.mock.calls[0][1].body as FormData;
  expect(body.getAll("files[]").map((file) => (file as File).name)).toEqual(["leads.csv", "stage_history.csv"]);
  expect(body.getAll("files")).toHaveLength(0);
});
it("maps a failed fetch to ApiError network_error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
  await expect(jsonRequest("GET", "/api/v1/x")).rejects.toMatchObject({ status: 0, code: "network_error" });
});
it("maps an aborted request to the AbortError so React Query can ignore it", async () => {
  const abort = new DOMException("aborted", "AbortError");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));
  await expect(jsonRequest("GET", "/api/v1/x")).rejects.toMatchObject({ name: "AbortError" });
});
it("maps a 2xx non-JSON body to ApiError invalid_response", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 200 })));
  await expect(jsonRequest("GET", "/api/v1/x")).rejects.toMatchObject({ code: "invalid_response" });
});
it("passes an AbortSignal through to fetch", async () => {
  const f = vi.fn().mockResolvedValue(new Response("{}", { status: 200 })); vi.stubGlobal("fetch", f);
  const controller = new AbortController();
  await jsonRequest("GET", "/api/v1/x", undefined, controller.signal);
  expect(f.mock.calls[0][1].signal).toBe(controller.signal);
});
it("jsonRequest tolerates an empty 200 body", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
  await expect(jsonRequest("GET", "/api/v1/x")).resolves.toBeUndefined();
});
