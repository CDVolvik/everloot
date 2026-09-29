# Track 1 plan — collector addon, beta-tested by 10/21 (2026-09-29)

**Goal:** the Everloot collector runs on Carlos's beta client before the beta closes 2026-10-21,
capturing open-world + guild records into SavedVariables with an upload path that works.
**Owner:** Carlos (+ loop). **Repo:** `wowvault`, new `addon/` build (Lua, no dependencies).

## Week 1 (by 10/06): API truth + skeleton

1. API truth — CONFIRMED 2026-09-29 (no longer unknown): Forever runs the **Retail-flavored
   API** (`Gethe/wow-ui-source` branch `forever` @ `cde14c6`, build 1.60.1 / interface **70058**,
   updated daily). Available: `C_GuildInfo` (roster, news, ranks, tabard, rename, preferred
   settings) + `GUILD_ROSTER_UPDATE` / `GUILD_RANKS_UPDATE` / `PLAYER_GUILD_UPDATE` events,
   `C_GuildBank`, `RaidLocks` (lockout info), `LootHistory`, Encounter Journal, professions +
   tradeskill, talents, maps. Addon TOC: `## Interface: 70058`. Remaining check (in-client):
   which systems are live vs stubbed in beta (e.g. Mythic+/ChallengeMode docs exist — verify
   they function before depending on them).
2. Skeleton addon: loads with zero Lua errors, writes versioned SavedVariables, `/everloot status`
   prints capture state. Per-module toggles from day one.
3. Schema freeze for all 10 records (5 open-world from 9/28 §1 + 5 guild from the guild-system spec).

## Week 2 (by 10/13): capture + bridge

4. Event wiring: target/mouseover, loot window, quest dialog, merchant, tooltip-seen, roster/lockout/
   loot/gear samplers with caps (gear max 1/hour, rolling window).
5. File bridge: SavedVariables → upload payload (diffs only) → preview → send to intake stub.
   Officer-claim token flow mocked; real claim with Track 2.
6. `/ask` offline mode over the lore KB snapshot (Part 1 build) — answers, never acts.

## Week 3 (by 10/21): beta proof

7. Carlos playtest: beta character **in a guild**, two raid nights minimum. Open-world records verified
   against known spawns/drops; guild records read back against the guild's own knowledge.
8. Lean audit: memory/CPU profiled in raid, over-budget modules off by default. Zero-error log required.
9. CurseForge pack staged (submission ~10/24, Track 5) + craft gate + Codex review on the Lua.

## Gates (from 9/28 §3)

Loads clean · captures all 10 records · diffs upload · officer preview exact · answers-never-act
re-verified · Carlos sign-off. A slip drops in this order: `/ask` models → Mac notes → vendor/quest
capture → (never: core collector, upload, guild snapshots).

## Needs from Carlos

Beta character in a guild before 10/13 (two raid nights by 10/21) · CurseForge account · `everloot.app`
for the upload endpoint + AdSense clock.
