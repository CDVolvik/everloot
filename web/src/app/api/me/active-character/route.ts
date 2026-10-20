import { NextResponse } from "next/server";
import { fail, jsonBody, NO_STORE, profileAccount, setActiveCharacter, unavailable } from "@/lib/account-shell";
import { characterChoice } from "@/lib/profiles";

/**
 * POST /api/me/active-character {characterId}: the character the player is on now, one of theirs, or null to
 * follow the main character. Used by the home's left rail and the avatar menu. Answers {activeCharacterId}.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await profileAccount(req, true);
    if (user instanceof Response) return user;
    const characterId = characterChoice(await jsonBody(req));
    if (characterId === undefined) return fail(400, "That character id is not valid.");
    if (!await setActiveCharacter(user.id, characterId)) return fail(404, "No character with that id on this account.");
    return NextResponse.json({ activeCharacterId: characterId }, { headers: NO_STORE });
  } catch {
    return unavailable();
  }
}
