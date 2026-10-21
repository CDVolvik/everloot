-- A hide could be dodged by spelling the realm differently, and the players table keyed a realm two ways.
--
-- The table's realm_key was the realm lower cased, spaces and hyphens and all: "Forever Pioneer" became
-- "forever pioneer" and "Forever-Pioneer" became "forever-pioneer". A player who asked to be left out typed
-- the realm as they saw it, so the hide was written under one spelling and the character was stored under
-- another: the opt-out did not take, and the character stayed in the table and in the page. The character
-- links table already had this right, and said why: "a spelling cannot dodge a freeze or a hide".
--
-- The key is now the one the links table uses, public.link_realm_key: lower case, the curly apostrophe as a
-- straight one, any run of spaces and hyphens as one space. "Forever-Pioneer", "forever  pioneer" and the
-- page address "forever-pioneer" are one realm, so a hide reaches the character however the realm is
-- spelled. The realm the page shows is still the game's own spelling.
--
-- Apply after 20261021130000_players.sql. It replaces four functions and the key of the rows already
-- stored, and changes nothing else: no table is created, no row is dropped. The rollback is at the bottom.
-- The owner runs this: the site never applies a migration.

-- A realm as one key, however it was spelled: lower case, the curly apostrophe as a straight one, and any run of
-- spaces and hyphens as one space. The same rule as public.link_realm_key, which 20261021190000_character_links.sql
-- also creates; this file defines it so it does not depend on that migration being applied first.
create or replace function public.link_realm_key(p_realm text)
returns text
language sql immutable set search_path = ''
as $$
  select btrim(regexp_replace(replace(lower(p_realm), chr(8217), ''''), '[[:space:]-]+', ' ', 'g'));
$$;
revoke all on function public.link_realm_key(text) from public, anon, authenticated;
grant execute on function public.link_realm_key(text) to service_role;

-- The rows already stored get the new key, so a character does not end up twice under two spellings.
update public.players set realm_key = public.link_realm_key(realm_key) where realm_key <> public.link_realm_key(realm_key);
-- The table's own rule for a key, the same one the character links table has.
alter table public.players drop constraint if exists players_realm_key_check;
alter table public.players add constraint players_realm_key_check
  check (realm_key = public.link_realm_key(realm_key) and char_length(realm_key) between 2 and 40);

-- 1. Write: a batch of rows from one upload, as jsonb [{name, realm, race, class, level, guild, seen}].
-- The realm key is the normalised realm, so a character is one character however the realm is spelled. A
-- suppressed character is skipped, and a hide reaches it however it was spelled. A row replaces the stored one
-- only when it is from the same or a later day and something changed (an upload that repeats rows already
-- stored writes nothing); a row without a guild keeps the stored guild.
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
    select distinct on (public.link_realm_key(r->>'realm'), lower(btrim(r->>'name')))
      public.link_realm_key(r->>'realm') as realm_key, lower(btrim(r->>'name')) as name_key,
      btrim(r->>'realm') as realm, r->>'name' as name, r->>'race' as race, r->>'class' as class,
      (r->>'level')::smallint as level, nullif(r->>'guild', '') as guild, (r->>'seen')::date as last_seen
    from jsonb_array_elements(p_rows) as r
    order by public.link_realm_key(r->>'realm'), lower(btrim(r->>'name')), (r->>'seen')::date desc
  )
  insert into public.players as p (ruleset, realm_key, name_key, realm, name, race, class, level, guild, last_seen)
  select p_ruleset, i.realm_key, i.name_key, i.realm, i.name, i.race, i.class, i.level, i.guild, i.last_seen
  from incoming i
  where not exists (select 1 from public.character_suppressions s where public.link_realm_key(s.realm) = i.realm_key and s.character = i.name_key)
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

-- 2. Read, one character. The realm is compared as one key, so the page address finds the row however the
-- realm is spelled.
create or replace function public.get_player(p_ruleset text, p_realm_slug text, p_name text)
returns table (name text, realm text, race text, class text, level smallint, guild text, last_seen date)
language sql stable security definer set search_path = '' set lock_timeout = '3s'
as $$
  select p.name, p.realm, p.race, p.class, p.level, p.guild, p.last_seen
  from public.players p
  where p.ruleset = p_ruleset and p.name_key = lower(p_name)
    and public.link_realm_key(p.realm_key) = public.link_realm_key(p_realm_slug)
    and not exists (select 1 from public.character_suppressions s where public.link_realm_key(s.realm) = p.realm_key and s.character = p.name_key)
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
    and not exists (select 1 from public.character_suppressions s where public.link_realm_key(s.realm) = p.realm_key and s.character = p.name_key)
  order by p.name_key, p.realm, p.level
  limit least(greatest(coalesce(p_limit, 25), 1), 25);
$$;
revoke all on function public.search_players(text, integer) from public, anon, authenticated;
grant execute on function public.search_players(text, integer) to service_role;

-- 4. Opt-out: hide a character and delete its row. Safe to repeat. Anyone may ask; undoing it is the owner's tool.
-- The realm is stored as one key, so the hide reaches the character however the realm was spelled.
create or replace function public.suppress_player(p_realm text, p_name text)
returns void
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
begin
  if p_realm is null or p_name is null or char_length(btrim(p_realm)) not between 2 and 40 or char_length(btrim(p_name)) not between 2 and 12 then
    raise exception 'Invalid character';
  end if;
  insert into public.character_suppressions (realm, character)
    values (public.link_realm_key(p_realm), lower(btrim(p_name))) on conflict do nothing;
  delete from public.players where realm_key = public.link_realm_key(p_realm) and name_key = lower(btrim(p_name));
end;
$$;
revoke all on function public.suppress_player(text, text) from public, anon, authenticated;
grant execute on function public.suppress_player(text, text) to service_role;

-- Rollback (by hand): the old key, the old check, and the old function bodies.
--   alter table public.players drop constraint if exists players_realm_key_check;
--   update public.players set realm_key = lower(btrim(realm_key)) where realm_key <> lower(btrim(realm_key));
--   alter table public.players add constraint players_realm_key_check check (char_length(realm_key) between 2 and 40);
--   then re-apply the four function bodies from 20261021130000_players.sql, and leave public.link_realm_key in
--   place: 20261021190000_character_links.sql creates the same function with the same body.
-- The rollback puts the bug back: a hide can be dodged by spelling the realm differently.
