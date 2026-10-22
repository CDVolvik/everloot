# Lane C, wave 5: version routing — closeout

The launch-day version routing: the `/beta` and `/ptr` prefixes, their canonical tags, and the page that says a
version has no snapshot. The site holds one client snapshot, of one build; this lane routes addresses to it and
says so where it does not have one. It does not add a second snapshot.

## What was built

- **The model.** The versions were already one list in `web/src/lib/game-version.ts` (Live, PTR, Beta, with the
  site's own "None running" and "Available at launch" notes), and the header label reads it. This lane adds
  `web/src/lib/build-versions.ts` beside it, not a second list:
  - `SERVED`: the version the unprefixed pages show (`served` in `web/src/data/build-versions.json`, Beta today).
  - `PREFIXES`: `/beta` and `/ptr`. Live has none: at launch it is the unprefixed pages.
  - `hasSnapshot(v)`: true only when the committed client layer is that version's product and build.
  - `versionHref(v, path)`: a version's own address for a page; the served version keeps the unprefixed path.
  - `WITHOUT_SNAPSHOT`: the prefixed versions that are not served (PTR today).
  The table is JSON because `web/next.config.js` is CommonJS and reads it for the rewrites; the tests hold the
  JSON to the TypeScript model.
- **The prefixes** (`web/next.config.js`, rewrites, ahead of the lore rewrite so `/beta/lore/npcs` still reaches
  the browse page):
  - the served version's prefix shows the same pages: `/beta` → `/`, `/beta/<path>` → `/<path>`;
  - any other prefix shows the notice: `/ptr` and `/ptr/<path>` → `/game-version/ptr`;
  - `/game-version/<id>` redirects 308 to `/<id>`, as `/lore/browse/<type>` does to `/lore/<type>`.
- **The canonical tags.** A page under the served prefix is the unprefixed page, so its canonical is the
  unprefixed URL and a crawler sees one answer for it. The notice page's canonical is its own prefix (`/ptr`)
  and it says `noindex, follow`. The sitemap is unchanged: it lists only unprefixed URLs. No live URL changed.
- **The notice** (`web/src/app/game-version/[id]/page.tsx`): "PTR game data — PTR: None running.", then which
  version and build every page shows. A version that has a build the site holds no snapshot of (Beta after the
  launch switch) says "Build <build>, which Everloot holds no snapshot of". On every other page the header label
  ("Beta · 1.60.1") already names the version shown.
- `docs/ASSETS.md`: the "URL plan, not built yet" paragraph now describes what is built, and the build steps gain
  step 4 (set `served`).

No `EVERLOOT_*` switch was added or changed; nothing here needs one.

## How it was verified

- `web/src/lib/build-versions.test.ts` (6 tests): the served version is the header's and the only one holding the
  snapshot; Live has no prefix; `versionHref`; the rewrites, run through Next's own path matcher and chained in
  order as Next's router does (`/beta/database/items/2589` → `/database/items/2589`, `/beta/lore/npcs` →
  `/lore/browse/npcs`, `/ptr/...` → `/game-version/ptr`, `/betamax` untouched); the internal route's redirect.
- `web/src/app/game-version/[id]/page.test.tsx` (3 tests): only PTR has a notice (Beta answers 404 there), the
  copy, the canonical `/ptr`, `noindex`, and the description length the site's other pages keep.
- `web/src/next-config.test.ts`: the existing lore and redirect tests, updated for the new rewrite and redirect.
- Not checked against a deployment: no preview was built or opened in this lane, so the rewrite chaining is
  verified against Next's matcher in the tests only. Check `/beta/lore/npcs`, `/beta/database/items/2589` and
  `/ptr` on the pull request's preview.

## The numbers

- web: 224 test files passed, 1 skipped; 2151 tests passed, 3 skipped. `tsc --noEmit` clean; `next lint` clean
  (no warnings in this lane's files).
- kb: 115 test files, 1211 tests passed. `tsc --noEmit` clean.
- New: 9 tests (6 routing, 3 notice page). Changed: 2 assertions in `next-config.test.ts`.

## What was not built, and what selecting a version's data needs

The site cannot show two versions' data at once, and this lane does not pretend to. Every reader takes the one
committed snapshot:

- `web/src/data/game-data/client-layer.json` (item and spell names, taxonomy, skills; read by
  `kb/src/client-layer-file.ts` and `web/src/lib/items.ts`), `client-digests.json`, `spell-values.json`,
  `map.json`, `talents/*.json`, `raid-<build>.json`. These are imported as modules, so they are fixed at build
  time. `game-version.test.ts` requires every one to name the same build.
- The art and the item tooltip facts: one public folder (`NEXT_PUBLIC_GAME_ASSETS_URL`) and one private bucket
  folder (`GAME_DATA_*`), each `<product>-<build>-<config>/`. The bucket already keeps one folder per build; the
  site has one address for each.
- The release database the MCP tools and lore pages read (one `.release/*.sqlite`).

To serve a second version's data the site would need: a second set of those layer files under a per-build
folder (or keyed by build), loaded by a reader that takes the version; a second asset base URL per version;
every page under a prefix rendered for that version (a `[version]` segment or one app route tree per version,
not a rewrite to the unprefixed page); `versionHref` in each page's `pageMetadata` path; and the sitemap
listing the non-served version's pages only if they are to be indexed. That is a change to the readers lanes A
and D own, and to every page, so it is out of this lane.

## Launch day

When Live arrives (the steps in `docs/ASSETS.md`, "Adding a product or build"):

1. Fill in Live's `product` and `build` in `game-version.ts`; give Beta its own build as a fixed value (it reads
   the layer's build today, so it would otherwise take Live's); regenerate the layers from the Live snapshot.
2. Set `served` to `"live"` in `web/src/data/build-versions.json`. The tests fail until 1 and 2 agree.
3. Then the unprefixed pages show Live at the same URLs, `/beta` shows the notice with Beta's build, and `/ptr`
   says "None running" until a PTR exists.

This needs the live client and is the launch-day check; nothing here was released ahead of it.
