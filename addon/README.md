# addon/: the Everloot collector

The in-game addon for WoW: Forever. It records what you see while you play (sightings, loot
windows, vendors, auction listings you browse, recipes, trainers, your own gold, the world
position of each zone you enter) into its SavedVariables file, and shows `/ask` answers from the
companion. It uses only the game's addon API and never plays the character. Records match the
site's intake contract (`web/src/lib/intake.ts`) field for field.

**Status:** 0.2.7 beta. The automated contract tests pass; the in-client checks in
`docs/2026-10-08-beta-client-checklist.md` are still open.

## Run it

Download the zip from everloot.app/upload, or build it from the repository root:

    python scripts/package-addon.py

That writes `web/public/downloads/Everloot-<version>.zip`. Extract `Everloot/` into the Forever
client's `Interface/AddOns/`, `/reload`, then run `/everloot status`. Auction capture is off until
`/everloot auctions on`. The list of your installed addons is off until `/everloot addons on`;
it is sent only from the upload page, after its preview. `/everloot addons off` stops it and
deletes every recorded addon row.

## Talents, selftest and the plan panel

- **Talents** (on by default). Reads your build through `C_Traits` and `C_ClassTalents`: the active spec
  group and, once dual spec is unlocked at level 40, the second one. Each build is one
  `talent_snapshot` record: class, level, spec group, config id, tree id, every spent node with its ranks
  and choice, and Blizzard's own loadout string from `C_Traits.GenerateImportString` when the client
  returns one (`exportStatus` says `ok`, `unavailable`, `failed`, `empty` or `unexpected`). A row is
  written only when the build changes. The rows hold no character name. They are not in the public corpus
  until the data policy says how talent builds are published. `/everloot talents` prints each group and a share code.
- **Selftest.** `/everloot selftest` checks each talent API, that it returns sane data, and that the
  loadout export and import functions exist (`ImportLoadout` and `ViewLoadout` are never called). It
  prints `PASS`, `FAIL`, `SKIP` and `INFO` lines and saves them under `selftest` in the SavedVariables file.
  Run it once with the talent window closed and once open.
- **Plan panel (display only).** `/everloot plan <share code>` loads an Everloot talent plan and shows,
  beside the talent window, the next point to spend and where your build differs. `/everloot plan` reopens
  it (it also has a paste box), `plan hide` closes it, `plan clear` forgets it. When the talent window is
  open it also puts a green overlay on the next talent and red ones on mismatches. It never spends a
  point, clicks, imports a loadout or acts for you. The plan is kept in your SavedVariables file.

### Share code, version 1

One line of text, safe to paste into chat or a URL fragment. The web calculator and the addon use the
same format (see `docs/2026-10-17-talent-share-code.md`):

    EL1-<class>-<spec>-<build>-<payload>

| Field | Meaning |
|---|---|
| `EL1` | Format version 1. A reader refuses a version it does not know. |
| `class` | Lowercase class token, as `UnitClass` gives it, e.g. `mage`. |
| `spec` | The client's spec id for the class (Forever has one per class, 1482 to 1491), or `0` when unknown. |
| `build` | Client build the plan was made on, e.g. `1.60.1.70450`. A different build shows a warning because node ids can move. |
| `payload` | base64url (RFC 4648 section 5, no `=` padding) of the ASCII text `node:rank,node:rank:choice,...`. |

Payload items are in spend order: `node` is the client's trait node id, `rank` is the target rank (1 to
50), and an optional third number is the zero-based entry of a choice node. A node absent from the list is
planned at zero. Example: `EL1-mage-1482-1.60.1.70450-OTAwMDE6Miw5MDAwMjoxOjEsOTAwMDQ6Mg` carries
`90001:2,90002:1:1,90004:2`.

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
    python addon/tests/talents_contract.py
    python addon/tests/plan_contract.py

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
│   ├── talents.lua     your talent build per spec group, plus the game's own loadout string
│   ├── selftest.lua    /everloot selftest and /everloot talents
│   └── plan.lua        share code reader and the display-only plan panel
└── tests/              Lua 5.1 contract tests and their fixtures
```

Every Blizzard call is guarded, so a system missing from the client disables its module instead
of raising an error.
