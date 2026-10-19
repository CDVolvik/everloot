# addon/: the Everloot collector

The in-game addon for WoW: Forever. It records what you see while you play (sightings, loot
windows, vendors, full auction-house scans you start, recipes, trainers, your own gold, the world
position of each zone you enter) into its SavedVariables file, shows `/ask` answers from the
companion, and adds auction prices to item tooltips. It uses only the game's addon API and never
plays the character. Records match the upload contract (`packages/protocol`, see its `schema/records/`) field for
field.

**Status:** 0.3.3 beta. The automated contract tests pass; the in-client checks in
`docs/2026-10-08-beta-client-checklist.md`, `docs/2026-10-18-addon-0.3.2-beta-checklist.md` and
`docs/2026-10-19-addon-0.3.3-beta-checklist.md` are still open, and the full scan
(`docs/design/specs/2026-10-16-forever-market-design.md`) has not run in the Forever client.

## Run it

Download the zip from everloot.app/upload, or build it from the repository root:

    python scripts/package-addon.py

That writes `web/public/downloads/Everloot-<version>.zip`. Extract `Everloot/` into the Forever
client's `Interface/AddOns/`, `/reload`, then run `/everloot status`. Auction capture is off until
`/everloot auctions on`. Then, at the auction house, click **Everloot scan** (or type
`/everloot scan`) for a full scan: at most one every 15 minutes, read in chunks, summarised per item,
and the last three scans per realm kept. Nothing scans without that click. The list of your
installed addons is off until `/everloot addons on`; it is sent only from the upload page, after
its preview. `/everloot addons off` stops it and deletes every recorded addon row.

A scan that gets no answer from the auction house in 30 seconds stops and gives the cooldown back.
Tooltip prices show the date the companion last fetched them and flag them as stale after two days.
Nothing in the addon calls a buy, bid or post API; `addon/tests/market_contract.py` traps them.

## Completion tracker

Off until `/everloot completion on` (then `/reload`). It reads your achievements, reputation, titles and
completed quests with the calls Forever's own windows use, in chunks across frames, and waits out combat.
`/everloot completion` reads now; `/everloot completion off` deletes every row it wrote. It never tracks,
expands, clicks or changes anything.

- **Catalog rows** (`achievement_catalog`, `reputation_catalog`, `title_catalog`, `quest_chain_catalog`):
  ids, names, criteria text, standing headers and quest ids. No player data. The site lists an entry after 3
  installs report it identically.
- **Owned rows** (`achievement_owned`, `reputation_owned`, `title_owned`, `quest_owned`): your character's
  progress under an 8-digit key made from your install id and the character's GUID, never the name. They
  leave this file only from the upload page, with the collection choice ticked and a verified grant.
- A changed achievement or standing replaces its earlier row. Titles and completed quests are additions.
- The file stays bounded: at most 1500 achievements read, 600 progress rows per character, and about 3 MB
  of completion rows and remembered ids in all. A limit reached stops recording, says so once in chat that
  session, and `/everloot status` says which one.
- Combat (`PLAYER_REGEN_DISABLED` or `InCombatLockdown`) pauses a read between frames; it picks up when
  combat ends. `/everloot completion off` also stops a read that is under way.
- The reputation list is the rows the reputation window shows now; a collapsed header hides its factions
  and the module never expands one. `/everloot status` says how many headers were collapsed.

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
| `spec` | The client's spec id for the class (Forever has one per class; the builders study reads 1482 and 1484 to 1491 from Blizzard's files, pending `/everloot selftest`), or `0` when unknown. A plan with a spec id that differs from yours loads with a warning. |
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
    python addon/tests/market_contract.py
    python addon/tests/talents_contract.py
    python addon/tests/plan_contract.py
    python addon/tests/raid_contract.py
    python addon/tests/completion_contract.py

Run them from the repository root. CI also rebuilds the zip. For a version that is not released yet it
fails if the zip differs from the one committed in `web/public/downloads/`, so commit the rebuilt zip
with the change. For a version that is already tagged, the published zip stays as it is and the next
release builds a new one.

## Where things live

```
addon/
├── Everloot.toc        Interface 16001 (Forever 1.60.1), SavedVariables: EverlootDB
├── core.lua            event dispatch, module registry, toggles, rolling store, /everloot
├── modules/
│   ├── openworld.lua   target/mouseover sightings, loot windows, merchant windows
│   ├── guild.lua       roster, attendance, saved lockouts (published only through an officer)
│   ├── gear.lua        equipped item level sample, at most once an hour
│   ├── auctions.lua    full auction-house scans you start (Forever); listed buyouts on older clients; off until enabled
│   ├── gold.lua        your own gold: loot, quests, vendors, flights, mailed auction sales, postage, buyouts
│   ├── professions.lua recipe colours at your rank (C_TradeSkillUI); required rank and cost from trainer windows
│   ├── ask.lua         /ask stores a question; the companion's answers show after /reload
│   ├── addons.lua      your installed addons' names, titles and versions; off until enabled
│   ├── mapbounds.lua   each zone's corners in world coordinates, once per zone per build
│   ├── talents.lua     your talent build per spec group, plus the game's own loadout string
│   ├── completion.lua  achievements, reputation, titles, quest chains: catalogs and your progress; off until enabled
│   ├── selftest.lua    /everloot selftest and /everloot talents
│   ├── plan.lua        share code reader and the display-only plan panel
│   ├── raid_data.lua   raid buff list generated from web/src/data/game-data/raid-*.json
│   ├── raid.lua        /everloot raid: buffs missing per group, and a raid share code; display only
│   └── prices.lua      item tooltips: your latest scan and the companion's community prices
└── tests/              Lua 5.1 contract tests and their fixtures
```

Every Blizzard call is guarded, so a system missing from the client disables its module instead
of raising an error.
