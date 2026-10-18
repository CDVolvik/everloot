# Everloot ecosystem and asset-mapping distillation

**Date:** 2026-10-18  
**Scope:** clean-room product research for WoW: Forever. Public pages and official documentation were inspected for structure, UX, competitor positioning, and licensing boundaries. No competitor rows, guides, screenshots, icons, undocumented endpoints, or bulk exports were imported.

## Executive decision

Everloot should not try to become a copied Wowhead, WoWDB, Warcraft Tavern, or Raider.IO. The strongest position is an **open, evidence-backed data layer for WoW: Forever**:

- player-observed facts from the addon;
- reviewed game-file facts clearly labelled *found in game files, unconfirmed*;
- immutable build/version stamps;
- explicit confidence, disagreement, and freshness data;
- public schemas, reproducible aggregation, CC BY-SA data, and AGPL code;
- the same data available through the website, addon, API, bulk releases, and MCP.

The competitors reveal the product shape players understand. Everloot's advantage is making the evidence and reuse boundary visible.

## What each source contributes to the research

| Source | Strongest observed value | Everloot use | Access boundary |
|---|---|---|---|
| Wowhead database / Forever latest additions | Broad entity taxonomy, filters, relation-page shape, change chronology, community contribution model | UX and coverage checklist; rebuild from own sources | Research/link only; no automated dependency or copied data |
| WoWDB | Familiar item-page fields and legacy profiler precedent | Historical product reference and field checklist | Research only; robots/content signals do not grant reuse |
| Warcraft Tavern Forever | Editorial funnel: guides, news, tools, community, freshness by author/date | Topic coverage checklist and competitor positioning | Research only; terms prohibit copying, public display, and mirroring |
| Raider.IO Forever | Identity/profile/search/recruitment model, addon/client distribution, version and refresh signals | Privacy and contribution-pattern inspiration; not a ranking clone | Research only; API terms prohibit competing services, resale, and out-of-scope scraping |
| WoWDBDefs | Human/machine-readable, build/layout-specific schema definitions; uncertainty annotations; PR validation workflow | Local extraction dependency and schema/versioning model | Component licenses must be preserved; definitions do not license Blizzard data/assets |
| Warcraft Wiki WoWDB article | Historical context: WoWDB profiler and maintenance history | Provenance/history reference | Wiki CC BY-SA applies to the article, not WoWDB's database, code, or assets |
| TradeSkillMaster help | Bounded clipboard import with explicit type, preview-by-implication, and a 1,000-ID cap | Everloot import UX pattern | No permission to copy Wowhead data or automate its site |

## Asset and entity model

### Canonical entity key

Use `(product, build, entity_kind, game_id)` as the stable identity. The numeric game ID is the interoperability key; build-specific records prevent silent overwrites when Forever changes.

Minimum entity fields:

```text
product
build
entity_kind
id
name (when available)
taxonomy_path
icon_file_data_id (when available)
first_seen
last_seen
status
provenance_id
license_class
spoiler
```

Recommended status values:

```text
verified-client
unverified-client
observed
corroborated
disputed
deprecated
```

### Typed relation graph

Use one normalized edge table rather than page-specific joins:

```text
edge(
  from_kind, from_id,
  relation,
  to_kind, to_id,
  evidence,
  build,
  installs,
  first_seen,
  last_seen,
  provenance_id,
  confidence,
  spoiler
)
```

Initial relations:

- `item -> npc/object`: `dropped_by`
- `item -> npc`: `sold_by`
- `item -> quest`: `reward_from`
- `quest -> npc`: `given_by` / `turned_in_to`
- `npc/object -> zone`: `located_in`
- `item -> spell`: `created_by` / `reagent_for`
- `spell -> npc`: `taught_by`
- `item -> item/item_set`: `contained_in` / `member_of`
- `item <-> item`: `same_icon`

Evidence must remain distinct:

- `client`: found in game files, unconfirmed;
- `observed`: player observation meeting Everloot's current corroboration rule;
- `disputed`: conflicting reports retained rather than flattened.

### Asset manifest

Generalize the existing talent-only mapping to an entity-keyed manifest:

```json
{
  "manifestVersion": 2,
  "product": "wow_classic_beta",
  "build": "1.60.1.70450",
  "entities": {
    "item:19019": { "iconFileDataId": 135349 },
    "spell:133": { "iconFileDataId": 135812 }
  },
  "files": {
    "135349": {
      "path": "icons/135349.webp",
      "sha256": "...",
      "bytes": 4821,
      "licenseClass": "blizzard-game-asset"
    }
  }
}
```

Use file-data IDs, not competitor texture names or CDN URLs. Deduplicate by file-data ID. Keep Blizzard assets separate from Everloot's CC BY-SA dataset and AGPL code. Existing policy limits icons and tooltip/art assets to credited pages, not API/MCP/bulk downloads.

## Coverage gaps revealed by the competitor sweep

Everloot currently has item, NPC, quest, zone, and spell concepts. The highest-value additions are:

1. **Object** — herbs, ore, chests, books, fishing pools; especially important for gatherers.
2. **Item set** — enables set membership and appearance/collection relationships.
3. **Profession/skill** — recipe and reagent navigation.
4. **Faction, currency, title, holiday/event** — broadens database completeness.
5. **Creature family / pet** — useful for hunter and collection workflows.
6. **Enchantment** — item/spell relationship coverage.

