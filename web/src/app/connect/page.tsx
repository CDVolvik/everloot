import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import type { ReactNode } from "react";
import ApiKeys from "@/components/ApiKeys";
import Bracket from "@/components/Bracket";
import { KEYS_MADE_PER_DAY, KEYS_PER_ACCOUNT, REVOKED_KEPT_DAYS, USAGE_KEPT_DAYS } from "@/lib/api-keys";
import { ANON_PAGE, ANON_PER_HOUR, guardOn, KEY_PAGE, KEY_PER_HOUR } from "@/lib/data-guard";
import { PUBLIC_RECORD_KINDS } from "@everloot/protocol";
import { CONNECT_EXAMPLES as ex, MCP_RESOURCES, MCP_TOOLS, MCP_URL, REQUESTS_PER_HOUR } from "./connect-data";
import { ApiReference, SchemaReference, ToolReference } from "./Reference";

export const metadata: Metadata = {
  ...pageMetadata({ title: "WoW Forever Data API and MCP Server", description: "Use Everloot's open data for WoW: Forever: the public corpus API, an MCP server for AI assistants, and the licence and credit line to use.", path: "/connect" }),
};

const REPO = "https://github.com/CDVolvik/everloot";

function Code({ children, label }: { children: string; label: string }) {
  return (
    <pre aria-label={label} tabIndex={0} className="overflow-x-auto text-sm font-mono text-fg rounded-xl border border-line bg-panel p-4">{children}</pre>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3 border-t border-line pt-8">
      <h2 id={id} className="text-xl font-semibold text-fg"><Bracket>{title}</Bracket></h2>
      {children}
    </section>
  );
}

const link = "text-accent hover:underline underline-offset-4";

