import { safeRoute } from "./routes"

describe("safeRoute", () => {
  it("keeps the app's own routes (query strings included)", () => {
    expect(safeRoute("/")).toBe("/")
    expect(safeRoute("/pipeline")).toBe("/pipeline")
    expect(safeRoute("/pipeline?lead=1")).toBe("/pipeline?lead=1")
    expect(safeRoute("/channels/Facebook")).toBe("/channels/Facebook")
    expect(safeRoute("/channels/Facebook?range=90d")).toBe("/channels/Facebook?range=90d")
    expect(safeRoute("/next-actions")).toBe("/next-actions")
    expect(safeRoute("/settings/team")).toBe("/settings/team")
  })

  it("drops anything that would take the user off the app or off the whitelist", () => {
    for (const route of [
      "//evil.example",
      "https://evil.example/steal",
      "http://x",
      "javascript:alert(1)",
      "data:text/html,x",
      "/admin",
      "/channels/../../settings",
      "/channels//evil",
      "/channels\\evil",
      "/channels\u0000evil",
      "pipeline",
      "",
    ]) {
      expect(safeRoute(route)).toBeNull()
    }
  })

  it("drops values that are not strings", () => {
    expect(safeRoute(undefined)).toBeNull()
    expect(safeRoute(null)).toBeNull()
    expect(safeRoute(42)).toBeNull()
    expect(safeRoute({ route: "/pipeline" })).toBeNull()
  })
})
