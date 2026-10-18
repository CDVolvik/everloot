import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { MCP_URL } from "@/app/connect/connect-data";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

test("server.json for the MCP registry points at the public endpoint and the server's own version", () => {
  const server = JSON.parse(read("server.json")) as { name: string; description: string; version: string; remotes: { type: string; url: string }[]; websiteUrl: string };
  expect(server.name).toBe("app.everloot/knowledge");
  expect(server.remotes).toEqual([{ type: "streamable-http", url: MCP_URL }]);
  expect(server.description.length).toBeLessThanOrEqual(100);
  expect(server.websiteUrl).toBe("https://everloot.app/connect");
  const version = read("kb/src/mcp-server.ts").match(/SERVER_VERSION = "([^"]+)"/)?.[1];
  expect(server.version).toBe(version);
});

test("the registry's HTTP proof record is served from .well-known in the documented format", () => {
  const record = read("web/public/.well-known/mcp-registry-auth").trim();
  expect(record).toMatch(/^v=MCPv1; k=ed25519; p=[A-Za-z0-9+/]{43}=$/);
  expect(record.split(";")).toHaveLength(3);
});

test("the listing icons exist at the sizes the directories ask for", () => {
  for (const size of [512, 64]) expect(existsSync(new URL(`web/public/icon-${size}.png`, root))).toBe(true);
});
