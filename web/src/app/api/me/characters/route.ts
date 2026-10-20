import { NextResponse } from "next/server";
import { CHARACTERS_PER_ACCOUNT, parseCharacterInput, SAVES_PER_DAY } from "@/lib/saved-builds";
import { fail, meAccount, NO_STORE, saveCharacter, unavailable } from "@/lib/saved-builds-store";

/**
 * POST /api/me/characters: makes a character label (no id) or edits one. A label is what the player types:
 * a name, a class, an optional realm and note. It is not checked against the game.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await meAccount(req, true);
    if (user instanceof Response) return user;
    let body: unknown = null;
    try { body = await req.json(); } catch {}
    const input = parseCharacterInput(body);
    if (!input.ok) return fail(400, input.error);
    const saved = await saveCharacter(user.id, input.value);
    if ("refused" in saved) {
      switch (saved.refused) {
        case "not_found": return fail(404, "No character with that id on this account.");
        case "has_builds": return fail(409, "This character has builds of its class. Move or delete them to change its class.");
        case "character_limit": return fail(409, `You have ${CHARACTERS_PER_ACCOUNT} characters. Delete one to add another.`);
        case "daily_limit": return fail(429, `You saved ${SAVES_PER_DAY} times in the last day. Try again tomorrow.`);
      }
    }
    return NextResponse.json({ character: saved.character }, { status: saved.created ? 201 : 200, headers: NO_STORE });
  } catch {
    return unavailable();
  }
}
