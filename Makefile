.PHONY: up down setup spec web-test web-dev e2e verify contract types contract-coverage ownership ports worktree-guard worktree-env js-build-test build restart logs logs-vite console bash migrate rollback seed routes runner generate install lint boundaries brakeman bundler-audit npm-audit knip prod-machine-id prod-console prod-bash prod-logs
IS_WORKTREE := $(shell [ -f .git ] && echo yes)
worktree-guard:
	@if [ "$(IS_WORKTREE)" = "yes" ]; then grep -q '^COMPOSE_PROJECT_NAME=' .env 2>/dev/null || { echo "Worktree without isolated stack config. Run: make worktree-env" >&2; exit 1; }; fi
worktree-env: ; bin/worktree-env
ports:
	@echo "web:  $$(docker compose port web 3000)"; echo "vite: $$(docker compose port vite 3036)"; echo "db:   $$(docker compose port db 5432)"
up: worktree-guard ; docker compose up -d
down: ; docker compose down
setup: ; docker compose exec web bundle exec rails db:create db:migrate db:seed
contract-bundle: ; npm run contract
spec: contract-bundle
	docker compose exec -e RAILS_ENV=test web bundle exec rails db:prepare   # creates simbe_test on a fresh stack; a no-op afterwards
	docker compose exec -e RAILS_ENV=test web bundle exec rspec $(ARGS)
web-test: ; npx vitest run $(ARGS)                 # Vitest runs on the host (Node 22); no Docker needed
web-dev: ; npm run dev:mock                         # standalone mock host on :5173, no Rails, no Docker
e2e: ; npx playwright test $(ARGS)                  # Playwright runs on the host
contract: ; npm run contract
types: ; npm run types
# The task is defined by W0-3 (backend core); until it lands this is a no-op so verify and CI stay green.
contract-coverage: ; docker compose exec -e RAILS_ENV=test web sh -c 'if bundle exec rake -P 2>/dev/null | grep -qx "rake contract:coverage"; then bundle exec rake contract:coverage; else echo "contract:coverage not defined yet (W0-3)"; fi'
ownership: ; bin/lane check
verify-changed: ; bin/verify-changed   # fast: lint, boundaries and the specs related to this worktree's changes (run after every task; `make verify` is the full run)
verify:
	bash docs/superpowers/parallel/check-ownership.sh
	bin/guard-no-health-data
	npm run contract
	npm run types && git diff --exit-code app/javascript/api/generated
	docker compose exec web bundle exec rubocop
	docker compose exec web bundle exec brakeman -q --no-pager
	docker compose exec web bundle exec bundler-audit check --update
	docker compose exec web bundle exec rails boundaries:check
	$(MAKE) spec
	$(MAKE) contract-coverage
	npm run lint
	npm run typecheck
	npm audit --omit=dev --audit-level=high
	$(MAKE) web-test
	npx playwright test
	python3 -c "import json; json.load(open('spec/real_data/golden.json'))"
	bin/lane list > /dev/null
	npx knip
	bin/ci-parity

# ---- Development shortcuts (ported from appketing) --------------------------------------------------
build: ; docker compose build
restart: ; docker compose restart web
logs: ; docker compose logs -f web
logs-vite: ; docker compose logs -f vite
console: ; docker compose exec web bundle exec rails console
# make bash                          -> interactive shell in the web container
# make bash ARGS='rails db:create'   -> run a one-off command
bash: ; $(if $(ARGS),docker compose exec web bash -c "$(ARGS)",docker compose exec web bash)
migrate: ; docker compose exec web bundle exec rails db:migrate
rollback: ; docker compose exec web bundle exec rails db:rollback
seed: ; docker compose exec web bundle exec rails db:seed
routes: ; docker compose exec web bundle exec rails routes
# make runner ARGS='p Lead.count'
runner: ; docker compose exec web bundle exec rails runner '$(ARGS)'
generate: ; docker compose exec web bundle exec rails generate $(ARGS)
install: ; docker compose exec web bundle install
lint: ; docker compose exec web bundle exec rubocop $(ARGS)
boundaries: ; docker compose exec web bundle exec rails boundaries:check
brakeman: ; docker compose exec web bundle exec brakeman -q --no-pager
bundler-audit: ; docker compose exec web bundle exec bundler-audit check --update
npm-audit: ; npm audit --omit=dev --audit-level=high
knip: ; npx knip $(ARGS)

# ---- Production (Fly.io) --------------------------------------------------------------------------
# Needs `fly` and `jq` on the host. Unlike appketing, Simbe's machine never scales to zero (fly.toml:
# auto_stop_machines = 'off'), so there is no prod-start. Screener answers are health data: never print
# them from a production console.
FLY_APP := simbe

# Expanded only inside a recipe, so no `make` invocation pays for a `fly` call.
FLY_MACHINE = $$(fly machines list --app $(FLY_APP) --json | jq -r '[.[] | select(.config.env.FLY_PROCESS_GROUP == "app")][0].id')

prod-machine-id:
	@echo "$(FLY_MACHINE)"

# Rails console on production.
prod-console:
	@MACHINE=$(FLY_MACHINE); \
	test -n "$$MACHINE" || { echo "No 'app' machine found for $(FLY_APP)" >&2; exit 1; }; \
	fly ssh console --app $(FLY_APP) --machine "$$MACHINE" --pty -C "/rails/bin/rails console"

# Shell on production.
prod-bash:
	@MACHINE=$(FLY_MACHINE); \
	test -n "$$MACHINE" || { echo "No 'app' machine found for $(FLY_APP)" >&2; exit 1; }; \
	fly ssh console --app $(FLY_APP) --machine "$$MACHINE"

prod-logs: ; fly logs --app $(FLY_APP)
