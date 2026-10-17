# Blizzard icons, tooltip text and interface art

How the site gets Blizzard's own icons, tooltip text, talent window art and map pictures, and what a
maintainer does to put them on the site. The rules are in
[DATA_POLICY](DATA_POLICY.md) ("Blizzard's icons, tooltip text and window frame"). In short: only
from unencrypted files in the public client, read by our extractor; kept in asset storage with a
build stamp, **never in git**; credited on every page that shows them; pages only, never the API,
the MCP server or the data downloads. Blizzard's marketing art (key art, logos, press kit,
wallpapers) is not part of this and is never used.

The talent art is decided. Everything else on this page (item, class, buff and profession icons,
item tooltip facts and map pictures) is a **proposed extension, pending approval** (DATA_POLICY,
"Proposed extension"). The code is in place and stays off until the owner sets the variables below.

The site works without any of this. With `NEXT_PUBLIC_GAME_ASSETS_URL` unset, or a manifest that
cannot be read in 2.5 seconds, every page shows the text it always had, with no error, no empty
image box and no credit line (the credit is there only when the art is). Without the private bucket
variables (`GAME_DATA_*`), item links stay plain while the other art still shows.

## Where the art shows

| Page | What appears |
| --- | --- |
| `/tools/talents/<class>` | Talent icons, tooltips, node frames and spec backgrounds |
| `/database/drops`, `/database/vendors/<id>`, `/tools/auctions` | Item icon beside each item link, the item's tooltip on hover and keyboard focus |
| `/database/items/<id>` | The item's tooltip as a card, once players have reported the item |
| `/tools/professions` | Profession icons as a picker |
| `/tools/raid` | Class, talent tree and buff icons |
| `/map` | The game's own continent and zone pictures under the zone outlines, with a switch to hide them |
| `/` | Class and profession icons, linking to the talent calculator and the profession hubs |

Every icon sits beside the name it already had, so it is marked decorative (`alt=""`,
`aria-hidden`). An item's tooltip text is also its link's description for screen readers.

Spoilers follow the same rule as everywhere else:

- **Items.** A page asks for an item's facts only when 3 installs have reported the item (a drop, a
  vendor offer, an auction scan). An id typed into a URL gets nothing, and nothing is read for it.
  The item facts live in a private bucket that only the site's server reads, because the extract
  holds every named item in the build, released or not.
