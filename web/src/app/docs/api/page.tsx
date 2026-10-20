import type { Metadata } from "next";
import Link from "next/link";
import { API_ROUTES, PROTOCOL_VERSION, SITE } from "@everloot/protocol";
import { C, Callout, H2, H3, List, P, Table, docLink } from "@/components/docs/blocks";
import { CodeGroup } from "@/components/docs/DocsClient";
import DocPage from "@/components/docs/DocPage";
import { ANON_PAGE, ANON_PER_HOUR, guardOn, KEY_PAGE, KEY_PER_HOUR } from "@/lib/data-guard";
import { DOCS_TABS, endpointHref } from "@/lib/docs/nav";
import { pageMetadata } from "@/lib/seo";
import { REPO_URL } from "@/lib/source";

export const metadata: Metadata = pageMetadata({
  title: "API overview",
  description: "Everloot's JSON API: base URL, keys and limits, response conventions, errors, paging, caching and the OpenAPI document. No account needed to read.",
  path: "/docs/api",
});

/** Every endpoint, grouped as the sidebar groups them; any route the groups miss follows in "Other". */
function endpointGroups() {
  const groups = (DOCS_TABS.find((tab) => tab.id === "api")?.groups ?? [])
    .map((group) => ({ title: group.title, pages: group.pages.filter((page) => page.method) }))
    .filter((group) => group.pages.length > 0);
  const listed = new Set(groups.flatMap((group) => group.pages.map((page) => page.href)));
  const other = API_ROUTES.filter((route) => !listed.has(endpointHref(route)));
  return [
    ...groups,
    ...(other.length
      ? [{ title: "Other", pages: other.map((route) => ({ href: endpointHref(route), title: route.path.replace(/^\/api/, ""), lede: route.summary, method: route.method })) }]
      : []),
  ];
}

