# Source maximization deep research — WoW: Forever data landscape

**Date:** 2026-10-18
**Method:** public pages and machine-readable files only (`robots.txt`, `llms.txt`, published OpenAPI), GitHub API metadata, Internet Archive search API, and direct reads of this repository. No page scraping of any site that refuses crawlers; Wowhead and wago.tools were not touched. Builds and counts are quoted as seen, with dates.

## Executive summary

- The seven sources from the brief stay maxed within the legal rails. Nothing further can be taken from Wowhead, WoWDB, Warcraft Tavern, Raider.IO's Forever shell, the TSM guide, or the 2023 wiki dump beyond what the three 2026-10-18 documents already record.
- The largest remaining unlock is not a website. WoWDBDefs' `manifest.json` lists **1,346 client tables** with their `fileDataID`s; our extractor reads about 45 of them. Section 3 lists 45+ enrichment candidates, all read from Blizzard's CDN the same way we already read `ItemSparse`.
- The community grew fast in October: one GitHub search returned 35+ new Forever projects, and four fan databases now compete for the same players — `wow-forever.gg`, `foreverdb.net`, `wowforever.wclbox.com` and `wow-forever.top`. Unlike Wowhead, several of them publish `llms.txt` and open APIs and **explicitly invite AI readers and citation**. None is an import source; they are citation targets, coverage checklists, and competitor benchmarks.
- No newer Warcraft Wiki dump exists: `wiki-warcraft.wiki.gg-20231113` is still the newest archive.org copy. The live wiki's Forever article was edited 2026-10-16, manual reads only.
- New candidates this pass: **CMaNGOS classic-db** (GPL-3.0, active) as a labelled Classic Era baseline for server-side data, and **Forever Hunter Pets** (MIT, data collected in game) as the ecosystem's first import-ready data asset.
- **Structure started.** The professions first wave (`SkillLineAbility`, `SpellReagents`, `ItemClass`, `ItemSubClass`) is now in `CLIENT_TABLES` — uncommitted, 43 tests green, typecheck clean; the next extraction run picks it up. `wow-professions.com/forever` joins the source list as a professions coverage checklist (sections 3.1 and 4).
- **Mechanics reverse-engineered (evening pass).** The companion document `2026-10-18-competitor-mechanics-reverse-engineering.md` records how each competitor actually works — platform, page anatomy, evidence chips, APIs, pipelines, trust models — with a parity matrix against Everloot's existing pieces and the table candidates their page formats reveal (`LFGDungeons`, `DungeonEncounter`, `Journal*`, section 2). New source found: `talentsforever.com` (CC BY 4.0 talent data per wow-forever.top's attribution; licence to verify).

## 1. The seven listed sources — verdicts