- **Maps.** A held-back zone's picture shows only with spoilers on. A continent's own picture may
  show a held-back zone painted in, so on a continent that has one (by the map file or by the
  upload's own marks) it also waits for spoilers. Without it, the zone pictures show.

## What the extractor makes

```
cd kb
npm run kb -- client-extract --product wow_classic_beta --refresh   # once per build, adds the item, spell, atlas and map art tables
npm run kb -- client-assets data/client/<product>-<build>-<config>.sqlite
```

`client-assets` needs Python with [Pillow](https://pypi.org/project/pillow/) (`pip install pillow`).
It writes two folders under `kb/data/assets/` (gitignored, like all of `kb/data/`):

```
<product>-<build>-<config>/            -> the PUBLIC bucket
  manifest.json            build stamp, label, counts, one entry per talent, class, profession,
                           buff spell and map; file names and sizes, no hashes, no item data
  icons/<fileDataID>.webp  one icon per icon file (talents, items, classes, trees, professions, buffs),
                           64 px as the game stores it
  frames/<name>.webp       node frames (round, square, choice; grey, green, gold), connector arrows,
                           the row gate piece and one background per spec
  maps/<uiMapID>.webp      one picture per continent and zone, at the game's base zoom,
  maps/<uiMapID>-small.webp  and a copy at most 320 px for the zoomed-out view
  checksums.json           size and sha256 of every file above; the upload script checks it, it is
                           not uploaded

<product>-<build>-<config>-private/    -> the PRIVATE bucket
  items.json               build stamp, shard size, item count, each shard's size and sha256
  items/<n>.json           item tooltip facts, 512 item ids per file
```

Options: `--list lists/raid-buffs.yaml` (the default) names the raid buff spells whose icons the raid
builder shows. `--items <file>` limits items to the ids in a file (a JSON array or one id per line);
without it every named item in the build is written to the private folder.

How it works, and what it will not do:

- **Talent icons.** `SpellMisc.SpellIconFileDataID` of each talent's shown spell. The BLP file is
  fetched from Blizzard's CDN the same way the DB2 tables are, and converted to WebP.
- **Item icons and tooltips.** `Item.IconFileDataID` for the icon; name, quality, item level,
  required level, binding, slot, armour or weapon kind, weapon speed, stat kinds, flavour text and
  sell price from `ItemSparse` and `Item`. Stat amounts, armour and damage are worked out by the
  client from tables we do not read, so the tooltip shows `[?]` for them and says so. Which stat
  slots count is read from `StatPercentEditor` (a slot with a zero share is left out); that reading
  still has to be checked against a real snapshot.
- **Class, tree, profession and buff icons.** `ChrClasses.IconFileDataID`; each talent tree's
  `SkillLine.SpellIconFileID`; professions and secondary skills from `SkillLine` (categories 11 and
  9, top-level lines only); the raid buff list's spells from `SpellMisc`.
- **Map pictures.** `UiMapXMapArt` names each map's art, `UiMapArtTile` its tiles by row and column,
  `UiMapArtStyleLayer` the tile and picture size. The tiles of the base zoom layer are laid on their
  grid and cut to the picture, which covers exactly the rectangle `UiMapAssignment` gives the map, so
  it lines up with the zone outlines. Phased art is left out. A map with a missing, encrypted or
  unreadable tile is skipped and listed in `skippedMaps`, never drawn with a hole. The map page draws
  only the pictures in view, from their small copies until the reader zooms in.
- **Tooltip text.** `Spell.Description_lang` with its `$` variables resolved from `SpellEffect`,
  `SpellDuration`, `SpellAuraOptions` and other spells' rows: `$s1`-`$s3`, `$m`, `$M`, `$d`, `$t`,
  `$o`, `$a`, `$x`, `$h`, `$n`, `${...}` arithmetic, `$/1000;s1`, plural `$l`, `$@spellname`, and
  `$<spellid>s1` references. What it cannot resolve (conditions on the player's auras, named
  variables, other spells' text, an effect value of 0 that the tables hold for a number that lives in
  a triggered spell) becomes the placeholder `[?]`, and the manifest lists the tokens. Nothing is
  guessed. The tooltip says so when it holds a placeholder.
- **Frame art.** The client's own talent window pieces are named in its interface atlas tables
  (`UiTextureAtlasElement`, for example `talents-node-circle-green`); the extractor cuts each piece
  out of its atlas file. The per-spec backgrounds are named for the modern specs. Our Classic trees
  whose spec the client has no background for use the nearest one, and the manifest says which
  (`nearest: true`): Rogue Combat (Outlaw), Priest Shadow Magic (Shadow), Shaman Elemental Combat
  (Elemental), Druid Feral Combat (Feral).
- **Round or square.** Active talents get the round frame and passive ones the square frame, from the
  spell's passive attribute bit (`SpellMisc.Attributes`), not from a guess.
- **Encrypted or missing files** are counted in the manifest and the console and left out. No key is
  loaded and no listfile is used. A talent or item without an icon file shows without one.
- **Sizes.** Icons and map pictures are lossy WebP (quality 90 and 82); frame pieces stay lossless.
- Every record is labelled *found in game files, unconfirmed* and stamped with the build.

## Owner steps for the buckets

Nothing below has been done. The code never creates a bucket, touches DNS or changes an account.
Steps 2 to 4 and 8 are only for the proposed extension: wait for its approval.

1. **Public bucket.** In the Cloudflare dashboard, R2, create a bucket, for example
   `everloot-game-assets`. Keep it separate from the uploads bucket. Give it a public address:
   either a custom domain (for example `assets.everloot.app`, which needs a DNS record in the
   Everloot zone) or the free `r2.dev` address while testing. On it, allow CORS `GET` from
   `https://everloot.app` (and `http://localhost:3000` for local work), header `*`: the talent
   calculator reads `manifest.json` in the browser. The other pages read it on the server.
2. **Private bucket.** Create a second bucket, for example `everloot-game-data`, with **no** public
   address and no CORS. It holds the item facts.
3. **Upload key.** Create an R2 API token with *Object Read & Write* on those two buckets only. Keep
   the key id and secret out of git and out of the Vercel project; they are only for the upload.
4. **Server read key.** Create a second R2 API token with *Object Read only* on the private bucket
   only. This one goes into the Vercel project (step 7).
5. **Snapshot.** On a maintainer machine with the game's build available from the CDN, run
   `client-extract --refresh` (above) once for the build, so the snapshot has the item, map art and
   atlas tables.
6. **Extract and upload, one command.** In `web/`, with the upload key in the environment (never on
   the command line):

   ```
   export ASSETS_S3_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
   export ASSETS_BUCKET=everloot-game-assets
   export ASSETS_PRIVATE_BUCKET=everloot-game-data
   export ASSETS_ACCESS_KEY_ID=...
   export ASSETS_SECRET_ACCESS_KEY=...
   node scripts/upload-game-assets.mjs --snapshot ../kb/data/client/<product>-<build>-<config>.sqlite --dry-run
   node scripts/upload-game-assets.mjs --snapshot ../kb/data/client/<product>-<build>-<config>.sqlite
   ```

   `--snapshot` runs `client-assets` first and prints its counts: icons extracted, encrypted
   skipped, tooltips resolved and unresolved, items recorded, map pictures made and skipped, and
   any frame piece that was not available. Read them. To upload folders you already extracted, give
   the public folder instead (the private one is found beside it):
   `node scripts/upload-game-assets.mjs ../kb/data/assets/<product>-<build>-<config>`.
   `--skip-items` uploads without the item facts (item links then stay plain).

   The script checks each folder against its list (nothing missing, nothing extra, every hash, only
   images and the manifest for the public bucket, only `items.json` and `items/<n>.json` for the
   private one), refuses a private bucket that is the public one, uploads eight files at a time,
   tries a failed file again up to four times, and uploads `manifest.json` and `items.json` last.
   Both land under `<product>-<build>-<config>/`, so each build has its own folder and an older page
   keeps working.

   **Re-uploading.** Files go up with a one-year `immutable` cache, and the script never deletes
   anything. Uploading changed files into a folder that is already live does not refresh browsers or
   the CDN, and files from an earlier run stay. A changed extract goes to a new build folder (a new
   build gives one by itself); to change one in place, delete the folder in the dashboard and purge
   the cache first. Removing anything is done in the dashboard.
7. **Turn it on.** In the Vercel project for `web/`, set:
   - `NEXT_PUBLIC_GAME_ASSETS_URL`: the public address plus the build folder, no trailing slash, for
     example `https://assets.everloot.app/wow_classic_beta-70450-84bea423`. Read at build time.
   - For item tooltips, server-only (never with a `NEXT_PUBLIC_` prefix): `GAME_DATA_S3_ENDPOINT`
     (`https://<account id>.r2.cloudflarestorage.com`), `GAME_DATA_BUCKET` (`everloot-game-data`),
     `GAME_DATA_ACCESS_KEY_ID` and `GAME_DATA_SECRET_ACCESS_KEY` (the read-only key from step 4).
     The server reads `<GAME_DATA_BUCKET>/<build folder>/items.json`, where the build folder is the
     last part of `NEXT_PUBLIC_GAME_ASSETS_URL`, and only for the same build as the manifest.

   Redeploy. Open `/tools/talents/hunter`, `/database/drops`, `/tools/raid` and `/map`: the icons,
   pictures and the credit line appear. Pages read the manifest and item files again at most once an
   hour. To turn it off, clear the variables and redeploy.
8. **Next build.** Repeat steps 5 to 7 with the new build. Check the counts against the last run
   before uploading; a jump in `iconsEncrypted`, `tooltipsUnresolved` or `mapsSkipped` means
   Blizzard changed something.

If Blizzard asks for any of it to be removed, delete the build folders from both buckets and clear
the variables. The pages fall back to text by themselves.

## What to check on the site

At 1440 and 390 px wide:

- **Talents.** The icons sit inside the frames, the spec background shows behind each tree, gold
  means full, green means a point can be added, grey means locked, multi-rank talents show
  `rank/max` at the corner, the connector arrows are gold once the talent above is full, the tooltip
  opens on hover, keyboard focus and a long press (Escape closes it), and the credit line is under the
  trees. Each talent's accessible name still says its rank and whether it is locked, and its tooltip
  text is read by a screen reader without hovering.
- **Items.** On the drops, vendor and auction pages each item link has its icon in front; hovering
  or tabbing to the link opens the tooltip with the name in its quality colour; Escape closes it.
  An item page shows the tooltip card under the title. The credit line is at the bottom. No browser
  request ever goes to the private bucket.
- **Raid builder.** Class icons in the slots and the class picker, tree icons beside the tree names,
  buff icons in the coverage tables.
- **Map.** The zone pictures sit exactly inside the zone outlines; "Game map art" turns them off and
  "Zones" turns the outlines off. Zoomed out, the network tab shows only small copies. With spoilers
  on, the continent picture shows and a zone's own picture appears once you zoom in over it.
