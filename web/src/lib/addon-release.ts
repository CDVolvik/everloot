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
  // The link is rebuilt from the numbers, never copied from the file name, and a name the numbers would not
  // rebuild exactly (a leading zero) is skipped, so the link always names a file that is there.
  const found = files
    .map((file) => {
      const m = NAME.exec(file);
      const v = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
      return v && file === `Everloot-${v.join(".")}.zip` ? v : null;
    })
    .filter((v): v is number[] => v !== null)
    .sort((a, b) => {
      for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return b[i] - a[i];
      return 0;
    })[0];
  if (!found) return null;
  const version = found.join(".");
  return { version, downloadPath: `/downloads/Everloot-${version}.zip` };
}
