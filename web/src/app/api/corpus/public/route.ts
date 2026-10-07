import { NextResponse } from "next/server";
import { uploadStore } from "@/lib/upload-store";
export const dynamic = "force-dynamic";
export async function GET() {
  const corpus = await uploadStore.loadCorpus();
  if (corpus.unreachable) return NextResponse.json({ ok: false, error: "Public corpus unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ ok: true, ...corpus }, { headers: { "Cache-Control": "no-store" } });
}
