import { expect, test } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import { MCP_CREDIT } from "@everloot/protocol";
import { CENSUS_LAUNCH, rollupCensus, type CensusRow } from "../src/census.js";
import { openDb } from "../src/db.js";
import { createKnowledgeServer } from "../src/mcp-server.js";
import { CENSUS_UNSET, POPULATION_TOOL, populationAnswer, type CensusLoader } from "../src/population.js";

const AS_OF = "2026-11-16T12:00:00.000Z";

let seq = 0;
/** `n` characters of one race and class, reported by three installs in turn. */
const crowd = (n: number, prefix: string, over: Partial<CensusRow> = {}): CensusRow[] =>
  Array.from({ length: n }, (_, i) => ({
    kind: "census_seen", installId: `install-${"abc"[i % 3]}`, eventId: `e:${++seq}`, capturedAt: "2026-11-15T10:00:00.000Z",
    characterKey: `${prefix}${i.toString(16).padStart(4, "0")}`, serverId: 4, race: "Gnome", class: "PRIEST", level: 20,
    faction: "Alliance", via: "target", ...over,
  }) as CensusRow);

const ROWS = [
  ...crowd(42, "a1", { race: "Human", class: "HUNTER" }),
  ...crowd(28, "a2", { race: "Human", class: "WARRIOR", level: 60 }),
  ...crowd(16, "a3"),
  ...crowd(22, "a4", { race: "Orc", class: "HUNTER", faction: "Horde" }),
  ...crowd(4, "a5", { race: "Gnome", class: "MAGE" }),
  ...crowd(12, "a6", { race: "Skyborne", class: "HUNTER", faction: "Horde" }),
];
const VIEW = rollupCensus(ROWS, { asOf: AS_OF, launch: CENSUS_LAUNCH });
const QUIET = rollupCensus(crowd(5, "b1"), { asOf: AS_OF, launch: CENSUS_LAUNCH });
const WEEK = "characters active in the last 7 days (2026-11-10 to 2026-11-16 UTC)";

const ask = (args: Partial<Parameters<typeof populationAnswer>[0]>, view = VIEW) => populationAnswer({ window: "week", ...args }, view);

test("most played class: the classes ranked, the window and the rule stated", () => {
  const { text, page } = ask({});
  expect(text).toContain(WEEK);
  expect(text).toContain("Most played class: Hunter, about 75");
  expect(text).toContain("at least 10 characters reported by at least 3 installs");
  expect(text).toContain("https://everloot.app/methodology#population");
  expect(text).toMatch(/Mage: fewer than 10/);
  expect(page.collecting).toBe(false);
  expect(page.characters).toBe(125);
  expect(page.window).toEqual({ id: "week", from: "2026-11-10T00:00:00.000Z", to: AS_OF });
  const classes = page.cells.filter((c) => c.slice === "class");
  expect(classes[0]).toMatchObject({ class: "HUNTER", label: "Hunter", count: 75, share: 0.6 });
  expect(classes.find((c) => c.class === "MAGE")).toMatchObject({ count: null, share: null });
});

test("how rare are Gnome Priests: the race and class cell with its share", () => {
  const { text, page } = ask({ race: "gnomes", class: "Priests" });
  expect(text).toContain(WEEK);
  expect(text).toContain("Gnome Priest (Alliance): about 15 characters, 12% of about 125");
  expect(page.cells).toEqual([{ slice: "raceClass", faction: "Alliance", race: "Gnome", class: "PRIEST", label: "Gnome Priest (Alliance)", count: 15, share: 0.12 }]);
});

test("a cell under the thresholds reads fewer than 10, never a number", () => {
  const { text, page } = ask({ race: "Gnome", class: "Mage" });
  expect(text).toContain("Gnome Mage (Alliance): fewer than 10 characters");
  expect(text).not.toMatch(/Gnome Mage \(Alliance\): about/);
  expect(page.cells[0]).toMatchObject({ count: null, share: null });
});

test("Skyborne plays on both factions: each side is its own cell", () => {
  const { page } = ask({ race: "Skyborne", class: "Hunter" });
  expect(page.cells.map((c) => [c.faction, c.count])).toEqual([["Horde", 10], ["Alliance", null]]);
  expect(ask({ race: "Skyborne", class: "Hunter", faction: "Horde" }).page.cells).toHaveLength(1);
});

