import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

const root = fileURLToPath(new URL(".", import.meta.url))

// Separate from vite.config.ts on purpose: Vitest never loads vite-plugin-ruby.
export default defineConfig({
  plugins: [react()],
  define: { __MOCKS_ENABLED__: true },
  resolve: { alias: { "@": `${root}app/javascript`, "@contracts": `${root}contracts` } },
  test: {
    environment: "jsdom",
    setupFiles: ["./app/javascript/test/setup.ts"],
    globals: true,
    include: ["app/javascript/**/*.test.{ts,tsx}", "e2e/**/*.test.ts"],
    css: false,
  },
})
