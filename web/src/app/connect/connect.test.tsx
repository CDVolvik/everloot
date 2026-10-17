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

import ConnectPage, { metadata } from "./page";
import { CONNECT_EXAMPLES, CORPUS_URL, GLOBAL_REQUESTS_PER_HOUR, MCP_TOOLS, MCP_URL, REQUESTS_PER_HOUR } from "./connect-data";
import { PUBLIC_RECORD_KINDS } from "@/lib/intake";
import { createIntakeQuota } from "@/lib/intake-quota";
import sitemap from "../sitemap";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

const page = renderToStaticMarkup(<ConnectPage />);
const decoded = page.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&amp;", "&");

test("the tool list is exactly the tools the MCP server registers", () => {
  const source = readFileSync(new URL("../../../../kb/src/mcp-server.ts", import.meta.url), "utf8");
  const registered = [...source.matchAll(/registerTool\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
  expect(registered.length).toBeGreaterThan(0);
  expect(MCP_TOOLS.map((tool) => tool.name)).toEqual(registered);
  for (const tool of MCP_TOOLS) expect(page).toContain(`>${tool.name}</code>`);
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

test("the stated global cap is the one in the quota code and the migration", () => {
  const quota = readFileSync(new URL("../../lib/intake-quota.ts", import.meta.url), "utf8");
  const sql = readFileSync(new URL("../../../../supabase/migrations/20261010120000_mcp_quota_scope.sql", import.meta.url), "utf8");
  expect(quota).toContain(`["mcp_global", ${GLOBAL_REQUESTS_PER_HOUR}]`);
  expect(sql).toContain(`array[${GLOBAL_REQUESTS_PER_HOUR}, ${REQUESTS_PER_HOUR}]`);
  expect(decoded).toContain(`${GLOBAL_REQUESTS_PER_HOUR} requests per hour`);
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
  expect(Object.keys(JSON.parse(CONNECT_EXAMPLES.corpusShape))).toEqual(["ok", "uploads", "records", "dataAsOf", "kinds"]);
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
