# Everloot guild system — records, score, affiliations (2026-09-29)

**Status:** design (Carlos, 2026-09-29 loop). Builds on the 9/28 data-staple brainstorm and the
9/29 design foundation. Everything here is captured by our own opt-in addon through the official
Lua API into our own SavedVariables — no Blizzard API dependency, no screen reading, nothing that plays.

## Two data classes (the legal split)

- **Open-world (anonymous):** NPC sightings, loot windows, quest dialogs, vendor lists, item-seen.
  No character or guild names, no chat, random install id only. Publishable after 3+ independent
  installs agree (9/28 rule stands).
- **Guild-consented (named):** roster, gear, attendance, loot awards, progression. Published only by
  an officer's upload (guild claim via addon-signed token). The uploader sees the full payload before
  sending; members are covered by the guild's own consent (officer act) + a per-character opt-out that
  blanks that character everywhere within 24h. Alt-linking is opt-in only (player claims alts with a
  signed token); otherwise identity = name+realm, never merged.

## Guild records (addon captures, intake validates)

| Record | Captured when | Fields | Site use |
|---|---|---|---|
| Guild snapshot | login / guild roster update | guild name, realm, faction, member list (name, rank, level, class, last online) | roster pages, real player counts |
| Raid lockout | lockout change / logout in raid | instance, difficulty, bosses killed, reset time | progression ladder |
| Attendance | boss kill / raid end | lockout id, present members | attendance %, active raider counts |
| Loot award | loot window in raid | item id, recipient, source boss, date | loot history, legendary tracking |
| Gear snapshot | login / raid entry (sampled, max 1/hour) | character, equipped item ids + ilvl per slot | avg ilvl, armor-weight inputs |

Reading APIs (all official, same calls Questie/TSM/Raider.IO's client use): guild roster, raid roster,
lockout info, loot events, inventory item links + detailed ilvl. Event-driven only — no polling loops.
SavedVariables capped with a rolling window; uploads send diffs, never full dumps. Per-module toggles;
any module over budget ships off by default.

## Internal guild score (v1)

Inputs are raw stored facts; the score is computed, versioned, never an input. v1 components:
**progression** (boss kills weighted by tier × recency decay) + **roster** (active raiders, attendance
rate) + **gear** (avg equipped ilvl of active roster = the armor-weight term). Loot feeds history and
legendary counts, not the score. Components shown transparently (Thottbot spirit); weights versioned
(`score_v1`) so tuning never rewrites history. Anti-gaming: officer-published only, implausible jumps
quarantined, 3-install corroboration where the data is observable.

## Affiliation graph (the Olympus case)

- **Guild family:** named umbrella (e.g. Olympus) → member guilds across realms/factions. Claimed by
  the family's officers; shown as one page with combined rollups.
- **Rollups:** family and faction views aggregate progression, real player counts (deduped by
  name+realm), and loot. Alt-merged counts only where opt-in claims exist — otherwise the page says
  "X characters, Y confirmed players" honestly.
- **What we never claim:** cross-faction player identity without a claim, Blizzard-verified status,
  or anything from logs/armory ingestion. Our graph is our data; gaps say so.

## Census outside the game (Olympus, checked 2026-09-30)

There is no public Forever roster feed. Raider.IO's Forever tab and sites such as Raidify and CoGM
say the same thing: armory sync waits on a Blizzard namespace that does not exist. Warcraft Logs
is the same. News numbers are people repeating a stream.

The ~50k figure is Asmongold reading an in-game census out loud. Clips from late September put the
addon near 45,000 members and 5,000 online in one second, with 50,000 named as the next mark, and
an earlier reading of 38,500 "registered Olympians." Those are not a dataset we can download.

The community addon that produces the number is [Olympus Guild](https://github.com/dnl-gentile/olympus-addon)
(MIT, CurseForge, Forever 1.60.1). Its own page says the useful part: a player only sees their own
guild's roster, a guild caps near 1,000, and Olympus is many guilds. One member per guild is elected
reporter and broadcasts a short summary on an addon channel. Every client adds those summaries up.
The addon has no server. Nothing it sends leaves the game. The Forever beta also forgets addon
saved data on login, so the census rebuilds from whoever is online.

Our copy of that count, outside the game:

1. One opted-in member of a guild uploads the snapshot the game already gave them (the guild
   snapshot row above). One upload covers that whole guild. We do not sit a second reporter in
   the channel, and we do not scrape the addon.
2. A family total is the sum of the latest snapshot per guild. A character is in one guild, so
   the sum does not double-count characters. "Confirmed players" still requires the opt-in alt
   link. Until then the page says "X characters."
3. Two uploads of the same guild must agree on the member count before the number is public.
   A reporter's own character never confirms their own rank. This matches the drop rule: one
   install is a claim, agreement is a fact.
4. Online is whoever that snapshot saw online, with the time on it. A guild with no fresh
   upload is missing, not zero.
5. The server is the memory the beta client does not keep. The page is only as new as the
   last agreeing upload.

Tracker rows: `tool.guild_census`, `ref.olympus_addon`.

## Site surfaces (Track 3 consumes this)

Guild pages (progression + roster + score components), family pages, realm/faction ladders, loot
history, all on the reference-page pattern with provenance footers. Officer dashboard: claim guild,
preview payload, publish/unpublish, opt-out list.

## Agency lane (parallel, non-blocking)

The Forever launch rush is agency inventory too: guild landing pages, recruitment content packs, and
"Powered by Everloot" footers on agency-built guild sites. Sold and delivered by R21, never a
product dependency — the product ships 11/04 regardless.
