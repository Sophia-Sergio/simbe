// Production-bundle elimination: with the build-time constant `__MOCKS_ENABLED__` false, importing the mock
// entrypoint must pull in no MSW code — the dynamic `import("./browser")` in startMocks() is dead-code
// eliminated. This is what guarantees the MSW/mocks chunk never ships in a Rails build.
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "vite"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")

type Output = { type: string; code?: string; fileName?: string; source?: string | Uint8Array }

it("a production build with mocks disabled contains no MSW", async () => {
  const result = await build({
    configFile: false,
    root: REPO_ROOT,
    logLevel: "silent",
    define: { __MOCKS_ENABLED__: "false" },
    resolve: { alias: { "@": resolve(REPO_ROOT, "app/javascript"), "@contracts": resolve(REPO_ROOT, "contracts") } },
    build: {
      write: false,
      minify: false,
      lib: { entry: resolve(REPO_ROOT, "app/javascript/mocks/bootstrap.ts"), formats: ["es"], name: "mockEntry" },
      rollupOptions: { external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"] },
    },
  })

  const bundles = Array.isArray(result) ? result : [result]
  const code = bundles
    .flatMap((bundle) => (bundle as { output: Output[] }).output)
    .filter((output) => output.type === "chunk")
    .map((output) => output.code ?? "")
    .join("\n")

  expect(code).not.toContain("mockServiceWorker")
  expect(code).not.toContain("setupWorker")
  expect(code).not.toMatch(/\bmsw\b/)
})
