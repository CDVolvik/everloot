-- The nightly backup cannot read the players table, so every backup since the table arrived is incomplete.
--
-- 20261021130000_players.sql revoked everything on public.players from service_role and granted nothing back.
-- The other server-only tables revoke the same way and then give service_role `select` (intake_quota_buckets,
-- usage_counters, api_keys, saved_builds, user_profiles, character_links and more). The backup reads every table
-- with the server's secret key, which is service_role, and first asks for the row count. On players that is
-- refused: 42501, "permission denied for table players". The table is not dumped and the backup is marked
-- incomplete.
--
-- This gives service_role `select` on the table and nothing else: no insert, update or delete, nothing for anon
-- or authenticated, and no change to row level security. The site still reads and writes players only through
-- its five functions; this only lets the server's own key read the rows, as it can for the other tables.
--
-- Apply after 20261021130000_players.sql. The owner runs this: the site never applies a migration.

grant select on public.players to service_role;
notify pgrst, 'reload schema';

-- Rollback (run by hand):
--   revoke select on public.players from service_role;
--   notify pgrst, 'reload schema';
