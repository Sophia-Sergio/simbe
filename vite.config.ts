import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import RubyPlugin from "vite-plugin-ruby"

const root = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig(({ mode }) => ({
  plugins: [RubyPlugin(), react()],
  // MSW and the mock API are compiled in only for `VITE_API_MODE=mock` outside production, so no Rails build ships them.
  define: { __MOCKS_ENABLED__: JSON.stringify(process.env.VITE_API_MODE === "mock" && mode !== "production") },
  resolve: { alias: { "@": `${root}app/javascript`, "@contracts": `${root}contracts` } },
  server: { host: "0.0.0.0", port: 3036, strictPort: true, fs: { allow: [".."] } },
}))
