# addon/

Lua addon — in-game WoW client side. The bridge that exports live character state (bag contents, exact AH bids, etc.) that the Battle.net API doesn't surface.

**Status**: empty placeholder. Belongs to Phase 4 of the build plan, NOT Phase 1. Don't write code here yet.

**Pattern**: TSM / AskMrRobot / Raider.IO model. Addon writes to `SavedVariables` on `/reload` or `/logout`. Companion desktop app (see `../desktop/` future folder, or Electron app) reads the file and uploads to the backend. WoW addons cannot make HTTP requests — this constraint has held for 20 years.

**Existing salvageable code**: there's an archived **Arcane Companion** addon (Arcane Mage rotation HUD) at `D:\R21-Brain\docs\archive\2026-05-14-ggb-snapshot\projects\wow-addons\` — only the MVP zip survives, supporting markdowns were lost in archival. It's a different addon (rotation helper, not data bridge) but could be revived as the first WoWVault-published in-game addon if WoWVault grows an addon distribution surface in Phase 4-5.

**TOC + folder layout (when scaffolded)**:
```
addon/
├── WoWVault.toc
├── WoWVault.lua
├── lib/
└── modules/
    ├── collections-export.lua
    ├── ah-bids-export.lua
    └── ...
```

Test install path on Mac: `~/Applications/World of Warcraft/_retail_/Interface/AddOns/WoWVault/`.
