-- Player pages: one current row per character, found by name. Additive: one new table and five functions.
-- Apply before setting EVERLOOT_PLAYER_PAGES=1; until then the site never calls anything here and drops
-- every player row at intake (docs/design/specs/2026-10-20-player-pages-design.md).
--
-- The row is the newest the addon reported: name, realm, race, class, level, guild and the UTC date it was last
-- seen. No history, position, gear or time of day. A character is hidden by a row in character_suppressions (the
-- table that already holds opt-outs for named records): it is refused on write, deleted when the opt-out is
-- recorded, and left out of every read, so a row that slipped in is still never shown.

create table if not exists public.players (
  ruleset text not null check (ruleset ~ '^[a-z0-9-]{1,32}$'),
  realm_key text not null check (char_length(realm_key) between 2 and 40),
  name_key text not null check (char_length(name_key) between 2 and 12),
  realm text not null check (char_length(realm) between 2 and 40),
  name text not null check (char_length(name) between 2 and 12),
  race text not null check (race ~ '^[A-Za-z]{2,24}$'),
  class text not null check (class ~ '^[A-Z]{3,16}$'),
  level smallint not null check (level between 1 and 60),
  guild text check (guild is null or char_length(guild) between 2 and 24),
  last_seen date not null,
  primary key (ruleset, realm_key, name_key)
);
-- Name search is a prefix match on name_key; text_pattern_ops lets `like 'abc%'` use this index in any collation.
create index if not exists players_name_prefix on public.players (name_key text_pattern_ops, realm_key);
create index if not exists players_last_seen on public.players (last_seen);
alter table public.players enable row level security;
revoke all on public.players from public, anon, authenticated, service_role;

-- 1. Write: a batch of rows from one upload, as jsonb [{name, realm, race, class, level, guild, seen}].
-- Keys are lower-cased here, so the site and the table agree. A suppressed character is skipped. A row replaces
-- the stored one only when it is from the same or a later day and something changed (an upload that repeats
-- rows already stored writes nothing); a row without a guild keeps the stored guild.
-- The caller has validated every field; the table's checks are the last line. At most 1,000 rows a call.
create or replace function public.upsert_players(p_ruleset text, p_rows jsonb)
returns integer
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
declare
  written integer;
begin
  if p_ruleset is null or p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'Invalid player batch';
  end if;
  with incoming as (
    select distinct on (lower(btrim(r->>'realm')), lower(r->>'name'))
      lower(btrim(r->>'realm')) as realm_key, lower(r->>'name') as name_key,
      btrim(r->>'realm') as realm, r->>'name' as name, r->>'race' as race, r->>'class' as class,
      (r->>'level')::smallint as level, nullif(r->>'guild', '') as guild, (r->>'seen')::date as last_seen
    from jsonb_array_elements(p_rows) as r
    order by lower(btrim(r->>'realm')), lower(r->>'name'), (r->>'seen')::date desc
  )
  insert into public.players as p (ruleset, realm_key, name_key, realm, name, race, class, level, guild, last_seen)
  select p_ruleset, i.realm_key, i.name_key, i.realm, i.name, i.race, i.class, i.level, i.guild, i.last_seen
  from incoming i
  where not exists (select 1 from public.character_suppressions s where s.realm = i.realm_key and s.character = i.name_key)
  on conflict (ruleset, realm_key, name_key) do update set
    realm = excluded.realm, name = excluded.name, race = excluded.race, class = excluded.class,
    level = excluded.level, guild = coalesce(excluded.guild, p.guild), last_seen = excluded.last_seen
    where excluded.last_seen >= p.last_seen
      and (p.name, p.realm, p.race, p.class, p.level, p.guild, p.last_seen)
        is distinct from (excluded.name, excluded.realm, excluded.race, excluded.class, excluded.level, coalesce(excluded.guild, p.guild), excluded.last_seen);
  get diagnostics written = row_count;
  return written;
