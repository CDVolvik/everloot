# Signed-in home, profile and account menu

Date: 2026-10-20. Owner decisions (Carlos, same day): the signed-in experience follows GitHub's logic
(compact header, avatar menu, a three-column home); the switch control does both, switching character
and switching account; a profile is public only when the player turns it on; a player picks a main
character, and the switch changes the character they are on right now.

This is project 1 of 4. Then: search everywhere, guilds and rankings (gear score and skill), streamers
and community. Each gets its own spec.

## Goal

When a player signs in, everloot.app becomes their place: their characters, builds and status one click
away, an Ask box that knows who they are playing, and the latest Forever news on the side, while the
public home stays as it is for visitors.

Success:

- The header is compact for everyone; signed in, an avatar bubble opens the account menu.
- `/` signed in shows the home; signed out it shows today's landing page, still cached.
- A player sets a handle, a status, a main character, and whether their profile is public.
- `/u/<handle>` shows a public profile only when its owner turned it on.
- A player can be signed in to up to 5 accounts in one browser and switch between them.

## Header (everyone, no switch)

- About two thirds of today's height. Logo, nav (Database, Tools, Map, Changes, Lore, Docs), search
  in the middle, the version label, then the account area.
- Signed out: "Sign in" and "Get the addon", as today.
- Signed in: a "+" menu (Plan a build, Upload addon data, New character) and the avatar bubble. The
  text links "Account" and "Sign out" move into the avatar menu. "Get the addon" moves into the menu
  as "Desktop App and addon".
- The avatar is the player's initials on their main character's class colour (no images are stored;
  Battle.net gives none). No main character: the site's accent colour.
- Phones: the existing menu button keeps working; the avatar menu opens as a sheet.

## Avatar menu (signed in)

In order, as GitHub's:

1. Name, `@handle` (or "Choose a handle"), and the ⇄ button that opens the account switcher.
2. Status line: emoji and text, or "Set status".
3. Your profile, Your characters, Your builds. (Your guild arrives with the guilds project.)
4. API keys, Desktop App and addon, Settings.
5. Add another account, Sign out (this account only).

The account switcher lists the accounts signed in on this browser (name, handle, avatar), with a check
on the current one; picking one switches; "Add another account" goes to sign-in.

## Home (signed in, `/`)

Three columns on wide screens, stacked on phones (centre first):

- **Left rail:** the player's card (avatar, name, active character) with a ⇄ that switches the active
  character; Home; Feed (`/changes`); "Your characters" (class colour, name, main marked); "Recent
  builds" (5, from saved builds).
- **Centre:** "Good morning / afternoon / evening, <name>!" (local time in the browser); an **Ask
  anything** box that opens Chat with the question and the active character and its builds as context
  (it reuses `/chat`; nothing new is sent anywhere); quick actions: Plan a build, Find an item, Auction
  House, Upload addon data; then the active character's builds.
- **Right rail:** "Latest from Forever" (the newest entries of the `/changes` feed: blue posts, builds,
  patch changes) and the launch countdown while it runs.

Visitors keep the cached landing page: the home is its own route (`/home`), and middleware rewrites
`/` to it only when a session cookie is present. A stale cookie with no session renders the landing.

## Settings and profile

- `/settings` (signed in): Profile (handle, display name, status, public on/off and what it shows),
  Characters (the labels from saved builds, main character), and links to API keys and the Desktop App.
- **Handle:** 3-24 characters, letters, numbers and hyphens, unique, case-insensitive; a short list is
  reserved (admin, everloot, support, api, me, settings, u...). Not set by default; the profile cannot
  be public without one.
- **Status:** an emoji (one) and up to 80 characters of text, optional "clear after" (30 min, 4 h,
  today, this week, never).
- **Main character:** one of the player's characters. The active character defaults to it.
- **Public profile `/u/<handle>`:** off by default. When on, it shows only what the player ticks:
  characters (name, class, realm), shared builds (their short links), status. Off, unknown or no
  handle: 404. Indexed only while public. Never shows the BattleTag, email or private builds.

## Data (one additive migration)

`supabase/migrations/20261021170000_account_profiles.sql`, applied by hand before the switch goes on.

`user_profiles` (one row per account):

| column | type | notes |
|---|---|---|
| user_id | uuid pk references users(id) on delete cascade | |
| handle | text unique null | stored lower case; check shape |
| display_name | text null | up to 40 |
| status_emoji | text null | one emoji, up to 16 bytes |
| status_text | text null | up to 80 |
| status_clears_at | timestamptz null | read as no status after it |
| public_profile | boolean not null default false | |
| show_characters, show_builds, show_status | boolean not null default true | used only while public |
| main_character_id | uuid null references build_characters(id) on delete set null | owner checked |
| active_character_id | uuid null references build_characters(id) on delete set null | owner checked |
| created_at, updated_at | timestamptz | |

Same rules as saved builds: RLS on, no client policies, service role only, writes through security
definer functions that check the owner and shapes: `save_profile(...)`, `set_status(...)`,
`set_main_character(user, id)`, `set_active_character(user, id)`, and `public_profile(handle)` for
`/u/<handle>`. A handle change is limited to 5 a day.

## Account switching

Better Auth's multi-session plugin (only with `EVERLOOT_AUTH_V2=1`; with the legacy session the
switcher shows just the current account and "Add another account" is hidden). Up to 5 sessions per
browser. Sign out ends the current session and switches to the next one if any.

## Shared contract

`web/src/lib/account-shell-types.ts` holds the `AccountShell` type the header, menu and home read. The
data side provides `loadAccountShell(): Promise<AccountShell | null>` (null when signed out or the
switch is off); the header side provides the device account list.

## Switch and rollout

`EVERLOOT_PROFILES` (strict `=== "1"`): the home, `/settings`, `/u/<handle>`, status, main and active
character, and account switching. Off: the compact header still ships (avatar menu with Your builds,
API keys, Sign out, as available today), `/` is the landing page, the new routes 404.

1. Merge with the switch off. 2. Apply the migration (needs the saved builds migration first, for
`build_characters`). 3. Set `EVERLOOT_PROFILES=1` (and `EVERLOOT_AUTH_V2=1` for account switching),
redeploy, and walk the home, settings, a public profile and an account switch end to end.

## Out of scope

Notifications, a social feed of other players, guild pages, rankings, verified characters (they come
with the guilds and rankings project, through the addon link), appearance themes (the site has one
theme today).

## Testing

Header and menu (signed out, signed in, switch off), the rewrite of `/` (cookie, no cookie, stale
cookie), settings validation (handle shape, reserved, taken, status length, clear after), the SQL
functions (owner checks, handle limit), `/u/<handle>` (off, on, what it shows, never the BattleTag),
the Ask box hand-off to Chat, the character switch, the account switcher (V2 on and off).
