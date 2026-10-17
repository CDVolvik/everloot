# How Everloot fits together

Four parts share one repository: the **addon** collects what players see, the **site** publishes
only corroborated facts, the **knowledge base** holds the lore and answers questions over MCP, and
the **companion** uploads and runs the `/ask` bridge on the player's computer.

## Where each thing lives

| What | Code | Runs on |
|---|---|---|
| Collector addon | `addon/` | The player's WoW: Forever client; writes `SavedVariables/Everloot.lua` |
| Companion | `companion/` | The player's computer, beside the game |
| Site and APIs | `web/` | Vercel, at everloot.app; every merge to `main` deploys production |
| Raw uploads | `web/src/lib/upload-store.ts` | Cloudflare R2 (`uploads/<date>/<id>.json`), indexed in Supabase |
| Public corpus | `web/src/app/api/cron/snapshot` | A Vercel cron every 10 minutes extends `snapshots/corpus.json` in R2; pages read that one object |
| Sessions, grants, quotas, waitlist | `supabase/` | Supabase Postgres, server-side only, row-level security on every table |
| Knowledge release (lore) | `kb/` | Built offline into a SQLite file plus a hashed manifest, kept in R2, downloaded and checked at build time, read in process |
| MCP server | `kb/src/mcp-server.ts`, mounted by `web/src/app/mcp/` | `/mcp` (bearer token) and `/mcp/public` (no sign-in, per-IP quota) on the site |

## Data paths

```text
Player plays
  -> addon records events into SavedVariables
  -> upload page (preview, sharing choices) or companion (anonymous events only)
  -> /api/intake: quotas, schema checks, event deduplication
  -> raw upload in R2, index row in Supabase
  -> cron snapshot merges new events into the corpus
  -> public read: named records only with a grant (kb/src/corpus.ts)
  -> rollups: a fact is public once at least three installs agree (kb/src/drop-rollup.ts)
  -> site pages and MCP gameplay tools

Warcraft Wiki dump (CC BY-SA 4.0) + curated entries
  -> kb import -> source database -> validate
  -> snapshot: publishable sources only, sha256 manifest
  -> R2 -> site build -> /lore, /search, MCP lore answers

/ask in game -> SavedVariables -> companion bridge -> MCP search (and an optional model)
  -> EverlootAnswers addon file -> shown after /reload
```

## Boundaries

- **Raw and named data stay private.** Raw uploads and the index are never served directly; only
  the corroborated, sanitized corpus is public.
- **The knowledge release holds publishable sources only.** The build refuses Battle.net API rows
  and any cached API response, and the site refuses a release that does not match its manifest.
- **Credentials stay in Vercel.** Nothing in the repository holds a key; `.env.example` lists names.
- **The addon and companion never touch the running game.** They use the addon API and the files
  the game writes. See [`DATA_POLICY.md`](DATA_POLICY.md).

## Decisions, and why

- **Free hosting only (Vercel, Supabase, Cloudflare R2).** A fan project before launch should cost
  nothing to run. One Next.js app holds the pages, the APIs, the cron and the MCP endpoints, so
  there is one deploy and one place to look when something breaks.
- **Lore and MCP read one immutable SQLite file.** The knowledge release is built offline, hashed,
  and read in process. No database server to run, and the site and the MCP server answer from the
  same bytes. A new release is a new file, never an edit.
- **A file bridge, never the game's memory or screen.** The addon writes its save file, and the
  companion reads it and writes answers back as an addon file. That stays inside what Blizzard
  tolerates for addons, and it is why answers appear only after `/reload`.
- **Nothing public until three installs agree.** Every published fact carries how many installs
  reported it and when. A wrong upload, or a lying one, cannot publish a fact on its own.

## Known limits

- Three installs are not proof of three people. An install ID cannot show that two installs
  belong to different players.
- Drop figures are shares of the loot windows players opened, not kill-based drop chances.
- The lore archive is the Warcraft Wiki as of 2023-11-13, with no Forever-specific lore until a
  newer dump is allowed.
- Blizzard's API has no WoW: Forever namespace yet, so character data comes only from the addon.
- Addon 0.2.5 passes its automated tests but has not yet been checked in the live client.
- The companion is an unsigned command-line tool.
- The knowledge release is several hundred megabytes inside a serverless function, so the first
  lore request after a cold start takes a few seconds.

Every source is recorded in [`sources/LEDGER.md`](sources/LEDGER.md). Design history is in
`superpowers/specs/` and `superpowers/plans/`.
