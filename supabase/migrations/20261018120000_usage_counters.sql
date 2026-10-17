-- Privacy-safe usage counters: one row per day and metric name, nothing about who made the call.
-- No IP, install id, query text or user agent is stored. Apply before setting EVERLOOT_USAGE_METRICS=1.
create table if not exists public.usage_counters (
  day date not null,
  metric text not null check (metric ~ '^[a-z0-9_.]{1,64}$'),
  count bigint not null check (count >= 0),
  primary key (day, metric)
);
alter table public.usage_counters enable row level security;
revoke all on public.usage_counters from public, anon, authenticated, service_role;
grant select on public.usage_counters to service_role;

create or replace function public.bump_usage_counter(p_metric text)
returns void
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
begin
  if p_metric is null or p_metric !~ '^[a-z0-9_.]{1,64}$' then
    raise exception 'Invalid metric name';
  end if;
  insert into public.usage_counters (day, metric, count)
    values ((now() at time zone 'utc')::date, p_metric, 1)
    on conflict (day, metric) do update set count = public.usage_counters.count + 1;
end;
$$;
revoke all on function public.bump_usage_counter(text) from public, anon, authenticated;
grant execute on function public.bump_usage_counter(text) to service_role;
notify pgrst, 'reload schema';
