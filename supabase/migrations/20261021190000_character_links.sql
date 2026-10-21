-- Character links: a signed-in player ties one of their in-game characters to their account by typing a short
-- code on it. Additive: three new tables and eight functions; api_keys may now hold a 'link:own' scope. Needs
-- 20261021150000_saved_builds.sql first (its create_api_key is replaced here). Apply before setting
-- EVERLOOT_CHARACTER_LINKS=1; until then the site never calls anything here. Safe to apply twice.
--
-- What a link proves: the holder of this account also held an addon file in which this character typed the code.
-- It is not checked with Blizzard. So the first account to link a character keeps it only until a second account
-- claims the same character (same game id, or same name on the same realm): then the character is frozen on every
-- account that holds it, and shows nowhere until an operator decides.
--
-- Stored: the code's SHA-256 (never the code), and per link the character's name, realm, race, class, faction and
-- level, plus two keyed hashes the server makes: `link_key` from the GUID, and `completion_ref` from the install id
-- and the completion key (which the addon derives from the install id and the GUID, so neither is kept raw: together
-- they would let the GUID be guessed back). The GUID never reaches this database. Nothing is public: every
-- visibility flag starts false, and a hidden character (character_suppressions) can be neither linked nor shown.
-- The server reads with the service role and writes only through the functions below, which hold the limits:
-- 10 codes a day, each live 15 minutes and good once, and 50 linked characters per account.

do $$
begin
  if to_regprocedure('public.create_api_key(uuid, text, text, text, text[])') is null then
    raise exception 'Apply 20261021150000_saved_builds.sql first';
  end if;
end $$;

