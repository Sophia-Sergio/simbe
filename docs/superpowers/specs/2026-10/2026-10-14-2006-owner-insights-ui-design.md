# Owner insights UI: This week, Funnel, Channels — Design

**Status:** Approved for planning · **Depends on:** foundation, metrics · **Plan:** `plans/2026-10/2026-10-14-2007-owner-insights-ui.md`

## Goal
The owner's three insight screens (This week, Funnel, Channels + channel detail) rendered from the metrics API, responsive, in the Simbe brand.

## Findings
- Layout, copy and behavior: `handoff/design/README.md` §3–5 and screenshots `04`–`07`. Visual language (colors, type, radii, logo): `docs/design/brand.md` (simbefamily.com) **overrides** the handoff's brand tokens.
- The screenshots show KPI bars as short segmented bars (green fill on a grey track), a donut "Biggest leak" ring (green with an amber arc), horizontal bars with best=green / worst=red / others grey, and funnel rows whose bar is dark grey before the qualified row, brand on the qualified row and green after it.
- API shape is fixed by the metrics spec (`/metrics/summary|funnel|channels|channels/:channel`, `/recommendations`).

## Decisions
1. **Routes** (owner only; coordinators redirected to `/next-actions`): `/` This week, `/funnel`, `/channels`, `/channels/:channel`.
2. **Data layer**: `app/javascript/api/metrics.ts` typed fetchers + TanStack Query hooks `useSummary(range)`, `useFunnel(range)`, `useChannels(range)`, `useChannel(channel, range)`, `useRecommendations(range)`; `range` lives in the URL (`?range=30d|90d|12m`, default `30d`) so links and the agent can share it. Money is cents → formatted `$1,234` (no decimals ≥ $100, 2 decimals below).
3. **This week**: greeting `Good morning|afternoon|evening, <first name>` by the agency's local time; subtitle `Week of <as_of Monday> · N things worth your time` (N = recommendation count); range segmented control; 3 KPI cards (Leads, Qualified, Qualified rate: value + delta colored green/amber, note line); two-column body (`1.6fr / 1fr`, stacked <860px): Recommended actions well (area pill: Process amber / Ads brand / People violet; impact line; title; why; outline-brand CTA navigating to `cta.route?range=`; "Ask why" opening the agent with `ask.question` — wired to a no-op `openAgent(question)` context until the agent plan lands) and right column with the Biggest-leak donut (SVG ring, label `<pct>% stall`) + Qualified-rate-by-channel bars (best green, worst red) and "View all channels →".
4. **Funnel**: header with `N leads` pill and subtitle `Qualified = <definition label>.`; six-row card (name, count 16/650, `% of previous`, 10px full-radius bar of `count/total`, exit line `X% leave here · reason, reason` built from the next row's drop); qualified row in `brand` with brand-colored name; rows after it success-green; before it dark plum-grey. "Where applicants stop in the form" card with five bars (highest in warning).
5. **Channels**: table card (Channel logo tile + name, Leads, Qualified, Rate with mini bar and green pill = best / red pill = worst), rows clickable → `/channels/:channel`; two insight cards (`unattributed`, `out_of_area`) beneath; mobile: table becomes stacked rows (name, leads, rate).
6. **Channel detail**: back link, 36px channel tile, 3 KPIs (Leads, Qualified, Rate), campaigns table, brand-tinted note card with "Ask Simbe" (same `openAgent`).
7. **States**: skeletons (neutral blocks, no spinners), empty state when `snapshot` is null ("Load your data to see insights" → `/data`), error state with retry; low-sample rates show a muted `n=<leads>` chip.
8. **Channel logo tiles**: square 28/36px tiles with channel letter/initial and the handoff's channel colors (FB `#1877f2`, IG `#d62976`, Google `#ea4335`, TikTok `#111111`, Referral `#22a559`, Unknown `#a8a29e`) — marked as placeholders for real marks.
9. **Accessibility**: charts have `role="img"` + text alternative; ring and bars never rely on color alone (values always printed).

## Non-goals
Charts beyond those in the design, CSV export, saved views, comparison to arbitrary dates, dark mode.

## Acceptance criteria
1. `make web-test ARGS=app/javascript/features/insights` passes (KPI formatting, range switching updates the URL and refetches, funnel bar coloring by qualified row, channel flags, empty/error states).
2. `make e2e ARGS=insights` passes against seeded Alpha-like data and writes `e2e/screenshots/{week,funnel,channels,channel}-{desktop,mobile}.png`.
3. `grep -rniE '#be3a5f|#fdf2f5|#1c1917' app/javascript` prints nothing (brand override honored).
4. `docker compose exec web npm run typecheck && docker compose exec web npm run lint` exit 0.
5. At 1280px and 390px widths, screenshots visibly match `handoff/design/screenshots/04–07` in layout (reviewer checks side by side; colors/shapes/logo follow `docs/design/brand.md`).
