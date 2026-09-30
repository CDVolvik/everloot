import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { validateUpload } from "@/lib/intake";

/**
 * POST /api/intake — step 1: validate + store the raw upload, return a receipt.
 * Storage is a local JSON file (dev). The Supabase adapter replaces `storeUpload`
 * without touching the contract. Rollups and corroboration are step 2.
 * Best-effort per-install rate limit (in-memory; Supabase enforces it for real later).
 */
export const dynamic = "force-dynamic";

const MAX_RECORDS = 2000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX_UPLOADS = 20;
const hits = new Map<string, number[]>();

async function storeUpload(uploadId: string, payload: unknown): Promise<boolean> {
  try {
    const dir = join(process.cwd(), "data", "uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${uploadId}.json`), JSON.stringify(payload));
    return true;
  } catch {
    return false; // serverless FS is ephemeral/read-only: validate now, persist after Supabase lands
  }
}

function rateLimited(installId: string): boolean {
  const now = Date.now();
  const window = (hits.get(installId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  window.push(now);
  hits.set(installId, window);
  return window.length > RATE_MAX_UPLOADS;
}

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "body must be JSON" }, { status: 400 });
  }
  const result = validateUpload(payload);
  if (result.accepted.length === 0) {
    return NextResponse.json({ ok: false, ...result }, { status: 422 });
  }
  const installId =
    typeof (payload as { records?: Array<{ installId?: unknown }> })?.records?.[0]?.installId === "string"
      ? (payload as { records: Array<{ installId: string }> }).records[0].installId
      : "unknown";
  if (rateLimited(installId)) {
    return NextResponse.json({ ok: false, error: "rate limited: max 20 uploads/hour per install" }, { status: 429 });
  }
  const records = (payload as { records: unknown[] }).records;
  if (records.length > MAX_RECORDS) {
    return NextResponse.json({ ok: false, error: `max ${MAX_RECORDS} records per upload` }, { status: 413 });
  }
  const uploadId = randomUUID();
  const persisted = await storeUpload(uploadId, payload);
  return NextResponse.json({ ok: true, uploadId, persisted, ...result });
}
