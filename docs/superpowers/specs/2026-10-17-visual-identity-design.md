# Everloot's visual identity

**Date:** 2026-10-17
**Status:** designed with Carlos section by section (direction, identity, components, rollout);
this document is for his review before the implementation plan.

## Why

WoW: Forever sites have converged on one look: gold fantasy serifs on dark gradients, glowing
buttons with emoji, sparkle glyphs, letter-spaced capital labels, countdown boxes. everloot.app
shares several of those tells today (gold accents, a glow behind the page, emoji on tool cards, a
scrolling ◆ ticker). Everloot should look like what it is: a fast, modern, open WoW: Forever
database that your own AI can read, with the game's own language for the game's own things.

**Direction chosen:** console-led. The structure, type and precision of a modern data tool, with an
AI agent bar on every page, and the game's tooltip frames and quality colours for every item, NPC,
quest and zone.

## Identity

**Name and mark.** A lowercase `everloot` wordmark in Geist Bold with tight tracking, beside an
outlined diamond in the accent green (a loot gem, a map waypoint). The favicon is the green diamond on
the dark canvas. The gold "E" coin is retired.

**Colour.** Dark and light, following the visitor's system setting. Contrast was computed (WCAG 2.x);
every text pair below passes 4.5:1.

| Token | Dark | Light | Use |
|---|---|---|---|
| `canvas` | `#0B0E13` | `#F6F7F9` | Page background, flat |
| `surface` | `#11161D` | `#FFFFFF` | Cards, panels, the agent bar |
| `line` | `#273040` | `#D8DDE4` | Borders and dividers |
| `fg` | `#E6E9EE` (15.9:1) | `#11151C` (17.1:1) | Body text |
| `muted` | `#8D96A3` (6.5:1) | `#56606E` (5.9:1) | Secondary text |
| `accent` | `#9CF03A` (13.8:1) | `#2F7A0A` (5.0:1) for text and links | Links, primary actions, cursor, citations |
| `accent-fill` | `#9CF03A` | `#9CF03A` with a `#2F7A0A` 1px border | Primary button background; its text is `#0B0E13` (13.8:1) |
| `danger` | `#FF6B6B` | `#C62828` | Errors |
| `warning` | `#F5B83D` | `#8A5A00` | Warnings |

**Tooltip frames stay dark in both modes**, as in the game: panel `#080C18`, border `#5B6B8C` with an
inner `#26324F` line. Quality colours inside a tooltip are the same in both modes.

| Quality | In tooltips and on dark | On light pages (lists, tables) |
|---|---|---|
| poor | `#9D9D9D` | `#6B6B6B` |
| common | `#F2F4F8` | `#11151C` |
| uncommon | `#1EFF00` | `#1A7A12` |
| rare | `#4C9BFF` (the game's `#0070DD` is 4.0:1 on dark) | `#0057AD` |
| epic | `#BE73F7` (the game's `#A335EE` is 4.0:1 on dark) | `#7A23C0` |
| legendary | `#FF8A1A` | `#A84B00` |

**Type.** Geist for reading; Geist Mono for anything precise: numbers (tabular figures), ids, builds,
the agent bar, citations. Both are open-licensed and self-hosted through `next/font`, so visitors
make no requests to a font service.

**Banned, and guarded by tests:** gold palettes, Cinzel or any fantasy display serif, glows and
gradient page backgrounds, sparkle glyphs (✦), emoji in the interface, letter-spaced capital labels
above headlines, scrolling tickers. Icons, where needed, are thin line icons.

**Voice.** Plain and precise. A number comes with its denominator and date; no "epic adventure" copy.

## Components

1. **App shell:** wordmark, navigation (Database, Builds, Addons, Lore, Connect your AI), agent bar,
   footer with the Source link.
2. **Agent bar (`/ask`, ⌘K or Ctrl+K on every page):** typing searches the database; a question
   shows sourced evidence (the `answer_sources` tool, `2026-10-17-sourced-answers-design.md`), each
   piece with its citation, count and date. The site calls no language model; it offers "Ask this in
   ChatGPT / Claude", which opens the visitor's own assistant connected to Everloot.
3. **Tooltip frame:** every item, NPC, quest and zone card, and hover or focus previews on item links.
4. **Evidence tags:** `observed in play` (green), `in game files · unconfirmed` (grey, dashed),
   `wiki 2023` (grey), with counts and dates in mono.
5. **Citations:** mono chips linking to the source.
6. **Data display:** stat blocks with large mono numbers, tables with tabular figures, quality-coloured
   names, thin-line charts in the accent and a chart palette.
7. **Leaderboards:** rank in large mono, name, share, install count.
8. **Spoiler gate:** game-file content blurred behind "Show unreleased", off by default, remembered.
9. **Controls:** primary (accent fill), secondary (outline), text links, inputs; a visible 2px accent
   focus ring on everything focusable.
10. **States:** unavailable, nothing yet, and "waiting for three installs", in plain words.
11. **Motion:** 150 ms fades and the agent cursor's blink; none of it under `prefers-reduced-motion`.

## Rollout

**R1, foundation (one PR, so production changes identity in one deploy).**
- Colours as CSS variables for dark and light; Tailwind names `canvas`, `surface`, `line`, `fg`,
  `muted`, `accent`, `accent-fill`, `tooltip`, `q-poor` … `q-legendary`, `danger`, `warning`.
- A scripted rename of the old classes (about 800 uses of `gold-*`, `parchment-*`, `arcane` in 44
  files, and 104 of `font-display`) to the new names, with the mapping table in the PR. The old
  palette and the background glow are deleted.
- Geist and Geist Mono through `next/font`; new favicon and social card; emoji, the ticker and the
  letter-spaced labels removed.
- Guard tests: no emoji, gold, Cinzel or glow classes in `web/src`; every token text pair at least
  4.5:1 in both modes.
- Evidence in the PR: all tests, lint and build pass; screenshots of the home, database, item, lore
  and addons pages in dark and light at 390 and 1440 px.

**R2, components:** tooltip frame, evidence tags, citations, stat blocks, quality names,
leaderboards, spoiler gate, states; applied to the database, lore and addons pages.

**R3, agent bar and `/connect`:** ⌘K search on the existing search; sourced evidence once
`answer_sources` exists; "Ask in ChatGPT / Claude" and the `/connect` page.

**R4, home page:** new layout and copy, drafted for Carlos's review.

**Order:** addon 0.2.6 first (CurseForge around 10/24), then R1, then R2 to R4 before the WoW:
Forever launch on 11/04.

## Acceptance

- No page shows gold, glow, emoji or the old ticker; the guard tests prove it in CI.
- Every text colour pair passes 4.5:1 in both modes; focus is visible everywhere.
- Every existing test passes; no route, API or behaviour changes in R1 and R2.
- Items look the same in both modes inside their tooltip frames.

## Out of scope

The addon's in-game look; a mobile app; server-side model calls; animations beyond the two above.
