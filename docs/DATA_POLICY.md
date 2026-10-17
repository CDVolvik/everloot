# Data policy

Where Everloot's data comes from, what we refuse to use, and why. It applies to the addon, the
site, the MCP server and every contribution. If a pull request adds data, it follows this page.

This is our reading of the rules, not legal advice.

## What we publish

**What players see in the game.** The Everloot addon records what happens around you while you
play: drops, vendors, auction prices you browse, recipes, trainers, gold in and out. You choose
when to upload. On the website you preview everything before it is sent. The companion sends only
anonymous open-world events and keeps named data (guild, gear, gold, collection) on your machine.
An open-world fact is published only after reports from at least three installs agree. Guild data is published only through an officer's
upload, and named records only with that person's sharing choice.

Blizzard hides WoW: Forever item stats until an item drops, and runs no public test realm. So for
Forever, play is the only honest source anyone has, Wowhead included.

**Open sources.** The lore archive is built from the Warcraft Wiki dump of 2023-11-13
(CC BY-SA 4.0). We may add other openly licensed datasets later. Each one goes in the
[source ledger](sources/LEDGER.md) with its licence and exact version before any of it ships.

**Facts we write ourselves**, in our own words, each with the page it came from and the date.

Everything Everloot publishes is CC BY-SA 4.0: anyone may reuse it with credit, and what they
build from it must stay under the same licence.

## What we refuse

- **Bulk scraping of any site.** No crawlers, no copying another database's rows, guides or text.
  If a site's terms or robots.txt say no, the answer is no.
- **Reading the game client's files or memory.** Blizzard's EULA forbids software that "mines"
  information from the game. The addon uses only the game's own addon API. The companion reads the
  SavedVariables file the game writes, and writes `/ask` answers into a file the addon loads after
  `/reload`; it never touches the running game.
- **Spoilers.** We publish only what players have actually seen in the game: no datamined items,
  quests, story or gear before they appear.

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
- If you are unsure whether a source is allowed, open an issue first.
