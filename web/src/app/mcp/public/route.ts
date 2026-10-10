import { intakeQuota } from "@/lib/intake-quota";
import { createMount, unavailable } from "@/lib/mcp-mount";

/**
 * Public read-only MCP for ChatGPT and other AI clients that cannot send our bearer token (Carlos,
 * 2026-10-10: public, rate-limited). The same 13 read-only tools over the knowledge release and the
 * already-public corpus. Closed unless EVERLOOT_MCP_PUBLIC=1. Each call spends the caller's shared
 * per-IP MCP quota first.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const mount = createMount({ path: "/mcp/public", bearer: false });

async function handle(req: Request): Promise<Response> {
  if (process.env.EVERLOOT_MCP_PUBLIC !== "1") return unavailable("Not found", 404);
  if (req.method === "POST") {
    try {
      const quota = await intakeQuota.mcp(req);
      if (!quota.allowed) {
        return Response.json({ error: "Rate limited. Retry later." },
          { status: 429, headers: { "retry-after": String(quota.retryAfter), "Cache-Control": "no-store" } });
      }
    } catch {
      return unavailable("Public MCP unavailable, retry later");
    }
  }
  return mount(req);
}

export const POST = handle;
export const GET = handle;
export const OPTIONS = handle;
