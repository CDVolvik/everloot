import { MCP_RESOURCE_URIS, MCP_TOOL_NAMES } from "@everloot/protocol";
import { expect, test } from "vitest";
import { GET as llmsFull } from "@/app/llms-full.txt/route";
import { GET as llms } from "@/app/llms.txt/route";
import { tools, toolHref } from "@/data/tools";
import { llmsFullTxt, llmsTxt } from "./llms";

const registered = MCP_TOOL_NAMES;

test("both files list every MCP tool the protocol declares", () => {
  expect(registered.length).toBeGreaterThan(0);
  for (const name of registered) {
    expect(llmsTxt()).toContain(name);
    expect(llmsFullTxt()).toContain(`- ${name}: `);
  }
});

test("both files list every MCP resource the protocol declares", () => {
  expect(MCP_RESOURCE_URIS.length).toBeGreaterThan(0);
  for (const uri of MCP_RESOURCE_URIS) {
    expect(llmsTxt()).toContain(uri);
    expect(llmsFullTxt()).toContain(`- ${uri}: `);
  }
});

test("both files list every live and collecting tool, the changes pages, connect and the open endpoints", () => {
  for (const text of [llmsTxt(), llmsFullTxt()]) {
    for (const tool of tools.filter((t) => t.status === "live" || t.status === "collecting")) {
      expect(text).toContain(`https://everloot.app${toolHref(tool)})`);
    }
    for (const needle of ["https://everloot.app/changes)", "https://everloot.app/changes/feed.xml", "https://everloot.app/connect)", "https://everloot.app/api/corpus/public", "https://everloot.app/mcp/public", "https://everloot.app/wow-forever", "https://everloot.app/map)"]) {
      expect(text).toContain(needle);
    }
    expect(text).toContain("Data limitations");
    expect(text).toContain("Not affiliated with or endorsed by Blizzard Entertainment");
  }
});

test("a coming-soon tool is not advertised as a tool", () => {
  for (const tool of tools.filter((t) => t.status === "coming-soon")) expect(llmsTxt()).not.toContain(`https://everloot.app${toolHref(tool)})`);
});

test("the full file carries the launch quote with its source and the licences", () => {
  const full = llmsFullTxt([]);
  expect(full).toContain("launches globally on November 4, 2026");
  expect(full).toContain("news.blizzard.com");
  expect(full).toContain("No WoW: Forever build is recorded yet.");
  expect(full).toContain("Blizzard's, not under Everloot's licence");
});

test("the routes answer as plain text", async () => {
  for (const handler of [llms, llmsFull]) {
    const res = handler();
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect((await res.text()).startsWith("# Everloot")).toBe(true);
  }
});

test("AI assistants are pointed at the MCP server for questions, and the raw corpus is described as bulk data", () => {
  const text = llmsTxt();
  const section = text.slice(text.indexOf("## For AI assistants and developers"));
  expect(section.indexOf("/mcp/public")).toBeLessThan(section.indexOf("/api/corpus/public"));
  expect(section).toContain("the way for an AI assistant to answer a question");
  expect(section).toContain("to answer a question, use the MCP server");
});

test("llms.txt and llms-full.txt carry the licence and credit headers", () => {
  for (const res of [llms(), llmsFull()]) {
    expect(res.headers.get("x-everloot-licence")).toBe("CC BY-SA 4.0");
    expect(res.headers.get("x-everloot-credit")).toBe("Data from Everloot (https://everloot.app), CC BY-SA 4.0.");
  }
});
