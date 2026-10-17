# Everloot's visual identity

**Date:** 2026-10-17 (revised the same day)
**Status:** designed with Carlos section by section; revised after he chose a reference (the
principles of GSAP's design system, taken closer to World of Warcraft). For his review before the
implementation plan.

## Why

WoW: Forever sites have converged on one look: gold fantasy serifs on dark gradients, glowing
buttons with emoji, sparkle glyphs, letter-spaced capital labels, countdown boxes. everloot.app
shares several of those tells today. Everloot should look like what it is: a fast, modern, open
WoW: Forever database that your own AI can read, speaking the game's own visual language.

**Direction.** A dark, typographic stage in the manner of GSAP's site (warm near-black, cream type,
huge tight headlines, outline pill buttons, colour used only as a taxonomy), made WoW by using the
game's own taxonomies and conventions instead of invented ones:

- **Colour is taxonomy, and it is the game's:** item quality, class, faction and chat channel colours.
  Nothing is coloured for decoration.
- **The signature is the item link:** `[square brackets]`, the way the game prints item links in chat,
  for section labels and every item mention.
- **The agent speaks in chat:** the `/ask` bar is a chat box, and answers arrive as
  `[Everloot] whispers: …` with their sources.
- **Game things keep the game's frame:** items, NPCs, quests and zones sit in tooltip frames.

## Identity

**Name and mark.** A lowercase `everloot` wordmark in Geist Bold with tight tracking, beside an
outlined diamond in the accent green (a loot gem, a map waypoint). The favicon is the green diamond
on the canvas. The gold "E" coin is retired.

**Colour.** Dark and light, following the visitor's system setting. Contrast was computed (WCAG 2.x);
every text pair passes 4.5:1.

| Token | Dark | Light | Use |
|---|---|---|---|
| `canvas` | `#0E0F0D` | `#FBF8EC` | Page background, flat |
| `panel` | `#15171A` | `#FFFFFF` | Chat box, panels, footer |
| `line` | `#3A3B35` | `#D9D3BF` | Hairline dividers and borders |
| `fg` | `#F4EFDD` cream (16.7:1) | `#12130F` (17.5:1) | Body text and headings |
| `fg-2` | `#C9C3B0` (10.9:1) | `#3E3B32` (10.5:1) | Lead paragraphs |
| `muted` | `#8B8778` (5.3:1) | `#5F5B4E` (6.4:1) | Secondary text, nav at rest |
| `accent` | `#9CF03A` (13.8:1) | `#2F7A0A` (5.0:1) | Links, the agent cursor, citations |
| `danger` / `warning` | `#FF6B6B` / `#F5B83D` | `#C62828` / `#8A5A00` | Errors and warnings |

**The game's taxonomies.** Dark values are the game's own where they pass; tuned where they do not.

| Group | Name | Dark | Light |
|---|---|---|---|
| Quality | poor, common | `#9D9D9D`, `#F2F4F8` | `#6B6B6B`, `#12130F` |
| | uncommon, rare | `#1EFF00`, `#4C9BFF` (game `#0070DD` is 4.0:1) | `#1A7A12`, `#0057AD` |
| | epic, legendary | `#BE73F7` (game `#A335EE` is 4.0:1), `#FF8A1A` | `#7A23C0`, `#A84B00` |
| Class | Warrior, Paladin, Hunter | `#C69B6D`, `#F48CBA`, `#AAD372` | `#85592C`, `#A8326E`, `#4A7320` |
| | Rogue, Priest, Shaman | `#FFF468`, `#FFFFFF`, `#2E8BFF` (game `#0070DD` is 4.0:1) | `#746500`, `#12130F`, `#0057AD` |
| | Mage, Warlock, Druid | `#3FC7EB`, `#8788EE`, `#FF7C0A` | `#0B6E87`, `#4A4BC0`, `#A84B00` |
| Chat | whisper, guild | `#FF80FF`, `#40FF40` | `#A3218F`, `#1A7A12` |

Faction colours (Alliance, Horde) are added with the first page that needs them, tuned the same way.

**Tooltip frames stay dark in both modes**, as in the game: panel `#080C18`, border `#5B6B8C` with an
inner `#26324F` line; colours inside a tooltip use the dark values.

**Type.** Geist for reading; Geist Mono for anything precise: numbers (tabular figures), ids, builds,
bracket labels, the chat input, citations. Both open-licensed and self-hosted through `next/font`.
The home headline is large and tight (up to about 9vw, weight 600, line height 0.92, tracking
-0.035em); body text stays 15 to 19 px.

