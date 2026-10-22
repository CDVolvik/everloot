-- Settled facts, counted instead of stored (docs/design/specs/2026-10-21-coverage-plateau-design.md, section 4).
-- Past settling, an upload row that matches its fact's settled value in every field adds its install to the fact's
-- agreeing voters here, and the row itself is not stored. Server-only, like the intake quotas: voters are HMACs of the
-- install id, never the id itself. The intake writes here only with EVERLOOT_SETTLED_TALLY=1.
create table if not exists public.settled_fact_tallies (
  build text not null check (build ~ '^\d+(\.\d+)+$' and length(build) <= 32),
  fact text not null check (fact ~ '^(npc|entrance|encounter|object):\d+@\d+$|^(quest|vendor):\d+$|^loot:(npc|obj):\d+$'),
  voters integer not null default 0 check (voters >= 0),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (build, fact)
);
create table if not exists public.settled_fact_voters (
  build text not null,
  fact text not null,
  voter text not null check (voter ~ '^[a-f0-9]{64}$'),
  primary key (build, fact, voter),
  foreign key (build, fact) references public.settled_fact_tallies (build, fact) on delete cascade
);
alter table public.settled_fact_tallies enable row level security;
alter table public.settled_fact_voters enable row level security;
revoke all on public.settled_fact_tallies from public, anon, authenticated, service_role;
revoke all on public.settled_fact_voters from public, anon, authenticated, service_role;
grant select on public.settled_fact_tallies to service_role;

-- One upload's agreement: each fact counts the install once, and every call moves last_seen.
create or replace function public.tally_settled_facts(p_build text, p_voter text, p_facts text[])
returns integer
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
declare
  f text;
  added integer := 0;
  inserted integer;
begin
  if p_build is null or p_build !~ '^\d+(\.\d+)+$' or length(p_build) > 32 or p_voter is null or p_voter !~ '^[a-f0-9]{64}$'
    or p_facts is null or coalesce(array_length(p_facts, 1), 0) = 0 or array_length(p_facts, 1) > 2000 then
    raise exception 'Invalid settled tally';
  end if;
  foreach f in array p_facts loop
    insert into public.settled_fact_tallies (build, fact) values (p_build, f)
      on conflict (build, fact) do update set last_seen = now();
    insert into public.settled_fact_voters (build, fact, voter) values (p_build, f, p_voter) on conflict do nothing;
    get diagnostics inserted = row_count;
    if inserted > 0 then
      update public.settled_fact_tallies set voters = voters + 1 where build = p_build and fact = f;
      added := added + 1;
    end if;
  end loop;
  return added;
end;
$$;
-- Supabase can grant functions to browser roles by default: revoke explicitly.
revoke all on function public.tally_settled_facts(text, text, text[]) from public, anon, authenticated;
grant execute on function public.tally_settled_facts(text, text, text[]) to service_role;
notify pgrst, 'reload schema';
