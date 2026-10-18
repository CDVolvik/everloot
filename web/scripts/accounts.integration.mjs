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
  assert.ok(["service_role", "anon", "authenticated", "everloot_auth"].includes(role));
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
  // Migrations must be safe to re-run. The uploads and waitlist migration predates that rule
  // (plain create table), so only its first run is applied.
  assert.ok(files.includes("20261003000000_auth_schema.sql"), "auth schema is a migration");
  const once = new Set(["20261004000000_uploads_waitlist.sql"]);
  const accountsFile = "20261020120000_accounts.sql";
  const accountsSql = await read(accountsFile);

  // Production upgrade: users exist before the columns do. Apply everything up to the accounts
  // migration, add a v1 user, then apply it; the backfill must fill name and email.
  await pool.query((await Promise.all(files.filter((file) => file < accountsFile).map(read))).join("\n"));
  const [{ id: existing }] = (await pool.query("insert into public.users (bnet_id, battletag) values ('456', 'Garrosh#1') returning id")).rows;
  assert.ok(!Object.keys((await pool.query("select * from public.users")).rows[0]).includes("email"), "columns do not exist yet");
  await pool.query(accountsSql);
  assert.deepEqual((await pool.query("select name, email, email_verified from public.users where id=$1", [existing])).rows[0], { name: "Garrosh#1", email: "bnet-456@users.everloot.invalid", email_verified: false });
  assert.deepEqual((await pool.query("select account_id, provider_id from public.auth_account where user_id=$1", [existing])).rows, [{ account_id: "456", provider_id: "battlenet" }]);
  // Then every migration again, in name order: they must be safe to re-run.
  await pool.query((await Promise.all(files.filter((file) => !once.has(file)).map(read))).join("\n"));

  // A legacy row inserted the v1 way gets a name and a placeholder email from the trigger.
  const [{ id: legacy }] = (await pool.query("insert into public.users (bnet_id, battletag) values ('123', 'Thrall#1') returning id")).rows;
  const u = (await pool.query("select name, email, email_verified from public.users where id=$1", [legacy])).rows[0];
  assert.deepEqual(u, { name: "Thrall#1", email: "bnet-123@users.everloot.invalid", email_verified: false });
  // Re-applying the migration copies the Battle.net id into auth_account exactly once.
  await pool.query(accountsSql); await pool.query(accountsSql);
  const acc = (await pool.query("select user_id, account_id, provider_id, access_token from public.auth_account")).rows;
  assert.deepEqual(acc.filter((row) => row.user_id === legacy), [{ user_id: legacy, account_id: "123", provider_id: "battlenet", access_token: null }]);
  assert.equal(acc.length, 2);
  // A v1 sign-in after the migration gets its Battle.net account row at once, so v2 never has to
  // link by (unverified) email; v1's repeat upsert takes the update path and adds nothing.
  const v1Upsert = "insert into public.users (bnet_id, battletag) values ('789', $1) on conflict (bnet_id) do update set battletag = excluded.battletag returning id";
  // As service_role, like v1's PostgREST call: the trigger runs with the inserter's rights.
  const [{ id: jaina }] = await asRole("service_role", v1Upsert, ["Jaina#2"]);
  await asRole("service_role", v1Upsert, ["Jaina#3"]);
  assert.deepEqual((await pool.query("select user_id, account_id, provider_id from public.auth_account where account_id='789'")).rows,
    [{ user_id: jaina, account_id: "789", provider_id: "battlenet" }]);
  await assert.rejects(asRole("anon", "select public.users_battlenet_account()"), /permission denied/);
  // A Better Auth-style insert (no bnet_id) is accepted and left alone by the trigger.
  await pool.query("insert into public.users (id, name, email) values (gen_random_uuid(), 'A', 'a@example.com')");
  assert.deepEqual((await pool.query("select name, email, flags, bnet_id, battletag from public.users where email='a@example.com'")).rows, [{ name: "A", email: "a@example.com", flags: {}, bnet_id: null, battletag: null }]);
  // Emails are unique.
  await assert.rejects(pool.query("insert into public.users (name, email) values ('B', 'a@example.com')"), /duplicate key/);
  // Deleting an account deletes its Better Auth rows.
  await pool.query("insert into public.auth_session (id, user_id, token, expires_at) values (gen_random_uuid(), $1, 't', now() + interval '1 day')", [legacy]);
  await pool.query("delete from public.users where id=$1", [legacy]);
  for (const t of ["auth_session", "auth_account"]) {
    assert.equal((await pool.query(`select count(*)::int as n from public.${t} where user_id=$1`, [legacy])).rows[0].n, 0);
  }
  // Browser roles cannot read any auth table; the service role can.
  for (const role of ["anon", "authenticated"]) for (const t of tables) {
    await assert.rejects(asRole(role, `select * from public.${t}`), /permission denied/);
  }
  for (const t of tables) await asRole("service_role", `select * from public.${t}`);
  // Better Auth's role (its login is the owner's step; roles outlive this schema): no BYPASSRLS, and
  // RLS policies that let it read and write its five tables, and nothing else.
  assert.deepEqual((await pool.query("select rolbypassrls, rolsuper from pg_roles where rolname='everloot_auth'")).rows,
    [{ rolbypassrls: false, rolsuper: false }]);
  for (const t of tables) await asRole("everloot_auth", `select * from public.${t}`);
  await assert.rejects(asRole("everloot_auth", "select * from public.sessions"), /permission denied/);
  const [{ id: thrall }] = await asRole("everloot_auth", "insert into public.users (id, name, email) values (gen_random_uuid(), 'Thrall#9', 'bnet-999@users.everloot.invalid') returning id");
  assert.equal((await asRole("everloot_auth", "select count(*)::int as n from public.users")).at(0).n, (await pool.query("select count(*)::int as n from public.users")).rows[0].n);
  // Its Battle.net account row fills bnet_id and battletag in the same statement, so v1 finds it.
  await asRole("everloot_auth", "insert into public.auth_account (id, user_id, account_id, provider_id) values (gen_random_uuid(), $1, '999', 'battlenet')", [thrall]);
  assert.deepEqual((await pool.query("select bnet_id, battletag from public.users where id=$1", [thrall])).rows, [{ bnet_id: "999", battletag: "Thrall#9" }]);
  // ...and a v1 sign-in for that Battle.net id now updates the same user instead of adding one.
  const [{ id: again }] = await asRole("service_role", v1Upsert.replace("'789'", "'999'"), ["Thrall#9"]);
  assert.equal(again, thrall);
  assert.equal((await pool.query("select count(*)::int as n from public.auth_account where account_id='999'")).rows[0].n, 1);
  // Provider tokens, addresses and user agents are refused by the database itself.
  await assert.rejects(asRole("everloot_auth", "update public.auth_account set refresh_token='rt' where user_id=$1", [thrall]), /auth_account_no_provider_tokens/);
  await assert.rejects(asRole("everloot_auth", "insert into public.auth_session (id, user_id, token, expires_at, user_agent) values (gen_random_uuid(), $1, 'u', now() + interval '1 day', 'ua')", [thrall]), /auth_session_no_client_details/);
  await asRole("everloot_auth", "insert into public.auth_rate_limit (key, count, last_request) values ('k', 1, 0)");
  await asRole("everloot_auth", "delete from public.auth_rate_limit where key='k'");
  await assert.rejects(asRole("anon", "select public.users_fill_identity()"), /permission denied/);
  console.log("Accounts integration passed: re-runnable migrations in name order, existing users backfilled on upgrade, legacy inserts filled by the trigger, Battle.net ids copied once, v1 sign-ins get their account row once, Better Auth inserts accepted, unique emails, cascading deletes, private auth tables, everloot_auth reads and writes its tables under RLS, Better Auth users get their bnet_id, tokens and addresses refused.");
} finally { await pool.end(); }
