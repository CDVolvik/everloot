# addon/ — Everloot collector (WoW: Forever)

In-game collector for the Forever database + guild tracker. Official Lua API only, own
SavedVariables, nothing that plays the character. Records match the intake contract
(`web/src/lib/intake.ts`) field for field.

**Status**: skeleton (2026-09-30). Loads defensively — every Blizzard call is guarded, so missing
beta systems disable their module instead of erroring. **Not yet loaded in a client**: needs the
beta load test (`/everloot status` clean, two raid nights) before 10/21.

```
addon/
├── Everloot.toc        ## Interface: 70058 (Forever 1.60.1), SavedVariables: EverlootDB
├── core.lua            event dispatch, module registry, toggles, rolling store, /everloot
└── modules/
    ├── openworld.lua   target/mouseover sightings, loot windows, item names when the client already knows them, merchant windows (quest levels stay uncaptured)
    ├── guild.lua       roster, attendance, saved lockouts (loot awards still wait on a raid test)
    ├── gear.lua        equipped ilvl sample, max 1/hour
    ├── auctions.lua    per-unit buyouts from a list the player opened; off until /everloot auctions on
    ├── gold.lua        own gold: peak, current, loot copper, quest rewards, vendor sales, flight costs, net mailed auction sales, postage, buyouts
    ├── professions.lua recipe colours at the player's rank from open trade-skill and craft windows (thresholds inferred server-side); required rank and cost from trainer windows
    └── ask.lua         /ask stores a question; answers from the companion's EverlootAnswers addon show after /reload
```

Test install: copy this folder to `Interface/AddOns/Everloot/` in the Forever client, `/reload`,
run `/everloot status`. Upload path: SavedVariables file → desktop uploader / `/upload` page (Track 2/4).

History: placeholder since Phase 4 planning; the 9/27 Forever pivot made it Track 1. The Arcane
Companion archive (rotation HUD, different addon) stays in the docs archive, not salvaged here.
