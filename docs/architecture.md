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

Every source is recorded in [`sources/LEDGER.md`](sources/LEDGER.md). Design history is in
`superpowers/specs/` and `superpowers/plans/`.
