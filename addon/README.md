# addon/: the Everloot collector

The in-game addon for WoW: Forever. It records what you see while you play (sightings, loot
windows, vendors, auction listings you browse, recipes, trainers, your own gold, the world
position of each zone you enter) into its SavedVariables file, and shows `/ask` answers from the
companion. It uses only the game's addon API and never plays the character. Records match the
site's intake contract (`web/src/lib/intake.ts`) field for field.

**Status:** 0.2.8 beta. The automated contract tests pass; the in-client checks in
`docs/2026-10-08-beta-client-checklist.md` are still open.

## Run it

Download the zip from everloot.app/upload, or build it from the repository root:

    python scripts/package-addon.py

That writes `web/public/downloads/Everloot-<version>.zip`. Extract `Everloot/` into the Forever
client's `Interface/AddOns/`, `/reload`, then run `/everloot status`. Auction capture is off until
`/everloot auctions on`. The list of your installed addons is off until `/everloot addons on`;
it is sent only from the upload page, after its preview. `/everloot addons off` stops it and
deletes every recorded addon row.

## Test it

The contract tests run the Lua in real Lua 5.1 through `lupa`:

    python -m pip install lupa==2.6
    python addon/tests/event_identity.py
    python addon/tests/collection_contract.py
    python addon/tests/auction_contract.py
    python addon/tests/gold_contract.py
    python addon/tests/ask_contract.py
    python addon/tests/recipes_contract.py
    python addon/tests/answers_contract.py
    python addon/tests/addons_contract.py
    python addon/tests/mapbounds_contract.py
    python addon/tests/raid_contract.py

Run them from the repository root. CI also rebuilds the zip and fails if it differs from the one
committed in `web/public/downloads/`, so commit the rebuilt zip with any addon change.

## Where things live

```
addon/
├── Everloot.toc        Interface 70058 (Forever 1.60.1), SavedVariables: EverlootDB
├── core.lua            event dispatch, module registry, toggles, rolling store, /everloot
├── modules/
│   ├── openworld.lua   target/mouseover sightings, loot windows, merchant windows
│   ├── guild.lua       roster, attendance, saved lockouts (published only through an officer)
│   ├── gear.lua        equipped item level sample, at most once an hour
│   ├── auctions.lua    per-unit buyouts from a list you opened; off until enabled
│   ├── gold.lua        your own gold: loot, quests, vendors, flights, mailed auction sales, postage, buyouts
│   ├── professions.lua recipe colours at your rank; required rank and cost from trainer windows
│   ├── ask.lua         /ask stores a question; the companion's answers show after /reload
│   ├── addons.lua      your installed addons' names, titles and versions; off until enabled
│   ├── mapbounds.lua   each zone's corners in world coordinates, once per zone per build
│   ├── raid_data.lua   hand-checked raid buff list (same ids as web/src/data/raid-buffs.ts)
│   └── raid.lua        /everloot raid: buffs missing per group, and a raid share code; display only
└── tests/              Lua 5.1 contract tests and their fixtures
```

Every Blizzard call is guarded, so a system missing from the client disables its module instead
of raising an error.
