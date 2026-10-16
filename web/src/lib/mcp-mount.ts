import { createMcpHttpHandler } from "../../../kb/src/mcp-http-server";
import { getRelease } from "./release";
import { uploadStore } from "./upload-store";

/**
 * The MCP server mounted on the site's own deployment (hosting memo option A). Same handler and release
 * checks as kb/src/mcp-http-main.ts: an explicit approved release opened read-only, origin and body
 * limits, gameplay read in process from the store. Any failure is a 503, never an empty knowledge base.
 * `bearer: true` is /mcp (token); `bearer: false` is the public read-only mount.
 */
const APPROVED_CORPUS = "https://everloot.app/api/corpus/public";
const DEFAULT_ORIGINS = ["https://chatgpt.com", "https://chat.openai.com", "https://claude.ai", "https://perplexity.ai"];

export function unavailable(error: string, status = 503): Response {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export function createMount(options: { path: string; bearer: boolean }) {
  let handler: ((req: Request) => Promise<Response>) | null = null;
  return async function mount(req: Request): Promise<Response> {
    const token = process.env.EVERLOOT_MCP_TOKEN?.trim();
    if (options.bearer && !token) return unavailable("MCP is not configured");
    if (process.env.EVERLOOT_UPLOADS) return unavailable("MCP is not configured");
    const corpus = process.env.EVERLOOT_PUBLIC_CORPUS_URL?.trim();
    if (corpus && corpus !== APPROVED_CORPUS) return unavailable("MCP is not configured");
    if (!handler) {
      // Opened once per instance and shared with the lore pages; a failed open is retried on the next request.
      const release = getRelease();
      if (!release) return unavailable("Knowledge release unavailable");
      try {
        handler = createMcpHttpHandler({
          db: release.db,
          bearerToken: options.bearer ? token! : null,
          path: options.path,
          maxRequestBodyBytes: 1_048_576,
          // The public mount is limited per IP before it gets here; this is a per-instance backstop.
          rateLimitPerMinute: options.bearer ? 60 : 600,
          allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? DEFAULT_ORIGINS,
          // Same deployment as the store: read the public records in process, no HTTP self-fetch or byte ceiling.
          corpus: async () => {
            const loaded = await uploadStore.loadCorpus();
            return loaded.unreachable ? null : { records: loaded.records, dataAsOf: loaded.dataAsOf ?? null };
          },
        });
      } catch (err) {
        console.error("[mcp] knowledge release unavailable", err);
        return unavailable("Knowledge release unavailable");
      }
    }
    return handler(req);
  };
}
