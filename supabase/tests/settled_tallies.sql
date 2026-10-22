-- Run after 20261023120000_settled_tallies.sql on a disposable local PostgreSQL database that has the roles anon,
-- authenticated and service_role.
begin;

-- Only the server's role may call the function; both tables are closed to every API role.
do $$
declare role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if has_table_privilege(role_name, 'public.settled_fact_tallies', 'SELECT,INSERT,UPDATE,DELETE')
      or has_table_privilege(role_name, 'public.settled_fact_voters', 'SELECT,INSERT,UPDATE,DELETE') then
      raise exception '% can touch the tallies', role_name;
    end if;
    if has_function_privilege(role_name, 'public.tally_settled_facts(text, text, text[])', 'EXECUTE') then
      raise exception '% can execute tally_settled_facts', role_name;
    end if;
  end loop;
  if has_table_privilege('service_role', 'public.settled_fact_tallies', 'INSERT,UPDATE,DELETE') then raise exception 'server can write the table directly'; end if;
  if has_table_privilege('service_role', 'public.settled_fact_voters', 'SELECT') then raise exception 'server can read voter hashes'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.settled_fact_tallies'::regclass) then raise exception 'RLS disabled on tallies'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.settled_fact_voters'::regclass) then raise exception 'RLS disabled on voters'; end if;
  if not has_function_privilege('service_role', 'public.tally_settled_facts(text, text, text[])', 'EXECUTE') then raise exception 'server cannot tally'; end if;
end $$;

-- Each install counts once per fact; a repeat only moves last_seen.
do $$
declare a text := repeat('a', 64); b text := repeat('b', 64); n integer;
begin
  n := public.tally_settled_facts('1.60.1.70450', a, array['npc:1@1429', 'quest:783', 'loot:npc:99']);
  if n <> 3 then raise exception 'first tally added %', n; end if;
  n := public.tally_settled_facts('1.60.1.70450', a, array['npc:1@1429']);
  if n <> 0 then raise exception 'repeat added %', n; end if;
  n := public.tally_settled_facts('1.60.1.70450', b, array['npc:1@1429']);
  if n <> 1 then raise exception 'second voter added %', n; end if;
  if (select voters from public.settled_fact_tallies where build = '1.60.1.70450' and fact = 'npc:1@1429') <> 2 then raise exception 'voters not 2'; end if;
  if (select voters from public.settled_fact_tallies where fact = 'quest:783') <> 1 then raise exception 'quest voters not 1'; end if;
end $$;

-- Bad input is refused whole.
do $$
begin
  begin perform public.tally_settled_facts('1.60.1.70450', 'install-1234', array['quest:1']); raise exception 'raw install accepted'; exception when raise_exception then if sqlerrm = 'raw install accepted' then raise; end if; end;
  begin perform public.tally_settled_facts('latest', repeat('a', 64), array['quest:1']); raise exception 'bad build accepted'; exception when raise_exception then if sqlerrm = 'bad build accepted' then raise; end if; end;
  begin perform public.tally_settled_facts('1.60.1.70450', repeat('a', 64), array['quest:Thrall']); raise exception 'bad fact accepted'; exception when check_violation then null; end;
  begin perform public.tally_settled_facts('1.60.1.70450', repeat('a', 64), array[]::text[]); raise exception 'empty accepted'; exception when raise_exception then if sqlerrm = 'empty accepted' then raise; end if; end;
end $$;

rollback;