end;
$$;
revoke all on function public.upsert_players(text, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_players(text, jsonb) to service_role;

-- 2. Read, one character. The realm is its key with spaces as hyphens, as the page address spells it.
create or replace function public.get_player(p_ruleset text, p_realm_slug text, p_name text)
returns table (name text, realm text, race text, class text, level smallint, guild text, last_seen date)
language sql stable security definer set search_path = '' set lock_timeout = '3s'
as $$
  select p.name, p.realm, p.race, p.class, p.level, p.guild, p.last_seen
  from public.players p
  where p.ruleset = p_ruleset and p.name_key = lower(p_name) and replace(p.realm_key, ' ', '-') = lower(p_realm_slug)
    and not exists (select 1 from public.character_suppressions s where s.realm = p.realm_key and s.character = p.name_key)
  limit 1;
$$;
revoke all on function public.get_player(text, text, text) from public, anon, authenticated;
grant execute on function public.get_player(text, text, text) to service_role;

-- 3. Read, search: names starting with a prefix of at least two letters, at most 25 rows, in name order.
create or replace function public.search_players(p_prefix text, p_limit integer)
returns table (name text, realm text, ruleset text, race text, class text, level smallint, guild text, last_seen date)
language sql stable security definer set search_path = '' set lock_timeout = '3s'
as $$
  select p.name, p.realm, p.ruleset, p.race, p.class, p.level, p.guild, p.last_seen
  from public.players p
  where char_length(p_prefix) >= 2 and p_prefix ~ '^[^%_\\]+$'
    and p.name_key like lower(p_prefix) || '%'
    and not exists (select 1 from public.character_suppressions s where s.realm = p.realm_key and s.character = p.name_key)
  order by p.name_key, p.realm_key
  limit least(greatest(coalesce(p_limit, 25), 1), 25);
$$;
revoke all on function public.search_players(text, integer) from public, anon, authenticated;
grant execute on function public.search_players(text, integer) to service_role;

-- 4. Opt-out: hide a character and delete its row. Safe to repeat. Anyone may ask; undoing it is the owner's tool.
create or replace function public.suppress_player(p_realm text, p_name text)
returns void
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
begin
  if p_realm is null or p_name is null or char_length(btrim(p_realm)) not between 2 and 40 or char_length(btrim(p_name)) not between 2 and 12 then
    raise exception 'Invalid character';
  end if;
  insert into public.character_suppressions (realm, character)
    values (lower(btrim(p_realm)), lower(btrim(p_name))) on conflict do nothing;
  delete from public.players where realm_key = lower(btrim(p_realm)) and name_key = lower(btrim(p_name));
end;
$$;
revoke all on function public.suppress_player(text, text) from public, anon, authenticated;
grant execute on function public.suppress_player(text, text) to service_role;

-- 5. Retention, run by the snapshot cron: a character not seen for 90 days is deleted.
create or replace function public.prune_players()
returns void
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
begin
  delete from public.players where last_seen < (now() at time zone 'utc')::date - 90;
end;
$$;
revoke all on function public.prune_players() from public, anon, authenticated;
grant execute on function public.prune_players() to service_role;
notify pgrst, 'reload schema';

-- Lift an opt-out by hand (the owner's tool): delete from public.character_suppressions where realm = '<realm, lower case>' and character = '<name, lower case>';
-- Everything stored about one character: select * from public.players where name_key = '<name, lower case>';
-- Switch the feature off for good and delete every row: delete from public.players;  (and unset EVERLOOT_PLAYER_PAGES)
-- Rollback (run by hand; this deletes every player row):
--   drop function if exists public.prune_players();
--   drop function if exists public.suppress_player(text, text);
--   drop function if exists public.search_players(text, integer);
--   drop function if exists public.get_player(text, text, text);
--   drop function if exists public.upsert_players(text, jsonb);
--   drop table if exists public.players;
--   notify pgrst, 'reload schema';
