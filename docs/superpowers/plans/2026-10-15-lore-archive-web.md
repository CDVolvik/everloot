# Lore Archive Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the approved knowledge release (257k Warcraft Wiki lore pages, CC BY-SA 4.0) on everloot.app as `/lore`, `/search` and `/lore/[slug]` pages with correct indexing, sitemaps and attribution.

**Architecture:** A shared `release.ts` opens the release once per instance with `openPublicSnapshot()`; `lore.ts` wraps lookup, search, slug and indexing rules on top of it; three App Router routes and two sitemap route handlers render from `lore.ts`. The MCP mount switches to the shared open. Every route treats a failed release as 503 "Lore archive unavailable".

**Tech Stack:** Next.js 15.5 App Router, React 19, better-sqlite3 13 (read-only), `kb/src` search and snapshot modules, Vitest 5 with `renderToStaticMarkup`, Tailwind classes already used by the site.

**Spec:** `docs/superpowers/specs/2026-10-15-lore-archive-web-design.md`

## Global Constraints

- Label the dump "Lore archive · Warcraft Wiki, 2023 dump" everywhere; never present it as Forever data or mix it into `/database` counts.
- Every lore page shows: source URL, "retrieved 2023-11-13" (from the row), "CC BY-SA 4.0", and the sentence "Converted from wikitext with templates, tables and images removed, so some sentences may be missing values."
- Indexable rule: `body.length >= 300 && !body.includes("REDIRECT")` (`INDEXABLE_MIN_BODY = 300`).
- `PAGE_SIZE = 20`; search query truncated to 200 characters; sitemap chunk size 40,000.
- Release path: `process.env.KB_SNAPSHOT_PATH?.trim() || join(process.cwd(), ".release", "2026-10-05-everloot-public.sqlite")`.
- Unavailable release → HTTP 503 and the copy "Lore archive unavailable", `robots: noindex, follow`. Never an empty archive or a zero.
- Free services only. No new dependency. Run `npm test` and `npx tsc --noEmit` in `web/` and `npm test` in `kb/` before each commit that touches them.
- Tests that need a release build one in a temp dir with `openDb` + `replaceSourceRows` + `snapshot()` (pattern: `web/src/app/mcp/route.test.ts`), set `KB_SNAPSHOT_PATH` with `vi.stubEnv`, and call `vi.resetModules()` in `afterEach` so the cached handle re-opens.

## Review Focus

1. A slug like `/lore/291323-frostwhisper/` with a trailing slash or `/lore/00291323-frostwhisper` with leading zeros: must redirect to the canonical form or 404, never serve two URLs for one page. Test added in Task 4.
2. A name with only punctuation or non-Latin letters (`"!!!"`, `"Зул'Гуруб"`) slugifies to empty or partial: the slug must still be `<extId>-` or `<extId>-<partial>` and round-trip. Test added in Task 2.
3. A body made entirely of bullets, or with Windows line endings: `renderBody` must not emit empty paragraphs or lose lines. Test added in Task 2.
4. A query made only of stopwords (`"the"`) or with FTS syntax (`"thrall OR *"`) must return results or an honest "no hits", never a 500. Test added in Task 5.
5. `page=0`, `page=-1`, `page=abc`, `page=999999` on `/search`: treat as page 1 for non-positive or non-numeric, and render "no hits" with no "Next" link for a page past the end. Test added in Task 5.

---

### Task 1: Shared release open

**Files:**
- Create: `web/src/lib/release.ts`
- Test: `web/src/lib/release.test.ts`
- Modify: `web/src/lib/mcp-mount.ts` (replace the inline `openPublicSnapshot` block)

**Interfaces:**
- Produces: `export function getRelease(): PublicSnapshot | null` (`PublicSnapshot` from `kb/src/public-snapshot`, `{ db, manifest }`). Caches the handle on success; on failure logs once via `console.error("[release] knowledge release unavailable", err)` and returns `null`; the next call retries.
- Produces: `export const DEFAULT_RELEASE: string` (the path rule from Global Constraints, computed per call so `KB_SNAPSHOT_PATH` stubs work: expose `releasePath(): string` instead of a constant).

- [ ] **Step 1: Write the failing tests** in `release.test.ts`

```ts
test("getRelease returns the same handle twice", ...)   // stub KB_SNAPSHOT_PATH to the temp release; expect(a).toBe(b); expect(a?.manifest.counts.curated).toBe(1)
test("a missing release is null and retried", ...)       // stub to a non-existent path → null twice; console.error called once per attempt
```

