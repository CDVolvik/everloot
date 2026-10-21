import { NextResponse } from "next/server";
import { CODES_PER_DAY } from "@/lib/character-links";
import { createLinkCode, fail, linkAccount, NO_STORE, unavailable } from "@/lib/character-links-store";

/**
 * POST /api/me/characters/link-codes: a new link code for the signed-in player, shown once. It is live for
 * 15 minutes, works once, and only for this account. Only its hash is stored. Session only: an API key cannot
 * make codes. 404 until EVERLOOT_CHARACTER_LINKS=1.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const account = await linkAccount(req, false);
    if (account instanceof Response) return account;
    const made = await createLinkCode(account);
    if ("refused" in made) return fail(429, `You made ${CODES_PER_DAY} codes in the last day. Try again tomorrow.`);
    return NextResponse.json(made, { status: 201, headers: NO_STORE });
  } catch {
    return unavailable();
  }
}
