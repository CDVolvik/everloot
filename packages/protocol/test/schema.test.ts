import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { emit } from "../scripts/emit-schema.js";
import { ALL_RECORD_KINDS, PUBLIC_RECORD_KINDS, recordSchemas, RULES, UPLOAD_LIMITS, PROTOCOL_VERSION } from "../src/index.js";

const COMMITTED = join(import.meta.dirname, "..", "schema");

/** The property names and required list of a kind's zod shape, through its refinements. */
function zodShape(kind: keyof typeof recordSchemas): { properties: string[]; required: string[] } {
  const json = z.toJSONSchema(recordSchemas[kind], { io: "input" }) as { properties: Record<string, unknown>; required?: string[] };
  return { properties: Object.keys(json.properties).sort(), required: [...(json.required ?? [])].sort() };
}

describe("schema files", () => {
  const out = mkdtempSync(join(tmpdir(), "everloot-protocol-"));
  emit(out);

  test("every kind has a file whose properties and required list match its zod shape", () => {
    const files = readdirSync(join(out, "records")).map((f) => f.replace(/\.json$/, "")).sort();
    expect(files).toEqual([...ALL_RECORD_KINDS].sort());
    for (const kind of ALL_RECORD_KINDS) {
      const file = JSON.parse(readFileSync(join(out, "records", `${kind}.json`), "utf8")) as { $schema: string; properties: Record<string, unknown>; required?: string[]; description: string };
      expect(file.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(Object.keys(file.properties).sort()).toEqual(zodShape(kind).properties);
      expect([...(file.required ?? [])].sort()).toEqual(zodShape(kind).required);
      expect(file.description).toContain(kind);
    }
  });

  test("the server's cross-field rules are written into the descriptions", () => {
    for (const [kind, rules] of Object.entries(RULES)) {
      const file = JSON.parse(readFileSync(join(out, "records", `${kind}.json`), "utf8")) as { description: string };
      for (const rule of rules) expect(file.description).toContain(rule);
    }
  });

  test("the envelope, limits and index are written", () => {
    const upload = JSON.parse(readFileSync(join(out, "upload.json"), "utf8")) as { properties: Record<string, unknown>; required: string[] };
    expect(Object.keys(upload.properties).sort()).toEqual(["addonVersion", "clientBuild", "protocol", "records"]);
    expect(upload.required.sort()).toEqual(["addonVersion", "records"]);
    expect(JSON.parse(readFileSync(join(out, "limits.json"), "utf8"))).toEqual(UPLOAD_LIMITS);
    const index = JSON.parse(readFileSync(join(out, "index.json"), "utf8")) as { protocol: string; kinds: string[]; publicKinds: string[] };
    expect(index.protocol).toBe(PROTOCOL_VERSION);
    expect(index.kinds).toEqual([...ALL_RECORD_KINDS].sort());
    expect(index.publicKinds).toEqual([...PUBLIC_RECORD_KINDS].sort());
  });

  test("the committed schema/ folder is what the emitter writes today", () => {
    // `npm run build` regenerates it; CI fails on a difference. Skipped on a checkout that never built.
    if (!existsSync(COMMITTED)) return;
    const walk = (dir: string, prefix = ""): Record<string, string> => Object.fromEntries(
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
        ? Object.entries(walk(join(dir, entry.name), `${prefix}${entry.name}/`))
        : [[`${prefix}${entry.name}`, readFileSync(join(dir, entry.name), "utf8")]]),
    );
    expect(walk(COMMITTED)).toEqual(walk(out));
  });
});
