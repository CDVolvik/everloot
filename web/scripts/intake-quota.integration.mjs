import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";

// Disposable local Postgres only. Never point this destructive fixture at Supabase.
const url = new URL(process.env.QUOTA_TEST_DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'Local test database required');
assert.equal(url.pathname, '/intake_quota_test', 'Dedicated test database required');
const pool = new pg.Pool({ connectionString: url.toString(), max: 24 });
const sql = await readFile(new URL('../../supabase/migrations/20261007220000_intake_quotas.sql', import.meta.url), 'utf8');
const key = n => n.toString(16).padStart(64, '0');
async function asRole(role, query, params = []) {
  assert.ok(['service_role', 'anon', 'authenticated'].includes(role));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    const result = await client.query(query, params);
    await client.query('COMMIT');
    return result.rows;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
const consume = async (scope, value) => (await asRole('service_role', 'select * from public.consume_intake_quota($1,$2)', [scope, key(value)]))[0];
try {
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await pool.query(`DO $$ BEGIN IF NOT EXISTS (select from pg_roles where rolname='${role}') THEN CREATE ROLE ${role}; END IF; END $$`);
  }
  await pool.query('alter role service_role bypassrls');
  // Match Supabase's permissive default function grants: the migration must revoke them.
  await pool.query('alter default privileges in schema public grant execute on functions to anon, authenticated, service_role');
  await pool.query('alter default privileges in schema public grant all on tables to anon, authenticated, service_role');
  await pool.query(sql);
  await pool.query(sql);
  await pool.query('truncate public.intake_quota_buckets');
  assert.equal((await pool.query("select relrowsecurity from pg_class where oid='public.intake_quota_buckets'::regclass")).rows[0].relrowsecurity, true);
  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(asRole(role, 'select * from public.intake_quota_buckets'), /permission denied/);
    await assert.rejects(asRole(role, 'select * from public.consume_intake_quota($1,$2)', ['install', key(1)]), /permission denied/);
  }
  await assert.rejects(asRole('service_role', "insert into public.intake_quota_buckets values ('forged',0,now())"), /permission denied/);
  await assert.rejects(asRole('service_role', 'select * from public.consume_intake_quota($1,$2)', ['unknown', key(1)]), /Invalid quota/);

  const installs = await Promise.all(Array.from({ length: 40 }, () => consume('install', 1)));
  assert.equal(installs.filter(r => r.allowed).length, 20);
  assert.ok(installs.filter(r => !r.allowed).every(r => r.retry_after >= 1 && r.retry_after <= 3600));
  const requests = await Promise.all(Array.from({ length: 220 }, () => consume('request', 2)));
  assert.equal(requests.filter(r => r.allowed).length, 200);
  assert.equal((await pool.query("select count from public.intake_quota_buckets where bucket='global'")).rows[0].count, 200);

  await pool.query("update public.intake_quota_buckets set count=9999 where bucket='global'");
  assert.equal((await consume('request', 3)).allowed, true);
  assert.equal((await consume('request', 4)).allowed, false);
  assert.equal((await pool.query('select count(*)::int as count from public.intake_quota_buckets where bucket=$1', [`ip:${key(4)}`])).rows[0].count, 0);
  await pool.query("update public.intake_quota_buckets set reset_at=now()-interval '1 second'");
  assert.equal((await consume('install', 1)).allowed, true);
  assert.equal((await consume('request', 2)).allowed, true);
  assert.equal((await pool.query("select count from public.intake_quota_buckets where bucket='global'")).rows[0].count, 1);

  await pool.query("update public.intake_quota_buckets set reset_at=now()-interval '2 days'");
  const racing = await Promise.all([
    ...Array.from({ length: 40 }, () => consume('install', 1)),
    asRole('service_role', "delete from public.intake_quota_buckets where reset_at < now()-interval '1 day'"),
  ]);
  assert.equal(racing.slice(0, 40).filter(r => r.allowed).length, 20);
  await pool.query("insert into public.intake_quota_buckets values ('expired-fixture',0,now()-interval '2 days')");
  await asRole('service_role', "delete from public.intake_quota_buckets where reset_at < now()-interval '1 day'");
  assert.equal((await pool.query("select count(*)::int as count from public.intake_quota_buckets where bucket='expired-fixture'")).rows[0].count, 0);
  console.log('Quota integration passed: idempotent migration, private roles/RLS, 40 concurrent installs capped at 20, 220 requests capped at 200, atomic global denial, expiry and cleanup race.');
} finally { await pool.end(); }
