# Everloot's design system

**Date:** 2026-10-19
**Status:** foundation. Pages adopt it group by group (home and project pages, database, tools,
world and community). Supersedes the theme, navigation and bracket-label parts of
`2026-10-17-visual-identity-design.md`, and its gradient-ring primary button; its colours, type and
banned list still hold.

Every component is in `web/src/components/ui/` and shown in every state at `/dev/system` (not linked,
not in the sitemap, `noindex`). Import from `@/components/ui`.

## Tokens

All in `web/src/design/tokens.ts`, exposed to Tailwind by `web/tailwind.config.ts`.

- **Theme: dark only.** Every visitor gets the dark values; the system's light setting no longer turns
  the page cream. The light values stay in `tokens.ts`, tested, so a light theme can come back as one
  more selector in the Tailwind plugin.
- **Colour.** `canvas` `panel` `line` `edge` `fg` `fg-2` `muted` `accent` (fel green `#9CF03A`)
  `danger` `warning`; `tooltip` `tooltip-border` `tooltip-inner`. Colour is taxonomy: item quality
  `q-poor` to `q-legendary`, `class-*`, `chat-*`. In code use `QUALITY_TEXT[quality]` and
  `qualityOf(id)` (0 poor to 5 legendary).
- **Spacing:** 4 8 12 16 24 32 48 72 px, Tailwind `1 2 3 4 6 8 12 18`. Nothing off the scale.
- **Corners:** `rounded-card` (12 px) for every card, table frame and panel; `rounded-control` (6 px)
  for inputs, icons and the tooltip frame; `rounded-full` for buttons and badges.
- **Widths:** `max-w-reading` (768 px) and `max-w-wide` (1152 px). The header, the footer and the
  layout's `<main>` are `wide`.
- **Type:** Geist; Geist Mono for numbers, ids, builds and dates. Page title 36 px (30 on a phone),
  section heading 20 px semibold, lede 18 px `fg-2`, body 16 px, small 14 px `muted`.
- **Buttons:** pills. Primary `btn btn-primary`: filled fel green (`accent`, `accent-hover` on hover)
  with canvas-coloured text, one per view. Secondary `btn`: the outline pill. The gradient ring is gone.

## Components

| Component | What it is |
|---|---|
| `Container width="reading" \| "wide"` | The page's column. Left-aligned with the header. |
| `PageHeader title lede trail meta actions icon quality` | Breadcrumb, the one h1, one-line lede, meta row, actions. |
| `SectionHeading as action note` | The one section heading: 20 px, optional "All →" and one note line. |
| `Card href unconfirmed padding` | Panel, hairline, 12 px. `href` makes the whole card one link. `unconfirmed` dashes the edge. |
| `DataTable columns rows rowKey caption sort sortHref empty footer toolbar` | Dense table in a card frame. Scrolls inside its frame on a phone. Sorting is a link (`?sort=&dir=`), `aria-sort` on the sorted column. |
| `Tabs label tabs inFrame` | Tabs whose state is the URL hash (`#sold-by`). Arrow keys, Home, End. |
| `Badge tone="files" \| "confirmed" \| "neutral" \| "quality"` | The whole badge set. |
| `AgreementMeter count size withText` | Three diamonds, 0 to 3 filled; read as "N of 3 installs agree". |
| `EmptyState message count action framed` | Meter, one sentence, "Get the addon" (or a better action). |
| `SourceLine build confirmed licence` | The page's one source line, with the key for the dashed edge. |
| `TooltipFrame name quality foot label` | The game's tooltip frame for an entity shown on a page. |

## Rules

1. **One `PageHeader` per page.** No line above the title: no `[Bracket]` eyebrow, no "Tool ·" or
   "WoW: Forever · npc" label. What that line said goes in the lede or the meta row.
2. **Breadcrumbs on every page but home.** Pass `trail` to `PageHeader`. For a route listed in
   `web/src/lib/breadcrumbs.ts` pass `trailFor(path)!`; the layout's own copy then hides itself
   (globals.css) and the layout keeps emitting the BreadcrumbList. For any other route (items, NPCs,
   quests) build the trail; `PageHeader` emits its BreadcrumbList.
3. **Widths: `reading` for documents** (about, legal, methodology, lore pages, changes), **`wide` for
   data** (database, tables, tools, map, home). Nothing else: no `max-w-4xl`, no `max-w-2xl`.
4. **One `SourceLine` at most**, at the foot of the content. Explanations of where data comes from go
   there, in a "?" or a collapsed details, not as banners or repeated notes.
5. **Dashed means unconfirmed.** A value from the game files that no player has confirmed sits in a
   dashed edge (`Badge tone="files"`, `Card unconfirmed`). The page's `SourceLine` explains it once.
6. **Never a bare zero.** Every empty dataset is an `EmptyState`. Inside a `DataTable` pass it as
   `empty` with `framed={false}` so the headers stay.
7. **One card, one table, one heading style.** No new `rounded-lg`/`rounded-xl`/`rounded-2xl`
   bordered boxes; use `Card`. No ad-hoc `<table>`; use `DataTable`. No other h2 styles; use
   `SectionHeading`.
8. **Badges are the four tones.** No status pill on every row; a collecting tool or row shows an
   `AgreementMeter`.
9. **No sideways scroll at 390 px.** Wide tables scroll in their frame; long names wrap.
10. The guard tests in `web/src/design/guard.test.ts` still apply: no shadows, glows, gradients,
    letter-spaced capitals or emoji.

## Navigation

Top bar: Database · Tools (menu: Plan / Look up / Track) · Map · Changes · Lore · Open data, then
search ("Search Everloot": the database and the lore archive, `/` focuses it), Sign in and **Get the addon** (`/addon`). On a phone:
the wordmark, Get the addon and Menu, which lists the same places. A new tool goes in
`web/src/data/tools.ts` and in `TOOL_GROUPS` in `web/src/components/Header.tsx`; a test fails if it
is missing from the menu. The footer is compact: Browse, Data and API, Project, and one legal row.
