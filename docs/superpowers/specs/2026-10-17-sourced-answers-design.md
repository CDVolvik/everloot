# Sourced answers

**Date:** 2026-10-17
**Status:** design for Carlos's review.

## Why

People ask AI assistants about WoW: Forever and get answers with no sources, or wrong ones from
other versions of the game. Everloot's MCP server already holds sourced lore and corroborated
observations. One tool that gathers the evidence for a question, every piece with its source, lets
any assistant answer the way a search engine with citations does, and lets the reader check.

## The tool

`answer_sources(question, limit?)` on both MCP endpoints. It returns evidence, not prose; the
client's model writes the answer and cites the pieces.

Each piece of evidence carries:

| Field | Meaning |
|---|---|
| `claim` | One short statement, in our words |
| `kind` | `observed` (Everloot players), `lore` (Warcraft Wiki 2023), `curated` (our facts), `reference` (open data such as OpenMap) |
| `source` | Title and URL (an everloot.app page, the wiki article, the OpenMap repository) |
| `licence` | CC BY-SA 4.0, MIT, … |
| `asOf` | The date the source was read or the observation's last report |
| `support` | For observations: how many installs reported it |

It also returns `furtherReading`: search links on other sites (Warcraft Wiki, Wowhead, Icy Veins),
built from the question's names. Links only: nothing is fetched from those sites.

## How it finds evidence

1. Names in the question are matched against the knowledge release (exact and normalized names,
   the same lookup `search` uses) and against the corroborated corpus (NPCs, items, vendors, zones).
2. For each match, the existing readers supply the facts: lore page summary, drop rates, vendor
   items and prices, recipe ranges, spawn zone, and (once the world map exists) nearby places.
3. Evidence is ordered observed first, then curated, reference and lore. Lore is marked "2023 wiki,
   may differ in WoW: Forever".

## Other sites: connectors and the assistant

The aim is an answer engine in the style of Perplexity: one question, answered from many sources,
each one cited. Two ways to get there without scraping anyone:

1. **Connectors.** Everloot calls a site only through an official API or MCP server, under its
   terms, and cites it like any other source. Each connector is recorded in
   `docs/sources/LEDGER.md` before it ships. Candidates: Blizzard's Game Data API once it has a WoW:
   Forever namespace; Warcraft Logs once it allows republishing (its terms ask first); Raider.IO
   after its terms are read. None covers WoW: Forever today, so the first version reads only
   Everloot's own data.
2. **The assistant combines servers.** ChatGPT, Claude and other clients connect several MCP
   servers at once. A `/connect` page on everloot.app explains how to add Everloot and lists
   compatible WoW MCP servers beside it (for example the community servers that wrap Blizzard's API
   for Retail and Classic). The user's assistant then draws on all of them and cites each, while
   Everloot serves only its own data.

## Tests

Fixture release and corpus; questions that hit lore only, observations only, both, and nothing
(the tool returns no evidence and says so, never an invented claim). Every piece must carry a
source URL and a licence.

## Out of scope

Server-side model calls; fetching or caching any other site's pages.
