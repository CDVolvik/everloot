import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@everloot/protocol";
import ApiKeys from "@/components/ApiKeys";
import { C, Callout, H2, List, P, docLink } from "@/components/docs/blocks";
import { CodeGroup } from "@/components/docs/DocsClient";
import DocPage from "@/components/docs/DocPage";
import { KEYS_MADE_PER_DAY, KEYS_PER_ACCOUNT, REVOKED_KEPT_DAYS, USAGE_KEPT_DAYS } from "@/lib/api-keys";
import { ANON_PAGE, ANON_PER_HOUR, guardOn, KEY_PAGE, KEY_PER_HOUR } from "@/lib/data-guard";
import { REQUESTS_PER_HOUR } from "@/lib/docs/connect-data";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Limits and keys",
  description: "How much you can read from Everloot's API and MCP server without a key, how a free API key raises the limits, and how to send it.",
  path: "/docs/api/keys",
});

export default function KeysPage() {
  // Read at build time; turning the guard on in Vercel takes a redeploy, which rebuilds this page too.
  const guard = guardOn();
  return (
    <DocPage href="/docs/api/keys">
      <P>
        Everloot&apos;s data is open. You do not need an account or a key to read it. There are rate limits, but no sign-in
        wall.
      </P>

      {guard ? (
        <>
          <H2 id="limits">Limits</H2>
          <List>
            <li>
              <strong>Asking questions needs no key.</strong> The MCP server and the market prices answer {REQUESTS_PER_HOUR}{" "}
              requests per hour for each IP address.
            </li>
            <li>
              <strong>Copying in bulk does.</strong> Without a key, the corpus API and the drop list answer {ANON_PER_HOUR} requests
              per hour for each IP address, {ANON_PAGE} records a page.
            </li>
            <li>
              <strong>A free key raises that</strong> to {KEY_PER_HOUR.toLocaleString("en-US")} requests per hour for your
              account, across all its keys and every endpoint, {KEY_PAGE.toLocaleString("en-US")} records a page.
            </li>
            <li>
              <strong>Over a limit</strong> you get <C>429</C>, a <C>retry-after</C> header in seconds and a message that points
              here.
            </li>
            <li>The site&apos;s pages have none of these limits. Search engines and AI assistants are welcome to read and quote them.</li>
          </List>

          <H2 id="send-a-key">Send a key</H2>
          <P>
            Put the key in an <C>Authorization</C> header as a bearer token. Keys start with <C>evl_</C>. The same header works
            on the MCP endpoint, and a self-hosted MCP server reads the key from <C>EVERLOOT_API_KEY</C>.
          </P>
          <div className="mt-6">
            <CodeGroup
              title="Read the corpus with a key"
              tabs={[
                { label: "cURL", lang: "bash", code: `curl "${SITE}/api/corpus/public?limit=1000" \\\n  -H "Authorization: Bearer $EVERLOOT_API_KEY"` },
                { label: "JavaScript", lang: "js", code: `const res = await fetch("${SITE}/api/corpus/public?limit=1000", {\n  headers: { Authorization: \`Bearer \${process.env.EVERLOOT_API_KEY}\` },\n});\nconsole.log(res.status, (await res.json()).total);` },
                { label: "Python", lang: "python", code: `import os, requests\n\nres = requests.get(\n    "${SITE}/api/corpus/public",\n    params={"limit": 1000},\n    headers={"Authorization": f"Bearer {os.environ['EVERLOOT_API_KEY']}"},\n)\nprint(res.status_code, res.json()["total"])` },
              ]}
            />
          </div>
          <P>
            A key that is not valid or was revoked gets <C>401</C>. Keep keys out of web pages and public repositories: a key in
            a browser can be read by anyone who opens it.
          </P>

          <H2 id="about-keys">About keys</H2>
          <List>
            <li>
              A key belongs to your Battle.net account, and we count requests per key. That is how we know who copies the data in
              bulk, so we can ask what they are building.
            </li>
            <li>
              You can hold {KEYS_PER_ACCOUNT} keys, make up to {KEYS_MADE_PER_DAY} a day, and revoke or delete any of them below.
            </li>
            <li>We revoke a key that is used to republish the data without credit.</li>
            <li>
              We keep a key&apos;s daily request counts for {USAGE_KEPT_DAYS} days. A revoked key and its counts are deleted{" "}
              {REVOKED_KEPT_DAYS} days after it was revoked, or at once when you delete it. To delete your account and everything
              tied to it, write to <a href="mailto:hello@everloot.app" className={docLink}>hello@everloot.app</a>.
            </li>
          </List>

          <H2 id="your-keys">Your keys</H2>
          <ApiKeys />
        </>
      ) : (
        <>
          <H2 id="limits">Limits</H2>
          <P>Keys are not switched on yet, and nothing needs one. Before they are, this page will list the limits.</P>
          <List>
            <li>
              The MCP server and the market prices answer {REQUESTS_PER_HOUR} requests per hour for each IP address. Over it you
              get <C>429</C> and a <C>retry-after</C> header in seconds.
            </li>
          </List>
        </>
      )}

      <H2 id="mcp-limits">MCP server limits</H2>
      <List>
        <li>
          {REQUESTS_PER_HOUR} requests per hour for each IP address. Every call counts, including the handshake and the tool list.
        </li>
        <li>Over the limit you get <C>429</C> and a <C>retry-after</C> header, in seconds.</li>
        <li>
          All callers share one hourly cap, which uploads count against too. When it is used up, everyone gets the same <C>429</C>.
        </li>
        <li>Only POST requests count. GET and OPTIONS are not counted.</li>
        <li>Requests larger than 1 MiB are refused.</li>
        {guard && <li>A free key raises the limit to {KEY_PER_HOUR.toLocaleString("en-US")} requests per hour.</li>}
        <li>
          Web pages in a browser can call it only from a short list of AI sites, such as chatgpt.com and claude.ai. Servers,
          scripts and desktop clients are not affected.
        </li>
      </List>

      <Callout kind="tip">
        <p>
          Need more? Write to <a href="mailto:hello@everloot.app" className={docLink}>hello@everloot.app</a> and say what you
          are building. For a full copy of the data, see <Link href="/docs/api/data-files" className={docLink}>Data files</Link>.
        </p>
      </Callout>
    </DocPage>
  );
}
