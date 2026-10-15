import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const root = fileURLToPath(new URL(".", import.meta.url))

// Standalone host for frontend lanes: the same React app plus the MSW mock API, no Rails and no Docker.
// The MSW worker (mockServiceWorker.js) lives only in this host's publicDir, never in Rails' public/.
export default defineConfig({
  root: `${root}app/javascript/mock-host`,
  publicDir: `${root}app/javascript/mock-host/public`,
  plugins: [react()],
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
