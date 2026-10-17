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
  const make = async (n, label = "") => (await service("select * from public.create_api_key($1,$2,$3,$4)", [userId, hash(`evl_${hex(n)}`), "abcd", label]))[0];
  const made = await Promise.all(Array.from({ length: 8 }, (_, i) => make(100 + i, `key ${i}`)));
  assert.equal(made.filter((r) => r.key_ref !== null).length, 5);
  assert.ok(made.filter((r) => r.key_ref === null).every((r) => r.refusal === "live_limit"));
  const liveToken = `evl_${hex(100 + made.findIndex((r) => r.key_ref !== null))}`;
  const deadToken = `evl_${hex(100 + made.findIndex((r) => r.key_ref === null))}`;

  // A live key is admitted and counted per day and endpoint; an unknown key is refused without a key_ref.
  const first = await consumeKey(liveToken, "corpus");
  assert.equal(first.allowed, true);
  assert.ok(first.key_ref);
  const firstUse = (await service("select last_used_at from public.api_keys where id=$1", [first.key_ref]))[0].last_used_at;
  assert.ok(firstUse);
  await consumeKey(liveToken, "mcp");
  await consumeKey(liveToken, "mcp");
  const usage = (await service("select surface, count::int from public.api_key_usage where key_id=$1 order by surface", [first.key_ref]));
  assert.deepEqual(usage, [{ surface: "corpus", count: 1 }, { surface: "mcp", count: 2 }]);
  // "Last used" is written at most once a minute.
  assert.equal((await service("select last_used_at from public.api_keys where id=$1", [first.key_ref]))[0].last_used_at.getTime(), firstUse.getTime());
  await pool.query("update public.api_keys set last_used_at = now() - interval '2 minutes' where id = $1", [first.key_ref]);
  await consumeKey(liveToken, "mcp");
  assert.ok((await service("select last_used_at from public.api_keys where id=$1", [first.key_ref]))[0].last_used_at > firstUse);
  assert.deepEqual(await consumeKey(deadToken), { allowed: false, retry_after: 0, key_ref: null });

  // A key without read:public reads nothing.
  const own = made.find((r) => r.key_ref !== null && r.key_ref !== first.key_ref).key_ref;
  const ownToken = `evl_${hex(100 + made.findIndex((r) => r.key_ref === own))}`;
  await pool.query("update public.api_keys set scopes = array['read:own'] where id = $1", [own]);
  assert.deepEqual(await consumeKey(ownToken), { allowed: false, retry_after: 0, key_ref: null });

  // 2,000 requests per hour per account, across all its keys and every endpoint.
  await pool.query("update public.intake_quota_buckets set count=1999 where bucket=$1", [`user:${userId}`]);
  assert.equal((await consumeKey(liveToken, "drops")).allowed, true);
  const over = await consumeKey(liveToken, "market");
  assert.equal(over.allowed, false);
  assert.ok(over.retry_after >= 1 && over.key_ref === first.key_ref);
  const sibling = `evl_${hex(100 + made.findIndex((r) => r.key_ref !== null && r.key_ref !== first.key_ref && r.key_ref !== own))}`;
  assert.equal((await consumeKey(sibling, "corpus")).allowed, false);

  // Revoking stops the key at once and frees a slot, but a fresh key does not bring a fresh allowance.
  await service("update public.api_keys set revoked_at = now() where id = $1", [first.key_ref]);
  assert.deepEqual(await consumeKey(liveToken), { allowed: false, retry_after: 0, key_ref: null });
  const fresh = await make(200);
  assert.ok(fresh.key_ref);
  assert.equal((await consumeKey(`evl_${hex(200)}`)).allowed, false);
  assert.equal((await make(201)).refusal, "live_limit");

  // Churn: at most ten keys made per day, however many are revoked or deleted in between.
  for (let n = 300; n < 310; n++) {
    await service("update public.api_keys set revoked_at = now() where user_id = $1 and revoked_at is null", [userId]);
    await service("delete from public.api_keys where user_id = $1 and revoked_at is not null", [userId]);
    const result = await make(n);
    if (result.key_ref === null) { assert.equal(result.refusal, "daily_limit"); break; }
  }
  assert.equal((await pool.query("select count from public.intake_quota_buckets where bucket=$1", [`keys_made:${userId}`])).rows[0].count, 10);
  await service("update public.api_keys set revoked_at = now() where user_id = $1 and revoked_at is null", [userId]);
  assert.equal((await make(400)).refusal, "daily_limit");
  await pool.query("update public.intake_quota_buckets set reset_at = now() - interval '1 second' where bucket=$1", [`keys_made:${userId}`]);
  assert.ok((await make(401)).key_ref);

  // Retention: counts older than 90 days, and keys revoked over 30 days ago, are pruned.
  const [{ id: oldKey }] = (await pool.query("insert into public.api_keys (user_id, token_hash, hint, revoked_at) values ($1, $2, 'beef', now() - interval '31 days') returning id", [userId, hex(500)])).rows;
  const [{ id: recentKey }] = (await pool.query("insert into public.api_keys (user_id, token_hash, hint, revoked_at) values ($1, $2, 'beef', now() - interval '29 days') returning id", [userId, hex(501)])).rows;
  await pool.query("insert into public.api_key_usage values (current_date - 91, $1, 'corpus', 5), (current_date - 89, $1, 'corpus', 5)", [recentKey]);
  await assert.rejects(asRole("anon", "select public.prune_api_keys()"), /permission denied/);
  await service("select public.prune_api_keys()");
  assert.equal((await pool.query("select count(*)::int as n from public.api_keys where id = $1", [oldKey])).rows[0].n, 0);
  assert.equal((await pool.query("select count(*)::int as n from public.api_keys where id = $1", [recentKey])).rows[0].n, 1);
  assert.deepEqual((await pool.query("select (current_date - day)::int as age from public.api_key_usage where key_id = $1", [recentKey])).rows, [{ age: 89 }]);

  // An expired key is refused too, and deleting the account deletes its keys and counts.
  await pool.query("update public.api_keys set expires_at = now() - interval '1 second' where revoked_at is null");
  assert.equal((await consumeKey(`evl_${hex(401)}`)).key_ref, null);
  await pool.query("delete from public.users where id = $1", [userId]);
  assert.equal((await pool.query("select count(*)::int as n from public.api_keys")).rows[0].n, 0);
  assert.equal((await pool.query("select count(*)::int as n from public.api_key_usage")).rows[0].n, 0);
  console.log("Data guard integration passed: re-runnable migration, private roles and RLS, api scope 30 per IP with its own global bucket, existing scopes unchanged, five live keys per account under a race, ten keys made per day despite revoke and delete, read:public required, per-key daily counts, last-used written once a minute, 2,000 per account per hour across keys, retention pruning, expiry and account deletion.");
} finally { await pool.end(); }
