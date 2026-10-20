import { isScope, suggest, SUGGEST_LIMIT } from "@/lib/site-search";
import { MAX_QUERY } from "@/lib/lore";

/**
 * GET /api/suggest?q=<text>[&in=item|npc|quest|object]: up to 8 database pages for a search box as the visitor
 * types (the site's header and the database hub). An exact id first, then names players agree on (3 installs),
 * exact, then starting with the text, then containing it. Each row: type, id, label, href, and for items the
 * game files' quality number. No game-file names, icons or tooltip text: those stay on the pages.
 * Cached at the edge for a minute per query, so typing costs the site little.
 */
export const dynamic = "force-dynamic";

const CACHE = "public, max-age=60, s-maxage=60, stale-while-revalidate=300";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").trim();
  const scope = params.get("in");
  if (q.length > MAX_QUERY) return Response.json({ ok: false, error: `q is at most ${MAX_QUERY} characters.` }, { status: 400, headers: { "Cache-Control": "no-store" } });
  if (scope !== null && !isScope(scope)) return Response.json({ ok: false, error: "in must be one of item, npc, quest, object." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const results = q ? await suggest(q, scope ?? undefined) : [];
  return Response.json({ q, limit: SUGGEST_LIMIT, results }, { headers: { "Cache-Control": CACHE } });
}
