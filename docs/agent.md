# The Simbe agent

What "Ask Simbe" and the MCP server can do, what they cannot, and the limits they run under. Plain-language product context is in [`about.md`](./about.md); the rules the code follows are in [`conventions/ai-agent.md`](./conventions/ai-agent.md) and [`conventions/sensitive-data.md`](./conventions/sensitive-data.md); how it is implemented is in [`agent-and-mcp-architecture.md`](./agent-and-mcp-architecture.md); how to connect Claude is in the root [`README.md`](../README.md#connect-claude-and-other-mcp-clients).

## Two doors, one set of tools

| | **Ask Simbe** (in the app) | **MCP server** (Claude and other clients) |
|---|---|---|
| Who uses it | Owners and coordinators, from every screen | The owner who created the key, from any MCP client |
| How it runs | Simbe calls Anthropic's Claude, which calls the tools below | Your own Claude (or another client) calls the tools directly |
| Answers | Written for a non-technical owner, with an inline chart, a suggested action, source chips and follow-up questions | Raw JSON from each tool; the client's model writes the answer |
| Who pays for the model | The app's Anthropic account (every call is recorded in a spend ledger) | You, in your own client |

Both go through the **same tool registry** (`Agent::Tools`), so they always agree on the numbers and the privacy rules.

## What it can answer

Every tool is read-only and works on the signed-in agency's data only. None of them takes an agency id, so there is no way to ask about another agency.

| Tool | Ask things like | Inputs |
|---|---|---|
| `get_funnel` | "How many leads reached each stage this quarter?" "What is our qualified rate?" | `range`: `30d` (default), `90d`, `12m` |
| `get_channel_performance` | "Which channel is cheapest per qualified surrogate?" "How is Facebook doing, by campaign?" | `range`; optional `channel` for its campaign breakdown |
| `get_dropoff_reasons` | "Where do applicants stop in the form?" "Why do people leave after the consult?" | `range` |
| `get_next_actions` | "Who is waiting longest for a reply?" "How many consults need rebooking?" | optional `coordinator` (owner only) |
| `forecast_spend` | "If I spend $5,000 a month, how many qualified leads should I expect?" | `monthly_budget_cents` (required), optional `channel`, `months` (1-12, default 3) |

Notes on the answers:

- **"Qualified" follows the agency's own definition** (Settings), so every number matches the app.
- **Ranges** are measured back from the latest data in the agency's snapshot, not from today.
- **Spend is sample data in this version** (see [`about.md`](./about.md#how-data-gets-in)). The agent is told to say so, and to flag small samples (`low_sample`) instead of over-claiming.
- **`forecast_spend` is an estimate**: expected qualified leads = budget divided by the trailing 90-day cost per qualified lead. It refuses, with an explanation, when there is no spend or no qualified lead to base it on, and always labels the result an estimate.
- **`get_next_actions`** returns the four queue counts and the five oldest items per queue, with **first names only**.

## What each role gets

| Role | Ask Simbe | MCP |
|---|---|---|
| **Owner** | All five tools | All five tools |
| **Coordinator** | Only `get_next_actions`, scoped to their own leads; links only to `/`, `/next-actions` and `/pipeline` | Not available: MCP keys are created by, and act as, an owner |

An MCP key acts as the owner who created it, and only while that person is still an owner of the agency. Removing or demoting them disables the key.

## What it cannot do

- **It cannot change anything.** No tool writes data: it cannot move a lead, send a text, or edit settings.
- **It cannot see or reveal raw screener answers, emails or phone numbers.** Lead-level output is first name, state, stage and verdicts (`met` / `review` / `not_met` / `unanswered`). Asked for contact details or answers it says "I can only see summaries."
- **It cannot answer from outside the data.** The rule is "only use tool results; if the data does not contain the answer, say so." It must not invent leads, people, channels or numbers.
- **It cannot see other agencies**, or any agency but the signed-in one.
- **It does not remember across conversations** beyond the stored thread (the last 10 messages are sent to the model).
- **No streaming, voice or file uploads.**

## How a question is answered (Ask Simbe)

1. The owner or coordinator types a question (500 characters at most).
2. The model may call tools, up to 6 rounds, always with the signed-in user's role and agency.
3. It finishes by calling a `respond` tool: text (1,200 characters at most), an optional chart (up to 8 bars), an optional action button and source chips, and follow-up suggestions.
4. Action buttons and sources may only point at known in-app routes (`/`, `/funnel`, `/channels`, `/channels/<channel>`, `/pipeline`, `/coordinators`, `/data`, `/settings`, `/next-actions`). Anything else is dropped on the server.

## Limits and safety

| Limit | Value |
|---|---|
| Model rounds per question | 6, then a safe fallback message |
| Messages per user | 20 per minute |
| In-flight questions per user | 1 (a second returns `409 already_in_progress`) |
| Time per answer | 40 seconds in total across all rounds, then an error (no half answers) |
| MCP requests per key | 60 per minute (and 300 per minute per IP) |
| MCP request body | 1 MB, a single JSON object (no batches) |

- **Spend is recorded.** Every model call writes a row in `ai_usage_events` (agency, user, model, tokens, cost) before the response is parsed. Owners can read the month's total at `GET /api/v1/agent/usage`.
- **Privacy is tested.** A privacy spec fails if any email, phone or screener answer from the sample data appears in a request sent to Anthropic.
- **Models** are set in `config/ai_models.yml` (`agent`, `summary`) and can be overridden per task with `AI_MODEL_<TASK>`.

## MCP protocol details

For people building a client or debugging a connection.

- **Endpoint:** `POST <MCP_PUBLIC_URL>/<agency-slug>`, JSON-RPC 2.0 over Streamable HTTP without SSE. In production `MCP_PUBLIC_URL` is `https://simbe.fly.dev/mcp`; locally it defaults to `http://localhost:3000/mcp`.
- **Auth:** `Authorization: Bearer <key>` and `Content-Type: application/json`. There are no cookies and no OAuth.
- **Methods:** `initialize`, `ping`, `tools/list`, `tools/call`. A request without an `id` is a notification and gets `202`. `GET` is `405`.
- **Errors:** an unknown, revoked or unusable key is `401`; a valid key used against another agency's slug is `404`. A tool failure (unknown tool, bad input) is a normal result with `isError: true`, not a protocol error. Malformed JSON is `-32700`, a bad envelope `-32600`, bad params `-32602`, an unknown method `-32601`.
- **Keys:** stored only as SHA-256 digests, prefix shown in the app (`simbe_live_ab12…`), shown in full once when created or rotated. Rotating revokes the previous key at once.
