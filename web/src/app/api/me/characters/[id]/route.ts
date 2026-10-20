import { NextResponse } from "next/server";
import { validId } from "@/lib/saved-builds";
import { deleteCharacter, fail, meAccount, NO_STORE, unavailable } from "@/lib/saved-builds-store";

/** DELETE /api/me/characters/<id>: deletes a character label. Its builds stay, with no character. */
export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await meAccount(req, true);
    if (user instanceof Response) return user;
    const { id } = await params;
    if (!validId(id)) return fail(400, "That character id is not valid.");
    if (!(await deleteCharacter(user.id, id))) return fail(404, "No character with that id on this account.");
    return NextResponse.json({ deleted: id }, { headers: NO_STORE });
  } catch {
    return unavailable();
  }
}
