# Handoff: Simbe, an analytics app for surrogacy agencies

## Overview
Simbe shows how an agency's recruiting funnel performs (screener → application → consult → records → accepted). It answers one question: which channels, process steps and people turn leads into qualified surrogates. The exports carry no ad spend, so Simbe shows no spend, cost per lead or ROI.

There are two roles:
- **Owner** (agency owner, e.g. Erin at Harbor Surrogacy). Signs up, creates the agency, loads data, and sees everything: insights, pipeline, coordinator performance, data, Claude/MCP and settings.
- **Coordinator** (e.g. Maya). Sees only their own leads and a daily list of next actions. No settings or other coordinators' numbers.

An AI agent ("Ask Simbe") is available from every screen. It answers questions in plain language, using only the signed-in agency's data.

Every agency's data is fully isolated. Each agency defines "qualified" in its own settings (Harbor: attended a consult; Lakeside: reached records).

## About the design files
The files in `prototype/` are **design references built in HTML**: working prototypes that show the intended look and behavior. They are not production code. Recreate them in the target codebase using its own framework and patterns. If there is no codebase yet, React + TypeScript + Tailwind (or CSS modules) is a good fit, given the backend is TypeScript/Postgres.

- `Simbe App v2.dc.html` is the clickable prototype and the source of truth for the UI. To run it, open it in a browser next to `support.js`. URL parameters jump straight to a state (see "Prototype deep links").
- `Simbe Screens.dc.html` is a board of every screen in browser and phone frames.
- `Simbe Flows.dc.html` maps the six user flows. It loads a stylesheet from the original project, so styling may be missing when it is opened from this folder.
- `screenshots/` holds desktop captures of each screen. For mobile, open the Screens board, or open the prototype in a window under 860px wide.

