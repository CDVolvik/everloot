import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, vi } from "vitest";
import { CASC_LIBRARY, extractTables, iconIds, openCdn, probeFiles, type TableSource } from "../src/client-extract.js";
import { CLIENT_TABLES } from "../src/client-snapshot.js";

// A stand-in for the CDN library, so openCdn can be checked without the network. Every key-loading
// method throws: openCdn must never call one.
const lib = vi.hoisted(() => {
  const noKeys = () => { throw new Error("decryption keys must never be loaded"); };
  const blocks = [
    { offset: 0, size: 64, blockIndex: 3, keyName: "FA505078126ACB3E" },
    { offset: 64, size: 64, blockIndex: 4, keyName: "FA505078126ACB3E" },
  ];
  const fetched: { cKey: string; allowMissingKey: unknown }[] = [];
  const readers: { buffer: unknown; blocks: unknown }[] = [];
  class CASCClient {
    static LocaleFlags = { enUS: 2, deDE: 32 };
    static async getProductVersion(region: string, product: string) {
      return { Region: region, BuildConfig: "84bea4233331e390fda8724c6f91ffa5", CDNConfig: "", BuildId: "70450", VersionsName: "1.60.1.70450", ProductConfig: "", product };
    }
    keys = { set: noKeys };
    async init() {}
    loadRemoteTACTKeys = noKeys;
    loadTACTKeys = noKeys;
    loadBroadcastTACTKeys = noKeys;
    loadRemoteListFile = noKeys;
    getContentKeysByFileDataID(fileDataID: number) {
      return [{ cKey: `de${fileDataID}`, localeFlags: 32 }, { cKey: `en${fileDataID}`, localeFlags: 2 }];
    }
    async getFileByContentKey(cKey: string, allowMissingKey: unknown) {
      fetched.push({ cKey, allowMissingKey });
      return { type: "partial", buffer: Buffer.from(cKey), blocks };
    }
  }
  class WDCReader {
    constructor(buffer: unknown, blocksArg: unknown) { readers.push({ buffer, blocks: blocksArg }); }
  }
  const DBDParser = {
    async parse() {
      return { getAllIDs: () => [19019], getRowData: (id: number) => ({ ID: id }) };
    },
  };
  return { CASCClient, WDCReader, DBDParser, blocks, fetched, readers };
});
vi.mock("@rhyster/wow-casc-dbc", () => ({ CASCClient: lib.CASCClient, WDCReader: lib.WDCReader, DBDParser: lib.DBDParser }));

const fake = (present: Record<number, { rows: [number, Record<string, unknown>][]; encryptedBlocks?: number }>): TableSource => ({
  async read(fileDataID) {
    const t = present[fileDataID];
    return t ? { cKey: `k${fileDataID}`, encryptedBlocks: t.encryptedBlocks ?? 0, rows: new Map(t.rows) } : null;
  },
});

test("reads each known table by file id, keeping its content key and skipped encrypted blocks", async () => {
  const source = fake({
    [CLIENT_TABLES.ItemSparse]: { rows: [[19019, { ID: 19019 }]], encryptedBlocks: 31 },
    [CLIENT_TABLES.Item]: { rows: [[19019, { ID: 19019 }]] },
    [CLIENT_TABLES.SpellName]: { rows: [[133, { ID: 133 }]], encryptedBlocks: 14 },
    [CLIENT_TABLES.Spell]: { rows: [[133, { ID: 133 }]] },
  });
  const { tables, missing } = await extractTables(source);
  expect(missing.every((m) => m.reason === "not in this build")).toBe(true);
  expect(tables.map((t) => [t.table, t.fileDataID, t.cKey, t.rows.size, t.encryptedBlocks])).toEqual([
    ["ItemSparse", 1572924, "k1572924", 1, 31],
    ["Item", 841626, "k841626", 1, 0],
    ["SpellName", 1990283, "k1990283", 1, 14],
    ["Spell", 1140089, "k1140089", 1, 0],
  ]);
});

test("the talent and spell effect tables are read by the file data ids WoWDBDefs lists for them", () => {
  expect(CLIENT_TABLES).toMatchObject({
    TraitTree: 4420305, TraitNode: 4420297, TraitNodeEntry: 4420298, TraitDefinition: 4420327, TraitEdge: 4420308,
    TraitCond: 4543085, TraitNodeGroup: 4420300, SkillLineXTraitTree: 4505477, ChrSpecialization: 1343390,
    ChrClasses: 1361031, SpellEffect: 1140088,
  });
});

