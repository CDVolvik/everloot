import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import Script from "next/script";
import type { ReactNode } from "react";
import ApiKeys from "@/components/ApiKeys";
import { CodeBlock, Container, DataTable, PageHeader, SectionHeading, Tabs, type Column } from "@/components/ui";
import { trailFor } from "@/lib/breadcrumbs";
import { KEYS_MADE_PER_DAY, KEYS_PER_ACCOUNT, REVOKED_KEPT_DAYS, USAGE_KEPT_DAYS } from "@/lib/api-keys";
import { ANON_PAGE, ANON_PER_HOUR, guardOn, KEY_PAGE, KEY_PER_HOUR } from "@/lib/data-guard";
import { PUBLIC_RECORD_KINDS, SITE } from "@everloot/protocol";
import { BULK_URL, CONNECT_EXAMPLES as ex, MCP_PROMPTS, MCP_RESOURCE_TEMPLATES, MCP_RESOURCES, MCP_TOOLS, MCP_URL, REQUESTS_PER_HOUR } from "./connect-data";
import { ApiReference, SchemaReference, ToolReference } from "./Reference";

export const metadata: Metadata = {
  ...pageMetadata({ title: "WoW Forever Data API and MCP Server", description: "Use Everloot's open data for WoW: Forever: the public corpus API, an MCP server for AI assistants, and the licence and credit line to use.", path: "/connect" }),
};

const REPO = "https://github.com/Everloot/everloot";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <SectionHeading id={id}>{title}</SectionHeading>
      {children}
    </section>
  );
}

/** A name and what it is: the MCP tools, resources, entity resources and prompts. */
type Entry = { name: string; text: string };

function EntryTable({ caption, head, rows }: { caption: string; head: string; rows: readonly Entry[] }) {
  const columns: Column<Entry>[] = [
    { key: "name", header: head, nowrap: true, cell: (row) => <code className="font-mono text-fg">{row.name}</code> },
    { key: "text", header: "What it is", cell: (row) => <span className="text-fg-2">{row.text}</span> },
  ];
  return <DataTable caption={caption} columns={columns} rows={[...rows]} rowKey={(row) => row.name} />;
}

const link = "text-accent hover:underline underline-offset-4";
const code = "font-mono text-fg";

