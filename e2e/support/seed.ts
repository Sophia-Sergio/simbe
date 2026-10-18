import { execFileSync } from "node:child_process"
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// State bootstrap for the real-stack journeys. Locally every command runs inside THIS worktree's
// own Docker stack (`COMPOSE_PROJECT_NAME` from its `.env`), never another lane's
// (docs/conventions/worktrees.md). The CI `e2e-real` job runs Rails natively on the runner (no
// compose stack), so there the same commands run as plain `bundle exec rails …`.

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const lockFile = resolve(repo, "tmp/e2e-seed.lock") // `tmp/` is git-ignored

/** The seven CSVs every export consists of (matched by basename, any order). */
export const EXPORT_FILES = [
  "leads.csv",
  "stage_history.csv",
  "contact_log.csv",
  "screener_answers.csv",
  "web_sessions.csv",
  "appointments.csv",
  "applications.csv",
] as const

/** Hosts the bootstrap may write to without an explicit opt-in. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])

/**
 * Refuses to bootstrap the stack behind a non-local `E2E_BASE_URL`: `seed()`, `reset()` and
 * `alphaFiles()` mutate that database, so a remote base URL would write to someone else's
 * environment. `localhost`, `127.0.0.1` and `[::1]` (or no base URL at all) are fine;
 * `E2E_ALLOW_REMOTE=1` opts in to anything else.
 */
export function assertLocalStack(baseURL = process.env.E2E_BASE_URL, allowRemote = process.env.E2E_ALLOW_REMOTE): void {
  if (!baseURL || allowRemote === "1") return
  let host: string
  try {
    host = new URL(baseURL).hostname
  } catch (error) {
    throw new Error(`E2E_BASE_URL is not a valid URL: ${baseURL}`, { cause: error })
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `refusing to run the e2e bootstrap against a non-local E2E_BASE_URL (${host}): it would mutate a remote database. Set E2E_ALLOW_REMOTE=1 to override.`,
    )
  }
}

/** Rails runs on this host when CI is set (the e2e-real job) or Docker is not installed. */
function localRails(): boolean {
  if (process.env.CI) return true
  try {
    execFileSync("docker", ["--version"], { stdio: "ignore" })
    return false
  } catch {
    return true
  }
}

let cachedLocal: boolean | undefined
const runsLocally = (): boolean => (cachedLocal ??= localRails())

/**
 * Runs a Rails task against the stack behind the tests: `docker compose exec web bundle exec rails`
 * locally, `bundle exec rails` when CI is set or Docker is unavailable. `-T` disables the TTY so it
 * is safe from a test process.
 */
export function rails(...args: string[]): void {
  assertLocalStack()
  const [command, argv]: [string, string[]] = runsLocally()
    ? ["bundle", ["exec", "rails", ...args]]
    : ["docker", ["compose", "exec", "-T", "web", "bundle", "exec", "rails", ...args]]
  try {
    execFileSync(command, argv, { cwd: repo, stdio: ["ignore", "inherit", "inherit"] })
  } catch (error) {
    throw new Error(
      `\`${command} ${argv.slice(0, 3).join(" ")} …\` failed — is the stack up (\`make up\`) locally, or the database prepared in CI?\n${String(error)}`,
      { cause: error },
    )
  }
}

/**
 * Serializes bootstraps across Playwright workers: several journey files seed in `beforeAll` at
 * once, and the snapshot replace must not race itself. A lock file (written under the git-ignored
 * `tmp/`) is enough for one machine.
 */
function withLock<T>(work: () => T): T {
  mkdirSync(dirname(lockFile), { recursive: true })
  const deadline = Date.now() + 120_000
  for (;;) {
    try {
      const fd = openSync(lockFile, "wx")
      try {
        return work()
      } finally {
        closeSync(fd)
        unlinkSync(lockFile)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${lockFile}`, { cause: error })
      // Busy-wait without Atomics.wait (unavailable in the Playwright sandbox): a short spin is fine.
      const until = Date.now() + 250
      while (Date.now() < until) {
        /* spin */
      }
    }
  }
}

/** Loads the Alpha dataset + the owner/coordinator logins. Idempotent; run in every `beforeAll`. */
export function seed(): void {
  withLock(() => rails("e2e:seed"))
}

/** Drops agencies a previous run created (name prefix), then reseeds Alpha. */
export function reset(prefix = "E2E "): void {
  withLock(() => {
    rails(`e2e:reset[${prefix}]`)
    rails("e2e:seed")
  })
}

const alphaDir = resolve(repo, "tmp/e2e-alpha")
let alphaReady = false

/** The seven Alpha CSVs for the upload-at-signup journey, generated once per worker. */
export function alphaFiles(): { name: string; mimeType: string; buffer: Buffer }[] {
  if (!alphaReady) {
    withLock(() => rails("e2e:alpha_files[tmp/e2e-alpha]"))
    alphaReady = true
  }
  return EXPORT_FILES.map((name) => ({ name, mimeType: "text/csv", buffer: readFileSync(resolve(alphaDir, name)) }))
}