All numbers in the prototype are fictional or sample data taken from the Harbor export analysis. Coordinator figures are placeholders until the real data is wired in. (The prototype's spend and cost-per-qualified figures were dropped from the build: the exports carry no spend.)

## Fidelity
**High fidelity.** Colors, type, spacing, radii and interactions are final. Recreate them pixel-close.

---

## Design tokens

### Colors
| Token | Hex | Use |
|---|---|---|
| `bg.app` | `#fafaf9` | App background |
| `bg.surface` | `#ffffff` | Cards, sidebar, top bar, panels |
| `bg.subtle` | `#f5f5f4` | Column wells, segmented-control track, progress-bar track, hover rows |
| `border.default` | `#e7e5e4` | All 1px borders |
| `border.subtle` | `#f5f5f4` | Row dividers inside cards |
| `border.strong` | `#d6d3d1` | Hovered cards, dashed dropzones, empty radio |
| `text.primary` | `#1c1917` | Body and headings |
| `text.secondary` | `#57534e` | Card body copy |
| `text.muted` | `#78716c` | Meta, labels, captions |
| `text.faint` | `#a8a29e` | Section headings in nav, placeholders |
| `brand` | `#be3a5f` | Primary buttons, active nav, links, agent |
| `brand.hover` | `#9f2d4e` | Primary hover and pressed |
| `brand.tint` | `#fdf2f5` | Active nav bg, selected chips, outline-button hover |
| `brand.border` | `#f4c6d3` | Outline-brand button border, selected-chip border |
| `success` | `#22a559` | Met / complete segments, best channel |
| `success.text` / `.bg` / `.border` | `#15803d` / `#f0fdf4` / `#bbf7d0` | "Qualified", "Met", "Connected" pills |
| `warning` | `#f59e0b` | Review / in-progress segments |
| `warning.text` / `.bg` / `.border` | `#b45309` / `#fffbeb` / `#fde68a` | "Review", "Process", "Needs support" pills |
| `danger` | `#e5484d` | Red flags, worst channel, "Text back now" dot |
| `danger.text` / `.bg` / `.border` | `#b91c1c` / `#fef2f2` / `#fecaca` | "Not met" pill, lowest rate |
| `violet.text` / `.bg` / `.border` | `#6d28d9` / `#f5f3ff` / `#ddd6fe` | "People" area pill |
| `violet` | `#8b5cf6` | "Rebook consults" dot |
| Channel marks | FB `#1877f2`, IG `#d62976`, Google `#ea4335`, TikTok `#111111`, Referral `#22a559`, Unknown `#a8a29e`, Meta `#0866ff` | Square logo tiles (replace with real brand logos) |

### Typography
- Family: the system UI stack, `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`. Use `ui-monospace` for keys, URLs and MCP tool names.
- Base 14px, with antialiasing on.

| Role | Size / weight |
|---|---|
| Page title | 22px / 650 |
| Card value (KPI) | 26px / 650, letter-spacing −0.02em (24px on detail KPIs) |
| Card title | 15px / 600 |
| Body | 14px / 400–500 |
| Secondary body | 13px / 400, line-height 1.5 |
| Meta / caption | 12px / 400–500, `text.muted` |
| Pill | 11px / 500 |
| Nav section heading | 11px / 600, uppercase, letter-spacing 0.06em, `text.faint` |
| Lead name in panel | 17px / 650 |

### Radius
Pills `999px`, buttons and inputs `8px`, segmented thumb `6px`, small cards and list cards `10px`, cards `12–14px`, modal and login card `16px`, mobile sheet `18px 18px 0 0`, FAB `50%`, avatar `50%`, logo tiles and brand mark `8–10px`.

### Shadows
- Card: `0 1px 2px rgba(0,0,0,.03)`
- Card hover: `0 2px 8px rgba(0,0,0,.06)`
- Segmented thumb: `0 1px 2px rgba(0,0,0,.08)`
- Side panel: `-12px 0 40px rgba(0,0,0,.08)`
- Agent / modal: `0 20px 60px rgba(0,0,0,.15–.18)`
- FAB: `0 8px 24px rgba(190,58,95,.35)`
- Toast: `0 8px 24px rgba(0,0,0,.2)`

### Spacing
4px base. Common values: 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32. Card padding is 16–18px, and gaps between cards are 12–16px.

### Icons
Lucide-style line icons at 1.8 stroke, round caps and joins, 18px in nav, 22px in the mobile tab bar and 14–16px inline. The nav icons are: home, filter (funnel), bar-chart (channels), kanban (pipeline), user-check (coordinators), database (data sources), plug (connect), sliders (settings), check-square (next actions), and sparkle (agent). Use the `lucide-react` equivalents.

---

## App shell

### Desktop (≥ 860px)
- **Sidebar**: 224px wide, white, 1px right border, sticky at full height.
  - **Header** (56px): a 28px brand tile (`brand.tint` bg, "S" in `brand`, weight 800), "Simbe" in 16px/700, and a collapse chevron icon on the right.
  - **Agency switcher**: a 1px-bordered box with 10px radius, a 26px black tile showing the initial, then the name (13/600) and time zone (11, muted), then a chevron.
  - **Nav**: section headings, then items 36px tall with 10px radius and an icon + label + optional count pill.
    - Owner sections: *Insights* (This week, Funnel, Channels), *Operations* (Pipeline, Coordinators), *Agency* (Data sources, Connect Claude, Settings).
    - Coordinator: *Today* (Next actions, My leads).
    - Active item: `brand.tint` bg, `brand` text, weight 600. Hover: `bg.subtle`.
  - **Footer**: the user avatar (30px circle) with name and role. The prototype also has a "view as" Owner/Coordinator toggle here; it's prototype-only, so drop it in production.
- **Top bar**: 56px, white, 1px bottom border, sticky.
  - Centered search button, 360×36, reading "Search candidates…" with a ⌘K hint.
  - Right side: a "Snapshot Oct 1" pill and the user avatar.
- **Main**: max-width 1200px, padding 28px 32px 110px.

### Mobile (< 860px)
- **Top bar**: brand tile plus the current screen name. On the right are the role toggle (prototype only) and the avatar.
- **Main padding**: 18px 14px 110px.
- **Bottom tab bar**: fixed, white, 1px top border, each tab 58px tall with a 22px icon and an 11px label. Active tab is `brand`.
  - Owner tabs: Home, Pipeline, Channels, Ask, More.
  - Coordinator tabs: Next actions, My leads, Ask.
- **More**: opens a bottom sheet (18px top radius, drag handle, rows 48px tall) listing Funnel, Coordinators, Data sources, Connect Claude and Settings over a scrim at `rgba(28,25,23,.3)`.
- **No FAB on mobile.** The agent opens from the Ask tab, full screen.
- **Grids**: the KPI grid drops to 2 columns, and boards become one column with chips to switch columns.

---

## Screens

### 1. Sign in (`01-sign-in.png`)
- Centered white card, max 400px, 32px padding, 16px radius.
- Contents: brand row, "Welcome back" (22/650), "Sign in to your agency workspace", Email and Password inputs (40px tall, 8px radius) with a "Forgot?" link, and a full-width primary "Sign in" button.
- Footer: "New agency? Create an account".

### 2. Sign-up wizard (`02`, `03`)
Adding the agency and loading its data are part of sign-up. The wizard card is max 600px wide.
- **Header strip**: a `bg.app` strip with four steps, each a 22px numbered dot plus a label.
  - Current step: `brand` fill.
  - Completed step: `success` fill with ✓.
  - Upcoming step: white with a border.
- **Body**: 28px 24px padding, title (21/650) plus subtitle.
- **Footer bar**: Back (secondary) and Continue (primary).

The four steps:
1. **Account.** Name, work email, password.
2. **Agency.** Agency name, time-zone chips (Pacific, Mountain, Central, Eastern), and the qualified definition as radio cards: *Submitted an application · Attended a consult (recommended) · Reached medical records · Been accepted*. Selected card: `brand.tint` bg and `brand.border`, with a 5px brand ring on the radio.
3. **Load data.** A dashed dropzone ("Drop your 7 CSV exports") above a list of the seven files, each with a status dot and a Loaded/Waiting pill: leads, stage_history, contact_log, screener_answers (health data, encrypted), web_sessions, appointments, applications. A shield note below says screener answers are encrypted.
4. **Team.** Email input plus an Invite button, and a team list with avatars and role pills (Owner in brand, Invited in amber). The final CTA is "Open my dashboard".

### 3. This week, the owner's home (`04`)
- **Greeting**: "Good morning, Erin" with the subtitle "Week of Oct 12 · 4 things worth your time". A range segmented control (30 days / 90 days / 12 months) sits on the right.
- **KPI row**: 3 equal cards (Leads, Qualified, Qualified rate). Each card has a label, a value with a delta (green when positive, amber when negative, muted for "sample"), a 6px segmented bar, and a note.
- **Two columns** (1.6fr / 1fr; stacked on mobile):
  - **Left: "Recommended actions" well.** A `bg.subtle` well with 14px radius and a count pill, holding 4 action cards. Each card has:
    - an area pill (Process amber, Ads brand, People violet) and an impact line;
    - a title (15/600) and a why line (13, secondary);
    - an outline-brand CTA ("Open funnel", "Open channels", "Open pipeline") and an "Ask why" button with a sparkle icon that opens the agent with a preset question.
  - **Right, top: "Biggest leak" card.** A 92px donut ring reading "27% stall", with a title and one line of copy.
  - **Right, bottom: "Qualified rate by channel" card.** Horizontal bars with an 8px track (best green, worst red, the rest grey), and a "View all channels →" link.

### 4. Funnel (`05`)
- **Header**: title, a "3,530 leads" count pill, and a subtitle explaining the qualified definition.
- **Stage card**: one white card with six rows (Inquiry, Application, Consult booked, Attended consult, Records, Accepted). Each row shows the stage name, a count (16/650), "% of previous", a 10px bar (brand on the qualified stage, green after it, dark grey before it), and a muted exit-reason line.
- **"Where applicants stop in the form" card**: five bars, with the highest one (pregnancy history) in amber.

### 5. Channels (`06`) and channel detail (`07`)
- **Channels table** inside a card:
  - The header row uses `bg.app`, 12px muted text and 10px 16px padding.
  - Columns: Channel (logo tile + name), Leads, Qualified, Rate (inline mini bar + %). The highest rate gets a green pill, the lowest a red pill.
  - Rows are clickable and hover to `bg.app`.
- **Insight cards** below the table: "30% of leads have no source" and "14.9% are out of area".
- **Channel detail**:
  - A "‹ Channels" back link, then a 36px logo with the channel name.
  - A 3-KPI grid (Leads, Qualified, Rate), then a Campaigns table.
  - A brand-tinted note card with an "Ask Simbe" button.

### 6. Pipeline board (`08`) and list view
- **Header**: title plus a count pill. On the right is a toolbar card with a Board/List segmented control and an "All coordinators" dropdown (owner only).
- **Board**: 4 column wells (Action needed, In application, Consult, Qualified). Each well is `bg.subtle` with 14px radius and 10px padding, and has a header with a count pill.
  - **Lead cards**: white, 10px radius, 12px padding.
  - Line 1: name (600), source pill and status pill.
  - Line 2: "29 yrs | CA" with a date on the right.
  - Line 3: a six-segment progress bar, 5px tall with 2px gaps. Segments before the current stage are green. The current segment is amber (action needed), red (closed) or green (on track). Later segments are grey.
- **Mobile board**: a row of column chips with counts that shows one column at a time.
- **List**: a filter input with rows showing name, source pill, status pill, age/state · stage, and coordinator.
- Clicking any card opens the **Lead panel**.

### 7. Lead panel, a slide-over (`09`, `10`)
- **Frame**: a right-side panel, 620px wide on desktop and full screen on mobile. It slides in over 200ms ease-out, from translateX(24px) and opacity 0, over a scrim at `rgba(250,250,249,.6)`.
- **Header**: name (17/650) and the assigned coordinator with a user icon. The subline is "Stage · Status". On the right are "‹ Prev", "Next ›" and "Close ✕" (icons only on mobile).
- **Action row**, right-aligned: "Send text" (outline-brand), "Call", "Mark done" (coordinator only; turns green when done), and an "Actions ▾" menu.
- **Top grid**, three columns on desktop and stacked on mobile:
  - **Contact**: state, email, masked phone, age, and a source/campaign pill, each with an icon.
  - **Screener ring**: an 84px donut built from met / review / red segments, with "%" and "Progress" in the middle. The legend reads *N met · N red flags · N to review · N unanswered*.
  - **Consult**: status text plus a "Book consult" or "View booking" button.
- **Tabs** (segmented, full width): Summary, Screener, Activity, Source.
  - **Summary**: a Process card listing Screener, Application, Consult, Medical records and Accepted. Each has a state icon (green ✓ complete, brand ring ongoing, red stopped, grey ring upcoming) and a status. Below it, a "Simbe summary" card (`bg.app`) has a sparkle icon, a short AI-written paragraph and a "Suggested next step" line.
  - **Screener**: the 10 questions, each with a Met (green), Review (amber), Not met (red) or Unanswered (grey) pill. Below them: "Health answers are visible to the assigned coordinator only."
  - **Activity**: a vertical timeline, newest first. The newest dot is brand, older dots are grey. Each entry has a title, a time on the right and a muted detail line.
  - **Source**: key/value rows for Channel, Campaign, Ad, First visit, Pages viewed and Self-reported.

### 8. Coordinators, owner only (`11`) and coordinator detail
- **Header**: title, an "Owner only" brand pill and the note "Sample figures".
- **Grid of person cards** (auto-fill, min 260px):
  - Top: avatar, name, "N leads · X% of leads", and a status pill (Needs support amber when more than 8 overdue, otherwise On track green).
  - Below: three stats (First reply, Qualified, Overdue).
- **Footnote**: differences can reflect lead mix as well as effort.
- **Detail**: avatar plus name, a 4-KPI grid, and a "Leads needing action" list. Each row opens the lead panel.

### 9. Next actions, the coordinator's home (`16`)
- **Header**: "Next actions" with an open-count pill and "Tuesday Oct 13 · most urgent first". On the right, a "Today's progress" card shows "N / M" and a green progress bar.
- **Board**: 4 queue wells, each with a colored dot, title, count pill and a hint line:
  - Text back now (red): new leads, no message sent yet.
  - Nudge applications (amber): quiet 24h+ mid-application.
  - Rebook consults (violet): no-show with no new booking.
  - Paused, due back (grey): return date has passed.
- **Task cards**: name, an age on the right ("38m", "2d") and a reason. Below them are a Text/Call button (outline-brand) and a Done button. Done makes the card 50% opacity and turns the button green "Undo". Clicking the card body opens the lead panel.

### 10. Data sources (`12`) and upload (`13`)
- **Header**: title plus a primary "Upload new snapshot" button with an upload icon.
- **Connector cards** for Meta and Google, each with a "Synced today" note and a Connected/Connect button.
- **"CRM exports" card**: "Loaded Oct 1, 2026 · 9:14 am", then seven rows, each with a green dot, file name and row count.
- **Upload modal**: centered on desktop at max 480px with 16px radius; a bottom sheet on mobile. It has three states:
  1. A dropzone.
  2. "Validating files" with a pulsing line.
  3. "Review changes", with green-checked rows: Leads 3,530 → 3,611 (+81), Duplicate rows 0, Files matched to Harbor 7 of 7, Screener answers Encrypted. Actions are Cancel and Replace snapshot.
- On confirm, the toast reads "Snapshot replaced · no duplicates counted".

### 11. Connect Claude, MCP (`14`)
- **Left card**: the Server URL (`https://mcp.simbe.app/<agency>`) and an API key (masked, with a Reveal button) in monospace read-only fields. Below them, a dark code block (`#1c1917`, 10px radius) holds the `mcpServers` JSON config.
- **Right card**: "Tools Claude can use". Each tool name is in monospace brand with a description:
  - `get_funnel`
  - `get_channel_performance`
  - `get_dropoff_reasons`
  - `get_next_actions`

### 12. Settings (`15`)
Max 720px, three cards:
- **Definition of qualified**: the same radio cards as sign-up. A change saves immediately and shows the toast "Saved. Every number now uses this definition."
- **Time zone**: chips.
- **Team**: rows with role pills, and an invite input in a `bg.app` footer. Sending shows the toast "Invitation sent".

### 13. Ask Simbe agent (`17`)
- **Entry**: on desktop, a 52px brand FAB (sparkle icon) fixed at bottom-right 24px. It is hidden while the lead panel is open. On mobile the agent opens from the Ask tab.
- **Panel**: 400px wide, up to 640px tall, at bottom-right 24px with 16px radius. Full screen on mobile.
- **Header**: a sparkle tile, "Ask Simbe" and "Harbor Surrogacy data only", plus a close button.
- **Empty state**: "How can I help this week?" with a short line and suggested question chips.
- **Messages**:
  - User bubbles: right-aligned, `bg.subtle`, radius 14/14/4/14.
  - Agent bubbles: left-aligned, white with a border, radius 14/14/14/4.
- **Agent answers can include**:
  - plain text;
  - an inline bar chart in a `bg.app` box;
  - a suggested action button (outline-brand, e.g. "Open channels →") that navigates and closes the agent;
  - "Sources" chips that link to the screen holding the underlying data;
  - follow-up question chips below the thread.
- **While answering**: a pulsing "Reading your data…" line.
- **Composer**: a 38px input with a 38px brand square send button.

---

## Interactions and behavior
- **Navigation**: the sidebar or tab bar switches screens. Opening a screen closes the lead panel and the More sheet.
- **Lead panel**: opens from any lead card or row, from coordinator detail and from next-action cards. Prev/Next cycles through leads. The scrim or Close dismisses it, and Esc should too.
- **Toasts**: dark (`#1c1917`), centered at the bottom (28px from the edge on desktop, 84px on mobile, above the tab bar), with a green check. They auto-dismiss after 2.6s.
- **Done toggles** on next actions update the open count in the header and nav, plus the progress bar.
- **Changing the qualified definition** recomputes every metric with no reload.
- **Upload validation** must check that all seven files are present, the columns match, there are no duplicate natural keys, and the folder matches the agency. A snapshot replaces the agency's data in one transaction.
- **Role gating**: coordinators never see Coordinators, Channels, Data sources, Connect or Settings, and their lead list is filtered to their own leads. Raw screener health answers show only to the assigned coordinator. Owners see verdicts.
- **Breakpoint**: 860px. Below it, use the mobile shell, two-column KPIs, single-column boards with column chips, a full-screen panel and agent, and a bottom-sheet modal.
- **Hover**: cards move to `border.strong` and the hover shadow. Rows and ghost buttons move to `bg.app` or `bg.subtle`. Primary buttons move to `brand.hover`.
- **Focus**: `outline: 2px solid #e6a3b6; outline-offset: 2px`.

## State (frontend)
- `session { user, role: 'owner' | 'coordinator', agencyId }`
- `route` (screen) plus `selectedLeadId`, `leadPanelTab`, `channelId`, `coordinatorId`
- `range` (30d / 90d / 12m), `pipelineView` (board / list), `mobileColumn`, `search`
- `agent { open, messages[], suggestions[], pending }`, where each message can carry `{ text, chart?, action?, sources?[] }`
- `upload { step: 0..3, files[], validation }`
- `toast`
- Server data per agency: KPIs, funnel stages and exit reasons, channels and campaigns, leads (pipeline column, status, stage index), the lead detail (contact, screener verdicts, events, attribution, AI summary), the next-actions queue for a coordinator, coordinator stats, data-source status, team, settings and the MCP key.

## Prototype deep links
Open `prototype/Simbe App v2.dc.html` with these URL parameters:
- `?view=login`
- `?view=signup&step=0..3`
- `?screen=week | funnel | channels | channel&channel=Facebook | leads | coords | coord&coord=Tomas | data | connect | settings`
- `?screen=leads&lead=L-4821&tab=summary | screener | activity | source`
- `?screen=data&upload=1..3`
- `?role=coord` (coordinator home)
- `?open=1` (agent open with a sample answer)
- `?more=1` (mobile More sheet)

## Assets
No raster assets. The icons are Lucide (inline SVG paths in the prototype). The channel and ad-platform tiles are placeholders; replace them with the official Meta, Google and TikTok marks. The brand mark is a placeholder "S" tile.

## Files
- `prototype/Simbe App v2.dc.html`: the full interactive design (template + logic).
- `prototype/Simbe Screens.dc.html`: all screens in desktop browser and mobile phone frames.
- `prototype/Simbe Flows.dc.html`: the six user flows.
- `prototype/support.js`: the runtime needed to open the prototype files locally.
- `screenshots/01–17`: desktop captures of every screen.
