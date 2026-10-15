# Real data, golden numbers and synthetic fixtures

The **only real data we have** is `handoff/takehome/exports/{harbor,lakeside}/` (fictional but health-like; 8 MB and 69 MB). It is git-ignored and **never committed** (`bin/guard-no-health-data` enforces it in CI). Everything below follows from that.

## Three kinds of data, three jobs

| Data | Where | Used for |
|---|---|---|
| **Alpha** (10/12 hand-built leads) | `spec/support/alpha_scenario.rb` | Exact, hand-computable unit/request specs; contract examples; mocks |
| **Golden numbers** | `spec/real_data/golden.json` (committed, aggregates only) + `bin/golden-numbers` | Independent oracle for the real exports: row counts, as_of, qualified per milestone, funnel, channels, insights, queues, board columns, coordinator stats. Computed by a stdlib Python script that shares **no code** with the app |
| **Real exports** | `handoff/takehome/exports/` (local only) | `:real_data` specs and the real-data e2e journeys; skipped automatically when the files are absent (always the case in CI) |

## Rules

1. **Owners load data by uploading the seven CSVs during sign-up (wizard step 4) or later in Data sources.** The same files may be uploaded by *any number of agencies* (a second agency can sign up and upload Harbor's export): rows are tagged with the agency and unique per `(agency_id, external_id)`. The app never looks across agencies, so it never rejects or flags a file because another agency has the same ids (that would also leak other tenants' data).
2. Each agency picks its own definition of "qualified" and time zone at sign-up; the same CSVs therefore produce different numbers for different agencies. Golden numbers are for the **documented agency configs**: Harbor = *attended a consult* + Pacific, Lakeside = *reached records* + Central.
3. `as_of` = the latest **event** timestamp in the files (created, stage entered, contacted, submitted, started, booked, outcome updated) — never `scheduled_for` or `paused_until`, which are future-dated by nature. Harbor `2026-10-01T05:26:42Z` (local date Sep 30), Lakeside `2026-10-01T06:52:27Z`.
4. Ranges are cohort windows from `as_of` (`30d`, `90d`, `12m`); the exports span ~2 years for Lakeside (12m = 14,860 of 29,740 leads) and ~1 year for Harbor (12m = all 3,530 leads).
5. Uploading is **asynchronous** (Lakeside is 69 MB / ~625k rows): the API stores the files and returns immediately; validation and the replace-in-one-transaction import run as background jobs, with progress polled by the UI. A load for an agency never blocks other agencies.
6. `:real_data` specs load the exports with `RealData.load!(agency, "harbor")` (a direct, fast loader shared with the Alpha loader) and compare service/API output with `golden.json`. The **importer** and the UI upload path are verified separately against the same golden file (row counts, warnings, as_of) and by the real-data e2e journey.
7. Regenerating the oracle: `bin/golden-numbers` (writes `golden.json`); `bin/golden-numbers --check` fails when the file is stale. Changing a definition in a spec means changing `bin/golden-numbers` in the same PR, and explaining why.
8. For volume/perf tests where the real files are unavailable (CI), use the synthetic generator `bin/generate-sample-export` (Harbor-shaped, seeded, with the same quirks: messy `source` spellings, duplicate emails, blank campaigns); never use it for correctness numbers.
9. Never paste real rows into issues, PRs, logs or AI prompts; golden numbers and screenshots of aggregate screens are fine.
