// @vitest-environment node
import type { AddressInfo } from "node:net"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createServer } from "vite"
import { expect, it } from "vitest"

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")

it("serves the brand mark from public/brand, not the HTML fallback (BrandMark and the favicon use /brand/simbe-mark.png)", async () => {
  const server = await createServer({ configFile: resolve(repo, "vite.mock.config.ts"), logLevel: "silent", server: { host: "127.0.0.1", port: 0 } })
  await server.listen()
  try {
    const { port } = server.httpServer!.address() as AddressInfo
    const res = await fetch(`http://127.0.0.1:${port}/brand/simbe-mark.png`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/png")
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(100)

    const escape = await fetch(`http://127.0.0.1:${port}/brand/..%2F..%2Fpackage.json`)
    expect(escape.headers.get("content-type") ?? "").not.toContain("json")
  } finally {
    await server.close()
  }
})
