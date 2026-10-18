/**
 * What a client snapshot holds, table by table: rows, encrypted blocks, why a table was not read, and
 * whether each column the database pages rely on exists in this build and carries values. Column names
 * are the WoWDBDefs ones; a name the build's layout does not have is reported, never guessed.
 * Reads only the snapshot and its manifest.
 */
import { CLIENT_TABLES, readClientManifest, readClientMeta, readClientRows, type ClientBuildMeta } from "./client-snapshot.js";

/** The columns later steps read, per table (relation edges, item taxonomy, objects, the icon manifest). */
export const NEEDED_FIELDS: Partial<Record<keyof typeof CLIENT_TABLES, readonly string[]>> = {
  ItemSparse: ["Display_lang", "OverallQualityID"],
  Item: ["ClassID", "SubclassID", "InventoryType", "IconFileDataID"],
  SpellName: ["Name_lang"],
  SpellMisc: ["SpellID", "SpellIconFileDataID"],
  SpellEffect: ["SpellID", "Effect", "EffectItemType"],
  ItemClass: ["ClassID", "ClassName_lang"],
  ItemSubClass: ["ClassID", "SubClassID", "DisplayName_lang", "VerboseName_lang"],
  ItemSet: ["Name_lang", "ItemID"],
  SkillLineAbility: ["SkillLine", "Spell"],
  SpellItemEnchantment: ["Name_lang"],
  SpellReagents: ["SpellID", "Reagent", "ReagentCount"],
  AreaTable: ["AreaName_lang", "ContinentID", "ParentAreaID"],
  ChrRaces: ["Name_lang"],
  Faction: ["Name_lang"],
  CharTitles: ["Name_lang"],
  Languages: ["Name_lang"],
  CurrencyTypes: ["Name_lang"],
  CreatureFamily: ["Name_lang", "IconFileID"],
  CreatureType: ["Name_lang"],
  Holidays: ["HolidayNameID"],
  HolidayNames: ["Name_lang"],
  HolidayDescriptions: ["Description_lang"],
  QuestInfo: ["InfoName_lang", "Type"],
  QuestSort: ["SortName_lang", "UiOrderIndex"],
  Toy: ["ItemID"],
  BattlePetSpecies: ["CreatureID"],
  Creature: ["Name_lang", "Classification", "CreatureType", "CreatureFamily"],
  GameObjects: ["Name_lang", "TypeID", "OwnerID", "Pos"],
  GameObjectDisplayInfo: ["FileDataID"],
  GameObjectArtKit: ["AttachModelFileID"],
  QuestV2: ["UniqueBitFlag"],
};

export interface FieldCoverage { name: string; present: boolean; filled: number }

export interface TableCoverage {
  table: string;
  fileDataID: number;
  /** read; absent (the build does not ship it); failed (it could not be read); not extracted (older snapshot). */
  status: "read" | "absent" | "failed" | "not extracted";
  reason: string | null;
  rows: number;
  encryptedBlocks: number;
  fields: FieldCoverage[];
}

export interface CoverageReport { build: ClientBuildMeta; tables: TableCoverage[] }

/** A value counts as filled when it says something: not 0, not "", or an array with one such value. */
function filled(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(filled);
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v !== "" && v !== "0";
  return v !== null && v !== undefined;
}

export function clientCoverage(snapshotPath: string): CoverageReport {
  const build = readClientMeta(snapshotPath);
  const manifest = readClientManifest(snapshotPath);
  const read = new Map((manifest?.tables ?? []).map((t) => [t.table, t]));
  const missing = new Map((manifest?.missing ?? []).map((m) => [m.table, m.reason]));
  const tables = Object.entries(CLIENT_TABLES).map(([table, fileDataID]): TableCoverage => {
    const wanted = NEEDED_FIELDS[table as keyof typeof CLIENT_TABLES] ?? [];
    const entry = read.get(table);
    if (!entry) {
      const reason = missing.get(table) ?? null;
      const status = reason === null ? "not extracted" : reason === "not in this build" ? "absent" : "failed";
      return { table, fileDataID, status, reason, rows: 0, encryptedBlocks: 0, fields: wanted.map((name) => ({ name, present: false, filled: 0 })) };
    }
    const rows = [...readClientRows(snapshotPath, table).values()];
    const columns = new Set(rows.flatMap((r) => Object.keys(r)));
    return {
      table, fileDataID, status: "read", reason: null, rows: entry.rows, encryptedBlocks: entry.encryptedBlocks,
      fields: wanted.map((name) => ({ name, present: columns.has(name), filled: rows.filter((r) => filled(r[name])).length })),
    };
  });
  return { build, tables };
}

export function formatCoverage(report: CoverageReport): string {
  const b = report.build;
  const lines = [
    `Client tables in ${b.product} ${b.version} (build config ${b.buildConfig.slice(0, 8)}, WoWDBDefs ${b.definitions ?? "unknown"}), extracted ${b.extractedAt}.`,
    "Filled: rows where the column is not 0 or empty.",
    "",
    "| Table | File data id | Status | Rows | Encrypted blocks | Fields (rows filled) |",
    "|---|---|---|---|---|---|",
  ];
  for (const t of report.tables) {
    const status = t.status === "read" ? "read" : t.status === "failed" ? `failed: ${t.reason}` : t.status === "absent" ? "not in this build" : "not extracted";
    const fields = t.status === "read" ? t.fields.map((f) => (f.present ? `${f.name} ${f.filled}` : `**${f.name} missing**`)).join(", ") : "";
    lines.push(`| ${t.table} | ${t.fileDataID} | ${status} | ${t.rows} | ${t.encryptedBlocks} | ${fields} |`);
  }
  return `${lines.join("\n")}\n`;
}