- [ ] **Step 2: Run** `npx vitest run src/lib/release.test.ts` → FAIL (module not found)
- [ ] **Step 3: Implement** `releasePath()` and `getRelease()` in `release.ts`.
- [ ] **Step 4: Run** the test → PASS
- [ ] **Step 5: Switch `mcp-mount.ts`** to `const release = getRelease(); if (!release) return unavailable("Knowledge release unavailable");` keeping the token/uploads/corpus guards and all other behaviour. Remove the now-unused `join`/`openPublicSnapshot` imports and `DEFAULT_RELEASE`.
- [ ] **Step 6: Run** `npx vitest run src/app/mcp` → all PASS (both route tests)
- [ ] **Step 7: Commit** `Web: share one release open between MCP mounts and pages`

### Task 2: Lore helpers (pure)

**Files:**
- Create: `web/src/lib/lore.ts` (pure helpers first; DB functions in Task 3)
- Test: `web/src/lib/lore.test.ts`

**Interfaces:**
- Produces:
  - `export const PAGE_SIZE = 20; export const INDEXABLE_MIN_BODY = 300; export const CHUNK_SIZE = 40_000; export const MAX_QUERY = 200;`
  - `export function slugify(name: string): string` — lowercase, `[\p{L}\p{N}]+` runs joined by `-`, ASCII only after NFKD strip of accents, max 80 chars.
  - `export function loreSlug(row: { extId: string; name: string }): string` → `${extId}-${slugify(name)}`.
  - `export function parseLoreSlug(slug: string): { extId: string; nameSlug: string } | null` — wiki ext ids are digits, curated ext ids are kebab strings (`forever-launch-date`). Rule: when the slug starts with `[1-9]\d*` followed by `-` or the end, that prefix is `extId` and the rest after the `-` is `nameSlug`; otherwise the whole slug is `extId` and `nameSlug` is `""`. Reject empty, leading zeros, and any character outside `[a-z0-9-]`.
  - `export function isIndexable(body: string): boolean`
  - `export type BodyBlock = { type: "p"; text: string } | { type: "ul"; items: string[] }; export function renderBody(body: string): BodyBlock[]` — normalise `\r\n`, split on blank lines, consecutive lines starting with ` * ` or `* ` form one `ul`, drop empty blocks.
  - `export function firstSentence(body: string, max = 160): string` — up to the first `. ` or `.\n`, else cut at `max` on a word boundary with `…`.

- [ ] **Step 1: Write failing tests** covering: `slugify("Zeth'Kur") === "zeth-kur"`, `slugify("!!!") === ""`, `slugify("Зул'Гуруб")` round-trips through `loreSlug`/`parseLoreSlug` (ext id preserved, nameSlug may be empty); `parseLoreSlug("291323-frostwhisper")`, `parseLoreSlug("forever-launch-date")` → `{ extId: "forever-launch-date", nameSlug: "" }`, `parseLoreSlug("")` and `parseLoreSlug("291323-Frost whisper")` → null; `isIndexable` on a 299-char body (false), a 300-char body (true), a body containing `#REDIRECT` (false); `renderBody("Intro.\n\n * a\n * b\n\nEnd.")` → p, ul(2), p; a body of only bullets → one ul; `\r\n` endings handled; `firstSentence("One. Two.")` → `"One."`; a 400-char sentence cut ≤160 ending `…`.
- [ ] **Step 2: Run** `npx vitest run src/lib/lore.test.ts` → FAIL
- [ ] **Step 3: Implement** the helpers in `lore.ts`.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `Web: lore slug, body and indexing helpers`

### Task 3: Lore data access

**Files:**
- Modify: `kb/src/search.ts` (`ROW` gains `e.ext_id AS extId`; `SearchHit` gains `extId: string`)
- Modify: `web/src/lib/lore.ts` (add DB-backed functions)
- Test: `web/src/lib/lore.test.ts` (add a `describe("with a release")` block using a temp release)

