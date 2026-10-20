import { NextResponse } from "next/server";
import { fail, jsonBody, NO_STORE, profileAccount, saveProfile, unavailable } from "@/lib/account-shell";
import { HANDLE_CHANGES_PER_DAY, parseProfileInput } from "@/lib/profiles";

/**
 * POST /api/me/profile {handle, displayName, publicProfile, showCharacters, showBuilds, showStatus}: the player's
 * handle, display name, and whether /u/<handle> is public and what it shows. Answers {profile} with what was saved.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await profileAccount(req, true);
    if (user instanceof Response) return user;
    const input = parseProfileInput(await jsonBody(req));
    if (!input.ok) return fail(400, input.error);
    const saved = await saveProfile(user.id, input.value);
    if ("refused" in saved) {
      switch (saved.refused) {
        case "needs_handle": return fail(400, "Choose a handle before you make your profile public.");
        case "handle_reserved": return fail(409, "That handle is reserved. Pick another.");
        case "handle_taken": return fail(409, "That handle is taken. Pick another.");
        case "handle_limit": return fail(429, `You changed your handle ${HANDLE_CHANGES_PER_DAY} times today. Try again tomorrow.`);
      }
    }
    return NextResponse.json({ profile: input.value }, { headers: NO_STORE });
  } catch {
    return unavailable();
  }
}
