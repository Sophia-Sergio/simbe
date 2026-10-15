# Lane F-CHANNELS — Channels table and channel detail

> **For Cursor / OpenCode:** Work only inside this lane's `Owns` list and follow the **frontend lane rules** in `docs/superpowers/parallel/README.md#frontend-lane-rules` (binding). Follow `docs/conventions/` and **`docs/design/brand.md`**. **Commit after every task** (`feat(f-channels): task N – <title>`).

**Lane:** F-CHANNELS · **Wave:** 1 (frontend, mock API)
**Owns:** `app/javascript/features/channels/**`, `e2e/channels.spec.ts`
**Depends on (merged):** Wave 0
**Hooks consumed:** `useChannels(range)`, `useChannel(channel, range)` (`@/api/hooks/metrics`), `useAgent()`, `useRange()`
**Kit consumed:** `Table` (responsive), `ChannelTile`, `KpiCard`, `SegmentBar`, `BarRow`, `Pill`, `RangeControl`, `Button`, `Skeleton`, `ErrorState`, `EmptyState`, `formatMoney/Int/Pct`
**Contract operations:** `getMetricsChannels`, `getMetricsChannel`
**Spec:** `docs/superpowers/specs/2026-10/2026-10-14-2006-owner-insights-ui-design.md` (decisions 5, 6, 8)
**Detail reference:** `plans/2026-10/2026-10-14-2007-owner-insights-ui.md` **Task 5 (Channels and Channel detail)** — execute as written. Skip its Tasks 1–4, 6.

## Feature registration (`app/javascript/features/channels/feature.ts`)
```ts
export const feature: FeatureModule = {
  id: "channels",
  routes: [
    { path: "channels", element: <ChannelsPage />, handle: { roles: ["owner"], title: "Channels" } },
    { path: "channels/:channel", element: <ChannelPage />, handle: { roles: ["owner"], title: "Channel" } },
  ],
  nav: [{ id: "channels", label: "Channels", icon: BarChart3, section: "insights", roles: ["owner"], order: 30, to: "/channels",
          mobile: { tab: { order: 3 } } }],
};
```

## Overrides
1. Fixtures: `contracts/examples/metrics/channels.json`, `channel-facebook.json` (Alpha). Cost pills: `best` → success, `worst` → danger; `basis: "rate"` shows the note "Ranked by qualified rate (no spend loaded yet)".
2. Row click navigates to `/channels/<encodeURIComponent(channel)>` keeping `?range=`; unknown channel (404 from the API) shows "We couldn't find that channel" with a back link.
3. "Ask Simbe" button question: `How is ${channel} performing and what should I change?` via `useAgent().open`.
4. Mobile: the `Table`'s `renderCard` shows tile + name, rate and cost per qualified (2 lines).
- **Loading state (async uploads):** when the data is empty *and* `useCurrentSnapshot().data?.pending` is non-null, render `<LoadingYourData progress={pending.progress} />` instead of the empty state; when there is no snapshot and nothing pending, the owner gets the "Load your data" link to `/data` (coordinators: "Ask your agency owner to load data"). Test both with `?mock=loading` and `?mock=empty`.

## Responsive acceptance
- **Desktop:** table with Channel (tile + name), Leads, Qualified, Rate (mini bar), Spend, Per qualified; two insight cards below; detail page with 4 KPIs + campaigns table + tinted note card.
- **Mobile:** stacked channel cards (tap to open), insight cards full width, detail KPIs in 2 columns, campaigns as stacked cards; no horizontal scroll.

## Done when (acceptance commands)
```bash
make web-test ARGS=app/javascript/features/channels
make e2e ARGS=channels             # channels-{desktop,mobile}.png, channel-{desktop,mobile}.png
grep -rnE '#[0-9a-fA-F]{6}' app/javascript/features/channels | wc -l      # 0
docker compose exec web npm run typecheck && docker compose exec web npm run lint
make verify
```
`e2e/channels.spec.ts`: owner → `/channels` shows `Facebook` with `$150` (green pill), `66.7%`, `10% of leads have no source`; click Facebook → `/channels/Facebook` shows `c-a`; unknown channel → not-found state; coordinator redirected. Compare with `handoff/design/screenshots/06-channels.png` and `07-channel-detail.png`. Branch `lane/F-CHANNELS-<slug>`; `bin/pr-ownership`; paste outputs in the PR.
