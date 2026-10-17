import { indexNowKey } from "@/lib/indexnow";

/** The IndexNow ownership file: the key from INDEXNOW_KEY, or a 404 while none is set. */
export const dynamic = "force-dynamic";

export function GET(): Response {
  const key = indexNowKey();
  if (!key) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(key, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
