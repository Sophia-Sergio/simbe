## Lane

<!-- One lane = one PR. Fill in the lane id and link its plan. -->

Lane: <!-- e.g. F-WEEK -->
Plan: `docs/superpowers/plans/2026-10/<plan>.md`
Spec: `docs/superpowers/specs/2026-10/<spec>.md`

## What changed

<!-- One or two sentences. List the screens/endpoints/jobs touched. -->

## Checklist (paste outputs below)

- [ ] The plan's **Done when** commands pass (outputs pasted under "Outputs")
- [ ] `make verify` is green
- [ ] `bin/lane check` is clean (only files in the plan's `Owns` list changed)
- [ ] Desktop (1280×800) and mobile (390×844) screenshots attached next to the matching
      `handoff/design/screenshots/` image, and checked against `docs/design/brand.md` (UI lanes)
- [ ] No contract change — or a **separate `ccr` PR** (`contracts/**` + regenerated types + the matching mock/hook change)
- [ ] Real-data checks (`:real_data` specs / `@real` journeys) run **locally** when the exports exist
- [ ] One commit per plan task, message names the task (`ci(pipeline): task N – …` for this lane)

## Outputs

<!-- Paste the command outputs (and note anything that cannot run in this environment). -->

```
# e.g.
$ make verify
...
```

## Screenshots (UI lanes)

| Viewport | This PR | Handoff |
|---|---|---|
| Desktop 1280×800 | | |
| Mobile 390×844 | | |

## Notes / deviations

<!-- Anything outside the lane's Owns, any plan deviation, any follow-up needed. -->
