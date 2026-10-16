# Lore archive: types, facets, template repair and coverage — design

**Date:** 2026-10-15
**Status:** draft for Carlos's review
**Slice:** 2 of the "build up data and website structure" program (lore surface ✔ → **knowledge base growth** → guides → sharpening)
**Builds on:** `2026-10-15-lore-archive-web-design.md` (slice 1, PR #50) and the sharpening pass (PR #51)

## Why

The archive is online but flat: 257,110 pages of one kind with no way to browse NPCs, items or quests,
and about 7,400 pages read like "purchased for at standing" because the importer drops every wiki
template, and the infoboxes that hold item and NPC facts are discarded whole. The wiki's own categories
already sort more than half the archive, infobox template names sort pages even more reliably, and the
inline templates that break sentences are a short, repeatable list. This slice turns infoboxes and
categories into browsable types, facets and stored facts, repairs the sentences, and reports what the
archive covers.

## What was measured (2026-10-15, current release and raw dump)

| Fact | Value |
|---|---|
| Pages whose categories mark them as NPCs or characters | 69,848 |
| Items | 53,919 |
| Quests | 15,146 |
| Spells and abilities | 2,941 |
| Zones and locations | 1,012 |
| Pages no category rule catches | 114,174 |
| Distinct categories | 7,307 |
| Pages with visible template damage | about 7,400 |
| Infobox-style templates in the raw dump (`{{npcbox}}`, `{{#data:itemtip}}`, `{{Infobox faction}}`, `{{Infobox pet ability}}`) | present on typed pages; the generic converter drops them, so their fields (item level, slot, armor, stats, sell price, required reputation; NPC race, creature type, location) are lost today |

## Guardrails

- Every row stays `kind = 'lore_page'`. Types and facets live in the row's `data` JSON, so no MCP
  tool, snapshot check or slice-1 page changes meaning.
- Nothing is inferred beyond the category text. A facet value is the category's own words.
- No new source. The 2023 label stays on every page. Wowhead stays link-only.
- Production changes only when Carlos uploads the new release to R2 and points
  `EVERLOOT_KB_RELEASE_KEY` at it. The site must work unchanged against the current release.
- A missing or failed release is "unavailable", never an empty list.

## Part 1 — Importer

### Infobox capture (`kb/src/importers/wiki-infobox.ts`)

`extractInfobox(wikitext: string): { template: string; fields: Record<string, string> } | null` reads
the first top-level infobox-style template: a name matching `/^(infobox\b.*|npcbox|questbox|zonebox|itembox|#data:itemtip|#data:.*)$/i`.
Named `|key=value` fields are kept with the key lower-cased and the value reduced to plain text
(links `[[a|b]]` → `b`, `{{Race|Human}}` → `Human`, `{{NPC||Name|icon=x}}` → `Name`, `<br />` → `, `,
other templates removed, whitespace collapsed); positional fields and empty values are dropped; at
most 40 fields, each value at most 200 characters. The row stores it as `data.infobox`. Nothing is
interpreted: `ilvl=476` is stored as the string `"476"` under `ilvl`.

### Types (`kb/src/importers/wiki-classify.ts`)

`classify(categories: string[], infoboxTemplate?: string): { type: LoreType; facets: Facets }` where
`LoreType = "npc" | "item" | "quest" | "zone" | "spell" | "other"`.

Rule 0, by infobox template name (lower-cased): `npcbox` → `npc`; `#data:itemtip`, `itembox`,
`infobox item` → `item`; `questbox`, `infobox quest` → `quest`; `zonebox`, `infobox zone`,
`infobox instance` → `zone`; `infobox ability`, `infobox pet ability`, `infobox spell`, `infobox talent`
→ `spell`. Any other infobox name falls through to the category rules.

Category rules then run in this order; the first match wins:

| Order | Type | A category matches (case-insensitive, whole category) |
|---|---|---|
| 1 | `quest` | ends with ` quests` or equals `Quests`, or ends with ` world quests`, ` daily quests` |
| 2 | `npc` | ends with ` characters`, ` NPCs`, ` mobs`, ` bosses`, or equals `Named mobs`, `Bosses`, `Critters`, `Quest givers`, `Quest enders`, `Vendors`, `Flight masters`, `Innkeepers`, `Guards`, `Followers`, or ends with ` vendors`, ` trainers`, ` masters` |
| 3 | `zone` | ends with ` zones`, ` subzones`, ` locations`, ` dungeons`, ` raids`, ` instances`, ` regions`, or equals `Caves`, `Camps` |
| 4 | `spell` | ends with ` abilities`, ` spells`, ` talents`, or equals `Passive abilities`, `Pet battle abilities` |
| 5 | `item` | ends with ` items`, ` drops`, ` rewards`, ` weapons`, ` armor`, ` mounts`, ` gems`, or equals `Keys`, `Chests`, `Tomes`, `Food items`, `Alcoholic beverages`, `Ensembles` |
| 6 | `other` | nothing above matched |

Quests before NPCs because quest pages carry "Quest rewards"-style categories too; NPCs before items
because "Quest givers" pages also sit in reward categories.

### Facets

`Facets = { expansion: string[]; profession: string[]; class: string[]; race: string[]; zone: string[]; faction: string[] }`,
each sorted and de-duplicated, possibly empty:

- `expansion`: a category starting with one of `World of Warcraft`, `The Burning Crusade`, `Wrath of
  the Lich King`, `Cataclysm`, `Mists of Pandaria`, `Warlords of Draenor`, `Legion`, `Battle for
  Azeroth`, `Shadowlands`, `Dragonflight`, `The War Within` followed by a space; the value is that name.
- `profession`: `<Profession> crafted …`, `<Profession> pattern/plan/recipe/design/schematic/technique
  items`, `<Profession> crafting reagent items`, `<Profession> vendors`; value is the profession word.
- `class`: `<Class> characters` for the thirteen class names; value is the class.
- `race`: `<Race> characters` for any other word before ` characters` (e.g. `Orc`, `Night elf`, `Zandalari
  troll`); value is the race as written.
- `zone`: `<Zone> NPCs`, `<Zone> mobs`, `<Zone> quests`, `<Zone> items` where `<Zone>` is the text before
  the suffix; value is the zone as written (e.g. `Nazmir`, `Dalaran (Northrend)`).
- `faction`: `Horde` for categories starting with `Horde `, `Alliance` for `Alliance `, `Neutral` for
  `Neutral `.

The importer stores `data = { categories, revisionTimestamp, type, facets, infobox, damaged }`
(`infobox` omitted when none; `damaged` a boolean from the counter below).

### Template repair (`kb/src/importers/wiki-templates.ts`)

`repairTemplates(wikitext: string): string` runs before the generic conversion. It rewrites a
whitelist of inline templates to their visible text and leaves everything else to the existing
converter (which removes it). Each template on the list has a fixture test; the list grows only with
a test. Initial list, confirmed or corrected by the raw-dump probe before implementation:

Forms confirmed in the raw dump on 2026-10-15 (`Cinch of the Dead Forest's Vigil`, `Kirin Tor Offensive`,
`Resilient Roach`, `Soothing Kiss`):

| Template | Rendered as |
|---|---|
| `{{g}}`, `{{s}}`, `{{c}}` and `{{cost|g|s|c}}` / `{{money|…}}` (`{{cost|300}}` is 300 gold) | `12g 34s 56c` with the digits given, omitting zero parts |
| `{{NPC|Faction|Name|icon=…}}` and `{{NPC||Name}}` (first positional is a faction or empty) | `Name` |
| `{{item|Name}}`, `{{item|quality|Name}}`, `{{quest|Name}}`, `{{spell|Name}}`, `{{zone|Name}}`, `{{ability|Name}}` and `|display text` variants | the display text, else the name (a leading quality or faction word is skipped when a second positional exists) |
| `{{rep|honored}}` / `{{faction standing|Revered}}` | the standing, capitalised (`Honored`) |
| `{{Race|Human}}` | `Human` |
| `{{Patch 5.2.0|note=Added.}}` | `Patch 5.2.0: Added.` |
| `{{Horde icon small}}`, `{{Alliance icon small}}`, `{{Neutral icon small}}`, non-small forms, `{{ss|…}}`, `{{for|…}}`, `{{Stub/…}}`, `{{Removed|…}}` | removed with their surrounding space collapsed |

### Damage counter

The import result gains `damaged: number`: pages whose converted text matches ` for at `, ` at  `,
`  standing` or a double space between two words. The current release measures about 7,400; the
new import must report fewer, and both numbers go in the PR and on the coverage page.

### Manifest

`snapshot()` adds `types: Record<LoreType, number>` and `damaged: number` to the manifest, computed
from the rows it writes. Older manifests without these keys stay valid; readers treat missing keys as
"not classified".

### Expression index

`snapshot()` creates `CREATE INDEX entities_type_name ON entities(json_extract(data,'$.type'), name COLLATE NOCASE)`
in the release so browse pages page through a type alphabetically without scanning bodies. The
schema check in `public-snapshot.ts` adds this index to its expected entries; a release without it
still opens (the check lists it as optional) so the current release keeps working.

## Part 2 — Release pipeline

Commands exist already; no CLI change:

1. `import-wiki <dump> --limit 20000 --db data/scratch.sqlite` — trial, one full pass (~1 h). Inspect
   `type` counts and a sample of repaired sentences.
2. `import-wiki <dump> --db data/wowvault-kb.sqlite` — full two-pass import on the working DB.
3. `import-curated --db data/wowvault-kb.sqlite`.
4. `snapshot data/release/<YYYY-MM-DD>-everloot-public.sqlite --db data/wowvault-kb.sqlite`.
5. `validate` on the source DB; `openPublicSnapshot` on the release (the serve commands do this).

Owner step after review: upload the release and manifest to R2 under `knowledge/<name>` (create-only),
set `EVERLOOT_KB_RELEASE_KEY` to that key in Vercel Production, redeploy. Until then production serves
the 2026-10-05 release and the new pages degrade as described below.

## Part 3 — Site

### Browse pages `/lore/<type>` for `npcs`, `items`, `quests`, `zones`, `spells`

- `/lore/npcs` shows letter tabs `A`–`Z` and `#`, defaulting to `A`. `/lore/npcs?letter=n` lists
  pages of that type whose name starts with that letter (`#` = anything else), ordered by name, 50
  per page with `page=`.
- Facet filters are query parameters: `expansion`, `profession`, `class`, `race`, `zone`, `faction`,
  one value each. The filter bar lists the values present for that type in the release (computed
  once per opened release, like the indexable count).
- Indexing: the letter pages without filters are indexed and listed in a new lore sitemap chunk file
  `/lore-sitemap/pages.xml` (5 types × 27 letters). Any filtered or paged view is `noindex, follow`,
  canonical to the unfiltered letter page.
- Against a release without `type`: the page says the release predates classification, shows no
  tabs, and links to `/search`.
- Unknown type in the URL → 404. A filter value not present → empty list with "No pages match these
  filters" and the filter bar still shown.

### Lore page and search

- The lore page shows its type and each facet as labels linking to the matching browse view
  (`/lore/npcs?zone=Nazmir`).
- `/search` gains a type chip row (All, NPCs, Items, Quests, Zones, Spells) that adds `type=` to the
  query; `searchLore` filters with `json_extract(data,'$.type') = ?` when set.

### `/lore/coverage`

Counts by type (manifest), facet families with their top ten values, indexable pages, damaged pages
in this release and in the previous one (both numbers written into the manifest by the snapshot
step as `damaged` and `damagedPrevious` when a previous manifest path is given), release date and
data age, and the standing statement that the archive is the 2023 wiki, not Forever data. Indexed,
canonical `/lore/coverage`, linked from `/lore`.

## Failure behaviour

| Situation | Behaviour |
|---|---|
| Release unavailable | every new page renders "Lore archive unavailable" with `noindex`; the new sitemap chunk answers 503 |
| Release has no `type` data | browse pages explain and link to search; coverage shows manifest totals only; search chips hidden |
| Unknown type or letter | 404 |
| Unknown facet value | empty list, no error |
| `page` out of range | "No more results" with a link back, as on `/search` |

## Testing

- `wiki-infobox.test.ts`: the four confirmed infobox forms, field cleaning (links, `{{Race}}`, `{{NPC}}`,
  `<br />`), positional and empty fields dropped, the 40-field and 200-character caps, no infobox → `null`.
- `wiki-classify.test.ts`: rule 0 per infobox name, one case per category rule in the table, priority
  cases (quest over npc, npc over item), each facet family with two categories, and the
  empty-category case → `other`.
- `wiki-templates.test.ts`: one fixture per template in the whitelist, nesting inside a sentence, an
  unknown template left for the converter, and the damage counter on before/after text.
- `wiki-dump.test.ts`: the sample fixture gains categories and a money template; the import result
  carries `damaged` and the stored `data.type`.
- `snapshot.test.ts`: manifest `types`/`damaged`, the expression index present, a release built
  without it still opens.
- Web: fixture rows gain `type` and `facets`; tests per browse page (default letter, letter, filter,
  empty filter, paging, 404, pre-classification release, unavailable), lore page facet links, search
  chip filter, coverage page from the manifest, sitemap chunk, metadata and canonical rules.
- Real-dump trial numbers (types, damaged before/after) recorded in the PR.

## Out of scope

Interpreting infobox fields (stat tables, item tooltips, comparisons: the fields are stored as text for a
later slice), images, new sources, changing `kind`, publishing the release to R2, guides.
