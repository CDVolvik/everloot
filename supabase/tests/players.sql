-- Run after 20261007070647_verified_publication.sql and 20261021130000_players.sql on a disposable local
-- PostgreSQL database that has the roles anon, authenticated and service_role.
begin;

-- Only the server's role may call anything here; the table is closed to every API role.
do $$
declare role_name text; fn text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if has_table_privilege(role_name, 'public.players', 'SELECT,INSERT,UPDATE,DELETE') then
      raise exception '% can touch players', role_name;
    end if;
    foreach fn in array array[
      'public.upsert_players(text, jsonb)', 'public.get_player(text, text, text)', 'public.search_players(text, integer)',
      'public.suppress_player(text, text)', 'public.prune_players()'
    ] loop
      if has_function_privilege(role_name, fn, 'EXECUTE') then raise exception '% can execute %', role_name, fn; end if;
    end loop;
  end loop;
  if not (select relrowsecurity from pg_class where oid = 'public.players'::regclass) then raise exception 'RLS disabled on players'; end if;
  if not has_function_privilege('service_role', 'public.upsert_players(text, jsonb)', 'EXECUTE') then raise exception 'server cannot write'; end if;
end $$;

select public.upsert_players('forever', '[
  {"name":"Thrallina","realm":"Forever Pioneer","race":"Orc","class":"SHAMAN","level":24,"guild":"Night Watch","seen":"2026-10-20"},
  {"name":"Thrallina","realm":"Forever Pioneer","race":"Orc","class":"SHAMAN","level":25,"guild":"Night Watch","seen":"2026-10-21"},
  {"name":"Throgar","realm":"Forever Pioneer","race":"Orc","class":"WARRIOR","level":12,"seen":"2026-10-20"},
  {"name":"Hidden","realm":"Forever Pioneer","race":"Human","class":"MAGE","level":9,"seen":"2026-10-20"}
]'::jsonb);

do $$
begin
  -- one row per character: the two Thrallina rows in one batch became one, the later day winning
  if (select count(*) from public.players where name_key = 'thrallina') <> 1 then raise exception 'duplicate character'; end if;
  if (select level from public.players where name_key = 'thrallina') <> 25 then raise exception 'older row won inside a batch'; end if;
end $$;

-- an older report never replaces a newer row; a newer row without a guild keeps the guild
select public.upsert_players('forever', '[{"name":"thrallina","realm":"forever pioneer","race":"Orc","class":"SHAMAN","level":10,"seen":"2026-10-19"}]'::jsonb);
select public.upsert_players('forever', '[{"name":"Thrallina","realm":"Forever Pioneer","race":"Orc","class":"SHAMAN","level":26,"seen":"2026-10-22"}]'::jsonb);
do $$
begin
  if (select level from public.get_player('forever', 'forever-pioneer', 'THRALLINA')) <> 26 then raise exception 'newer row did not win'; end if;
  if (select guild from public.get_player('forever', 'forever-pioneer', 'thrallina')) <> 'Night Watch' then raise exception 'guild was lost'; end if;
end $$;

-- prefix search uses the name, not the realm, and is capped
do $$
begin
  if (select count(*) from public.search_players('Thr', 25)) <> 2 then raise exception 'prefix search'; end if;
  if (select count(*) from public.search_players('T', 25)) <> 0 then raise exception 'one letter must find nothing'; end if;
  if (select count(*) from public.search_players('th%', 25)) <> 0 then raise exception 'wildcard must find nothing'; end if;
end $$;

-- an opt-out deletes the row and refuses it on every later write and read
select public.suppress_player('Forever Pioneer', 'Hidden');
select public.suppress_player('forever pioneer', 'hidden');
do $$
begin
  if exists (select 1 from public.players where name_key = 'hidden') then raise exception 'opt-out left the row'; end if;
  if (select count(*) from public.character_suppressions where character = 'hidden') <> 1 then raise exception 'opt-out not recorded once'; end if;
end $$;
select public.upsert_players('forever', '[{"name":"Hidden","realm":"Forever Pioneer","race":"Human","class":"MAGE","level":9,"seen":"2026-10-23"}]'::jsonb);
-- a row that got in before the opt-out was recorded is still never read
insert into public.players values ('forever', 'forever pioneer', 'leaker', 'Forever Pioneer', 'Leaker', 'Orc', 'WARRIOR', 5, null, '2026-10-20');
insert into public.character_suppressions values ('forever pioneer', 'leaker');
do $$
begin
  if exists (select 1 from public.players where name_key = 'hidden') then raise exception 'suppressed character written'; end if;
  if exists (select 1 from public.get_player('forever', 'forever-pioneer', 'leaker')) then raise exception 'suppressed character read'; end if;
  if exists (select 1 from public.search_players('Leak', 25)) then raise exception 'suppressed character searched'; end if;
end $$;

-- retention
insert into public.players values ('forever', 'forever pioneer', 'oldtimer', 'Forever Pioneer', 'Oldtimer', 'Orc', 'WARRIOR', 5, null, current_date - 91);
select public.prune_players();
do $$
begin
  if exists (select 1 from public.players where name_key = 'oldtimer') then raise exception 'stale row kept'; end if;
  if not exists (select 1 from public.players where name_key = 'thrallina') then raise exception 'prune removed a fresh row'; end if;
end $$;

-- a batch over 1,000 rows is refused
do $$
begin
  begin
    perform public.upsert_players('forever', (select jsonb_agg(jsonb_build_object('name', 'Aa', 'realm', 'Rr', 'race', 'Orc', 'class', 'MAGE', 'level', 1, 'seen', '2026-10-20')) from generate_series(1, 1001)));
    raise exception 'oversized batch accepted';
  exception when raise_exception then
    if sqlerrm <> 'Invalid player batch' then raise; end if;
  end;
end $$;
rollback;
