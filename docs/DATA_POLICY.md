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

Blizzard hides some WoW: Forever item details until an item drops, and runs no public test realm.
Game files show what exists; play shows what is real. Everloot keeps the two apart and says which
is which.

**What the game files contain.** *Status: the table data is not published yet.* A maintainer can
read the item and spell tables (`ItemSparse`, `Item`, `SpellName`, `Spell`) of a game's current
build from the files Blizzard's launcher downloads from its public CDN, the same files every
player receives, and compare two builds field by field. Those snapshots and comparisons stay on the
maintainer's machine. Encrypted blocks are skipped, never decrypted: no decryption keys are loaded.
Nothing read from the game files is in the dataset, the API or the MCP server. On the site, only
the icons, tooltip text and frame art covered further down may appear, and the talent tree layout
described there.

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
The rules:

- **Only from unencrypted files** in the public client, read the same way as above. Nothing that
  needs a key.
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
  for it, can write to us at [everloot.app/contact](https://everloot.app/contact).
- **Same labels and spoiler rules as other game file data.** Presentation does not change them:
  an entry found only in the files still says *found in game files, unconfirmed*, and anything
  that could spoil unreleased content stays hidden, icon and text included, until the reader turns
  spoilers on.

**The talent calculator's tree layout.** The talent calculator at `/tools/talents` starts from the
tree layouts published by [Talents Forever](https://talentsforever.com/) under CC BY 4.0. They are
a third party's work, and they say it was read from the beta client; we have not checked that
ourselves. It is credited to them in the [source ledger](sources/LEDGER.md) and on the page, which
links the licence. The layout is labelled *found in game files, unconfirmed* and follows the
spoiler rules above. Icons and tooltip text shown with it follow the Blizzard rules above.

*Fan permissions are narrower than this.* As we read Blizzard's
[video policy](https://www.blizzard.com/en-us/legal/dd76b654-f2c4-4aaa-ba49-ca3122de2376/blizzard-video-policy),
its permissions for fan use of game material are non-commercial and Blizzard can revoke them. The
older Blizzard fan-site FAQ is only quoted secondhand to us, so we treat what it says as
unverified and rely on nothing from it. Everloot has no ads today. Before any ad goes live on a
page that shows Blizzard's assets, a legal review of Blizzard's current terms is required, and
until it is done there are no ads on those pages.

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
  layer, after a maintainer has reviewed it. Icons, tooltip text and frame textures never go into
  a pull request's data files; they are read from the client at build time.
- If you are unsure whether a source is allowed, open an issue first.