test("a class on one faction lists that faction's races", () => {
  const { page } = ask({ class: "Hunter", faction: "Horde" });
  expect(page.cells.map((c) => c.race)).toEqual(["Orc", "Tauren", "Troll", "Skyborne"]);
});

test("a race, a class or a faction on its own", () => {
  expect(ask({ race: "Undead" }).page.cells).toEqual([{ slice: "race", faction: "Horde", race: "Scourge", label: "Undead (Horde)", count: null, share: null }]);
  expect(ask({ class: "WARRIOR" }).page.cells[0]).toMatchObject({ slice: "class", count: 30 });
  expect(ask({ faction: "Horde" }).page.cells[0]).toMatchObject({ slice: "faction", faction: "Horde", count: 35 });
});

test("a combination the game does not have, or a name it does not know, says so", () => {
  const orc = ask({ race: "Orc", class: "Paladin" });
  expect(orc.text).toContain("Orc Paladin is not a playable combination in WoW: Forever");
  expect(orc.page.cells).toEqual([]);
  expect(ask({ race: "Orc", faction: "Alliance" }).text).toContain("Orc is not an Alliance race");
  const unknown = ask({ race: "Pandaren" });
  expect(unknown.text).toContain('No race called "Pandaren"');
  expect(unknown.text).toContain("Night Elf");
  expect(ask({ class: "Monk" }).text).toContain('No class called "Monk"');
});

test("while collecting, the answer says so and names the window and how many installs have reported", () => {
  const { text, page } = ask({ race: "Gnome", class: "Priest" }, QUIET);
  expect(text).toContain(WEEK);
  expect(text).toContain("Still collecting");
  expect(text).toContain("3 installs have reported");
  expect(text).not.toMatch(/about \d/);
  expect(page).toMatchObject({ collecting: true, characters: null });
  expect(page.cells.every((c) => c.count === null)).toBe(true);
});

test("since launch is its own window, stated in the answer", () => {
  const { text, page } = ask({ window: "launch" });
  expect(text).toContain("characters seen since launch (2026-11-04 to 2026-11-16 UTC)");
  expect(page.window.id).toBe("launch");
});

test("the answer names its source and carries no character key or install id", () => {
  const { text, page } = ask({});
  expect(page.source).toEqual({ title: "Everloot census", url: "https://everloot.app/census" });
  for (const r of ROWS) {
    expect(text).not.toContain(r.characterKey);
    expect(JSON.stringify(page)).not.toContain(r.installId);
  }
});

const connect = async (census?: CensusLoader) => {
  const server = createKnowledgeServer(openDb(":memory:"), census ? { census } : {});
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  return client;
};

test("over MCP: listed with its schemas, answering text with the data age and credit, and structured content", async () => {
  const client = await connect(async () => ({ view: VIEW, dataAsOf: AS_OF }));
  const tool = (await client.listTools()).tools.find((t) => t.name === "population")!;
  expect(tool.title).toBe(POPULATION_TOOL.title);
  expect(tool.annotations?.readOnlyHint).toBe(true);
  expect(Object.keys(tool.inputSchema.properties ?? {}).sort()).toEqual(["class", "faction", "race", "window"]);
  expect(tool.outputSchema).toBeDefined();
  const answer = await client.callTool({ name: "population", arguments: { race: "Gnome", class: "Priest" } });
  const text = (answer.content as { text: string }[])[0].text;
  expect(text).toContain(WEEK);
  expect(text).toContain("Data as of 2026-11-16 12:00 UTC.");
  expect(text.endsWith(MCP_CREDIT)).toBe(true);
  const structured = z.object(POPULATION_TOOL.outputSchema).parse(answer.structuredContent);
  expect(structured).toMatchObject({ connected: true, dataAsOf: AS_OF, page: { characters: 125, cells: [{ count: 15 }] } });
  await client.close();
});

test("over MCP: not connected and unavailable are said, never shown as zero", async () => {
  const off = await connect();
  const unset = await off.callTool({ name: "population", arguments: {} });
  expect((unset.content as { text: string }[])[0].text).toBe(CENSUS_UNSET);
  expect(unset.structuredContent).toEqual({ connected: false, dataAsOf: null, reason: CENSUS_UNSET });
  await off.close();
  const broken = await connect(async () => null);
  const down = await broken.callTool({ name: "population", arguments: {} });
  expect((down.content as { text: string }[])[0].text).toContain("unrecorded, not zero");
  expect(down.structuredContent).toMatchObject({ connected: false, dataAsOf: null });
  await broken.close();
});
