# Saved talent builds across Everloot

Date: 2026-10-20. Owner decisions: Carlos, in the session of 2026-10-20 (characters are typed labels;
sharing uses a short saved link; Save asks a signed-out visitor to sign in; build all three steps).

## Goal

A signed-in player saves the builds they make in the talent calculator to their account, files each
one under a character, finds them again from one place, and shares any of them with a friend. The
same saved builds reach the game through the Desktop App and the addon, and Chat and MCP clients
through the player's own key.

Success:

- Save is one click from the calculator; editing a saved build and saving again updates it in place.
- `/me` lists the player's characters and builds; each character has a page with its builds.
- Every shared build has a short link (`/b/<slug>`) that opens for anyone, with name, notes and the
  Discord preview card, and stops working when the owner turns sharing off or deletes the build.
- In game, `/everloot plan` lists the saved builds for the character you are on, after a Desktop App
  sync and a `/reload`.
- With a key that has the "your saved builds" permission, Chat and MCP clients can list and read them.

## What a saved build is

The calculator's share code stays the single source of truth: `EL1-<class>-<spec|0>-<gameBuild>-<payload>`
(`web/src/lib/talents/share.ts`), one or two of them (the second talent set). A saved build wraps
those codes with a name, notes, an optional character label and a sharing switch. Everything that
already works on a code keeps working unchanged: `resolveBuild` replays the points, flags points
from an older game build (`buildDiffers`), and the addon's `plan.lua` decodes the same format.

No game data, names from the game files or player observations are stored. Only what the player typed
and the codes they built.

## Characters are typed labels

A character is a label the player creates: name (1-24 characters), class (one of the calculator's
classes), optional realm (up to 32 characters) and optional note (up to 140). It is not checked
against Blizzard or the census, never shown publicly, and not linked to player pages. The unused
`characters` table from the auth schema is left alone (it was meant for Battle.net imports); the
labels get their own table so the two can never be confused.

## Data (Supabase, approach A)

One migration, `supabase/migrations/20261021150000_saved_builds.sql`, applied by hand in the dashboard
before the switch goes on (like every Everloot migration).

`build_characters`

| column | type | notes |
|---|---|---|
| id | uuid pk default gen_random_uuid() | |
| user_id | uuid not null references users(id) on delete cascade | |
| name | text not null | 1-24 characters after trim |
| class_slug | text not null | one of the calculator's class slugs |
| realm | text null | up to 32 |
| note | text null | up to 140 |
| created_at, updated_at | timestamptz not null default now() | |

`saved_builds`

| column | type | notes |
|---|---|---|
| id | uuid pk default gen_random_uuid() | |
| user_id | uuid not null references users(id) on delete cascade | |
| character_id | uuid null references build_characters(id) on delete set null | |
| slug | text not null unique | 8 characters, base62, random; the short link |
| name | text not null | 1-60 characters |
| notes | text null | up to 1,000 characters, plain text |
| class_slug | text not null | must match the codes' class |
| code | text not null | first talent set, `EL1-...`, up to 400 characters |
| code2 | text null | second talent set, same rules |
| game_build | text not null | from the code, for "made on an older build" lists |
| shared | boolean not null default true | the short link works only while true |
| active | boolean not null default false | "the one I'm running" mark, at most one per character |
| created_at, updated_at | timestamptz not null default now() | |

Rules, as in `api_keys`: RLS on with no client policies; `revoke all ... from public, anon, authenticated`;
the website's server reads and writes with the service role. Writes go through `security definer`
functions that enforce the limits, so a bug in the server cannot exceed them:

- `save_build(...)` creates or updates (by id, owner checked), validates lengths, class and code shape
  (`^EL1-[a-z]+-\d+-[0-9.]+-[A-Za-z0-9_-]+$`), keeps one `active` per character, and refuses a 201st
  build per account, a 31st character, or more than 300 saves a day per account (the counter lives in
  `intake_quota_buckets` under `builds:<user>`).
- `delete_build`, `save_build_character`, `delete_build_character` (builds fall back to no character).
- `shared_build(slug)`: the public read for `/b/<slug>`; returns name, notes, class, codes, game
  build, the character label's name and class, and the owner's display name only if the owner chose
  to show it (`show_name`, default false: a shared link is anonymous by default).
- `own_builds_for_key(token_hash)`: for steps 2 and 3. Returns the key owner's builds and characters
  when the key is live and has `read:own`; nothing otherwise. Counts against the key's hourly
  allowance like `consume_api_key`.

`show_name boolean not null default false` sits on `saved_builds` with the others.

## Website (step 1)

Switch: `EVERLOOT_SAVED_BUILDS=1` (strict `=== "1"`, like the other switches). Off: no Save button,
`/me` and `/b/<slug>` return 404, the API answers 404. Accounts need `EVERLOOT_AUTH_V2` or the legacy
session; `getUser()` already covers both.

API (same-origin, session cookie; origin check on writes, as `/api/keys`):

- `GET /api/me/builds` lists the player's builds and characters.
- `POST /api/me/builds` saves (create or update), `DELETE /api/me/builds/<id>`.
- `POST /api/me/characters`, `DELETE /api/me/characters/<id>`.
- Signed out: 401 with `signIn` pointing at the sign-in page and a `returnTo`.

