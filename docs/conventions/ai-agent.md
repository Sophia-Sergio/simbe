# AI agent ("Ask Simbe")

- Provider: Anthropic via the `anthropic` gem, wrapped by `Ai::Client` (the only place `Anthropic::Client` is referenced; boundary check). Key: `ENV["ANTHROPIC_API_KEY"]` (reused from appketing). Models come from `config/ai_models.yml` (`agent`, `summary`), overridable by `AI_MODEL_<TASK>`.
- **Every call is recorded** in `ai_usage_events` (agency, user, task, model, input/output tokens, cost cents) through a required `ledger:` keyword. No path skips recording.
- The agent is a tool-calling loop (max 6 rounds). Tools are read-only functions over the signed-in agency's data; none accept an agency id. Tool results are aggregates/verdicts only (see sensitive-data.md).
- System prompt rules: answer only from tool results; say "I don't have that in your data" otherwise; plain language for a non-technical owner; offer a follow-up and a navigation action when useful.
- Tests stub Anthropic with WebMock; a recorded-fixture tool-loop spec asserts tool dispatch and ledger rows.
