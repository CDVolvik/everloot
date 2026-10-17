import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import Bracket from "@/components/Bracket";
import { PUBLIC_RECORD_KINDS } from "@/lib/intake";
import { CONNECT_EXAMPLES as ex, MCP_TOOLS, MCP_URL, REQUESTS_PER_HOUR } from "./connect-data";

export const metadata: Metadata = {
  title: "Connect",
  description: "Use Everloot's open data: the public corpus API, the MCP server for AI assistants, and the licence and credit line.",
  alternates: { canonical: "/connect" },
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
  return (
    <article className="space-y-8 max-w-3xl">
      <header className="space-y-3">
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">Connect</h1>
        <p className="text-fg-2">
          Everloot&apos;s data is open. You don&apos;t need an account or a key to read it. There are rate limits, but no
          sign-in wall. Build on it, and credit it.
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
          <li>Requests larger than 1 MiB are refused.</li>
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
        </p>
        <Code label="MCP client config for a local stdio server">{ex.stdioConfig}</Code>
        <p className="text-sm text-muted">
          The full lore archive is built from the Warcraft Wiki dump. The steps are in{" "}
          <a href={`${REPO}/blob/main/kb/README.md`} rel="noopener" className={link}>kb/README.md</a>.
        </p>
      </Section>

      <Section id="corpus" title="Corpus API">
        <p className="text-fg-2">
          Everything players have uploaded that is public, as JSON. One URL, no key.
        </p>
        <Code label="Fetch loot and vendor records">{ex.corpusCurl}</Code>
        <h3 className="font-semibold text-fg">Parameter</h3>
        <p className="text-fg-2">
          <code className="font-mono text-fg">kinds</code> is optional: a comma-separated list of record kinds. Leave it
          out to get every kind. An unknown kind returns <code className="font-mono text-fg">400</code>.
        </p>
        <p className="text-fg-2 break-words">
          Kinds: <span className="font-mono text-sm text-fg">{PUBLIC_RECORD_KINDS.join(", ")}</span>.
        </p>
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
        <p className="text-fg-2">
          This endpoint has no limit of its own today. The response is not cached, but the snapshot behind it is rebuilt about every
          ten minutes, so asking more often gains nothing. If that changes, this page will say so.
        </p>
      </Section>

      <Section id="files" title="Data files">
        <p className="text-fg-2">
          There is no bulk download yet. A full export of the published data is on the{" "}
          <a href={`${REPO}/blob/main/ROADMAP.md`} rel="noopener" className={link}>roadmap</a>, planned after launch. Until
          then the corpus API is the way to get the data as files: save the response.
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
            Nothing from the game files is published yet.
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
