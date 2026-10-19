# Where data goes

Decided 2026-10-18. Everloot keeps three tiers, each for one kind of data, and every new dataset is
placed by the rule below before any code is written for it. The point is that when data starts arriving
(uploads, game builds, market scans, the census, keys) nobody has to guess where it lives, who may
write it, who may read it, and how it is protected. Companion to [architecture.md](architecture.md)
(how the parts fit), [DATA_POLICY.md](DATA_POLICY.md) (what we publish) and [ASSETS.md](ASSETS.md)
(the game-file buckets).

## The three tiers

| Tier | Holds | Written by | Read by | Rule |
|---|---|---|---|---|
| **Artifacts** in Cloudflare R2 | Files that are built once and never edited: the knowledge release, per-build game-file tables, icons, raw uploads, corpus snapshots, bulk exports | Offline jobs and the intake route | The site in process, the site at build time, bulk clients | A new version is a new object. Hash-verified where the site depends on it. Egress is free, so files that many clients fetch go here |
| **Live rows** in Supabase Postgres | Small state that changes per request: upload index, grants, suppressions, sessions, API keys, quotas, usage counters | Route handlers through the service role | Route handlers only | Rows, never blobs. Row-level security on every table, no browser-role grants. Fails closed in production |
| **Compute** on Vercel | Pages, APIs, MCP, the two crons | Deploys from `main` | Players, crawlers, assistants | Holds no data of its own. Secrets live in its environment, nowhere else |

GitHub Actions is the batch tier beside them: build watch, the nightly jobs, the changes and ecosystem
feeds. It writes only reviewed generated files into git and, later, artifacts into R2. The maintainer's
laptop is where game files are read; what it produces goes to R2, never to git.

## The placement rule

Ask these in order. The first yes decides.

1. **Is it a credential or a token?** Vercel environment (production), a GitHub Actions secret, or an
   environment file outside any repository on the maintainer's machine. Never a tier, never git, never a doc.
   Names may appear in `.env.example`; values nowhere in the repository.
2. **Is it Blizzard's, read from game files?** The private bucket `everloot-game-data` for facts and
   tooltips, the public bucket `everloot-assets` for art shown on pages. Keyed by product, build and
   config. Unencrypted rows only, extracted by a maintainer, labelled "found in game files, unconfirmed",
   build-stamped, never relicensed. Never Supabase, never git (the committed `web/src/data/game-data/*.json`
   files are our generated layer over it, reviewed in a pull request).
3. **Is it a player's observation from the addon?** Raw upload to the uploads bucket under
   `uploads/<date>/<id>.json`, one index row in Supabase. It becomes public only through the corpus
   snapshot, with install ids removed, and a fact is stated only once three installs agree. Named records
   go public only with the player's own sharing choice or an officer grant that is checked on every read.
   Market scans, the census and every future record kind follow this same path: a kind in the protocol,
   intake checks, raw in R2, rollup in the cron, publication through the release and the APIs.
4. **Is it per-person or per-key state?** Supabase: sessions, grants, suppressions, keys, quotas,
   counters. Keys are stored as a SHA-256 hash with a four-character hint; the token is shown once.
   Quotas are consulted before any body is read. No personal data beyond what the feature needs.
5. **Is it knowledge we build and publish?** The knowledge release: source rows in the `kb` database
   with a ledger entry per source, validated, snapshotted to one SQLite file with a SHA-256 manifest,
   uploaded create-only to R2, downloaded and checked at build. The site, the MCP server and
   `/api/tools` read the same bytes. A change is a new release, never an edit in place.
6. **Is it a third party's licensed data?** Only with a row in `docs/sources/LEDGER.md` naming the
   licence and the credit. CC BY and CC BY-SA sources (the 2023 wiki dump, talentsforever, OpenMap tables)
   enter the `kb` database and the release with credit. Link-only sources (Wowhead, Icy Veins, Questie,
   Warcraft Logs, wowforevertools) are never stored. The live wiki is never synced.
7. **Is it operational state?** Usage counters in Supabase. Small poller state (an ETag, a last-seen
   build) as one object in R2 or a committed generated file, whichever the job already writes. Logs stay
   in Vercel and GitHub; nothing copies them out.
8. **Is it code, configuration or a reviewed generated file?** Git, through a pull request with the
   guards: DCO sign-off, gitleaks, title check, tests.

If none applies, it is probably something we should not hold. Check the "What we refuse" section of
DATA_POLICY.

## Every dataset today and where it sits

