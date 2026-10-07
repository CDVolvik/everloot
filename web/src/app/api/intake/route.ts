import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { parseUpload, type CanonicalUpload, type IntakeRecord, type RecordKind } from "@/lib/intake";
import { uploadStore } from "@/lib/upload-store";
import { validateClaimToken } from "@/lib/guild-authority";

/**
 * POST /api/intake — step 1: parse + store the accepted records, return a receipt.
 * Storage is `uploadStore`: an R2 object plus a Supabase index row in production, a local
 * JSON file in dev. Rollups and corroboration are step 2.
 * Only schema-parsed records are stored, so what the store holds is what the receipt describes.
 * Best-effort per-install rate limit (in-memory; Supabase enforces it for real later).
 */
export const dynamic = "force-dynamic";

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX_UPLOADS = 20;
const hits = new Map<string, number[]>();

function rateLimited(installId: string): boolean {
  const now = Date.now();
  const window = (hits.get(installId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  window.push(now);
  hits.set(installId, window);
  return window.length > RATE_MAX_UPLOADS;
}

/** Guild record kinds that require a valid claim token. */
const GUILD_KINDS: RecordKind[] = ["guild_snapshot", "raid_lockout", "attendance", "loot_award"];

function validateGuildClaims(records: IntakeRecord[]): { valid: boolean; reason?: string } {
  for (const r of records) {
    if (!GUILD_KINDS.includes(r.kind)) continue;
    const guildRecord = r as { claimToken: string; guildName: string; realm: string };
    const check = validateClaimToken(guildRecord.claimToken, {
      guildName: guildRecord.guildName,
      realm: guildRecord.guildName,
    });
    if (!check.valid) {
      return { valid: false, reason: check.reason ?? "invalid guild claim" };
    }
  }
  return { valid: true };
}

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "body must be JSON" }, { status: 400 });
  }
  const parsed = parseUpload(payload);
  const receipt = parsed.receipt;
  if (!parsed.ok || parsed.upload.records.length === 0) {
    return NextResponse.json({ ok: false, ...receipt }, { status: 422 });
  }
  const upload: CanonicalUpload = parsed.upload;
  // Attribution comes from the accepted records, never from the first raw row.
  const installs = new Set(upload.records.map((r) => r.installId));
  if (installs.size !== 1) {
    return NextResponse.json(
      { ok: false, error: "every record in one upload must come from the same install", ...receipt },
      { status: 422 },
    );
  }
  const installId = upload.records[0].installId;

  // Validate guild claim tokens for guild records
  const guildCheck = validateGuildClaims(upload.records);
  if (!guildCheck.valid) {
    return NextResponse.json(
      { ok: false, error: guildCheck.reason ?? "invalid guild claim", ...receipt },
      { status: 422 },
    );
  }

  if (rateLimited(installId)) {
    return NextResponse.json({ ok: false, error: "rate limited: max 20 uploads/hour per install" }, { status: 429 });
  }
  const uploadId = randomUUID();
  let persisted = false;
  try {
    persisted = await uploadStore.putUpload(uploadId, installId, upload);
  } catch (err) {
    console.error(`upload ${uploadId}: store threw`, err);
  }
  if (!persisted) {
    // Validated is not stored: the submitter keeps the file and retries.
    return NextResponse.json(
      {
        ok: false,
        persisted: false,
        uploadId,
        error: "this upload was not saved — keep the file and retry in a moment",
        ...receipt,
      },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, uploadId, persisted: true, ...receipt });
}