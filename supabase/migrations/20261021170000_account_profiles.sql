-- Account profiles: a handle, a display name, a status, a main and an active character, and an opt-in public
-- profile at /u/<handle>. Additive: one new table and seven functions. Needs 20261021150000_saved_builds.sql first
-- (the characters are its build_characters). Apply before setting EVERLOOT_PROFILES=1; until then the site never
-- calls anything here (docs/design/specs/2026-10-20-account-shell-design.md). Safe to apply twice.
--
-- Only what the player typed or picked is stored. The server reads with the service role and writes only through
-- the functions below, which check the owner and the shapes again: a handle is 3-24 lower-case letters, numbers
-- and hyphens (not at either end), not reserved, unique, and changes at most 5 times a day; a status is one emoji
-- of up to 16 bytes and up to 80 characters of text; a profile is public only with a handle.

do $$
begin
  if to_regclass('public.build_characters') is null then
    raise exception 'Apply 20261021150000_saved_builds.sql first';
  end if;
end $$;

create table if not exists public.user_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  handle text unique check (handle is null or (handle = lower(handle) and handle ~ '^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$')),
  display_name text check (display_name is null or char_length(display_name) between 1 and 40),
  status_emoji text check (status_emoji is null or (octet_length(status_emoji) between 1 and 16 and status_emoji !~ '[\x01-\x20\x7f]')),
  status_text text check (status_text is null or char_length(status_text) between 1 and 80),
  status_clears_at timestamptz,
  public_profile boolean not null default false,
  show_characters boolean not null default true,
  show_builds boolean not null default true,
  show_status boolean not null default true,
  main_character_id uuid references public.build_characters(id) on delete set null,
  active_character_id uuid references public.build_characters(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_public_needs_handle check (not public_profile or handle is not null)
);
alter table public.user_profiles enable row level security;
revoke all on public.user_profiles from public, anon, authenticated, service_role;
grant select on public.user_profiles to service_role;

-- One handle change, counted against the account's 5 a day. Called only by save_profile; nobody else may execute it.
create or replace function public.take_handle_change(p_user_id uuid)
returns boolean
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
declare
  bucket_name text := 'handle:' || p_user_id::text;
  current_bucket public.intake_quota_buckets%rowtype;
  time_now timestamptz := clock_timestamp();
begin
  insert into public.intake_quota_buckets values (bucket_name, 0, time_now + interval '1 day')
    on conflict (bucket) do update set bucket = excluded.bucket
    returning * into current_bucket;
  if current_bucket.reset_at <= time_now then
    update public.intake_quota_buckets set count = 0, reset_at = time_now + interval '1 day' where bucket = bucket_name;
    current_bucket.count := 0;
  end if;
  if current_bucket.count >= 5 then return false; end if;
  update public.intake_quota_buckets set count = count + 1 where bucket = bucket_name;
  return true;
end;
$$;
revoke all on function public.take_handle_change(uuid) from public, anon, authenticated, service_role;

-- 1. Save the profile: handle (null: none), display name (null: the account name), public on or off and what a
-- public profile shows. Refusals (nothing written): needs_handle (public without a handle), handle_reserved,
-- handle_taken, handle_limit (5 changes a day). Malformed input raises: the server validates first.
create or replace function public.save_profile(
  p_user_id uuid, p_handle text, p_display_name text, p_public boolean,
  p_show_characters boolean, p_show_builds boolean, p_show_status boolean)
returns table (refusal text)
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
declare
  v_handle text := nullif(lower(btrim(p_handle)), '');
  v_display text := nullif(btrim(p_display_name), '');
  v_current public.user_profiles%rowtype;
