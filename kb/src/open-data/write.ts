import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CREDIT_LINE, GAME_DATA_CREDIT, LICENCE, LICENCE_URL } from "@everloot/protocol";
import { z } from "zod";
import { WORLD_AGREEMENT } from "../fact-states.js";
import { buildOpenData, type OpenData, type OpenDataInput } from "./build.js";
import { OPEN_DATA_SCHEMA, OpenDataManifest, type ManifestFile } from "./manifest.js";
import { GAME_FILES_LABEL, OPEN_DATA_EXCLUDED, OPEN_DATA_METHOD, OPEN_DATA_NOT_YET, OPEN_DATA_VERIFY, renderLicence, renderReadme } from "./text.js";

/** What a published file must never carry: a machine's own filesystem paths (the same guard as the bulk upload). */
const LOCAL_PATH = /[A-Za-z]:\\|\/(?:Users|home)\/|AppData[\\/]/;

/** Every string value of a row, at any depth. */
function* strings(value: unknown): Generator<string> {
  if (typeof value === "string") yield value;
  else if (Array.isArray(value)) for (const v of value) yield* strings(v);
  else if (value && typeof value === "object") for (const v of Object.values(value)) yield* strings(v);
}

export interface WrittenOpenData {
  manifest: OpenDataManifest;
  /** Paths written, relative to the folder, `manifest.json` last. */
  paths: string[];
}

/**
 * Writes the export into `outDir`, which must be new or empty, and returns its manifest. Refuses, writing
 * nothing, when a row is not a row of its schema (an `installs` count under 3, a key the schema does not name),
 * when an observed row carries a string that is an install id of the input, or when any file would carry a
 * local filesystem path.
 */
export function writeOpenData(outDir: string, input: OpenDataInput, built: OpenData = buildOpenData(input)): WrittenOpenData {
  const bodies = new Map<string, { file: Omit<ManifestFile, "bytes" | "sha256">; body: Buffer; schema: unknown }>();
  for (const d of built.datasets) {
    const lines: string[] = [];
    for (const [i, raw] of d.rows.entries()) {
      const parsed = d.schema.safeParse(raw);
      if (!parsed.success) throw new Error(`refusing to export: ${d.layer}/${d.name} row ${i + 1} is not a row of its schema: ${parsed.error.issues.map((e) => `${e.path.join(".") || "row"} ${e.message}`).join("; ")}`);
      if (d.layer === "observed") {
        for (const s of strings(parsed.data)) {
          if (built.installIds.has(s)) throw new Error(`refusing to export: ${d.layer}/${d.name} row ${i + 1} carries an install id`);
        }
      }
      lines.push(JSON.stringify(parsed.data));
    }
    const path = `${d.layer}/${d.name}.ndjson`;
    bodies.set(path, {
      file: { path, layer: d.layer, dataset: d.name, about: d.about, schema: `schema/${d.layer}-${d.name}.schema.json`, rows: d.rows.length, candidates: d.candidates, candidatesAre: d.candidatesAre },
      body: Buffer.from(lines.length ? `${lines.join("\n")}\n` : "", "utf8"),
      schema: z.toJSONSchema(d.schema),
    });
  }

  const manifest = OpenDataManifest.parse({
    schema: OPEN_DATA_SCHEMA,
    generatedAt: input.generatedAt,
    dataAsOf: input.dataAsOf,
    method: { agreement: WORLD_AGREEMENT, text: OPEN_DATA_METHOD },
    source: built.source,
    gameFiles: { version: input.gameFiles.build.version, extractedAt: input.gameFiles.build.extractedAt, label: GAME_FILES_LABEL },
    licence: {
      observed: { folder: "observed/", name: LICENCE, url: LICENCE_URL, credit: CREDIT_LINE },
      gameFiles: { folder: "game-files/", name: "Blizzard's data, not under Everloot's licence", credit: GAME_DATA_CREDIT },
    },
    excluded: [...OPEN_DATA_EXCLUDED],
    notYet: [...OPEN_DATA_NOT_YET],
    verify: [...OPEN_DATA_VERIFY],
    files: [...bodies.values()].map(({ file, body }) => ({ ...file, bytes: body.length, sha256: createHash("sha256").update(body).digest("hex") })),
  } satisfies OpenDataManifest);

  const out: [string, string | Buffer][] = [
    ...[...bodies].map(([path, { body }]): [string, Buffer] => [path, body]),
    ...[...bodies.values()].map(({ file, schema }): [string, string] => [file.schema, `${JSON.stringify(schema, null, 2)}\n`]),
    ["README.md", renderReadme(manifest)],
    ["LICENCE.md", renderLicence(manifest)],
    ["manifest.json", `${JSON.stringify(manifest, null, 2)}\n`],
  ];
  for (const [path, body] of out) {
    const hit = body.toString("utf8").match(LOCAL_PATH);
    if (hit) throw new Error(`refusing to export: ${path} carries what looks like a local filesystem path (${hit[0]})`);
  }

  if (existsSync(outDir) && readdirSync(outDir).length > 0) throw new Error(`${outDir} is not empty; an export goes into a new folder`);
  for (const [path, body] of out) {
    mkdirSync(dirname(join(outDir, path)), { recursive: true });
    writeFileSync(join(outDir, path), body);
  }
  return { manifest, paths: out.map(([path]) => path) };
}
