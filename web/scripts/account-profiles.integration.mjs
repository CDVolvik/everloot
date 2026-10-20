import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

// Disposable local Postgres only. This fixture drops the public schema.
// QUOTA_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/intake_quota_test node scripts/account-profiles.integration.mjs
const url = new URL(process.env.QUOTA_TEST_DATABASE_URL);
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Local test database required");
assert.equal(url.pathname, "/intake_quota_test", "Dedicated test database required");
const pool = new pg.Pool({ connectionString: url.toString(), max: 24 });
const dir = new URL("../../supabase/migrations/", import.meta.url);
const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
const read = (file) => readFile(new URL(file, dir), "utf8");
const MIGRATION = "20261021170000_account_profiles.sql";

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

const saveProfile = async (user, f = {}) => (await service(
  "select * from public.save_profile($1,$2,$3,$4,$5,$6,$7)",
  [user, f.handle ?? null, f.displayName ?? null, f.public ?? false, f.showCharacters ?? true, f.showBuilds ?? true, f.showStatus ?? true],
))[0].refusal;
const setStatus = (user, emoji, text, clearsAt = null) => service("select public.set_status($1,$2,$3,$4) as ok", [user, emoji, text, clearsAt]);
const setMain = async (user, id) => (await service("select public.set_main_character($1,$2) as ok", [user, id]))[0].ok;
const setActive = async (user, id) => (await service("select public.set_active_character($1,$2) as ok", [user, id]))[0].ok;
const profile = async (user) => (await pool.query("select * from public.user_profiles where user_id = $1", [user])).rows[0] ?? null;
const publicRead = async (handle) => (await service("select * from public.public_profile($1)", [handle]))[0] ?? null;
const character = async (user, name, classSlug = "mage") => (await service(
  "select * from public.save_build_character($1,null,$2,$3,'Pioneer','private note')", [user, name, classSlug],
))[0].character_ref;
let slugs = 0;
const build = async (user, name, shared = true) => (await service(
  "select * from public.save_build($1,null,$2,null,$3,null,'EL1-mage-0-1.60.1.70450-MTE6NQ',null,$4,null,null)",
  [user, `P${String(++slugs).padStart(7, "0")}`, name, shared],
))[0];

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
  // Without the saved builds tables the migration stops before changing anything.
  await pool.query(await read("20261003000000_auth_schema.sql"));
  await assert.rejects(pool.query(await read(MIGRATION)), /Apply 20261021150000_saved_builds.sql first/);
  assert.equal((await pool.query("select to_regclass('public.user_profiles') as t")).rows[0].t, null);
  for (const file of files) await pool.query(await read(file));
  // Applied twice: the new migration must be safe to re-run.
  await pool.query(await read(MIGRATION));

  const [{ id: owner }] = (await pool.query("insert into public.users (bnet_id, battletag) values ('1', 'Thrall#1234') returning id")).rows;
  const [{ id: other }] = (await pool.query("insert into public.users (bnet_id, battletag) values ('2', 'Jaina#2') returning id")).rows;

  // Browser roles can touch nothing; the service role reads but writes only through the functions.
  for (const role of ["anon", "authenticated"]) {
    await assert.rejects(asRole(role, "select * from public.user_profiles"), /permission denied/);
    await assert.rejects(asRole(role, "select * from public.public_profile('thrall')"), /permission denied/);
    await assert.rejects(asRole(role, "select * from public.save_profile($1,'x1x',null,false,true,true,true)", [owner]), /permission denied/);
    await assert.rejects(asRole(role, "select public.set_status($1,null,'hi',null)", [owner]), /permission denied/);
    await assert.rejects(asRole(role, "select public.set_active_character($1,null)", [owner]), /permission denied/);
  }
  await assert.rejects(service("insert into public.user_profiles (user_id) values ($1)", [owner]), /permission denied/);
  await assert.rejects(service("update public.user_profiles set public_profile = true"), /permission denied/);
  await assert.rejects(service("select public.take_handle_change($1)", [owner]), /permission denied/);

  // Handle shape: 3-24 letters, numbers and hyphens, not at either end; stored lower case.
  for (const bad of ["ab", "x".repeat(25), "-thrall", "thrall-", "thr all", "thrall_1", "thrâll"]) {
    await assert.rejects(saveProfile(owner, { handle: bad }), /Invalid profile/, bad);
  }
  await assert.rejects(saveProfile(owner, { displayName: "x".repeat(41) }), /Invalid profile/);
  assert.equal(await saveProfile(owner, { handle: "  Thrall-1 ", displayName: "  Go'el " }), null);
  let row = await profile(owner);
  assert.deepEqual([row.handle, row.display_name, row.public_profile, row.show_characters], ["thrall-1", "Go'el", false, true]);
  // Reserved, taken (any case), and public without a handle.
  assert.equal(await saveProfile(other, { handle: "Admin" }), "handle_reserved");
  assert.equal(await saveProfile(other, { handle: "settings" }), "handle_reserved");
  assert.equal(await saveProfile(other, { handle: "THRALL-1" }), "handle_taken");
  assert.equal(await saveProfile(other, { public: true }), "needs_handle");
  assert.equal(await profile(other), null, "a refusal writes nothing");
  // Saving again with the same handle is not a change.
  for (let i = 0; i < 6; i++) assert.equal(await saveProfile(owner, { handle: "thrall-1", public: i % 2 === 0 }), null);
  // Five changes a day; a sixth is refused and the handle stays.
  for (const h of ["a-1", "a-2", "a-3", "a-4"]) assert.equal(await saveProfile(owner, { handle: h }), null);
  assert.equal(await saveProfile(owner, { handle: "a-5" }), "handle_limit");
  assert.equal((await profile(owner)).handle, "a-4");
  await pool.query("update public.intake_quota_buckets set reset_at = now() - interval '1 second' where bucket = $1", [`handle:${owner}`]);
  assert.equal(await saveProfile(owner, { handle: "thrall" }), null);
  // Two accounts racing for one handle: one gets it, the other is told it is taken.
  const [{ id: third }] = (await pool.query("insert into public.users (bnet_id, battletag) values ('3', 'Rexxar#3') returning id")).rows;
  const race = await Promise.all([saveProfile(other, { handle: "rexxar" }), saveProfile(third, { handle: "rexxar" })]);
  assert.deepEqual(race.slice().sort((a, b) => String(a).localeCompare(String(b))), ["handle_taken", null]);

  // Status: one emoji up to 16 bytes, text up to 80, a clear-after within 8 days; empty clears it.
  await setStatus(owner, "👩‍💻", "Raiding tonight");
  row = await profile(owner);
  assert.deepEqual([row.status_emoji, row.status_text, row.status_clears_at], ["👩‍💻", "Raiding tonight", null]);
  await setStatus(owner, "🇵🇷", null, new Date(Date.now() + 30 * 60_000).toISOString());
  assert.equal((await profile(owner)).status_emoji, "🇵🇷");
  await assert.rejects(setStatus(owner, "🧑‍🤝‍🧑🧑‍🤝‍🧑", "x"), /Invalid status/);
  await assert.rejects(setStatus(owner, "a b", "x"), /Invalid status/);
  await assert.rejects(setStatus(owner, null, "x".repeat(81)), /Invalid status/);
  await assert.rejects(setStatus(owner, null, "x", new Date(Date.now() - 1000).toISOString()), /Invalid status/);
  await assert.rejects(setStatus(owner, null, "x", new Date(Date.now() + 9 * 86_400_000).toISOString()), /Invalid status/);
  await setStatus(owner, " ", " ", new Date(Date.now() + 60_000).toISOString());
  row = await profile(owner);
  assert.deepEqual([row.status_emoji, row.status_text, row.status_clears_at], [null, null, null]);
  // A first status makes the row with every default.
  await setStatus(third, null, "New here");
  assert.deepEqual([(await profile(third)).status_text, (await profile(third)).public_profile], ["New here", false]);

  // Main and active character: the owner's only; deleting the character clears both.
  const jaina = await character(owner, "Jaina");
  const thrall = await character(owner, "Thrall", "warrior");
  const theirs = await character(other, "Sylvanas", "hunter");
  assert.equal(await setMain(owner, theirs), false);
  assert.equal(await setActive(owner, theirs), false);
  assert.equal(await setMain(owner, jaina), true);
  assert.equal(await setActive(owner, thrall), true);
  row = await profile(owner);
  assert.deepEqual([row.main_character_id, row.active_character_id], [jaina, thrall]);
  assert.equal(await setActive(owner, null), true);
  assert.equal((await profile(owner)).active_character_id, null);
  await setActive(owner, thrall);
  await service("select public.delete_build_character($1,$2)", [owner, thrall]);
  assert.equal((await profile(owner)).active_character_id, null);
  assert.equal((await profile(owner)).main_character_id, jaina);
  assert.equal(await setMain(owner, "00000000-0000-4000-8000-000000000000"), false);

  // The public read: nothing until public; then only what is ticked; never the BattleTag, a note or an unshared build.
  await build(owner, "Fire");
  await build(owner, "Secret frost", false);
  assert.equal(await publicRead("thrall"), null, "not public yet");
  assert.equal(await saveProfile(owner, { handle: "thrall", public: true }), null);
  await setStatus(owner, "🔥", "Farming Molten Core");
  const open = await publicRead("THRALL");
  assert.equal(open.handle, "thrall");
  assert.deepEqual([open.status_emoji, open.status_text], ["🔥", "Farming Molten Core"]);
  assert.deepEqual(open.characters, [{ name: "Jaina", class_slug: "mage", realm: "Pioneer", main: true }]);
  assert.deepEqual(open.builds.map((b) => b.name), ["Fire"]);
  const text = JSON.stringify(open);
  for (const hidden of ["Thrall#1234", "private note", "Secret frost", owner]) assert.ok(!text.includes(hidden), hidden);
  assert.equal(await saveProfile(owner, { handle: "thrall", public: true, showCharacters: false, showBuilds: false, showStatus: false }), null);
  const bare = await publicRead("thrall");
  assert.deepEqual([bare.characters, bare.builds, bare.status_text, bare.status_emoji], [null, null, null, null]);
  // An expired status reads as none.
  await saveProfile(owner, { handle: "thrall", public: true });
  await pool.query("update public.user_profiles set status_clears_at = now() - interval '1 second' where user_id = $1", [owner]);
  assert.equal((await publicRead("thrall")).status_text, null);
  // Unknown, malformed or turned off: no row. A handle cannot be dropped while public.
  assert.equal(await publicRead("nobody"), null);
  assert.equal(await publicRead("th%"), null);
  assert.equal(await saveProfile(owner, { handle: null, public: true }), "needs_handle");
  assert.equal(await saveProfile(owner, { handle: "thrall", public: false }), null);
  assert.equal(await publicRead("thrall"), null);

  // Deleting the account deletes its profile.
  await pool.query("delete from public.users where id = $1", [owner]);
  assert.equal(await profile(owner), null);
  console.log("account profiles integration: ok");
} finally {
  await pool.end();
}
