import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { CASC_LIBRARY, extractTables, type TableSource } from "../src/client-extract.js";
import { CLIENT_TABLES } from "../src/client-snapshot.js";

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
  expect(missing).toEqual([]);
  expect(tables.map((t) => [t.table, t.fileDataID, t.cKey, t.rows.size, t.encryptedBlocks])).toEqual([
    ["ItemSparse", 1572924, "k1572924", 1, 31],
    ["Item", 841626, "k841626", 1, 0],
    ["SpellName", 1990283, "k1990283", 1, 14],
    ["Spell", 1140089, "k1140089", 1, 0],
  ]);
});

test("a table the build does not have is reported as missing, not invented", async () => {
  const { tables, missing } = await extractTables(fake({ [CLIENT_TABLES.Item]: { rows: [[1, { ID: 1 }]] } }));
  expect(tables.map((t) => t.table)).toEqual(["Item"]);
  expect(missing).toEqual(["ItemSparse", "SpellName", "Spell"]);
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
  const forbidden = /\b(loadRemoteTACTKeys|loadTACTKeys|loadBroadcastTACTKeys|loadRemoteListFile)\b/;
  expect(files.filter((f) => forbidden.test(readFileSync(f, "utf8")))).toEqual([]);
});

test("the library recorded in each manifest is the version kb depends on", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  expect(CASC_LIBRARY).toBe(`@rhyster/wow-casc-dbc@${pkg.dependencies["@rhyster/wow-casc-dbc"]}`);
});
