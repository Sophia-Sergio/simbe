# Linked inquiries: treating repeat inquiries as one person

**Status:** Approved 2026-10-19; amended the same day by the owner: a real `people` table instead of a derived key, and the naming and interface changes (decisions 2 and 11). The amendments are marked **(amended)**.
**Depends on:** snapshot ingest (2002), metrics (2004), leads workflow (2008), agent and MCP (2013).
**Plan:** `docs/superpowers/plans/2026-10/2026-10-19-0150-linked-inquiries.md`

## Goal

The Harbor export has 79 leads that share an email with another lead, and the import review says "(kept separate)". They are very likely the same person inquiring again. Keep every inquiry as its own lead, because each has its own ad, coordinator, stages, contact log and outcome, but **link the inquiries of one person** so that:

1. a coordinator or owner opening a lead sees the person's other inquiries and what happened to each;
2. the import review tells the owner these are returning people, and flags the few that look like true duplicates (two inquiries open at once);
3. the numbers can say how many *distinct people* inquired, next to the number of inquiries;
4. the interface says plainly that a lead is one inquiry and belongs to a person.

Nothing is merged, deleted or rewritten. Every existing number (leads, qualified, rates, cost, golden numbers) stays exactly as it is.

## Findings

Facts from the Harbor export (`handoff/takehome/exports/harbor/leads.csv`, 3,530 leads), the golden file and the code, checked on 2026-10-19:

1. **79 emails are shared; every one is shared by exactly 2 leads** (158 leads in groups). In all 79 pairs the name, phone and state on the lead row are identical.
2. The two leads are far apart in time: 11 to 342 days (median 97). In **73 of 79** the earlier lead was already closed (not eligible, withdrew, unresponsive or accepted) before the later one was created. In **6** it was not: the earlier lead was still open or paused.
3. The two leads usually differ in source (only 20 of 79 share one) and coordinator (40 of 79 share one). Their screener answers often contradict each other (for example age 43 and 25, or states MN and CO), so answers must never be combined across inquiries.
4. In one sampled pair the accepted lead came from the `come-back-retarget` campaign and the earlier rejected one from another ad. Merging would lose which ad converted her.
5. **Lakeside has 702 extra rows across 1,395 leads** (`spec/real_data/golden.json`: `duplicate_email_extra_rows`, `leads_in_duplicate_email_groups`). 1,395 - 702 = 693 emails for 1,395 leads, so some email groups have 3 or more leads. The design must handle groups of any size.
6. Today the importer only counts them: `Snapshot::Validator.duplicate_email_extra_rows` and the warning `duplicate_email` ("N extra leads share an email with another lead (kept separate)"). Nothing links the leads. `bin/golden-numbers` computes the same count independently.
7. `leads.email` is a plain string, not unique and not indexed. The unique keys are `(agency_id, external_id)` and `(agency_id, id)`.
8. Lead detail (`Leads::Detail`, `LeadDetailSerializer`, contract schema `LeadDetail`) is addressed by `external_id`, scoped by `Leads::Access.relation(user)`: an owner sees the agency, a coordinator only leads whose `coordinator_name` is theirs.
9. The headline KPIs count leads created in the window and leads that reached the qualified milestone (`Metrics::Summary`: `count(*)` over `leads`). `get_funnel` returns those KPIs to the agent and to MCP clients as they are.
10. The same export may be uploaded by several agencies (`docs/conventions/real-data.md`, rule 1), so identical emails across agencies are expected and must never link across them.
11. **(amended)** The takehome docs already name the concepts. `handoff/takehome/docs/tables-summary.md`: "A lead is one *inquiry*, not one person. The same woman can inquire twice and appear as two leads"; the `leads` table is "lead (person × inquiry)"; "79 people account for 158 Harbor leads, and 693 people account for 1,395 Lakeside leads"; and "Decide how to count repeat inquiries" is listed as an open build question (counting leads instead of people adds about 2.2% to Harbor and 2.4% to Lakeside). The proper terms are therefore **person** and **inquiry** (not "candidate").
12. The data is fictional but health-like. The importer, logs and AI prompts must not receive screener answers, emails or phones beyond what is already allowed (`docs/conventions/sensitive-data.md`).

## Decisions

Calls marked **(my call)** are mine, for you to confirm or change.

