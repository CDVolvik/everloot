# Lore archive on everloot.app — design

**Date:** 2026-10-15
**Status:** draft for Carlos's review
**Slice:** 1 of the "build up data and website structure" program (lore surface → knowledge base growth → guides → sharpening pass)

## Why

Production has zero gameplay records: no in-game collection has run since the trust-boundary
rebuild, so every `/database` page shows zero. The one data asset the project already holds, the
Warcraft Wiki 2023 dump in the approved knowledge release (257,110 pages, CC BY-SA 4.0), is served
only through `/mcp` and `/mcp/public`. No website page reads it. Visitors and search engines see an
empty shell.

This slice puts that archive on the site as real, indexable pages and a search page, read from the
same release file with the same read-only checks the MCP uses. It creates the page types later
sources plug into (curated Forever facts, extracted entities, guides).

## What the release holds (measured 2026-10-15 on `2026-10-05-everloot-public.sqlite`)

| Fact | Value |
|---|---|
| `lore_page` rows from `warcraft-wiki-2023`, game version `lore` | 257,110 |
| `lore_page` rows from `curated`, game version `forever` | 1 |
| Rows whose body is 300+ characters and not a redirect | 78,221 |
| Rows whose body is under 200 characters | 150,807 |
| Rows with visible template damage (for example "purchased for at standing") | about 7,400 |
| Redirect rows | 182 |
| Names shared by more than one row | 328 |
| Release file | 338,112,512 bytes |

Each row carries a stable wiki page id in `ext_id`, `name`, a plain-text `body` (wikitext converted,
templates/tables/images removed), `data.categories`, `data.revisionTimestamp`, `source_url`,
`licence`, `retrieved_at`. Full-text search over name and body exists (`entities_fts`) and is used
by `kb/src/search.ts`.

## Guardrails carried from the handoff

- The 2023 dump is labelled **lore archive** everywhere, with its date. It is never presented as
  Forever item stats and never mixed into the Forever database counts.
- Every page shows its source URL, retrieval date and licence (CC BY-SA 4.0 attribution).
- Wowhead stays link-only; the live wiki stays off until wiki.gg replies. This slice adds no source.
- Free services only. Merging to `main` deploys, so the slice ships on a preview first and its
  measurements go in the PR.
- A missing or failed release is **unavailable**, never an empty archive.

## Routes

### `/lore`

Landing page for the archive. Content: what it is (Warcraft Wiki, Internet Archive dump of
2023-11-13), the licence notice from the manifest, the row count per publishable source from the
manifest, a search form posting to `/search`, and a note that this archive predates WoW: Forever,
linking to `/database` for gameplay facts. Static metadata; canonical `/lore`; indexed.

### `/search?q=<query>&page=<n>`

Runs `search()` from `kb/src/search.ts` (exact-name matches first, then bm25) over the release.
20 hits per page, `page` starts at 1, a "Next" link while a further page exists (fetch 21 to know).
Each hit renders: name linked to its lore page, snippet, label `lore · 2023` (or
`forever · curated` for curated rows), and the source domain.

- No `q`: render the form and a one-line explanation. Not indexed (`robots: noindex, follow`).
- `q` longer than 200 characters is truncated to 200 before searching.
- No hits: say so, offer the wiki's own search link for that query. Search result pages are
  never indexed; canonical is `/search`.
- `dynamic = "force-dynamic"`.

The search module already quotes every term, so input can never be read as FTS syntax.

### `/lore/[slug]`

`slug` is `<extId>-<name-slug>`, for example `/lore/291323-frostwhisper`. The leading integer is the
wiki page id (`ext_id`); the rest is `slugify(name)` (lowercase, letters and digits, hyphens, max 80
characters, empty allowed). Lookup is by `ext_id` across publishable sources (`warcraft-wiki-2023`,
`curated`) with `kind = 'lore_page'`; this uses the existing `(source_id, kind, ext_id)` unique index.

