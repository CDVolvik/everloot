# Talent catalog and raid buff table

Two files read out of a client snapshot (`npm run kb -- client-extract`), one set per game build.
Both are game file data: Blizzard's, labelled **found in game files, unconfirmed**, stamped with the
build, kept apart from the CC BY-SA data, and **not published**. The extractor reads only what
Blizzard's CDN serves every player. Encrypted blocks are skipped and counted, never decrypted. See
[DATA_POLICY](DATA_POLICY.md).

```
npm run kb -- client-extract --product wow_classic_beta
npm run kb -- client-catalog data/client/wow_classic_beta-<build>-<config>.sqlite
npm run kb -- raid-buffs-diff <old>/raid-buffs.json <new>/raid-buffs.json
```

Output goes to `data/catalog/<product>-<build>-<config>/`: `talents/<class>.json`,
`talents/index.json` and `raid-buffs.json`. It is not committed by hand; the build watch ([BUILD_WATCH](BUILD_WATCH.md)) commits a copy without tooltip text under `game-data/`, once the data policy allows it. Column names come from
[WoWDBDefs](https://github.com/wowdev/WoWDBDefs) (CC BY-SA 4.0), which also supplies the file data ids
of the tables.

## Talent catalog

The shape is in `kb/src/talents/catalog.ts` (zod schemas; `ClassCatalog` is one class file). The
`schema` field is `everloot.talent-catalog/1`; a change to the shape bumps it.

```
ClassCatalog {
  schema, label, build { product, buildId, version, buildConfig, definitions, extractedAt }
  classId, className, specId, traitTreeId
  pointLevels: number[]            level each talent point arrives at
  trees: Tree[]                    the class's talent trees, in client order
  warnings: string[]
}
Tree { id, name, skillLineId, order, nodes: Node[], edges: Edge[] }
Node {
  id, x, y, row, col               x, y as stored; row, col are ranks of the distinct positions
  kind: "single" | "tiered" | "choice"
  maxRanks
  entries: Entry[]
  prereqs: { nodeId, rule: "any" | "all" }[]
  unlock: { pointsInTree?, ranksInNode?: { nodeId, ranks } }
}
Entry {
  definitionId, spellId, name | null, maxRanks
  iconFileId | null, iconFile: "present" | "encrypted" | "absent" | "unchecked"
  description | null, auraDescription | null      raw client text, $ tokens kept
  effects: { index, basePoints, dieSides, periodMs, chainTargets, miscValue, radiusYards | null }[]
  durationMs | null
}
Edge { from, to, type: "visual" | "sufficient" | "required" | "exclusive" }
```

How the fields are derived, and what is not confirmed:

- **Class.** `SkillLineXTraitTree` links a skill line to the class's trait tree. The skill line's
  `SkillRaceClassInfo.ClassMask` names the class, if exactly one bit is set. Otherwise the tree is
  skipped and a warning says so. `specId` is the class's `ChrSpecialization` row. Forever has no
  specializations, so there is one per class.
- **Trees.** `TraitNodeGroupDisplayInfo` lists three node groups per class tree, with a skill line
  (the tree name) and an order. A node belongs to the tree whose group lists it.
- **Row gates.** Each tree also has smaller node groups, one per row, and each carries a `TraitCond`
  of type "available" with `SpentAmountRequired` (5, 10, 15, 20, 25, 30 in build 70450). A node in
  such a group gets `unlock.pointsInTree` set to that number. Row 0 has no gate. **Unconfirmed:** the
  table does not say whether the points are counted inside the tree or across the whole class. We
  read it as inside the tree, because the gates sit on groups of one tree and the client's talent
  frame shows points spent per group. The addon `talents` selftest will settle it.
- **Rank gate on one node.** A condition tied to a node and naming another node becomes
  `unlock.ranksInNode`. One node has it in build 70450 (a Rogue node). The meaning of that field is
  inferred from the column names.
- **Kind.** `TraitNode.Type`: 0 single, 1 tiered (entries bought in order), 2 choice. No choice node
  exists in build 70450. `maxRanks` is the entry's for single, the sum for tiered, the largest for
  choice.
- **Edges.** `TraitEdge.Type`: 0 visual only, 2 "sufficient for availability" (`prereqs` rule `any`),
  3 "required for availability" (`all`), 4 mutually exclusive. Types 1 and 5 are deprecated in
  WoWDBDefs and are left out and counted in `talents/index.json`. Edges that leave the tree are also
  left out.
- **Names.** The spell name comes from `SpellName` through `TraitDefinition.SpellID`. A name in an
  encrypted block is `null`.
- **Points.** `pointLevels` comes from `TraitCurrencySource` rows for the tree's currency that carry a
  player level and no node entry. Legacy points (a second currency, capped at 16, earned through
  achievements) are not class talent points and are not in the catalog. Their trees are listed in
  `otherTraitTrees` in the index.
- **Icons and text.** For the spell the client shows (`TraitDefinition.VisibleSpellID`, else `SpellID`):
  `iconFileId` is `SpellMisc.SpellIconFileDataID`. The image is never exported. `iconFile` says whether
  that id is in the build's root listing and not flagged encrypted (a lookup only, no download); the
  extractor stores the answers in a `FileStatus` table of the snapshot. `description` and
  `auraDescription` are `Spell.Description_lang` and `AuraDescription_lang` as stored. The tokens
  point at the other fields: `$s1` is `effects[0].basePoints` (`$s2` the second), `$d` is
  `durationMs`, `$a1` is `radiusYards`, `$t1` is `periodMs`, `$x1` is `chainTargets`. Rendering the
  tokens is a later step; this file only keeps the inputs. Like everything here it is Blizzard's text and
  stays local until the publish step.
- **Row and column.** Positions in the client are not all on a fixed grid, so `row` and `col` are
  ranks of the distinct `y` and `x` values (values closer than 150 count as one). A column with no
  node in it does not leave a gap.

Nodes are sorted by id, which is the order the client writes them in a loadout string.

## Raid buff table

`raid-buffs.json` (`RaidBuffTable` in `kb/src/raid-buffs.ts`, schema `everloot.raid-buffs/1`). The list
of names is `kb/lists/raid-buffs.yaml`; it holds names only, so the scope of each entry always comes from
the build being read. For each entry the tool finds every spell with that name in `SpellName` that has
an aura-applying `SpellEffect` row (difficulty 0), and records effect, aura, both implicit target ids,
and the largest radius.

`scope` per spell and per entry: `raid`, `party`, `enemy`, `single`, `self`, `area` or `unknown`.
It is set from the effect type when it is an area aura (35 party, 65 raid) and from the implicit target
ids otherwise (20 party, 56 raid, 21 and 25 one target, 1 caster, 6 enemy, 30 or 31 everyone near).
Target ids 20 and 56 were checked against a real change: Classic Era's Battle Shout uses 20 and its
tooltip says "party members", and Forever build 70450 uses 56 and says "party or raid members". Any other
target id is `unknown`, with the raw ids kept. The entry `scope` is the widest reach among its ranked spells
("Rank N"), or among all its spells if none is ranked; `scopes` counts spells per scope, so a rank that
disagrees is visible. `area` ranks low on purpose: "Greater" and "Prayer" casts hand a single-target
buff to many people through a helper spell with the buff's own name, which says nothing about groups.

`raid-buffs-diff` compares two tables and lists entries whose scope changed. A table for each build is
how a change like the 2026-10-16 party-to-raid one shows up.
