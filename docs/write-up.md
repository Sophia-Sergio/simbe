# Harbor lead insights: write-up

> **Fill in before submitting:** the two `[ ]` items below (what Erin said, hours spent). Everything else comes from the repo and the golden numbers in `spec/real_data/golden.json` (aggregates only, no personal data).

## What I heard and what I built

**What I heard from Erin:** `[ what she said on the call: the decision she wants to make, how often she looks, who else uses it ]`

**What I decided to build** (the call prep is in `handoff/takehome/docs/discovery-call-prep.md`): one question, *which channels, process steps and people turn leads into qualified surrogates?* An owner opens **This week** (leads, qualified, qualified rate, recommended actions), then **Funnel**, **Channels** and **Coordinators**; coordinators get only a daily next-actions list and their own leads. Both agencies work from the same app: Harbor's "qualified" is *attended a consult*, Lakeside's is *reached records*, set per agency in Settings.

## Data model, and why

- **Postgres, one app, shared tables.** Every tenant row has `agency_id` and every query goes through the signed-in agency, so Harbor and Lakeside never see each other's data (isolation specs cover it).
- **`leads` is the hub**, as in the exports; stage history, contacts, screener answers, web sessions, appointments and applications hang off `lead_id`.
- **A lead is one inquiry; a `person` links repeat inquiries** (same email). Harbor has 3,530 leads but 3,451 people, so counts say "inquiries" and "unique people" separately.
- **"Qualified" is config, not a column:** `agencies.qualified_milestone` picks which per-lead milestone date counts, so changing the definition updates every number at once.
- **Reloads replace, never add:** each upload is a full snapshot, validated first, then swapped in one transaction. Loading the same or a newer export cannot double count.
- **Screener answers are health data:** encrypted at rest, never logged, never sent to the AI verbatim, visible only to the assigned coordinator. Exports are git-ignored.
- **Times** are stored in UTC and shown in each agency's own zone (Pacific, Central).

## What I'd tell Erin today (Harbor, 12 months to Oct 1, 2026; Lakeside loads the same way with its own definition)

- **3,530 leads, 496 qualified (14.1%)** under her definition.
- **Google is the best channel and Facebook the weakest:** Google turns 23.2% of its leads into qualified surrogates, Referral 20.9%; Facebook, her biggest source (1,448 leads), only 8.1%. I can't say what each costs: the exports have no ad spend.
- **Most leads are lost at the first step.** Only 26% of inquiries start an application. The top recorded reasons are eligibility (BMI, 739) and no response (467). Inside the form, 43% of the people who quit stop at the pregnancy-history section.
- **30% of leads (1,045) have no source**, so almost a third of her marketing can't be judged. Tagging ads fixes that.
- **Dana handles 64% of all leads** and replies slower than the others (median 3.5 hours, vs 2 to 2.5). Her qualified rate is lower (12% vs 16 to 19%), but her lead mix may differ, so treat it as a question, not a verdict.
- **Last 30 days look worse** (10 qualified vs 27 the month before). Recent leads have had less time to reach a consult, so don't read it as a drop yet.
- **Data quality:** 79 extra leads share an email with another lead (6 pairs were open at once), and 611 leads spell their source differently ("fb", "Facebook"). Lakeside has the same issues at a larger scale (702 extra emails, 47 open pairs, 2,252 spellings, out of 14,860 leads). Both are handled and flagged at upload for each agency.

## What I chose not to build

- **Cost per lead or ROI by channel:** there is no spend in the exports, and I removed placeholder spend I had first added, so nothing shown is invented.
- **Cross-agency benchmarking:** against the isolation rule.
- **Ad-platform connectors, OAuth for the Claude/MCP link (it uses a bearer key), and writing back to the CRM:** out of scope for a few hours; the app reads exports only.

## What would change for 50 agencies

- **Tenancy:** enforce isolation in the database too (Postgres row-level security, not only app scoping).
- **Loads:** each load replaces the agency's whole snapshot, which suits one agency at a time at this size (Lakeside has about 15k leads); 50 agencies need per-agency job queues and limits, and a way to detect a stale or failed load.
- **Onboarding and config:** self-serve sign-up exists; add a platform admin, per-agency milestones and time zones reviewed at setup, and key rotation and audit logs.
- **Data and ops:** partition or index by `agency_id`, cache per agency, monitor per-tenant load, and a retention policy for health data.

## Hours

Around 8 hours
