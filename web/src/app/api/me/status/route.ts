import { NextResponse } from "next/server";
import { fail, jsonBody, NO_STORE, profileAccount, setStatus, unavailable } from "@/lib/account-shell";
import { parseStatusInput } from "@/lib/profiles";

/**
 * POST /api/me/status {emoji, text, clearsAt}: sets the player's status, one emoji and up to 80 characters, until
 * `clearsAt` (an ISO time within the next week) or until changed when it is null. No emoji and no text clears it.
 * Answers {status}: the status as saved, or null.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await profileAccount(req, true);
    if (user instanceof Response) return user;
    const input = parseStatusInput(await jsonBody(req));
    if (!input.ok) return fail(400, input.error);
    await setStatus(user.id, input.value);
    const { emoji, text, clearsAt } = input.value;
    const status = emoji || text ? { emoji, text: text ?? "", clearsAt } : null;
    return NextResponse.json({ status }, { headers: NO_STORE });
  } catch {
    return unavailable();
  }
}
