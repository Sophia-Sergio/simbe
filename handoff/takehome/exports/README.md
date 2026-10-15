# Exports

One folder per agency. Each folder has the same seven files. All timestamps are UTC.

| File | One row per | Columns |
|---|---|---|
| `leads.csv` | lead | `lead_id`, `created_at`, name, email, phone, `state`, `source`, `campaign`, `ad`, `coordinator`, `current_stage`, `outcome`, `outcome_reason`, `outcome_updated_at`, `paused_until` |
| `stage_history.csv` | time a lead entered a stage | `lead_id`, `stage`, `entered_at` |
| `contact_log.csv` | text, call or email | `lead_id`, `contacted_at`, `direction` (inbound = from the lead), `channel`, `contacted_by` |
| `screener_answers.csv` | screener question answered | `lead_id`, `submitted_at`, `question`, `answer`, `meets_requirement` (`yes`, `review`, `no`) |
| `web_sessions.csv` | website visit before the lead signed up | `lead_id`, `started_at`, `landing_url`, `pages_viewed` (pipe-separated), `referrer`, `device` |
| `appointments.csv` | consult booking | `lead_id`, `booked_at`, `scheduled_for`, `status` |
| `applications.csv` | application started | `lead_id`, `started_at`, `submitted_at`, `percent_complete`, `last_section_completed` |

Stages, in order: `inquiry`, `pre_screen`, `application`, `consult`, `records`, `accepted`.

Outcomes: `open`, `not_eligible`, `withdrew`, `unresponsive`, `paused`, `accepted`. A paused lead can come back later.

`source`, `campaign` and `ad` come from the tracking tags on the first tagged visit. They're blank when a lead was never tagged.

The agencies' tools are inconsistent, and the exports are what they are.
