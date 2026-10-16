# Addons hub and Polestar pages — design

**Date:** 2026-10-16 · **Program slice:** 3 of 4 (redefined by Carlos on 2026-10-16: an addons and tools
hub around Polestar instead of a generic `/guides`) · **Branch:** `feat/addons-polestar` from `main`.

## Why

Polestar (`fitzforge/polestar`) is a GPL-3 leveling-guide addon for WoW: Forever. Its guides come from a
route simulator, and anyone can publish more guides as a "guide pack", a separate addon built with
Polestar's tools. Polestar's `docs/GUIDE_PACKS.md` says it "does not ship, host or recommend any pack";
authors show packs on the Polestar Discord. A player searching the web has nowhere to find packs, and an
author has nowhere to list one. Everloot can be that independent place, and it already collects the kind
of facts Polestar's open issues ask for (NPC positions, trainers, quest givers).

## Facts the pages rely on (checked 2026-10-16, Polestar `next` at `e1d24ac`)

- Polestar licence: GPL-3.0 (`LICENSE`) with `LICENSE-EXCEPTION.md`: packs built by Polestar's compiler
  may be distributed under any terms; the exception does not cover Polestar's code or guide text copied
  from Polestar's own guides.
- Install: CurseForge "Polestar Guides" (`curseforge.com/wow/addons/polestar-guides`) or the GitHub
  Releases page; latest release v0.2.3 (2026-10-14). Discord `discord.gg/vMbee6F2e9`.
- Commands: `/polestar` (or `/pole`) shows the guide window; `/polestar guides` the hub; `/polestar
  options`; `/polestar packs` lists installed packs; `/polestar skip`, `next`, `prev`; `/polestar report`.
- Pack manifest `pack.json` (`docs/PACK_FORMAT.md`): required `id` (`^[a-z0-9][a-z0-9-]{1,31}$`),
  `title` (≤ 64), `author` (≤ 64), `version` (≤ 32), `license` (SPDX where one exists, ≤ 64); optional
  `website` (http/https, ≤ 200), `source` (≤ 200), `notes` (≤ 200), `folder`.
- Polestar's own pack: `Polestar_Guides`, id `guides`, author "Polestar", version 0.2.3, GPL-3.0-only;
  220 guide files: 57 leveling guides, 1–60 for both factions (29 Alliance, 28 Horde; starts: Human,
  Dwarf/Gnome, Night Elf, Skyborne; Orc/Troll, Tauren, Undead, Skyborne), 62 class-quest guides across nine classes, 64 mount and pet
  guides, 12 profession guides, 17 reputation guides, 7 exploration guides, 1 legacy challenges guide.
- Its leveling routes are solo by design: the simulator filters out dungeon, raid, PvP and elite quests
  (README, "How the routes are made"). It has no gold or farming guides.
- Polestar's open issues include a "help wanted" request to map caves, climbs and chokepoints (#10) and
  player guide reports labelled `guide:<zone>`.

## Pages

All are server-rendered, indexed, in the sitemap, with canonical URLs and the existing page styling.

### `/addons`

Two cards: **Everloot** (ours: collects what you see in game for this site; links to `/upload` and the
0.2.5 download) and **Polestar** (independent: leveling guides with an arrow; links to `/addons/polestar`).
One line: "Addons we build or that work well with Everloot. Polestar is made by its own authors; Everloot
lists it and is not part of it."

### `/addons/polestar`

- What it is, in our words (two short paragraphs, no text copied from Polestar's README).
- Install: CurseForge and GitHub Releases buttons; "latest release vX (date)" from GitHub, live.
- Commands table (the list above).
- Licence summary, with links to `LICENSE` and `LICENSE-EXCEPTION.md`.
- **Help Polestar** (live from GitHub): open issues labelled `help wanted` or `good first issue`, the count
  of open player guide reports (`guide:*` labels) with a link to them, and the open-issue total.
- Links: guide packs (`/addons/polestar/packs`), pack ideas (`/addons/polestar/wanted`), GitHub, Discord,
  the pack handbook (`docs/PACKS.md`).
- **Disclosure:** Everloot's maintainer contributes to Polestar; link to their pull requests on GitHub
  (`is:pr author:CDVolvik`). Not affiliated with or endorsed by Polestar's authors.

### `/addons/polestar/packs`

The independent registry. A notice first: packs are made by their own authors; neither Polestar nor
Everloot tests or vouches for them; install packs from authors you trust. Then one card per pack:
title, author, id, version, licence, what it covers (lines of text), needs Polestar version (when known),
website, source, download links, "listed" and "checked" dates. Polestar Guides is the first entry.

"List your pack": email `hello@everloot.app` with your `pack.json` and a download link. (The Everloot
repository is private, so pull requests are not an option yet; a form can follow once authors show up.)

### `/addons/polestar/wanted`

Pack ideas with the reason each is open, each sourced:

1. **Group and dungeon leveling routes.** Polestar's routes are solo by design (dungeon, raid, PvP and
   elite quests filtered out). A pack can route group play, elite quests and dungeon runs.
2. **Gold and farming routes.** Polestar Guides has no gold or farming guides. Everloot's farming routes
   and gold-per-hour tools are a starting point.

Then **Help Polestar itself**: navigation mapping (#10), confirming player guide reports in game, and
the optional Polestar Recorder ("records your sessions to improve the routes", off until turned on).
Each idea ends with how to start: the pack handbook and `polestar new <folder>`.

## Data

- `web/src/data/polestar.ts`: the static facts (links, commands, licence, checked date and commit),
  `POLESTAR_PACKS` (registry entries shaped on `pack.json` plus coverage, downloads, listed/checked
  dates) and `PACK_IDEAS`.
- `web/src/lib/polestar-github.ts`: `polestarLive()` fetches `releases/latest` and one page of open
  issues (100, pull requests removed) from the GitHub REST API with no token, a 5 s timeout and
  `revalidate: 3600`; returns `null` on any failure. Two requests an hour at most.
- A unit test validates every registry entry against the `pack.json` rules above (id pattern, lengths,
  http(s) website, unique ids, ISO dates).

## Failure behaviour

GitHub unreachable or rate-limited: the pages render every static fact; the live parts say "Live
details from GitHub are unavailable right now" and link to the repository. No page depends on GitHub to
render.

## Navigation

"Addons" in the primary nav after Gold/Hour and at the top of the menu, and in the footer. The lore
branch adds "Lore" lines in other spots of the same files; the merge is mechanical.

## Guardrails

- Link to Polestar's code and guides; never copy Lua or guide text into this repository. Pack metadata,
  file counts and coverage facts are not guide text.
- No claim of endorsement or affiliation. No invented demand: every idea cites its reason.
- Free services only: unauthenticated GitHub API behind an hourly cache.

## Not in this slice

- The CC BY-SA export of corroborated NPC/quest/trainer/vendor facts for Polestar's `data build`: it
  needs real collection first (the in-game checklist). Outreach draft:
  `docs/2026-10-16-polestar-outreach-draft.md` on `feat/lore-types`.
- A submission form; automatic pack discovery (e.g. a GitHub search for `X-Polestar-Pack`).

## Tests

- Registry validation (above).
- `polestarLive()`: parses a release and issues, removes pull requests, filters help-wanted/good-first
  and counts `guide:*`; returns `null` on network error, non-200 and bad JSON.
- Each page renders its static facts with GitHub down; the Polestar page shows release and help-wanted
  issues when the fetch succeeds; metadata canonicals; sitemap includes the four URLs; header and footer
  link to `/addons`.
