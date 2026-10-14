# Simbe — Coding Conventions

Source of truth for project rules. `.cursor/rules/` mirrors them. Read every file at the start of a session.

| File | Topic |
|------|-------|
| [development.md](./development.md) | Docker Compose workflow, `make` targets, env |
| [testing.md](./testing.md) | RSpec / Vitest / Playwright: one owner per behaviour |
| [database.md](./database.md) | UUID keys, indexes, N+1, snapshot-replace pattern |
| [multi-tenancy.md](./multi-tenancy.md) | Agency isolation rules and the isolation spec |
| [sensitive-data.md](./sensitive-data.md) | Health data: encryption, masking, logging, AI provider |
| [controllers.md](./controllers.md) | Thin controllers, service objects, error envelope |
| [frontend.md](./frontend.md) | Structure, design tokens, API layer, responsive, dialogs, single-flight |
| [ai-agent.md](./ai-agent.md) | Anthropic usage, tool-calling loop, spend log, prompt rules |
| [security.md](./security.md) | Brakeman, bundler-audit, npm audit before commit |
