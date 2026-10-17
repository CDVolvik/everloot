import { createMcpHttpHandler } from "../../../kb/src/mcp-http-server";
import { loadTimeline } from "./changes";
import { attributionHeaders } from "./data-guard";
import { loadEcosystem } from "./ecosystem";
import { getRelease } from "./release";
import { uploadStore } from "./upload-store";
import { mcpToolMetrics, recordUsage } from "./usage-metrics";

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
          // The same timeline the /changes page shows, read from the files bundled with the site.
          changes: () => loadTimeline(),
          // The registry and GitHub snapshot bundled with the site, joined with the same install counts as /addons/popular.
          ecosystem: () => loadEcosystem(),
          // The public mount is limited per IP before it gets here; this is a per-instance backstop.
          rateLimitPerMinute: options.bearer ? 60 : 600,
          allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? DEFAULT_ORIGINS,
          // Same deployment as the store: read the public records in process, no HTTP self-fetch or byte ceiling.
          corpus: async () => {
            const loaded = await uploadStore.loadCorpus();
            return loaded.unreachable ? null : { records: loaded.records, dataAsOf: loaded.dataAsOf ?? null };
          },
          market: async () => {
            const loaded = await uploadStore.loadMarket();
            return loaded.state ? { state: loaded.state, dataAsOf: loaded.dataAsOf } : null;
          },
        });
      } catch (err) {
        console.error("[mcp] knowledge release unavailable", err);
        return unavailable("Knowledge release unavailable");
      }
    }
    // Counting is opt-in. Only then is a clone of a small, declared-size body read, so the handler still
    // gets the original and nothing changes for the default deployment.
    const length = Number(req.headers.get("content-length"));
    const counting = req.method === "POST" && process.env.EVERLOOT_USAGE_METRICS === "1" &&
      req.headers.has("content-length") && Number.isFinite(length) && length <= 1_048_576;
    let body: string | null = null;
    if (counting) { try { body = await req.clone().text(); } catch {} }
    const response = await handler(req);
    // Only calls the handler accepted count: unauthenticated, invalid or rate-limited ones return non-2xx.
    if (body !== null && response.status >= 200 && response.status < 300) {
      recordUsage(mcpToolMetrics(body, options.bearer ? "mcp" : "mcp_public"));
    }
    // The licence and credit line travel with every answer, for clients that log headers.
    for (const [name, value] of Object.entries(attributionHeaders())) response.headers.set(name, value);
    return response;
  };
}
