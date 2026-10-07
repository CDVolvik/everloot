/** Private operator command: input evidence must already have been verified out of band. */
import { readFile, open } from "node:fs/promises";
import { join } from "node:path";
import { createSharingStore } from "../web/src/lib/sharing-store.js";
import { cloudConfig } from "../web/src/lib/upload-store.js";

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) throw new Error("Usage: issue-publication-grant.ts verified-input.json private-output.json (run from web/)");
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const output = await open(outputPath, "wx", 0o600);
  try {
    const store = createSharingStore({ cloud: cloudConfig(), localDir: join(process.cwd(), "data") });
    const issued = await store.issue(input);
    await output.writeFile(JSON.stringify(issued, null, 2), "utf8");
    console.log("Verified grant saved to the private output file. The bearer token was not printed.");
  } finally { await output.close(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Grant issue failed"); process.exitCode = 1; });