1. **A person is identified by the lead's email, lower-cased and trimmed.** A lead with a blank email is its own person. **(my call)** Phone and name do not link leads: matching on them risks joining different people, and in this data they add nothing the email does not already give.
2. **(amended) People are a table.** Add `people` (`id` uuid, `agency_id`, `email_key` nullable string = the normalised email or null for a blank email, timestamps) and `leads.person_id` (uuid, NOT NULL). `people` follows the tenant rules: `agency_id NOT NULL`, a unique `(agency_id, id)` for the composite foreign key, a partial unique index on `(agency_id, email_key)` where `email_key IS NOT NULL`, and an `AgencyScoped` model `Person` in the `leads` pack. `leads` references it with a composite foreign key `(agency_id, person_id)`, **deferrable initially deferred**, plus an index on `(agency_id, person_id)`. No stored per-person attributes in this work: the table holds identity only.
   - **Import.** The importer assigns `person_id` while streaming `leads.csv` (one new uuid per distinct email key, one per blank-email lead), writes those leads, then writes the `people` rows with `COPY` in the same transaction; the deferred foreign key is checked at commit. Replacing a snapshot deletes the agency's leads first and then its people, so a reload never leaves orphans or double counts.
   - **Existing data.** A separate data migration backfills `people` and `leads.person_id` for agencies that already have leads, then a final migration makes the column NOT NULL and adds the foreign key. (The convention forbids data work inside a schema migration.)
   - **Loaders.** `Snapshot::RowsLoader` (used by specs and `RealData.load!`) assigns people the same way, through one shared helper `Snapshot::People`, so every path normalises emails identically.
