import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

// Disposable local Postgres only. This fixture drops the public schema.
// QUOTA_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/intake_quota_test node scripts/api-key-expiry.integration.mjs
const url = new URL(process.env.QUOTA_TEST_DATABASE_URL);
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Local test database required");
assert.equal(url.pathname, "/intake_quota_test", "Dedicated test database required");
const pool = new pg.Pool({ connectionString: url.toString(), max: 8 });
const dir = new URL("../../supabase/migrations/", import.meta.url);
const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
const read = (file) => readFile(new URL(file, dir), "utf8");
const MIGRATION = "20261022120000_api_key_expiry.sql";
const hex = (n) => n.toString(16).padStart(64, "0");
const hash = (token) => createHash("sha256").update(token).digest("hex");
const token = (n) => `evl_${hex(n)}`;

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
const inDays = (days) => new Date(Date.now() + days * 86_400_000).toISOString();
const issue = async (user, n, fields = {}) => (await service(
  "select * from public.issue_api_key($1,$2,'abcd',$3,$4,$5,$6)",
  [user, hash(token(n)), fields.label ?? "Script", fields.purpose ?? "Drop rates for my guild", fields.scopes ?? ["read:public"], "expiresAt" in fields ? fields.expiresAt : inDays(90)],
))[0];
const consume = async (n) => (await service("select * from public.consume_api_key($1,'corpus')", [hash(token(n))]))[0];
const forKey = async (n) => (await service("select * from public.own_builds_for_key($1)", [hash(token(n))]))[0];
const keyRow = async (id) => (await service("select * from public.api_keys where id = $1", [id]))[0];