begin
  if p_user_id is null or p_public is null or p_show_characters is null or p_show_builds is null or p_show_status is null
    or (v_handle is not null and v_handle !~ '^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$')
    or (v_display is not null and (char_length(v_display) > 40 or v_display ~ '[\x01-\x1f\x7f]')) then
    raise exception 'Invalid profile';
  end if;
  -- The user row is locked so two saves cannot both pass the handle count.
  perform 1 from public.users where id = p_user_id for update;
  if not found then raise exception 'Unknown user'; end if;
  if p_public and v_handle is null then refusal := 'needs_handle'; return next; return; end if;
  select * into v_current from public.user_profiles p where p.user_id = p_user_id;
  if v_handle is distinct from v_current.handle then
    if v_handle in ('about', 'account', 'admin', 'administrator', 'api', 'auth', 'b', 'blizzard', 'chat', 'docs',
      'everloot', 'help', 'home', 'me', 'mod', 'moderator', 'null', 'official', 'privacy', 'root', 'security',
      'settings', 'sign-in', 'sign-up', 'staff', 'support', 'system', 'terms', 'u', 'undefined', 'www') then
      refusal := 'handle_reserved'; return next; return;
    end if;
    if v_handle is not null and exists (select 1 from public.user_profiles p where p.handle = v_handle and p.user_id <> p_user_id) then
      refusal := 'handle_taken'; return next; return;
    end if;
  end if;
  begin
    if v_handle is distinct from v_current.handle and not public.take_handle_change(p_user_id) then
      refusal := 'handle_limit'; return next; return;
    end if;
    insert into public.user_profiles as p (user_id, handle, display_name, public_profile, show_characters, show_builds, show_status)
      values (p_user_id, v_handle, v_display, p_public, p_show_characters, p_show_builds, p_show_status)
      on conflict (user_id) do update set handle = excluded.handle, display_name = excluded.display_name,
        public_profile = excluded.public_profile, show_characters = excluded.show_characters,
        show_builds = excluded.show_builds, show_status = excluded.show_status, updated_at = now();
  exception when unique_violation then
    -- Another account took the handle between the check and the write; its change is not counted.
    refusal := 'handle_taken'; return next; return;
  end;
  refusal := null;
  return next;
