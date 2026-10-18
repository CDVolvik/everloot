import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));
vi.mock("@/components/AccountControls", () => ({ default: () => null }));
vi.mock("@/components/CookieConsent", () => ({ CookiePreferencesButton: () => null }));
vi.mock("@/components/ApiKeys", () => ({ default: () => <div data-testid="api-keys" /> }));

import ConnectPage, { metadata } from "./page";
import { CONNECT_EXAMPLES, CORPUS_URL, MCP_RESOURCES, MCP_TOOLS, MCP_URL, REQUESTS_PER_HOUR } from "./connect-data";
import { API_ROUTES, MCP_RESOURCE_URIS, MCP_TOOL_NAMES, PROTOCOL_VERSION, PUBLIC_RECORD_KINDS } from "@everloot/protocol";
import { createIntakeQuota } from "@/lib/intake-quota";
import { ANON_PAGE, ANON_PER_HOUR, attribution, KEY_PAGE, KEY_PER_HOUR } from "@/lib/data-guard";
import sitemap from "../sitemap";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

const page = renderToStaticMarkup(<ConnectPage />);
const decoded = page.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&amp;", "&");

test("the tool list is exactly the tools the protocol declares, in order", () => {
  expect(MCP_TOOL_NAMES.length).toBeGreaterThan(0);
  expect(MCP_TOOLS.map((tool) => tool.name)).toEqual(MCP_TOOL_NAMES);
  for (const tool of MCP_TOOLS) expect(page).toContain(`>${tool.name}</code>`);
});

test("the resource list is exactly the resources the protocol declares, in order, with their schema file", () => {
  expect(MCP_RESOURCES.map((resource) => resource.uri)).toEqual(MCP_RESOURCE_URIS);
  for (const resource of MCP_RESOURCES) expect(page).toContain(`>${resource.uri}</code>`);
  expect(page).toContain("/schema/mcp/resources.json");
});

test("the reference lists every tool with its arguments, every endpoint, the OpenAPI file and the schema index", () => {
  for (const tool of MCP_TOOLS) {
    expect(page).toContain(`id="tool-${tool.name}"`);
    expect(page).toContain(`/schema/mcp/${tool.name}.json`);
    expect(page).toContain(`Answer of ${tool.name}, as structuredContent`);
  }
  for (const text of ["connected", "dataAsOf", "an absent page is not a measured zero"]) expect(decoded).toContain(text);
  for (const text of ["query", "itemId", "ownerInstallId", "required", "player data"]) expect(decoded).toContain(text);
  for (const route of API_ROUTES) expect(decoded).toContain(`${route.method} ${route.path.replace(/^\/api/, "")}`);
  for (const text of ["/api/openapi.json", "/schema/index.json", "/schema/upload.json", `@everloot/protocol`, PROTOCOL_VERSION, "offset, limit, next", "gameData"]) {
    expect(decoded).toContain(text);
  }
  expect(decoded).toContain("// Every loot record, page by page. Stop when next is null.");
  expect(decoded).toContain('print(len(records), "vendor lists; credit:"');
});

test("tells users how to add the server in Claude, Grok and any other assistant that takes a URL", () => {
  for (const text of ["https://claude.ai/customize/connectors", "including Free", "https://docs.x.ai/developers/tools/remote-mcp", "streamable HTTP MCP server by URL", "docs/2026-10-18-mcp-listings.md"]) {
    expect(decoded).toContain(text);
  }
});

test("the corpus kinds on the page are the kinds the API accepts, without addon lists", () => {
  expect(PUBLIC_RECORD_KINDS).not.toContain("addon_seen");
  for (const kind of PUBLIC_RECORD_KINDS) expect(page).toContain(kind);
  expect(page).not.toContain("addon_seen");
});

test("the stated limit is the limit the public MCP quota enforces", async () => {
  const quota = createIntakeQuota({ env: {} });
  const req = new Request("http://localhost/mcp/public");
  for (let i = 0; i < REQUESTS_PER_HOUR; i++) expect((await quota.mcp(req)).allowed).toBe(true);
  const refused = await quota.mcp(req);
  expect(refused.allowed).toBe(false);
  expect(refused.retryAfter).toBeGreaterThan(0);
  expect(page).toContain(`${REQUESTS_PER_HOUR} requests per hour`);
});

test("without EVERLOOT_MCP_QUOTA_SCOPE the MCP shares the intake bucket, as the page says", () => {
  // Production runs without the scope variable. If that changes, this fails and the page needs a new sentence.
  const quota = readFileSync(new URL("../../lib/intake-quota.ts", import.meta.url), "utf8");
  expect(quota).toMatch(/if \(env\.EVERLOOT_MCP_QUOTA_SCOPE === "mcp"\) return consume\("mcp", clientIp\(req\)\);\s*return consume\("request", `mcp:\$\{clientIp\(req\)\}`\);/);
  expect(quota).toContain('[["global", 10000], [`ip:${value}`, ' + REQUESTS_PER_HOUR + "]]");
  expect(decoded).toContain("share one hourly cap");
  expect(decoded).toContain("GET and OPTIONS are not counted");
});

