import { NextResponse } from "next/server";
import { PUBLIC_RECORD_KINDS as PUBLIC_KINDS } from "@everloot/protocol";
import { admit, attribution, attributionHeaders, badPage, pageOf, pageRequest } from "@/lib/data-guard";
import { uploadStore } from "@/lib/upload-store";
import { recordUsage } from "@/lib/usage-metrics";
export const dynamic = "force-dynamic";

/**
 * Records leave the site without their install id, so nobody can link one player's observations.
 * The site's own pages and MCP endpoints read the corpus in process and keep it for corroboration.
 */
function published<T extends object>(record: T): Omit<T, "installId"> {
  const copy = { ...record } as Record<string, unknown>;
  delete copy.installId;
  return copy as Omit<T, "installId">;
}

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * `?kinds=a,b` returns only those record kinds, so an MCP tool fetches what it reads, not the whole corpus.
 * `?offset=` and `?limit=` page through it; with the data guard on, a page is capped (see lib/data-guard.ts)
 * and `next` links the following page.
 */
export async function GET(req: Request) {
  recordUsage("api.corpus_public");
  const param = new URL(req.url).searchParams.get("kinds");
  const kinds = param === null ? null : [...new Set(param.split(",").map((k) => k.trim()).filter(Boolean))];
  if (kinds && (kinds.length === 0 || kinds.some((k) => !PUBLIC_KINDS.includes(k)))) {
    return NextResponse.json({ ok: false, error: "Unknown record kind." }, { status: 400, headers: NO_STORE });
  }
  const admitted = await admit(req, "corpus");
  if (admitted instanceof Response) return admitted;
  const at = pageRequest(req, admitted.pageMax);
  if (!at) return badPage();
  const corpus = await uploadStore.loadCorpus();
  if (corpus.unreachable) return NextResponse.json({ ok: false, error: "Public corpus unavailable." }, { status: 503, headers: NO_STORE });
  const wanted = new Set(kinds ?? PUBLIC_KINDS);
  const { items, page } = pageOf(req, corpus.records.filter((r) => wanted.has(r.kind)), at);
  return NextResponse.json(
    { ok: true, ...corpus, ...(kinds ? { kinds } : {}), records: items.map(published), ...page, attribution: attribution("/database") },
    { headers: { ...NO_STORE, ...attributionHeaders() } },
  );
}