- Slug does not start with an integer, or no row has that id: `notFound()`.
- Name part differs from the canonical slug: permanent redirect to the canonical URL.
- Page content, in order: label `Lore archive · Warcraft Wiki, 2023 dump` (or `Lore archive ·
  curated` with game version for curated rows); `h1` name; body rendered as paragraphs (split on
  blank lines) with lines starting ` * ` grouped into `<ul>`; categories as plain labels; last wiki
  revision date from `data.revisionTimestamp` when present; a source block with the wiki URL,
  "retrieved 2023-11-13", "CC BY-SA 4.0", and the sentence "Converted from wikitext with templates,
  tables and images removed, so some sentences may be missing values."; a closing note that the
  archive predates WoW: Forever, linking to `/database`.
- Redirect rows (body contains `REDIRECT`) render their body as-is and are noindexed.
- `revalidate = 86400` (ISR). Content only changes on a new release deploy, which rebuilds anyway.

### Metadata and indexing

- Title: `<name> · Lore archive`. Description: the body's first sentence, cut at 160 characters.
  Canonical: the slug URL.
- **Indexable rule:** body length ≥ 300 characters and body does not contain `REDIRECT`. Indexable
  pages get `robots: index, follow`; everything else `noindex, follow`.
- When the release is unavailable, metadata is `noindex, follow` and the generic title.

### Sitemaps

- `app/sitemap.ts` (static routes) gains `/lore`. `/search` is not listed; result pages are not
  indexed.
- New `app/lore-sitemap.xml/route.ts`: a sitemap index listing `/lore-sitemap/<n>.xml` for
  `n` in `0..ceil(indexable / 40000) - 1`, each with `lastmod` = manifest `createdAt`.
- New `app/lore-sitemap/[n]/route.ts`: one chunk, 40,000 URLs max, selected with
  `WHERE kind='lore_page' AND source_id IN (publishable) AND length(body) >= 300 AND body NOT LIKE
  '%REDIRECT%' ORDER BY id LIMIT 40000 OFFSET n*40000`. Out-of-range `n` is 404. Response
  `Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800`.
- Both routes answer 503 when the release is unavailable.
- `public/robots.txt` lists `Sitemap: https://everloot.app/lore-sitemap.xml` in addition to the
  existing sitemap. `public/llms.txt` gains a "Lore archive" line for `/lore` and `/search`
  under available tools, and a limitation line that the archive is a 2023 snapshot and not Forever
  data.

### Navigation and cross-links

- `Header.tsx` primary nav: Database, **Lore**, Upload, Gold/Hour. The open menu also lists Lore.
- `/database` gets a sixth section card "Lore archive" pointing to `/lore` with one sentence
  that it is the 2023 wiki, not collected Forever data.

## Data access

### `web/src/lib/release.ts` (new, shared)

```ts
export function getRelease(): { db: DB; manifest: Manifest } | null;
```

Opens `process.env.KB_SNAPSHOT_PATH?.trim() || join(process.cwd(), ".release",
"2026-10-05-everloot-public.sqlite")` through `openPublicSnapshot()` once per instance and caches
the handle. On failure it logs once and returns `null`; the next call retries. This is the logic
`mcp-mount.ts` has inline today; `mcp-mount.ts` switches to `getRelease()` so a function that hosts
both the MCP mount and lore pages never hashes the 338 MB file twice. No other behaviour of the
mount changes (its token, origin, uploads and corpus guards stay as they are).

### `web/src/lib/lore.ts` (new)

```ts
export const PAGE_SIZE = 20;
export const INDEXABLE_MIN_BODY = 300;
export function slugify(name: string): string;
export function loreSlug(hit: { id?: number; extId: string; name: string }): string;   // "<extId>-<slug>"
export function parseLoreSlug(slug: string): { extId: string; nameSlug: string } | null;
export function isIndexable(body: string): boolean;
export function renderBody(body: string): Array<{ type: "p"; text: string } | { type: "ul"; items: string[] }>;
export function firstSentence(body: string, max = 160): string;
export function loreByExtId(extId: string): LorePage | null | "unavailable";
export function searchLore(q: string, page: number): { hits: LoreHit[]; hasNext: boolean } | "unavailable";
export function indexableCount(): number | "unavailable";
export function indexableChunk(n: number): Array<{ extId: string; name: string }> | "unavailable";
export function releaseCreatedAt(): string | "unavailable";
```

