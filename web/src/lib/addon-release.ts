import { readdirSync } from "node:fs";
import { join } from "node:path";

export interface AddonRelease {
  version: string;
  /** Site path of the zip, served from web/public/downloads. */
  downloadPath: string;
}

const NAME = /^Everloot-(\d+)\.(\d+)\.(\d+)\.zip$/;

/**
 * The newest addon zip that the site actually serves. The upload page and its structured data both read this,
 * so the version and the download link cannot disagree with the file, or with each other.
 */
export function latestAddonRelease(dir = join(process.cwd(), "public", "downloads")): AddonRelease | null {
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return null;
  }
  const found = files
    .map((file) => ({ file, m: NAME.exec(file) }))
    .filter((f): f is { file: string; m: RegExpExecArray } => f.m !== null)
    .sort((a, b) => {
      for (let i = 1; i <= 3; i++) if (a.m[i] !== b.m[i]) return Number(b.m[i]) - Number(a.m[i]);
      return 0;
    })[0];
  return found ? { version: `${found.m[1]}.${found.m[2]}.${found.m[3]}`, downloadPath: `/downloads/${found.file}` } : null;
}