test("a table the build does not have is reported as missing, not invented", async () => {
  const { tables, missing } = await extractTables(fake({ [CLIENT_TABLES.Item]: { rows: [[1, { ID: 1 }]] } }));
  expect(tables.map((t) => t.table)).toEqual(["Item"]);
  expect(missing).toEqual(
    Object.keys(CLIENT_TABLES).filter((t) => t !== "Item").map((table) => ({ table, reason: "not in this build" })),
  );
});

test("a table that cannot be read is reported with the reason, and the other tables are still extracted", async () => {
  const source: TableSource = {
    async read(fileDataID) {
      if (fileDataID === CLIENT_TABLES.SpellName) throw new Error("No valid definition found for layout 1C2B3A4D");
      return { cKey: `k${fileDataID}`, encryptedBlocks: 0, rows: new Map([[1, { ID: 1 }]]) };
    },
  };
  const { tables, missing } = await extractTables(source);
  expect(tables.map((t) => t.table)).toEqual(Object.keys(CLIENT_TABLES).filter((t) => t !== "SpellName"));
  expect(missing).toEqual([{ table: "SpellName", reason: "No valid definition found for layout 1C2B3A4D" }]);
});

test("openCdn reads the enUS file with encrypted blocks allowed, hands those blocks to the table reader and counts them", async () => {
  const { build, source } = await openCdn("wow_classic_beta");
  expect(build).toEqual({ product: "wow_classic_beta", buildConfig: "84bea4233331e390fda8724c6f91ffa5", buildId: 70450, version: "1.60.1.70450" });
  const read = await source.read(CLIENT_TABLES.ItemSparse);
  expect(lib.fetched).toEqual([{ cKey: `en${CLIENT_TABLES.ItemSparse}`, allowMissingKey: true }]);
  expect(lib.readers).toHaveLength(1);
  expect(lib.readers[0].blocks).toBe(lib.blocks);
  expect(read).toEqual({ cKey: `en${CLIENT_TABLES.ItemSparse}`, encryptedBlocks: 2, rows: new Map([[19019, { ID: 19019 }]]) });
});

test("no code in kb loads decryption keys or the unlicensed listfile", () => {
  const src = fileURLToPath(new URL("../src", import.meta.url));
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|js|mjs)$/.test(name)) files.push(p);
    }
  };
  walk(src);
  // The key loaders, writing into a client's key map, and the block reader that takes keys directly.
  const forbidden = /\b(loadRemoteTACTKeys|loadTACTKeys|loadBroadcastTACTKeys|loadRemoteListFile|BLTEReader)\b|\.keys\s*\.\s*set\b/;
  expect(files.filter((f) => forbidden.test(readFileSync(f, "utf8")))).toEqual([]);
  expect(forbidden.test("client.keys.set(name, key)")).toBe(true);
  expect(forbidden.test("new BLTEReader(blte, eKey, keys)")).toBe(true);
});

test("the library recorded in each manifest is the version kb depends on", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  expect(CASC_LIBRARY).toBe(`@rhyster/wow-casc-dbc@${pkg.dependencies["@rhyster/wow-casc-dbc"]}`);
});

test("icon file ids are looked up in the root listing and recorded as a table; nothing is downloaded", () => {
  const source: TableSource = {
    async read() { throw new Error("must not read content"); },
    fileStatus: (id) => (id === 1 ? "present" : id === 2 ? "encrypted" : "absent"),
  };
  const spellMisc = { table: "SpellMisc", fileDataID: 1, cKey: null, encryptedBlocks: 0, rows: new Map([[1, { SpellIconFileDataID: 1 }], [2, { SpellIconFileDataID: 2 }], [3, { SpellIconFileDataID: 3 }], [4, { SpellIconFileDataID: 0 }], [5, { SpellIconFileDataID: 1 }]]) };
  const ids = iconIds([spellMisc]);
  expect(ids).toEqual([1, 2, 3, 1]);
  const table = probeFiles(source, ids)!;
  expect(table.table).toBe("FileStatus");
  expect([...table.rows.values()]).toEqual([{ ID: 1, Status: "present" }, { ID: 2, Status: "encrypted" }, { ID: 3, Status: "absent" }]);
  expect(probeFiles({ read: async () => null }, ids)).toBeNull();
});
