import { readFileSync } from "node:fs";

/**
 * JSON from a file the player may have edited by hand. Notepad and some editors save UTF-8 with a
 * byte order mark, which JSON.parse refuses; the mark is dropped first.
 */
export function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));
}