**Interfaces:**
- Consumes: `getRelease()` from Task 1; `search(db, q, limit)` from `kb/src/search.ts`; `SOURCES` from `kb/src/sources.ts` (publishable ids = entries with `publishable: true`).
- Produces:
  - `export interface LorePage { extId: string; name: string; body: string; categories: string[]; revisionTimestamp: string | null; sourceUrl: string; sourceId: string; licence: string; retrievedAt: string; gameVersion: string }`
  - `export type Unavailable = "unavailable"; export const UNAVAILABLE: Unavailable = "unavailable";`
  - `export function loreByExtId(extId: string): LorePage | null | Unavailable` — SQL `SELECT ... FROM entities WHERE kind='lore_page' AND source_id IN (?, ?) AND ext_id = ? LIMIT 1`.
  - `export function searchLore(q: string, page: number): { hits: SearchHit[]; hasNext: boolean } | Unavailable` — truncate `q` to `MAX_QUERY`; page `< 1` or NaN → 1; call `search(db, q, page * PAGE_SIZE + 1)` and slice `[(page-1)*PAGE_SIZE, page*PAGE_SIZE]`; `hasNext = results.length > page * PAGE_SIZE`.
  - `export function indexableCount(): number | Unavailable` and `export function indexableChunk(n: number, size = CHUNK_SIZE): { extId: string; name: string }[] | Unavailable` — SQL filter `kind='lore_page' AND source_id IN (...) AND length(body) >= 300 AND body NOT LIKE '%REDIRECT%'`, chunk `ORDER BY id LIMIT 40000 OFFSET n*40000`.
  - `export function releaseCreatedAt(): string | Unavailable` — `manifest.createdAt`.

- [ ] **Step 1: Add the fixture builder** at the top of the describe block: rows `{ extId: "1", name: "Thrall", body: 320 chars }`, `{ extId: "2", name: "Stub", body: "Short." }`, `{ extId: "3", name: "Old Name", body: "#REDIRECT [[Thrall]]" }`, curated `{ extId: "forever-launch-date", gameVersion: "forever", ... }`, two rows named `"Return to Sender"` (extIds 4, 5), and 22 rows named `Zone 1..22` whose bodies contain `"grommash"` (extIds 100..121).
- [ ] **Step 2: Write failing tests**: `loreByExtId("1").name === "Thrall"`, `loreByExtId("999") === null`, categories parsed from `data`; `searchLore("grommash", 1)` → 20 hits, `hasNext true`; page 2 → 2 hits, `hasNext false`; page 3 → 0 hits, `hasNext false`; `searchLore("the", 1)` does not throw; `searchLore("thrall OR *", 1)` does not throw; a 500-char query is accepted; `indexableCount()` equals the number of fixture bodies ≥300 without REDIRECT; `indexableChunk(0)` returns them ordered by id, `indexableChunk(5)` → `[]`; with `KB_SNAPSHOT_PATH` pointing nowhere every function returns `"unavailable"`.
- [ ] **Step 3: Run** → FAIL
- [ ] **Step 4: Implement**, including the `kb/src/search.ts` change.
- [ ] **Step 5: Run** `npx vitest run src/lib/lore.test.ts` and `cd kb && npm test` → PASS (kb suite unaffected by the extra column)
- [ ] **Step 6: Commit** `Web: lore lookup, search paging and indexable chunks over the release`

### Task 4: `/lore/[slug]` page

**Files:**
- Create: `web/src/app/lore/[slug]/page.tsx`
- Test: `web/src/app/lore/[slug]/page.test.tsx`
- Modify: `web/next.config.js` (`outputFileTracingIncludes` gains `"/lore/[slug]"` with the same two globs)

**Interfaces:**
- Consumes: `parseLoreSlug`, `loreSlug`, `loreByExtId`, `isIndexable`, `renderBody`, `firstSentence`, `UNAVAILABLE` from Task 2/3.
- Produces: `export const revalidate = 86400; export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata>; export default async function LorePage(props): Promise<JSX.Element>`.
- Behaviour: malformed slug or unknown id → `notFound()`; `nameSlug !== slugify(name)` → `permanentRedirect(`/lore/${loreSlug(row)}`)` from `next/navigation`; unavailable → render an article headed "Lore archive unavailable" with `robots: noindex, follow`. A page component cannot set an HTTP status, so pages answer 200 with that copy; the route handlers (sitemaps) return real 503s. Task 7 records this in the spec's failure table.
- Copy fixed by the spec: label, source block sentence, "This archive predates WoW: Forever. For collected gameplay facts see the Forever database." with a link to `/database`.

