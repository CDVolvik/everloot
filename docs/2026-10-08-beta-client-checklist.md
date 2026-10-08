# Everloot 0.2.1 — beta collection check

Lua 5.1 stubs pass; the Forever beta client has not been tested. Keep the existing
SavedVariables file before installing. No script here plays the character.

1. Install `Everloot/` under the client's `Interface/AddOns/`, enable it and reload.
   Run `/everloot status`; record the client build, addon version and module notes.
2. Target an NPC and mouse over another. New sightings should name the NPC, but
   `positionKind = "player"` records the observer's position. No public spawn pin
   should appear from those coordinates. Missing map positions produce no row.
3. Loot a creature while targeting another NPC; check the loot row's source against
   the creature actually looted. Loot a stack and an area-loot window containing
   multiple corpses; each physical source gets its own item quantities.
4. Close and reopen the same corpse, reload, and reopen it again. Retained loot
   rows and event IDs should not increase. Check a game object separately.
5. Check pickpocket → corpse → skinning explicitly. The current collector retains
   only the first observed item window per GUID and cannot distinguish these
   phases. Do not call that a complete drop census. Empty/no-source windows and
   missing `GetLootSourceInfo` produce no inferred kill or zero-drop row.
6. Open a vendor; verify copper prices and limited stock. In a guild, request the
   roster and verify rank, level, class and online status locally. Test saved raid
   lockouts and attendance over two raid nights. Quest levels and raid loot awards
   remain uncaptured; auctions require the explicit toggle.
7. Log out so SavedVariables flush. Preview the file at `/upload` before sending.
   Keep named sharing off unless actual owner/officer authority is verified and
   the scoped grant has been issued. Upload, record receipts and repeat the same
   file: public source observations must not multiply. Test partial batches and
   quota failures without deleting retained local data.
8. Use three real contributors to verify corroboration. Install IDs alone do not
   prove different people. Confirm an actual agreed item/NPC name; source frequency
   is conditional on observed loot windows and is not kill-based drop probability.

Keep any named roster/character evidence private. Save the build, module results,
receipt IDs and redacted screenshots with the release verification. These checks
remain open until a person runs them in the client.
