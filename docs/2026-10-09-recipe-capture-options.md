# Recipe capture — options (2026-10-09)

Decision for Carlos. Nothing here is built. The profession path (`tool.profession_path`,
`/tools/professions`) needs `recipe_seen` rows, and the addon has no emitter for them.

## The mismatch

`recipe_seen` asks for `skillMin`, `skillMax` and `points`: where a recipe starts and stops giving
skill-ups, and how many each craft gives. The Classic-era trade-skill window does not report those
numbers. What it does report, per recipe, is a difficulty colour at the player's current rank:

- `GetTradeSkillLine()`: the profession, current rank and max rank.
- `GetTradeSkillInfo(i)`: recipe name and difficulty (`optimal`, `medium`, `easy`, `trivial`,
  or `header`).
- `GetTradeSkillNumReagents(i)` / `GetTradeSkillReagentInfo(i, j)`: reagent names and counts.
- `GetTradeSkillItemLink(i)` / `GetTradeSkillNumMade(i)`: the product.
- Enchanting uses the parallel `GetCraft*` functions.

These names come from the Classic API and must be checked in the Forever beta client before any
emitter ships.

## Options

**A. Observe colours, infer thresholds (recommended).** A new record kind, for example
`recipe_observed`: profession, recipe, product item id, the player's rank, difficulty colour,
reagents. Each row bounds the thresholds: orange at rank 120 means the yellow threshold is above
120; green at 135 means green starts at or below 135. Rows from many installs narrow each range.
The engine publishes a threshold only when three installs agree on the interval, and shows ranges,
never a guessed exact number. No new permission is needed: it is the player's own window.

**B. Record skill-ups directly (pairs with A).** After a craft, record the recipe, the rank before
and the rank after. That gives `points` and the ranks where a recipe still pays, which colours alone
only bound. It needs a reliable link between the craft and the rank change, which is exactly what a
real-client test has to prove.

**C. A curated threshold table.** Faster, but only from a source that permits reuse. Wowhead is
link-only and wago.tools is blocked; wiki.gg's reply is still pending. Not recommended unless a
permitted source appears.

## If A (and B) are chosen

1. Add the kind to intake with tests; keep `recipe_seen` for curated or derived rows.
2. Addon emitter on the trade-skill window, with stubbed Lua tests like the other modules.
3. Engine: derive threshold intervals and points from agreeing installs; feed the existing route
   costing with intervals, and keep showing gaps as gaps.
4. Real-client check: open each profession window at two ranks; craft once and compare the rank.

Prices (`price_seen`) have the same gap: no emitter, and no realm, build or time scope. Auction scans
(#1) are the current price source; a scoped `price_seen` emitter is a separate decision.
