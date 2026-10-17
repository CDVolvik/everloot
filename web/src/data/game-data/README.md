# Game data

Files in this folder are Blizzard's data, read from the WoW: Forever game files by `kb/src/client-extract.ts`
and cut down to the fields a page needs. They are **not under our licence** (CC BY-SA 4.0 covers our own
data, not these), and everything in them is **found in game files, unconfirmed**: being here does not mean
it is, or will be, in the game. Each file names the build it came from. Encrypted blocks were skipped, never
decrypted. See [docs/DATA_POLICY.md](../../../../docs/DATA_POLICY.md).

| File | What | Made by | Build |
|---|---|---|---|
| `map.json` | Continents and zones with their rectangles in world yards, and dungeon and raid entrance positions | `npm run kb -- client-map <snapshot>` (tables `Map`, `UiMap`, `UiMapAssignment`) | in the file's `source` |

Do not edit these files by hand. Regenerate them from a new snapshot (`client-extract`, then the command
above) and commit the result with the build in the message. Nothing from another project belongs here.