- [ ] **Step 1: Write failing tests** (render with `renderToStaticMarkup`, mock `next/link` like `gap-rendering.test.tsx`; mock `next/navigation` `notFound`/`permanentRedirect` to throw sentinel errors):
  - metadata for `1-thrall` → `title: "Thrall · Lore archive"`, `robots.index true`, `alternates.canonical "/lore/1-thrall"`, description from `firstSentence`;
  - metadata for `2-stub` and `3-old-name` → `index false`;
  - page html for `1-thrall` contains the label, `https://example.test/thrall`, `retrieved 2023-11-13`, `CC BY-SA 4.0`, the "missing values" sentence, and the `/database` link;
  - `1-wrong` → `permanentRedirect` called with `/lore/1-thrall`; `1-thrall/` is not a concern (Next strips) but `01-thrall` → `notFound`; `abc` → `notFound`; `999-x` → `notFound`;
  - `forever-launch-date` resolves the curated row and the label says `Lore archive · curated · forever`;
  - unavailable release → html contains `Lore archive unavailable`, metadata `index false`.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** the page and the `next.config.js` entry.
- [ ] **Step 4: Run** → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `Web: /lore/[slug] pages from the knowledge release`

### Task 5: `/search` and `/lore` pages

**Files:**
- Create: `web/src/app/search/page.tsx`, `web/src/app/lore/page.tsx`, `web/src/components/LoreSearchForm.tsx` (plain `<form action="/search" method="get">`, no client JS)
- Test: `web/src/app/search/page.test.tsx`, `web/src/app/lore/page.test.tsx`
- Modify: `web/next.config.js` (add `"/search"`, `"/lore"`)

**Interfaces:**
- Consumes: `searchLore`, `loreSlug`, `getRelease` (for manifest counts/notice on `/lore`), `PAGE_SIZE`.
- Produces: `/search` with `export const dynamic = "force-dynamic"`, `searchParams: Promise<{ q?: string; page?: string }>`; metadata `robots: noindex, follow`, canonical `/search`. `/lore` with `revalidate = 86400`, indexed, canonical `/lore`.
- Copy: `/lore` intro "The Warcraft Wiki as it stood on 13 November 2023, 257,110 pages, CC BY-SA 4.0." — take the count from `manifest.counts` (sum of publishable sources), not a literal; show `manifest.notice`; the "predates Forever" note with the `/database` link. `/search` no-hit copy: "No lore page matches that. Try the wiki's own search:" linking `https://warcraft.wiki.gg/index.php?search=<encoded q>`.

- [ ] **Step 1: Write failing tests**: `/search` without `q` renders a form with `name="q"` and no results list; `q=grommash` renders 20 links to `/lore/100-zone-1`…, a "Next" link to `/search?q=grommash&page=2`; `page=2` has no "Next"; `page=0`, `page=abc` behave as page 1; `page=99` renders the no-hit copy with no "Next"; `q=zzzznotfound` renders the wiki link with the encoded query; unavailable renders `Lore archive unavailable`; `/lore` html contains the count from the fixture manifest (sum of counts), the notice text and the `/database` link; `/lore` unavailable renders the unavailable copy.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** the three files and config.
- [ ] **Step 4: Run** → PASS; `tsc` clean.
- [ ] **Step 5: Commit** `Web: /search over the lore archive and the /lore landing page`

### Task 6: Lore sitemaps, robots, llms.txt, static sitemap

**Files:**
- Create: `web/src/app/lore-sitemap.xml/route.ts`, `web/src/app/lore-sitemap/[n]/route.ts`
- Test: `web/src/app/lore-sitemap.xml/route.test.ts`, `web/src/app/lore-sitemap/[n]/route.test.ts`
- Modify: `web/src/app/sitemap.ts` (add `/lore` to `staticRoutes`), `web/public/robots.txt` (add `Sitemap: https://everloot.app/lore-sitemap.xml`), `web/public/llms.txt` (add tool line "- [Lore archive](https://everloot.app/lore): Warcraft Wiki pages as of 2023-11-13, CC BY-SA 4.0, searchable at /search. Not WoW: Forever data." and a limitation line "- The lore archive is a 2023 snapshot and predates WoW: Forever."), `web/next.config.js` (add the two sitemap routes)

