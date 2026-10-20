import type { Metadata } from "next";
import Link from "next/link";
import { PLAYER_DATA_TOOLS } from "@everloot/protocol";
import { C, Cards, H2, H3, LinkCard, List, P, Table, docLink } from "@/components/docs/blocks";
import { CodeGroup } from "@/components/docs/DocsClient";
import DocPage from "@/components/docs/DocPage";
import { CONNECT_EXAMPLES as ex, MCP_TOOLS, MCP_URL } from "@/app/connect/connect-data";
import { DOCS_TABS } from "@/lib/docs/nav";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "MCP overview",
  description: "Everloot's MCP server gives an AI assistant WoW: Forever lore and player-reported facts, with the source, licence and date on every answer. No sign-in.",
  path: "/docs/mcp",
});

/** The sidebar's tool groups, with each tool's one sentence. */
function toolGroups() {
  const text = new Map<string, string>(MCP_TOOLS.map((tool) => [tool.name, tool.text]));
  return (DOCS_TABS.find((tab) => tab.id === "mcp")?.groups ?? [])
    .map((group) => ({ title: group.title, tools: group.pages.filter((page) => page.href.startsWith("/docs/mcp/tools/")) }))
    .filter((group) => group.tools.length > 0)
    .map((group) => ({ ...group, tools: group.tools.map((page) => ({ href: page.href, name: page.title, text: text.get(page.title) ?? page.lede })) }));
}

export default function McpOverview() {
  const groups = toolGroups();
  const playerData = new Set<string>(PLAYER_DATA_TOOLS);
  return (
    <DocPage href="/docs/mcp">
      <P>
        Point an AI assistant at Everloot and it can look up lore and the facts players have reported, with the source and
        licence on every answer. The server speaks the Model Context Protocol (MCP) over streamable HTTP.
      </P>

      <H2 id="endpoint">The endpoint</H2>
      <P>The hosted server needs no sign-in and no key.</P>
      <div className="mt-6">
        <CodeGroup title="MCP endpoint" tabs={[{ label: "URL", lang: "text", code: MCP_URL }]} />
      </div>

      <H2 id="quick-example">Quick example</H2>
      <P>
        Add the server to Claude Code, give the URL to any other client, or call it once with curl. The server keeps no session, so
        one call is enough.
      </P>
      <div className="mt-6">
        <CodeGroup
          title="Connect and ask"
          tabs={[
            { label: "Claude Code", lang: "bash", code: ex.claudeCode },
            { label: "Client config", lang: "json", code: ex.remoteConfig },
            { label: "cURL", lang: "bash", code: ex.mcpCurl },
          ]}
        />
      </div>
      <P>
        Other clients are on <Link href="/docs/mcp/clients" className={docLink}>Connect a client</Link>.
      </P>

      <H2 id="core-concepts">Core concepts</H2>

      <H3 id="player-data-and-the-3-install-rule">Player data and the 3-install rule</H3>
      <P>
        Tools built on player data, marked below, state a fact only after 3 installs agree on it. They say when something is not
        recorded yet, and an unrecorded answer is never a zero. Anything read from the game files is labelled &quot;found in game
        files, unconfirmed&quot;, with its build. <Link href="/docs/how-it-works" className={docLink}>How Everloot works</Link>{" "}
        explains the rule.
      </P>

      <H3 id="structured-content">structuredContent</H3>
      <P>
        Every tool returns <C>structuredContent</C> beside the text, of the shape in its schema file at{" "}
        <C>/schema/mcp/&lt;tool&gt;.json</C>. Each tool page lists the top-level fields. Answers built on player data start with{" "}
        <C>connected</C> and <C>dataAsOf</C>, and carry a <C>page</C> only when a corpus was read: an absent page is not a
        measured zero.
      </P>

      <H3 id="sources-and-credit">Sources and credit</H3>
      <P>
        Lore hits carry their source URL and licence. Keep them with the text. Answers built on player data end with the
        licence and the credit line, as Everloot&apos;s data is CC BY-SA 4.0. See{" "}
        <Link href="/docs/licence" className={docLink}>Licence and credit</Link>.
      </P>

      <H3 id="data-age">Data age</H3>
      <P>
        Answers built on player data end with the age of the data. Read it before you quote a number.
      </P>

      <H2 id="tools">Tools</H2>
      <P>
        Every tool has its own page with arguments, the answer and a working call. Tools marked <em>player data</em> follow the
        3-install rule; the others carry their sources inside the answer. The same list is at{" "}
        <a href="/schema/index.json" className={docLink}><C>/schema/index.json</C></a>.
      </P>
      {groups.map((group) => (
        <div key={group.title}>
          <H3 id={`tools-${group.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{group.title}</H3>
          <Table
            head={["Tool", "What it does"]}
            rows={group.tools.map((tool) => [
              <span key="n" className="whitespace-nowrap">
                <Link href={tool.href} className={docLink}><code className="font-mono">{tool.name}</code></Link>
                {playerData.has(tool.name) && <span className="ml-2 text-xs text-muted">player data</span>}
              </span>,
              tool.text,
            ])}
          />
        </div>
      ))}

      <H2 id="beyond-tools">Beyond tools</H2>
      <List>
        <li>
          <Link href="/docs/mcp/resources" className={docLink}>Resources and prompts</Link>: documents the assistant reads whole,
          and ready-made instructions a client offers as commands.
        </li>
        <li>
          Every tool also answers a plain GET at <C>/api/tools/&#123;tool&#125;</C>, with no MCP client. See{" "}
          <Link href="/docs/api/tools" className={docLink}>the endpoint</Link>.
        </li>
      </List>

      <H2 id="next-steps">Next steps</H2>
      <Cards cols={3}>
        <LinkCard href="/docs/mcp/clients" title="Connect a client" icon="plug">Claude, ChatGPT, Grok and any streamable HTTP client.</LinkCard>
        <LinkCard href="/docs/mcp/resources" title="Resources and prompts" icon="file">What the server offers beside its tools.</LinkCard>
        <LinkCard href="/docs/api/keys" title="Limits and keys" icon="shield">How many requests you get, and a key for more.</LinkCard>
      </Cards>
    </DocPage>
  );
}