-- A realm as one key, however it was spelled: lower case, the curly apostrophe as a straight one, and any run of
-- spaces and hyphens as one space. "Forever-Pioneer", "forever  pioneer" and the page address "forever-pioneer"
-- are one realm. Every realm comparison below goes through this, so a spelling cannot dodge a freeze or a hide.
-- The site mirrors it in web/src/lib/character-links.ts (linkRealmKey).
create or replace function public.link_realm_key(p_realm text)
returns text
language sql immutable set search_path = ''
as $$
  select btrim(regexp_replace(replace(lower(p_realm), chr(8217), ''''), '[[:space:]-]+', ' ', 'g'));
$$;
revoke all on function public.link_realm_key(text) from public, anon, authenticated;
grant execute on function public.link_realm_key(text) to service_role;

create table if not exists public.link_codes (
  code_hash text primary key check (code_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists link_codes_user_idx on public.link_codes (user_id);
alter table public.link_codes enable row level security;
revoke all on public.link_codes from public, anon, authenticated, service_role;

create table if not exists public.character_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  link_key text not null check (link_key ~ '^[a-f0-9]{64}$'),
  ruleset text not null check (ruleset ~ '^[a-z0-9-]{1,32}$'),
  realm_key text not null check (realm_key = public.link_realm_key(realm_key) and char_length(realm_key) between 2 and 40),
  name_key text not null check (name_key = lower(name_key) and char_length(name_key) between 2 and 12),
  realm text not null check (char_length(realm) between 2 and 40),
  name text not null check (char_length(name) between 2 and 12),
  race text not null check (race ~ '^[A-Za-z]{2,24}$'),
  class text not null check (class ~ '^[A-Z]{3,16}$'),
  faction text not null check (faction in ('Alliance', 'Horde')),
  level smallint not null check (level between 1 and 60),
  completion_ref text not null check (completion_ref ~ '^[a-f0-9]{64}$'),
  status text not null default 'linked' check (status in ('linked', 'frozen')),
  linked_at timestamptz not null default now(),
  last_upload_at timestamptz not null default now()
);
-- One account holds a character once, by game id and by name. Across accounts the same character may appear,
-- frozen, so each owner sees what happened.
create unique index if not exists character_links_user_key on public.character_links (user_id, link_key);
create unique index if not exists character_links_user_name on public.character_links (user_id, ruleset, realm_key, name_key);
create index if not exists character_links_key_idx on public.character_links (link_key);
create index if not exists character_links_name_idx on public.character_links (ruleset, realm_key, name_key);
alter table public.character_links enable row level security;
revoke all on public.character_links from public, anon, authenticated, service_role;
grant select on public.character_links to service_role;

create table if not exists public.character_visibility (
  link_id uuid primary key references public.character_links(id) on delete cascade,
  page_public boolean not null default false,
  show_gear boolean not null default false,
  show_collections boolean not null default false,
  show_gold boolean not null default false,
  show_guild boolean not null default false,
  ranked_gear boolean not null default false,
  ranked_achievements boolean not null default false,
  ranked_gold boolean not null default false,
  indexable boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.character_visibility enable row level security;
revoke all on public.character_visibility from public, anon, authenticated, service_role;
grant select on public.character_visibility to service_role;

-- One link code made, counted against the account's 10 a day. The count lives in its own bucket, so codes that
-- expire or are cleaned up do not give the day back. Called only by create_link_code; nobody else may execute it.
create or replace function public.take_link_code(p_user_id uuid)
returns boolean
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
declare
  bucket_name text := 'link_codes:' || p_user_id::text;
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
  if current_bucket.count >= 10 then return false; end if;
  update public.intake_quota_buckets set count = count + 1 where bucket = bucket_name;
  return true;
end;
$$;
revoke all on function public.take_link_code(uuid) from public, anon, authenticated, service_role;

-- 1. Make a link code. The server draws the code and sends only its SHA-256. It is live for 15 minutes and good
-- once. Refusals (no row written): code_taken (a live code has that hash; the server draws again, and it costs
-- nothing), daily_limit. The account's codes that ended over a day ago are deleted here.
create or replace function public.create_link_code(p_user_id uuid, p_code_hash text)
returns table (code_expires_at timestamptz, refusal text)
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
declare
  v_expires timestamptz;
begin
  code_expires_at := null;
  if p_user_id is null or p_code_hash is null or p_code_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid code'; end if;
  perform 1 from public.users where id = p_user_id for update;
  if not found then raise exception 'Unknown user'; end if;
  delete from public.link_codes c where c.user_id = p_user_id and c.expires_at < now() - interval '1 day';
  delete from public.link_codes c where c.code_hash = p_code_hash and c.expires_at <= now();
  if exists (select 1 from public.link_codes c where c.code_hash = p_code_hash) then
    refusal := 'code_taken'; return next; return;
  end if;
  if not public.take_link_code(p_user_id) then refusal := 'daily_limit'; return next; return; end if;
  v_expires := now() + interval '15 minutes';
  insert into public.link_codes (code_hash, user_id, expires_at) values (p_code_hash, p_user_id, v_expires);
  code_expires_at := v_expires;
  refusal := null;
  return next;
end;
$$;
revoke all on function public.create_link_code(uuid, text) from public, anon, authenticated;
grant execute on function public.create_link_code(uuid, text) to service_role;

-- 2. Redeem a code with the character it was typed on. The server has already checked the row's shape, turned
-- the GUID into p_link_key and the install id and completion key into p_completion_ref, and says in p_census_agrees
-- whether the census agrees on race, class and faction. The code is checked first, so nothing about the character
-- is told to an account without a live code of its own. Refusals: code_unknown, code_foreign (another account's
-- code), code_used, code_expired (nothing written); census_mismatch (the code is spent, so the census cannot be
-- probed); suppressed (a hide request names this character), name_linked (this account links another character of
-- that name and realm), link_limit (50) (nothing written, the code stays live).
-- Otherwise the code is spent and the link written or refreshed. When another account holds the same game id or
-- the same name and realm, every one of those links and this one are frozen: link_status 'frozen'.
create or replace function public.redeem_link(
  p_user_id uuid, p_code_hash text, p_link_key text, p_ruleset text, p_realm text, p_name text,
  p_race text, p_class text, p_faction text, p_level integer, p_completion_ref text, p_census_agrees boolean)
returns table (link_ref uuid, link_status text, refusal text)
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
declare
  v_realm text := btrim(p_realm);
  v_realm_key text := public.link_realm_key(p_realm);
  v_name_key text := lower(p_name);
  v_code public.link_codes%rowtype;
  v_own public.character_links%rowtype;
  v_status text := 'linked';
  v_count integer;
begin
  link_ref := null;
  link_status := null;
  if p_user_id is null or p_code_hash is null or p_code_hash !~ '^[a-f0-9]{64}$'
    or p_link_key is null or p_link_key !~ '^[a-f0-9]{64}$'
    or p_ruleset is null or p_ruleset !~ '^[a-z0-9-]{1,32}$'
    or v_realm is null or char_length(v_realm) not between 2 and 40 or char_length(v_realm_key) not between 2 and 40
    or p_name is null or char_length(p_name) not between 2 and 12
    or p_race is null or p_race !~ '^[A-Za-z]{2,24}$' or p_class is null or p_class !~ '^[A-Z]{3,16}$'
    or p_faction is null or p_faction not in ('Alliance', 'Horde') or p_level is null or p_level not between 1 and 60
    or p_completion_ref is null or p_completion_ref !~ '^[a-f0-9]{64}$' or p_census_agrees is null then
    raise exception 'Invalid link';
  end if;
  -- The user row, then the character by game id, then by name: always in this order, so two claims of one
  -- character wait for each other and the second sees the first.
  perform 1 from public.users where id = p_user_id for update;
  if not found then raise exception 'Unknown user'; end if;
  perform pg_advisory_xact_lock(1, hashtext(p_link_key));
  perform pg_advisory_xact_lock(2, hashtext(p_ruleset || '/' || v_realm_key || '/' || v_name_key));

  select * into v_code from public.link_codes c where c.code_hash = p_code_hash for update;
  if not found then refusal := 'code_unknown'; return next; return; end if;
  if v_code.user_id <> p_user_id then refusal := 'code_foreign'; return next; return; end if;
  if v_code.used_at is not null then refusal := 'code_used'; return next; return; end if;
  if v_code.expires_at <= now() then refusal := 'code_expired'; return next; return; end if;
  if not p_census_agrees then
    update public.link_codes c set used_at = now() where c.code_hash = p_code_hash;
    refusal := 'census_mismatch'; return next; return;
  end if;
  if exists (select 1 from public.character_suppressions s where public.link_realm_key(s.realm) = v_realm_key and s.character = v_name_key) then
    refusal := 'suppressed'; return next; return;
  end if;

  select * into v_own from public.character_links l where l.user_id = p_user_id and l.link_key = p_link_key for update;
  if not found then
    if exists (select 1 from public.character_links l where l.user_id = p_user_id
        and l.ruleset = p_ruleset and l.realm_key = v_realm_key and l.name_key = v_name_key) then
      refusal := 'name_linked'; return next; return;
    end if;
    select count(*) into v_count from public.character_links l where l.user_id = p_user_id;
    if v_count >= 50 then refusal := 'link_limit'; return next; return; end if;
  elsif exists (select 1 from public.character_links l where l.user_id = p_user_id and l.id <> v_own.id
      and l.ruleset = p_ruleset and l.realm_key = v_realm_key and l.name_key = v_name_key) then
    refusal := 'name_linked'; return next; return;
  end if;

  -- First link wins only while nobody else claims it.
  update public.character_links l set status = 'frozen'
    where l.user_id <> p_user_id
      and (l.link_key = p_link_key or (l.ruleset = p_ruleset and l.realm_key = v_realm_key and l.name_key = v_name_key));
  if found or v_own.status = 'frozen' then v_status := 'frozen'; end if;

  if v_own.id is null then
    insert into public.character_links (user_id, link_key, ruleset, realm_key, name_key, realm, name, race, class, faction,
        level, completion_ref, status)
      values (p_user_id, p_link_key, p_ruleset, v_realm_key, v_name_key, v_realm, p_name, p_race, p_class, p_faction,
        p_level, p_completion_ref, v_status)
      returning id into link_ref;
  else
    update public.character_links l set ruleset = p_ruleset, realm_key = v_realm_key, name_key = v_name_key, realm = v_realm,
        name = p_name, race = p_race, class = p_class, faction = p_faction, level = p_level, completion_ref = p_completion_ref,
        status = v_status, last_upload_at = now()
      where l.id = v_own.id
      returning l.id into link_ref;
  end if;
  insert into public.character_visibility (link_id) values (link_ref) on conflict (link_id) do nothing;
  update public.link_codes c set used_at = now() where c.code_hash = p_code_hash;
  link_status := v_status;
  refusal := null;
  return next;
end;
$$;
revoke all on function public.redeem_link(uuid, text, text, text, text, text, text, text, text, integer, text, boolean) from public, anon, authenticated;
grant execute on function public.redeem_link(uuid, text, text, text, text, text, text, text, text, integer, text, boolean) to service_role;

-- 3. Unlink one of the owner's characters: the link and its visibility go. False when there is none with that id on
-- the account. Another account's frozen link of the same character stays frozen until an operator decides.
create or replace function public.unlink_character(p_user_id uuid, p_id uuid)
returns boolean
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
declare
  deleted integer;
begin
  delete from public.character_links where id = p_id and user_id = p_user_id;
  get diagnostics deleted = row_count;
  return deleted = 1;
end;
$$;
revoke all on function public.unlink_character(uuid, uuid) from public, anon, authenticated;
grant execute on function public.unlink_character(uuid, uuid) to service_role;

-- 4. Set some of one link's visibility flags, as a jsonb object of flag name to true or false; a flag left out
-- keeps its value. False when the link is not the owner's. An unknown flag or a value that is not a boolean raises.
create or replace function public.set_visibility(p_user_id uuid, p_id uuid, p_flags jsonb)
returns boolean
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
declare
  flag text;
  updated integer;
begin
  if p_flags is null or jsonb_typeof(p_flags) <> 'object' then raise exception 'Invalid visibility'; end if;
  for flag in select jsonb_object_keys(p_flags) loop
    if flag not in ('page_public', 'show_gear', 'show_collections', 'show_gold', 'show_guild', 'ranked_gear',
        'ranked_achievements', 'ranked_gold', 'indexable') or jsonb_typeof(p_flags -> flag) <> 'boolean' then
      raise exception 'Invalid visibility';
    end if;
  end loop;
  update public.character_visibility v set
      page_public = coalesce((p_flags ->> 'page_public')::boolean, v.page_public),
      show_gear = coalesce((p_flags ->> 'show_gear')::boolean, v.show_gear),
      show_collections = coalesce((p_flags ->> 'show_collections')::boolean, v.show_collections),
      show_gold = coalesce((p_flags ->> 'show_gold')::boolean, v.show_gold),
      show_guild = coalesce((p_flags ->> 'show_guild')::boolean, v.show_guild),
      ranked_gear = coalesce((p_flags ->> 'ranked_gear')::boolean, v.ranked_gear),
      ranked_achievements = coalesce((p_flags ->> 'ranked_achievements')::boolean, v.ranked_achievements),
      ranked_gold = coalesce((p_flags ->> 'ranked_gold')::boolean, v.ranked_gold),
      indexable = coalesce((p_flags ->> 'indexable')::boolean, v.indexable),
      updated_at = now()
    from public.character_links l
    where v.link_id = l.id and l.id = p_id and l.user_id = p_user_id;
  get diagnostics updated = row_count;
  return updated = 1;
end;
$$;
revoke all on function public.set_visibility(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_visibility(uuid, uuid, jsonb) to service_role;

-- 5. The public read of one linked character, or no row: only a live (not frozen) link whose owner made the page
-- public, and never a hidden character. The realm may be spelled as the page address spells it (hyphens) or any
-- other way: it is compared as a link_realm_key. Two accounts holding one character are both frozen, so at most
-- one live link matches. No account, key or hash comes out of here.
create or replace function public.public_character(p_ruleset text, p_realm_slug text, p_name text)
returns table (name text, realm text, race text, class text, faction text, level smallint, linked_at timestamptz,
  last_upload_at timestamptz, show_gear boolean, show_collections boolean, show_gold boolean, show_guild boolean,
  indexable boolean)
language sql stable security definer set search_path = '' set lock_timeout = '3s'
as $$
  select l.name, l.realm, l.race, l.class, l.faction, l.level, l.linked_at, l.last_upload_at,
    v.show_gear, v.show_collections, v.show_gold, v.show_guild, v.indexable
  from public.character_links l
  join public.character_visibility v on v.link_id = l.id
  where l.ruleset = p_ruleset and l.name_key = lower(p_name) and l.realm_key = public.link_realm_key(p_realm_slug)
    and l.status = 'linked' and v.page_public
    and not exists (select 1 from public.character_suppressions s where public.link_realm_key(s.realm) = l.realm_key and s.character = l.name_key)
    and not exists (select 1 from public.character_links o where o.id <> l.id and o.status = 'frozen'
      and (o.link_key = l.link_key or (o.ruleset = l.ruleset and o.realm_key = l.realm_key and o.name_key = l.name_key)))
  order by l.linked_at, l.id
  limit 1;
$$;
revoke all on function public.public_character(text, text, text) from public, anon, authenticated;
grant execute on function public.public_character(text, text, text) to service_role;

-- 6. Keys may now carry link:own ("Link my characters"), for the Desktop App to send link rows. The scope check
-- on the table and the one in create_api_key widen together.
alter table public.api_keys drop constraint if exists api_keys_scopes_check;
alter table public.api_keys add constraint api_keys_scopes_check
  check (cardinality(scopes) > 0 and scopes <@ array['read:public', 'read:own', 'link:own']::text[]);

drop function if exists public.create_api_key(uuid, text, text, text);
create or replace function public.create_api_key(p_user_id uuid, p_token_hash text, p_hint text, p_label text,
  p_scopes text[] default array['read:public']::text[])
returns table (key_ref uuid, refusal text)
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
declare
  live integer;
  made public.intake_quota_buckets%rowtype;
  bucket_name text;
  time_now timestamptz;
begin
  if p_scopes is null or cardinality(p_scopes) = 0 or not (p_scopes <@ array['read:public', 'read:own', 'link:own']::text[]) then
    raise exception 'Invalid scopes';
  end if;
  perform 1 from public.users where id = p_user_id for update;
  if not found then raise exception 'Unknown user'; end if;
  key_ref := null;
  select count(*) into live from public.api_keys k
    where k.user_id = p_user_id and k.revoked_at is null and (k.expires_at is null or k.expires_at > now());
  if live >= 5 then
    refusal := 'live_limit';
    return next;
    return;
  end if;
  bucket_name := 'keys_made:' || p_user_id::text;
  time_now := clock_timestamp();
  insert into public.intake_quota_buckets values (bucket_name, 0, time_now + interval '1 day')
    on conflict (bucket) do update set bucket = excluded.bucket
    returning * into made;
  if made.reset_at <= time_now then
    update public.intake_quota_buckets set count = 0, reset_at = time_now + interval '1 day' where bucket = bucket_name;
    made.count := 0;
  end if;
  if made.count >= 10 then
    refusal := 'daily_limit';
    return next;
    return;
  end if;
  update public.intake_quota_buckets set count = count + 1 where bucket = bucket_name;
  insert into public.api_keys (user_id, token_hash, hint, label, scopes)
    values (p_user_id, p_token_hash, p_hint, coalesce(p_label, ''), array(select distinct s from unnest(p_scopes) s order by s))
    returning id into key_ref;
  refusal := null;
  return next;
end;
$$;
revoke all on function public.create_api_key(uuid, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.create_api_key(uuid, text, text, text, text[]) to service_role;

-- 7. The account behind a key that may send link rows. refusal: unknown_key (unknown, revoked or expired),
-- no_scope (live, without link:own); account is null on a refusal.
create or replace function public.link_account_for_key(p_token_hash text)
returns table (account uuid, refusal text)
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
declare
  found_key public.api_keys%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid key'; end if;
  account := null;
  select * into found_key from public.api_keys k
    where k.token_hash = p_token_hash and k.revoked_at is null and (k.expires_at is null or k.expires_at > now());
  if not found then refusal := 'unknown_key'; return next; return; end if;
  if not ('link:own' = any(found_key.scopes)) then refusal := 'no_scope'; return next; return; end if;
  update public.api_keys set last_used_at = now()
    where id = found_key.id and (last_used_at is null or last_used_at < now() - interval '1 minute');
  account := found_key.user_id;
  refusal := null;
  return next;
end;
$$;
revoke all on function public.link_account_for_key(text) from public, anon, authenticated;
grant execute on function public.link_account_for_key(text) to service_role;
notify pgrst, 'reload schema';

-- Everything linked to one account: select * from public.character_links where user_id = '<id>';
-- Frozen characters waiting for a decision: select ruleset, realm, name, user_id, linked_at from public.character_links
--   where status = 'frozen' order by realm_key, name_key, linked_at;
-- Settle a frozen character by hand (the operator's tool): delete the links that lose, then
--   update public.character_links set status = 'linked' where id = '<the link that keeps it>';
-- Rollback (run by hand; this deletes every link and code):
--   drop function if exists public.link_account_for_key(text);
--   drop function if exists public.public_character(text, text, text);
--   drop function if exists public.set_visibility(uuid, uuid, jsonb);
--   drop function if exists public.unlink_character(uuid, uuid);
--   drop function if exists public.redeem_link(uuid, text, text, text, text, text, text, text, text, integer, text, boolean);
--   drop function if exists public.create_link_code(uuid, text);
--   drop function if exists public.take_link_code(uuid);
--   drop table if exists public.character_visibility;
--   drop table if exists public.character_links;
--   drop table if exists public.link_codes;
--   drop function if exists public.link_realm_key(text);
--   delete from public.intake_quota_buckets where bucket like 'link_codes:%';
--   delete from public.api_keys where scopes = array['link:own']::text[];
--   update public.api_keys set scopes = array_remove(scopes, 'link:own') where 'link:own' = any(scopes);
--   then re-run section 8 of 20261021150000_saved_builds.sql, and:
--   alter table public.api_keys drop constraint if exists api_keys_scopes_check;
--   alter table public.api_keys add constraint api_keys_scopes_check check (cardinality(scopes) > 0 and scopes <@ array['read:public', 'read:own']::text[]);
--   notify pgrst, 'reload schema';