| Source | Status today (checked 2026-10-18) | What is left to take |
|---|---|---|
| Wowhead database | robots.txt bans ClaudeBot and ~30 AI crawlers; Fanbyte EULA bars scraping; no public API | Nothing. Link-only stands. `site:` searches surface it; we never fetch it |
| WoWDB | Frozen; profiler last updated 2018, patch 8.1.0; robots `Content-Signal: search=yes,ai-train=no,use=reference`; ~30 AI agents disallowed | Nothing. Research-only reference, field checklist already distilled |
| Warcraft Tavern (Forever) | Terms forbid copying, public display and mirroring | Nothing. Topic checklist already distilled |
| forever.raider.io | Pre-launch shell; API terms ban competing services | Nothing. Privacy/contribution pattern already distilled |
| WoWDBDefs | Active (master pushed 2026-10-16). Data CC BY-SA 4.0, code BSD-3-Clause (read from `LICENSE.md` this pass — the API's `NOASSERTION` is only the multi-licence split) | **The manifest analysis below is the new take.** Already integrated in `THIRD_PARTY.md` |
| TSM help import guide | Clipboard import pattern, 1,000-ID cap | Nothing new. UX pattern already distilled |
| Warcraft Wiki (wowdb article + wiki.gg) | archive.org still holds only the 2023-11-13 dump; `/api.php` and AI bots disallowed on the live wiki; Forever page edited 2026-10-16 | Live sync only if wiki.gg grants permission. Manual page reads remain possible for single facts |

## 2. WoWDBDefs manifest — candidate enrichment tables

`https://raw.githubusercontent.com/wowdev/WoWDBDefs/master/manifest.json` (fetched 2026-10-18, 146 KB) is a flat array of 1,346 entries: `tableName`, `tableHash`, `db2FileDataID`. `stable across builds` holds for the IDs we already read, and the extractor already pins the definitions commit; a table a build does not ship is recorded as missing. All candidates below are licensed as WoWDBDefs data (CC BY-SA 4.0, definitions only — the game data stays Blizzard's, labelled unconfirmed).

**Items and relations**

| Table | fileDataID | Fills |
|---|---|---|
| ItemClass | 1140189 | class names above the subclasses we infer |
| ItemSubClass | 1261604 | weapon/armor subclass names, stat mods |
| ItemSet | 1343609 | set names and set bonuses |
| ItemSearchName | 1273408 | name+quality+level index for every item — search without ItemSparse join |
| ItemEffect / ItemXItemEffect | 969941 / 3177687 | on-use effects, the item→spell edge |
| ItemBonus | 959070 | bonus IDs seen in tooltips and drops |
| ItemLimitCategory | 1237440 | unique-equipped limits |
| ItemCurrencyCost | 801670 | items bought with currencies |
| ItemNameDescription | 1332559 | "Heroic", "of the Bear" suffixes |
| ItemChildEquipment | 1247926 | container contents |
| ItemSpec / ItemSpecOverride | 1135120 / 1134576 | spec restrictions |
| ItemDisenchantLoot | 1134087 | disenchant results |
| RandPropPoints | 1310245 | stat budgets for item generation |
| ItemArmorQuality / ItemArmorShield / ItemDamage* (8 tables) | 1283021 / 1277741 / 1277738-43, 6156256-58 | armor and damage ranges per quality |
| ModifierTree | 1267645 | modifier graphs used by many systems |

**Appearances, collections, cosmetics**

| Table | fileDataID | Fills |
|---|---|---|
| ItemAppearance / ItemModifiedAppearance | 982462 / 982457 | the item→display edge for icons and models |
| TransmogSet | 1376213 | transmog set names and contents |
| Mount / MountXDisplay / MountType / MountCapability | 921760 / 1576117 / 1114674 / 1114709 | mount catalog and models |
| ItemToMountSpell | 942638 | the item→mount edge |
| Toy | 988200 | toy box catalog |
| BattlePetSpecies | 841622 | pets catalog |
| BattlePetTypeModifier | 7871289 | pet battle modifiers |

**Characters, progression, professions**

| Table | fileDataID | Fills |
|---|---|---|
| ChrRaces | 1305311 | races (client-side names, factions, models) |
| CharTitles | 1349054 | the full title list |
| SkillLineAbility | 1266278 | spell↔skill edges (professions, class skills) |
| SpellItemEnchantment | 1362771 | enchant names and effects |
| Faction | 1361972 | reputation factions |
| CurrencyTypes | 1095531 | currencies |
| Achievement / Achievement_Category | 1260179 / 1324299 | the client achievement list (Legacy Challenges live here) |
| Criteria / CriteriaTree | 1263817 / 1263818 | achievement criteria |

**World, creature, world systems**

| Table | fileDataID | Fills |
|---|---|---|
| AreaTable | 1353545 | the zone catalog behind Map/UiMap |
| GameObjects | 841620 | herbs, ore, chests, doors — gathering and interactables |
| Creature | 841631 | client-side creature records (partial; much is server-side) |
| CreatureDifficulty | 879282 | NPC level/classification per difficulty |
| CreatureFamily | 1351351 | hunter pet families, incl. icon |
| CreatureDisplayInfo | 1108759 | model data for NPCs and pets |
| Holidays | 996357 | world events and dates |
| Languages | 1135325 | language names |
| SpellReagents | 841946 | spell reagent requirements |
| SpellTargetRestrictions | 1139993 | target rules |
| QuestV2 | 1139443 | quest IDs and flags (text stays server-side) |

**Group content, journal and map extras** (added by the mechanics pass, 2026-10-18 — these are the formats ForeverDB's dungeon and profession pages imply)

| Table | fileDataID | Fills |
|---|---|---|
| LFGDungeons | 1361033 | group-finder level ranges and dungeon/raid names |
| DungeonEncounter | 1347279 | per-dungeon boss lists |
| JournalInstance / JournalEncounter / JournalTier | 1237438 / 1240336 / 1349056 | encounter journal |
| CreatureModelData | 1365368 | model fileDataIDs (the "Model" section) |
| QuestSort / QuestInfo | 1134585 / 1120960 | quest taxonomy |
| SpellCategory | 1280619 | spell categories |
| ContentTuning | 1962930 | level-scaling metadata behind group content |
| Phase / AreaGroupMember / WMOAreaTable / WorldMapOverlay / ZoneMusic | 1348558 / 1093406 / 1355528 / 1134579 / 1310254 | map and zone enrichment |

`CLIENT_TABLES` in `kb/src/client-snapshot.ts` reads ~45 tables. The professions first wave (`SkillLineAbility`, `SpellReagents`, `ItemClass`, `ItemSubClass`) was added there on 2026-10-18; it feeds the recipe catalog the uploads already model. The remaining candidates above (starting with ItemSet, ItemAppearance, ItemModifiedAppearance, TransmogSet, Mount, MountXDisplay, Toy, BattlePetSpecies, ChrRaces, CharTitles, Faction, CurrencyTypes, CreatureFamily, CreatureDifficulty, GameObjects, AreaTable, Holidays, SpellItemEnchantment, Achievement) roughly double the client catalog without touching the game client — extraction reads the CDN, the same as today.

## 3. New ecosystem finds (2026-10-18 checks)

### 3.1 Fan databases and tools sites

| Site | What it is | Machine posture | Our stance |
|---|---|---|---|
| wow-forever.gg | Database + tools: 22,007 items, 468 talents, 75 flight points, AH prices (3,265 items), dressing room (10,150 items), player census (1,698 players), simulator from 16 recorded sessions; build 1.60.1.70245 as of 2026-10-06 | robots.txt (policy read 2026-09-20) **welcomes** search/AI/assistant crawlers and their training; only SEO-tool crawlers asked out | Competitor benchmark; citation target. Labels claims "Checked in game" vs "From the beta build" — the same split Everloot designed |
| foreverdb.net | Database + guides: 22,318 items, 31,926 spells, 47 dungeons and raids; own addon records player data; "Journey" character timelines; group finder, guild tools, armory, Discord bot | Publishes `llms.txt` and `llms-full.txt`; robots welcomes AI search/assistants; `/api/` disallowed | Same. Its labels ("Speculation", "Classic data (CMaNGOS)") and build stamps (1.60.1.70450, extracted 2026-10-17) are useful sanity references |
| wowforever.wclbox.com (新手盒子, Nanning Xinshoucun Technology) | Bilingual EN/中文 database: 21,254 items (5,530 new, 3,865 changed vs Classic); build 1.60.1.70425, Classic 1.15.9.70003; tracks encrypted-content reveal progress (678 of 2,433 new items revealed) | Publishes `llms.txt`, `llms-full.txt` and an **OpenAPI 3.1 read-only item API** at `/api/open/v1` (search, item tooltip, facets); robots allows `/api/open/` | Cross-check reference for item facts; citation only. Encrypted-content tracking is out of Everloot's scope by policy |
| wow-forever.top | Guides + "source-labeled database", crafted-gear database | Allows all but SEO bots | Citation target |
| wowforeversite.wiki | Unofficial wiki/strategy guide | Allows all | Citation target |
| wow-professions.com/forever | Profession leveling guides 1–300 (alchemy, blacksmithing, cooking, enchanting, engineering, first aid, fishing, leatherworking, tailoring), plus a camping guide and a Merchants' Favor guide; "cheapest way to level, every trainer location" | robots.txt allows reads (blocks only aggressive SEO crawlers, one image and query URLs) | Coverage checklist for the professions lane — which professions and brackets a guide site considers complete; guides are their content, cite, never copy |
| talentsforever.com | Talent calculator, tree builder and build planner (Chris Baldwin) | robots.txt allows reads (personal/account paths excluded) | Candidate source: wow-forever.top credits it as CC BY 4.0 for early class/talent reference data — verify the licence on the site before any use |
| warcraft.wiki.gg — World of Warcraft: Forever | Reference article, edited 2026-10-16 | AI bots disallowed | Manual reads only |

### 3.2 GitHub community harvest

One `topic:wow-forever` search returned 157 repositories; a second returned 35+ fresh ones from the last four days. Notable entries, with the licence as shown by the API:

| Repository | Licence | What it is | Import stance |
|---|---|---|---|
| [TylerAkins/wow-database](https://github.com/TylerAkins/wow-database) | GPL-3.0 | Forever DB collection: ATT exports, QuestieDB imports (owner permission confirmed 2026-10-11), manual/local Wowhead ingestion, own Go CASC extractor, compiled zone bundles with provenance and conflict reports | Reference for tooling and provenance design; not a wholesale import (mixed upstreams) |
| [Jazzman1976/Forever-Hunter-Pets](https://github.com/Jazzman1976/Forever-Hunter-Pets) | MIT (code **and** in-game-collected data, per NOTICE.md) | Hunter pet training data, collected in game by players, each entry with its evidence | **First import-ready data asset**: small, MIT, evidence-shaped. Attribution required |
| cjber/legacy-forever, shortest-path-forever, adventure-guide-forever, skillup-forever, tweaks-forever | GPL-3.0 | Legacy challenges on the map, travel routing, leveling guidance, profession skill-up numbers | GPL-compatible with our AGPL; read for reference, attribution if data is ever imported |
| [Zael98/Zmap](https://github.com/Zael98/Zmap) | GPL-3.0 | World map with dungeons, bosses, routes, quests, vendors, gathering, guild | Reference |
| [zefreestijl/forever_track](https://github.com/zefreestijl/forever_track) | none yet | Map + NPC tracking + Questie data integration | Watch list |
| Torchlite-bit/Aegis_Pathfinder_Forever | MIT | Leveling guide that collects quest and XP data while you play | Confirms the in-addon collection norm |
| Scorplous/wow-forever-character-snapshot | none | SavedVariables snapshots for manual or ChatGPT analysis | Watch list; closest neighbour to our uploader |
| [Topher121/AddonForge](https://github.com/Topher121/AddonForge) | MIT | Open addon manager installing from GitHub, Wago, WoWInterface, TukUI; no ads, no accounts | **Distribution channel** for the Everloot addon, free |
| naowh-gaming/NaowhForever, moust4ki/EasyControllerWowForever | none | Streamer-brand companion addons | Watch |
| fitzforge/polestar | has guide-pack exception | Leveling guides + toolchain — the partner already catalogued | Unchanged |
| Terrorskull/QuickAssist (based on Schnoggo SimpleAssist) | CC BY-NC 3.0 upstream | Target assist addon | **NC licence: never import** |
| Others (MIT unless noted): Brainc3ll/Tessera, KadmaiDev/AltsForever, vBaustad/Skillwright, jdlarssen/SessionScout, wanteddeadordead, studyalwaysbro/godslayer, DukulWoW/BigNoteBox (GPL-3.0), hastecraft/super-tweaks (MPL-2.0), Eldodeldo/EldoUI (Apache-2.0), LightforgeProject/lightforge (GPL-3.0), sandgraal/wowlab (Apache-2.0), mendeleevforever/WaylaidCrateAdvisor + AHLookup, Albert-RC/stats-trimmer, MattJCR/WoW-Forever-Ultimate-Calculator (no licence, non-commercial), mliudev/LoreForever, Antrakt92/StatsPro, GideonWhitlock/wow-forever-addons, DrangedAddons/WebbyFrames, voshond/unit-frames, JeanStiletto/WowVision_Surroundings, Mclarion/MclarionWow, RGX78/wow-forever-hunter, ludes88/wow-forever-kombiguide, quinn-dougherty/forever-vo, buildthehomelab/wow-mod-forever-journal | mixed | tools, UI, guides, data collection | Licences catalogued; anything without a licence is all-rights-reserved and stays reference-only |

### 3.3 Patterns

- **Provenance labels converged.** wow-forever.gg ("Checked in game" / "From the beta build"), ForeverDB ("Speculation" with a reason, "Classic data" labelled) and wclbox (build stamps per page) all independently arrived at the evidence split Everloot's design already specifies. Keeping the label visible per claim is the differentiator none of them expose as data.
- **In-addon collection is the norm.** Pet data, quest markers, XP data, character snapshots — the ecosystem collects in game and ships what it collected. Everloot's upload pipeline is not exotic; two sites now run census addons of their own, so Census-class observation is contested territory.
- **Machine-readable by default.** Three of the five sites publish `llms.txt`; one publishes an OpenAPI. Our MCP server is the counterpart; the difference is that our raw data stays under our CC BY-SA, theirs under their house rules.
- **Nobody reuses Wowhead.** Every project this pass either extracts from the client or collects in game.

## 4. What Everloot needs from each source

Requirements first: for each piece of the product, where Everloot's data actually comes from, and what the sites in this research are allowed to contribute.

| Need | Where Everloot gets it | Sites' role | Boundary |
|---|---|---|---|
| Item facts, field shapes, change history | Own client extraction (`ItemSparse`, `Item`, waves being added) | WowDB/Wowhead memos as page-shape checklists | Never fetch; link only |
| Recipe catalog: profession, skill window, skill-ups, reagents | Client first wave now added (`SkillLineAbility`, `SpellReagents`), confirmed by uploads (`profession-path`, 3-install agreement) | wow-professions for bracket and trainer-location structure; wclbox open API as a read-only cross-check | Guides are their content; cite |
| Profession leveling paths and costs | Own uploads (`profession-path`, `recipe-thresholds`) | wow-professions' guide list is the coverage checklist (including Camping and Merchants' Favor) | Never copy guide text |
| Coverage QA (item, spell, dungeon counts) | Own extraction counts | foreverdb.net (build 70450), wclbox (70425), wow-forever.gg (70245) as independent count signals | Read-only comparison |
| Talents | Client `Trait*` tables (done) | — | — |
| Assets, icons, models | Client files at extraction; entity-keyed manifest v2 (planned) | — | Game art stays Blizzard's, in Everloot storage only |
| Lore | 2023 wiki dump (CC BY-SA, per-page credit) | warcraft.wiki.gg manual reads for single facts | AI crawling disallowed |
| Market prices | Own uploads and auction history | Competitor AH pages as sanity checks only | Cite |
| News and official posts | Blizzard's own posts (`blue-posts.ts`) | — | — |
| Distribution and citation | AddonForge listing; our own site/API/MCP | AI-welcoming sites can cite Everloot back | No data in either direction without a licence |

## 5. Infrastructure re-checks

- **Gethe/wow-ui-source `forever` branch:** sha `172a387e` (2026-10-16) — the 1.60.1.70450 build; unchanged from the memo.
- **simulationcraft/simc `forever` branch:** sha `4dd64b4a` (2026-10-16) — still a port, not a launch source.
- **Emyrk/chronicle:** active (last push 2026-10-18); log-parser lane, no action.
- **archive.org:** newest wiki.gg dump remains `wiki-warcraft.wiki.gg-20231113`. A `wiki-wowpedia.fandom.com-20240917` dump exists; different site and stewardship, not needed. Full `identifier:` sweep done for wiki-warcraft*, wiki-wowpedia*, wiki-wowwiki*.
- **wowdev org inventory:** wow-listfile, TACTKeys (MIT), TACTSharp, DBCD, wow-filetags, pywowlib, etc. Nothing to add; TACTKeys is cipher content, which Everloot skips by policy.
- **Dependencies:** `@rhyster/wow-casc-dbc` is MIT (LiangYuxuan/wow-casc-dbc); we pin 2.16.15, latest is 2.16.17 — routine bump candidate.
- **Local state:** `kb/data/client` does not exist on this machine, so no stale extraction cache; `kb/data/raw` holds the 637 MB wiki dump, `kb/data/release` the 2026-10-16 and 2026-10-05 public releases.

## 6. Recommendations — backlog deltas

- **P1 — table batch (started 2026-10-18).** First wave landed in `CLIENT_TABLES`: `SkillLineAbility` (1266278), `SpellReagents` (841946), `ItemClass` (1140189), `ItemSubClass` (1261604) — uncommitted, tests green, typecheck clean; the next extraction run picks it up. Next waves from section 2: item/appearance tables, then world/characters. Publish as labelled unconfirmed. **Update 2026-10-18 (late): the batch executed as W0–W3** — read set 68 → 276 tables of 1,159, candidates 883; wave log and the drafted "other"-bucket triage live in [the placement note](2026-10-18-client-data-placement.md).
- **P1 — asset manifest v2.** `ItemAppearance`/`ItemModifiedAppearance`/`CreatureDisplayInfo`/`Mount` feed the entity-keyed manifest already designed (`item:19019 → iconFileDataID`), moving icons from talent-only to whole-catalog.
- **P2 — CMaNGOS classic-db as Classic baseline.** GPL-3.0, 414 MB, active (pushed 2026-09-23), covers server-side data the client lacks (loot, quests, NPCs) and is the exact pattern ForeverDB ships as "Classic data". Obligations: GPL-3.0 share-alike on any derived dataset, attribution, and a Carlos decision before adoption.
- **P2 — community contact list.** Jazzman1976 (pet data, MIT), cjber (GPL suite), TylerAkins (tooling and provenance patterns), Topher121 (AddonForge listing as a distribution channel). Outreach stays with Carlos.
- **P2 — cross-check extraction.** After the P1 batch, compare counts (items, spells, dungeons) against ForeverDB's 70450 extraction and wclbox's 70425 pages as an independent sanity signal; cite, never import.
- **P3 — watch list** (no licence yet): zefreestijl/forever_track, Scorplous/wow-forever-character-snapshot, Mclarion/MclarionWow, wow-forever.top's crafted-gear database.

## 7. Open questions for Carlos

1. ~~Commit these four research documents plus the taxonomy supplement (they are untracked / uncommitted in the repo)?~~ Committed 2026-10-18 (`6ae310f` and the scan/placement commits around it).
2. Import the hunter pet data (MIT) as the first third-party data asset with attribution?
3. CMaNGOS classic-db as a labelled Classic baseline — accepting GPL-3.0 obligations on derived data?
4. Is the wiki.gg sync-permission request still pending, or should it be dropped in favour of the 2023 dump + manual reads?
5. talentsforever.com CC BY 4.0 talent data — worth a licence read as a second import candidate (after the hunter-pet data)?
6. Take the parity matrix's "Adopt" rows into the backlog now, or park them until after launch needs?
