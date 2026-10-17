import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

// Disposable local Postgres only. Never point this destructive fixture at Supabase.
// QUOTA_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/intake_quota_test node scripts/data-guard.integration.mjs
const url = new URL(process.env.QUOTA_TEST_DATABASE_URL);
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Local test database required");
assert.equal(url.pathname, "/intake_quota_test", "Dedicated test database required");
const pool = new pg.Pool({ connectionString: url.toString(), max: 24 });
const read = (file) => readFile(new URL(`../../supabase/${file}`, import.meta.url), "utf8");
const migrations = ["20261007220000_intake_quotas.sql", "20261010120000_mcp_quota_scope.sql", "20261019120000_data_guard.sql"];
const hex = (n) => n.toString(16).padStart(64, "0");
const hash = (token) => createHash("sha256").update(token).digest("hex");

async function asRole(role, query, params = []) {
  assert.ok(["service_role", "anon", "authenticated"].includes(role));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${role}`);
    const result = await client.query(query, params);
    await client.query("COMMIT");
    return result.rows;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
const service = (query, params) => asRole("service_role", query, params);
const consumeKey = async (token, surface = "corpus") => (await service("select * from public.consume_api_key($1,$2)", [hash(token), surface]))[0];
const consumeApi = async (n) => (await service("select * from public.consume_intake_quota('api',$1)", [hex(n)]))[0];

try {
  for (const role of ["anon", "authenticated", "service_role"]) {
    await pool.query(`DO $$ BEGIN IF NOT EXISTS (select from pg_roles where rolname='${role}') THEN CREATE ROLE ${role}; END IF; END $$`);
  }
  await pool.query("alter role service_role bypassrls");
  // Match Supabase's permissive defaults: the migration must revoke them.
  await pool.query("alter default privileges in schema public grant execute on functions to anon, authenticated, service_role");
  await pool.query("alter default privileges in schema public grant all on tables to anon, authenticated, service_role");
  await pool.query(await read("auth_schema.sql"));
  const sql = (await Promise.all(migrations.map((file) => read(`migrations/${file}`)))).join("\n");
  // Applied twice: the migration must be safe to re-run.
  await pool.query(sql);
  await pool.query(sql);
  await pool.query("truncate public.intake_quota_buckets, public.api_key_usage, public.api_keys, public.users cascade");

  // Browser roles can touch nothing; the service role cannot forge rows or read more than it needs.
  for (const role of ["anon", "authenticated"]) {
    await assert.rejects(asRole(role, "select * from public.api_keys"), /permission denied/);
    await assert.rejects(asRole(role, "select * from public.api_key_usage"), /permission denied/);
    await assert.rejects(asRole(role, "select * from public.consume_api_key($1,$2)", [hex(1), "corpus"]), /permission denied/);
    await assert.rejects(asRole(role, "select public.create_api_key($1,$2,$3,$4)", ["00000000-0000-0000-0000-000000000000", hex(1), "abcd", ""]), /permission denied/);
  }
  await assert.rejects(service("insert into public.api_keys (user_id, token_hash, hint) values (gen_random_uuid(), $1, 'abcd')", [hex(9)]), /permission denied/);
  await assert.rejects(service("update public.api_keys set token_hash = $1", [hex(9)]), /permission denied/);
  await assert.rejects(service("insert into public.api_key_usage values (current_date, gen_random_uuid(), 'corpus', 1)"), /permission denied/);
  await assert.rejects(service("select * from public.consume_api_key($1,$2)", [hex(1), "lore"]), /Invalid key or surface/);

  // The existing scopes keep their limits; the new api scope is 30 per IP with its own global bucket.
  const requests = await Promise.all(Array.from({ length: 220 }, () => service("select * from public.consume_intake_quota('request',$1)", [hex(2)])));
  assert.equal(requests.filter(([r]) => r.allowed).length, 200);
  const anon = await Promise.all(Array.from({ length: 45 }, () => consumeApi(3)));
  assert.equal(anon.filter((r) => r.allowed).length, 30);
  assert.ok(anon.filter((r) => !r.allowed).every((r) => r.retry_after >= 1 && r.retry_after <= 3600));
  assert.equal((await pool.query("select count from public.intake_quota_buckets where bucket='api_global'")).rows[0].count, 30);
  assert.equal((await pool.query("select count from public.intake_quota_buckets where bucket='global'")).rows[0].count, 200);
  await pool.query("update public.intake_quota_buckets set count=3000 where bucket='api_global'");
  assert.equal((await consumeApi(4)).allowed, false);
  assert.equal((await pool.query("select count(*)::int as n from public.intake_quota_buckets where bucket=$1", [`api:${hex(4)}`])).rows[0].n, 0);

  // Keys: at most five live per account, made atomically even under a race.
  const [{ id: userId }] = (await pool.query("insert into public.users (bnet_id, battletag) values ('1', 'Thrall#1') returning id")).rows;
  const made = await Promise.all(Array.from({ length: 8 }, (_, i) =>
    service("select public.create_api_key($1,$2,$3,$4) as id", [userId, hash(`evl_${hex(100 + i)}`), "abcd", `key ${i}`])));
  const live = made.filter(([r]) => r.id !== null);
  assert.equal(live.length, 5);
  const liveToken = `evl_${hex(100 + made.findIndex(([r]) => r.id !== null))}`;
  const deadToken = `evl_${hex(100 + made.findIndex(([r]) => r.id === null))}`;

  // A live key is admitted and counted per day and endpoint; an unknown key is refused without a key_ref.
  const first = await consumeKey(liveToken, "corpus");
  assert.equal(first.allowed, true);
  assert.ok(first.key_ref);
  await consumeKey(liveToken, "mcp");
  await consumeKey(liveToken, "mcp");
  const usage = (await service("select surface, count::int from public.api_key_usage where key_id=$1 order by surface", [first.key_ref]));
  assert.deepEqual(usage, [{ surface: "corpus", count: 1 }, { surface: "mcp", count: 2 }]);
  assert.ok((await service("select last_used_at from public.api_keys where id=$1", [first.key_ref]))[0].last_used_at);
  assert.deepEqual(await consumeKey(deadToken), { allowed: false, retry_after: 0, key_ref: null });

  // 2,000 requests per key per hour, across every endpoint.
  await pool.query("update public.intake_quota_buckets set count=1999 where bucket=$1", [`key:${first.key_ref}`]);
  assert.equal((await consumeKey(liveToken, "drops")).allowed, true);
  const over = await consumeKey(liveToken, "market");
  assert.equal(over.allowed, false);
  assert.ok(over.retry_after >= 1 && over.key_ref === first.key_ref);

  // Revoking stops the key at once and frees a slot for a new one.
  await service("update public.api_keys set revoked_at = now() where id = $1", [first.key_ref]);
  assert.deepEqual(await consumeKey(liveToken), { allowed: false, retry_after: 0, key_ref: null });
  assert.ok((await service("select public.create_api_key($1,$2,$3,$4) as id", [userId, hash(`evl_${hex(200)}`), "beef", ""]))[0].id);
  assert.equal((await service("select public.create_api_key($1,$2,$3,$4) as id", [userId, hash(`evl_${hex(201)}`), "beef", ""]))[0].id, null);

  // An expired key is refused too, and deleting the account deletes its keys and counts.
  await pool.query("update public.api_keys set expires_at = now() - interval '1 second' where revoked_at is null");
  assert.equal((await consumeKey(`evl_${hex(200)}`)).key_ref, null);
  await pool.query("delete from public.users where id = $1", [userId]);
  assert.equal((await pool.query("select count(*)::int as n from public.api_keys")).rows[0].n, 0);
  assert.equal((await pool.query("select count(*)::int as n from public.api_key_usage")).rows[0].n, 0);
  console.log("Data guard integration passed: re-runnable migration, private roles and RLS, api scope 30 per IP with its own global bucket, existing scopes unchanged, five keys per account under a race, per-key daily counts, 2,000 per key per hour, revoke, expiry and account deletion.");
} finally { await pool.end(); }
