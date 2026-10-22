# Recheck cut-off lane closeout — 2026-10-22

Wave 5, lane A: the readers' recheck cut-off from section 5 of the
[coverage and plateau design](design/specs/2026-10-21-coverage-plateau-design.md), the step both wave-4 lanes named
([plateau and spot check](2026-10-22-lane-plateau-spot-check-closeout.md),
[settled list](2026-10-22-lane-settled-list-closeout.md)). A patch can change a fact; while the fact is in recheck the
pages count only the rows captured after the recheck began, so three new installs on a changed value show it instead of
old and new votes making two winning groups and the page showing nothing.

## What was built

**One scope matcher, `kb/src/recheck-scopes.ts`.** `scopeSince(scopes, { types, zones, ids })` returns the latest
`since` among the scopes that cover a fact: a scope covers it when it names one of the fact's types (or none), one of its
zones (or none) and one of its ids (or none). A fact placed in no zone is never covered by a scope that names zones.
Beside it, the placement rule the score already used: `npcZones` (an NPC on the map most installs pinned it on, then any
map it was seen on) and `busiestMap` (ties to the lower id).

- `kb/src/coverage.ts` uses it for `since` and for the NPC zones; its own copies of the loop and of `busiest` are gone.
- `kb/src/coverage-report.ts` uses it for `cutoff`. `--recheck-since` becomes one more scope that names nothing, so it
  still covers every fact and the later date still wins.
- `kb/test/recheck-scopes.test.ts` runs the score and the internal report on one corpus with eight scopes, one per type,
  and checks that they put the same facts in recheck in the same zones.
- `kb/src/settled-list.ts` has a third copy with the same semantics. That file is not this lane's (see "The settled
  list" below).

**`recheckRows` in `kb/src/fact-states.ts`.** The rule `tallyVotes({ recheckSince })` applied, pulled out so the readers
that count installs rather than values can use it: when the rows captured before `since` agreed on one value (three
installs), only the rows captured after it count, and `recheck` is true; otherwise every row counts. A row without a
capture time is in neither part. For a fact that is there or not (a pin, a reward, a role, a listed boss), every row
has one value, so the fact was confirmed before the date when three installs reported it. `tallyVotes` now calls it, and
its output is unchanged (its tests pass as they were).

**The cut-off in the readers.** Each reader takes the scopes and, for a fact a scope covers, counts only what
`recheckRows` (or `tallyVotes` with `recheckSince`) leaves. Without scopes every reader returns exactly what it did:
the full KB suite passed unchanged before any new test was added.

- `kb/src/world-pages.ts`. The row types carry `capturedAt` (set by `worldFactsFromRecords`), and `WorldFacts` carries
  `recheck`. `agreedLabel`, `agreedNumber` and `agreedLabelsById` (new optional `sinceOf(id)`) cut by the fact's scope.
  `npcPage` cuts the name (types `npcs`, and `rares` for a rare) and each map's pin (types `pins`, and `rares`), as the
  score's position does. `npcTraits(rows, recheck)` and `npcRoles(rows, recheck)` cut the traits and each role.
  `questPage` and `questTraits(rows, facts)` cut title, level, giver, turn-in, each reward, category, group size and
  tag, with the quest placed by its leading giver (then turn-in) among `facts.npcs` and named by its rewards' ids.
  `vendorPage` cuts each item whose price was agreed before the date (its stock with it). `agreedNpcNames` and
  `agreedQuestTitles` read `facts.recheck`. NPC zones are computed once per sightings array (a `WeakMap`), so a list
  page stays one pass.
- A quest's side is not one agreed value (Both is two), so it has its own rule, `sideRows`: when the rows before the
  date gave a side, only the rows after count. The score's `side` now uses it too; it ignored scopes before.
- `kb/src/instances.ts`. `confirmedEntrances(rows, asOf, recheck)` cuts each instance's name and type (placed on its
  busiest entrance map, `entranceZones`) and each entrance place (on its own map). `instanceBosses(rows, asOf, recheck,
  entrances)` cuts listed, kills and last seen together, and the name and each boss NPC on their own, with the
  instance, the encounter and its boss NPCs as the scope's ids, as the score names them.