**Buttons.** Outline pills (full radius, 1 px `fg` border, transparent fill). The primary action is
the same pill with a 1.5 px green gradient outline (`#1EFF00` to `#9CF03A`): the only gradient in the
system. No filled colour buttons, no shadows.

**Imagery.** Our own data: the world map, charts, real numbers. No Blizzard art, no stock 3D shapes.

**Banned, and guarded by tests:** gold palettes, Cinzel or any fantasy display serif, glows, gradient
page backgrounds, sparkle glyphs (✦), emoji in the interface, letter-spaced capital labels, scrolling
tickers, drop shadows on cards.

**Voice.** Plain and precise. A number comes with its denominator and date; no "epic adventure" copy.

## Components

1. **App shell:** wordmark, navigation as bracket labels (`[Database]` `[Builds]` `[Addons]`
   `[Lore]`), the "Connect your AI" pill, footer with the Source link, hairline dividers between
   sections.
2. **Bracket labels:** section openers in Geist Mono, `[Section]` with the bracket in `muted` and the
   word in `fg`. Every item mention is a bracketed link in its quality colour.
3. **Agent chat (`/ask`, ⌘K or Ctrl+K on every page):** a chat box. Typing searches the database. A
   question shows `To [Everloot]: …` and the reply `[Everloot] whispers: …` in whisper colour, each
   piece of evidence with a citation chip (the `answer_sources` tool,
   `2026-10-17-sourced-answers-design.md`). The site calls no language model; it offers "Ask this
   in ChatGPT / Claude", which opens the visitor's own assistant connected to Everloot.
4. **Tooltip frame:** every item, NPC, quest and zone card, and hover or focus previews on item links.
5. **Evidence tags:** `observed in play` (guild green), `in game files · unconfirmed` (muted, dashed),
   `wiki 2023` (muted), with counts and dates in mono.
6. **Citations:** mono chips linking to the source.
7. **Data display:** stat blocks with large mono numbers, tables with tabular figures, names in their
   quality or class colour, thin-line charts.
8. **Leaderboards:** rank in large mono, name, share, install count.
9. **Spoiler gate:** game-file content blurred behind "Show unreleased", off by default, remembered.
10. **Controls:** pill buttons, text links, inputs; a visible 2 px accent focus ring everywhere.
11. **States:** unavailable, nothing yet, "waiting for three installs", in plain words.
12. **Motion:** 150 ms fades and the chat cursor's blink; none of it under `prefers-reduced-motion`.

## Rollout

**R1, foundation (one PR, so production changes identity in one deploy).**
- Colours as CSS variables for dark and light; Tailwind names `canvas`, `panel`, `line`, `fg`,
  `fg-2`, `muted`, `accent`, `tooltip`, `q-*`, `class-*`, `chat-*`, `danger`, `warning`.
- A scripted rename of the old classes (about 800 uses of `gold-*`, `parchment-*`, `arcane` in 44
  files, and 104 of `font-display`) to the new names, with the mapping table in the PR. The old
  palette and the background glow are deleted.
- Geist and Geist Mono through `next/font`; pill buttons; bracket navigation; new favicon and social
  card; emoji, the ticker and the letter-spaced labels removed.
- Guard tests: no emoji, gold, Cinzel, glow or card-shadow classes in `web/src`; every token text pair
  at least 4.5:1 in both modes.
- Evidence in the PR: all tests, lint and build pass; screenshots of the home, database, item, lore
  and addons pages in dark and light at 390 and 1440 px.

**R2, components:** tooltip frame, bracket item links, evidence tags, citations, stat blocks,
leaderboards, spoiler gate, states; applied to the database, lore and addons pages.

**R3, agent chat and `/connect`:** ⌘K chat box on the existing search; sourced evidence once
`answer_sources` exists; "Ask in ChatGPT / Claude"; the `/connect` page for players and developers.

**R4, home page:** big headline, our data as imagery, new copy drafted for Carlos's review.

**Order:** addon 0.2.6 first (CurseForge around 10/24), then R1, then R2 to R4 before the WoW:
Forever launch on 11/04.

## Acceptance

- No page shows gold, glow, emoji, card shadows or the old ticker; the guard tests prove it in CI.
- Every text colour pair passes 4.5:1 in both modes; focus is visible everywhere.
- Colour appears only as a taxonomy (quality, class, faction, chat) or as the accent for actions.
- Every existing test passes; no route, API or behaviour changes in R1 and R2.
- Items look the same in both modes inside their tooltip frames.

## Out of scope

The addon's in-game look; a mobile app; server-side model calls; animations beyond the two above.
