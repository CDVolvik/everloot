import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { folderProblems, isPrivateFile, isPublicFile, itemNamesCheck, parseUploadArgs, uploadOrder, withRetry } from "./game-assets-upload.mjs";

test("arguments: a folder or --snapshot <file>; a flag is never read as the path", () => {
  expect(parseUploadArgs(["../kb/data/assets/b", "--dry-run"])).toMatchObject({ folder: "../kb/data/assets/b", dry: true, snapshot: null, error: null });
  expect(parseUploadArgs(["--snapshot", "s.sqlite", "--dry-run"])).toMatchObject({ snapshot: "s.sqlite", dry: true, folder: null, error: null });
  expect(parseUploadArgs(["--dry-run", "--snapshot=s.sqlite", "--skip-items"])).toMatchObject({ snapshot: "s.sqlite", dry: true, skipItems: true, error: null });
  expect(parseUploadArgs(["--snapshot", "--dry-run", "s.sqlite"]).error).toMatch(/--snapshot needs/);
  expect(parseUploadArgs(["--snapshot"]).error).toMatch(/--snapshot needs/);
  expect(parseUploadArgs([]).error).toMatch(/nothing to upload/);
  expect(parseUploadArgs(["a", "b"]).error).toMatch(/one folder only/);
  expect(parseUploadArgs(["--snapshot", "s.sqlite", "folder"]).error).toMatch(/not both/);
  expect(parseUploadArgs(["--force"]).error).toMatch(/unknown option/);
});

test("the public bucket takes images and the manifest only; the private one the item index and shards only", () => {
  for (const f of ["manifest.json", "icons/1.webp", "maps/13-small.webp", "frames/talents-gate.webp"]) expect(isPublicFile(f), f).toBe(true);
  for (const f of ["items/0.json", "items.json", "checksums.json", "icons/1.png", "items/0.webp"]) expect(isPublicFile(f), f).toBe(false);
  for (const f of ["items.json", "items/0.json", "items/123.json"]) expect(isPrivateFile(f), f).toBe(true);
  for (const f of ["manifest.json", "icons/1.webp", "items/x.json", "items/0.json.bak"]) expect(isPrivateFile(f), f).toBe(false);
});

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

test("a folder is checked against its list: missing, unlisted, changed and wrong-kind files are all named", () => {
  const root = mkdtempSync(join(tmpdir(), "everloot-upload-"));
  mkdirSync(join(root, "icons"));
  mkdirSync(join(root, "items"));
  for (const [f, body] of [["manifest.json", "{}"], ["checksums.json", "{}"], ["icons/1.webp", "a"], ["icons/2.webp", "b"], ["items/0.json", "{}"]]) writeFileSync(join(root, f), body);
  const expected = new Map([["icons/1.webp", hash("a")], ["icons/2.webp", hash("changed")], ["icons/3.webp", hash("c")]]);
  const { present, problems } = folderProblems(root, expected, { index: "manifest.json", allowed: isPublicFile, skip: ["checksums.json"] });
  expect(present.sort()).toEqual(["icons/1.webp", "icons/2.webp", "items/0.json"]);
  expect(problems.sort()).toEqual(["hash differs: icons/2.webp", "may not go to this bucket: items/0.json", "missing: icons/3.webp", "not listed: items/0.json"]);
});

test("the manifest or index goes up last, after every file it lists", () => {
  expect(uploadOrder(["icons/1.webp", "manifest.json", "maps/13.webp"], "manifest.json")).toEqual(["icons/1.webp", "maps/13.webp", "manifest.json"]);
  expect(uploadOrder(["items/0.json"], "items.json").at(-1)).toBe("items.json");
});

test("a failed upload is tried again with growing waits, and gives up after four tries", async () => {
  const sleep = vi.fn(async (_ms: number) => {});
  let calls = 0;
  expect(await withRetry(async () => { if (++calls < 3) throw new Error("503"); return "ok"; }, { sleep })).toBe("ok");
  expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000]);
  await expect(withRetry(async () => { throw new Error("403"); }, { sleep })).rejects.toThrow("403");
});

test("a shown-names file goes under its build folder, and only when it is one", () => {
  const file = { schema: "everloot.item-names/1", build: { version: "1.60.1.70450" }, wiki: { licence: "CC-BY-SA-4.0" }, count: 1, names: { 2589: { n: "Linen Cloth", q: 1, w: "Linen_Cloth" } } };
  expect(itemNamesCheck(file, "wow_classic_beta-70450-84bea423-names")).toEqual({ prefix: "wow_classic_beta-70450-84bea423", problems: [] });
  expect(itemNamesCheck(file, "wow_classic_beta-70450-84bea423-private").problems[0]).toMatch(/-names folder/);
  expect(itemNamesCheck({ ...file, count: 2 }, "b-names").problems).toEqual(["count is 2 but the file holds 1 names"]);
  expect(itemNamesCheck({ ...file, schema: "everloot.game-items/1" }, "b-names").problems[0]).toMatch(/schema/);
  expect(itemNamesCheck({ ...file, wiki: { licence: "CC-BY-NC" } }, "b-names").problems).toEqual(["the wiki source is not CC-BY-SA-4.0"]);
});
