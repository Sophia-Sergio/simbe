# Simbe brand (from https://www.simbefamily.com/)

**Binding override of the colors, type, radii and logo in `design_handoff_simbe/README.md`.**
The handoff still defines layout, screens, spacing, behavior and the semantic status colors; where it names a brand color, shape or logo, use this file instead. Extracted from the live site's CSS/bundle on 2026-10-14.

## Logo
- Mark: `frontend/public/brand/simbe-mark.png` — two interlocking arcs forming an "S", flat `#FF1B5A`, transparent background (source: site favicon). Do **not** recolor, outline, or put it inside a tinted tile.
- Header lockup: mark (28px high) + "Simbe" in Outfit 600 18px, `ink`. Sidebar collapse chevron stays on the right. Favicon = the mark.
- On the sign-in / sign-up card: mark 40px high above the title. Agent header: mark 20px in place of the sparkle tile (sparkle icon stays for "Ask" buttons).

## Color tokens (replace the handoff's `brand*`, `bg*`, `text*`, `border*`)
| Token | Hex | Notes |
|---|---|---|
| `brand` | `#FF1B5A` | Primary buttons, active nav, links on large text, mark |
| `brand.hover` | `#E0124F` | Hover/pressed |
| `brand.text` | `#C8104A` | Small brand-colored text/links (≥4.5:1 on white). Use instead of `brand` for 12–14px text |
| `brand.tint` | `#FAEEEE` | Active nav bg, selected chips (the site's blush) |
| `brand.border` | `#FBC4D2` | Outline-brand borders, selected chip border |
| `gradient.brand` | `linear-gradient(135deg, #FFAD61 0%, #FF1B5A 100%)` | FAB, avatar of the Ask agent, hero accents, progress "best" highlights — never full-page backgrounds |
| `bg.app` | `#FCFBFA` | App background |
| `bg.surface` | `#FFFFFF` | Cards, sidebar, top bar, panels |
| `bg.subtle` | `#F4F3EF` | Column wells, segmented track, hover rows (site cream) |
| `bg.dark` | `#2E1A28` | Code block (MCP config), toast, black tiles (site dark plum) |
| `border.default` | `#E2E8F0` | All 1px borders |
| `border.subtle` | `#F4F3EF` | Row dividers |
| `border.strong` | `#CBD5E1` | Hovered cards, dashed dropzones |
| `text.primary` | `#2E1A28` | Body and headings (plum instead of black) |
| `text.secondary` | `#4B4550` | Card body copy |
| `text.muted` | `#646464` | Meta, labels (the site's gray) |
| `text.faint` | `#9CA3AF` | Nav section headings, placeholders |
| `focus` | `#FF1B5A` @ 40% → `outline: 2px solid #FF8DAC; outline-offset: 2px` | |

Semantic colors are unchanged from the handoff (success `#22a559`, warning `#f59e0b`, danger `#e5484d` and their text/bg/border variants, violet for "People"). Channel tile colors unchanged. Anything the handoff showed in `#be3a5f` becomes `brand`; `#fdf2f5` → `brand.tint`; `#1c1917` → `text.primary`/`bg.dark`.

## Type
- Body/UI: **Inter** 400/500/600/700, base 14px.
- Display (page titles, KPI values, big numbers, auth card titles): **Outfit** 600. Page title 24px, KPI 28px, letter-spacing −0.02em.
- Mono: `ui-monospace` stack. Load via Google Fonts `family=Inter:wght@400;500;600;700&family=Outfit:wght@600`.

## Shapes
The site is soft and rounded; the handoff's tighter radii are replaced:
| Element | Radius |
|---|---|
| Buttons, pills, chips, segmented control and its thumb, tab bar items, count pills, FAB, avatars | **full** (`999px`) |
| Inputs, selects, search button | `8px` (site `--radius: .5rem`) |
| Small list cards, lead cards, task cards, table containers | `16px` |
| Cards, wells, KPI cards, panels | `20px` |
| Modal, login/wizard card, agent panel | `24px` (site `rounded-3xl`) |
| Mobile sheet | `24px 24px 0 0` |
| Logo tile / channel logo tiles | `10px` (rounded square) |
Shadows: handoff values, but modal/agent shadows tinted plum: `0 20px 60px rgba(46,26,40,.18)`; FAB `0 8px 24px rgba(255,27,90,.35)`.

## Contrast note
White text on `#FF1B5A` is ~3.6:1: buttons use 14px/600 text (passes as bold UI text at ≥14px bold) and never smaller than 14px. Small brand-colored text on white must use `brand.text`.
