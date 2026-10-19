# Simbe

Analytics for surrogacy agencies. Simbe shows how an agency's recruiting funnel performs (inquiry → application → consult → records → accepted), and answers one question: **which channels, process steps and people turn leads into qualified surrogates?**

- **Owners** get insights (This week, Funnel, Channels), a pipeline board, coordinator performance, data sources, settings and the Claude/MCP connection.
- **Coordinators** get a daily list of next actions and their own leads, nothing else.
- **Everyone** can ask the **Ask Simbe** assistant in plain language ("Which channel is cheapest per qualified surrogate?"), and owners can plug the same data into Claude or any MCP client.
- Each agency uploads full CRM snapshots (seven CSV files). Every agency's data is isolated from every other's, and screener answers (health data) are encrypted and never leave the app verbatim.

More: [`docs/about.md`](docs/about.md) (the product in plain language) and [`docs/agent.md`](docs/agent.md) (what the agent can do).

**Stack:** one Rails 8 app at the repo root (backend **packs** in `app/packs/<pack>/app/…`) · Postgres 16 · Solid Queue in Puma · React 19 + TypeScript + Tailwind embedded with `vite_rails` in `app/javascript` (no Inertia; React Router + the `/api/v1` OpenAPI contract) · Anthropic Claude for the agent. Deployed on Fly.io.

## Get started

**You need:** Docker with Compose, Node 22 and Git. Ruby and Postgres run inside Docker; do not install or run `rails`/`bundle` on the host.

```bash
git clone <repo-url> simbe && cd simbe
cp .env.example .env     # then set ANTHROPIC_API_KEY (see below)
npm ci                   # host tooling: Vitest, Playwright, the mock host
make up                  # db + web (Rails, Puma, Solid Queue) + vite, in Docker
make setup               # db:create db:migrate db:seed (first run only)
make ports               # the host ports Docker picked: web, vite, db
```

Open the `web` URL from `make ports`, then sign in with a seeded account (development only):

| Account | Password | Role |
|---|---|---|
| `erin@harbor.test` | `simbe-dev-pass` | Owner of Harbor Surrogacy |
| `maya@harbor.test` | `simbe-dev-pass` | Coordinator at Harbor |
| `owner@lakeside.test` | `simbe-dev-pass` | Owner of Lakeside Family Building |
| `alex@lakeside.test` | `simbe-dev-pass` | Coordinator at Lakeside |

The seeds create the agencies and people but no leads. To see numbers, load a snapshot from **Data sources** (or the sign-up wizard). Generate a synthetic one with `bin/generate-sample-export`; the real exports are local-only and never committed.

### Configuration (`.env`)

