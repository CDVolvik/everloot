# Draft: note to fitzforge about guide packs and an Everloot data source

**Status:** draft for Carlos to review and send (GitHub Discussion on `fitzforge/polestar`, or the
Polestar Discord). Nothing here has been sent. Written 2026-10-16 in Carlos's voice; edit freely.

**Facts it relies on** (checked 2026-10-16): Polestar's `docs/GUIDE_PACKS.md` says it does not ship,
host or recommend any pack, that players only see packs they install themselves, and points authors
with a pack to show to the Polestar Discord; `LICENSE-EXCEPTION.md` lets compiled packs use any licence;
`docs/PACK_FORMAT.md` defines `pack.json` (id, title, author, version, license, website, source, notes,
folder); open issues ask for help mapping caves, climbs and chokepoints (#10), note that Forever quests
have no prerequisites in the quest data (#51), and report wrong trainers (#80) and NPC positions (#77, #84).
Carlos's merged PRs there: #2, #4, #5, #7, #8, #9, #12, #23; the map button (#81), party quest progress
(#24) and esMX translation (#11) are open. Everloot's addon records NPC
sightings, quest givers and turn-ins, trainers and vendors, and publishes a fact only when three
independent installs agree; published data is CC BY-SA 4.0. Everloot has not yet run a real in-game
collection pass, so the export described below is a plan, not a live feed.

---

Hi, Carlos here (the class-trainer, buy-at-merchant and cave approach PRs, and the open map button
and esMX translation ones).

Two things I'm building on everloot.app that touch Polestar, and I'd rather ask before they exist
than after.

**1. A directory of guide packs.** GUIDE_PACKS.md says Polestar doesn't host or recommend packs,
and outside the Discord there's no list of them, so a player searching the web has nowhere to look. I'm putting up an independent directory on everloot.app: one entry per pack, using exactly the
`pack.json` fields plus what the pack covers (zones, levels, races, classes) and where to download
it. Polestar's own guides would be the first entry, credited to you. It will say plainly that it is
not part of Polestar and that you don't vouch for the packs listed. If there's a line you'd want on
that page, or a reason not to do it, tell me and I'll follow it.

**2. An optional data source for `data build`.** Everloot's addon collects what players see (NPC
positions, quest givers and turn-ins, trainers, vendor lists) and publishes a fact only when three
independent installs agree. Once real collection is running, I can publish that as a CC BY-SA 4.0
feed shaped the way your `data build` sources are. It might help with the cave and chokepoint
mapping, the wrong-trainer reports, and eventually quest prerequisites observed in play. No
obligation on your side; if it's useful I'll match whatever format and licence terms you prefer, and
if it isn't, the directory still stands on its own.

Thanks for Polestar. The simulator-made routes are the reason I started collecting data in the
first place.

Carlos
