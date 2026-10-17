# Lore Types, Facets, Template Repair and Coverage Implementation Plan


**Goal:** Classify every wiki page into a type with facets from its categories, repair the inline templates that break sentences, and give the site browse pages, a search type filter and a coverage report, with a new dated release built locally for Carlos to publish.

**Architecture:** Three pure importer modules (`wiki-infobox.ts`, `wiki-classify.ts`, `wiki-templates.ts`) feed the existing `wiki-dump.ts` importer, which stores `data.type` and `data.facets` and reports a `damaged` count. `snapshot()` adds `types`/`damaged` to the manifest and the schema gains one expression index that the release check treats as optional. On the web, `lore.ts` gains typed browse and facet queries, and five browse routes, a coverage page, a search chip row and one sitemap chunk render from them. Everything degrades to "release predates classification" against the 2026-10-05 release.

**Tech Stack:** TypeScript, better-sqlite3 (json_extract, expression index), wtf_wikipedia for conversion, Next.js 15 App Router, Vitest 5.

**Spec:** `docs/design/specs/2026-10-15-lore-types-and-coverage-design.md`

## Global Constraints

- Rows stay `kind = 'lore_page'`; types, facets and infobox fields live only in `data` JSON (`data.type`, `data.facets`, `data.infobox`, `data.damaged`).
- Infobox name regex: `/^(infobox\b.*|npcbox|questbox|zonebox|itembox|#data:itemtip|#data:.*)$/i`; at most 40 fields, values at most 200 characters, keys lower-cased.
- `LoreType = "npc" | "item" | "quest" | "zone" | "spell" | "other"`; type rule order: quest, npc, zone, spell, item, other.
- `Facets = { expansion: string[]; profession: string[]; class: string[]; race: string[]; zone: string[]; faction: string[] }`, each sorted and de-duplicated.
- `NOTICE` in `kb/src/snapshot.ts` must not change (the current release's manifest must keep matching).
- Browse: 50 names per page; letters `a`–`z` plus `#`; default letter `a`; unfiltered letter pages indexed, anything with filters or `page` is `noindex, follow` with canonical the unfiltered letter URL.
- Unavailable release → "Lore archive unavailable" copy (`UNAVAILABLE_COPY`) and noindex on pages, 503 JSON `{ error: "Lore archive unavailable" }` on route handlers.
- Release without `type` data → pages say "This release predates classification." and link to `/search`.
- Damage patterns: ` for at `, ` at  `, `  standing`, and two spaces between word characters.
- Run `npm test` and the typecheck in the package touched before each commit; run both suites before the PR.
- Tests needing a release build one with `buildLoreRelease()` from `web/src/test/lore-release.ts` (extend it, don't fork it) and `vi.stubEnv("KB_SNAPSHOT_PATH", …)` + `vi.resetModules()` in `afterEach`.

## Review Focus

1. A page in both "Legion world quests" and "Legion world drops": must be `quest` (rule order), facet `expansion: ["Legion"]` once, not twice. Test in Task 1.
2. A category with trailing or odd whitespace, or mixed case ("Named Mobs"): the rule still matches (trim, case-insensitive compare). Test in Task 1.
3. `{{cost|1|50}}` with missing copper, `{{item|Thunderfury|the sword}}` with display text, and a template split across lines: rendered text has no `{{`, no `|`, and single spaces. Test in Task 2.
4. A letter URL like `/lore/npcs?letter=%C3%A9` or `letter=ab`: 404 by rule, never an SQL error. Test in Task 7.
5. A facet value containing `'` or `%` (`Zul'Gurub`, `100% done`): bound as a parameter, exact match, no LIKE. Test in Task 6.

---

### Task 0: Infobox capture

**Files:**
- Create: `kb/src/importers/wiki-infobox.ts`
- Test: `kb/test/wiki-infobox.test.ts`

**Interfaces:**
- Produces: `export interface Infobox { template: string; fields: Record<string, string> } export function extractInfobox(wikitext: string): Infobox | null; export function plainValue(wikitext: string): string` (the field cleaner, reused by Task 2 for link templates).
- Template name is the text after `{{` up to the first `|` or newline, trimmed and lower-cased; the block ends at the matching `}}` counting nested `{{`/`}}`.

- [ ] **Step 1: Write failing tests** using the four raw forms from `%TEMP%\damaged.txt`: `{{npcbox |name=Resilient Roach |race=Roach |creature=Critter |location=[[Dread Wastes]] }}` → `{ template: "npcbox", fields: { name: "Resilient Roach", race: "Roach", creature: "Critter", location: "Dread Wastes" } }`; the `{{#data:itemtip …}}` block → template `"#data:itemtip"` with `ilvl: "476"`, `slot: "Waist"`, `rfaction: "Kirin Tor Offensive"`, `rep: "Honored"`, `sellprice: "250000"`; `{{Infobox faction |races={{Race|Human}}<br />{{Race|High elf}} |leader={{NPC||Jaina Proudmoore|icon=Jaina2}} }}` → `races: "Human, High elf"`, `leader: "Jaina Proudmoore"`; `{{Infobox pet ability |class=[[Warlock]] |cooldown=4 seconds}}` → `class: "Warlock"`; a page whose first template is `{{Removed|patch=4.0.1}}` followed by an infobox still finds the infobox; positional `|Foo` and empty `|tokens=` dropped; 45 fields → 40 kept; a 300-character value cut to 200; `extractInfobox("plain text")` → `null`.
- [ ] **Step 2: Run** `cd kb && npx vitest run test/wiki-infobox.test.ts` → FAIL
- [ ] **Step 3: Implement** with a small scanner (no regex over the whole block) for the brace matching; `plainValue` strips links, renders `{{Race|X}}`/`{{NPC|…}}`/`{{item|…}}` to their name via the same rules Task 2 formalises (Task 2 imports `plainValue` rather than duplicating), removes other templates and tags.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `KB: capture the first infobox of a wiki page as plain fields`

### Task 1: Classifier (infobox name, then categories)

**Files:**
- Create: `kb/src/importers/wiki-classify.ts`
- Test: `kb/test/wiki-classify.test.ts`

**Interfaces:**
- Produces: `export type LoreType = "npc" | "item" | "quest" | "zone" | "spell" | "other"; export const LORE_TYPES: LoreType[]; export interface Facets { expansion: string[]; profession: string[]; class: string[]; race: string[]; zone: string[]; faction: string[] }; export function classify(categories: readonly string[], infoboxTemplate?: string | null): { type: LoreType; facets: Facets }`.
- Rule 0 table (lower-cased template → type): `npcbox` → npc; `#data:itemtip`, `itembox`, `infobox item` → item; `questbox`, `infobox quest` → quest; `zonebox`, `infobox zone`, `infobox instance` → zone; `infobox ability`, `infobox pet ability`, `infobox spell`, `infobox talent` → spell; anything else → fall through.
- Constants: `EXPANSIONS` (the eleven names from the spec), `CLASSES` (Death knight, Demon hunter, Druid, Evoker, Hunter, Mage, Monk, Paladin, Priest, Rogue, Shaman, Warlock, Warrior), `PROFESSIONS` (Alchemy, Blacksmithing, Cooking, Enchanting, Engineering, Fishing, Herbalism, Inscription, Jewelcrafting, Leatherworking, Mining, Skinning, Tailoring).

- [ ] **Step 1: Write failing tests** — rule 0: `classify(["Quest rewards"], "npcbox") → npc`, `classify([], "#data:itemtip") → item`, `classify(["Named mobs"], "Infobox faction") → npc` (falls through to categories), `classify([], "Infobox pet ability") → spell`; then one `test.each` row per category rule in the spec table (e.g. `["Daily quests"] → quest`, `["Named mobs"] → npc`, `["Stormwind City NPCs"] → npc`, `["Caves"] → zone`, `["Passive abilities"] → spell`, `["Food items"] → item`, `[] → other`, `["Game terms"] → other`); priority: `["Quest rewards", "Named mobs"] → npc`, `["Legion world quests", "Legion world drops"] → quest` with `facets.expansion` equal to `["Legion"]`; whitespace/case: `[" named Mobs "] → npc`; facets: `["Leatherworking crafted items", "Jewelcrafting design items"] → profession ["Jewelcrafting", "Leatherworking"]`, `["Warrior characters", "Orc characters"] → class ["Warrior"], race ["Orc"]`, `["Nazmir mobs", "Dalaran (Northrend) NPCs"] → zone ["Dalaran (Northrend)", "Nazmir"]`, `["Horde quests", "Alliance icon"] → faction ["Alliance", "Horde"]`, `["Wrath of the Lich King world drops"] → expansion ["Wrath of the Lich King"]`.
- [ ] **Step 2: Run** `cd kb && npx vitest run test/wiki-classify.test.ts` → FAIL (module not found)
- [ ] **Step 3: Implement** `classify` with the rule tables as data (arrays of `{ type, test: (c: string) => boolean }` and facet extractors), comparing on `c.trim().toLowerCase()`.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `KB: classify wiki pages into types and facets from their categories`

### Task 2: Template repair and damage counter

**Files:**
- Create: `kb/src/importers/wiki-templates.ts`
- Test: `kb/test/wiki-templates.test.ts`

**Interfaces:**
- Produces: `export function repairTemplates(wikitext: string): string; export function countDamage(text: string): number` (number of distinct damage patterns matched, 0 when clean; used as "damaged page" when `> 0`). `export const REPAIRED_TEMPLATES: string[]` (lower-case names handled, for the coverage page and tests).
- Templates handled (spec table, confirmed by the raw-dump scan): `g`, `s`, `c`, `cost`, `money`, `npc` (first positional faction or empty, second the name), `item` (optional leading quality), `quest`, `spell`, `zone`, `ability`, `race`, `rep`, `faction standing`, `patch x.y.z|note=` → `Patch x.y.z: note`, and removed outright: `horde icon`, `horde icon small`, `alliance icon`, `alliance icon small`, `neutral icon`, `neutral icon small`, `ss`, `for`, `stub/*`, `removed`.

- [ ] **Step 1: Write failing tests** — per template: `repairTemplates("purchased for {{cost|300}} at {{rep|honored}} standing") === "purchased for 300g at Honored standing"`, `"{{cost|1|50|0}}" → "1g 50s"`, `"{{cost|||25}}" → "25c"`, `"5{{g}} 3{{s}}" → "5g 3s"`, `"{{NPC|Alliance|Hiren Loresong}} at [[Violet Rise]]" → "Hiren Loresong at [[Violet Rise]]"` (links are the converter's job), `"{{NPC||Jaina Proudmoore|icon=Jaina2}}" → "Jaina Proudmoore"`, `"{{item|Thunderfury}}" → "Thunderfury"`, `"{{item|epic|Thunderfury}}" → "Thunderfury"`, `"{{item|Thunderfury|the sword}}" → "the sword"`, `"{{quest|Return to Sender}}"`, `"{{spell|Fireball}}"`, `"{{Race|High elf}}" → "High elf"`, `"{{faction standing|Revered}}" → "Revered"`, `"* {{Patch 5.2.0|note=Added.}}" → "* Patch 5.2.0: Added."`, `"Sold by {{Horde icon small}} Grex" → "Sold by Grex"`, `"{{ss|Dread Wastes}}\n{{Stub/NPC}}\nText" → "Text"`; a template split across lines `"{{item|\n Thunderfury}}"` → `"Thunderfury"`; an unknown template `"{{Companions|Critter}}"` is left untouched; `countDamage("purchased for at standing") === 2`, `countDamage("A clean sentence.") === 0`, `countDamage("two  spaces") === 1`.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** with one regex per template family, applied repeatedly until no change (max 5 passes) so nesting resolves; collapse the double spaces a removed icon leaves; reuse `plainValue` from Task 0 for the link-template name rule.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `KB: render money, link, race, patch and standing templates to text before conversion`

### Task 3: Importer stores type, facets and damage

**Files:**
- Modify: `kb/src/importers/wiki-dump.ts` (`wikitextToText` calls `extractInfobox` on the raw text, then `repairTemplates`, then the converter; `toRows` stores `data: { categories, revisionTimestamp, type, facets, infobox?, damaged }`; result gains `damaged`)
- Create: `kb/test/fixtures/wiki-templates.xml` (one page "Cinch of the Vigil" with a `{{#data:itemtip |ilvl=476 |slot=Waist}}` block, categories `Sunreaver Onslaught rewards`, `Legion world drops`, body `purchased for {{cost|300}} at {{rep|honored}} standing`; one page "Nazmir Saurid" with `{{npcbox |race=Saurid |location=[[Nazmir]]}}`, categories `Saurid`, `Nazmir mobs`, body plain)
- Test: `kb/test/wiki-dump.test.ts` (append)

**Interfaces:**
- Consumes: `classify`, `repairTemplates`, `countDamage`.
- Produces: `importWikiDump` returns `{ stored, skipped, damaged, dropped }`; stored rows have `data.type` and `data.facets`.

- [ ] **Step 1: Write failing tests** — import the new fixture: `stored === 2`, `damaged === 0`; the Cinch row's body contains `"300g"` and `"Honored"` and not `"for at"`; `JSON.parse(data)` has `type: "item"`, `facets.expansion: ["Legion"]`, `infobox.template === "#data:itemtip"`, `infobox.fields.ilvl === "476"`, `damaged === false`; the Saurid row has `type: "npc"`, `facets.zone: ["Nazmir"]`, `infobox.fields.location === "Nazmir"`. Import the old `wiki-sample.xml`: `JSON.parse(data).type === "item"` (category "Legendary items"), `damaged === 0`.
- [ ] **Step 2: Run** `npx vitest run test/wiki-dump.test.ts` → FAIL
- [ ] **Step 3: Implement.** `wikitextToText` returns `{ text, categories, infobox, damaged: countDamage(text) > 0 }`; `classify(categories, infobox?.template)`.
- [ ] **Step 4: Run** the kb suite → PASS; `npm run typecheck` clean.
- [ ] **Step 5: Commit** `KB: importer stores page type and facets and counts damaged pages`

### Task 4: Manifest counts and the optional expression index

**Files:**
- Modify: `kb/src/db.ts` (SCHEMA gains `CREATE INDEX IF NOT EXISTS entities_type_name ON entities(json_extract(data,'$.type'), name COLLATE NOCASE);` after `entities_name`)
- Modify: `kb/src/snapshot.ts` (`Manifest` gains `types?: Record<string, number>; damaged?: number`; `snapshot()` computes them from the work file: `SELECT json_extract(data,'$.type') AS t, count(*) FROM entities GROUP BY t` with `null → "other"`, and `damaged` = rows whose `data.damaged` is true — so `wiki-dump.ts` must also store `data.damaged: boolean` (add to Task 3's data object); `checkPublishedDb` treats the `index:entities_type_name:…` entry as optional: missing is fine, present must match)
- Modify: `kb/src/public-snapshot.ts` (`readManifest` accepts the new optional keys: `types` an object of numbers, `damaged` a non-negative integer, when present)
- Test: `kb/test/snapshot.test.ts`, `kb/test/public-snapshot.test.ts` (append)

**Interfaces:**
- Produces: `Manifest.types`, `Manifest.damaged`; a release built now carries the index; `openPublicSnapshot` opens both old (no index, no keys) and new releases.

- [ ] **Step 1: Write failing tests** — snapshot: rows with `data` `{type:"npc"}`, `{type:"npc", damaged:true}`, `{type:"item"}`, `{}` → `manifest.types` equals `{ npc: 2, item: 1, other: 1 }`, `manifest.damaged === 1`; `sqlite_master` of the release contains `entities_type_name`. public-snapshot: a release built from a DB whose schema lacks the index (create it with `openDb`, then `DROP INDEX entities_type_name` before `snapshot`) still opens; a manifest with `types: "x"` is rejected; a manifest without the keys opens.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the full kb suite (the snapshot schema check is exercised by many tests) → PASS; typecheck clean. Also run the web suite: `web/src/test/lore-release.ts` builds releases with the new schema; it must still pass unchanged.
- [ ] **Step 5: Commit** `KB: manifest type and damage counts; optional type index in releases`

### Task 5: Web data layer for types, facets and browsing

**Files:**
- Modify: `web/src/lib/lore.ts`
- Modify: `web/src/test/lore-release.ts` (rows gain `data: { categories, type, facets }`: Thrall → `npc`, facets `{ race: ["Orc"], class: ["Shaman"] }`; Zone 1..22 → `zone` with `expansion: ["Legion"]` for odd ids and `["Battle for Azeroth"]` for even; "Return to Sender" 4 → `npc`, 5 → `quest` with `faction: ["Horde"]`; add "Zul'Gurub Eagle" (7, `npc`, `zone: ["Zul'Gurub"]`) and a `100% Done` quest (8, `quest`); Stub and Redirected Road stay untyped)
- Test: `web/src/lib/lore.test.ts` (append)

**Interfaces:**
- Produces:
  - `export const BROWSE_TYPES = { npcs: "npc", items: "item", quests: "quest", zones: "zone", spells: "spell" } as const; export type BrowseSlug = keyof typeof BROWSE_TYPES; export const FACET_KEYS = ["expansion", "profession", "class", "race", "zone", "faction"] as const; export type FacetKey = (typeof FACET_KEYS)[number];`
  - `export const BROWSE_PAGE_SIZE = 50;`
  - `export function parseLetter(raw: string | undefined): string | null` — `undefined → "a"`, `"a".."z"` lower-cased, `"#"` or `"other"` → `"#"`, anything else `null`.
  - `export function hasTypes(): boolean | Unavailable` — `manifest.types` present.
  - `export function browse(type: LoreType, letter: string, filters: Partial<Record<FacetKey, string>>, page: number): { rows: { extId: string; name: string }[]; hasNext: boolean } | Unavailable` — SQL: `json_extract(data,'$.type') = ?` plus for `#`: `lower(substr(name,1,1)) NOT BETWEEN 'a' AND 'z'`, else `name LIKE ? ESCAPE '\'` with the letter and `%`; each filter: `EXISTS (SELECT 1 FROM json_each(json_extract(data, '$.facets.' || ?)) WHERE value = ?)` — the key is validated against `FACET_KEYS` before it reaches SQL and the value is bound; `ORDER BY name COLLATE NOCASE, id LIMIT ? OFFSET ?` fetching `BROWSE_PAGE_SIZE + 1`.
  - `export function facetValues(type: LoreType): Record<FacetKey, string[]> | Unavailable` — memoized per release handle (WeakMap) like the count; SQL `SELECT DISTINCT value FROM entities, json_each(json_extract(data,'$.facets.<key>')) WHERE json_extract(data,'$.type') = ? ORDER BY value` per key.
  - `export function typeCounts(): Record<string, number> | null | Unavailable` — `manifest.types ?? null`.
  - `export function coverage(): { types, damaged, indexable, createdAt, facets: Record<FacetKey, { value: string; n: number }[]> } | Unavailable` — top ten values per facet across all types from one `json_each` query per key, memoized.
  - `searchLore(q, page, type?: LoreType)` — adds `json_extract(e.data,'$.type') = ?` through a new `SearchOptions.where?: { sql: string; params: unknown[] }` on `kb/src/search.ts` (one extra AND clause, bound params).
  - `loreByExtId` returns `type: LoreType | null` and `facets: Facets | null` parsed from `data`.

- [ ] **Step 1: Write failing tests** — `parseLetter` cases incl. `"é"`, `"ab"`, `"A"` → `"a"`; `browse("zone","z",{},1)` returns the 22 zones' first 50 ordered by name with `hasNext false`; `browse("zone","z",{expansion:"Legion"},1)` returns 11; `browse("npc","z",{zone:"Zul'Gurub"},1)` returns the eagle; `browse("quest","#",{},1)` returns `100% Done`; `browse("npc","t",{race:"Tauren"},1)` → `[]`; paging with `BROWSE_PAGE_SIZE` imported (make the fixture's zones 22 and page size respected by asserting `rows.length <= 50`); `facetValues("zone").expansion` equals `["Battle for Azeroth","Legion"]`; `typeCounts()` matches the fixture manifest; `hasTypes()` true; `searchLore("grommash", 1, "zone")` returns zones only and `searchLore("thrall",1,"quest")` returns none; `coverage().damaged === 0` and `coverage().types.zone === 22`; `loreByExtId("1").type === "npc"` and `.facets.race` equals `["Orc"]`; everything `"unavailable"` on a missing release.
- [ ] **Step 2: Run** `cd web && npx vitest run src/lib/lore.test.ts` → FAIL
- [ ] **Step 3: Implement** (`lore.ts` and the `where` option in `kb/src/search.ts`).
- [ ] **Step 4: Run** web suite + `tsc`; kb suite for `search.ts` → PASS
- [ ] **Step 5: Commit** `Web: browse, facet, coverage and typed search queries over the release`

### Task 6: Browse pages

**Files:**
- Create: `web/src/app/lore/[type]/page.tsx` — note: `/lore/[slug]` already exists; Next cannot have two dynamic segments at one level. Rule: rename nothing; instead create `web/src/app/lore/browse/[type]/page.tsx` and expose it at `/lore/npcs` etc. through `next.config.js` `rewrites()` (`/lore/:type(npcs|items|quests|zones|spells)` → `/lore/browse/:type`). The canonical and sitemap URLs use the short form.
- Create: `web/src/components/BrowseFilters.tsx` (plain GET form with one `<select>` per facet key that has values, a hidden `letter`, "Apply" button; no client JS)
- Modify: `web/next.config.js` (rewrites; tracing include for `/lore/browse/[type]`)
- Test: `web/src/app/lore/browse/[type]/page.test.tsx`

**Interfaces:**
- Consumes: `BROWSE_TYPES`, `parseLetter`, `browse`, `facetValues`, `hasTypes`, `loreSlug`, `BROWSE_PAGE_SIZE`, `UNAVAILABLE_COPY`.
- Produces: `generateMetadata` and page with `dynamic = "force-dynamic"`; `searchParams: { letter?, page?, expansion?, profession?, class?, race?, zone?, faction? }`.
- Copy: heading `NPCs and characters` / `Items` / `Quests` / `Zones and locations` / `Spells and abilities`; label `Lore archive · Warcraft Wiki, 2023 dump`; empty filter result "No pages match these filters."; past the end "No more results." with a link to the unfiltered letter page; pre-classification "This release predates classification." linking `/search`.
- Metadata: title `<Heading> starting with <L> · Lore archive`; canonical `/lore/<type>?letter=<l>` (letter `a` → `/lore/<type>`); `robots.index` true only when no filter and no `page`.

- [ ] **Step 1: Write failing tests** — `/lore/browse/zones` default letter renders letter tabs with `href="/lore/zones?letter=b"` and 22 links `/lore/<id>-zone-<n>`; `letter=z&expansion=Legion` renders 11 and `noindex`; `letter=q` for quests renders "No pages match" with the filter form; `letter=ab` → 404; type `mounts` → 404; `page=9` → "No more results"; metadata canonical for default letter is `/lore/zones` and `index true`, for `?page=2` `index false`; unavailable → unavailable copy; a release without `types` (build one with `buildLoreRelease({ typed: false })`, add that option to the fixture builder) → "predates classification".
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** page, component, rewrites, tracing.
- [ ] **Step 4: Run** web suite, `tsc`, and `npx next build` once (rewrites compile) → PASS
- [ ] **Step 5: Commit** `Web: browse the lore archive by type, letter and facet`

### Task 7: Lore page labels, search chips, coverage page

**Files:**
- Modify: `web/src/app/lore/[slug]/page.tsx` (type label linking `/lore/<type-slug>`; each facet value linking `/lore/<type-slug>?<key>=<value>`; hidden when `type` is null; a "Details from the wiki infobox" definition list of `infobox.fields` when present, keys as written, values as text, with the 2023 caveat line)
- Modify: `web/src/app/search/page.tsx` (chip row: All, NPCs, Items, Quests, Zones, Spells as links preserving `q`; `type` param validated against `BROWSE_TYPES`; chips hidden when `hasTypes()` is false)
- Create: `web/src/app/lore/coverage/page.tsx` (`force-dynamic`, indexed, canonical `/lore/coverage`; sections: Types (table from `typeCounts`), Facets (top ten per key), Pages (total from manifest counts, indexable count), Damage (damaged pages in this release; "not measured" when the key is absent), Release (createdAt, data age), the 2023/not-Forever statement)
- Modify: `web/src/app/lore/page.tsx` (links to the five browse pages and to `/lore/coverage` when `hasTypes()`)
- Modify: `web/next.config.js` (tracing for `/lore/coverage`)
- Test: extend `web/src/app/lore/[slug]/page.test.tsx`, `web/src/app/search/page.test.tsx`; create `web/src/app/lore/coverage/page.test.tsx`

- [ ] **Step 1: Write failing tests** — lore page for `1-thrall` contains `href="/lore/npcs"` and `href="/lore/npcs?race=Orc"`, and (give Thrall an `infobox: { template: "npcbox", fields: { race: "Orc", title: "Warchief" } }` in the fixture) a `<dl>` with `<dt>title</dt><dd>Warchief</dd>`; for `2-stub` (untyped) no `/lore/npcs` link; search `q=grommash&type=zone` renders only zone links and the chip row with `href="/search?q=grommash&amp;type=npc"`; `type=mounts` ignored (behaves as All); coverage page contains `zone` row with `22`, `Damaged pages` with `0`, the release date, "not Forever"; coverage unavailable copy; `/lore` contains `href="/lore/npcs"` and `href="/lore/coverage"`.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** web suite, `tsc`, `eslint` on changed files → PASS
- [ ] **Step 5: Commit** `Web: type and facet links, search type chips, lore coverage page`

### Task 8: Sitemap chunk for browse pages and llms.txt

**Files:**
- Modify: `web/src/app/lore-sitemap.xml/route.ts` (index gains `<loc>…/lore-sitemap/pages.xml</loc>` when `hasTypes()`)
- Create: `web/src/app/lore-sitemap/pages.xml/route.ts` (5 types × 27 letters: `/lore/<type>` for `a`, `/lore/<type>?letter=<l>` otherwise, plus `/lore/coverage`; `lastmod` manifest `createdAt`; same headers; 503 when unavailable; 404 when `hasTypes()` is false)
- Modify: `web/public/llms.txt` (lore archive line mentions browsing by NPCs, items, quests, zones and spells and the coverage page)
- Modify: `web/next.config.js` (tracing for `/lore-sitemap/pages.xml`)
- Test: `web/src/app/lore-sitemap/pages.xml/route.test.ts`; extend the index route test

- [ ] **Step 1: Write failing tests** — pages chunk has 136 `<loc>` entries, contains `https://everloot.app/lore/npcs?letter=b` and `https://everloot.app/lore/coverage`, escapes `&`; index lists `pages.xml`; untyped release → 404 on the chunk and no entry in the index; unavailable → 503.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `Web: sitemap chunk for lore browse pages`

### Task 9: Real-dump trial, release build, docs, PR

**Files:**
- Modify: `NEXT_SESSION.md`, `_STATUS.md`, the spec (template table if Task 2 changed it)

- [ ] **Step 1: Trial import** from `kb/`: `node ./node_modules/tsx/dist/cli.mjs src/cli.ts import-wiki data\raw\warcraft.wiki.gg-20231113-history.xml.zst --limit 20000 --db data/scratch-types.sqlite` (run in the background; one full pass, about an hour). Expected: `stored: 20000`, a `damaged` count, and `SELECT json_extract(data,'$.type'), count(*) … GROUP BY 1` showing all six types.
- [ ] **Step 2: Sample repaired sentences**: `SELECT name, substr(body,1,200) FROM entities WHERE body LIKE '%g %s%' LIMIT 5` and the damage patterns; eyeball ten rows. If a template still breaks sentences, add it with a test (Task 2 style) and re-run the trial.
- [ ] **Step 3: Full build** (background, two passes): `import-wiki … --db data/wowvault-kb.sqlite`, `import-curated --db data/wowvault-kb.sqlite`, `snapshot data/release/<YYYY-MM-DD>-everloot-public.sqlite --db data/wowvault-kb.sqlite`, then `node … src/cli.ts validate --db data/wowvault-kb.sqlite`. Expected: manifest with `types` and `damaged`; `damaged` below the 2026-10-05 release's measured ~7,400 (measure the old one with the same patterns via a one-off query and record both).
- [ ] **Step 4: Local serve** `next build` + `next start` with `KB_SNAPSHOT_PATH` at the new release: time `/lore/npcs`, `/lore/npcs?letter=t&race=Orc`, `/lore/coverage`, `/search?q=thrall&type=npc`; confirm the old release still serves `/lore/npcs` with the pre-classification copy.
- [ ] **Step 5: Docs**: START HERE in `NEXT_SESSION.md` gains the publish steps for Carlos (R2 key name, env var, redeploy, expected manifest `types`), the measured numbers, and the branch/PR. `_STATUS.md` one paragraph.
- [ ] **Step 6: PR** against `feat/lore-sharpen` (retarget after merges): title `[Everloot] Lore archive: types, facets, template repair and coverage`, body with spec/plan paths, test counts, trial and build numbers, and the publish steps. Link it with `link_pull_request`. Merging is Carlos's.
