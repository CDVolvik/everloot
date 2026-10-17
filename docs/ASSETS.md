# Blizzard icons, tooltip text and talent window art

How the talent calculator gets Blizzard's own icons, tooltip text and window art, and what a
maintainer does to put them on the site. The rules are in
[DATA_POLICY](DATA_POLICY.md) ("Blizzard's icons, tooltip text and window frame"). In short: only
from unencrypted files in the public client, read by our extractor; kept in asset storage with a
build stamp, **never in git**; credited on every page that shows them; pages only, never the API,
the MCP server or the data downloads.

The site works without any of this. With `NEXT_PUBLIC_GAME_ASSETS_URL` unset, or a manifest that
cannot be read, `/tools/talents/<class>` shows the text tiles it always had, with no error and no
credit line (the credit is there only when the art is).

## What the extractor makes

```
cd kb
npm run kb -- client-extract --product wow_classic_beta --refresh   # once per build, adds the spell and atlas tables
npm run kb -- client-assets data/client/<product>-<build>-<config>.sqlite
```

`client-assets` needs Python with [Pillow](https://pypi.org/project/pillow/) (`pip install pillow`).
Output goes to `kb/data/assets/<product>-<build>-<config>/` (gitignored, like all of `kb/data/`):

```
manifest.json            build stamp, label, counts, one entry per talent, file names and sha256
icons/<fileDataID>.webp  one icon per spell icon file, 64 px as the game stores it
frames/<name>.webp       node frames (round, square, choice; grey, green, gold), connector arrows,
                         the row gate piece and one background per spec
```

How it works, and what it will not do:

- **Icons.** `SpellMisc.SpellIconFileDataID` of each talent's shown spell. The BLP file is fetched
  from Blizzard's CDN the same way the DB2 tables are, and converted to lossless WebP.
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
  loaded and no listfile is used. A talent without an icon file shows its frame empty.
- Every record is labelled *found in game files, unconfirmed* and stamped with the build.

## Owner steps for the bucket

Nothing below has been done. The code never creates a bucket, touches DNS or changes an account.

1. **Bucket.** In the Cloudflare dashboard, R2, create a bucket, for example `everloot-game-assets`.
   Keep it separate from the uploads bucket.
2. **Public URL.** Give the bucket a public address: either a custom domain (for example
   `assets.everloot.app`, which needs a DNS record in the Everloot zone) or the free `r2.dev`
   address while testing. Taking it down later means removing that address or the files.
3. **CORS.** On the bucket, allow `GET` from `https://everloot.app` (and `http://localhost:3000` for
   local work), header `*`. The page reads `manifest.json` with `fetch`, which needs it; the images
   do not.
4. **Upload key.** Create an R2 API token with *Object Read & Write* on that bucket only. Keep the
   key id and secret out of git and out of the Vercel project; they are only for the upload.
5. **Extract.** On a maintainer machine with the game's build available from the CDN, run the two
   commands above. Read the console: it prints the counts of icons extracted, encrypted skipped,
   tooltips resolved and unresolved, and any frame piece that was not available.
6. **Upload.** In `web/`, with the key in the environment (never on the command line):

   ```
   export ASSETS_S3_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
   export ASSETS_BUCKET=everloot-game-assets
   export ASSETS_ACCESS_KEY_ID=...
   export ASSETS_SECRET_ACCESS_KEY=...
   node scripts/upload-game-assets.mjs ../kb/data/assets/<product>-<build>-<config> --dry-run
   node scripts/upload-game-assets.mjs ../kb/data/assets/<product>-<build>-<config>
   ```

   The script checks every file against the manifest (nothing missing, nothing extra, every hash,
   only `.webp`), uploads the files, and uploads `manifest.json` last. It lands under
   `<product>-<build>-<config>/`, so each build has its own folder and an older page keeps working.
7. **Turn it on.** In the Vercel project for `web/`, set `NEXT_PUBLIC_GAME_ASSETS_URL` to the public
   address plus the build folder, no trailing slash, for example
   `https://assets.everloot.app/wow_classic_beta-70450-84bea423`, and redeploy (the value is read
   at build time). Open `/tools/talents/hunter`: the icons, frames and the credit line appear. To
   turn it off, clear the variable and redeploy.
8. **Next build.** Repeat steps 5 to 7 with the new build. Check the counts against the last run
   before uploading; a jump in `iconsEncrypted` or `tooltipsUnresolved` means Blizzard changed
   something.

If Blizzard asks for any of it to be removed, delete the build folders from the bucket and clear the
variable. The page falls back to text tiles by itself.

## What to check on the site

At 1440 and 390 px wide: the icons sit inside the frames, the spec background shows behind each
tree, gold means full, green means a point can be added, grey means locked, multi-rank talents show
`rank/max` at the corner, the connector arrows are gold once the talent above is full, the tooltip
opens on hover, keyboard focus and a long press (Escape closes it), and the credit line is under the
trees. Each talent's accessible name still says its rank and whether it is locked, and its tooltip
text is read by a screen reader without hovering.
