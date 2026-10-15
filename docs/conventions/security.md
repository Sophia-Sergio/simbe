# Security checks before commit

`make verify` runs, and must pass:

```bash
docker compose exec web bundle exec brakeman -q --no-pager
docker compose exec web bundle exec bundler-audit check --update
docker compose exec web bundle exec rubocop
npm audit --omit=dev --audit-level=high   # shipped (production) dependencies; see the note below
docker compose exec web npm run lint && npm run typecheck
docker compose exec web bundle exec rails boundaries:check
```

Never add an entry to the `boundaries:check` allowlist — it only shrinks. If a change seems to need an exception, stop and ask.

**npm audit scope.** The gate audits production dependencies (`--omit=dev`). The full audit reports advisories in dev-time build tooling only (the `braces` → `micromatch`/`chokidar`/`fast-glob` chain under Tailwind 3.4, for which no patched `braces` exists). Run `npm audit` (full) when upgrading Tailwind or the toolchain; drop `--omit=dev` as soon as the full audit is clean.
