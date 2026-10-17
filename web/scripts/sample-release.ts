/**
 * A small lore release for local development, so /lore, /lore/<type> and /search show pages without
 * the real 300+ MB release: npm run sample-release, then add the printed line to web/.env.local.
 * The rows are the lore tests' fixture (about 35 pages). Stop `npm run dev` before rebuilding it.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildLoreRelease } from "../src/test/lore-release";

export async function sampleRelease(outDir: string): Promise<{ path: string; envLine: string }> {
  const path = await buildLoreRelease({ dir: resolve(outDir) });
  return { path, envLine: `KB_SNAPSHOT_PATH=${path.replace(/\\/g, "/")}` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  sampleRelease(".data").then(({ envLine }) => {
    console.log("Sample lore release built. Add this line to web/.env.local, then run npm run dev:");
    console.log(envLine);
  });
}
