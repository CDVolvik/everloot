import { NextResponse } from "next/server";
import { recordSchemas } from "@everloot/protocol";
import { censusAgrees, LINK_ROWS_PER_REQUEST, LINKS_PER_ACCOUNT, type LinkRow } from "@/lib/character-links";
import { fail, linkAccount, NO_STORE, redeemLink, unavailable, type LinkRefusal } from "@/lib/character-links-store";
import { characterSecret } from "@/lib/census-intake";
import { uploadStore } from "@/lib/upload-store";

/**
 * POST /api/me/characters/links: `{ records: [character_link rows] }`, from the signed-in upload page (session
 * cookie, this site's Origin) or the Desktop App (`Authorization: Bearer evl_...` with link:own). Each row's code
 * must be live and this account's. The GUID becomes a keyed hash here and goes no further; the census, when it
 * knows the character, must agree on race, class and faction. A new link is private. A character another account
 * has linked too is frozen on both. 404 until EVERLOOT_CHARACTER_LINKS=1.
 */
export const dynamic = "force-dynamic";

type Result =
  | { index: number; status: "linked" | "frozen"; name: string; realm: string; message: string }
  | { index: number; status: "refused"; message: string };

const REFUSED: Record<LinkRefusal | "census_mismatch", string> = {
  code_unknown: "This code is not one of yours, or it was never made.",
  code_foreign: "This code is not one of yours, or it was never made.",
  code_used: "This code was already used. Make a new one.",
  code_expired: "This code has expired. Make a new one.",
  suppressed: "This character is hidden by a hide request, so it can't be linked. Write to us to lift it.",
  name_linked: "This account already links another character with this name and realm. Unlink it first.",
  link_limit: `You have ${LINKS_PER_ACCOUNT} linked characters. Unlink one to link another.`,
  census_mismatch: "The census knows this character as another race, class or faction, so it can't be linked.",
};

export async function POST(req: Request) {
  try {
    const account = await linkAccount(req, true);
    if (account instanceof Response) return account;
    let body: unknown = null;
    try { body = await req.json(); } catch {}
    const records = (body as { records?: unknown } | null)?.records;
    if (!Array.isArray(records) || records.length === 0 || records.length > LINK_ROWS_PER_REQUEST) {
      return fail(400, `Send { records: [...] } with 1 to ${LINK_ROWS_PER_REQUEST} character_link rows.`);
    }
    const secret = characterSecret();
    if (!secret) return unavailable();
    const rows = records.map((r) => {
      const parsed = recordSchemas.character_link.safeParse(r);
      return parsed.success ? parsed.data : null;
    });
    // The census is read once, and only when there is a row to check. If it cannot be read nothing is linked:
    // a link must not skip the check because storage was slow.
    let census = null;
    if (rows.some((r) => r !== null)) {
      census = await uploadStore.loadCensus();
      if (census.unreachable) return unavailable();
    }
    const results: Result[] = [];
    for (let index = 0; index < rows.length; index++) {
      const row: LinkRow | null = rows[index];
      if (!row) { results.push({ index, status: "refused", message: "Not a character_link row." }); continue; }
      if (!censusAgrees(row, secret, census?.rows ?? [])) { results.push({ index, status: "refused", message: REFUSED.census_mismatch }); continue; }
      const linked = await redeemLink(account, row, secret);
      if ("refused" in linked) { results.push({ index, status: "refused", message: REFUSED[linked.refused] }); continue; }
      results.push({
        index, status: linked.status, name: row.name, realm: row.realm.trim(),
        message: linked.status === "linked"
          ? "Linked. It stays private until you choose what to show."
          : "Another account has linked this character too, so it is frozen on both accounts until we look at it.",
      });
    }
    return NextResponse.json({ results }, { headers: NO_STORE });
  } catch {
    return unavailable();
  }
}