3. **Every query that groups or joins on `person_id` also filters by `agency_id`** (the `Lead` and `Person` default scopes do this; raw SQL binds `agency_id`). The composite foreign key makes a lead pointing at another agency's person impossible at the database level.
4. **Lead detail gets `other_inquiries`**: the person's other leads in the viewer's scope, oldest first, excluding the lead itself. Each item has only `id` (the lead's `external_id`), `created_at`, `stage`, `status` (the existing status value), `outcome_reason`, `channel`, `campaign` and `coordinator`. No contact details, no screener data, no activity.
   - **An owner sees all of the person's inquiries. A coordinator sees only those assigned to them** (same `Leads::Access.relation` rule). The coordinator view never reveals that other inquiries, or how many, exist.
   - The field is always present, an empty array when there are none.
5. **Lead detail gets `open_overlap`**, a boolean: true when the lead is in an overlapping pair with another inquiry of the same person. For two inquiries ordered by `(created_at, external_id)`, the earlier one is **closed** when its outcome is `not_eligible`, `withdrew`, `unresponsive` or `accepted` and its `outcome_updated_at` is strictly earlier than the later inquiry's `created_at`; otherwise the pair overlaps. Computed over all of the person's leads, but exposed only as the boolean so a coordinator learns nothing else. **(my call)**
6. **The lead panel shows the links.** On the Summary tab, a "This person's other inquiries" card lists `other_inquiries` (date, outcome or stage, channel, coordinator) and each row opens that lead in the panel. When `open_overlap` is true, a one-line notice says another inquiry from this person was still open. The card is absent when there is nothing to show. It follows the brand tokens and works at desktop (1280px) and mobile (390px). The pipeline cards are not changed in this work.
7. **The import review changes its wording, not its count.** The warning code `duplicate_email` and its count (extra rows) stay, so the contract and golden numbers do not move; the message becomes "N extra leads share an email with another lead; they are linked as one person and kept as separate inquiries". A new warning `open_duplicate_inquiry` counts the overlapping pairs from decision 5, with a message such as "N pairs of inquiries from the same person were open at the same time". It is a warning, never an error. **(my call)** on the wording.
8. **(amended) Distinct people are counted next to inquiries.** The metrics summary adds `kpis.unique_people`: the number of distinct `person_id` values among the cohort's leads. The headline numbers (`leads`, `qualified`, `qualified_rate`, `cost_per_qualified`) are unchanged, and so is every golden number. The Leads tile on This week shows a small secondary line "N people" only when N is lower than the lead count. `get_funnel` returns it to Ask Simbe and MCP clients with no further change. **(my call)** that the headline stays on inquiries; switching it to people is a separate decision.
9. **Attribution does not change.** A qualified lead is already credited to the channel and campaign of the inquiry that reached the milestone, which is the behavior wanted here. No per-person cost per qualified in this work.
10. **Contracts and mocks move with the code.** `contracts/openapi` gains the new fields and warning code with examples; generated API types are regenerated; the MSW mocks and the Alpha-derived examples return them, with a repeat-inquiry case.
11. **(amended) Naming and interface: a lead is an inquiry, and it belongs to a person.** The word "Leads" stays in navigation and on the KPI tile (the design handoff is final and renaming it everywhere would touch every screen), but the interface now says what it means:
    - the lead panel header shows, under the name, "Inquiry from <date>" and, when `other_inquiries` is not empty, "N other inquiries from this person" (the count the viewer is allowed to see);
    - the Leads KPI tile's secondary line reads "N people" (decision 8), with a tooltip "A lead is one inquiry. The same person can inquire more than once.";
    - the import review wording (decision 7);
    - `docs/about.md` defines **Lead** as "one inquiry; the same person who inquires again is a new lead, linked to her earlier ones" and adds **Person**; `docs/agent.md` says the same.
    Not changed: pipeline cards, board columns, Next actions, the Channels table. **(my call)**
12. **(amended) Agent and MCP: additive only.** No tool takes or returns a person, an email or a lead id, so privacy and isolation are unchanged. `get_funnel` returns `kpis.unique_people` automatically (it passes `summary[:kpis]` through), which is an added field, not a changed one. Two wording changes stop the model from reading "leads" as "people": the `get_funnel` description says `kpis.leads` counts inquiries and `kpis.unique_people` counts distinct people, and the system prompt gains one rule saying a lead is one inquiry, that the same person can inquire more than once, and to use `unique_people` when asked about people. **(my call)**

## Non-goals

- Merging, hiding or deleting any lead; any change to what the existing numbers mean.
- Matching on phone, name or fuzzy email; manual link and unlink by the owner.
- Linking across agencies; storing per-person attributes (name, notes) on `people`.
- A repeat-inquiry badge on pipeline cards, board columns or Next actions; renaming "Leads" in navigation.
- Cost per qualified or qualified rate per person; changing the four headline KPIs.
- Combining or comparing screener answers across inquiries.
- Collapsing repeat inquiries in Next actions or in `get_next_actions` (the 6 overlapping Harbor pairs can show up twice, and the import warning is how they are surfaced); a person tool for the agent.
- Auto-closing or reassigning the overlapping duplicates.

## Anti-goals (what would make this a failure even if it works)

- A coordinator learns about a lead that is not theirs.
- Any existing number or golden value changes.
- Two agencies see each other's leads because they uploaded the same file.
- A person's inquiries get merged into one record and the converting ad is lost.

## Acceptance criteria

Every line is a command with a yes/no result. Real-data lines need the local exports (skipped automatically in CI).

1. `make spec ARGS=spec/requests/leads_spec.rb` passes, including new examples: an owner sees the person's other inquiries oldest first; a coordinator sees only their own related leads and gets an empty array otherwise; a lead with a blank email has none and is its own person; two agencies with the same email never see each other's leads; `open_overlap` is true only for the overlapping pair.
2. `make spec ARGS=spec/requests/snapshot_uploads_spec.rb` passes with the new `duplicate_email` message and the `open_duplicate_inquiry` warning on a fixture with one overlapping pair and one non-overlapping pair.
3. `make spec ARGS=spec/requests/metrics_spec.rb` passes with `unique_people` computed by hand on a fixture with a repeat inquiry, and with the four headline KPIs equal to their previous values.
4. `make spec ARGS=spec/isolation` passes.
5. `make spec ARGS=spec/real_data` reports, for Harbor, `duplicate_email_extra_rows` 79, 158 leads in groups, 6 overlapping pairs and 3,451 people (3,530 leads minus 79); for Lakeside, the same four values equal to `bin/golden-numbers`' own output (29,038 people); loading the same export twice leaves the same number of `people` rows; and every existing golden value unchanged.
6. `bin/golden-numbers --check` passes (the oracle gains the overlap count, the people count and `unique_people`, computed without the app's code).
7. `make contract` and `npm run types && git diff --exit-code app/javascript/api/generated` pass.
8. `npx vitest run app/javascript/features/lead-panel app/javascript/features/week app/javascript/components/shared/ReviewReport.test.tsx` passes.
9. `make spec ARGS="spec/services/agent spec/requests/mcp_spec.rb spec/privacy"` passes, with new examples that `get_funnel` returns `unique_people` over MCP and in the tool result, that its description and the system prompt carry the wording from decision 12, and that no outbound request contains an email.
10. `make spec ARGS="spec/models spec/services/snapshot spec/real_data/schema_golden_spec.rb"` passes, including the `Person` model, the backfill, the tenant foreign key (a lead cannot point at another agency's person) and agency deletion.
11. `make verify` passes.
12. Seen, not just tested: screenshots of the lead panel (header line and "This person's other inquiries" card) at 1280px and 390px, and of the Leads tile with the "N people" line, attached to the PR.