end;
$$;
revoke all on function public.save_profile(uuid, text, text, boolean, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.save_profile(uuid, text, text, boolean, boolean, boolean, boolean) to service_role;

-- 2. Set or clear the status. No emoji and no text clears it. p_clears_at, when given, is in the next 8 days;
-- after it the status reads as unset. Malformed input raises.
create or replace function public.set_status(p_user_id uuid, p_emoji text, p_text text, p_clears_at timestamptz)
returns boolean
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
declare
  v_emoji text := nullif(btrim(p_emoji), '');
  v_text text := nullif(btrim(p_text), '');
  v_clears timestamptz := p_clears_at;
begin
  if p_user_id is null
    or (v_emoji is not null and (octet_length(v_emoji) > 16 or v_emoji ~ '[\x01-\x20\x7f]'))
    or (v_text is not null and (char_length(v_text) > 80 or v_text ~ '[\x01-\x1f\x7f]'))
    or (v_clears is not null and (v_clears <= now() or v_clears > now() + interval '8 days')) then
    raise exception 'Invalid status';
  end if;
  if v_emoji is null and v_text is null then v_clears := null; end if;
  perform 1 from public.users where id = p_user_id;
  if not found then raise exception 'Unknown user'; end if;
  insert into public.user_profiles as p (user_id, status_emoji, status_text, status_clears_at)
    values (p_user_id, v_emoji, v_text, v_clears)
    on conflict (user_id) do update set status_emoji = excluded.status_emoji, status_text = excluded.status_text,
      status_clears_at = excluded.status_clears_at, updated_at = now();
  return true;
end;
$$;
revoke all on function public.set_status(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.set_status(uuid, text, text, timestamptz) to service_role;

-- 3. The main character: one of the owner's characters, or null for none. False when the character is not theirs.
create or replace function public.set_main_character(p_user_id uuid, p_id uuid)
returns boolean
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
begin
  if p_id is not null and not exists (select 1 from public.build_characters c where c.id = p_id and c.user_id = p_user_id) then
    return false;
  end if;
  perform 1 from public.users where id = p_user_id;
  if not found then return false; end if;
  insert into public.user_profiles as p (user_id, main_character_id) values (p_user_id, p_id)
    on conflict (user_id) do update set main_character_id = excluded.main_character_id, updated_at = now();
  return true;
end;
$$;
revoke all on function public.set_main_character(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_main_character(uuid, uuid) to service_role;

-- 4. The character the player is on now: one of the owner's, or null to follow the main character.
create or replace function public.set_active_character(p_user_id uuid, p_id uuid)
returns boolean
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
begin
  if p_id is not null and not exists (select 1 from public.build_characters c where c.id = p_id and c.user_id = p_user_id) then
    return false;
  end if;
  perform 1 from public.users where id = p_user_id;
  if not found then return false; end if;
  insert into public.user_profiles as p (user_id, active_character_id) values (p_user_id, p_id)
    on conflict (user_id) do update set active_character_id = excluded.active_character_id, updated_at = now();
  return true;
end;
$$;
revoke all on function public.set_active_character(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_active_character(uuid, uuid) to service_role;

-- 5. The public read behind /u/<handle>: a public profile, or no row. Only what the owner ticked: characters
-- (name, class, realm, main), shared builds (short link, name, class) and a live status. Never the account name,
-- the BattleTag, the email, a character's note or a build that is not shared.
create or replace function public.public_profile(p_handle text)
returns table (handle text, display_name text, status_emoji text, status_text text, characters jsonb, builds jsonb)
language sql stable security definer set search_path = '' set lock_timeout = '3s'
as $$
  select p.handle, p.display_name,
    case when p.show_status and (p.status_clears_at is null or p.status_clears_at > now()) then p.status_emoji end,
    case when p.show_status and (p.status_clears_at is null or p.status_clears_at > now()) then p.status_text end,
    case when p.show_characters then (
      select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'class_slug', c.class_slug, 'realm', c.realm,
        'main', c.id = p.main_character_id) order by lower(c.name), c.id), '[]'::jsonb)
      from public.build_characters c where c.user_id = p.user_id) end,
    case when p.show_builds then (
      select coalesce(jsonb_agg(jsonb_build_object('slug', b.slug, 'name', b.name, 'class_slug', b.class_slug,
        'updated_at', b.updated_at) order by b.updated_at desc, b.id), '[]'::jsonb)
      from (select * from public.saved_builds s where s.user_id = p.user_id and s.shared order by s.updated_at desc, s.id limit 50) b) end
  from public.user_profiles p
  where p_handle ~ '^[A-Za-z0-9-]{3,24}$' and p.handle = lower(p_handle) and p.public_profile
  limit 1;
$$;
revoke all on function public.public_profile(text) from public, anon, authenticated;
grant execute on function public.public_profile(text) to service_role;
notify pgrst, 'reload schema';

-- One account's profile: select * from public.user_profiles where user_id = '<id>';
-- Take a public profile down by hand (the owner's tool for abuse): update public.user_profiles set public_profile = false where handle = '<handle>';
-- Free a handle by hand: update public.user_profiles set handle = null, public_profile = false where handle = '<handle>';
-- Rollback (run by hand; this deletes every handle, status and profile setting):
--   drop function if exists public.public_profile(text);
--   drop function if exists public.set_active_character(uuid, uuid);
--   drop function if exists public.set_main_character(uuid, uuid);
--   drop function if exists public.set_status(uuid, text, text, timestamptz);
--   drop function if exists public.save_profile(uuid, text, text, boolean, boolean, boolean, boolean);
--   drop function if exists public.take_handle_change(uuid);
--   drop table if exists public.user_profiles;
--   delete from public.intake_quota_buckets where bucket like 'handle:%';
--   notify pgrst, 'reload schema';
