# Everloot

An open data companion for **World of Warcraft: Forever**. The Everloot addon records what you
see while you play: drops, vendors, auction prices, recipes, trainers, your own gold. Uploads are
public as anonymous observations, and [everloot.app](https://everloot.app) states a fact (a drop
rate, a spawn point, a recipe range) once at least three installs have reported it, with the count
and the date beside it. It also hosts a lore archive and answers questions for AI
assistants over MCP.

The code is open under the AGPL-3.0 and the published data under CC BY-SA 4.0. Everloot doesn't
scrape other sites or read the game's memory, and it only publishes what players have actually seen
in the game, which leaves out datamined spoilers. The rules are in [`docs/DATA_POLICY.md`](docs/DATA_POLICY.md).

**Status:** beta. WoW: Forever launches on 2026-11-04.

## The parts

| Part | What it does |
|---|---|
| [`addon/`](addon/) | The in-game collector (Lua) and the `/ask` command |
| [`web/`](web/) | everloot.app: the database, tools, lore archive, upload page and MCP endpoints (Next.js) |
| [`kb/`](kb/) | The knowledge base: lore import, public releases, the MCP server (TypeScript, SQLite) |
| [`companion/`](companion/) | A desktop helper that uploads your file and answers `/ask` in game |
| [`supabase/`](supabase/) | The site's database schema |

[`docs/architecture.md`](docs/architecture.md) shows how they fit together.

## Use it

1. Download the addon from [everloot.app/upload](https://everloot.app/upload) and extract
   `Everloot/` into the game's `Interface/AddOns/`.
2. Play. Log out, or type `/reload`, to save.
3. Upload `WTF/Account/<account>/SavedVariables/Everloot.lua` at everloot.app/upload. You preview
   everything before it is sent.

## Run it locally

You need Node 22 and Python 3.12 (for the addon tests).

```bash
git clone https://github.com/CDVolvik/everloot.git
cd everloot
(cd kb && npm install)
cd web && npm install
npm run sample-release   # prints a KB_SNAPSHOT_PATH line: put it in web/.env.local
npm run dev              # http://localhost:3000
```

The sample release gives you about 35 lore pages to work with. Pages that need storage say it is
unavailable, which is expected locally. Each part's README has its test commands.

## Help out

You don't need to write code. Playing with the addon and uploading, or reporting a wrong fact,
helps as much as a pull request. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

- Questions and ideas: [GitHub Discussions](https://github.com/CDVolvik/everloot/discussions)
- Bugs and wrong data: [issues](https://github.com/CDVolvik/everloot/issues/new/choose)
- Chat: the Everloot Discord opens at launch
- What's planned: [`ROADMAP.md`](ROADMAP.md)
- Security problems: [`SECURITY.md`](SECURITY.md), never a public issue

## Licence

Code: [AGPL-3.0-only](LICENSE), © 2026 R21 Media Group, LLC and Everloot contributors.
Published data: CC BY-SA 4.0, credited to Everloot contributors. Third-party material:
[`THIRD_PARTY.md`](THIRD_PARTY.md); every source we have used: [`docs/sources/LEDGER.md`](docs/sources/LEDGER.md).
The Everloot name and logo are not covered by these licences: [`TRADEMARKS.md`](TRADEMARKS.md).

World of Warcraft is a trademark of Blizzard Entertainment, Inc. Everloot is a fan project and is
not affiliated with or endorsed by Blizzard.

## Maintainers

Project status and handoff notes are kept outside this repository. Design specs and plans are in
`docs/superpowers/`.