Use the client's own table definitions and build-specific availability checks. Do not treat a competitor's sitemap as proof that the corresponding Forever table exists.

## Product opportunities

### 1. Evidence-first database pages

Use a familiar header plus relation sections, but add what closed or editorial products do not expose:

- source class;
- build;
- first/last observed;
- number of distinct reporters;
- stale-after policy;
- disagreement history;
- spoiler state;
- link to the underlying evidence class.

### 2. Everloot-native recent changes

Build a `recent changes` view from Everloot's own first-seen/last-seen/build diff records. It should show new, updated, disputed, and retired records without polling Wowhead or WoWDB.

### 3. Forever economy commons

The checked competitor surfaces do not expose a transparent, public Forever auction-observation ledger. Everloot can own:

```text
addon auction scan -> preview/consent -> private raw storage -> thresholded aggregate -> site/API/MCP
```

Keep raw scans private, hash reporter addresses, and publish only privacy-safe aggregates after the existing threshold is met.

### 4. Addon-first contribution loop

A contribution should help the player immediately: local drop history, vendor/recipe lookup, tooltip capture, completion context, or price context. Upload must remain explicit and previewable; public use should not require an account for local-only features.

### 5. Evidence discussion, not a generic forum

Attach correction and disagreement workflows to facts. Preserve revisions and outliers without turning Everloot into an opaque player-score or popularity leaderboard.

### 6. Open interoperability

Publish stable JSON schemas, fixtures, immutable snapshots, aggregation code, and machine interfaces. Keep API/MCP/bulk records free of bulk Blizzard assets and research-only material.

## Import UX to borrow safely

Use the TSM pattern as UX inspiration only:

1. select entity type (item/NPC/quest/spell/etc.);
2. accept bounded clipboard input (document and enforce a cap, such as 1,000 IDs);
3. split on whitespace, commas, and line breaks;
4. deduplicate while retaining original order;
5. preview valid, duplicate, unknown, wrong-type, build-missing, spoiler, and unconfirmed records;
6. show evidence/build/provenance before confirmation;
7. write only after explicit confirmation;
8. return imported/skipped/unknown counts and stable Everloot links.

Never silently truncate or infer an entity type from ambiguous input.

## Open-source and provenance rules

For every extracted table or generated asset, record:

```text
source_id
canonical_url
source_commit or snapshot
product/build/layout hash
extraction method
license class
allowed/prohibited use
attribution text
spoiler state
reviewer
```

Retain the WoWDBDefs commit in extraction manifests even when definitions are not redistributed. If any definitions are redistributed or adapted, preserve the applicable CC BY-SA or BSD-3-Clause obligations at the component level; do not assume the repository has one uniform license.

Add a release gate that rejects `research-only`, `unknown-license`, and `local-only` material from public data releases.

## Hard boundaries

Do not:

- copy Wowhead, WoWDB, Tavern, Raider.IO, or TSM rows, guides, comments, screenshots, UI copy, logos, or branding;
- use their undocumented APIs, XML/JSON tooltip endpoints, CDN URLs, listfiles, or internal page payloads;
- scrape or poll their pages as an Everloot dependency;
- distill Tavern guides or competitor editorial selections into Everloot knowledge;
- treat robots permission as a data license;
- infer that Warcraft Wiki licensing extends to WoWDB or other linked properties;
- place Blizzard game data/assets under Everloot's CC BY-SA or AGPL license;
- publish unreleased/spoiler content without the existing review, labeling, and spoiler controls.

A manual competitor observation may inform a coverage question, but it should be confirmed through Everloot's own game-file or player-observation path before becoming product data.

## Prioritized implementation sequence

### P0 — schema and provenance foundation

- Add build/product/layout/provenance/license fields to entity and edge records.
- Add `game-file-unconfirmed`, `observed`, `corroborated`, and `disputed` handling to API/MCP responses.
- Generalize the asset manifest to entity -> file-data ID.
- Add release checks for research-only and unknown-license sources.

### P1 — coverage and discovery

- Add object pages and object relations.
- Add `ItemClass`, `ItemSubClass`, and `ItemSet` coverage.
- Add a build-stamped recent-changes view driven only by Everloot records.
- Add entity-type-aware clipboard import with preview and deterministic validation.

### P2 — contribution and economy

- Finish the addon observation loop for vendor, trainer, recipe, profession, and auction evidence.
- Add disagreement/correction queues and privacy-safe market aggregation.
- Add immutable public snapshots and reproducible aggregation fixtures.

### P3 — community interoperability

- Add webhooks/feeds for build and market changes.
- Publish contributor dashboards showing useful coverage gaps, not player rankings.
- Revisit partnerships only through human-reviewed permission requests; no agent sends outreach.

## Verification status

- Wowhead/WoWDB taxonomy and terms memo: `docs/2026-10-18-database-taxonomy-research.md`
- Tavern/Raider.IO competitor memo: `research/2026-10-18-warcraft-tavern-raiderio-forever-competitor-analysis.md`
- WoWDBDefs/TSM architecture and licensing memo: produced during this research pass; findings distilled here
- Existing source ledger and data policy remain authoritative: `docs/sources/LEDGER.md`, `docs/DATA_POLICY.md`

This is product research and clean-room design guidance, not legal advice. Any change to data licensing, Blizzard asset publication, or third-party ingestion requires human review before implementation.
