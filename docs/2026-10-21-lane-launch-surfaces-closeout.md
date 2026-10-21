# Launch surfaces lane: closeout

2026-10-21. Branch `feat/launch-surfaces`, one PR against `main`. Web pages and their tests only. Nothing in
`kb/src`, the protocol package, the addon, the corpus route or the bulk export changed.

## What was already there

Most of the download surface existed, so this lane did not rebuild it:

- `/addon` already lists the addon zip (0.3.10, served from `web/public/downloads`) with its size and SHA-256,
  and the four Desktop App builds read from the newest `desktop-v*` GitHub release, each with a checksum and the
  unsigned-build warning. It carries the AGPL-3.0 badge and a `SoftwareApplication` block for each program.
- The header's button and the footer link both lead there, and the home page has a "Get the addon" block.
- `/connect` is a permanent redirect to `/docs`, and a test holds it there. The developer pages live under
  `/docs`, so item 3 is written there, not on a new `/connect`.

That follows the design's decision (one page, `/addon`, addon and app side by side). The header button now reads
"Get the addon" rather than the "Get App & AddOn" of the design text; the page it opens holds both. I left the
label alone, since I could not tell from the history whether the change was deliberate. It is a one-line change if you
want the old words back.

## What changed

| Page | Change |
| --- | --- |
| `/addon` | New section "Why run the addon" (`#why`): what it records, what the site gives back, what it never collects or publishes, and a closing paragraph saying the site is young, a fact needs three installs, and a drop rate is a share of recorded loot windows, not a promise. |
| `/` | The addon block links to `/addon#why`. The line under the agreement meter said "Nothing goes public on one person's word"; the player pages do, as unchecked pages, so it now says "No fact goes public on one person's word". |
| `/upload` | The Polestar Recorder text is its own block, "Already recording with Polestar?": no Everloot addon and no account needed, what the browser reads, what stays on the computer, and that a Recorder fact needs three characters on three addresses. The lede names both sources. |
| `/docs/guides/upload` | New section "Upload a Polestar Recorder file". |
| `/docs/api` | New section "What the feed holds": the six kinds a Recorder file adds, what one record says, that a record is one install's word, and that an empty answer is not a measured zero. |
| `/docs/api/keys` | A line saying a key reads the same feed, faster, and links to the section above. The free key and `EVERLOOT_API_KEY` text was already there and is unchanged. |
| `/methodology` | Says a Recorder fact needs three characters from three addresses, and (only while the player pages are on) that the player pages are the one exception and say their data is unchecked. |
| `/database/zones/[zone]` | A zone where players have confirmed nothing says so once, above the lists. Entrances read only from the game files do not count as confirmed. |
| `/database/zones` | A line under the title: a dash means unrecorded, not none; when no zone has anything it says that plainly. Hidden while storage is unreachable. |
| `web/src/lib/zones.ts` | One reader, `hasConfirmed`, beside `hasContent`. No new coverage model. |

### Copy that was wrong and is fixed

Three docs pages (`/docs/guides/desktop`, `/docs/guides/privacy`, `/docs/guides/upload`) said the Desktop App never
sends player rows. The data policy and the privacy page say it sends them when the player turns on "Send the player
pages with the uploads" in its settings, and the app has that switch. The three pages now say the same.

## What a player sees now that they did not before

- A reason to install, in plain words, on the page that has the download button, and a link to it from the home page.
- A plain list of what is never collected, taken from the data policy, not paraphrased more strongly than it reads.
- A player who only has the Polestar Recorder is told on the upload page that they can send its file without
  installing anything else, what leaves the browser, and that their report is not a fact until three others agree.
- A zone page, or the zone list, that says "nothing confirmed here yet" instead of a set of empty tabs or a column of
  dashes that could be read as a finished table.

A developer sees what the feed holds, that its records are single reports, and where the free key goes.

## Rules, checked

- Three installs: no new sentence promises a fact earlier. Tests assert the "three installs agree" and "not a promise"
  wording on `/addon`, and "a report, not a fact" on the upload page and in the guide.
- No new number is printed anywhere: no counts of installs, drops or players. Unknown values are not guessed.
- The `EVERLOOT_*` switches are untouched. The one conditional sentence (player pages, on `/methodology`) reads the
  existing `playerPagesOn()`, strict `=== "1"`, and is absent while it is off.
- No migration is assumed. The MCP tool schemas are untouched.
- Ads: no change to the addon, and `addon/tests/no_ads_contract.py` passes. None of the changes adds an ad slot.
- Licence and credit: unchanged; the footer credit line and the AGPL badge are as before.
- No page names a local path or an AI as an author; tests on `/addon` and across the docs check it.

## What I did not do, and why

- **The addon's own list of recorded things stays short.** The Recorder file yields entrances, bosses, treasures and
  minimap rares; Everloot's own addon does not record those yet (that is the addon lane's). `/addon` therefore lists
  only what addon 0.3.10 records, per the data policy, and the Recorder text sits on the upload page.
- **Nothing says the public feed can count installs.** The feed still leaves out `installId`, so records do not
  parse as installs yet. That fix is its own pull request. The developer text says only that records are single
  reports and that the site applies the three-install rule.
- **No live numbers on `/addon`.** The brief allows a "still nothing here" page; a live count would be a second
  coverage reader. The home and database pages already show the counts and empty meters.
- **No browser check of the layout** beyond the production build and the rendered-markup tests. [?] A look at the
  three columns on a phone width is worth doing on the preview deployment.

## For the coordinator

- The checks to read on the PR: Release checks (`guards`, `verify`) and the preview deployment.
- Nothing here needs an owner step: no migration, no switch, no secret.
- Open question for Carlos: whether the header label should go back to "Get App & AddOn".