Pages:

- **Calculator** (`TalentCalculator.tsx`): a **Save** button beside Copy link. Signed out, it opens a
  small "Sign in to save builds" panel; after sign-in the visitor returns to the same build (the
  `#plan=` hash survives the round trip) and the save dialog opens. The dialog: name, character
  (pick or "New character…"), notes, "Share link on" (default on). When the page was opened from a
  saved build (`?saved=<id>`), it shows "Editing: <name>" and Save updates in place; **Save as new**
  makes a copy. A **My builds** menu lists the player's builds for this class and opens one.
- **`/me`**: "My builds". Character cards (name, class colour, realm, number of builds, the active
  build), then builds without a character. Each build row: name, class and spec, game build (with the
  quiet "older build" marker when it differs from the current one), share link, Open, Duplicate,
  Delete. A compact table on wide screens, cards on phones, the site's dense table style. The header's
  account menu and `/account` link to it.
- **`/me/characters/<id>`**: one character: its builds, the active mark, edit the label.
- **`/b/<slug>`**: the public saved link. Renders the calculator read-only with the build's name and
  notes on top, "Open in the calculator" and, for a signed-in visitor, "Save a copy". Not indexed
  (`noindex`), canonical to the class page, like `/b/` code links today. The Discord card reuses
  `/tools/talents/<class>/card` with the build's codes plus the name as the title. Unknown, unshared or
  deleted: 404.

Policy and privacy, in the same change:

- `docs/DATA_PLACEMENT.md`: the "Talent loadouts shared by players: nothing stored" row becomes
  "Saved builds: Supabase, per account, private unless the link is shared; deleted with the account".
- `docs/DATA_POLICY.md`: what a saved build holds, that labels are not checked against the game, that
  a shared link is public to anyone who has it, and deletion.
- `/privacy`: the same in plain words.

## Desktop App and addon (step 2)

- Keys: the key page offers a second permission, "Read my saved builds" (`read:own`). `create_api_key`
  gets an optional scopes argument (default `read:public` as today); the scope list does not change
  (it already allows `read:own`).
- `GET /api/me/builds` also accepts `Authorization: Bearer evl_...` with `read:own` (through
  `own_builds_for_key`), so the Desktop App, MCP and scripts read the same list.
- Desktop App: when signed in with such a key, **Sync builds** (and a sync every 15 minutes while the
  app runs) writes a third slot addon, `Interface/AddOns/EverlootBuilds/` (`EverlootBuilds.toc` plus a
  generated `data.lua`), next to `EverlootPrices` and `EverlootAnswers`. The file holds, per build:
  name, character label name and class, codes, active mark, game build. It is written atomically
  (temp file then rename) and only when the content changed. The app shows when it last synced and a
  "/reload in game to see them" hint. A key without `read:own` shows "This key can't read your builds"
  with a link to make one.
- Addon: if `EverlootBuilds` is loaded, `/everloot plan` with no code lists the saved builds whose
  label name matches the logged-in character's name (case-insensitive) and class, then other builds of
  the same class; picking one loads it exactly like a pasted code. No new SavedVariables, nothing
  uploaded: the data flows from the website to the player's own computer only.

## Chat and MCP (step 3)

- MCP: a `my_builds` tool (list, or one build by slug with its resolved talents) available only on a
  connection that presents a key with `read:own`. The public, keyless tool list does not change, so
  directory listings under review keep their reviewed tool set. The tool's definition lives in the
  website (`web/src/lib/my-builds-tool.ts`), not in `packages/protocol`, and the MCP server adds it per
  request. With `EVERLOOT_SAVED_BUILDS` off it is simply an unknown tool. With the data guard on, the
  mount has already counted the request against the key's allowance, so reading the builds does not
  count it again.
- Website Chat: the same tool through `/api/tools/my_builds`, using the visitor's session; offered only
  when signed in and the switch is on.
- Answers carry the build's `/b/<slug>` link when shared, otherwise the code link.

## Out of scope (later)

- "Save my current talents" from the game (needs a write permission and a policy change).
- Raid builds (same shape; `kind` column later).
- Battle.net character import; public profile pages; likes or comments.

## Testing

- SQL: limits, ownership (another user's id is refused), one active per character, `shared_build`
  hides unshared and deleted, `own_builds_for_key` refuses keys without `read:own`.
- Web: unit tests for validation and the API routes (signed out, wrong origin, other owner, limits,
  switch off returns 404), page tests for `/me`, the character page, `/b/<slug>` and the calculator's
  Save flow (signed out prompt, editing, save as new).
- Desktop: the slot addon writer (content, atomic write, no write when unchanged), key without scope.
- Addon: plan list selection by name and class (busted spec beside the existing plan tests).
- MCP: tool hidden without a key, listed and working with a `read:own` key, refused without it.

## Rollout

1. Merge with the switch off. 2. Apply the migration in the Supabase dashboard; check the objects
exist. 3. Set `EVERLOOT_SAVED_BUILDS=1` in Production and redeploy; save, share and delete a build
end to end. 4. Release the Desktop App with the sync and the addon with the plan list.
