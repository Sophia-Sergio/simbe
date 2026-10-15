# Sensitive data (screener health answers)

Treat as real patient data.

- `screener_answers.answer` is encrypted with Active Record Encryption (`encrypts :answer`). `question` and `meets_requirement` are plain (needed for aggregates).
- The API returns raw answers **only** to the coordinator assigned to the lead. Owners get the verdict (`met` / `review` / `not_met` / `unanswered`) only.
- Never put raw answers, names, emails or phones in logs (`config.filter_parameters` + `lograge`), error reports, or AI prompts. Phones are masked in API output (`•••-••••-1768`) for everyone except the assigned coordinator.
- The AI agent works from aggregates and verdicts. Lead-level tools return first name + state + stage + verdicts, never raw answers or contact details.
- Exports and `.env` files are never committed; fixtures are synthetic.
