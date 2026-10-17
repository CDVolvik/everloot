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

**What the game files contain.** *Status: not published yet.* A maintainer can read the item,
spell, talent (`Trait*`) and spell effect tables (`ItemSparse`, `Item`, `SpellName`, `Spell`,
`SpellEffect` and others, listed in `CLIENT_TABLES`) of a game's current build from the files
Blizzard's launcher downloads from its public CDN, the same files every player receives, and
compare two builds field by field. Those snapshots and comparisons stay on the maintainer's
machine. Encrypted blocks are skipped, never decrypted: no decryption keys are loaded. Nothing from
the game files is on the site, in the dataset or in the MCP server.

Publishing comes later, as a separate step. Once it ships, every entry from game files will:

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

**Open sources.** The lore archive is built from the Warcraft Wiki dump of 2023-11-13
(CC BY-SA 4.0). We may add other openly licensed datasets later. Each one goes in the
[source ledger](sources/LEDGER.md) with its licence and exact version before any of it ships.

**Facts we write ourselves**, in our own words, each with the page it came from and the date.

Game file data stays Blizzard's and is not under our licence. Everything else Everloot publishes is
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
- **Unreviewed spoilers.** Nothing from game files will be published without review, and anything
  that could spoil unreleased content will stay hidden unless the reader turns spoilers on.

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
  layer, after a maintainer has reviewed it.
- If you are unsure whether a source is allowed, open an issue first.