export default function ApiOverview() {
  const guard = guardOn();
  return (
    <DocPage href="/docs/api">
      <P>
        The API is plain JSON over HTTPS. You can read it without an account and without a key. It is meant for building
        datasets and tools; to answer questions in an assistant, the <Link href="/docs/mcp" className={docLink}>MCP server</Link>{" "}
        is the better fit.
      </P>

      <H2 id="base-url">Base URL</H2>
      <P>Every endpoint is under one host.</P>
      <div className="mt-6">
        <CodeGroup title="Base URL" tabs={[{ label: "URL", lang: "text", code: SITE }]} />
      </div>
      <P>Your first request:</P>
      <div className="mt-6">
        <CodeGroup
          title="Get one page of drop rates"
          tabs={[
            { label: "cURL", lang: "bash", code: `curl "${SITE}/api/rollups/drops?limit=5"` },
            { label: "JavaScript", lang: "js", code: `const res = await fetch("${SITE}/api/rollups/drops?limit=5");\nconst body = await res.json();\nconsole.log(body.dataAsOf, body.rates.length);` },
            { label: "Python", lang: "python", code: `import requests\n\nbody = requests.get("${SITE}/api/rollups/drops", params={"limit": 5}).json()\nprint(body["dataAsOf"], len(body["rates"]))` },
          ]}
        />
      </div>

      <H2 id="keys-and-limits">Keys and limits</H2>
      <P>
        {guard
          ? <>You do not need a key to read. Without one, the corpus feed, the drop list, <C>/api/items</C>, <C>/api/edges</C> and <C>/api/tools</C> share one allowance of {ANON_PER_HOUR} requests per hour for each IP address, {ANON_PAGE} records a page. A free key raises that to {KEY_PER_HOUR.toLocaleString("en-US")} requests per hour and {KEY_PAGE.toLocaleString("en-US")} records a page.</>
          : <>You do not need a key to read. Keys are not switched on yet, and nothing needs one.</>}{" "}
        The MCP server and the market prices have their own per-IP limits. Every endpoint and its limit is on{" "}
        <Link href="/docs/api/keys" className={docLink}>Limits and keys</Link>.
      </P>

      <H2 id="response-conventions">Response conventions</H2>
      <P>Every answer says what kind of data it holds and how old it is.</P>
      <List>
        <li>
          <strong>Player data carries its licence.</strong> Answers built from player uploads have an <C>attribution</C>{" "}
          field with the licence, the credit line and the page the data comes from. The same goes in the{" "}
          <C>X-Everloot-Licence</C>, <C>X-Everloot-Credit</C> and <C>Link</C> headers, for clients that never read the
          body. Show the credit wherever the data appears; see <Link href="/docs/licence" className={docLink}>Licence and credit</Link>.
        </li>
        <li>
          <strong>Game-file data is labelled.</strong> Facts read from the game files are Blizzard&apos;s. They carry a{" "}
          <C>gameData</C> notice with the label &quot;Found in game files, unconfirmed&quot;, the game build and a credit to
          Blizzard, instead of Everloot&apos;s licence. Endpoints that mix both say so, and label each layer.
        </li>
        <li>
          <strong><C>dataAsOf</C> says how fresh it is.</strong> It is when the uploads behind the answer were current. Check it
          before you trust a number. It is null or absent when that is unrecorded, never &quot;now&quot;.
        </li>
        <li>
          <strong>Unrecorded is not zero.</strong> When storage cannot be read, an answer says so with{" "}
          <C>unreachable: true</C> or a <C>503</C>, and the lists in it are empty. An empty list then means unknown, not
          measured as none.
        </li>
        <li>
          <strong>Single reports are not facts.</strong> The corpus feed holds single reports. The site states a fact only
          once 3 installs agree; do the same if you publish numbers. <Link href="/docs/how-it-works" className={docLink}>How Everloot works</Link>{" "}
          explains the rule.
        </li>
      </List>

      <H2 id="errors">Errors</H2>
      <P>A refusal is JSON with <C>ok: false</C> and a sentence that says what is wrong.</P>
      <div className="mt-6">
        <CodeGroup title="An error" tabs={[{ label: "JSON", lang: "json", code: `{\n  "ok": false,\n  "error": "Unknown record kind."\n}` }]} />
      </div>
      <Table
        head={["Status", "Meaning"]}
        rows={[
          [<C key="s">400</C>, <>A parameter is wrong. <C>error</C> says what is wrong.</>],
          [<C key="s">401</C>, "The key you sent is not valid or was revoked. Only when keys are switched on."],
          [<C key="s">404</C>, "Nothing there: an unknown tool, or no page players have reported."],
          [<C key="s">429</C>, <>Rate limited. The <C>Retry-After</C> header is the number of seconds to wait.</>],
          [<C key="s">503</C>, "A dependency is unavailable. The answer is unrecorded, not zero."],
        ]}
      />
      <P>
        <C>getAKey</C> appears in an error only while free keys exist; it is the address where you make one.
      </P>

      <H2 id="paging">Paging</H2>
      <P>
        Endpoints that return lists take <C>offset</C> (0 or more) and <C>limit</C> (1 or more), whole numbers. The answer
        repeats <C>offset</C> and <C>limit</C>, gives the <C>total</C>, and gives <C>next</C>: the full URL of the following
        page, or <C>null</C> on the last one. Follow <C>next</C> until it is null.
      </P>
      <Callout kind="note">
        <p>
          {guard
            ? <>A page is capped: {ANON_PAGE} records without a key, {KEY_PAGE.toLocaleString("en-US")} with one. A larger <C>limit</C> is lowered to the cap.</>
            : <>With no <C>limit</C>, a list endpoint answers every record in one response.</>}
        </p>
      </Callout>

      <H2 id="cors">CORS</H2>
      <P>
        The tooltip endpoint, the OpenAPI document and the JSON Schemas send <C>Access-Control-Allow-Origin: *</C>, so a web
        page on any site can read them. The other endpoints set no CORS headers: call them from a server, a script or a
        desktop tool. The MCP endpoint lets browsers call it only from a short list of AI sites.
      </P>

      <H2 id="caching">Caching</H2>
      <P>
        Read each answer&apos;s <C>Cache-Control</C> header. The corpus feed and the health check are <C>no-store</C>. The
        snapshot behind the feed is rebuilt about every ten minutes, so asking more often gains nothing. Tooltip answers are
        cached by the CDN for an hour, and the OpenAPI document and schema files for about an hour in browsers.
      </P>

      <H2 id="openapi">OpenAPI document</H2>
      <P>
        The whole API in one file, OpenAPI 3.1, for client generators, request tools and assistants that read OpenAPI. It is
        assembled from the same definitions the server uses, so it cannot describe an endpoint that does not exist.
      </P>
      <div className="mt-6">
        <CodeGroup title="List the endpoints" tabs={[{ label: "cURL", lang: "bash", code: `curl -s ${SITE}/api/openapi.json | jq '.paths | keys'` }]} />
      </div>

      <H2 id="json-schemas">JSON Schemas</H2>
      <P>
        Every response shape, every record kind and every MCP tool input is also a JSON Schema file. The list is at{" "}
        <a href="/schema/index.json" className={docLink}><C>/schema/index.json</C></a>. The shapes are described on{" "}
        <Link href="/docs/api/schemas" className={docLink}>Schemas and the protocol</Link>.
      </P>

      <H2 id="protocol-version">Protocol version</H2>
      <P>
        The contract behind the API is one package, <C>@everloot/protocol</C>, and it has two version numbers. The record
        protocol, currently <C>{PROTOCOL_VERSION}</C>, is the upload contract: uploaders stamp it on every envelope. The
        package has its own version, listed in its{" "}
        <a href={`${REPO_URL}/blob/main/packages/protocol/CHANGELOG.md`} rel="noopener" className={docLink}>changelog</a>.
        For both, a new kind, field or tool is a minor release, and a removal, a rename or a tighter limit is a major release.
        The package is not on npm yet: install it from the repository&apos;s <C>packages/protocol</C> folder, or read the JSON
        Schema files instead.
      </P>

      <H2 id="endpoints">Endpoints</H2>
      <P>Each endpoint has its own page with parameters, answers and examples.</P>
      {endpointGroups().map((group) => (
        <div key={group.title}>
          <H3 id={`endpoints-${group.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{group.title}</H3>
          <Table
            head={["Method", "Path", "What it does"]}
            rows={group.pages.map((page) => [
              <C key="m">{page.method}</C>,
              <Link key="p" href={page.href} className={docLink}><code className="font-mono">{page.title}</code></Link>,
              page.lede,
            ])}
          />
        </div>
      ))}
    </DocPage>
  );
}
