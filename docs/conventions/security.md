# Security checks before commit

`make verify` runs, and must pass:

```bash
docker compose exec web bundle exec brakeman -q --no-pager
docker compose exec web bundle exec bundler-audit check --update
docker compose exec web bundle exec rubocop
docker compose exec web npm audit --audit-level=high
docker compose exec web npm run lint && npm run typecheck
docker compose exec web bundle exec rails boundaries:check
```

Never add an entry to the `boundaries:check` allowlist — it only shrinks. If a change seems to need an exception, stop and ask.