**Interfaces:**
- Consumes: `indexableCount`, `indexableChunk`, `releaseCreatedAt`, `loreSlug`, `CHUNK_SIZE`; `NEXT_PUBLIC_SITE_URL || "https://everloot.app"` as base.
- Produces: `GET` handlers. Index: `<sitemapindex>` with `ceil(count / CHUNK_SIZE)` entries `<loc>${base}/lore-sitemap/${n}.xml</loc><lastmod>${createdAt}</lastmod>`. Chunk: parse `n` from the param `"<n>.xml"` (route folder `[n]` receives `0.xml`; strip the suffix; non-integer or `n >= chunks` → 404), `<urlset>` of `${base}/lore/${loreSlug(row)}` with the same `lastmod`. Headers `Content-Type: application/xml`, `Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800`. Unavailable → 503 JSON `{ error: "Lore archive unavailable" }`.

- [ ] **Step 1: Write failing tests**: index lists exactly 1 chunk for the fixture and the manifest `createdAt`; `0.xml` lists only the indexable fixture pages as `/lore/1-thrall` etc. and none of `2-stub`/`3-old-name`; `1.xml` → 404; `abc.xml` → 404; unavailable → 503 for both. Chunk boundaries are proven in Task 3's `lore.test.ts` by giving `indexableChunk` a second parameter `size = CHUNK_SIZE` and asserting `indexableChunk(1, 2)` starts at the third indexable id; the routes always call it with the default.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** routes and edits.
- [ ] **Step 4: Run** → PASS; `tsc` clean.
- [ ] **Step 5: Commit** `Web: lore sitemap index and chunks; robots and llms.txt list the archive`

### Task 7: Navigation, database cross-link, spec note

**Files:**
- Modify: `web/src/components/Header.tsx` (primary nav gains `<Link href="/lore">Lore</Link>` after Database; the open menu gains a Lore link beside About)
- Modify: `web/src/app/database/page.tsx:20` (`SECTIONS` gains `{ title: "Lore archive", href: "/lore", body: "Warcraft Wiki pages as of November 2023, CC BY-SA 4.0. Lore and history, not collected Forever data." }`)
- Modify: `docs/superpowers/specs/2026-10-15-lore-archive-web-design.md` (failure table: pages render the unavailable copy with noindex; route handlers return 503)
- Test: extend `web/src/app/database/gap-rendering.test.tsx` with one assertion that the database page html contains `href="/lore"`; add `web/src/components/header.test.tsx` asserting the rendered header contains `href="/lore"` (render `<Header />` with `renderToStaticMarkup`; it is a client component but renders statically).

- [ ] **Step 1: Write the two failing assertions**
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Make the edits**
- [ ] **Step 4: Run** full `npm test` in `web/` → all PASS; `npx tsc --noEmit` clean; `npm run build` passes locally (release absent: new routes compile, answer unavailable).
- [ ] **Step 5: Commit** `Web: Lore in the nav and on the database page`

### Task 8: Preview verification and PR

**Files:**
- Modify: `NEXT_SESSION.md` (START HERE: add the lore archive as live-on-preview/merged with its PR number and measurements), `_STATUS.md` (one paragraph under Scope now)

- [ ] **Step 1: Push** `feat/lore-archive`; `gh pr create -R CDVolvik/everloot --base main --title "[Everloot] Lore archive: /lore, /search and lore pages from the knowledge release" --body` describing the slice, the spec path, test counts, and leaving a "Preview measurements" section to fill.
- [ ] **Step 2: Link the PR** with `link_pull_request` and watch checks with `watch_pull_request` (T3 wakes on completion).
- [ ] **Step 3: Measure on the preview URL** with `curl -s -o NUL -w "%{http_code} %{time_total}\n"` twice each for `/lore/291323-frostwhisper` and `/search?q=thrall` (first = cold, second = warm); open `/lore/291323-frostwhisper`, `/lore/291323-wrong` (expect 308 to canonical), `/lore/999999999-x` (404), `/lore-sitemap.xml`, `/lore-sitemap/0.xml` (count lines containing `<loc>`), `/search?q=the`; read the Vercel build log for the function sizes of the new routes. Run a Lighthouse pass on the lore page from the preview (Chrome DevTools or `npx lighthouse` if available; otherwise note it was skipped).
- [ ] **Step 4: Write the numbers** into the PR's "Preview measurements" section and into `NEXT_SESSION.md`; commit the doc change.
- [ ] **Step 5: Stop.** Merging deploys production and is Carlos's call; report the PR link and the measurements.
