import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mergeCorpus, publicRecords } from "./corpus.js";

/** Every record array in a directory of upload JSON files. A bad file is skipped. */
export function loadUploadRecords(dir: string): unknown[] {
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((file) => file.endsWith(".json"));
  } catch {
    return [];
  }
  const records: unknown[] = [];
  for (const file of files) {
    try {
      const payload = JSON.parse(readFileSync(join(dir, file), "utf8")) as { records?: unknown };
      if (Array.isArray(payload.records)) records.push(...payload.records);
    } catch {
      continue;
    }
  }
  return publicRecords(mergeCorpus(undefined, records));
}
