# Data policy

Where Everloot's data comes from, what we refuse to use, and why. It applies to the addon, the
site, the MCP server and every contribution. If a pull request adds data, it follows this page.

This is our reading of the rules, not legal advice.

## What we publish

**What players see in the game.** The Everloot addon records what happens around you while you
play: drops, vendors, auction prices you browse, recipes, trainers, gold in and out. The list of
your installed addons is recorded only if you turn it on with `/everloot addons on`, and it is
sent only from the website's upload page, after the preview names each addon. You choose
when to upload. On the website you preview everything before it is sent. The companion sends only
anonymous open-world events and keeps named data (guild, gear, gold, collection) on your machine.

Uploaded observations are public as individual, anonymous records, with no character names and
without the addon's install id, so anyone can check our counts. The facts the site states itself, such as drop rates, spawn points and recipe
ranges, appear only once at least three installs have reported them. Addon lists are the
exception to public records: they are never published row by row, only as counts for addons that
at least three installs report. Guild data is published only through an officer's
upload, and named records only with that person's sharing choice.

Full auction scans are not public records either. They feed market values only, and a value is
published when three distinct reporters scanned the item. For that count, an upload containing a scan
is stored with a keyed hash of the address it came from (never the address itself). The hash stays in
private storage and is never published.

Completion tracking (addon 0.3.3, off until `/everloot completion on`) follows the same split.
Four catalog kinds (`achievement_catalog`, `reputation_catalog`, `title_catalog`,
`quest_chain_catalog`) hold only game facts the addon read from the game's own calls: ids, names,
criteria text, standing headers and quest ids, with no player data. They reflect what one character's
windows list, so they are not on the public allowlist and never leave the site raw: the pages and the
MCP tool list an entry only after three reporters (distinct upload addresses, an IPv6 address counted by its /64 block, as the market counts them)
report it identically; there is no copied catalog, and flavour text is not collected. For that count an
upload containing a catalog row is stored with the same keyed address hash as a scan, kept private and
never published. Four owned kinds (`achievement_owned`, `reputation_owned`,
`title_owned`, `quest_owned`) hold one character's own progress under an opaque 8-digit key derived
from the install id and the character's GUID, never the name. They are named data in the `collection`
sharing category, like `collection_owned`, and are shown only while a verified install grant for that
category is live. All eight kinds are kept out of the public corpus and folded into a separate
completion rollup (latest row per character and entry). That rollup is private storage, but it records
which address hash and install created each catalog entry, so it links an address hash to an install
id. The link lasts until the rollup is rebuilt (`?rebuild=1`), which drops everything from uploads that
were deleted; deleting a player's uploads therefore takes a rebuild to remove the link. Turning the
module off deletes every one of these rows from the file.

The census (from the next addon release, off until `/everloot census on`) counts who plays what. It
records race, class, level and faction for your own characters as you log in, plus the realm name, and
for players you target, mouse over or group with. For other players it reads those four things only,
never their name, guild, gear or position. The addon keeps one row per character per day. Each row
carries the character's GUID, the game's id for it, only on the way to us: before anything is stored,
the site replaces it with a keyed hash (HMAC-SHA256 under a server secret) and keeps the server id, the
number inside the GUID that says which server the character is on. Without the secret nobody can turn a
GUID seen in game into our hash. If the secret is not set, census rows are dropped and nothing from them
is stored. So what is kept per character is the hash, the server id, race, class, level, faction, and
the realm name for your own characters, stored with the upload's install id like every other row.
Census rows (`census_self`, `census_seen`) are never published row by row and are kept out of the public
corpus, like addon lists. One install counts at most 500 players seen and 50 own characters a day, so
no one install can invent a crowd. Only counts are shown, and a count appears only when it covers at least 10
characters reported by at least 3 installs. Below that it reads "fewer than 10".

Blizzard hides some WoW: Forever item details until an item drops, and runs no public test realm.
Game files show what exists; play shows what is real. Everloot keeps the two apart and says which
is which.

