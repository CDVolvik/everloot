# Recipe windows and points — design note (2026-10-10)

Decision for Carlos. Nothing here is built. Follows the
[recipe capture options](2026-10-09-recipe-capture-options.md) memo, whose option A shipped in
addon 0.2.3 (`recipe_observed`) and #32 (published threshold ranges).

## Why routes are still empty

The profession path (`kb/src/profession-path.ts`) plans with `recipe_seen` rows: a skill window
(`skillMin` inclusive, `skillMax` exclusive) and `points` per craft. It assumes every craft in the
window pays `points`. Nothing emits `recipe_seen`. Since #33 prices fill from auction scans, the
recipes are the only missing input.

The `recipe_seen` model doesn't match how Classic-era skill-ups work:

- **Orange** (`optimal`) always gives a skill-up.
- **Yellow** (`medium`) usually does; **green** (`easy`) rarely does; **grey** (`trivial`) never does.
- A skill-up is normally one point.

These are Classic behaviours. They need checking in the Forever client before anything relies on
them. A window where every craft pays is really the **orange span**: from the rank where the
recipe can be learned up to just before it turns yellow.

## What the data already gives

`recipe_observed` (0.2.3) bounds the yellow, green and grey thresholds as ranges, published once
3 installs agree (#32). For the orange span:

- **End:** the yellow threshold's lower bound (`yellow.min`). Every rank below it is known orange
  or earlier, so planning up to `yellow.min − 1` never claims a skill-up the data can't back.
- **Start:** not known exactly. The trade-skill window lists only learned recipes, so the lowest
  rank anyone saw the recipe at is an upper bound on its learn rank, not the rank itself.

## Options

**A. Orange-only path from what exists (smallest).** Derive a step per recipe:
`skillMin` = the lowest rank any install saw it orange (once the recipe's ranges are published, so
3 installs agree), `skillMax` = `yellow.min`, `points` = 1. A recipe whose `yellow.min` is still
unrecorded gets no step.
Steps start later than the real learn rank, so routes are longer and costlier than the truth, never
shorter. That's the honest direction. Engine-only: no addon change. Routes still show gaps wherever
fewer than 3 installs have the recipe.

**B. A plus trainer requirements (recommended).** Add a `trainer_seen` capture from the trainer
window: recipe name, required rank (`GetTrainerServiceSkillReq`) and training cost. That gives
the exact learn rank for trained recipes, so `skillMin` is exact. Training cost can also go into
the route's gold. It's the player's own window and holds no other player's data. Drop and vendor
recipes would still use A's bound; their tooltip text is localized, so it isn't parsed.

**C. B plus craft results (fullest).** Add a `craft_result` capture: recipe, colour at the craft,
rank before and after (`SKILL_LINES_CHANGED` / `GetTradeSkillLine`, not the localized chat line).
Across installs this measures the skill-up chance on yellow, so a route could use yellow ranks at
an expected cost per point, and it confirms one point per skill-up. It needs a probability model
in the planner and the most real-client verification: matching a craft to a rank change is exactly
what an in-game test has to prove.

## Recommendation

B now, with C after the beta checklist has proved the 0.2.3 and 0.2.4 captures in the Forever
client. A alone ships fastest but leaves trained recipes, which are most early ranks, starting late.

If B is chosen:

1. Intake: `trainer_seen` kind with tests. `recipe_seen` stays for curated or derived rows.
2. Addon: emitter on `TRAINER_SHOW` / `TRAINER_UPDATE`, every call guarded, Lua contract test.
3. Engine: derived steps (exact `skillMin` from trainer rows when 3 installs agree, A's bound
   otherwise; `skillMax` = `yellow.min`; `points` = 1) feed the existing planner. The path rule text
   says steps are orange-only.
4. Real-client check: open a trainer, compare two required ranks by hand; open the trade-skill
   window at a rank inside a derived step and confirm the colour is orange.
