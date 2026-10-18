import { execFileSync } from "node:child_process"
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// State bootstrap for the real-stack journeys. Everything runs through THIS worktree's own Docker
// stack (`COMPOSE_PROJECT_NAME` from its `.env`) and never another lane's (docs/conventions/worktrees.md).
// The CLI approach is the one the plan asks for: `docker compose exec web rails e2e:seed`.

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

/**
 * Runs a Rails task in this worktree's stack. `-T` disables the TTY so it is safe from a test
 * process; the stack must be up (`make up`) or this throws with that hint.
 */
export function rails(...args: string[]): void {
  try {
    execFileSync("docker", ["compose", "exec", "-T", "web", "bundle", "exec", "rails", ...args], {
      cwd: repo,
      stdio: ["ignore", "inherit", "inherit"],
    })
  } catch (error) {
    throw new Error(`docker compose exec failed — is this worktree's stack up (\`make up\`)?\n${String(error)}`, { cause: error })
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

let seeded = false

/** Loads the Alpha dataset + the owner/coordinator logins; idempotent, once per worker. */
export function seed(): void {
  if (seeded) return
  withLock(() => rails("e2e:seed"))
  seeded = true
}

/** Drops agencies a previous run created (name prefix), then reseeds Alpha. */
export function reset(prefix = "E2E "): void {
  withLock(() => {
    rails(`e2e:reset[${prefix}]`)
    rails("e2e:seed")
  })
  seeded = true
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
