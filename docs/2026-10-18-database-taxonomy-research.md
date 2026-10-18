# How Wowhead and WoWDB map the game, and what Everloot takes from it

Research note, 2026-10-18. Asked for: an analysis of [wowdb.com](https://www.wowdb.com/) and
[wowhead.com/database](https://www.wowhead.com/database) to shape how Everloot maps game entities
and their assets (icons, names, categories, relations), then the same for
[forever.warcraftdb.com](https://forever.warcraftdb.com/) and
[Warcraft Tavern's Forever hub](https://www.warcrafttavern.com/forever/).

**Short version:** none of the four is a data source. Their category trees are Blizzard's own
table ids, which our extractor can read; their relation tabs show the page shape we want; and their
entity lists are a coverage checklist. Everything else stays theirs.

## How this was researched

Clean room, research only (see `docs/sources/LEDGER.md`). No page of either site was fetched.

- **wowdb.com robots.txt**, read 2026-10-18: `Content-Signal: search=yes,ai-train=no,use=reference`;
  `ClaudeBot`, `anthropic-ai`, `GPTBot`, `CCBot` and about 30 other AI agents get `Disallow: /`;
  `/api/`, `/search` and sort, page and filter query URLs are disallowed for everyone.
- **Wowhead**: robots.txt names the AI bots (source catalog, 2026-09-27); data policy says link only.
- What follows comes from search-engine results, public write-ups, and long-standing public
  knowledge of how both sites are organised. It describes **structure**, not data. No rows, text or
  images were copied, and none should be.

Status of the two sites: WoWDB belonged to Curse and then Magic Find with MMO-Champion (acquired
2019-06-11). Its profiler addon has not been updated since patch 8.1.0 (2018), and our catalogue
already marks it stale. Wowhead is the active reference, and `/forever` is a full vertical there.
Neither has a public API.

## The one finding that matters

**Both sites' taxonomy is Blizzard's taxonomy.** Their categories, filters and URLs are the game
client's own enums and table ids, given readable names:

| Wowhead list | What it is underneath |
|---|---|
| Items → Weapons → One-Handed Swords | `Item.ClassID` 2, `Item.SubclassID` 7 (names in `ItemClass` / `ItemSubClass`) |
| Armor → Cloth → Chest | class 4, subclass 1, `InventoryType` 5 (an enum; no table) |
| Quality filter (Poor … Legendary) | `ItemSparse.OverallQualityID` 0-5 |
| NPCs → Beast / Humanoid / Undead … | creature type (`CreatureType`) |
| Rare / Elite / Boss | creature classification |
| Hunter pets → Cats, Wolves … | `CreatureFamily`, which also holds the family icon |
| Spells → Class skills, Talents, Professions, Racials | `SkillLine` and `SkillLineAbility` by category |
| Zones → Eastern Kingdoms → Elwynn Forest | `AreaTable` parent chain, `Map`, `UiMap` |
| Factions, Item sets, Skills | `Faction`, `ItemSet`, `SkillLine` |
| Entity URL `item=19019` | the game's own id |

So Everloot does not need Wowhead to design its categories. The game files already hold them, our
extractor already reads the client, and `ItemSparse`, `Item`, `SkillLine`, `Map` and `UiMap` are in
`CLIENT_TABLES` today. Wowhead's value is the **page shape and the relation graph**, which we can
rebuild from our own data.

Table and field names above are from WoWDBDefs for recent clients. Check each one against the
Forever build's definitions before relying on it.

## The relation graph is the real product

A Wowhead entity page is a header (name, icon, quality, level, category breadcrumb) plus a set of
tabs, and each tab is one typed edge to another entity:

| Edge | From → to | Where Everloot's evidence comes from |
|---|---|---|
| Dropped by | item → npc / object | addon loot windows, 3-install rule (have) |
| Sold by | item → npc | vendor scans (have) |
| Reward from / objective of | item → quest | quest uploads (have) |
| Located in | npc / object → zone, with coordinates | sightings (have) |
| Created by | item → spell | client: `SpellEffect` create-item effect |
| Reagent for | item → spell | client: `SpellReagents`; addon profession scans |
| Taught by / trainer | spell → npc | addon trainer scans (not built) |
| Contained in | item → item / object | addon container loot windows |
| Same icon | item ↔ item | client: shared icon file id |
| Part of set | item → item set | client: `ItemSet` |

Their drop rate is drops divided by times looted, counted by a looter addon. That is the
Thottbot model, and it is ours too. Our edge over them is provenance: every edge says where it came
from (client file or player reports), how many installs agree and how old it is.

**Proposal:** store relations as one edge table instead of per-page joins:

```
edge(from_kind, from_id, rel, to_kind, to_id, evidence, build, installs, first_seen, last_seen)
evidence: 'client' (found in game files, unconfirmed) | 'observed' (3-install rule)
```

Entity pages then become "header + all edges where from = this, grouped by rel". The MCP tool,
REST endpoint and bulk download read the same table, which fits the open-data rule (every dataset
ships MCP, API and bulk).

## Asset mapping

How the references handle icons, and what we do instead:

| Concern | Wowhead / WoWDB | Everloot |
|---|---|---|
| Icon key | icon texture name (e.g. `inv_sword_04`), from the listfile | **file data id**. We use no listfile, so names are unavailable, and the id is the stabler key anyway |
| Sizes | three pre-cut sizes (small, medium, large) | one 64 px lossless WebP as the game stores it; CSS scales it. Add a 32 px cut only if list pages measure slow |
| Entity → icon | joined server-side | a field in the client table: `Item.IconFileDataID`, `SpellMisc.SpellIconFileDataID`, `CreatureFamily.IconFileDataID` |
| Dedupe | one icon file serves many items | the same: `icons/<fileDataID>.webp` already dedupes by construction |
| Tooltips | a tooltip endpoint plus an embeddable script | game text is pages only (decision B); our tooltip would show our fields and link out |

What this means for the existing pipeline (`kb/src/client-assets.ts`, `docs/ASSETS.md`):

1. Make the manifest map **entity to file id**, not talent to file. Shape:
   `{ "item:19019": 135349, "spell:133": 135812 }` plus `files: { "135349": { sha256, bytes } }`.
   Talents become one consumer of that map.
2. Add `ItemClass`, `ItemSubClass` and `ItemSet` to `CLIENT_TABLES`. Then every item gets a
   category path even before any player has seen it, labelled *found in game files, unconfirmed*.
3. Category slugs come from the client's own English names (`ItemSubClass.DisplayName_lang`),
   kept per build, with numeric ids as the real key. URLs can read like Wowhead's
   (`/database/items/weapons/one-handed-swords`) without copying anything of theirs.
4. Keep the same ids as the game. That makes "view on Wowhead" a link built from the id alone
   (`wowhead.com/forever/item=<id>`, pattern to confirm by hand in a browser). This is link-only
   interop and stores nothing of theirs.

## Gaps against their entity list

Ours (`kb/src/entities.ts`): item, npc, quest, zone, spell, plus lore, creator and realm.
Theirs adds: **object** (chests, herbs, ore, fishing pools, books), **item set**, **faction**,
**skill / profession**, **hunter pet family**, class and race. Objects matter most: `DropRateRow`
already carries `sourceObjectId`, but there is no object kind or page. Herbs and ore are what
gatherers search for.

## What not to take

- Their text, guides, comments, screenshots, 3D model viewer or any row of data.
- Their XML or JSON tooltip endpoints, which other catalogues read and we do not.
- Their list of "popular filters". Ours should come from our own search logs.

## Decisions for Carlos

1. **Item icons on item pages.** Decision B covers icons for the talent calculator. Showing item
   and spell icons on `/database` pages extends it to new pages under the same rules (pages only,
   credited, unencrypted files, never in API / MCP / bulk). Yes or no?
2. **Client-derived categories and edges.** Publish item class, subclass, quality and "created by"
   from the game files, labelled unconfirmed, before players confirm them? The data policy allows
   reviewed client data; this would be a new reviewed layer.
3. **Order of work.** Suggested: add the missing client tables (the coverage table under
   forever.warcraftdb.com below) and report what each holds in the current Forever build → edge
   table → item taxonomy from `ItemClass`/`ItemSubClass` → object kind → entity-keyed icon
   manifest.
4. **Lexicon Gaming.** forever.warcraftdb.com and Warcraft Tavern are one network. A partnership
   email (our open API in exchange for permission to cite their facts) is optional; it would be
   drafted for Carlos to review and send, never sent by an agent.

## forever.warcraftdb.com (checked 2026-10-18)

The broadest Forever database found so far. Read once, by hand-run requests: robots.txt, the home
page, the privacy page, the sitemap index, two child sitemaps and one item page.

- **robots.txt:** `User-agent: *` / `Allow: /`, no AI agents named, no Content-Signal, a sitemap.
- **Terms:** none published (`/terms` is a 404; the footer links only a privacy policy).
- **Rights:** footer reads "© 2026 Lexicon Gaming, LLC. All Rights Reserved." No licence, no API,
  no statement of where the data comes from. Partners in the footer: Warcraft Tavern, EIP Gaming,
  GameBanshee, Lexicon, ClassicArmory.
- **Shape:** one platform for several game versions (version selector, a "SoD" label in search),
  pages rendered in the browser from data loaded after the page, entity URLs `/data/<type>/<id>`
  with the game's own ids, a dressing room button. No build number or provenance on the page.
- **Coverage:** the sitemap index lists 21 entity types. From file sizes, roughly 20,000+ item
  pages and about 6,000 NPC pages (estimates; the files were not read to the end).

**Verdict: research only, not a data source.** robots.txt allowing crawlers is not a licence.
With all rights reserved and no terms that grant reuse, nothing from it can go into a CC BY-SA
release, and the README promises Everloot does not scrape other sites. Its in-page data loading is
an undocumented internal API; we do not call it. A reuse permission from Lexicon Gaming would
change this, and would go in the ledger first.

What we take is the **coverage checklist**. Their entity types, and the client tables that hold
the same thing (names from WoWDBDefs, to check against the Forever build):

| Their type | Client table(s) | Ours today |
|---|---|---|
| item | `Item`, `ItemSparse` | read |
| item-set | `ItemSet` | no |
| spell | `Spell`, `SpellName`, `SpellMisc`, `SpellEffect` | read |
| enchantment | `SpellItemEnchantment` | no |
| profession | `SkillLine`, `SkillLineAbility` | `SkillLine` read |
| zone, continent | `AreaTable`, `Map`, `UiMap` | `Map`, `UiMap` read |
| class, race | `ChrClasses`, `ChrRaces` | `ChrClasses` read |
| faction | `Faction` | no |
| title | `CharTitles` | no |
| language | `Languages` | no |
| currency | `CurrencyTypes` | no |
| pet-family | `CreatureFamily` | no |
| event | `Holidays` | no |
| toy, battle-pet | `Toy`, `BattlePetSpecies` | no; check they exist in Forever at all |
| npc | `Creature` (partial; much of it lives on the server) | addon sightings |
| object | `GameObjects` (partial) | addon loot windows (`sourceObjectId`), no page |
| quest | `QuestV2` (ids; text lives on the server) | addon quest uploads |
| pvp | unclear from the name alone | no |

Most of their breadth is client data we can read ourselves with the extractor we already run.
The parts the client does not hold (NPC spawns, quest text, drop rates) are exactly what the addon
collects. Neither path needs their site.

## warcrafttavern.com/forever (checked 2026-10-18)

The guide side of the same network: the footer carries the Lexicon Gaming Network logo, and its
"Database" link goes to forever.warcraftdb.com. So the two are one competitor, not two.

- **robots.txt:** one `*` group; `/forever/` is not disallowed.
- **Terms ([terms of use](https://www.warcrafttavern.com/terms-of-use/), section 2):** a licence
  for "personal, non-commercial transitory viewing only". It forbids modifying or copying the
  materials, any public display, and mirroring them on another server. Michigan law.
- **Shape:** news, class and spec guides with leveling pages, all twelve professions, races
  (including the Forever race Skyborne), dungeon guides with quest pages, beginner guides, a talent
  calculator, and the database link.

**Verdict: research only, stricter than the database.** The terms say no to copying in plain
words, so no import, and no distilling of their guides either. Running their pages through an agent
to rewrite them is still copying their selection and work, and an agent summary is never "our own
words" in the sense the data policy means.

What stays allowed is what the ledger already does for guild facts: a person reads a page, notes a
single game fact (a level cap, that a race or system exists), confirms it in a first-hand source
(the game files, Blizzard's posts, our addon), and cites the first-hand source. Their menu is
useful as a list of topics players need covered.

## Leads not followed up

- A CurseForge author group publishes an addon that exports the `ItemSubClass` table as a Lua
  library. Not needed if we read the table ourselves; noted in case an addon-side lookup helps.

## Supplemental direct-check — 2026-10-18

A later clean-room pass opened only the supplied public pages and a small number of linked policy/robots pages; it did not enumerate pages or call undocumented endpoints.

### Wowhead observations (facts)

- `https://www.wowhead.com/database` describes a broad database hub: items, NPCs, quests, zones, factions, instances, spells, professions/skills, objects, achievements, pets, mounts, titles, currencies, icons and sounds. It explicitly credits community uploads from the Wowhead Client, comments, guides and screenshots.
- The Forever list pages expose human-readable filter URLs and structured list columns. On the observed items page: quality, slot, name, item level, required level, usable-by, match mode, stat weighting, group-by (none/slot/level/source), and columns including changes, versions, side, DPS, speed, source, type and popularity. The page showed 22,673 found with 1,000 displayed, so list output is capped/paginated.
- Observed Forever entity list shapes: items carry ID, name, quality, level/required level, slot, source links, type/subtype and related spell/quest/NPC/zone links; NPCs carry ID, name, level/classification, location, faction/react and creature type; quests carry level/required level, side, rewards, XP, money and category; objects carry location and object type. These are observations of rendered columns, not a license to copy rows.
- `https://www.wowhead.com/forever/latest-additions` groups additions by date and entity kind (items, NPCs, quests, objects, spells), exposes counts, IDs and entity links, and marks list changes such as New, Updated, Unchanged and field-specific changes. It is useful as a competitor UX pattern and manual coverage checklist, not as an ingestion feed.
- Public icon URL patterns are visible in rendered pages (Wowhead/ZAM icon CDN and WoWDB icon CDN), but Everloot should not reuse competitor-hosted assets or treat texture names as a license.

### WoWDB observations (facts)

- `https://www.wowdb.com/items` renders a list with icon URL, item ID/name, item level, required level, inventory slot, armor/type/subtype, and occasional expansion/source labels. An item page also exposes icon, item level, bind status, equip location, required level, flavor text and sell price.
- WoWDB’s public robots file allows ordinary search/reference use for `*` but declares `Content-Signal: search=yes,ai-train=no,use=reference`; it disallows named AI crawlers and disallows `/api/`, `/search`, and many sort/page/filter query variants. This is a strong reason not to build an automated data dependency.
- The public WoWDB pages checked did not expose documented API/export terms. The housing subsite does advertise a user-facing JSON export for its floorplan tool; that is a tool export for user-authored layouts, not a general game-database export and not evidence of permission to reuse database rows.

### API/export and contribution findings (facts)

- Wowhead’s Fanbyte/ZAM EULA covers APIs and says the service license is personal, limited, revocable, non-transferable, non-commercial and non-sublicensable; it prohibits reproducing/distributing the service, commercial/third-party use, datamining, and access/download through spiders, robots, crawlers or data-mining tools rather than ordinary browsers or ZAM-provided agents.
- The same EULA says contributors retain copyright in user content but grant ZAM a broad worldwide, perpetual, royalty-free license; it also grants other users only the access/use permitted by the EULA and site functionality. That does not create a CC BY-SA reuse license for Everloot.
- Wowhead’s public robots file disallows many AI crawlers, including GPTBot, ClaudeBot, anthropic-ai and Scrapy, with a broad `Disallow: /` group. WoWDB’s robots/content signals likewise do not grant data-reuse permission.
- No official public Wowhead bulk export or documented API suitable for Everloot was found in this pass. Search results mentioning third-party “Wowhead APIs” are not official authorization and should not be used.

### Inferences for Everloot (clearly separated)

1. Use the competitors’ **information architecture only**: entity kind, typed relations, filters, change badges, and latest-additions chronology. Rebuild it from Everloot’s own client files and opt-in player observations.
2. Model a canonical entity key as `(build, kind, game_id)` and retain fields for `name`, `icon_file_data_id`, taxonomy path, level/quality/slot where available, source links, and provenance. Keep `observed` and `game-file/unconfirmed` evidence distinct.
3. Add a manual “coverage/change review” view inspired by Latest Additions, but drive it from Everloot’s own first-seen/last-seen/build data. Do not poll Wowhead or WoWDB.
4. Treat Wowhead/WoWDB as research-only link-outs until written permission or an official, compatible license is obtained. Do not store their rows, comments, screenshots, guides, icons, CDN URLs as assets, or undocumented API responses; do not distill their selections into Everloot data.
5. Prefer the existing Everloot plan: game-file facts labeled unconfirmed, player-observed facts under the three-install rule, and Everloot-hosted icons only where the project’s asset policy permits. Keep icons out of API/MCP/bulk if that policy remains in force.

## Sources

- [Wowhead database hub](https://www.wowhead.com/database), checked directly 2026-10-18
- [Wowhead Forever items](https://www.wowhead.com/forever/items), checked directly 2026-10-18
- [Wowhead Forever NPCs](https://www.wowhead.com/forever/npcs), checked directly 2026-10-18
- [Wowhead Forever quests](https://www.wowhead.com/forever/quests), checked directly 2026-10-18
- [Wowhead Forever objects](https://www.wowhead.com/forever/objects), checked directly 2026-10-18
- [Wowhead Forever latest additions](https://www.wowhead.com/forever/latest-additions), checked directly 2026-10-18
- [Wowhead/Fanbyte terms](https://corp.fanbyte.com/legal/terms), checked directly 2026-10-18
- [Wowhead robots.txt](https://www.wowhead.com/robots.txt), checked directly 2026-10-18
- [WoWDB](https://www.wowdb.com/), [items](https://www.wowdb.com/items), and [sample item](https://www.wowdb.com/items/38268-spare-hand), checked directly 2026-10-18
- [WoWDB robots.txt](https://www.wowdb.com/robots.txt), checked directly 2026-10-18
- [WoWDB Housing Hub changelog](https://housing.wowdb.com/changelog), checked directly 2026-10-18
- [TSM help: filtering and importing items from Wowhead](https://tradeskillmaster.helpjuice.com/en_US/tsm-website/how-do-i-filter-and-import-items-from-wowhead)
- [WoWDBDefs](https://github.com/wowdev/WoWDBDefs) for field-name background (not a source of competitor rows)
