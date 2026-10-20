import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { COMPLETION_CATALOG_KINDS, parseUpload, UPLOAD_LIMITS, type CanonicalUpload, type StoredRecord, type StoredUpload } from "@everloot/protocol";
import { uploadStore, sharingStore } from "@/lib/upload-store";
import { intakeQuota, type QuotaResult } from "@/lib/intake-quota";
import { recordUsage } from "@/lib/usage-metrics";
import { censusDateProblem, characterSecret, isCensusRow, storedCensusRow } from "@/lib/census-intake";
import { MARKET_LIMITS, realmKey } from "../../../../../kb/src/market";
import { authorizeRecord, sharingCategory, type PublicationGrant } from "../../../../../kb/src/publication";
import { isPlayerRow, playerDateProblem, playerPagesOn, playerUpsert, PLAYERS_PER_UPLOAD, type PlayerUpsert } from "@/lib/player-pages";
import { playerStore } from "@/lib/player-store";
import { censusDailyCap } from "../../../../../kb/src/census-rows";

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
      if (size > UPLOAD_LIMITS.maxBodyBytes) {
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
  if (!Array.isArray(tokens) || tokens.length > UPLOAD_LIMITS.grantTokensMax || tokens.some((t) => typeof t !== "string" || !/^[a-f0-9]{64}$/.test(t))) {
    return NextResponse.json({ ok: false, error: "Invalid verification grants" }, { status: 400 });
  }
  const needsAuthority = upload.records.some((row) => sharingCategory(row) !== null);
  let grants: PublicationGrant[] = [];
  try {
    if (needsAuthority) grants = (await Promise.all(tokens.map((token) => sharingStore.lookup(token)))).filter((g): g is PublicationGrant => g !== null);
  } catch {
    return NextResponse.json({ ok: false, error: "Verification storage unavailable. Keep your file and retry." }, { status: 503 });
  }
  const authorized: StoredRecord[] = [];
  const accepted = [];
  // Census rows are stored only under the server's character key; without it they are dropped, GUID and all.
  const censusSecret = characterSecret();
  // Event ids kept per install, kind and UTC day, seeded from what the install already stored in earlier uploads:
  // past the daily cap a new character is refused, a repeat is not.
  const censusDays = new Map<string, Set<string>>();
  const censusSeeded = new Set<string>();
  const censusReporter = upload.records.some(isCensusRow) ? intakeQuota.reporter(req) : undefined;
  // Player rows never go into the upload: with the switch on they are written to the players table, one row per
  // character, in one batch below. With it off they are dropped here.
  const playersOn = playerPagesOn();
  const players: PlayerUpsert[] = [];
  const playerInstalls = new Set<string>();
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
    if (isPlayerRow(row)) {
      const now = new Date();
      const problem = !playersOn ? "Player pages are not collected yet." : players.length >= PLAYERS_PER_UPLOAD
        ? `An upload may carry at most ${PLAYERS_PER_UPLOAD} player rows.` : playerDateProblem(row.capturedAt, now);
      if (problem) {
        receipt.rejected.push({ index: receipt.accepted[i].index, reason: problem });
        continue;
      }
      players.push(playerUpsert(row, now)); playerInstalls.add(row.installId); accepted.push(receipt.accepted[i]);
      continue;
    }
    if (isCensusRow(row)) {
      // The GUID never reaches storage: it becomes a keyed hash and the server's own event id here.
      const dateProblem = censusDateProblem(row.capturedAt, new Date());
      if (dateProblem) {
        receipt.rejected.push({ index: receipt.accepted[i].index, reason: dateProblem });
        continue;
      }
      const kept = censusSecret ? storedCensusRow(row, censusSecret, censusReporter) : null;
      if (!kept) {
        receipt.rejected.push({ index: receipt.accepted[i].index, reason: censusSecret ? "This census row could not be read." : "Census rows are not collected yet." });
        continue;
      }
      if (!censusSeeded.has(kept.installId)) {
        const before = await uploadStore.installCensus(kept.installId);
        if (!before) {
          receipt.rejected.push({ index: receipt.accepted[i].index, reason: "Census rows could not be checked against this install's earlier uploads. Send them again later." });
          continue;
        }
        censusSeeded.add(kept.installId);
        for (const old of before) {
          const oldDay = JSON.stringify([old.installId, old.kind, old.eventId.split(":")[1]]);
          censusDays.set(oldDay, (censusDays.get(oldDay) ?? new Set<string>()).add(old.eventId));
        }
      }
      const day = JSON.stringify([kept.installId, kept.kind, kept.eventId.split(":")[1]]);
      const ids = censusDays.get(day) ?? new Set<string>();
      censusDays.set(day, ids);
      const cap = censusDailyCap(kept.kind);
      if (!ids.has(kept.eventId) && ids.size >= cap) {
        const what = kept.kind === "census_self" ? "own characters" : "players seen";
        receipt.rejected.push({ index: receipt.accepted[i].index, reason: `An install may report at most ${cap} ${what} a day; the rest are not counted.` });
        continue;
      }
      ids.add(kept.eventId);
      authorized.push(kept); accepted.push(receipt.accepted[i]);
      continue;
    }
    matching.forEach((g) => grantHashes.add(g.tokenHash));
    authorized.push(row); accepted.push(receipt.accepted[i]);
  }
  const stored: StoredUpload = { ...upload, records: authorized }; receipt.accepted = accepted;
  if (!authorized.length && !players.length) return NextResponse.json({ ok: false, ...receipt }, { status: 422 });
  // Attribution comes from the accepted records, never from the first raw row.
  const installs = new Set([...stored.records.map((r) => r.installId), ...playerInstalls]);
  if (installs.size !== 1) {
    return NextResponse.json(
      { ok: false, error: "every record in one upload must come from the same install", ...receipt },
      { status: 422 },
    );
  }
  const installId = [...installs][0];
  const installDenied = await admission(() => intakeQuota.install(installId));
  if (installDenied) return installDenied;
  const uploadId = randomUUID();
  if (players.length) {
    try {
      await playerStore().upsert(players);
    } catch (err) {
      console.error(`upload ${uploadId}: player write failed`, err);
      return NextResponse.json({ ok: false, persisted: false, uploadId, error: "storage could not be confirmed — keep the file and retry in a moment", ...receipt }, { status: 503 });
    }
    // Nothing else to keep: the rows were the whole upload, and the table is where they live.
    if (!authorized.length) return NextResponse.json({ ok: true, uploadId, persisted: true, ...receipt });
  }
  // The market and the completion lists count installs behind one address once; only a keyed hash of the
  // address is kept, in the private upload object, and it is never published.
  if (stored.records.some((r) => r.kind === "auction_snapshot" || COMPLETION_CATALOG_KINDS.includes(r.kind))) {
    const reporter = intakeQuota.reporter(req);
    if (reporter) stored.reporter = reporter;
  }
  let persisted = false;
  try {
    persisted = await uploadStore.putUpload(uploadId, installId, stored, [...grantHashes].sort());
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