test("the examples point at the production URLs and parse", () => {
  expect(MCP_URL).toBe("https://everloot.app/mcp/public");
  expect(CORPUS_URL).toBe("https://everloot.app/api/corpus/public");
  expect(CONNECT_EXAMPLES.claudeCode).toBe(`claude mcp add --transport http everloot ${MCP_URL}`);
  expect(JSON.parse(CONNECT_EXAMPLES.remoteConfig).mcpServers.everloot).toEqual({ type: "http", url: MCP_URL });
  expect(JSON.parse(CONNECT_EXAMPLES.stdioConfig).mcpServers.everloot.env.EVERLOOT_PUBLIC_CORPUS_URL).toBe(CORPUS_URL);
  const body = CONNECT_EXAMPLES.mcpCurl.match(/-d '(.*)'$/)?.[1] ?? "";
  expect(JSON.parse(body)).toMatchObject({ method: "tools/call", params: { name: "get_by_name" } });
  expect(CONNECT_EXAMPLES.mcpCurl).toContain("application/json, text/event-stream");
  expect(Object.keys(JSON.parse(CONNECT_EXAMPLES.corpusShape))).toEqual(["ok", "uploads", "records", "dataAsOf", "kinds", "offset", "limit", "total", "next", "attribution"]);
  expect(JSON.parse(CONNECT_EXAMPLES.corpusShape).attribution).toEqual(attribution("/database"));
  expect(decoded).toContain(CONNECT_EXAMPLES.corpusCurl);
});

test("states the open position, the licences and the credit line, and promises nothing unbuilt", () => {
  for (const text of ["no sign-in wall", "CC BY-SA 4.0", "AGPL-3.0-only", CONNECT_EXAMPLES.credit, "There is no bulk download yet", "WoWDBDefs", "never in them"]) {
    expect(decoded).toContain(text);
  }
  expect(decoded).not.toMatch(/api key|premium|paid|upgrade|subscribe|coming soon/i);
});

test("links the repository's policy files", () => {
  for (const file of ["DATA_POLICY.md", "THIRD_PARTY.md", "TRADEMARKS.md", "kb/README.md"]) expect(page).toContain(file);
});

test("is in the sitemap, the header and the footer", () => {
  expect(sitemap().map((entry) => new URL(entry.url).pathname)).toContain("/connect");
  expect(renderToStaticMarkup(<Header />)).toContain('href="/connect"');
  expect(renderToStaticMarkup(<Footer />)).toContain('href="/connect"');
  expect(metadata.alternates?.canonical).toBe("/connect");
});

test("with the data guard off the page promises no limit and no key it does not enforce", () => {
  expect(decoded).toContain("Keys are not switched on yet");
  expect(decoded).toContain("This endpoint has no limit of its own today");
  expect(page).not.toContain("api-keys");
  expect(decoded).not.toContain(`${ANON_PER_HOUR} requests per hour for each IP address, ${ANON_PAGE} records a page`);
});

test("with the data guard on it states the limits it enforces, how to send a key, and shows the key list", () => {
  vi.stubEnv("EVERLOOT_DATA_GUARD", "1");
  try {
    const on = renderToStaticMarkup(<ConnectPage />).replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
    for (const text of [
      `${REQUESTS_PER_HOUR} requests per hour for each IP address`,
      `${ANON_PER_HOUR} requests per hour for each IP address, ${ANON_PAGE} records a page`,
      `${KEY_PER_HOUR.toLocaleString("en-US")} requests per hour for your account, across all its keys and every endpoint`,
      "make up to 10 a day",
      "daily request counts for 90 days",
      "deleted 30 days after it was revoked",
      `${KEY_PAGE.toLocaleString("en-US")} records a page`,
      "Authorization: Bearer <key>",
      "Battle.net account",
      "Search engines and AI assistants are welcome",
      'data-testid="api-keys"',
      "no sign-in wall",
    ]) expect(on).toContain(text);
    expect(on).not.toContain("This endpoint has no limit of its own today");
    expect(on).not.toMatch(/premium|paid|upgrade|subscribe|coming soon/i);
  } finally { vi.unstubAllEnvs(); }
});

test("the credit rule names the attribution field and headers every answer carries", () => {
  for (const text of ["attribution", "X-Everloot-Licence", "X-Everloot-Credit", "Link"]) expect(decoded).toContain(text);
});