**What the game files contain.** *Status: the table data is not published yet, except the talent catalog, the map layer, the
raid buff table, the client layer and the build changes described below.* A maintainer can read tables of a game's current build from the files Blizzard's
launcher downloads from its public CDN, the same files every player receives, and compare two
builds field by field. The [source ledger](sources/LEDGER.md) lists the tables we read. Those
snapshots and comparisons stay on the maintainer's machine. Encrypted blocks are skipped, never
decrypted: no decryption keys are loaded. Nothing else read from the game files is in the dataset, the
API or the MCP server; the client layer below is the one game-file layer they carry. On the site, only the talent catalog, the map layer, the raid buff table, the client layer, the build changes and
the icons, tooltip text and frame art covered further down may appear.

Publishing the table data comes later, as a separate step. Once it ships, every entry from game
files will:

- be labelled **found in game files, unconfirmed**: a record there does not mean it is, or will be,
  in the game;
- be **hidden by default** when it could spoil content that has not been released, behind a
  spoiler switch;
- be **reviewed by a maintainer** before it is shown as a discovery; nothing will be published
  automatically;
- come only from **unencrypted** data. Content Blizzard encrypts stays out;
- stay **Blizzard's data**: shown as facts with the build it came from, kept apart from our
  CC BY-SA data and not under our licence;
- credit **WoWDBDefs**. The column names come from the
  [WoWDBDefs](https://github.com/wowdev/WoWDBDefs) table definitions by the WoWDBDefs contributors,
  which are under CC BY-SA 4.0, so every page or file that shows them will name WoWDBDefs and link
  its licence.

When players later see the same thing in the game, the entry will show both: found in the files
and observed in play.

**Blizzard's icons, tooltip text and window frame.** Decided 2026-10-18: our tools may show
Blizzard's own talent and spell icons, the spell and talent tooltip text, and interface frame
textures that make a tool look like the in-game window. Wowhead and most calculators do the same.
Neither this decision nor the extensions below cover Blizzard's marketing art (key art, marketing
logos, press kit, wallpapers), which the site does not use. The game's own logo, read from its
interface files, is a different thing and is covered by the second extension. The rules:

- **Only from unencrypted files** in the public client, read the same way as above. Nothing that
  needs a key.
- **Extracted by a maintainer, kept out of git.** A maintainer extracts them from the local game
  client and uploads them to Everloot's asset storage with a build-stamped manifest. They are
  never committed to the git repository.
- **Stamped with the build** they came from, on the page and in the file name or manifest.
- **Still Blizzard's.** We do not relicense them. They sit outside our CC BY-SA 4.0 data and our
  AGPL-3.0 code, and each page that shows them says so. The licence notes of every release file
  that includes them say so too.
- **Credited on every page that shows them**: "Icons, tooltip text and interface art are
  © Blizzard Entertainment, Inc. Everloot is a fan project and is not affiliated with or
  endorsed by Blizzard."
- **Pages only.** The data downloads, the API and the MCP server carry ids and facts, plus a link
  to the page where the icon and text are shown. They do not carry icon files, tooltip text or
  frame textures in bulk. If you want Blizzard's art in your own project, take it from the game
  client yourself.
