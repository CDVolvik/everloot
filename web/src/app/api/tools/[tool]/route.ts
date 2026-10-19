import { NextResponse } from "next/server";
import { MCP_TOOL_NAMES, MCP_TOOLS, SITE, type McpToolName } from "@everloot/protocol";
import { z } from "zod";
import { createToolHandlers, type ToolHandlers } from "../../../../../../kb/src/mcp-server";
import { admit, attributionHeaders } from "@/lib/data-guard";
import { toolLoaders } from "@/lib/mcp-mount";
import { getRelease } from "@/lib/release";
import { argumentsFromQuery } from "@/lib/tool-query";
import { recordUsage } from "@/lib/usage-metrics";

/**
 * GET /api/tools/{tool}: one MCP tool's answer over plain HTTP, for developers without an MCP client.
 * The same handlers the MCP mounts call, reading the same release and store, so a tool answers the same
 * both ways. Arguments come from the query string and are read with the tool's own input schema, after
 * the plain-text coercion a URL needs: a number parameter takes "19019", a boolean "true" or "false".
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

function refuse(status: number, error: string): Response {
  return Response.json({ ok: false, error }, { status, headers: NO_STORE });
}

let handlers: ToolHandlers | null = null;

export async function GET(req: Request, context: { params: Promise<{ tool: string }> }) {
  const { tool } = await context.params;
  if (!(MCP_TOOL_NAMES as string[]).includes(tool)) return refuse(404, `No tool named ${tool}. Tools: ${MCP_TOOL_NAMES.join(", ")}.`);
  const name = tool as McpToolName;
  // The same key surface and per-IP quota as the other per-row JSON endpoints (/api/edges, /api/items).
  const admitted = await admit(req, "drops");
  if (admitted instanceof Response) return admitted;
  const parsed = z.object(MCP_TOOLS[name].inputSchema).safeParse(argumentsFromQuery(name, new URL(req.url).searchParams));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "arguments"}: ${i.message}`).join("; ");
    return refuse(400, `${issues}. The parameters are described at ${SITE}/schema/mcp/${name}.json.`);
  }
  const release = getRelease();
  if (!release) return refuse(503, "Knowledge release unavailable. The answer is unrecorded, not zero.");
  if (!handlers) handlers = createToolHandlers(release.db, toolLoaders());
  recordUsage("api.tools");
  let answer;
  try {
    answer = await (handlers[name] as (a: unknown) => ReturnType<ToolHandlers[McpToolName]>)(parsed.data);
  } catch (err) {
    return refuse(400, err instanceof Error ? err.message : "The tool refused the arguments.");
  }
  const text = typeof answer === "string" ? answer : answer.text;
  const structured = typeof answer === "string" ? { text } : answer.structured;
  return NextResponse.json(
    { tool: name, arguments: parsed.data, answer: structured, text, schema: `${SITE}/schema/mcp/${name}.json` },
    { headers: { ...NO_STORE, ...attributionHeaders() } },
  );
}
