# Everloot 0.2.6 — beta collection check

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
   remain uncaptured.
   For auctions, run `/everloot auctions on`, `/reload`, and browse a search at the
   auction house. Each row should hold the stack size and a per-unit copper price;
   bid-only listings (no buyout) produce no row. Compare two listings by hand.
   For gold, sell an item to a vendor, buy one back, take a paid flight and turn in a
   quest with a money reward. Expect one `vendor`, one `flight` and one `quest`
   money_event with the copper the client showed; the purchase produces none.
   After one of your auctions sells, take the money from the "Auction successful" letter,
   once by clicking the coins in the open letter and once by shift-clicking a letter in the
   inbox list (auto loot, if Forever has it). Expect one `auction`
   money_event per letter holding the sale price minus the house cut (write down the
   letter's sale, deposit and cut lines), and no buyer name; a letter from a player
   produces none. Send one letter to an alt: expect one `postage` money_event with the
   price the send window showed and no recipient name. Buy one listing at its buyout and
   place one plain bid: expect one `auction_spend` with the buyout and nothing for the bid.
   This checks `GetInboxInvoiceInfo` (field order), `GetSendMailPrice`,
   `GetAuctionItemInfo` (buyout is the 10th value) and the hooks exist in Forever.
   For `/ask`, type `/ask Who is Thrall?`, then `/reload` with the companion's `bridge`
   running (companion/README.md). Expect the answer and its source in chat once, and an
   `EverlootAnswers` entry in the AddOns list. Check that `/everloot ask …` keeps capitals.
   For recipes, open a profession window (and Enchanting's craft window), then log out. Expect
   one `recipe_observed` row per recipe with the colour the window showed at your rank and its
   reagents; headers produce none. Reopening at the same rank adds nothing; skill up once and
   reopen to see new rows. Write down two colours by hand to compare.
   For trainers, open your profession trainer. Expect one `trainer_seen` row per recipe it
   lists, with the required rank and the training cost the window showed; class spells and
   headers produce none, and reopening adds nothing. Write down two required ranks by hand.
   Then open the profession window at a rank inside a route step `/tools/professions` shows
   and confirm that recipe is orange. This checks `GetTrainerServiceSkillReq` and
   `GetTrainerServiceCost` exist in Forever and that orange-only steps match the client.
   For the addon list, `/everloot status` should say it is off. Run `/everloot addons on` and
   `/reload`. Expect one `addon_seen` row per addon in the AddOns list, with its folder name, a
   title without colour codes, the `.toc` version, and `loaded = false` for a disabled addon.
   Another `/reload` the same day adds nothing. `/everloot addons off` deletes those rows. Note
   whether Forever has `C_AddOns` or only the older `GetAddOnInfo` globals.
   For zone bounds, enter two zones. Expect one `map_bounds` row per zone and nothing more when
   you come back. Check that `top` is greater than `bottom` and `left` greater than `right`
   (world x runs north, y runs west). If no row appears, note what
   `C_Map.GetWorldPosFromMapPos` returns for (0,0) and (1,1) in that zone. Check that
   `clientBuild` in the saved file matches the build on the login screen.
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
