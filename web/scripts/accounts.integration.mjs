import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

// Disposable local Postgres only. This fixture drops the public schema.
// QUOTA_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/intake_quota_test node scripts/accounts.integration.mjs
const url = new URL(process.env.QUOTA_TEST_DATABASE_URL);
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Local test database required");
assert.equal(url.pathname, "/intake_quota_test", "Dedicated test database required");
const pool = new pg.Pool({ connectionString: url.toString(), max: 4 });
const dir = new URL("../../supabase/migrations/", import.meta.url);
const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
const read = (file) => readFile(new URL(file, dir), "utf8");
const tables = ["users", "auth_session", "auth_account", "auth_verification", "auth_rate_limit"];

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

try {
  // Start from an empty schema so earlier fixtures' rows and tables cannot leak in.
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
  // Every migration in name order, then again: they must be safe to re-run. The uploads and
  // waitlist migration predates that rule (plain create table), so only its first run is applied.
  assert.ok(files.includes("20261003000000_auth_schema.sql"), "auth schema is a migration");
  const once = new Set(["20261004000000_uploads_waitlist.sql"]);
  await pool.query((await Promise.all(files.map(read))).join("\n"));
  await pool.query((await Promise.all(files.filter((file) => !once.has(file)).map(read))).join("\n"));
  const accountsSql = await read("20261020120000_accounts.sql");

  // A legacy row inserted the v1 way gets a name and a placeholder email from the trigger.
  const [{ id: legacy }] = (await pool.query("insert into public.users (bnet_id, battletag) values ('123', 'Thrall#1') returning id")).rows;
  const u = (await pool.query("select name, email, email_verified from public.users where id=$1", [legacy])).rows[0];
  assert.deepEqual(u, { name: "Thrall#1", email: "bnet-123@users.everloot.invalid", email_verified: false });
  // Re-applying the migration copies the Battle.net id into auth_account exactly once.
  await pool.query(accountsSql); await pool.query(accountsSql);
  const acc = (await pool.query("select user_id, account_id, provider_id, access_token from public.auth_account")).rows;
  assert.deepEqual(acc, [{ user_id: legacy, account_id: "123", provider_id: "battlenet", access_token: null }]);
  // A Better Auth-style insert (no bnet_id) is accepted and left alone by the trigger.
  await pool.query("insert into public.users (id, name, email) values (gen_random_uuid(), 'A', 'a@example.com')");
  assert.deepEqual((await pool.query("select name, email, flags, bnet_id, battletag from public.users where email='a@example.com'")).rows, [{ name: "A", email: "a@example.com", flags: {}, bnet_id: null, battletag: null }]);
  // Emails are unique.
  await assert.rejects(pool.query("insert into public.users (name, email) values ('B', 'a@example.com')"), /duplicate key/);
  // Deleting an account deletes its Better Auth rows.
  await pool.query("insert into public.auth_session (id, user_id, token, expires_at) values (gen_random_uuid(), $1, 't', now() + interval '1 day')", [legacy]);
  await pool.query("delete from public.users where id=$1", [legacy]);
  for (const t of ["auth_session", "auth_account"]) {
    assert.equal((await pool.query(`select count(*)::int as n from public.${t}`)).rows[0].n, 0);
  }
  // Browser roles cannot read any auth table; the service role can.
  for (const role of ["anon", "authenticated"]) for (const t of tables) {
    await assert.rejects(asRole(role, `select * from public.${t}`), /permission denied/);
  }
  for (const t of tables) await asRole("service_role", `select * from public.${t}`);
  await assert.rejects(asRole("anon", "select public.users_fill_identity()"), /permission denied/);
  console.log("Accounts integration passed: re-runnable migrations in name order, legacy rows filled by the trigger, Battle.net ids copied once, Better Auth inserts accepted, unique emails, cascading deletes, private auth tables.");
} finally { await pool.end(); }
