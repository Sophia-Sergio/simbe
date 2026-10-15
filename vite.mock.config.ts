import { createReadStream, existsSync, statSync } from "node:fs"
import { extname, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

const root = fileURLToPath(new URL(".", import.meta.url))

// The host's publicDir only holds the MSW worker, so Rails' public/brand (the logo that BrandMark and the favicon request) is served here.
const brandDir = resolve(root, "public/brand")
const brandTypes: Record<string, string> = { ".png": "image/png", ".svg": "image/svg+xml" }
const brandAssets = (): Plugin => ({
  name: "mock-host-brand-assets",
  configureServer(server) {
    server.middlewares.use("/brand", (req, res, next) => {
      const file = resolve(brandDir, decodeURIComponent((req.url ?? "").split("?")[0]).replace(/^\/+/, ""))
      const type = brandTypes[extname(file)]
      if (!type || !file.startsWith(brandDir + sep) || !existsSync(file) || !statSync(file).isFile()) return next()
      res.setHeader("Content-Type", type)
      createReadStream(file).pipe(res)
    })
  },
})

// Standalone host for frontend lanes: the same React app plus the MSW mock API, no Rails and no Docker.
// The MSW worker (mockServiceWorker.js) lives only in this host's publicDir, never in Rails' public/.
export default defineConfig({
  root: `${root}app/javascript/mock-host`,
  publicDir: `${root}app/javascript/mock-host/public`,
  plugins: [react(), brandAssets()],
  define: { __MOCKS_ENABLED__: true, "import.meta.env.VITE_API_MODE": '"mock"' },
  resolve: {
    alias: {
      "/entrypoints": `${root}app/javascript/entrypoints`,
      "@": `${root}app/javascript`,
      "@contracts": `${root}contracts`,
    },
  },
  server: { fs: { allow: [root] } },
})
