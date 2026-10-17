import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { COMPLETION_CATALOG_KINDS, parseUpload, type CanonicalUpload } from "@/lib/intake";
import { uploadStore, sharingStore } from "@/lib/upload-store";
import { intakeQuota, type QuotaResult } from "@/lib/intake-quota";
import { recordUsage } from "@/lib/usage-metrics";
import { MARKET_LIMITS, realmKey } from "../../../../../kb/src/market";
import { authorizeRecord, sharingCategory, type PublicationGrant } from "../../../../../kb/src/publication";

/**
 * POST /api/intake — step 1: parse + store the accepted records, return a receipt.
 * Storage is `uploadStore`: an R2 object plus a Supabase index row in production, a local
 * JSON file in dev. Rollups and corroboration are step 2.
 * Only schema-parsed records are stored, so what the store holds is what the receipt describes.
 * Production request and install admission share atomic Supabase counters.
 */
export const dynamic = "force-dynamic";

async function admission(check: () => Promise<QuotaResult>) {
  try {
    const result = await check();
    if (!result.allowed) return NextResponse.json({ ok: false, error: "Upload rate limited. Keep your file and retry later." },
      { status: 429, headers: { "retry-after": String(result.retryAfter), "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Upload admission unavailable. Keep your file and retry." }, { status: 503 });
  }
  return null;
}

export async function POST(req: Request) {
  const requestDenied = await admission(() => intakeQuota.request(req));
  if (requestDenied) return requestDenied;
  recordUsage("api.intake");
  let payload: unknown;
  try {
    const reader = req.body?.getReader();
    if (!reader) throw new Error("empty body");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 1_000_000) {
        await reader.cancel();
        return NextResponse.json({ ok: false, error: "Upload batch exceeds 1 MB. Split the file and retry." }, { status: 413 });
      }
      chunks.push(chunk.value);
    }
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return NextResponse.json({ ok: false, error: "body must be JSON" }, { status: 400 });
  }
  const parsed = parseUpload(payload);
  const receipt = parsed.receipt;
  if (!parsed.ok || parsed.upload.records.length === 0) {
    return NextResponse.json({ ok: false, ...receipt }, { status: 422 });
  }
  const upload: CanonicalUpload = parsed.upload;
  const options = payload as { sharing?: Record<string, unknown>; grantTokens?: unknown };
  const tokens = options.grantTokens ?? [];
  if (!Array.isArray(tokens) || tokens.length > 4 || tokens.some((t) => typeof t !== "string" || !/^[a-f0-9]{64}$/.test(t))) {
    return NextResponse.json({ ok: false, error: "Invalid verification grants" }, { status: 400 });
  }
  const needsAuthority = upload.records.some((row) => sharingCategory(row) !== null);
  let grants: PublicationGrant[] = [];
  try {
    if (needsAuthority) grants = (await Promise.all(tokens.map((token) => sharingStore.lookup(token)))).filter((g): g is PublicationGrant => g !== null);
  } catch {
    return NextResponse.json({ ok: false, error: "Verification storage unavailable. Keep your file and retry." }, { status: 503 });
  }
  const authorized = [];
  const accepted = [];
  const grantHashes = new Set<string>();
  const scanRealms = new Set<string>();
  for (let i = 0; i < upload.records.length; i++) {
    const row = upload.records[i];
    if (row.kind === "auction_snapshot") {
      // One file cannot name dozens of realms: the market keeps a handful per upload.
      const key = realmKey(row.realm);
      if (!scanRealms.has(key) && scanRealms.size >= MARKET_LIMITS.realmsPerUpload) {
        receipt.rejected.push({ index: receipt.accepted[i].index, reason: `An upload may carry scans from at most ${MARKET_LIMITS.realmsPerUpload} realms.` });
        continue;
      }
      scanRealms.add(key);
    }
    const category = sharingCategory(row);
    const matching = category ? grants.filter((g) => authorizeRecord(row, [g.tokenHash], { grants: [g], suppressions: [] }, new Date())) : [];
    if (category && (options.sharing?.[category] !== true || matching.length === 0)) {
      receipt.rejected.push({ index: receipt.accepted[i].index, reason: "Named data requires an explicit sharing choice and a current matching verified grant." });
      continue;
    }
    if ("claimToken" in row) delete row.claimToken;
    matching.forEach((g) => grantHashes.add(g.tokenHash));
    authorized.push(row); accepted.push(receipt.accepted[i]);
  }
  upload.records = authorized; receipt.accepted = accepted;
  if (!authorized.length) return NextResponse.json({ ok: false, ...receipt }, { status: 422 });
  // Attribution comes from the accepted records, never from the first raw row.
  const installs = new Set(upload.records.map((r) => r.installId));
  if (installs.size !== 1) {
    return NextResponse.json(
      { ok: false, error: "every record in one upload must come from the same install", ...receipt },
      { status: 422 },
    );
  }
  const installId = upload.records[0].installId;
  const installDenied = await admission(() => intakeQuota.install(installId));
  if (installDenied) return installDenied;
  const uploadId = randomUUID();
  // The market and the completion lists count installs behind one address once; only a keyed hash of the
  // address is kept, in the private upload object, and it is never published.
  if (upload.records.some((r) => r.kind === "auction_snapshot" || COMPLETION_CATALOG_KINDS.includes(r.kind))) {
    const reporter = intakeQuota.reporter(req);
    if (reporter) upload.reporter = reporter;
  }
  let persisted = false;
  try {
    persisted = await uploadStore.putUpload(uploadId, installId, upload, [...grantHashes].sort());
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
        error: "storage could not be confirmed — keep the file and retry in a moment",
        ...receipt,
      },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, uploadId, persisted: true, ...receipt });
}
