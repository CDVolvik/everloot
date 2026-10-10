import { join } from "node:path";
import { createMcpHttpHandler } from "../../../../kb/src/mcp-http-server";
import { openPublicSnapshot } from "../../../../kb/src/public-snapshot";

/**
 * Public MCP on the site's own deployment (option A in docs/2026-10-09-public-mcp-hosting-options.md).
 * Same handler and release checks as kb/src/mcp-http-main.ts: an explicit approved release opened
 * read-only, bearer auth, origin and body limits. Any failure is a 503, never an empty knowledge base.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const APPROVED_CORPUS = "https://everloot.app/api/corpus/public";
const DEFAULT_RELEASE = join(process.cwd(), ".release", "2026-10-05-everloot-public.sqlite");
const DEFAULT_ORIGINS = ["https://chatgpt.com", "https://chat.openai.com", "https://claude.ai", "https://perplexity.ai"];

let handler: ((req: Request) => Promise<Response>) | null = null;

function unavailable(error: string): Response {
  return Response.json({ error }, { status: 503, headers: { "Cache-Control": "no-store" } });
}

async function handle(req: Request): Promise<Response> {
  const token = process.env.EVERLOOT_MCP_TOKEN?.trim();
  if (!token) return unavailable("MCP is not configured");
  if (process.env.EVERLOOT_UPLOADS) return unavailable("MCP is not configured");
  const corpus = process.env.EVERLOOT_PUBLIC_CORPUS_URL?.trim();
  if (corpus && corpus !== APPROVED_CORPUS) return unavailable("MCP is not configured");
  if (!handler) {
    try {
      // Opened once per instance; a failed open is retried on the next request.
      const release = openPublicSnapshot(process.env.KB_SNAPSHOT_PATH?.trim() || DEFAULT_RELEASE);
      handler = createMcpHttpHandler({
        db: release.db,
        bearerToken: token,
        maxRequestBodyBytes: 1_048_576,
        rateLimitPerMinute: 60,
        allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? DEFAULT_ORIGINS,
      });
    } catch (err) {
      console.error("[mcp] knowledge release unavailable", err);
      return unavailable("Knowledge release unavailable");
    }
  }
  return handler(req);
}

export const POST = handle;
export const GET = handle;
export const OPTIONS = handle;