- `kb/src/object-spawns.ts`. `objectSpawns(rows, published, asOf, recheck)` cuts each treasure cluster before it
  becomes a pin; a cluster with no row after the date is neither a pin nor a count. `agreedObjectNames(rows, recheck)`
  cuts each object's name. Loot rows carry no capture time, so they are never cut.
- A fact in recheck is neither confirmed nor settled while it is. In the score, one place forced a treasure pin in
  recheck back to confirmed (the radius check's fallback); it now stays in recheck.

**The pages that read the scopes.** `web/src/lib/recheck-scopes.ts` holds `RECHECK_SCOPES` (moved from
`coverage-compute.ts`, which re-exports it, so the score, the settled list and the plateau read the same list).
`rollup-compute.ts` puts them on the world facts, and the readers' callers pass them on: the NPC page's traits, the
NPC, quest and vendor lists, the sitemap, the map's candidates and observed facts, the zone pages, the instance pages,
the treasure pins and the object names. `kb/src/world-map-near.ts`'s `observedPins` passes `facts.recheck` into
`npcPage` and `vendorPage` (a pass-through; the MCP tool still calls it without scopes).

**The drop rates' cut-off, `kb/src/drop-rollup.ts`.** `lootRecheckSince(records, scopes)` gives each loot source a scope
covers, and `recheckLootRecords(records, scopes)` drops that source's loot-api windows captured at or before the
scope's date. The decision, in full:

- **Per source, never per item.** A rate is the windows holding an item over the source's windows; cutting one item's
  windows and not the others would give one source's items different denominators. A scope that names an item id
  covers every source that dropped it. A source is placed where the score places it: an NPC on its busiest pinned map,
  an object on the map most installs saw it on.
- **Whether or not the rate was public.** Unlike a voted value, old windows are not a different opinion but a sample
  from a table the patch may have changed; mixing them in biases the new rate however few they are.
- **A window without a capture time is left out** for a covered source: it cannot be placed after the date.
- **What it means for a source whose rate was already public:** its rates leave the public pages as soon as the scope is
  committed. The NPC and item pages show the source as a fresh one: "N windows from M installs", no item tied to it,
  until 3 installs loot it after the date. Then the rate is public again, measured on the new windows only, and it
  settles by the usual rule (50 windows from 5 installs and a narrow interval) on those alone. The old windows stay in
  the public corpus and the open data export: nothing is deleted, they just stop counting toward this rate. In the
  score and the internal report the rate is `recheck` until then; a rate that was never public stays `reported`.
- The site applies it to the drop table, the item facts' rates and the loot tables (`rollup-compute.ts`); the corpus
  window count on the pages stays the whole count. `itemFactsFromRecords(records, recheck)` cuts only the rates: object
  names and places from older windows still count.

**The settled list.** `kb/src/settled-list.ts` already leaves out a fact under a recheck scope while it is in recheck:
it tallies with `recheckSince`, so the fact only returns once it settles again on reports after the date. It does not
use the spot check, and it keeps every scoped loot source out until the scope is removed. Both need a change to that
file, which belongs to a merged lane, so it is **not edited here**. The change is written out, applied, tested and
reverted, and is in the appendix for the coordinator.

## Files

- New: `kb/src/recheck-scopes.ts`, `kb/test/recheck-scopes.test.ts`, `web/src/lib/recheck-scopes.ts`,
  `web/src/lib/world-lists.test.ts`, this file.
- Changed (kb): `fact-states.ts`, `world-pages.ts`, `instances.ts`, `object-spawns.ts`, `drop-rollup.ts`, `coverage.ts`,
  `coverage-report.ts`, `world-map-near.ts` (two calls pass the scopes on).
- Changed (web): `lib/coverage-compute.ts`, `lib/rollup-compute.ts` and its test (the mock and the world facts' shape),
  `lib/world-lists.ts`, `lib/database-sitemap.ts`, `lib/world-map.ts`, `lib/zones.ts`, `lib/instances.ts`,
  `lib/names.ts`, `app/database/npcs/[id]/page.tsx`.
- Not changed: `kb/src/settled-list.ts`, `web/src/lib/settled-store.ts`, `kb/src/spot-check.ts`,
  `kb/curated/recheck.json` (still empty), the intake, the version layer and the `/beta` and `/ptr` routes, the item
  reader, the MCP tool definitions and server, `kb/src/open-data/**`, migrations, switches, secrets,
  `docs/DATA_POLICY.md`, `CHANGELOG.md`, releases or tags.

## Verification

- `kb/test/recheck-scopes.test.ts`, 7 tests: the matcher by type, zone and id, the latest date winning, a zone list never
  covering an unplaced fact, NPC placement; the score and the internal report agreeing fact for fact on eight scopes;
  three new installs on a changed title, name, level, pin, price, reward, role and side showing it, where without the
  scope the page shows nothing (title, name, level) or both values (price, reward), and the side reads Both; two new
  installs leaving the page empty and the score at `recheck`, three making it `confirmed`; scopes on another type, zone
  or id, or older than every report, leaving the fact alone; a quest covered by its giver's zone; entrances, bosses
  (name, boss ids, kills, reporters, last seen) and treasures (pin and name) after their scope; the drop cut-off per
  source, an item id covering every source that dropped it, untimed windows dropped, other records untouched, the same
  array back without scopes, and the score's drop rate going `recheck` and then `confirmed` at the third new install.
- `web/src/lib/world-lists.test.ts`, 1 test: the quest, NPC and vendor lists apply the scopes the world facts carry.
- Full KB suite: **116 files, 1,218 tests pass** (the same suite before this lane's tests: 115 files, 1,211, all passing
  with the new code). KB typecheck passes.
- Full web suite: **223 files pass and 1 is skipped; 2,143 tests pass and 3 are skipped** (before: 222 files, 2,142).
  Web typecheck passes; lint passes with only the existing warnings; `next build` passes.
- Companion: 5 files, 43 tests, typecheck. Desktop: 23 files, 137 tests, typecheck and build (it bundles the settled
  list, which now reaches `recheck-scopes.ts` through the score).
- A synthetic corpus of 57,500 records (4,000 NPCs, 3,000 quests, 500 vendors, 20,000 loot windows) with four zone
  scopes: every NPC page 424 ms (406 without scopes), all agreed NPC names and quest titles 61 ms (31), the rates 48 ms
  (37), the coverage score 318 ms either way.
- The settled-list patch in the appendix: applied, KB typecheck, its 2 new tests and the existing settled-list and spot
  check tests (22) pass, and the full KB suite passed with it (117 files, 1,220 tests); web typecheck and the three
  settled test files (12 tests) pass. Reverted.
- Nothing here was run against the live corpus or the live client: `kb/curated/recheck.json` holds no scope, so the
  public pages read the same as before this change.

## Decisions for the reviewer

1. **The drop-rate cut-off is per source and unconditional** (above). The alternative, cutting only once a rate was
   public, would keep a biased sample for sources just below 3 installs. The cost is that a public rate disappears from
   the pages until 3 installs loot the source again; with an empty scope file that is nobody today.
2. **The boss scope's ids are the instance, the encounter and every boss NPC, for every field**, as the public score had
   them. The internal report named a boss NPC only for that NPC's own field; it now matches the score.
3. **A rare's name and pins are covered by `rares` scopes as well as `npcs` and `pins` ones** on the pages, since the
   page shows one name and one pin for both facts. In the score they remain separate facts, as before.
4. **The scopes ride on `WorldFacts.recheck`** rather than a new argument on every page function, so the call sites that
   build partial facts pass `recheck: facts.recheck` (and `npcs` where a quest or vendor needs its NPC's zone). The
   instance and object readers take an optional last argument; `RECHECK_SCOPES` is imported where they are called.
5. **Rows captured exactly at the scope's date count on neither side**, as `tallyVotes` already did.
6. **Readers do not clamp future capture times** to the corpus time, as the score does with `asOf`; a row from the
   future counts as after the date either way.

## What is not built, and what remains

- **The settled list's spot check and the drop cut-off there** (appendix), for the coordinator to apply: it makes
  `computeSettled` leave out an entry when `isSpotChecked({ key, zone }, week, scopes)` with the keys `npc:<id>`,
  `pin:<npc>:<map>`, `quest:<id>`, `vendor:<id>` and `loot:npc|obj:<id>`, the zones placed by the score's rule; takes the
  week as an input (the cron passes `isoWeek(new Date())`; without it nothing is spot-checked, so the list stays a pure
  function and its tests cannot flake on a 2% pick); lets a scoped loot source settle again on its windows after the
  date instead of staying out until the scope is removed; and replaces the local scope loop with the shared one. Its
  `scopeSince` still passes every map an NPC was seen on as the zones, where the score uses the busiest one; aligning
  that is a further step.
- **The MCP tools** (`npc_page`, `quest_page`, `vendor_page`, `item_page`, `object_page`, `world_map_near`) build their
  facts in `kb/src/mcp-server.ts` without scopes, so they do not apply the cut-off yet. That file is lane E's. The fix
  is to attach the scopes in the fact builders (`recheck` on the world facts, `itemFactsFromRecords(records, scopes)`).
- **`kb/src/object-page.ts`** (the object page's pins and names), **`kb/src/edges.ts`** (relation edges from drops) and
  **`kb/src/open-data/build.ts`** call the readers without scopes. The open data is a record of what was reported, so
  leaving it whole may be right; the object page should pass them.
- Writing scopes is unchanged: the build watch writes map scopes, `client-diff` and maintainers the rest, and the weekly
  `spot-check` run is still not scheduled.

## Appendix: the proposed settled-list change

Applies to `main` at the time of this lane with `git apply`. Not part of this pull request.

```diff
diff --git a/kb/src/settled-list.ts b/kb/src/settled-list.ts
--- a/kb/src/settled-list.ts
+++ b/kb/src/settled-list.ts
@@ -23,10 +23,12 @@
 import { z } from "zod";
 import { POSITION_TOLERANCE, type CoverageType, type RecheckScope } from "./coverage.js";
 import { measureDropRate } from "./drop-rate-settling.js";
-import { lootWindowsFromRecords, rollupDrops } from "./drop-rollup.js";
+import { lootWindowsFromRecords, recheckLootRecords, rollupDrops } from "./drop-rollup.js";
 import { SETTLE_EXTRA_VOTERS, SETTLE_WINDOW_DAYS, tallyVotes, WORLD_AGREEMENT, type VoteRow } from "./fact-states.js";
 import { instanceFactsFromRecords } from "./instances.js";
-import { objectSightingRowsFromRecords, objectSpawns, SPAWN_RADIUS } from "./object-spawns.js";
+import { objectSightingRowsFromRecords, objectSpawnRowsFromRecords, objectSpawns, SPAWN_RADIUS } from "./object-spawns.js";
+import { busiestMap, npcZones, scopeSince as matchScope } from "./recheck-scopes.js";
+import { isSpotChecked } from "./spot-check.js";
 import { isPinPosition, worldFactsFromRecords } from "./world-pages.js";
 
 export const SETTLED_SCHEMA = "everloot.settled/1";
@@ -91,6 +93,8 @@ export interface SettledInput {
   asOf: string | null;
   build: string;
   recheck?: readonly RecheckScope[];
+  /** The ISO week the weekly spot check picks with (`isSpotChecked`), `isoWeek(new Date())` from the cron; none without it. */
+  week?: string;
 }
 
 /** The list for a build nobody has looked at yet: nothing is skipped. */
@@ -317,16 +321,9 @@ function settledAt(rows: readonly Placed[], asOf: string | null, since: string |
   return third !== undefined && third <= now - SETTLE_WINDOW_DAYS * DAY ? [mx, my] : null;
 }
 
-/** The latest date of a recheck scope that covers a fact of these types, on these maps, with these ids. */
+/** The latest date of a recheck scope that covers a fact of these types, on these maps, with these ids (recheck-scopes.ts). */
 function scopeSince(scopes: readonly RecheckScope[], types: readonly CoverageType[], maps: readonly number[], refs: readonly number[]): string | null {
-  let best: string | null = null;
-  for (const s of scopes) {
-    if (s.type && !types.includes(s.type)) continue;
-    if (s.zones?.length && !maps.some((m) => s.zones!.includes(m))) continue;
-    if (s.ids?.length && !refs.some((r) => s.ids!.includes(r))) continue;
-    if (best === null || time(s.since)! > time(best)!) best = s.since;
-  }
-  return best;
+  return matchScope(scopes, { types, zones: maps, ids: refs });
 }
 
 const round = (v: number) => Math.round(v * 100) / 100;
@@ -342,6 +339,8 @@ export function computeSettled(input: SettledInput): SettledFile {
   const add = (map: Map<number, Set<number>>, k: number, m: number) => map.set(k, (map.get(k) ?? new Set<number>()).add(m));
   const list = { schema: SETTLED_SCHEMA, build: input.build, dataAsOf: asOf } as const;
   if (!asOf) return { ...emptySettledList(input.build), values };
+  // The weekly spot check (spot-check.ts) leaves about 2% of settled facts out, so uploaders send them again.
+  const checked = (key: string, zone: number | null) => input.week !== undefined && isSpotChecked({ key, zone }, input.week, scopes);
 
   type World = ReturnType<typeof worldFactsFromRecords>;
   const npcs: (World["npcs"][number] & { capturedAt?: string })[] = [];
@@ -354,6 +353,8 @@ export function computeSettled(input: SettledInput): SettledFile {
     for (const r of one.quests) questRows.push({ ...r, ...c });
     for (const r of one.vendors) vendorRows.push({ ...r, ...c });
   }
+  // Where each NPC is counted (the score's rule), for the spot check's zone.
+  const npcZone = npcZones(npcs.map((r) => ({ npcId: r.npcId, mapId: r.mapId, installId: r.installId, pin: isPinPosition(r.positionKind) })));
 
   // NPCs: name and traits settled, then each map whose pin is settled.
   for (const [npcId, rows] of groupBy(npcs.filter((r) => r.installId.trim()), (r) => r.npcId)) {
@@ -370,11 +371,11 @@ export function computeSettled(input: SettledInput): SettledFile {
       if (settledValue(list.map((r) => ({ installId: r.installId, value: "listed", ...when(r) })), asOf, s)) roles.push(role);
       else open = true;
     }
-    if (open) continue;
+    if (open || checked(`npc:${npcId}`, npcZone.get(npcId) ?? null)) continue;
     const pins = groupBy(rows.filter((r) => isPinPosition(r.positionKind) && r.x >= 0 && r.x <= 100 && r.y >= 0 && r.y <= 100), (r) => r.mapId);
     for (const [mapId, list] of pins) {
       const pin = settledAt(list, asOf, scopeSince(scopes, rare ? ["pins", "rares"] : ["pins"], [mapId], [npcId]));
-      if (!pin) continue;
+      if (!pin || checked(`pin:${npcId}:${mapId}`, mapId)) continue;
       add(npcMaps, npcId, mapId);
       values[`npc:${npcId}@${mapId}`] = {
         kind: "npc", name: String(name.value), ...(level ? { level: Number(level.value) } : {}), ...(creatureType ? { creatureType: String(creatureType.value) } : {}),
@@ -409,6 +410,11 @@ export function computeSettled(input: SettledInput): SettledFile {
       side = a.size >= SETTLE_VOTERS && h.size >= SETTLE_VOTERS ? "both" : a.size >= SETTLE_VOTERS && !h.size ? "alliance" : h.size >= SETTLE_VOTERS && !a.size ? "horde" : undefined;
       if (!side) continue;
     }
+    const lead = (k: "giverNpcId" | "turnInNpcId") => {
+      const id = tallyVotes(ids(k)).groups.sort((x, y) => y.voters.size - x.voters.size)[0]?.value;
+      return typeof id === "number" ? npcZone.get(id) ?? null : null;
+    };
+    if (checked(`quest:${questId}`, lead("giverNpcId") ?? lead("turnInNpcId"))) continue;
     quests.add(questId);
     values[`quest:${questId}`] = {
       kind: "quest", title: String(title.value), level: Number(level.value), ...(giver ? { giver: Number(giver.value) } : {}), ...(turnIn ? { turnIn: Number(turnIn.value) } : {}),
@@ -428,27 +434,35 @@ export function computeSettled(input: SettledInput): SettledFile {
       if (!price || !stock) { open = true; break; }
       items.push([itemId, Number(price.value), Number(stock.value)]);
     }
-    if (open || !items.length) continue;
+    if (open || !items.length || checked(`vendor:${vendorNpcId}`, npcZone.get(vendorNpcId) ?? null)) continue;
     vendors.add(vendorNpcId);
     values[`vendor:${vendorNpcId}`] = { kind: "vendor", items: items.sort((x, y) => x[0] - y[0]) };
   }
 
   // Loot: a source with enough windows whose every item at 3% or more has a settled rate. Recorder windows, which
   // carry no loot-api source, are not in the rates and never settle a source.
-  const windows = lootWindowsFromRecords(input.records as unknown[]);
+  // A source under a recheck scope counts only the windows after its date, as the public rates do.
+  const windows = lootWindowsFromRecords(recheckLootRecords(input.records as unknown[], scopes));
   const windowCount = new Map<string, number>();
   for (const w of windows) {
     const k = w.sourceNpcId !== undefined ? `npc:${w.sourceNpcId}` : `obj:${w.sourceObjectId}`;
     windowCount.set(k, (windowCount.get(k) ?? 0) + 1);
   }
+  const objectSeen = new Map<number, Map<number, Set<string>>>();
+  for (const r of [...objectSpawnRowsFromRecords(input.records as unknown[]), ...objectSightingRowsFromRecords(input.records as unknown[])]) {
+    if (typeof r.mapId !== "number") continue;
+    const byMap = objectSeen.get(r.objectId) ?? new Map<number, Set<string>>();
+    byMap.set(r.mapId, (byMap.get(r.mapId) ?? new Set<string>()).add(r.installId.trim()));
+    objectSeen.set(r.objectId, byMap);
+  }
+  const objectZone = (id: number) => busiestMap(objectSeen.get(id) ?? new Map());
   const bySource = groupBy(rollupDrops(windows).rates, (r) => (r.sourceNpcId !== undefined ? `npc:${r.sourceNpcId}` : `obj:${r.sourceObjectId}`));
   for (const [source, rates] of bySource) {
     const npc = source.startsWith("npc:");
     const sourceId = Number(source.slice(4));
     if ((windowCount.get(source) ?? 0) < LOOT_SOURCE_MIN_WINDOWS) continue;
-    // Drop rates have no recheck cut-off yet: a scoped source stays out of the list until its scope is removed.
-    if (rates.some((r) => scopeSince(scopes, ["drops"], npc ? mapsOf.get(sourceId) ?? [] : [], [sourceId, r.itemId]) !== null)) continue;
     if (!rates.every((r) => r.rate < LOOT_SOURCE_MIN_RATE || (r.public && measureDropRate(r, asOf).settled))) continue;
+    if (checked(`loot:${source}`, npc ? npcZone.get(sourceId) ?? null : objectZone(sourceId))) continue;
     (npc ? lootNpc : lootObj).add(sourceId);
     values[`loot:${source}`] = { kind: "loot", items: rates.map((r) => r.itemId).sort((x, y) => x - y) };
   }
diff --git a/web/src/lib/settled-store.ts b/web/src/lib/settled-store.ts
--- a/web/src/lib/settled-store.ts
+++ b/web/src/lib/settled-store.ts
@@ -1,5 +1,6 @@
 import { createHmac } from "node:crypto";
 import { AwsClient } from "aws4fetch";
+import { isoWeek } from "../../../kb/src/spot-check";
 import { computeSettled, emptySettledList, listOf, parseSettledFile, type SettledFile, type SettledList } from "../../../kb/src/settled-list";
 import { BUILD_PATTERN } from "./settled-cache";
 import { cloudConfig, uploadStore, type CloudConfig } from "./upload-store";
@@ -36,7 +37,7 @@ export async function writeSettled(opts: { added: number; rebuild?: boolean; dat
   // The build and the recheck scopes are the coverage score's; loaded here so the intake never parses the client layer.
   const { COVERAGE_BUILD, RECHECK_SCOPES } = deps.build && deps.recheck ? { COVERAGE_BUILD: deps.build, RECHECK_SCOPES: deps.recheck } : await import("./coverage-compute");
   const build = deps.build ?? COVERAGE_BUILD;
-  const file = computeSettled({ records: corpus.records, asOf: opts.dataAsOf ?? corpus.dataAsOf ?? null, build, recheck: deps.recheck ?? RECHECK_SCOPES });
+  const file = computeSettled({ records: corpus.records, asOf: opts.dataAsOf ?? corpus.dataAsOf ?? null, build, recheck: deps.recheck ?? RECHECK_SCOPES, week: isoWeek(new Date()) });
   const key = settledKey(build);
   const put = await (deps.fetch ?? fetch)(await r2Client(cloud).sign(r2Url(cloud, key), { method: "PUT", body: JSON.stringify(file), headers: { "content-type": "application/json" } }));
   if (!put.ok) throw new Error(`settled list write failed (${put.status})`);
diff --git a/kb/test/settled-list-spot-check.test.ts b/kb/test/settled-list-spot-check.test.ts
new file mode 100644
--- /dev/null
+++ b/kb/test/settled-list-spot-check.test.ts
@@ -0,0 +1,27 @@
+import { expect, test } from "vitest";
+import { computeSettled, decodeIds } from "../src/settled-list.js";
+import { isSpotChecked } from "../src/spot-check.js";
+
+const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString();
+const quests = Array.from({ length: 5 }, (_, i) => ({ kind: "quest", installId: `install-${i}`, capturedAt: day(0), questId: 20, title: "A Threat Within", level: 5, rewardItemIds: [] }));
+const loot = (n: number, from: number, at: number) => Array.from({ length: n }, (_, i) => ({ kind: "loot", installId: `install-${(from + i) % 5}`, capturedAt: day(at), sourceNpcId: 10, sourceEvidence: "loot-api", items: [{ itemId: 30, count: 1 }] }));
+
+test("a spot-checked quest is left out of the settled list that week only", () => {
+  const weeks = Array.from({ length: 520 }, (_, i) => `${2026 + Math.floor(i / 52)}-W${String((i % 52) + 1).padStart(2, "0")}`);
+  const picked = weeks.find((w) => isSpotChecked({ key: "quest:20", zone: null }, w))!;
+  const other = weeks.find((w) => !isSpotChecked({ key: "quest:20", zone: null }, w))!;
+  expect(decodeIds(computeSettled({ records: quests, asOf: day(30), build: "1.0.0", week: other }).quest)).toEqual([20]);
+  expect(decodeIds(computeSettled({ records: quests, asOf: day(30), build: "1.0.0", week: picked }).quest)).toEqual([]);
+});
+
+test("a scoped loot source settles again on the windows after its date", () => {
+  const records = [...loot(300, 0, 0), ...loot(250, 0, 21)];
+  const scope = { since: day(20), source: "https://example.test/hotfix", type: "drops" as const, ids: [10] };
+  const listed = (asOf: string) => computeSettled({ records, asOf, build: "1.0.0", recheck: [scope], week: "2026-W03" }).loot.npc;
+  expect(decodeIds(computeSettled({ records: loot(300, 0, 0), asOf: day(30), build: "1.0.0", week: "2026-W03" }).loot.npc)).toEqual([10]);
+  expect(decodeIds(listed(day(60)))).toEqual([10]);
+  // Old windows alone no longer count once the scope begins.
+  expect(decodeIds(computeSettled({ records: loot(300, 0, 0), asOf: day(60), build: "1.0.0", recheck: [scope], week: "2026-W03" }).loot.npc)).toEqual([]);
+  // Without a week, nothing is spot-checked: the list is a pure function of its input.
+  expect(decodeIds(computeSettled({ records: quests, asOf: day(30), build: "1.0.0" }).quest)).toEqual([20]);
+});
```

The coordinator reviews the diff and the checks and owns the merge.