| Variable | What |
|---|---|
| `ANTHROPIC_API_KEY` | Needed for Ask Simbe. Your own Anthropic API key. Everything else works without it. |
| `DATABASE_URL`, `SECRET_KEY_BASE` | `DATABASE_URL` is set by Docker Compose in development. Leave both blank unless you run outside Docker; production gets them from Fly secrets. |
| `VITE_API_MODE` | `real` (default) talks to Rails; `mock` uses the in-browser mock API. See [Mock vs real](#mock-vs-real). |
| `AR_ENCRYPTION_PRIMARY_KEY`, `AR_ENCRYPTION_KEY_DERIVATION_SALT` | Encrypt screener answers. Blank in development and tests falls back to fixed, non-secret keys (fictional data only). **Required in production**, where the app refuses to boot without them; back them up ([`docs/operations/secrets.md`](docs/operations/secrets.md)). |
| `MCP_PUBLIC_URL` | Base address shown on the Connect Claude page. Defaults to `http://localhost:3000/mcp`; set it to the `web` port from `make ports` if yours differs. Production uses `https://simbe.fly.dev/mcp` (`fly.toml`). |

Just want to look at the UI, with no Docker and no Rails? `npm ci && npm run dev:mock` serves the React app with a mock API on http://127.0.0.1:5173.

## Connect Claude and other MCP clients

Simbe runs an [MCP](https://modelcontextprotocol.io) server, so an owner can ask questions about the agency's funnel, channels, drop-offs, and next actions from Claude (or any MCP client), using the same read-only tools as Ask Simbe. The tools, their limits and the privacy rules are in [`docs/agent.md`](docs/agent.md); how it is implemented is in [`docs/agent-and-mcp-architecture.md`](docs/agent-and-mcp-architecture.md).

### 1. Get your server address and key

1. Sign in as the **owner** and open **Connect Claude** (sidebar, under Agency).
2. Copy the **Server URL**. It looks like `https://simbe.fly.dev/mcp/<your-agency-slug>` (locally, `http://localhost:3000/mcp/harbor`).
3. Click **Generate new key** and copy it straight away. It starts with `simbe_live_`, is **shown in full only once**, and generating a new one revokes the old one immediately.

### 2. General connection details

Any client that supports remote MCP over HTTP needs just these:

| Setting | Value |
|---|---|
| Transport | Streamable HTTP (JSON-RPC 2.0 over `POST`, no SSE) |
| URL | the Server URL from step 1 |
| Header | `Authorization: Bearer <your key>` |

Clients that read a JSON config usually want this shape (the Connect Claude page generates it with your key filled in; the key names vary slightly by client, e.g. `servers` or `"type": "http"`):

```json
{
  "mcpServers": {
    "simbe": {
      "url": "https://simbe.fly.dev/mcp/<your-agency-slug>",
      "headers": { "Authorization": "Bearer <your key>" }
    }
  }
}
```

Test it from a terminal (should list five tools):

```bash
curl -s https://simbe.fly.dev/mcp/<your-agency-slug> \
  -H "Authorization: Bearer <your key>" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

A key works for one agency only: `401` means an unknown or revoked key, `404` means the slug does not match the key's agency.

### 3. Claude

**Claude Code** (terminal or IDE):

```bash
claude mcp add --transport http simbe https://simbe.fly.dev/mcp/<your-agency-slug> \
  --header "Authorization: Bearer <your key>"
```

Add `--scope project` to share it through a `.mcp.json` in a repo (use an environment variable for the key there, never the key itself), or `--scope user` to have it in every project. Check it with `claude mcp list`, or `/mcp` inside a session.

**Claude Desktop** takes local commands in `claude_desktop_config.json`, so bridge to the remote server with [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) (needs Node):

```json
{
  "mcpServers": {
    "simbe": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://simbe.fly.dev/mcp/<your-agency-slug>",
               "--header", "Authorization:${SIMBE_AUTH}"],
      "env": { "SIMBE_AUTH": "Bearer <your key>" }
    }
  }
}
```

Restart Claude Desktop afterwards.

**claude.ai and other chat apps' "custom connector" screens** (including ChatGPT) are not supported yet: they expect OAuth or no authentication, and Simbe uses a bearer key (OAuth is a listed non-goal). Use Claude Code, Claude Desktop with the bridge above, or any developer tool that accepts a URL plus headers (Cursor, VS Code, Windsurf, Cline, Zed and similar).

Then ask Claude something like "Using Simbe, how many qualified leads did we get in the last 30 days?" and it will call `get_funnel`.

## Day to day

A linked git worktree gets its own isolated stack: `make worktree-env` (run for you by `bin/lane start`) writes a `.env` with its own compose project, database and ports.

| Command | What |
|---|---|
| `make spec ARGS=spec/requests/spa_spec.rb` | RSpec (Docker, `simbe_test` database) |
| `make web-test` / `npx vitest run` | Vitest (host, Node 22) |
| `make e2e` | Playwright, `mock-desktop` and `mock-mobile` projects (`E2E_API=real E2E_BASE_URL=… make e2e` for the real stack) |
| `make verify` | Everything CI runs: ownership + health-data guards, rubocop, brakeman, bundler-audit, boundaries, specs, lint, typecheck, `npm audit --omit=dev`, Vitest |

## Mock vs real

The frontend reads its API mode from `VITE_API_MODE` (`.env.example`):

- **`real` (default)** — the Rails-embedded app talks to `/api/v1` on its own origin (no proxy, no mocks). This is what runs in Docker: `make up` → the app at the `web` port from `make ports`.
- **`mock`** — the Rails dev server starts MSW in the browser instead of calling Rails (`VITE_API_MODE=mock` in `.env`, restart `web`). Useful for frontend work with no backend data; never enabled in a build (`__MOCKS_ENABLED__` is only true for `vite serve` with `mock`).
- **`npm run dev:mock`** — the standalone mock host on :5173. It is **always** mock (`vite.mock.config.ts` forces `VITE_API_MODE=mock`), needs no Rails and no Docker, and is what the Playwright `mock-*` projects and Vitest use.

Playwright picks its projects from `E2E_API`: without it, `mock-desktop`/`mock-mobile` start the standalone mock host themselves; with `E2E_API=real` and a base URL it targets a running Rails stack (both viewports):

```bash
E2E_API=real E2E_BASE_URL="http://127.0.0.1:$(docker compose port web 3000 | cut -d: -f2)" make e2e
```

The real-export journeys are tagged/skipped by construction (the exports are local-only), so the same command is safe in CI.

## Where things are

| Path | What |
|------|------|
| `app/packs/<pack>/` | Backend packs: identity, connection, ingest, leads, metrics, agent, mcp (models, controllers, services, serializers, jobs) |
| `app/javascript/` | The React app: `app/` (shell, registry), `api/`, `mocks/`, `components/`, `features/<lane>/` |
| `contracts/` | OpenAPI 3.1 contract + Alpha-derived examples (single source of truth for `/api/v1`) |
| `e2e/` | Playwright specs (mock and real projects) |
| `handoff/design/` | Hi-fi design reference (README, screenshots, HTML prototype) |
| `handoff/takehome/` | Source brief, data model docs, sample CSV exports (**exports are git-ignored**) |
| `docs/conventions/` | Binding coding rules |
| `docs/design/brand.md` | Colors, type, shapes, logo (simbefamily.com) |
| `docs/operations/` | Deploy, secrets, rollback, backups runbooks |
| `docs/superpowers/specs/`, `plans/`, `parallel/` | Design specs, implementation plans, the lane matrix and playbook for building with many agents |
| `bin/` | Rails stubs plus `lane`, `worktree-env`, `golden-numbers`, `generate-sample-export`, `guard-no-health-data`, `setup-github` |

## Documentation

Everything under `docs/`, in the order you are likely to need it:

| Doc | Read it when |
|---|---|
| [`docs/about.md`](docs/about.md) | You want the product in plain language: who uses it, the funnel, how data gets in, privacy. |
| [`docs/agent.md`](docs/agent.md) | You want to know what Ask Simbe and the MCP server can and cannot do, their tools and limits. |
| [`docs/agent-and-mcp-architecture.md`](docs/agent-and-mcp-architecture.md) | You want to know how the agent and MCP server are built: registry, turn loop, keys, ledger, throttles, tests. |
| [`docs/build-report.md`](docs/build-report.md) | You want to know how it was built, and why Postgres and a Rails monolith. |
| [`docs/conventions/`](docs/conventions/README.md) | You are about to write code. Binding rules: development, testing, database, multi-tenancy, sensitive data, controllers, frontend, AI agent, security, CI. |
| [`docs/design/brand.md`](docs/design/brand.md) | You are touching the UI: colors, type, shapes, logo (overrides the handoff). |
| [`docs/operations/`](docs/operations/README.md) | You deploy or run production: [secrets](docs/operations/secrets.md), [deploy](docs/operations/deploy.md), [rollback](docs/operations/rollback.md), [backups](docs/operations/backups.md). |
| [`docs/superpowers/`](docs/superpowers/README.md) | You build features: [specs](docs/superpowers/specs/README.md), [plans](docs/superpowers/plans/README.md), and the [parallel lanes](docs/superpowers/parallel/README.md) with its [playbook](docs/superpowers/parallel/playbook.md). |

Product and design reference lives outside `docs/`: [`handoff/design/README.md`](handoff/design/README.md) (layout, screens, behavior) and `handoff/takehome/docs/data-model.md` (the data model).

Start with [`docs/superpowers/README.md`](docs/superpowers/README.md) for build order and how to execute plans.
