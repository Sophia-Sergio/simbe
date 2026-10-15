# Testing

- Backend: **RSpec** + FactoryBot. No `type: :controller` specs; HTTP coverage is a request spec. Anthropic calls are stubbed (WebMock) — specs never hit the network.
- **One owner spec per HTTP path.** No service spec for a happy path a request spec already covers; a service spec is for branches HTTP cannot reach (locks, parsing, nil actor).
- Never query by position (`.first`/`.last`) — keys are UUIDs; scope to the record you made.
- `build`/`build_stubbed` when the example never reads the DB; `create` only when it reads back or goes through HTTP. No `let!` unless every example uses it.
- Frontend: Vitest + Testing Library for components/hooks; Playwright for flows and screenshots. Components are tested through the DOM, not implementation details.
- **Fixtures for data**: `spec/fixtures/exports/{alpha,beta}/` are tiny (≈20 leads) synthetic CSVs committed to the repo. The real exports are never committed.
- Every metric has a spec with hand-computed expected numbers on the tiny fixtures.
- Run only failures: `make spec ARGS=--only-failures`.
