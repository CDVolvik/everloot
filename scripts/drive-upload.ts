// Drives the upload from the machine the file is on, with the site's own parser and the site's own
// request shape. Used to send a saved addon file without the browser page.
import { readFileSync } from "node:fs";
import { parseEverlootLua } from "../web/src/lib/sv-parse";
import { prepareUpload } from "../web/src/lib/upload-batches";

async function main() {
  const file = process.argv[2];
  const site = process.argv[3] ?? "https://everloot.app";

  const text = readFileSync(file, "utf8");
  const parsed = parseEverlootLua(text);
  console.log("file:", file);
  console.log("addon version:", parsed.version, "| client build:", parsed.clientBuild, "| records:", parsed.records.length);
  const kinds = new Map<string, number>();
  for (const r of parsed.records as { kind: string }[]) kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);
  console.log("kinds:", [...kinds.entries()].map(([k, n]) => `${k}:${n}`).join(" "));

  // The sharing choices the upload page sends: every category on, the way the page's default is.
  const sharing: Record<string, boolean> = {};
  const session = prepareUpload(
    { addonVersion: parsed.version, clientBuild: parsed.clientBuild, records: parsed.records },
    sharing,
    [],
  );
  console.log("batches:", session.batches.length, "| records in the first batch:", JSON.parse(session.batches[0]).records.length);

  for (const body of session.batches) {
    const response = await fetch(`${site}/api/intake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const receipt = await response.json();
    console.log("receipt:", response.status, JSON.stringify({ ok: receipt.ok, persisted: receipt.persisted, uploadId: receipt.uploadId, accepted: receipt.accepted?.length, rejected: receipt.rejected?.length, error: receipt.error }));
    if (!response.ok || receipt.persisted !== true) process.exit(1);
  }
}

main();
