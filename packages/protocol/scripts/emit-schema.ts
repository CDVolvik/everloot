/**
 * Writes the language-neutral copy of the contract into schema/: one JSON Schema (draft 2020-12) per
 * record kind, the upload envelope, the limits and an index. The addon's contract tests validate the
 * rows the addon writes against these files, because Lua cannot import an npm package.
 *
 * Input mode leaves extra properties allowed, as the server strips them. The cross-field rules zod
 * enforces are written into each description so a reader of the file knows the server checks them.
 * Also written: schema/api/<name>.json for each JSON response shape plus routes.json, and
 * schema/mcp/<tool>.json for each MCP tool's input, with the output stated as text, and
 * schema/mcp/resources.json for the server's resources.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ALL_RECORD_KINDS, PUBLIC_RECORD_KINDS, recordSchemas, RULES, uploadPayload, type RecordKind } from "../src/records.js";
import { UPLOAD_LIMITS } from "../src/limits.js";
import { API_ROUTES, API_SCHEMAS } from "../src/api.js";
import { buildsResource, CHATGPT_TOOLS, MCP_PROMPT_LIST, MCP_PROMPT_NAMES, MCP_RESOURCE_LIST, MCP_RESOURCE_TEMPLATE_LIST, MCP_RESOURCE_TEMPLATE_URIS, MCP_RESOURCE_URIS, MCP_TOOL_NAMES, MCP_TOOLS, PLAYER_DATA_TOOLS, TOOL_OUTPUT } from "../src/mcp.js";
import { PROTOCOL_VERSION } from "../src/version.js";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "schema");

type JsonSchema = Record<string, unknown> & { description?: string };

function rulesFor(kind: string): readonly string[] {
  return (RULES as Record<string, readonly string[] | undefined>)[kind] ?? [];
}

/** The JSON Schema of one kind, with the server's cross-field rules written into its description. */
export function recordSchema(kind: RecordKind): JsonSchema {
  const schema = z.toJSONSchema(recordSchemas[kind], { io: "input", target: "draft-2020-12" }) as JsonSchema;
  const rules = rulesFor(kind);
  const lines = [`Everloot upload record: ${kind}.`];
  if (rules.length) lines.push(`The server also checks: ${rules.join("; ")}.`);
  schema.description = schema.description ? `${schema.description} ${lines.join(" ")}` : lines.join(" ");
  return { $id: `https://everloot.app/schema/records/${kind}.json`, ...schema };
}

function write(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function emit(out = OUT): void {
  rmSync(out, { recursive: true, force: true });
  const kinds = [...ALL_RECORD_KINDS].sort();
  for (const kind of kinds) write(join(out, "records", `${kind}.json`), recordSchema(kind));
  write(join(out, "upload.json"), {
    $id: "https://everloot.app/schema/upload.json",
    ...z.toJSONSchema(uploadPayload, { io: "input", target: "draft-2020-12" }),
    description: `The request envelope POSTed to /api/intake. Each entry of records is one record kind from records/*.json. A missing protocol means major 1; the server accepts the current major and the previous one.`,
  });
  write(join(out, "limits.json"), UPLOAD_LIMITS);
  for (const [name, schema] of Object.entries(API_SCHEMAS)) {
    write(join(out, "api", `${name}.json`), { $id: `https://everloot.app/schema/api/${name}.json`, ...z.toJSONSchema(schema, { io: "output", target: "draft-2020-12", unrepresentable: "any" }) });
  }
  write(join(out, "api", "routes.json"), API_ROUTES);
  for (const name of MCP_TOOL_NAMES) {
    const tool = MCP_TOOLS[name];
    write(join(out, "mcp", `${name}.json`), {
      $id: `https://everloot.app/schema/mcp/${name}.json`,
      title: tool.title,
      description: tool.description,
      annotations: tool.annotations,
      inputSchema: z.toJSONSchema(z.object(tool.inputSchema), { io: "input", target: "draft-2020-12" }),
      ...("outputSchema" in tool && tool.outputSchema ? { outputSchema: z.toJSONSchema(z.object(tool.outputSchema), { io: "output", target: "draft-2020-12" }) } : {}),
      "x-everloot-output": PLAYER_DATA_TOOLS.includes(name) ? TOOL_OUTPUT
        : CHATGPT_TOOLS.includes(name) ? { type: "json", note: "The text block is the structured answer as a JSON string, as OpenAI's connector contract asks." }
        : { type: TOOL_OUTPUT.type },
    });
  }
  write(join(out, "mcp", "resources.json"), {
    $id: "https://everloot.app/schema/mcp/resources.json",
    description: "The MCP server's resources, read whole with resources/read. The JSON one carries the schema of its contents.",
    resources: MCP_RESOURCE_LIST.map((resource) => ({
      ...resource,
      ...(resource.uri === "everloot://builds" ? { contents: z.toJSONSchema(buildsResource, { io: "output", target: "draft-2020-12" }) } : {}),
    })),
    templates: MCP_RESOURCE_TEMPLATE_LIST.map((t) => ({ ...t, contents: `https://everloot.app/schema/mcp/${t.tool}.json#/outputSchema` })),
  });
  write(join(out, "mcp", "prompts.json"), {
    $id: "https://everloot.app/schema/mcp/prompts.json",
    description: "The MCP server's prompts: a client fills the arguments (strings) and gets a user message that says how to use the tools for that job.",
    prompts: MCP_PROMPT_LIST.map((prompt) => ({
      name: prompt.name, title: prompt.title, description: prompt.description,
      arguments: Object.entries(prompt.arguments).map(([name, a]) => ({ name, description: a.description, required: a.required, ...("values" in a ? { values: a.values } : {}) })),
    })),
  });
  write(join(out, "index.json"), {
    protocol: PROTOCOL_VERSION, kinds, publicKinds: [...PUBLIC_RECORD_KINDS].sort(),
    api: Object.keys(API_SCHEMAS), routes: API_ROUTES.map((r) => `${r.method} ${r.path}`), mcpTools: MCP_TOOL_NAMES, mcpResources: MCP_RESOURCE_URIS, mcpResourceTemplates: MCP_RESOURCE_TEMPLATE_URIS, mcpPrompts: MCP_PROMPT_NAMES,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) emit();
