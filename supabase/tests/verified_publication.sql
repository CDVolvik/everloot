-- Run after the migration on a disposable local PostgreSQL database.
begin;
do $$
declare role_name text; table_name text; operation text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    foreach table_name in array array['publication_grants', 'character_suppressions'] loop
      foreach operation in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
        if has_table_privilege(role_name, 'public.' || table_name, operation) then
          raise exception '% can % %', role_name, operation, table_name;
        end if;
      end loop;
      if not (select relrowsecurity from pg_class where oid = ('public.' || table_name)::regclass) then
        raise exception 'RLS disabled on %', table_name;
      end if;
    end loop;
  end loop;
  if not has_table_privilege('service_role', 'public.publication_grants', 'SELECT,INSERT,UPDATE')
     or not has_table_privilege('service_role', 'public.character_suppressions', 'SELECT,INSERT') then
    raise exception 'Server lacks required permissions';
  end if;
end $$;
set local role anon;
do $$ begin
  begin
    perform * from public.publication_grants;
    raise exception 'Anonymous read unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin
    insert into public.character_suppressions values ('test realm', 'fixture');
    raise exception 'Authenticated write unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
insert into public.publication_grants(token_hash, "grant") values (repeat('a', 64), '{}');
update public.publication_grants set revoked_at = now() where token_hash = repeat('a', 64);
insert into public.character_suppressions values ('test realm', 'fixture');
select count(*) as server_readable_grants from public.publication_grants;
rollback;
