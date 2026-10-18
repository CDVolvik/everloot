import { API_ROUTES, MCP_TOOL_NAMES, MCP_TOOLS, PLAYER_DATA_TOOLS, STRUCTURED_TOOLS, type ApiRoute, type McpToolName } from "@everloot/protocol";
import { z } from "zod";

/**
 * The protocol as rows for the connect page: one parameter table per MCP tool and one row per API
 * endpoint, read from the same definitions the server registers and the OpenAPI document is built from.
 */

export interface ParamRow {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

type JsonSchemaNode = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  maxLength?: number;
  items?: JsonSchemaNode;
  anyOf?: JsonSchemaNode[];
};

/** A short, human type for one parameter: `integer 1 to 100`, `one of: a, b`, `string, up to 80 characters`. */
export function typeLabel(node: JsonSchemaNode): string {
  if (node.enum) return `one of: ${node.enum.map(String).join(", ")}`;
  if (node.const !== undefined) return `exactly ${String(node.const)}`;
  if (node.anyOf) return node.anyOf.map(typeLabel).join(" or ");
  const type = Array.isArray(node.type) ? node.type.join(" or ") : (node.type ?? "value");
  const parts = [type];
  const integer = type === "integer";
  const min = node.exclusiveMinimum !== undefined ? (integer ? node.exclusiveMinimum + 1 : undefined) : node.minimum;
  if (!integer && node.exclusiveMinimum !== undefined) parts.push(`above ${node.exclusiveMinimum}`);
  if (min !== undefined && node.maximum !== undefined) parts.push(`${min} to ${node.maximum}`);
  else if (min !== undefined) parts.push(`${min} or more`);
  else if (node.maximum !== undefined) parts.push(`up to ${node.maximum}`);
  if (node.maxLength !== undefined) parts.push(`up to ${node.maxLength} characters`);
  if (node.default !== undefined) parts.push(`default ${String(node.default)}`);
  return parts.join(", ");
}

/** The parameters of one MCP tool, in declaration order. */
export function toolParams(name: McpToolName): ParamRow[] {
  const json = z.toJSONSchema(z.object(MCP_TOOLS[name].inputSchema), { io: "input" }) as { properties?: Record<string, JsonSchemaNode>; required?: string[] };
  const required = new Set(json.required ?? []);
  return Object.entries(json.properties ?? {}).map(([param, node]) => ({
    name: param,
    type: typeLabel(node),
    required: required.has(param),
    description: node.description ?? "",
  }));
}

export interface ToolDoc {
  name: McpToolName;
  title: string;
  description: string;
  params: ParamRow[];
  /** Whether the answer is built on player uploads and ends with the data age and the credit line. */
  playerData: boolean;
  /** Whether the tool also returns structuredContent of a declared shape, beside the text. */
  structured: boolean;
}

export function toolDocs(): ToolDoc[] {
  return MCP_TOOL_NAMES.map((name) => ({
    name,
    title: MCP_TOOLS[name].title,
    description: MCP_TOOLS[name].description,
    params: toolParams(name),
    playerData: PLAYER_DATA_TOOLS.includes(name),
    structured: STRUCTURED_TOOLS.includes(name),
  }));
}

export const ACCESS_LABEL: Record<ApiRoute["access"], string> = {
  open: "open",
  "rate-limited": "per-IP limit",
  "key-or-rate-limited": "per-IP limit, or a free key",
  cron: "internal",
};

export const DATA_LABEL: Record<ApiRoute["data"], string> = {
  observed: "observed in play",
  "game-files": "in game files, unconfirmed",
  mixed: "both, labelled per row",
  none: "no data",
};

export function routeDocs(): ApiRoute[] {
  return [...API_ROUTES];
}
