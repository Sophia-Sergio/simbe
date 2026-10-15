.PHONY: up down setup spec web-test web-dev e2e verify contract types contract-coverage ownership ports worktree-guard worktree-env js-build-test
IS_WORKTREE := $(shell [ -f .git ] && echo yes)
worktree-guard:
	@if [ "$(IS_WORKTREE)" = "yes" ]; then grep -q '^COMPOSE_PROJECT_NAME=' .env 2>/dev/null || { echo "Worktree without isolated stack config. Run: make worktree-env" >&2; exit 1; }; fi
worktree-env: ; bin/worktree-env
ports:
	@echo "web:  $$(docker compose port web 3000)"; echo "vite: $$(docker compose port vite 3036)"; echo "db:   $$(docker compose port db 5432)"
up: worktree-guard ; docker compose up -d
down: ; docker compose down
setup: ; docker compose exec web bundle exec rails db:create db:migrate db:seed
spec: ; docker compose exec -e RAILS_ENV=test web bundle exec rspec $(ARGS)
web-test: ; npx vitest run $(ARGS)                 # Vitest runs on the host (Node 22); no Docker needed
web-dev: ; npm run dev:mock                         # standalone mock host on :5173, no Rails, no Docker
e2e: ; npx playwright test $(ARGS)                  # Playwright runs on the host
contract: ; npm run contract
types: ; npm run types
contract-coverage: ; docker compose exec -e RAILS_ENV=test web bundle exec rake contract:coverage
ownership: ; bin/lane check
verify:
	bash docs/superpowers/parallel/check-ownership.sh
	bin/guard-no-health-data
	docker compose exec web bundle exec rubocop
	docker compose exec web bundle exec brakeman -q --no-pager
	docker compose exec web bundle exec bundler-audit check --update
	docker compose exec web bundle exec rails boundaries:check
	$(MAKE) spec
	npm run lint
	npm run typecheck
	npm audit --omit=dev --audit-level=high
	$(MAKE) web-test
