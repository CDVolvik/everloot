import { attributionHeaders } from "@/lib/data-guard";
import { llmsTxt } from "@/lib/llms";

/** Generated from the tool catalog, the MCP tool list and the changes data, so it cannot go stale. */
export const dynamic = "force-static";
export const revalidate = 3600;

export function GET(): Response {
  return new Response(llmsTxt(), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600", ...attributionHeaders() } });
}
