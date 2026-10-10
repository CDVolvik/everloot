import { NextResponse } from "next/server";
import { ALL_RECORD_KINDS } from "@/lib/intake";
import { uploadStore } from "@/lib/upload-store";
export const dynamic = "force-dynamic";

/** `?kinds=a,b` returns only those record kinds, so an MCP tool fetches what it reads, not the whole corpus. */
export async function GET(req: Request) {
  const param = new URL(req.url).searchParams.get("kinds");
  const kinds = param === null ? null : [...new Set(param.split(",").map((k) => k.trim()).filter(Boolean))];
  if (kinds && (kinds.length === 0 || kinds.some((k) => !(ALL_RECORD_KINDS as readonly string[]).includes(k)))) {
    return NextResponse.json({ ok: false, error: "Unknown record kind." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const corpus = await uploadStore.loadCorpus();
  if (corpus.unreachable) return NextResponse.json({ ok: false, error: "Public corpus unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!kinds) return NextResponse.json({ ok: true, ...corpus }, { headers: { "Cache-Control": "no-store" } });
  const wanted = new Set(kinds);
  return NextResponse.json(
    { ok: true, ...corpus, kinds, records: corpus.records.filter((r) => wanted.has(r.kind)) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