export default function ConnectPage() {
  // Read at build time; turning the guard on in Vercel takes a redeploy, which rebuilds this page too.
  const guard = guardOn();
  return (
    <article className="space-y-8 max-w-3xl">
      <header className="space-y-3">
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">Connect</h1>
        <p className="text-fg-2">
          Everloot&apos;s data is open. You don&apos;t need an account or a key to read it. There are rate limits, but no
          sign-in wall. Build on it, and credit it.{guard && " Copying all of it in bulk takes a free key."}
        </p>
        <p className="text-sm text-muted">
          This page describes what is live today. Anything that is not built yet says so.
        </p>
      </header>

      <Section id="mcp" title="MCP server">
        <p className="text-fg-2">
          Point an AI assistant at Everloot and it can look up lore and the facts players have reported, with the source
          and licence on every answer.
        </p>
        <p className="text-fg-2">
          Hosted endpoint, no sign-in: <code className="font-mono text-fg">{MCP_URL}</code>
        </p>
        <h3 className="font-semibold text-fg">Claude Code</h3>
        <Code label="Add Everloot to Claude Code">{ex.claudeCode}</Code>
        <h3 className="font-semibold text-fg">Any client that speaks streamable HTTP</h3>
        <p className="text-fg-2">
          Give it the URL above. Where a client wants a config file, this is the usual shape; check your client&apos;s
          docs for the exact key names.
        </p>
        <Code label="MCP client config for the hosted endpoint">{ex.remoteConfig}</Code>
        <h3 className="font-semibold text-fg">Claude.ai and Claude Desktop</h3>
        <p className="text-fg-2">
          Open <a href="https://claude.ai/customize/connectors" rel="noopener" className={link}>Customize, then Connectors</a>,
          add a connector by URL and paste the endpoint above. It works on every Claude plan, including Free. Once it
          shows <em>Connected</em>, turn it on in a chat from the plus menu under Connectors and ask about WoW: Forever.
        </p>
        <h3 className="font-semibold text-fg">Grok</h3>
        <p className="text-fg-2">
          Grok takes a remote server by URL as a custom connector; for the xAI API, pass the same URL to its{" "}
          <a href="https://docs.x.ai/developers/tools/remote-mcp" rel="noopener" className={link}>remote MCP tools</a>.
        </p>
        <h3 className="font-semibold text-fg">ChatGPT and other assistants</h3>
        <p className="text-fg-2">
          Any assistant that takes a streamable HTTP MCP server by URL can use this one; it needs no sign-in and asks for
          no key, so there is nothing to configure beyond the URL. Where an assistant has a directory of servers, Everloot
          is listed there as it is accepted; the <a href={`${REPO}/blob/main/docs/2026-10-18-mcp-listings.md`} rel="noopener" className={link}>listing notes</a> in
          the repository say where it stands.
        </p>
        <h3 className="font-semibold text-fg">Try it with curl</h3>
        <p className="text-fg-2">
          The server keeps no session, so one call is enough. The <code className="font-mono text-fg">accept</code> header
          must list both types.
        </p>
        <Code label="Call get_by_name with curl">{ex.mcpCurl}</Code>
        <h3 className="font-semibold text-fg">Tools</h3>
        <ul className="divide-y divide-line border-y border-line">
          {MCP_TOOLS.map((tool) => (
            <li key={tool.name} className="py-3 grid sm:grid-cols-[13rem_1fr] gap-x-4 gap-y-1">
              <code className="font-mono text-sm text-fg">{tool.name}</code>
              <span className="text-sm text-fg-2">{tool.text}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted">
          Tools built on player data show a fact only after enough installs agree on it, and say when it is not
          recorded yet. Answers from player data end with the age of the data.
        </p>
        <h3 className="font-semibold text-fg">Resources</h3>
        <p className="text-fg-2">
          Documents an assistant reads whole, with <code className="font-mono text-fg">resources/read</code>, instead of
          calling a tool with arguments. Their shapes are in{" "}
          <a href="/schema/mcp/resources.json" className={link}>/schema/mcp/resources.json</a>.
        </p>
        <ul className="divide-y divide-line border-y border-line">
          {MCP_RESOURCES.map((resource) => (
            <li key={resource.uri} className="py-3 grid sm:grid-cols-[13rem_1fr] gap-x-4 gap-y-1">
              <code className="font-mono text-sm text-fg">{resource.uri}</code>
              <span className="text-sm text-fg-2">{resource.text}</span>
            </li>
          ))}
        </ul>
        <h3 className="font-semibold text-fg">Limits</h3>
        <ul className="list-disc pl-6 text-fg-2 space-y-1">
          <li>
            {REQUESTS_PER_HOUR} requests per hour for each IP address. Every call counts, including the handshake and the
            tool list.
          </li>
          <li>
            Over the limit you get <code className="font-mono text-fg">429</code> and a{" "}
            <code className="font-mono text-fg">retry-after</code> header, in seconds.
          </li>
          <li>
            All callers share one hourly cap, which uploads count against too. When it is used up, everyone gets the
            same <code className="font-mono text-fg">429</code>.
          </li>
          <li>Only POST requests count. GET and OPTIONS are not counted.</li>
          <li>Requests larger than 1 MiB are refused.</li>
          {guard && <li>A <a href="#keys" className={link}>free key</a> raises the limit to {KEY_PER_HOUR.toLocaleString("en-US")} requests per hour.</li>}
          <li>
            Web pages in a browser can call it only from a short list of AI sites, such as chatgpt.com and claude.ai. Servers, scripts and desktop
            clients are not affected.
          </li>
        </ul>
        <p className="text-fg-2">
          Need more? Write to{" "}
          <a href="mailto:hello@everloot.app" className={link}>hello@everloot.app</a> and say what you are building.
        </p>
        <h3 className="font-semibold text-fg">Run it yourself</h3>
        <p className="text-fg-2">
          The server is in <a href={`${REPO}/tree/main/kb`} rel="noopener" className={link}>the repository</a>. This
          runs the website and the same endpoint on your machine, with a small sample of lore pages.
        </p>
        <Code label="Run the site and its MCP endpoint locally">{ex.localSite}</Code>
        <p className="text-fg-2">
          Or run the server over stdio, which clients such as Claude Desktop can launch themselves. Replace the paths
          with your clone&apos;s. The environment line lets the player-data tools read the public corpus below.
          {guard && <> Add <code className="font-mono text-fg">EVERLOOT_API_KEY</code> with <a href="#keys" className={link}>your key</a> beside it, or the server stops at the anonymous limit.</>}
        </p>
        <Code label="MCP client config for a local stdio server">{ex.stdioConfig}</Code>
        <p className="text-sm text-muted">
          The full lore archive is built from the Warcraft Wiki dump. The steps are in{" "}
          <a href={`${REPO}/blob/main/kb/README.md`} rel="noopener" className={link}>kb/README.md</a>.
        </p>
      </Section>

      <Section id="tools" title="Tool reference">
        <ToolReference />
      </Section>

      <Section id="corpus" title="Corpus API">
        <p className="text-fg-2">
          Everything players have uploaded that is public, as JSON. One URL, no key.
        </p>
        <Code label="Fetch loot and vendor records">{ex.corpusCurl}</Code>
        <h3 className="font-semibold text-fg">Parameters</h3>
        <p className="text-fg-2">
          <code className="font-mono text-fg">kinds</code> is optional: a comma-separated list of record kinds. Leave it
          out to get every kind. An unknown kind returns <code className="font-mono text-fg">400</code>.
        </p>
        <p className="text-fg-2">
          <code className="font-mono text-fg">offset</code> and <code className="font-mono text-fg">limit</code> are
          optional too, for paging. {guard
            ? <>A page holds at most {ANON_PAGE} records without a key and {KEY_PAGE.toLocaleString("en-US")} with one. </>
            : <>Leave them out to get every record in one response. </>}
          When there are more records, <code className="font-mono text-fg">next</code> is the URL of the next page;
          otherwise it is <code className="font-mono text-fg">null</code>.
        </p>
        <p className="text-fg-2 break-words">
          Kinds: <span className="font-mono text-sm text-fg">{PUBLIC_RECORD_KINDS.join(", ")}</span>.
        </p>
        <h3 className="font-semibold text-fg">Walk every page</h3>
        <p className="text-fg-2">
          Follow <code className="font-mono text-fg">next</code> until it is <code className="font-mono text-fg">null</code>. The
          snapshot behind the feed changes about every ten minutes, so one walk gives one consistent view.
        </p>
        <Code label="Read every page of the corpus in JavaScript">{ex.pagingJs}</Code>
        <Code label="Read every page of the corpus in Python">{ex.pagingPy}</Code>
        <h3 className="font-semibold text-fg">Response</h3>
        <p className="text-fg-2">Example values; <code className="font-mono text-fg">kinds</code> appears only when you pass it.</p>
        <Code label="Corpus API response shape">{ex.corpusShape}</Code>
        <ul className="list-disc pl-6 text-fg-2 space-y-1">
          <li><code className="font-mono text-fg">uploads</code> is how many uploads the records come from.</li>
          <li><code className="font-mono text-fg">dataAsOf</code> is when the snapshot was current. Check it before you trust a number.</li>
          <li>
            Each record has a <code className="font-mono text-fg">kind</code>, a{" "}
            <code className="font-mono text-fg">capturedAt</code> time and the fields for that kind. Records carry no
            install id. Named records, such as a guild or a character, appear only when that player chose to share them.
          </li>
          <li>
            These are single reports, not agreed facts. The site and the MCP tools state a fact only after three
            installs report it. Do the same if you publish numbers.
          </li>
          <li>
            If storage can&apos;t be read you get <code className="font-mono text-fg">503</code> and{" "}
            <code className="font-mono text-fg">ok: false</code>. That is not an empty corpus.
          </li>
        </ul>
        {!guard && (
          <p className="text-fg-2">
            This endpoint has no limit of its own today. The response is not cached, but the snapshot behind it is updated about every
            ten minutes, so asking more often gains nothing. If that changes, this page will say so.
          </p>
        )}
        <p className="text-fg-2">
          The public drop rates are at <code className="font-mono text-fg">/api/rollups/drops</code>, with the same
          paging{guard ? " and limits" : ""}.
        </p>
        <p className="text-fg-2">
          Relations between entities are at <code className="font-mono text-fg">/api/edges</code>, also paged
          {guard ? " and limited" : ""}: filter with <code className="font-mono text-fg">from_kind</code>,{" "}
          <code className="font-mono text-fg">from_id</code>, <code className="font-mono text-fg">to_kind</code>,{" "}
          <code className="font-mono text-fg">to_id</code>, <code className="font-mono text-fg">rel</code> and{" "}
          <code className="font-mono text-fg">evidence</code>. Relations players saw (3 installs) are ours under the licence above.
          Relations read from the game files are Blizzard&apos;s, found in game files and unconfirmed: they come with their build
          and a <code className="font-mono text-fg">gameData</code> notice instead of our licence. The whole game-file layer of the
          current build downloads in one file from <code className="font-mono text-fg">/api/edges/client-layer</code>.
        </p>
        <p className="text-fg-2">
          Item categories (class, subclass, slot and quality, from the game files) are at{" "}
          <code className="font-mono text-fg">/api/items</code>, filtered by <code className="font-mono text-fg">class</code>,{" "}
          <code className="font-mono text-fg">subclass</code>, <code className="font-mono text-fg">slot</code>,{" "}
          <code className="font-mono text-fg">quality</code> or <code className="font-mono text-fg">item</code> and paged the same way;
          the tree with slugs and counts is at <code className="font-mono text-fg">/api/items/categories</code>. They carry the same{" "}
          <code className="font-mono text-fg">gameData</code> notice.
        </p>
      </Section>

      <Section id="api" title="API reference">
        <ApiReference />
        <h3 className="font-semibold text-fg">OpenAPI</h3>
        <p className="text-fg-2">
          The whole API in one file, for client generators, request tools and assistants that read OpenAPI.
        </p>
        <Code label="List the endpoints from the OpenAPI document">{ex.openapiCurl}</Code>
      </Section>

      <Section id="schemas" title="Schemas and the protocol">
        <SchemaReference />
      </Section>

      <Section id="keys" title="Limits and keys">
        {guard ? (
          <>
            <ul className="list-disc pl-6 text-fg-2 space-y-1">
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
                <code className="font-mono text-fg">Authorization: Bearer &lt;key&gt;</code>.
              </li>
              <li>
                Over a limit you get <code className="font-mono text-fg">429</code>, a{" "}
                <code className="font-mono text-fg">retry-after</code> header and a message that points here.
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
            <h3 className="font-semibold text-fg">Your keys</h3>
            <ApiKeys />
          </>
        ) : (
          <p className="text-fg-2">
            Keys are not switched on yet, and nothing needs one. Before they are, this page will list the limits.
          </p>
        )}
      </Section>

      <Section id="files" title="Data files">
        <p className="text-fg-2">
          There is no bulk download yet. A full export of the published data is on the{" "}
          <a href={`${REPO}/blob/main/ROADMAP.md`} rel="noopener" className={link}>roadmap</a>, planned after launch. Until
          then the corpus API is the way to get the data as files: save the response{guard ? ", page by page, with a free key for the whole of it" : ""}.
        </p>
      </Section>

      <Section id="licence" title="Licence and credit">
        <ul className="list-disc pl-6 text-fg-2 space-y-2">
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
            Downloads, the API and the MCP server carry ids and facts. Blizzard&apos;s icons, tooltip text and art are never in them.
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
        <h3 className="font-semibold text-fg">Credit line</h3>
        <Code label="Credit line">{ex.credit}</Code>
        <p className="text-fg-2">
          Link it wherever the data appears. If you show lore text, credit the Warcraft Wiki as well, as each hit says.
        </p>
        <p className="text-fg-2">
          Every answer carries the credit line, so it is hard to lose by accident. The JSON APIs have an{" "}
          <code className="font-mono text-fg">attribution</code> field with the licence, the credit line and the page the
          data comes from, and send the same in the <code className="font-mono text-fg">X-Everloot-Licence</code>,{" "}
          <code className="font-mono text-fg">X-Everloot-Credit</code> and <code className="font-mono text-fg">Link</code>{" "}
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

      <p className="text-sm text-muted border-t border-line pt-6">
        Questions or a bug? <Link href="/contact" className={link}>Contact us</Link> or{" "}
        <a href={`${REPO}/issues/new/choose`} rel="noopener" className={link}>open an issue</a>.
      </p>
    </article>
  );
}