- **Taken down on request.** If Blizzard asks us to remove any of it, a maintainer removes it
  promptly, from the site first and from later releases after that. Blizzard, or anyone speaking
  for it, can write to us at hello@everloot.app or through
  [everloot.app/contact](https://everloot.app/contact).
- **Same labels and spoiler rules as other game file data.** Presentation does not change them:
  an entry found only in the files still says *found in game files, unconfirmed*, and anything
  that could spoil unreleased content stays hidden, icon and text included, until the reader turns
  spoilers on.

**Extension: item, class and profession art, item tooltip facts and map pictures.** Decided
2026-10-18 (Carlos: "Approved, ship it"). The rules above also cover:

- **Icons beyond talents and spells**: item icons, and class, talent tree, raid buff and profession
  icons, read from the client's tables the same way.
- **Item tooltip facts**: what the item tables (`ItemSparse`, `Item`) give for an item: name,
  quality, item level, required level, binding, slot, armour or weapon kind, weapon speed, stat kinds
  (not amounts), flavour text and sell price. Shown on a page only for an item that 3 installs have
  reported (a drop, a vendor offer, an auction scan), never in bulk and never for an id someone types
  into a URL. The extracted facts cover every named item in the build, released or not, so they are
  kept in private storage that only the site's server reads, never in the public asset bucket.
- **Map pictures**: the game's own continent and zone map art from the map art tables, laid under
  our zone outlines. A held-back zone's picture shows only with spoilers on, and so does a continent's
  picture when that continent has a held-back zone, since it may be painted in.
- **The `/database` pages** (decided 2026-10-18 by the maintainer): the icons of the spells an item is
  created by or used in (from the client layer's relations) beside those relations, and pet family
  icons (`CreatureFamily.IconFileID`) in the manifest. Item icons and names on these pages follow the
  item tooltip rule above: only for items 3 installs reported, never in bulk and never for every id.

**Second extension: loading screens, race and faction emblems, spell tooltips and the game's logo.**
Decided 2026-10-18. Carlos: "Approved next: (1) loading-screen art as page banners (zones, dungeons,
raids; e.g. map zone panels, raid builder, patch notes header), (2) race and faction emblems (the
race x class table on /wow-forever, census later), (3) spell/ability icons with hover tooltips where
spells are named (patch notes /changes, raid builder buffs, talent pages already have them), (4) a
launch banner at the top of the home page: the game's WoW: Forever logo from the game's own files
plus our existing countdown plus loading-screen art, with 'Not affiliated with or endorsed by
Blizzard Entertainment' visible on the banner itself." And: "Glint (mascot) is NOT part of this
batch." The rules above also cover:

- **Loading screens**: the picture each continent, dungeon and raid shows while it loads (`Map`,
  `LoadingScreens`), as page banners and beside dungeon and raid entrances on the map. A dungeon or
  raid added after the original world (a later map id) has its picture shown only with spoilers on.
- **Race and faction emblems**: the client's race icons and the Alliance and Horde emblems, named
  pieces of its interface atlases. Only the races Blizzard has announced for WoW: Forever are
  extracted.
- **Spell tooltips where a spell is named**: the raid builder's buffs, and the talents and raid buffs
  a patch note names, with the same icon and tooltip text as the talent calculator.
- **The game's own WoW: Forever logo**: the logo piece in the client's interface atlas
  (`logo-wow-forever`), read like the other pieces. It appears only on the home page's launch
  banner, and only with "Not affiliated with or endorsed by Blizzard Entertainment" visible on the
  banner itself; the game's name beside it is plain text. It is never used to suggest that Blizzard
  made, approves or supports Everloot. No logo in the files means no banner: Blizzard's marketing
  logos and art are still never used, not even as a stand-in.

**Third extension: game icons and tooltip text in embeddable cards.** Decided 2026-10-19 (Carlos
approved it with the site structure plan). The hover card any site can show through
`https://everloot.app/tooltips.js` and `GET /api/tooltip/<type>/<id>` may carry one item's game icon
and tooltip facts, the same ones its page shows:

- **One item per request**, and only for an item its page would show them for (3 installs reported
  it). Never in bulk, never for an id nobody reported.
- **Labelled and credited in the card**: *found in game files, unconfirmed*, the build, and the
  Blizzard credit above. The icon is a link to our asset storage, not a copy in the response.
- **Same spoiler and takedown rules** as the pages. The downloads, the rest of the API and the MCP
  server still carry no icons or tooltip text.

**The talent catalog.** The talent calculator at `/tools/talents` uses our own catalog, read from
the public client by a maintainer, not taken from any other site. The catalog is the trait node
ids, positions, ranks, gates, prerequisites, spell ids, talent names and the build stamp. This is
one of three table data exceptions to the status above, with the map layer and the raid buff
table below. It may
be published on the site, and it may be committed to the git repository as a clearly marked
game-data file with a README that says it is Blizzard's and outside our licence. It is labelled
*found in game files, unconfirmed* until someone has checked it in the game, and the spoiler rules
above apply. Tooltip text, icons and frame art shown with it keep the rules above: asset storage,
not git.

**The map layer.** From the map tables we publish zone rectangles (`UiMapAssignment`), continents
and instances (`Map`, `UiMap`) and dungeon and raid entrance points (`Map.Corpse`), each stamped
with the build it came from. Like the talent catalog, it may be shown on the site and committed as
a clearly marked game-data file in `web/src/data/game-data/`, with a README that says it is
Blizzard's and outside our licence. It is labelled *found in game files, unconfirmed* until
checked in game. General rule: new zones or other content found only in the game files stay hidden
unless the reader turns spoilers on. A zone that looks unreleased is held back until it is live: the file keeps it apart (`heldBackZones`), and `/map` draws it, dashed and labelled *found in game files, unconfirmed*, only when the reader turns the spoiler switch on (off by default). The public MCP tool leaves held-back zones out altogether.
The map layer itself carries no art. The game's map pictures are part of the extension above: never
committed, and kept in asset storage like the other Blizzard art.

**The raid buff table.** The raid builder at `/tools/raid` and its in-game view use our own table of
group buffs and debuffs, read from the spell tables in the public client. For each effect it holds
the effect id, its name, the class, the spell ids, who it reaches (party, raid, target), per rank
where ranks differ, and the talent tree it needs where the game files prove that link, each with
the build stamp. It holds no tooltip text. Like the talent catalog, it may be shown on the site
and committed as a clearly marked game-data file in `web/src/data/game-data/`, with a README that
says it is Blizzard's and outside our licence, and the addon may carry the same facts. It is
labelled *found in game files, unconfirmed* until checked in game, and the spoiler rules apply.

**The client layer.** Decided 2026-10-18 by the maintainer: item categories (class, subclass,
slot and quality) and relations read from the game files may be published on the site and through
the MCP server, the API and the bulk download. The relations are *created by* (a spell's create-item
effect, `SpellEffect`), *reagent for* (`SpellReagents`), *part of set* (`ItemSet`), *same icon*
(items that share an icon file, `Item.IconFileDataID`) and, since 2026-10-18, *profession* (the
skill line that teaches a spell, `SkillLineAbility` and `SkillLine`, with the profession's name).
They are facts: ids and the relation between them, with no Blizzard text and no art. The rules:

- Every entry is labelled *found in game files, unconfirmed* and stamped with the build it came from,
  on the page and in every answer. On a page the label is written once per section, not on every
  row; in an answer it travels with the rows.
- It is Blizzard's data, kept apart from our CC BY-SA data: an API answer gives it its own notice
  (`gameData`) beside our `attribution`, and the file carries its own credit, WoWDBDefs included.
- It is committed as one game-data file, `web/src/data/game-data/client-layer.json`, regenerated by
  the build watch with each build, so every change to it goes through a reviewed pull request.
- Relations players see in the game (dropped by, sold by, reward from, located in) keep the
  three-install rule. Where both exist, a page shows both, each with its evidence.
- Forever has no live build yet, so every entry comes from a pre-release build. Entries are not
  marked one by one as spoilers: the layer holds ids and relations only, no names, text or art.
- How it sits with the item tooltip facts above: class, subclass, slot and quality are public for
  every item through this layer. The rest of an item's tooltip (name, item level, required level,
  binding, weapon speed, stat kinds, flavour text, sell price) and its icon stay in private storage
  and appear only for items 3 installs reported, as the extension says.

**Build changes, beta builds included.** Decided 2026-10-18, the same way Wowhead and other
datamining sites work: when Blizzard ships a new build, a reviewed pull request records what
changed in the tables we read, and that change list may be public in the PR text and committed in
`web/src/data/game-data/changes/`. This includes builds that are not live yet, such as the beta,
and the numbers in the files: spell effect values, durations and the like. Every entry carries
its build and is labelled *found in game files, unconfirmed*. Anything that could spoil
unreleased content is marked as a spoiler and hidden on the site unless the reader turns spoilers
on; the repository itself is public, so the marking is a warning, not a lock. Encrypted content
stays out, because we never decrypt. Description and tooltip text is not part of these files.

**Blizzard's own posts.** The "what changed" page at `/changes` lists posts by Blizzard staff on
the WoW forum and by the official World of Warcraft account on Bluesky, and the game builds
Blizzard's version service reports.

- *Excerpts only.* For each post we keep the title, the author and role, the time, the category,
  an excerpt of at most two sentences (300 characters) and a link to the original. The text is
  Blizzard's, so we never copy a post in full. A maintainer may add a one-line summary in our own
  words; nothing writes one automatically.
- *Sources.* Forum posts come only from a short list of named Blizzard staff accounts, and only
  from the WoW: Forever and WoW Classic categories. Bluesky posts come only from the verified
  official World of Warcraft account, and only when they are about Forever or Classic. No
  third-party tracker is read or copied.
- *Robots and manners.* The reader checks robots.txt before every run and uses public JSON only.
  Blizzard's forum `.rss` routes are disallowed by its robots.txt, so we never use them. It names
  itself (`Everloot/1.0`, with a contact address), never follows a redirect, and stops when a
  server answers 429 or a server error, honouring Retry-After.
- *Polling cap.* At most once every 30 minutes, at most 3 pages of 30 items per source per run,
  stopping at what it already saw. A source asked less than 25 minutes ago is skipped.
- *Build times.* A build's time on that page is when Everloot first saw it, not when Blizzard
  released it.

*Fan permissions are narrower than this.* As we read Blizzard's
[video policy](https://www.blizzard.com/en-us/legal/dd76b654-f2c4-4aaa-ba49-ca3122de2376/blizzard-video-policy),
its permissions for fan use of game material are non-commercial and Blizzard can revoke them. The
older Blizzard fan-site FAQ is only quoted secondhand to us, so we treat what it says as
unverified and rely on nothing from it. Since PR #62 (2026-10-17) Everloot shows clearly labelled
Google ads on the tools, the patch notes, the home page and database pages that have content, and
none on the upload page, the privacy page, account pages or the lore archive; the privacy policy and
the terms describe them. Some of those pages show Blizzard's icons and tooltip text. Whether that
sits within Blizzard's current terms is the operator's call to review; if the review says no, the
ad slots come off those pages, not the assets.

**The addon and project tracker.** `/addons/ecosystem` lists WoW: Forever addons and tools that a
maintainer has checked and added to `kb/curated/ecosystem.json`.

- *GitHub facts only.* For each project we read public repository facts from GitHub's REST API: stars,
  latest release, last commit, commit and issue counts, a contributor count, and the `## Interface` line
  of the project's `.toc`. No usernames, emails or contributor lists are kept or shown, and no person is
  ranked. The boards rank projects.
- *Polite and slow.* Serial requests, at most every three hours per project, an optional token, and a stop
  (never a retry storm) when GitHub says to wait.
- *Installs.* A project's install count comes from our own addon-list uploads and appears from three
  installs up, like `/addons/popular`. A project with fewer shows "not counted", never zero.
- *Other hosts are link only.* CurseForge's API terms forbid caching its data, Wago documents no read API
  for listings and WoWInterface's terms forbid automated access, so we read none of them.
- *Opt-out.* An author can ask to be removed with the ecosystem issue form or at hello@everloot.app.

**Open sources.** The lore archive is built from the Warcraft Wiki dump of 2023-11-13
(CC BY-SA 4.0). We may add other openly licensed datasets later. Each one goes in the
[source ledger](sources/LEDGER.md) with its licence and exact version before any of it ships.

**Facts we write ourselves**, in our own words, each with the page it came from and the date.

Game file data, and the icons, text and art shown on our pages, stay Blizzard's and are not under
our licence. Everything else Everloot publishes is
under CC BY-SA 4.0: anyone may reuse it with credit, and what they build from it must stay under the
same licence.

## What we refuse

- **Bulk scraping of any site.** No crawlers, no copying another database's rows, guides or text.
  If a site's terms or robots.txt say no, the answer is no.
- **Touching the running game.** No reading or changing the game's memory, no automation, no
  bypassing protections. The addon uses only the game's own addon API. The companion reads the
  SavedVariables file the game writes, and writes `/ask` answers into a file the addon loads after
  `/reload`.
- **Decrypting game data.** Content Blizzard encrypts stays encrypted.
- **Bulk exports of Blizzard's art or text.** Icons, tooltip text and frame textures appear on
  pages only, never in the downloads, API or MCP server.
- **Unreviewed spoilers.** No game file entry is shown as a discovery without review, and anything
  that could spoil unreleased content stays hidden, icons and text included, unless the reader
  turns spoilers on.

Blizzard's EULA forbids unauthorized software that "intercepts, collects, reads, or 'mines'
information generated or stored by the Platform." Studying released game files offline is a long
community practice that Blizzard has tolerated, and we read only what its CDN serves to every
player. If Blizzard asks us to stop, we will.

## Wowhead

We link to Wowhead and never copy it. Looking up single facts there is allowed only if every one
of these holds:

1. **Nothing is built until the terms allow it.** A maintainer reads Wowhead's Terms of Use and
   confirms that automated lookups of single pages are not prohibited, or Wowhead gives permission.
   If the terms forbid it, the feature is dropped. As of this writing, it has not been built.
2. **Facts only:** ids, levels, coordinates and looted counts. No text, images or guides.
3. **Gaps only:** a lookup runs for an entity our own data lacks or disputes. No crawling, and never
   Wowhead's list or random pages.
4. **Honest and slow:** the user agent is `EverlootFacts/1.0 (+https://everloot.app/contact)`, never
   a browser string or a bot name Wowhead blocks. At most one request every few seconds, and every
   response is cached so a page is fetched once.
5. **Local only.** The facts are kept apart, marked not publishable, and used only to check and fill
   gaps in our own observations. They are never republished on the site, in the dataset or by the
   MCP server unless Wowhead gives written permission.
6. **Run by a maintainer**, never by an automated agent. The script lives in this repository, so
   anyone can read exactly what it does.

## Contributing data

- Name the source in your pull request and add it to the [source ledger](sources/LEDGER.md).
- Only sources whose licence allows republishing under CC BY-SA 4.0 can reach a release. Anything
  else stays local and is marked not publishable; the release build refuses it.
- The one exception is the game file layer described above. That data is Blizzard's, so it never
  enters the CC BY-SA release; once publishing ships, it reaches the site only as its own labelled
  layer, after a maintainer has reviewed it. Icons, tooltip text and frame textures are never
  committed to the git repository, so a pull request must not include them. A maintainer extracts
  them from the local game client and uploads them to Everloot's asset storage with a
  build-stamped manifest.
- If you are unsure whether a source is allowed, open an issue first.

## Using our data: credit, limits and keys

Everloot's data stays open. Anyone may read it, copy it and build on it under CC BY-SA 4.0. Two
things are asked in return: credit it, and use a free key when you copy all of it.

- **Credit.** Show this line, with the link, wherever the data appears: "Data from Everloot
  (https://everloot.app), CC BY-SA 4.0." What you build from it stays under the same licence. Every
  answer carries it so it is hard to lose by accident: the JSON APIs return it in an `attribution`
  field (licence, credit line, the page the data comes from) and in the `X-Everloot-Licence`,
  `X-Everloot-Credit` and `Link` headers, and MCP answers built on player data end with the licence
  and credit. Republishing the data without credit breaks the licence.
- **Asking questions is free and needs no key.** The MCP server and the market prices keep a
  per-address limit that a person or an AI assistant answering questions does not reach.
- **Copying in bulk takes a free key.** Once the limits are switched on, the corpus API and the drop
  list answer a few requests an hour per address without a key, one page of records at a time. An
  IPv6 address counts by its /64 block. A free key, made on
  [/connect](https://everloot.app/connect#keys) after signing in with Battle.net, raises the limits
  far enough to copy everything. The allowance belongs to the account, across all its keys, and an
  account can make only a few keys a day, so new keys do not bring new allowances. Requests are
  counted per key, so we know who copies the data in bulk and can ask what they are building. Keys
  can be revoked or deleted by their owner at any time, and revoked by us when a key is used to
  republish the data without credit. The exact numbers are on /connect.
- **Pages are not limited.** Search engines and AI assistants may read and quote the site's pages.
  These limits apply only to the machine-readable endpoints.
- **Not covered.** Game-file data and Blizzard's posts are Blizzard's, not ours; the credit line and
  the licence above do not apply to them. The code is AGPL-3.0 and has its own terms.

**What we keep about keys, and for how long.** For each key: a one-way hash of it, its last four
characters, its label, its account, when it was made, last used and revoked, and a count of its
requests per day and endpoint. Not what was asked. Daily counts are kept 90 days. A revoked key and
its counts are deleted 30 days after it was revoked, or at once when its owner deletes it on
/connect. Deleting an account (write to hello@everloot.app) deletes its keys and counts. Anonymous
requests are counted per hour against a keyed hash of the address, which is deleted after about a
day; the address itself is never stored.
