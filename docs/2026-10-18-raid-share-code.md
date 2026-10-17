# Raid share code, version 1 (2026-10-18)

For the raid builder (`/tools/raid`, `web/src/lib/raid.ts`) and the addon (`addon/modules/raid.lua`).
Both write and read this format, so `/everloot raid code` gives a link the site opens, and the site's
"Load" box takes a code or a link.

    ELR1-<size>-<build>-<payload>

- `ELR1`: format version. It is separate from the talent code (`EL1-...`, see
  `2026-10-17-talent-share-code.md` on the addon-talents branch), so each reader refuses the other's
  codes. A reader refuses versions it does not know.
- `size`: `10`, `20` or `40`. Groups are five slots each.
- `build`: the game build the code was made on (`1.60.1.70450`), digits in dot-separated groups with at
  least two groups. A page with rules for another build says so and uses its own rules.
- `payload`: base64url (RFC 4648 section 5, no `=` padding) of two digits per slot, in slot order.
  The first digit is the class, 1 to 9: warrior 1, paladin 2, hunter 3, rogue 4, priest 5, shaman 6, mage 7,
  warlock 8, druid 9. The second is the tree, 0 to 3, where 0 means any tree. `00` is an empty slot.
  Trailing empty slots are left out. Padding on the end is ignored on read, never written.

The class order and the tree numbers are fixed for version 1. Tree numbers follow Classic Era's
tree order (for example mage: Arcane 1, Fire 2, Frost 3) until Forever's own order is confirmed from the
talent catalog; if it differs, that needs `ELR2`.

Example: `ELR1-10-1.60.1.70450-NzMwMDEw` is: mage tree 3 (`73`), an empty slot (`00`), a
warrior with any tree (`10`).

The addon cannot read another player's talent tree, so it writes tree 0 for everyone. It picks the
smallest size that holds the highest group in use, at five slots per group.

## In a URL

`/tools/raid#raid=ELR1-...`. A fragment never reaches the server.
