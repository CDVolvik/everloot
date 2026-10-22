import { NextResponse } from "next/server";
import { uploadStore, type SnapshotHealth } from "@/lib/upload-store";
export const dynamic = "force-dynamic";
let cached: { at: number; snapshot: SnapshotHealth } | undefined;
export async function GET() {
  if (!cached || Date.now() - cached.at > 60_000) {
    // snapshotHealth measures the cron heartbeat; idle corpus data keeps its original dataAsOf.
    cached = { at: Date.now(), snapshot: await uploadStore.snapshotHealth() };
  }
  const ok = cached.snapshot.status === "fresh";
  return NextResponse.json({ ok, snapshot: cached.snapshot }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
