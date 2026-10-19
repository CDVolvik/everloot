# The character view: the player's own ledger

Authorized scope: the approved character-view design (roster page plus a per-character
drawer, mixed visual direction from the 2026-10-18 design round). Build it on main.

## Decisions for this implementation

- The page is a ledger of what the save file already holds, nothing more. Gold, gear and
  money events carry the character's name; progress rows carry the addon's opaque
  per-install key (intake.ts), so they can never be joined to a name and are listed
  apart. The file holds no spec or professions per character; no column invents them.
  Talents are keyed the same way and are noted, not linked.
- Summarizer (`desktop/src/main/characters.ts`): the newest gear snapshot wins, so the
  drawer shows the latest sample, not a merge of samples. Money events become thirty
  zero-filled UTC day buckets, oldest first, which feed the river, the week card and the
  drawer's receipt count. Receipts are the newest twelve, newest first, capped
  independently of the buckets. The sixty-point gold history is unchanged.
- Page: the roster table is the spine (gold plus the kept-snapshot sparkline, seven-day
  net, item level and last snapshot age per row). The signature element is the thirty-day
  money river, a cumulative net line over its own area; the week card sits beside it,
  earned above the line and spent below, scaled to the week's own maximum. The keyed
  progress panel keeps its own anchored section, `id="keyed"`, visibly apart from the
  named rows.
- Drawer: clicking or pressing Enter on a row opens a right-hand drawer; Overview shows
  gold, peak and seven-day stats, all sixteen equipment slots in the game's order with an
  exact one-decimal average, and money by category; History shows the kept gold snapshots
  and the receipts; Sharing is described below. Accessibility is part of the decision:
  the page is `inert` while the drawer is open, Tab is trapped inside it, Escape closes
  it, focus returns to the opening row, the tabs rove with the arrow keys, and the
  Overview panel's keyed-rows button closes the drawer and focuses the keyed section.
- Money-out keeps its own copper token (`--copper`), distinct from the accent, in both
  appearances, so the accent stays reserved for positive and interactive things. Charts
  are inline SVG with non-scaling strokes; no chart library was added.
- Sharing, deliberately different from the first mock: the mock showed per-character
  toggles publishing a public page on the site. The repository's sharing model supports
  neither half of that yet. Naming character data is a website action (operator-issued,
  verified, revocable grants chosen on the upload page), the app's stated boundary is
  that named data never uploads from here, and no public character page route exists.
  The Sharing tab therefore explains where sharing happens, states the boundary, shows
  what is on the machine, and links to the upload page. It does not show toggles that
  could not honestly work. An in-app publish waits for a website public-character
  design; it is intentionally not built here.

## Verification and release boundary

Regression coverage in `desktop/test/characters.test.ts`: the newest gear snapshot wins
with the full equipped array; thirty UTC days are zero-filled at the window edges with
receipts newest-first and an event outside the window excluded; receipts cap at twelve
with the newest kept. The desktop suite, typecheck and build pass. Visual verification
ran against the bundled renderer at the app's 1040x720 window in both appearances, with
executed checks for open/close, focus return, Tab trapping, tab roving and the keyed
jump. A live run in Electron against a real save file is not covered here (no game
install in the verification environment); the summarizer behavior it depends on is
covered by the fixture tests.

## Primary implementation references

- `desktop/src/main/characters.ts` - the summarizer
- `desktop/src/renderer/app.ts` - the page, the drawer and the keyboard wiring
- `desktop/src/renderer/styles.css` - tokens, layout and reduced-motion handling
- `desktop/test/characters.test.ts` - the summarizer regressions
- `web/src/app/upload/UploadClient.tsx` - the named-sharing choice the Sharing tab points at
- `docs/design/specs/2026-10-07-replay-and-sharing.md` - the grant model behind that choice

## Execution ledger

- Summarizer and tests: implemented; newest-snapshot, day-bucket and receipt-cap
  regressions pass with the existing suite.
- Page, drawer and styles: implemented; verified visually in both appearances at the
  window size, with the focus and keyboard checks above.
- Commit: lands as one signed commit on this branch, opened as a pull request for
  review; not merged here.
