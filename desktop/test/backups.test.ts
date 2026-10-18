import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { backupSavedVariables, listBackups } from "../src/main/backups";

const dirs: string[] = [];
const dir = () => { const d = mkdtempSync(join(tmpdir(), "everloot-backups-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

test("a backup is a dated copy per account, and only the newest ten per account stay", () => {
  const d = dir();
  const sv = join(d, "WTF", "Account", "MYACC", "SavedVariables", "Everloot.lua");
  mkdirSync(join(sv, ".."), { recursive: true });
  writeFileSync(sv, "EverlootDB = {}");
  const data = join(d, "data");
  const first = backupSavedVariables(sv, data, 10, new Date("2026-10-18T03:04:05.678Z"));
  expect(first.replace(/\\/g, "/")).toMatch(/\/backups\/MYACC-20261018T030405Z\.lua$/);
  expect(readFileSync(first, "utf8")).toBe("EverlootDB = {}");
  for (let i = 1; i <= 12; i++) backupSavedVariables(sv, data, 10, new Date(Date.UTC(2026, 9, 18, 4, i)));
  const kept = readdirSync(join(data, "backups"));
  expect(kept).toHaveLength(10);
  expect(existsSync(first)).toBe(false);
  expect(kept.every((n) => n.startsWith("MYACC-"))).toBe(true);
  const other = join(d, "WTF", "Account", "OTHER", "SavedVariables", "Everloot.lua");
  mkdirSync(join(other, ".."), { recursive: true });
  writeFileSync(other, "x");
  backupSavedVariables(other, data, 10, new Date("2026-10-18T05:00:00Z"));
  expect(readdirSync(join(data, "backups"))).toHaveLength(11);
});

test("the list is newest first with the account and time parsed from the name", () => {
  const d = dir();
  mkdirSync(join(d, "backups"));
  writeFileSync(join(d, "backups", "ACC-20261018T030405Z.lua"), "a");
  writeFileSync(join(d, "backups", "ACC-20261018T040000Z.lua"), "bb");
  writeFileSync(join(d, "backups", "note.txt"), "no");
  const list = listBackups(d);
  expect(list.map((b) => [b.account, b.at, b.bytes])).toEqual([["ACC", "2026-10-18T04:00:00Z", 2], ["ACC", "2026-10-18T03:04:05Z", 1]]);
  expect(listBackups(join(d, "none"))).toEqual([]);
});