`LorePage` carries `extId, name, body, categories, revisionTimestamp, sourceUrl, sourceId,
licence, retrievedAt, gameVersion`. `LoreHit` is the existing `SearchHit` plus `extId`: the `ROW` select in
`kb/src/search.ts` gains `e.ext_id AS extId`. The MCP tools ignore the extra field.

### Build configuration

`next.config.js` `outputFileTracingIncludes` gains `/lore`, `/lore/[slug]`, `/search`,
`/lore-sitemap.xml`, `/lore-sitemap/[n]`, each with the same two globs as `/mcp`.

## Failure behaviour

| Situation | Behaviour |
|---|---|
| Release missing, hash mismatch, active sidecar, empty, bad manifest | Both sitemap routes answer 503 with "Lore archive unavailable". `/lore`, `/search` and `/lore/[slug]` render the same copy with `noindex, follow`; a Next page component cannot set an HTTP status, so they answer 200 with that copy and never a count or an empty list |
| `slug` malformed or id unknown | 404 |
| Name part of slug stale | 308 to canonical |
| Query empty | form only |
| Query over 200 characters | truncated |
| Chunk `n` out of range | 404 |

Pages never show a count or a body they did not read from the release.

## Testing

Vitest, in `web/`, following `app/mcp/route.test.ts`: `beforeAll` builds a source DB with
`replaceSourceRows` and exports a release with `snapshot()` into a temp dir; `KB_SNAPSHOT_PATH`
points at it; `vi.resetModules()` between tests so `getRelease()` re-opens.

Fixture rows: one substantive page (body > 300), one stub (body < 200), one redirect, one curated
`forever` row, two rows sharing a name, enough rows to prove paging (21+ hits for one term).

Tests:

- `lore.test.ts`: `slugify`, `loreSlug`/`parseLoreSlug` round trip and rejects; `isIndexable` on
  the three bodies; `renderBody` paragraphs and bullet grouping; `firstSentence` cut;
  `loreByExtId` found / missing / unavailable; `searchLore` paging (`hasNext` true on page 1, false
  on the last) and the 200-character cap; `indexableCount` and `indexableChunk` boundaries.
- `release.test.ts`: `getRelease()` returns the same handle twice; returns `null` and retries after
  a missing file.
- `app/lore/[slug]/page.test.tsx`: `generateMetadata` index on the substantive page, noindex on the
  stub and the redirect, noindex when unavailable; the page renders the source block and the
  "predates Forever" note; stale slug triggers the redirect; unknown id 404.
- `app/search/page.test.tsx`: no query renders the form; a query renders hits with lore links; no
  hits renders the wiki link; unavailable renders the 503 copy.
- `app/lore-sitemap.xml/route.test.ts` and chunk route: index lists the right number of chunks,
  chunk contains only indexable URLs, out-of-range 404, unavailable 503.
- `mcp/route.test.ts` keeps passing after the `getRelease()` switch.

Existing suites (web, kb) stay green; `tsc` clean; `next build` passes locally without a release
(routes answer 503) and on the preview with it.

## Preview verification before merge (numbers go in the PR)

- Cold and warm response time for one lore page and one search.
- Function size for the new routes in the build log, and that the build stays under the large
  functions limit.
- A real search and a real lore page opened in a browser; the canonical redirect; a 404.
- `/lore-sitemap.xml` and `/lore-sitemap/0.xml` return XML with the expected counts.
- Lighthouse on one lore page (performance, accessibility, SEO) from the preview.

## Out of scope for this slice

Category browsing pages, kind or version filters, repairing template damage, merging collected
gameplay facts into `/search`, images, header redesign beyond adding Lore, and any new source.
Those belong to later slices of the program.
