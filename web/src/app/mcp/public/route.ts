import { admit } from "@/lib/data-guard";
import { createMount, unavailable } from "@/lib/mcp-mount";

/**
 * Public read-only MCP for ChatGPT and other AI clients that cannot send our bearer token (Carlos,
 * 2026-10-10: public, rate-limited). The same read-only tools over the knowledge release and the
 * already-public corpus. Closed unless EVERLOOT_MCP_PUBLIC=1. Each call spends the caller's shared
 * per-IP MCP quota first, or the caller's free key when it sends one and the data guard is on.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const mount = createMount({ path: "/mcp/public", bearer: false });

async function handle(req: Request): Promise<Response> {
  if (process.env.EVERLOOT_MCP_PUBLIC !== "1") return unavailable("Not found", 404);
  if (req.method === "POST") {
    const admitted = await admit(req, "mcp");
    if (admitted instanceof Response) return admitted;
  }
  return mount(req);
}

export const POST = handle;
export const GET = handle;
export const OPTIONS = handle;