export default function ConnectPage() {
  // Read at build time; turning the guard on in Vercel takes a redeploy, which rebuilds this page too.
  const guard = guardOn();
  return (
    <Container width="reading" className="break-words">
      <PageHeader
        title="Connect"
        lede={<>Everloot&apos;s data is open. You don&apos;t need an account or a key to read it. There are rate limits, but no sign-in wall. Build on it, and credit it.{guard && " Copying all of it in bulk takes a free key."}</>}
        trail={trailFor("/connect")!}
      />

      <div className="space-y-16">
        <Section id="mcp" title="MCP server">
          <p className="text-fg-2">
            Point an AI assistant at Everloot and it can look up lore and the facts players have reported, with the source
            and licence on every answer.
          </p>
          <CodeBlock title="Hosted endpoint, no sign-in" label="The MCP endpoint">{MCP_URL}</CodeBlock>

          <Tabs
            label="Add it to your assistant"
            tabs={[
              {
                id: "claude-code",
                label: "Claude Code",
                panel: <div className="pt-4"><CodeBlock label="Add Everloot to Claude Code">{ex.claudeCode}</CodeBlock></div>,
              },
              {
                id: "claude-ai",
                label: "Claude.ai",
                panel: (
                  <p className="pt-4 text-fg-2">
                    In Claude.ai or Claude Desktop, open <a href="https://claude.ai/customize/connectors" rel="noopener" className={link}>Customize, then Connectors</a>,
                    add a connector by URL and paste the endpoint above. It works on every Claude plan, including Free. Once it
                    shows <em>Connected</em>, turn it on in a chat from the plus menu under Connectors and ask about WoW: Forever.
                  </p>
                ),
              },
              {
                id: "chatgpt",
                label: "ChatGPT and others",
                panel: (
                  <p className="pt-4 text-fg-2">
                    Any assistant that takes a streamable HTTP MCP server by URL can use this one; it needs no sign-in and asks for
                    no key, so there is nothing to configure beyond the URL. ChatGPT&apos;s connectors and deep research call two tools by
                    name, <code className={code}>search</code> and <code className={code}>fetch</code>; both are here,
                    answering in the shape OpenAI&apos;s contract asks for. Where an assistant has a directory of servers, Everloot
                    is listed there as it is accepted; the <a href={`${REPO}/blob/main/docs/2026-10-18-mcp-listings.md`} rel="noopener" className={link}>listing notes</a> in
                    the repository say where it stands.
                  </p>
                ),
              },
              {
                id: "grok",
                label: "Grok",
                panel: (
                  <p className="pt-4 text-fg-2">
                    Grok takes a remote server by URL as a custom connector; for the xAI API, pass the same URL to its{" "}
                    <a href="https://docs.x.ai/developers/tools/remote-mcp" rel="noopener" className={link}>remote MCP tools</a>.
                  </p>
                ),
              },
              {
                id: "config-file",
                label: "Config file",
                panel: (
                  <div className="space-y-3 pt-4">
                    <p className="text-fg-2">
                      Where a client that speaks streamable HTTP wants a config file, this is the usual shape; check your
                      client&apos;s docs for the exact key names.
                    </p>
                    <CodeBlock title="mcp.json" label="MCP client config for the hosted endpoint">{ex.remoteConfig}</CodeBlock>
                  </div>
                ),
              },
              {
                id: "curl",
                label: "curl",
                panel: (
                  <div className="space-y-3 pt-4">
                    <p className="text-fg-2">
                      The server keeps no session, so one call is enough. The <code className={code}>accept</code> header
                      must list both types.
                    </p>
                    <CodeBlock label="Call get_by_name with curl">{ex.mcpCurl}</CodeBlock>
                  </div>
                ),
              },
            ]}
          />

          <div>
            <SectionHeading as="h3" note="Tools built on player data show a fact only after enough installs agree on it, say when it is not recorded yet, and end with the age of the data.">
              What it offers
            </SectionHeading>
            <Tabs
              label="What the MCP server offers"
              tabs={[
                {
                  id: "mcp-tools",
                  label: "Tools",
                  count: MCP_TOOLS.length,
                  panel: <div className="pt-4"><EntryTable caption="MCP tools" head="Tool" rows={MCP_TOOLS} /></div>,
                },
                {
                  id: "mcp-resources",
                  label: "Resources",
                  count: MCP_RESOURCES.length,
                  panel: (
                    <div className="space-y-3 pt-4">
                      <p className="text-sm text-fg-2">
                        Documents an assistant reads whole, with <code className={code}>resources/read</code>, instead of
                        calling a tool with arguments. Their shapes are in{" "}
                        <a href="/schema/mcp/resources.json" className={link}>/schema/mcp/resources.json</a>.
                      </p>
                      <EntryTable caption="MCP resources" head="URI" rows={MCP_RESOURCES.map((r) => ({ name: r.uri, text: r.text }))} />
                    </div>
                  ),
                },
                {
                  id: "mcp-entities",
                  label: "Entity pages",
                  count: MCP_RESOURCE_TEMPLATES.length,
                  panel: (
                    <div className="space-y-3 pt-4">
                      <p className="text-sm text-fg-2">
                        Entity pages read as resources too, one URI per entity. Each answers with the same JSON as the named tool&apos;s
                        structured answer, so a client that prefers resources to tool calls gets the same page.
                      </p>
                      <EntryTable caption="MCP resource templates" head="URI template" rows={MCP_RESOURCE_TEMPLATES.map((t) => ({ name: t.uriTemplate, text: t.text }))} />
                    </div>
                  ),
                },
                {
                  id: "mcp-prompts",
                  label: "Prompts",
                  count: MCP_PROMPTS.length,
                  panel: (
                    <div className="space-y-3 pt-4">
                      <p className="text-sm text-fg-2">
                        Ready-made instructions a client offers as commands (<code className={code}>prompts/get</code>): you
                        fill the argument, the assistant gets a message that says which tools to call and how to treat what they return.
                        Their arguments are in <a href="/schema/mcp/prompts.json" className={link}>/schema/mcp/prompts.json</a>.
                      </p>
                      <EntryTable caption="MCP prompts" head="Prompt" rows={MCP_PROMPTS} />
                    </div>
                  ),
                },
              ]}
            />
          </div>

          <div>
            <SectionHeading as="h3">Limits</SectionHeading>
            <ul className="list-disc space-y-1 pl-6 text-fg-2">
              <li>
                {REQUESTS_PER_HOUR} requests per hour for each IP address. Every call counts, including the handshake and the
                tool list.
              </li>
              <li>
                Over the limit you get <code className={code}>429</code> and a{" "}
                <code className={code}>retry-after</code> header, in seconds.
              </li>
              <li>
                All callers share one hourly cap, which uploads count against too. When it is used up, everyone gets the
                same <code className={code}>429</code>.
              </li>
              <li>Only POST requests count. GET and OPTIONS are not counted.</li>
              <li>Requests larger than 1 MiB are refused.</li>
              {guard && <li>A <a href="#keys" className={link}>free key</a> raises the limit to {KEY_PER_HOUR.toLocaleString("en-US")} requests per hour.</li>}
              <li>
                Web pages in a browser can call it only from a short list of AI sites, such as chatgpt.com and claude.ai. Servers, scripts and desktop
                clients are not affected.
              </li>
            </ul>
            <p className="mt-3 text-fg-2">
              Need more? Write to{" "}
              <a href="mailto:hello@everloot.app" className={link}>hello@everloot.app</a> and say what you are building.
            </p>
          </div>

          <div className="space-y-3">
            <SectionHeading as="h3">Run it yourself</SectionHeading>
            <p className="text-fg-2">
              The server is in <a href={`${REPO}/tree/main/kb`} rel="noopener" className={link}>the repository</a>. This
              runs the website and the same endpoint on your machine, with a small sample of lore pages.
            </p>
            <CodeBlock label="Run the site and its MCP endpoint locally">{ex.localSite}</CodeBlock>
            <p className="text-fg-2">
              Or run the server over stdio, which clients such as Claude Desktop can launch themselves. Replace the paths
              with your clone&apos;s. The environment line lets the player-data tools read the public corpus below.
              {guard && <> Add <code className={code}>EVERLOOT_API_KEY</code> with <a href="#keys" className={link}>your key</a> beside it, or the server stops at the anonymous limit.</>}
            </p>
            <CodeBlock title="mcp.json" label="MCP client config for a local stdio server">{ex.stdioConfig}</CodeBlock>
            <p className="text-sm text-muted">
              The full lore archive is built from the Warcraft Wiki dump. The steps are in{" "}
              <a href={`${REPO}/blob/main/kb/README.md`} rel="noopener" className={link}>kb/README.md</a>.
            </p>
          </div>
        </Section>

        <Section id="tools" title="Tool reference">
          <ToolReference />
        </Section>

        <Section id="corpus" title="Corpus API">
          <p className="text-fg-2">
            Everything players have uploaded that is public, as JSON. One URL, no key.
          </p>
          <CodeBlock label="Fetch loot and vendor records">{ex.corpusCurl}</CodeBlock>
          <div className="space-y-3">
            <SectionHeading as="h3">Parameters</SectionHeading>
            <p className="text-fg-2">
              <code className={code}>kinds</code> is optional: a comma-separated list of record kinds. Leave it
              out to get every kind. An unknown kind returns <code className={code}>400</code>.
            </p>
            <p className="text-fg-2">
              <code className={code}>offset</code> and <code className={code}>limit</code> are
              optional too, for paging. {guard
                ? <>A page holds at most {ANON_PAGE} records without a key and {KEY_PAGE.toLocaleString("en-US")} with one. </>
                : <>Leave them out to get every record in one response. </>}
              When there are more records, <code className={code}>next</code> is the URL of the next page;
              otherwise it is <code className={code}>null</code>.
            </p>
            <p className="text-fg-2">
              Kinds: <span className="font-mono text-sm text-fg">{PUBLIC_RECORD_KINDS.join(", ")}</span>.
            </p>
          </div>
          <div className="space-y-3">
            <SectionHeading as="h3">Walk every page</SectionHeading>
            <p className="text-fg-2">
              Follow <code className={code}>next</code> until it is <code className={code}>null</code>. The
              snapshot behind the feed changes about every ten minutes, so one walk gives one consistent view.
            </p>
            <Tabs
              label="Read every page of the corpus"
              tabs={[
                { id: "javascript", label: "JavaScript", panel: <div className="pt-4"><CodeBlock label="Read every page of the corpus in JavaScript">{ex.pagingJs}</CodeBlock></div> },
                { id: "python", label: "Python", panel: <div className="pt-4"><CodeBlock label="Read every page of the corpus in Python">{ex.pagingPy}</CodeBlock></div> },
              ]}
            />
          </div>
          <div className="space-y-3">
            <SectionHeading as="h3" note={<>Example values; <code className={code}>kinds</code> appears only when you pass it.</>}>Response</SectionHeading>
            <CodeBlock label="Corpus API response shape">{ex.corpusShape}</CodeBlock>
            <ul className="list-disc space-y-1 pl-6 text-fg-2">
              <li><code className={code}>uploads</code> is how many uploads the records come from.</li>
              <li><code className={code}>dataAsOf</code> is when the snapshot was current. Check it before you trust a number.</li>
              <li>
                Each record has a <code className={code}>kind</code>, a{" "}
                <code className={code}>capturedAt</code> time and the fields for that kind. Records carry no
                install id. Named records, such as a guild or a character, appear only when that player chose to share them.
              </li>
              <li>
                These are single reports, not agreed facts. The site and the MCP tools state a fact only after three
                installs report it. Do the same if you publish numbers.
              </li>
              <li>
                If storage can&apos;t be read you get <code className={code}>503</code> and{" "}
                <code className={code}>ok: false</code>. That is not an empty corpus.
              </li>
            </ul>
            {!guard && (
              <p className="text-fg-2">
                This endpoint has no limit of its own today. The response is not cached, but the snapshot behind it is updated about every
                ten minutes, so asking more often gains nothing. If that changes, this page will say so.
              </p>
            )}
          </div>
          <div className="space-y-3">
            <SectionHeading as="h3">More endpoints</SectionHeading>
            <p className="text-fg-2">
              The public drop rates are at <code className={code}>/api/rollups/drops</code>, with the same
              paging{guard ? " and limits" : ""}.
            </p>
            <p className="text-fg-2">
              Relations between entities are at <code className={code}>/api/edges</code>, also paged
              {guard ? " and limited" : ""}: filter with <code className={code}>from_kind</code>,{" "}
              <code className={code}>from_id</code>, <code className={code}>to_kind</code>,{" "}
              <code className={code}>to_id</code>, <code className={code}>rel</code> and{" "}
              <code className={code}>evidence</code>. Relations players saw (3 installs) are ours under the licence above.
              Relations read from the game files are Blizzard&apos;s, found in game files and unconfirmed: they come with their build
              and a <code className={code}>gameData</code> notice instead of our licence. The whole game-file layer of the
              current build downloads in one file from <code className={code}>/api/edges/client-layer</code>.
            </p>
            <p className="text-fg-2">
              Item categories (class, subclass, slot and quality, from the game files) are at{" "}
              <code className={code}>/api/items</code>, filtered by <code className={code}>class</code>,{" "}
              <code className={code}>subclass</code>, <code className={code}>slot</code>,{" "}
              <code className={code}>quality</code> or <code className={code}>item</code> and paged the same way;
              the tree with slugs and counts is at <code className={code}>/api/items/categories</code>. They carry the same{" "}
              <code className={code}>gameData</code> notice.
            </p>
            <p className="text-fg-2">
              Every MCP tool also answers a plain GET at <code className={code}>/api/tools/&#123;tool&#125;</code>, with the
              tool&apos;s arguments as query parameters, named and typed as in its schema file (for example{" "}
              <code className={code}>/api/tools/item_page?itemId=19019</code>). The <code className={code}>answer</code>{" "}
              field is the same structured content an MCP client gets, and <code className={code}>text</code> the same words.
            </p>
            <CodeBlock label="Call get_by_name over HTTP">{ex.toolsCurl}</CodeBlock>
          </div>
        </Section>

        <Section id="tooltips" title="Embeddable tooltips">
          <p className="text-fg-2">
            Add one line to your blog, guild site or forum theme and every link to an Everloot item, NPC, quest or object page
            shows a game-style card on hover.
          </p>
          <CodeBlock label="Load the Everloot tooltip script">{ex.tooltipScript}</CodeBlock>
          <p className="text-fg-2">
            Then link as you normally would. Nothing else to configure; links added later are picked up too.
          </p>
          <CodeBlock label="A link that gets a tooltip">{ex.tooltipLink}</CodeBlock>
          <p className="text-fg-2">
            Live example, with the script loaded on this page:{" "}
            <a href={`${SITE}/database/items/19019`} className={link}>Thunderfury</a>,{" "}
            <a href={`${SITE}/database/npcs/6`} className={link}>an NPC</a> and{" "}
            <a href={`${SITE}/database/quests/9`} className={link}>a quest</a>. A card appears only for pages players
            have reported, so a link to an id nobody has seen shows no card and just works as a link.
          </p>
          <ul className="list-disc pl-6 text-fg-2 space-y-1">
            <li>Hover or keyboard focus shows the card; Escape closes it. On a touch screen the first tap shows it and the second follows the link.</li>
            <li>The script is under 8 KB, has no dependencies, and draws the card in an isolated container, so your page&apos;s styles cannot break it. It respects <code className={code}>prefers-reduced-motion</code>.</li>
            <li>No cookies and no tracking. Each hovered link makes one request to everloot.app, sent without cookies or a referrer.</li>
            <li>To skip a link, add <code className={code}>data-everloot-tooltip=&quot;off&quot;</code>.</li>
            <li>Cards follow the site&apos;s rules: a fact appears once 3 installs reported it, and anything that comes from the game files is labelled unconfirmed with its build, and credited to Blizzard.</li>
          </ul>
          <p className="text-fg-2">
            The data is <code className={code}>GET /api/tooltip/&#123;type&#125;/&#123;id&#125;</code> (type: item, npc, quest or
            object), one page per request. It is open to any website (CORS for GET), and the CDN keeps each answer for an hour, so
            it needs no key. It is meant for cards, not for copying data: for that, use the corpus API above.
          </p>
          <CodeBlock label="Fetch one tooltip">{ex.tooltipCurl}</CodeBlock>
          <Script src="/tooltips.js" strategy="lazyOnload" />
        </Section>

        <Section id="api" title="API reference">
          <ApiReference />
          <div className="space-y-3">
            <SectionHeading as="h3" note="The whole API in one file, for client generators, request tools and assistants that read OpenAPI.">OpenAPI</SectionHeading>
            <CodeBlock label="List the endpoints from the OpenAPI document">{ex.openapiCurl}</CodeBlock>
          </div>
        </Section>

        <Section id="schemas" title="Schemas and the protocol">
          <SchemaReference />
        </Section>

        <Section id="keys" title="Limits and keys">
          {guard ? (
            <>
              <ul className="list-disc space-y-1 pl-6 text-fg-2">
                <li>
                  Asking questions needs no key. The MCP server and the market prices answer {REQUESTS_PER_HOUR} requests per
                  hour for each IP address, as before.
                </li>
                <li>
                  Copying in bulk does. Without a key, the corpus API and the drop list answer {ANON_PER_HOUR} requests per
                  hour for each IP address, {ANON_PAGE} records a page.
                </li>
                <li>
                  A free key raises that to {KEY_PER_HOUR.toLocaleString("en-US")} requests per hour for your account, across
                  all its keys and every endpoint, {KEY_PAGE.toLocaleString("en-US")} records a page. Send it as{" "}
                  <code className={code}>Authorization: Bearer &lt;key&gt;</code>.
                </li>
                <li>
                  Over a limit you get <code className={code}>429</code>, a{" "}
                  <code className={code}>retry-after</code> header and a message that points here.
                </li>
                <li>
                  A key belongs to your Battle.net account, and we count requests per key. That is how we know who copies the
                  data in bulk, so we can ask what they are building. You can hold {KEYS_PER_ACCOUNT} keys, make up
                  to {KEYS_MADE_PER_DAY} a day, and revoke or delete any of them here. We revoke a key that is used to
                  republish the data without credit.
                </li>
                <li>
                  We keep a key&apos;s daily request counts for {USAGE_KEPT_DAYS} days. A revoked key and its counts are deleted{" "}
                  {REVOKED_KEPT_DAYS} days after it was revoked, or at once when you delete it. To delete your account and
                  everything tied to it, write to{" "}
                  <a href="mailto:hello@everloot.app" className={link}>hello@everloot.app</a>.
                </li>
                <li>
                  The site&apos;s pages have none of these limits. Search engines and AI assistants are welcome to read and
                  quote them.
                </li>
              </ul>
              <div>
                <SectionHeading as="h3">Your keys</SectionHeading>
                <ApiKeys />
              </div>
            </>
          ) : (
            <p className="text-fg-2">
              Keys are not switched on yet, and nothing needs one. Before they are, this page will list the limits.
            </p>
          )}
        </Section>

        <Section id="files" title="Data files">
          {BULK_URL ? (
            <>
              <p className="text-fg-2">
                The published data as files: one newline-delimited JSON file per dataset (the public corpus, drop rates, relations,
                items) and an <code className={code}>index.json</code> that lists each file with its row count, size,
                SHA-256, licence and the API response whose rows it holds, so a file and the API never disagree on a shape. Each
                export is its own folder, never changed after it is written; <a href={`${BULK_URL}/latest.json`} className={link}>latest.json</a>{" "}
                points at the newest. The index shape is <a href="/schema/api/bulkIndex.json" className={link}>/schema/api/bulkIndex.json</a>.
              </p>
              <CodeBlock label="Find the newest export">{ex.bulkCurl}</CodeBlock>
            </>
          ) : (
            <p className="text-fg-2">
              There is no bulk download yet. A full export of the published data is on the{" "}
              <a href={`${REPO}/blob/main/ROADMAP.md`} rel="noopener" className={link}>roadmap</a>, planned after launch. Until
              then the corpus API is the way to get the data as files: save the response{guard ? ", page by page, with a free key for the whole of it" : ""}.
              The export itself is built (<code className={code}>npm run export-bulk</code> in the repository); what is
              missing is the public bucket it is served from.
            </p>
          )}
        </Section>

        <Section id="licence" title="Licence and credit">
          <ul className="list-disc space-y-2 pl-6 text-fg-2">
            <li>
              <span className="text-fg">Data:</span> CC BY-SA 4.0. You may reuse it with credit, and what you build from
              it stays under the same licence.
            </li>
            <li>
              <span className="text-fg">Lore:</span> from the Warcraft Wiki dump of 2023-11-13, CC BY-SA 4.0. Every MCP hit
              carries its source URL and licence. Keep them with the text.
            </li>
            <li>
              <span className="text-fg">Not ours:</span> World of Warcraft and Blizzard&apos;s game data belong to Blizzard.
              Downloads, the API and the MCP server carry ids and facts. Blizzard&apos;s icons, tooltip text and art are never in them; a tooltip card carries one item&apos;s, credited to Blizzard.
            </li>
            <li>
              <span className="text-fg">Table names:</span> where a page or file shows column names from game tables, they come from{" "}
              <a href="https://github.com/wowdev/WoWDBDefs" rel="noopener" className={link}>WoWDBDefs</a> by the wowdev
              contributors, CC BY-SA 4.0.
            </li>
            <li>
              <span className="text-fg">Code:</span> AGPL-3.0-only.
            </li>
            <li>
              <span className="text-fg">Name and logo:</span> not licensed. Say your project uses Everloot data, but give it
              its own name. See{" "}
              <a href={`${REPO}/blob/main/TRADEMARKS.md`} rel="noopener" className={link}>TRADEMARKS.md</a>.
            </li>
          </ul>
          <CodeBlock title="Credit line" label="Credit line">{ex.credit}</CodeBlock>
          <p className="text-fg-2">
            Link it wherever the data appears. If you show lore text, credit the Warcraft Wiki as well, as each hit says.
          </p>
          <p className="text-fg-2">
            Every answer carries the credit line, so it is hard to lose by accident. The JSON APIs have an{" "}
            <code className={code}>attribution</code> field with the licence, the credit line and the page the
            data comes from, and send the same in the <code className={code}>X-Everloot-Licence</code>,{" "}
            <code className={code}>X-Everloot-Credit</code> and <code className={code}>Link</code>{" "}
            headers. MCP answers built on player data end with the licence and credit. Republishing the data without it breaks the
            licence.
          </p>
          <p className="text-sm text-muted">
            Where the data comes from and what we refuse to use:{" "}
            <a href={`${REPO}/blob/main/docs/DATA_POLICY.md`} rel="noopener" className={link}>DATA_POLICY.md</a>. Every
            third-party source and licence:{" "}
            <a href={`${REPO}/blob/main/THIRD_PARTY.md`} rel="noopener" className={link}>THIRD_PARTY.md</a>.
          </p>
        </Section>

        <p className="border-t border-line pt-6 text-sm text-muted">
          Questions or a bug? <Link href="/contact" className={link}>Contact us</Link> or{" "}
          <a href={`${REPO}/issues/new/choose`} rel="noopener" className={link}>open an issue</a>.
        </p>
      </div>
    </Container>
  );
}
