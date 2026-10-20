import { NextResponse } from "next/server";
import { fail, jsonBody, NO_STORE, profileAccount, setMainCharacter, unavailable } from "@/lib/account-shell";
import { characterChoice } from "@/lib/profiles";

/** POST /api/me/main-character {characterId}: one of the player's characters, or null for none. Answers {mainCharacterId}. */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await profileAccount(req, true);
    if (user instanceof Response) return user;
    const characterId = characterChoice(await jsonBody(req));
    if (characterId === undefined) return fail(400, "That character id is not valid.");
    if (!await setMainCharacter(user.id, characterId)) return fail(404, "No character with that id on this account.");
    return NextResponse.json({ mainCharacterId: characterId }, { headers: NO_STORE });
  } catch {
    return unavailable();
  }
}
