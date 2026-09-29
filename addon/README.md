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
    ├── openworld.lua   target/mouseover sightings + loot windows (quest+merchant pending beta confirm)
    ├── guild.lua       roster snapshots + raid attendance (lockout+loot pending raid test)
    └── gear.lua        equipped ilvl sample, max 1/hour
```

Test install: copy this folder to `Interface/AddOns/Everloot/` in the Forever client, `/reload`,
run `/everloot status`. Upload path: SavedVariables file → desktop uploader / `/upload` page (Track 2/4).

History: placeholder since Phase 4 planning; the 9/27 Forever pivot made it Track 1. The Arcane
Companion archive (rotation HUD, different addon) stays in the docs archive, not salvaged here.
