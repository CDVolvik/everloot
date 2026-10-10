# Everloot companion

Desktop side of the addon, per the 2026-09-27 design (Part 3). Node/TypeScript core, chosen
2026-10-09. This first slice is the **uploader**; the file bridge for `/ask`, provider adapters and
memory come later. A signed installer is a separate owner step.

```
npm install
npx tsx src/cli.ts upload --file "<WoW>/WTF/Account/<ACCOUNT>/SavedVariables/Everloot.lua"
npx tsx src/cli.ts watch --game "<World of Warcraft folder>"
```

- Sends only events the site has not confirmed (`sent.json` in the app data folder:
  `%APPDATA%\Everloot`, `~/Library/Application Support/Everloot`, or `~/.config/everloot`).
- Named data (guild, gear, gold, collection) never leaves the machine from here; share it on the
  website with a verified grant.
- Reuses the site's parser and batching (`web/src/lib/sv-parse.ts`, `upload-batches.ts`), so
  `web` must be installed too. `--endpoint` targets another deployment; `--state` another state file.
- It only reads the file the game writes. It never touches the game client.
