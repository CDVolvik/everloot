# Listing the Everloot MCP server (2026-10-18)

Where the public MCP server (`https://everloot.app/mcp/public`) gets listed so assistants and their
users can find it, what each place needs, what is done in the repository, and what only the owner can
do. Facts below were read from each platform's documentation on 2026-10-18; links are inline. Re-read a
platform's page on the day you submit, these portals change.

## What every listing says

Use the same words everywhere, so the listings match the site and each other.

| Field | Text |
|---|---|
| Name | `Everloot` (registry name `app.everloot/knowledge`) |
| One line (≤100, registry) | WoW: Forever lore and player-observed drops, vendors, quests, professions and talents, with sources. |
| One line (≤200, Claude) | Look up WoW: Forever lore and what players actually saw in play: drop rates, vendors, quests, professions, map pins and talents. Every answer carries its source and licence. |
| Short description (≤30, ChatGPT) | WoW: Forever data with sources |
| Description (≤2,000) | see [Long description](#long-description) |
| Categories | Gaming; Reference / Data; Developer tools (pick what the portal offers, in that order) |
| Endpoint | `https://everloot.app/mcp/public` (streamable HTTP, no sign-in, 200 requests per hour per IP) |
| Authentication | None. Public data only; nothing acts on a user's account. |
| Documentation | `https://everloot.app/connect` |
| Privacy policy | `https://everloot.app/privacy` |
| Terms | `https://everloot.app/terms` (shipped by the legal-pages pull request; until it merges, `https://everloot.app/connect#licence`) |
| Support | `hello@everloot.app`, `https://everloot.app/contact` |
| Website | `https://everloot.app` |
| Source | `https://github.com/Everloot/everloot` (AGPL-3.0-only) |
| Icon | `web/public/icon-512.png` and `icon-64.png`, rendered from the site icon (`https://everloot.app/icon-512.png` once deployed) |
| Reads or writes | Reads only. Every tool carries `readOnlyHint: true` and a `title` (checked against the live endpoint on 2026-10-18: 22 tools, all annotated). |
| Data handling | Our own API. No personal health data, no sponsored content, no conversation data collected. |

### Long description

> Everloot answers questions about World of Warcraft: Forever from two sources it names on every
> answer: the Warcraft Wiki archive (CC BY-SA 4.0, with the article each fact came from) and what
> players reported through the Everloot addon. A player-reported fact (a drop rate, a vendor's price, a
> quest's rewards, where an NPC stands, which recipe turns yellow) is stated only once three separate
> installs reported it, and the answer says how many did and when the data was last updated. Nothing
> is scraped from other sites and no fact is guessed: when something is not recorded yet, the tool says
> so instead of making a number up.
>
> 22 read-only tools: search the lore archive, open one record, look up an item, NPC, object, quest or
> vendor, find what is near a spot on the map, follow relations (dropped by, sold by, reagent for),
> browse item categories, plan a profession, read recipe skill ranges, check auction history and market
> values, a gold ledger, a guild board, Blizzard's latest posts and builds, and the addon ecosystem.
> Game-file facts are labelled "found in game files, unconfirmed" with their build. Data is CC BY-SA 4.0
> with a credit line in every answer; the code is open source. No account, no key, no sign-in wall.

### Test cases (for reviewers)

Prompts a reviewer can run against the public endpoint. Each names the tool it should trigger.

| # | Prompt | Tool | Expected |
|---|---|---|---|
| P1 | Who is Thrall? | `search_knowledge` or `get_by_name` | A lore summary with the Warcraft Wiki source URL and licence |
| P2 | What does item 19019 connect to? | `entity_relations` | Relations grouped by kind, each saying "observed" with an install count or "in game files" with a build; or "unrecorded" |
| P3 | What are the latest WoW: Forever builds and Blizzard posts? | `recent_changes` | Newest first, with links to the originals and excerpts only |
| P4 | Which Forever addons are most installed? | `ecosystem_projects` | A ranked board with GitHub facts and install counts from three or more installs |
| P5 | What is near Elwynn Forest at 40, 60? | `world_map_near` | Entrances (game files) and observed NPCs or vendors with distances, or a clear "none recorded" |
| N1 | Buy me a mount | none | The assistant explains the tools read data and cannot act in the game |
| N2 | What is the drop rate of item 999999999? | `item_page` | "Unrecorded, not zero", never an invented rate |
| N3 | Show me player names who looted Thunderfury | `item_page` | No names: install counts only |

## 1. Official MCP Registry (done in code; publish is one command)

The community registry at `registry.modelcontextprotocol.io` is what Smithery, PulseMCP and others
ingest from, so it comes first. Docs: [quickstart](https://modelcontextprotocol.io/registry/quickstart),
[remote servers](https://modelcontextprotocol.io/registry/remote-servers),
[authentication](https://modelcontextprotocol.io/registry/authentication). The registry is in preview and
may reset.

- **`server.json`** at the repository root describes the remote server: name `app.everloot/knowledge`,
  one `streamable-http` remote, version `0.8.0` (the MCP server's `SERVER_VERSION`; bump both together).
  `mcp-publisher validate` passes.
- **Namespace proof** is the HTTP method: `web/public/.well-known/mcp-registry-auth` holds the public
  key record (`v=MCPv1; k=ed25519; p=…`). The matching private key is on the maintainer machine only,
  under the user's `.r21` folder, never in the repository.
- **Publish**, after the file is live at `https://everloot.app/.well-known/mcp-registry-auth`:

  ```sh
  mcp-publisher login http --domain everloot.app --private-key "$(openssl pkey -in ~/.r21/everloot-mcp-registry-key.pem -noout -text | grep -A3 "priv:" | tail -n +2 | tr -d ' :\n')"
  mcp-publisher publish
  curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=app.everloot"
  ```

  A new version is a new `version` in `server.json` and another `publish`; versions are immutable.

## 2. Claude connectors directory (owner, about 20 minutes)

Docs: [Submit a connector](https://claude.com/docs/connectors/building/submission). Anyone on a paid
Claude plan can submit at [claude.ai/directory/manage](https://claude.ai/directory/manage) → **Submit
new** → **MCP connector**. The submission is scanned automatically and listed as a Community connector
by default; some get a human review. Escalations: `mcp-review@anthropic.com`.

Portal steps and what to paste, in order:

1. **Connection**: `https://everloot.app/mcp/public`.
2. **Tools**: sync from the server. Nothing should be flagged (title and `readOnlyHint` on all 22).
3. **Listing**: name `Everloot` (≤100), the ≤200 one-liner, the long description, categories, documentation
   `https://everloot.app/connect`, privacy `https://everloot.app/privacy`, support `hello@everloot.app`,
   icon `icon-512.png`, slug `everloot` (permanent).
4. **Use cases**: looking up WoW: Forever lore and player-observed game data while planning a character,
   a route or a purchase; nothing to set up before connecting; reads data only.
5. **Company**: Everloot (R21 Media Group, LLC), `https://everloot.app`, contact Carlos.
6. **Authentication**: no authentication.
7. **Data handling**: our own API; no personal health data; no sponsored content.
8. **Test & launch**: "No account needed. Add the URL as a custom connector and run the prompts P1 to P5
   and N1 to N3 from the documentation" (paste the table above); confirm every tool was run.
9. **Compliance**: the seven acknowledgments.

Before submitting, add the endpoint to Claude as a custom connector and run each tool once; the portal
asks you to confirm that. Verified status is a later, separate review:
[connector verification](https://claude.com/docs/connectors/verification).

## 3. ChatGPT (owner; needs a verified organization and a demo video)

OpenAI takes apps as plugins through the [OpenAI Platform plugins page](https://platform.openai.com/plugins)
("Upload new or existing plugin", option **With MCP**). Read on 2026-10-18 from the Apps SDK submission
page. What it needs that we do not have yet:

- A **verified organization** (individual or business verification in organization settings); the owner
  submits, or a member with "Apps Management Write".
- **Domain verification**: the portal shows a challenge token to host as plain text at a URL under
  `everloot.app`. Add it to `web/public/` in a pull request when the portal gives it.
- **Test cases**: five positive and three negative (the table above fits the required fields:
  description, prompt, tools triggered, expected behaviour), each run with the test account first.
- A **demo recording URL** a reviewer can open.
- Listing fields with limits: display name ≤30 (`Everloot`), short description ≤30, long description
  ≤4,000, developer name ≤80, category, logo, website, support, privacy policy and terms URLs (all four
  required for MCP review).
- One MCP server per plugin; ours is `https://everloot.app/mcp/public`, connection type "no
  authentication" (it is a public server, so that is the right value).

## 4. Grok (no directory; users add it themselves)

xAI has no public submission path. Grok users add a remote MCP server at `grok.com/connectors` →
New connector → Custom → the URL, and developers can pass the URL to the API's Remote MCP Tools
([docs.x.ai](https://docs.x.ai/developers/tools/remote-mcp)). Action: a "Grok" entry on `/connect` with
those steps, nothing to submit.

## 5. Community directories (owner, a web form each)

They mostly ingest from the official registry, so publish there first and check these a week later.

| Directory | How | Status |
|---|---|---|
| [Smithery](https://smithery.ai/new) | Web form or `smithery mcp publish`; remote servers need the public HTTPS endpoint | Check after the registry publish; submit by hand if it did not appear |
| [Glama](https://glama.ai/mcp) | "Add server" form for remote servers (listed as Connectors); claiming needs `/.well-known/glama.json` with an account-bound token, added in a pull request when the account exists | Owner creates the account; then the token file |
| [PulseMCP](https://www.pulsemcp.com) | Ingests the registry | Check after the publish |
| [mcpservers.org](https://mcpservers.org/submit) | Free form | Owner |
| [mcp.so](https://mcp.so) | Site form; reports of a paid tier, unverified | Optional |

## Credibility signals we already have (say them in every listing)

- Open source (AGPL-3.0-only) with public issues and a changelog.
- Every tool read-only and annotated; no account, no key, no OAuth: nothing to leak.
- Sources and licence on every answer; the three-install rule published at `/methodology`.
- Published OpenAPI, JSON Schema for every tool, and the `@everloot/protocol` package.
- `security.txt`, privacy and terms pages on the site.

## Not done, on purpose

No listing text mentions numbers of users, uploads or installs; the data is sparse before launch and the
listing should not promise what the corpus does not hold. Nothing above was submitted by an agent: the
portals need the owner's accounts.
