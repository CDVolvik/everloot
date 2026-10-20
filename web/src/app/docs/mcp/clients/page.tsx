import type { Metadata } from "next";
import Link from "next/link";
import { C, Callout, H2, P, Step, Steps, docLink } from "@/components/docs/blocks";
import { CodeGroup } from "@/components/docs/DocsClient";
import DocPage from "@/components/docs/DocPage";
import { CONNECT_EXAMPLES as ex, MCP_URL, REQUESTS_PER_HOUR } from "@/lib/docs/connect-data";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Connect a client",
  description: "Connect Claude, Claude Code, Grok, ChatGPT or any streamable HTTP client to Everloot's MCP server. No sign-in and no key.",
  path: "/docs/mcp/clients",
});

const REPO = "https://github.com/Everloot/everloot";

export default function ClientsPage() {
  return (
    <DocPage href="/docs/mcp/clients">
      <P>
        Every client uses the same hosted endpoint. It needs no sign-in and asks for no key, so there is nothing to set up beyond
        the URL.
      </P>
      <div className="mt-6">
        <CodeGroup title="MCP endpoint" tabs={[{ label: "URL", lang: "text", code: MCP_URL }]} />
      </div>

      <H2 id="claude">Claude.ai and Claude Desktop</H2>
      <Steps>
        <Step id="claude-open" title="Open Connectors">
          <P>
            Open <a href="https://claude.ai/customize/connectors" rel="noopener" className={docLink}>Customize, then Connectors</a>.
            It works on every Claude plan, including Free.
          </P>
        </Step>
        <Step id="claude-add" title="Add a connector by URL">
          <P>Paste the endpoint above.</P>
        </Step>
        <Step id="claude-use" title="Turn it on in a chat">
          <P>
            Once it shows <em>Connected</em>, turn it on in a chat from the plus menu under Connectors and ask about WoW: Forever.
          </P>
        </Step>
      </Steps>

      <H2 id="claude-code">Claude Code</H2>
      <P>One command adds the server.</P>
      <div className="mt-6">
        <CodeGroup title="Add Everloot to Claude Code" tabs={[{ label: "Shell", lang: "bash", code: ex.claudeCode }]} />
      </div>

      <H2 id="grok">Grok and the xAI API</H2>
      <P>
        Grok takes a remote server by URL as a custom connector. For the xAI API, pass the same URL to its{" "}
        <a href="https://docs.x.ai/developers/tools/remote-mcp" rel="noopener" className={docLink}>remote MCP tools</a>.
      </P>

      <H2 id="chatgpt">ChatGPT and other assistants</H2>
      <P>
        Any assistant that takes a streamable HTTP MCP server by URL can use this one. ChatGPT&apos;s connectors and deep research
        call two tools by name, <Link href="/docs/mcp/tools/search" className={docLink}><C>search</C></Link> and{" "}
        <Link href="/docs/mcp/tools/fetch" className={docLink}><C>fetch</C></Link>. Both are here, answering in the shape
        OpenAI&apos;s contract asks for: <C>search</C> returns results with an id, a title and a URL to cite, and <C>fetch</C> takes
        one of those ids and returns the record whole, with its URL and the source, licence and date as metadata.
      </P>
      <P>
        Where an assistant has a directory of servers, Everloot is listed there as it is accepted. The{" "}
        <a href={`${REPO}/blob/main/docs/2026-10-18-mcp-listings.md`} rel="noopener" className={docLink}>listing notes</a> in the
        repository say where it stands.
      </P>

      <H2 id="streamable-http">Any streamable HTTP client</H2>
      <P>
        Give the client the URL above. Where a client wants a config file, this is the usual shape; check your client&apos;s docs
        for the exact key names.
      </P>
      <div className="mt-6">
        <CodeGroup title="Client config for the hosted endpoint" tabs={[{ label: "JSON", lang: "json", code: ex.remoteConfig }]} />
      </div>

      <H2 id="curl-test">Try it with curl</H2>
      <P>
        The server keeps no session, so one call is enough. The <C>accept</C> header must list both types.
      </P>
      <div className="mt-6">
        <CodeGroup title="Call get_by_name" tabs={[{ label: "cURL", lang: "bash", code: ex.mcpCurl }]} />
      </div>
      <Callout kind="note">
        <p>
          The public endpoint answers {REQUESTS_PER_HOUR} requests per hour for each IP address, and every call counts, including
          the handshake. See <Link href="/docs/api/keys#mcp-limits" className={docLink}>Limits and keys</Link>.
        </p>
      </Callout>

      <H2 id="run-it-yourself">Run it yourself</H2>
      <P>
        The server is in <a href={`${REPO}/tree/main/kb`} rel="noopener" className={docLink}>the repository</a>. This runs the
        website and the same endpoint on your machine, with a small sample of lore pages.
      </P>
      <div className="mt-6">
        <CodeGroup title="Run the site and its MCP endpoint locally" tabs={[{ label: "Shell", lang: "bash", code: ex.localSite }]} />
      </div>
      <P>
        Or run the server over stdio, which clients such as Claude Desktop can launch themselves. Replace the paths with your
        clone&apos;s. The environment line lets the player-data tools read the public corpus. If you have a{" "}
        <Link href="/docs/api/keys" className={docLink}>key</Link>, add <C>EVERLOOT_API_KEY</C> beside it.
      </P>
      <div className="mt-6">
        <CodeGroup title="Client config for a local stdio server" tabs={[{ label: "JSON", lang: "json", code: ex.stdioConfig }]} />
      </div>
      <P>
        The full lore archive is built from the Warcraft Wiki dump. The steps are in{" "}
        <a href={`${REPO}/blob/main/kb/README.md`} rel="noopener" className={docLink}>kb/README.md</a>.
      </P>
    </DocPage>
  );
}
