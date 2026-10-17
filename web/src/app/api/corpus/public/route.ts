import { NextResponse } from "next/server";
import { PUBLIC_RECORD_KINDS as PUBLIC_KINDS } from "@/lib/intake";
import { uploadStore } from "@/lib/upload-store";
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

/** `?kinds=a,b` returns only those record kinds, so an MCP tool fetches what it reads, not the whole corpus. */
export async function GET(req: Request) {
  const param = new URL(req.url).searchParams.get("kinds");
  const kinds = param === null ? null : [...new Set(param.split(",").map((k) => k.trim()).filter(Boolean))];
  if (kinds && (kinds.length === 0 || kinds.some((k) => !PUBLIC_KINDS.includes(k)))) {
    return NextResponse.json({ ok: false, error: "Unknown record kind." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const corpus = await uploadStore.loadCorpus();
  if (corpus.unreachable) return NextResponse.json({ ok: false, error: "Public corpus unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!kinds) return NextResponse.json({ ok: true, ...corpus, records: corpus.records.filter((r) => PUBLIC_KINDS.includes(r.kind)).map(published) }, { headers: { "Cache-Control": "no-store" } });
  const wanted = new Set(kinds);
  return NextResponse.json(
    { ok: true, ...corpus, kinds, records: corpus.records.filter((r) => wanted.has(r.kind)).map(published) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