| Dataset | Tier | Place | Writes | Public? | Backed up |
|---|---|---|---|---|---|
| Knowledge release (lore, entities, rollups, catalogs) | Artifact | `everloot-uploads` bucket, `knowledge/<release>.sqlite` + manifest | Maintainer release job | Through pages, MCP, APIs | Nightly mirror |
| Raw uploads | Artifact | `everloot-uploads`, `uploads/<date>/<id>.json` | `/api/intake` | No, ever | Nightly mirror |
| Corpus snapshot | Artifact | `everloot-uploads`, `snapshots/corpus.json` | Cron every 10 min | Sanitized copy at `/api/corpus/public` | Nightly mirror |
| Game-file facts and tooltips | Artifact | `everloot-game-data` (private), per build | Maintainer upload | Facts through pages, never the files | Not yet (see gaps) |
| Icons, frames, maps | Artifact | `everloot-assets` (public at assets.everloot.app), per build | Maintainer upload | Yes, art only, with CORS limited to the site | Not yet (see gaps) |
| Generated game-data layer, talents, raid, map JSON | Git | `web/src/data/game-data/`, `web/src/data/talents/` | Build watch and maintainers by PR | Yes through pages | Git |
| Upload index, waitlist | Live rows | `uploads`, `waitlist` | Intake, sign-up | No | Nightly dump + offsite S3 |
| Grants, suppressions | Live rows | `publication_grants`, `character_suppressions` | Sharing routes | Govern what is public | Nightly dump + offsite S3 |
| Quotas, usage, keys | Live rows | `intake_quota_buckets`, `usage_counters`, `api_keys`, `api_key_usage` | Guard and metrics | No; `/status` shows aggregates | Nightly dump + offsite S3 |
| Changes and ecosystem feeds, blue posts | Git + artifact | Generated files by the scheduled workflows | Actions | Yes | Git |
| Protocol package | Git + npm | `packages/protocol`, committed `dist/` and `schema/` | PR; publish by hand | Yes | Git |

Coming datasets, placed now so the code is written to the right spot:

| Dataset | Tier | Place |
|---|---|---|
| Market scans and sale ledgers | Observation (rule 3) | Record kinds in the protocol, raw in R2, rollups in the release; a per-day price object in R2 for bulk |
| Census (`population`) | Observation (rule 3) | Record kind, raw in R2, published at the 10-character and 3-install threshold through the release |
| Talent loadouts shared by players | Nothing stored | The code is the URL; nothing server-side |
| Trait tables, spell effects per build | Blizzard's (rule 2) | Private bucket per build; the reviewed JSON layer in git |
| Sign-in accounts and sessions | Live rows (rule 4) | Supabase, as the sign-in spec describes |
| Bulk exports for datasets (JSON, CSV) | Artifact (rule 5) | R2, one object per release and kind, linked from `/connect` |

## Security, tier by tier

What is in place is stated as a fact; what is not is in the gaps list.

**R2.** Three buckets, one purpose each, and the code refuses a private bucket that is the public one.
Tokens are scoped per bucket and permission: an upload token with read and write on the two game buckets,
a site token with read only on the private bucket (in Vercel production), a backup token with read only on
the uploads bucket. The release is uploaded create-only and the build refuses a file whose hash does not
match the manifest. The public bucket serves art and its manifest only, with CORS limited to the site.
Objects are keyed by build or by date, so nothing is overwritten.

**Supabase.** Every table has row-level security and no browser-role grants; the service role key exists
only in Vercel's server environment and in the backup machine's env file. API keys are hashed before they
are stored. Quotas and the data guard fail closed in production when the database is unreachable. A
nightly dump runs, with a restore rehearsal done once and an offsite copy to S3 verified by checksum.

**Vercel.** Secrets live only in the project environment. The crons accept only their bearer secret.
Every response carries HSTS, `X-Frame-Options`, a referrer policy and a report-only CSP. Data routes go
through one guard with per-IP and per-key quotas and answer with attribution headers. Pages and the
MCP server never see the raw upload or the index.

**GitHub.** Gitleaks scans every commit and DCO sign-off is required. The build-watch workflow keeps its
write token in a job that installs no packages and parses no downloaded file. Scheduled workflows run
read-only tokens. Nothing in the repository holds a value from any environment.

**Game files and the laptop.** Only unencrypted tables and files are read; the two key-material tables
are hard-coded as never-read. Raw game files and the local SQLite databases stay gitignored on the
maintainer's machine. What leaves is the reviewed output, uploaded to the buckets.

**Players.** Install ids never leave the server. Named data appears only by the player's own choice or
an officer grant that can be revoked, with suppression per character. Removal and the sharing rules are
in DATA_POLICY. Security reports go through the private channel in SECURITY.md.

## Gaps, in order of importance

1. **Game buckets are not in the nightly mirror.** The backup token covers `everloot-uploads` only.
   Add read-only scope for `everloot-game-data` and `everloot-assets`, or accept that both are
   re-creatable from the client and document that.
2. **The backup's schema capture fails** (management token rejected), so dumps are rows only. Fix the
   token; a restore today would need the migrations folder to rebuild the schema, which works but is a
   manual step.
3. **Branch protection on `main`** (required checks, no force push) is assumed, not verified in this
   document. Confirm it in the repository settings.
4. **Spend limit and alerts on Vercel** are not set. The plan itself is inferred from the ten-minute
   cron. Confirm both in billing before launch.
5. **The CSP is report-only.** Enforce it once the ads and analytics origins have been seen in reports.
6. **Nothing sits in front of Vercel.** The Cloudflare zone is DNS-only, so there is no WAF or bot rule
   there; Vercel's own firewall is available if abuse appears. The data guard is the current control.
7. **No rotation schedule for tokens.** Write one: R2 tokens, the cron secret, the MCP bearer token, the
   backup keys, with a date each.
8. **R2 versioning or object lock is not enabled** (unverified). Create-only writes protect the release;
   raw uploads rely on the nightly mirror.

## What this costs

Nothing new. R2 is inside its free allowance, Supabase stays on the free plan by decision, Actions is
free on a public repository, and Vercel is the existing seat plus usage. The triggers that would add a
server, each with the measurement to take first, are in the hosting memo of 2026-10-18 in the shared
Brain; none has fired.
