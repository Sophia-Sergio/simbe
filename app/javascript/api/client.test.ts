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