try {
  await pool.query("drop schema public cascade");
  await pool.query("create schema public");
  await pool.query("grant all on schema public to public");
  for (const role of ["anon", "authenticated", "service_role"]) {
    await pool.query(`DO $$ BEGIN IF NOT EXISTS (select from pg_roles where rolname='${role}') THEN CREATE ROLE ${role}; END IF; END $$`);
  }
  await pool.query("alter role service_role bypassrls");
  // Match Supabase's permissive defaults: the migrations must revoke them.
  await pool.query("alter default privileges in schema public grant execute on functions to anon, authenticated, service_role");
  await pool.query("alter default privileges in schema public grant all on tables to anon, authenticated, service_role");
  await pool.query("grant usage on schema public to anon, authenticated, service_role");
  for (const file of files.filter((f) => f !== MIGRATION)) await pool.query(await read(file));

  const [{ id: owner }] = (await pool.query("insert into public.users (bnet_id, battletag) values ('1', 'Thrall#1') returning id")).rows;
  const [{ id: other }] = (await pool.query("insert into public.users (bnet_id, battletag) values ('2', 'Jaina#2') returning id")).rows;
  // A key made before the migration, with no end date, keeps working through it.
  const before = (await service("select * from public.create_api_key($1,$2,'abcd','old bot')", [owner, hash(token(1))]))[0];
  assert.equal((await consume(1)).allowed, true);

  // Applied twice: safe to re-run.
  await pool.query(await read(MIGRATION));
  await pool.query(await read(MIGRATION));
  assert.equal((await consume(1)).allowed, true, "a key made before the migration still works");
  assert.equal((await keyRow(before.key_ref)).purpose, "");

  // Only the server's role may call the new functions; the helper is closed to everyone.
  for (const role of ["anon", "authenticated"]) {
    await assert.rejects(asRole(role, "select * from public.issue_api_key($1,$2,'abcd','x','y',array['read:public'],now() + interval '1 day')", [owner, hex(9)]), /permission denied/);
    await assert.rejects(asRole(role, "select * from public.roll_api_key($1,$2,$3,'abcd')", [owner, before.key_ref, hex(9)]), /permission denied/);
  }
  await assert.rejects(service("select public.api_key_room($1, true)", [owner]), /permission denied/);
  await assert.rejects(service("update public.api_keys set purpose = 'x'"), /permission denied/);
  for (const fn of ["issue_api_key", "roll_api_key", "api_key_room"]) {
    const [{ config, secdef }] = (await pool.query("select proconfig as config, prosecdef as secdef from pg_proc where proname = $1", [fn])).rows;
    assert.ok(secdef && config.includes('search_path=""'), `${fn} is security definer with an empty search_path`);
  }

  // Shape: name, purpose, scopes and end date are checked in the database too.
  await assert.rejects(issue(owner, 9, { label: "  " }), /Invalid name or purpose/);
  await assert.rejects(issue(owner, 9, { purpose: "" }), /Invalid name or purpose/);
  await assert.rejects(issue(owner, 9, { purpose: "x".repeat(201) }), /Invalid name or purpose/);
  await assert.rejects(issue(owner, 9, { scopes: [] }), /Invalid scopes/);
  await assert.rejects(issue(owner, 9, { scopes: ["write:all"] }), /api_keys_scopes_check/);
  await assert.rejects(issue(owner, 9, { expiresAt: inDays(-1) }), /Invalid expiry/);
  await assert.rejects(issue(owner, 9, { expiresAt: inDays(367) }), /Invalid expiry/);
  await assert.rejects(issue(owner, 9, { expiresAt: null }), /Invalid expiry/);

  // A key with a purpose and an end date works until then; past it, every key route refuses it.
  const made = await issue(owner, 2, { label: " Desktop ", purpose: " Builds in game ", scopes: ["read:public", "read:own", "read:own"], expiresAt: inDays(30) });
  assert.equal(made.refusal, null);
  const row = await keyRow(made.key_ref);
  assert.deepEqual([row.label, row.purpose, row.scopes], ["Desktop", "Builds in game", ["read:own", "read:public"]]);
  assert.equal((await consume(2)).allowed, true);
  assert.equal((await forKey(2)).refusal, null);
  await pool.query("update public.api_keys set expires_at = now() - interval '1 second' where id = $1", [made.key_ref]);
  assert.deepEqual(await consume(2), { allowed: false, retry_after: 0, key_ref: null }, "an expired key is refused by consume_api_key");
  assert.equal((await forKey(2)).refusal, "unknown_key", "an expired key is refused by own_builds_for_key");
  if ((await pool.query("select to_regprocedure('public.link_account_for_key(text)') as fn")).rows[0].fn) {
    assert.equal((await service("select * from public.link_account_for_key($1)", [hash(token(2))]))[0].refusal, "unknown_key");
  }

  // Rolling an expired key: a new secret, the same name, purpose and scopes, the same 30-day lifetime from now.
  await pool.query("update public.api_keys set created_at = now() - interval '31 days', expires_at = now() - interval '1 day' where id = $1", [made.key_ref]);
  const rolled = (await service("select * from public.roll_api_key($1,$2,$3,'beef')", [owner, made.key_ref, hash(token(3))]))[0];
  assert.equal(rolled.refusal, null);
  const next = await keyRow(rolled.key_ref);
  assert.deepEqual([next.label, next.purpose, next.scopes, next.hint], ["Desktop", "Builds in game", ["read:own", "read:public"], "beef"]);
  const lifetime = (new Date(next.expires_at) - new Date(next.created_at)) / 86_400_000;
  assert.ok(Math.abs(lifetime - 30) < 0.01, `rolled lifetime is 30 days, got ${lifetime}`);
  assert.equal(new Date(rolled.key_expires_at).getTime(), new Date(next.expires_at).getTime());
  assert.ok((await keyRow(made.key_ref)).revoked_at, "the old key is revoked");
  assert.equal((await consume(3)).allowed, true);
  assert.equal((await forKey(3)).refusal, null);
  // A key with no end date rolls to one with no end date; a revoked or another account's key cannot be rolled.
  const old = (await service("select * from public.roll_api_key($1,$2,$3,'abcd')", [owner, before.key_ref, hash(token(4))]))[0];
  assert.equal((await keyRow(old.key_ref)).expires_at, null);
  assert.equal((await consume(1)).key_ref, null, "the rolled secret stops at once");
  assert.equal((await service("select * from public.roll_api_key($1,$2,$3,'abcd')", [owner, before.key_ref, hash(token(5))]))[0].refusal, "not_found");
  assert.equal((await service("select * from public.roll_api_key($1,$2,$3,'abcd')", [other, rolled.key_ref, hash(token(5))]))[0].refusal, "not_found");

  // Limits shared with create_api_key: five live keys (expired ones do not count) and ten made a day.
  await pool.query("delete from public.intake_quota_buckets");
  const live = async (user) => Number((await pool.query("select count(*) from public.api_keys where user_id = $1 and revoked_at is null and (expires_at is null or expires_at > now())", [user])).rows[0].count);
  assert.equal(await live(owner), 2);
  for (let n = 10; n < 13; n++) assert.equal((await issue(owner, n)).refusal, null);
  assert.equal((await issue(owner, 13)).refusal, "live_limit");
  // Rolling a live key at the limit replaces it; rolling an expired one would add one, so it is refused.
  const [{ id: liveId }] = (await pool.query("select id from public.api_keys where token_hash = $1", [hash(token(10))])).rows;
  assert.equal((await service("select * from public.roll_api_key($1,$2,$3,'abcd')", [owner, liveId, hash(token(14))]))[0].refusal, null);
  await pool.query("update public.api_keys set expires_at = now() - interval '1 second' where token_hash = $1", [hash(token(11))]);
  assert.equal((await issue(owner, 15)).refusal, null, "an expired key frees a place");
  const [{ id: expiredId }] = (await pool.query("select id from public.api_keys where token_hash = $1", [hash(token(11))])).rows;
  assert.equal((await service("select * from public.roll_api_key($1,$2,$3,'abcd')", [owner, expiredId, hash(token(16))]))[0].refusal, "live_limit");
  await pool.query("insert into public.intake_quota_buckets values ($1, 10, now() + interval '1 day')", [`keys_made:${other}`]);
  assert.equal((await issue(other, 20)).refusal, "daily_limit");
  console.log("api key expiry integration: ok");
} finally {
  await pool.end();
}
