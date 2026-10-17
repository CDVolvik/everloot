import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { auditSources } from "./audit-sources.js";
import { BlizzardClient } from "./blizzard/client.js";
import { checkBuilds, loadRegistry, recordBuilds, saveRegistry, versionsUrl } from "./builds.js";
import { diffSnapshots } from "./client-diff.js";
import { CASC_LIBRARY, extractTables, iconIds, NOT_IN_BUILD, openCdn, pinDefinitions, probeFiles } from "./client-extract.js";
import { writeCatalogs } from "./client-catalog.js";
import { writeWorldMapData } from "./world-map-data.js";
import { clientSnapshotName, writeClientSnapshot } from "./client-snapshot.js";
import { diffRaidBuffs, RaidBuffTable } from "./raid-buffs.js";
import { parseArgs } from "./args.js";
import { buildWatchCommand } from "./build-watch/command.js";
import type { Game, NsKind, Region } from "./blizzard/namespaces.js";
import { openDb, openExistingReadOnlyDb, type DB } from "./db.js";
import { importCurated } from "./importers/curated.js";
import { importWikiDump } from "./importers/wiki-dump.js";
import { startHttpBridge } from "./mcp-http.js";
import { serveStdio } from "./mcp-server.js";
import { openPublicSnapshot } from "./public-snapshot.js";
import { search } from "./search.js";
import { snapshot } from "./snapshot.js";
import { validate } from "./validate.js";

const GAMES: Game[] = ["retail", "classic", "classic1x", "forever"];
const KINDS: NsKind[] = ["static", "dynamic", "profile"];
const REGIONS: Region[] = ["us", "eu", "kr", "tw"];

const USAGE = `usage: npm run kb -- <command> --db <path>
  import-wiki <dump.xml|dump.xml.zst> [--limit N]   (reads the dump twice; --limit still costs one full pass;
    a limited import REPLACES all wiki rows in the target DB — use --db <scratch> for trials)
  import-curated [dir=curated]
  blizzard-get <data/wow/...|profile/wow/...> --game retail|classic|classic1x|forever --kind static|dynamic|profile [--region us]
    (path has no leading slash; works unchanged in Git Bash and PowerShell)
  search <words...> --db <existing knowledge base>
  serve-mcp --db <public release>        (stdio MCP: everloot-knowledge)
  serve-mcp-http --db <public release> [--port N]   (loopback HTTP MCP on 127.0.0.1:8787, POST /mcp;
    --token or EVERLOOT_MCP_TOKEN; a bearer token is transport auth, not proof of client compatibility)
  stats --db <existing knowledge base>
  validate --db <existing knowledge base>   (documented diagnostic: it WRITES the fts5 index, so never
    run it against a public release you are serving)
  snapshot <out.sqlite> --db <source knowledge base>   (writes a filtered public release + manifest,
    outside the database's own folder, e.g. data/release/kb.sqlite)
  builds-check [--product wow_classic_beta,wow_classic_era] [--registry data/builds.json]
    (asks Blizzard's public version service which builds exist; records new ones as queued.
    Reads build identifiers only, never game files)
  client-extract [--product wow_classic_beta] [--registry data/builds.json] [--out data/client] [--refresh]
    (reads items, spells, talent (Trait) and spell effect tables of the product's current build from Blizzard's CDN into a snapshot
    <out>/<product>-<build>-<buildconfig, 8 chars>.sqlite + manifest, and marks the build processed.
    A table that fails to read is reported, the rest are still written, the build stays queued and
    the exit is 1. Encrypted blocks are skipped, never decrypted. A build already extracted is skipped
    unless --refresh is given. Table layouts come from one pinned WoWDBDefs commit, recorded in the
    snapshot. Not for publication without review: see docs/DATA_POLICY.md)
  client-catalog <snapshot.sqlite> [--out data/catalog] [--list lists/raid-buffs.yaml]
    (writes <out>/<product>-<build>-<config>/talents/<class>.json, talents/index.json and raid-buffs.json
    from a snapshot, stamped with the build and labelled "found in game files, unconfirmed". See
    docs/TALENT_CATALOG.md. Not for publication)
  raid-buffs-diff <old/raid-buffs.json> <new/raid-buffs.json>   (entries whose scope changed between builds)
  client-diff <old.sqlite> <new.sqlite> [--out diff.json]   (field-level diff of two snapshots)
  client-map <snapshot.sqlite> [--out ../web/src/data/game-data/map.json]
    (zone rectangles in world coordinates, continents and dungeon and raid entrances from a client
    snapshot, for the world map page. Game file data, stamped with the build. See docs/DATA_POLICY.md)
  build-watch [--product id] [--dry-run] [--check] [--redo] [--force] [--root ..] [--out data/build-watch/out]
    (notices a new game build, regenerates the committed game data and prepares a pull request body and
    a changelog entry; the scheduled workflow opens the PR. --dry-run writes only under --out and changes
    nothing else. --check only says whether there is work. See docs/BUILD_WATCH.md)
  audit-sources <file.sqlite...>   (rows per source and cached API rows in each file; exits 1 if anything
    is not publishable)

  A source database and a public release are different artifacts. The serve commands accept only a
  release: an existing file plus its <release>.manifest.json, opened read-only and checked against
  that manifest. Importers may still default to data/everloot-kb.sqlite; the read, validate,
  snapshot and serve commands above never guess a path, and validate/snapshot refuse a missing file.

  Run through node directly if a wrapper eats the flag:
    node ./node_modules/tsx/dist/cli.mjs src/cli.ts stats --db data/wowvault-kb.sqlite`;

/** Commands that answer questions require an explicit path: there is no default knowledge base. */
function requireDbPath(flags: Map<string, string>, command: string): string {
  const path = flags.get("db")?.trim();
  if (!path) throw new Error(`${command} needs an explicit --db path; no default knowledge database is used`);
  return path;
}

/** Diagnostic and export commands read a source database; opening a typo would create an empty one. */
function requireExistingDbPath(flags: Map<string, string>, command: string): string {
  const path = requireDbPath(flags, command);
  if (!existsSync(path)) throw new Error(`${command}: ${path} does not exist; nothing was created`);
  return path;
}

/** Release handles are opened before anything listens, and closed when the process is stopped. */
function closeOnExit(db: DB): void {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      try {
        db.close();
      } catch {
        // already closed
      }
      process.exit(0);
    });
  }
}

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);
  const { flags, args } = parseArgs(rest);
  if (existsSync(".env")) process.loadEnvFile(".env");
  let opened: DB | undefined;
  const db = () => (opened ??= openDb(flags.get("db") ?? "data/everloot-kb.sqlite"));

  switch (cmd) {
    case "import-wiki": {
      if (!args[0]) break;
      let limit: number | undefined;
      if (flags.has("limit")) {
        const raw = flags.get("limit")!;
        const n = Number(raw);
        if (!Number.isInteger(n) || n <= 0) {
          console.error(`invalid --limit "${raw}"; expected a positive whole number`);
          return 1;
        }
        limit = n;
      }
      const { stored, skipped, dropped } = await importWikiDump(db(), args[0], {
        limit,
        onProgress: ({ pass, blocks }) => console.error(`pass ${pass}: ${blocks.toLocaleString("en-US")} blocks…`),
      });
      db().pragma("wal_checkpoint(TRUNCATE)");
      console.log(
        `imported ${stored} lore pages (${skipped} skipped: wikitext unreadable or empty after conversion; ` +
          `dropped ${dropped.redirect} redirects, ${dropped.namespace} other-namespace, ${dropped.empty} empty)`,
      );
      return 0;
    }
    case "import-curated":
      console.log(`imported ${await importCurated(db(), args[0] ?? "curated")} curated entries`);
      return 0;
    case "blizzard-get": {
      if (!args[0]) break;
      const game = flags.get("game") ?? "retail";
      const kind = flags.get("kind") ?? "static";
      const region = flags.get("region") ?? "us";
      if (!GAMES.includes(game as Game)) {
        console.error(`invalid --game "${game}"; expected one of: ${GAMES.join(", ")}`);
        return 1;
      }
      if (!KINDS.includes(kind as NsKind)) {
        console.error(`invalid --kind "${kind}"; expected one of: ${KINDS.join(", ")}`);
        return 1;
      }
      if (!REGIONS.includes(region as Region)) {
        console.error(`invalid --region "${region}"; expected one of: ${REGIONS.join(", ")}`);
        return 1;
      }
      let path = args[0];
      if (!path.startsWith("/")) path = `/${path}`;
      if (!path.startsWith("/data/wow/") && !path.startsWith("/profile/wow/")) {
        console.error(`invalid path "${path}": must start with data/wow/ or profile/wow/ (omit the leading slash in Git Bash)`);
        return 1;
      }
      const { BLIZZARD_CLIENT_ID: id, BLIZZARD_CLIENT_SECRET: secret } = process.env;
      if (!id || !secret) {
        console.error("needs BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET in kb/.env");
        return 1;
      }
      const client = new BlizzardClient(db(), { clientId: id, clientSecret: secret, region: region as Region });
      const body = await client.get(path, game as Game, kind as NsKind);
      console.log(JSON.stringify(body, null, 2));
      return 0;
    }
    case "search":
      for (const h of search(openExistingReadOnlyDb(requireDbPath(flags, "search")), args.join(" ")))
        console.log(`${h.kind}  ${h.name}\n  ${h.snippet}\n  ${h.sourceUrl} (${h.licence})`);
      return 0;
    case "serve-mcp": {
      const release = openPublicSnapshot(requireDbPath(flags, "serve-mcp"));
      closeOnExit(release.db);
      await serveStdio(release.db);
      return 0;
    }
    case "serve-mcp-http": {
      const release = openPublicSnapshot(requireDbPath(flags, "serve-mcp-http"));
      const port = Number(flags.get("port") ?? 8787);
      const token = flags.get("token") || process.env.EVERLOOT_MCP_TOKEN;
      const http = await startHttpBridge(release.db, port, token ? { token } : {});
      closeOnExit(release.db);
      const addr = http.address();
      const bound = typeof addr === "object" && addr ? addr.port : port;
      console.log(
        `everloot-knowledge HTTP MCP on http://127.0.0.1:${bound}/mcp (${token ? "bearer required" : "open on loopback"})`,
      );
      await new Promise<never>(() => {});
    }
    case "stats":
      console.table(
        openExistingReadOnlyDb(requireDbPath(flags, "stats")).prepare(
          "SELECT source_id, kind, count(*) AS rows FROM entities GROUP BY source_id, kind",
        ).all(),
      );
      return 0;
    case "validate": {
      // Documented diagnostic, deliberately writable: validate rebuilds the fts5 index, so it must
      // never be pointed at a public release.
      const source = openDb(requireExistingDbPath(flags, "validate"));
      const { rows } = source.prepare("SELECT count(*) AS rows FROM entities").get() as { rows: number };
      // A structurally valid empty file is not a ready knowledge base.
      const problems = rows === 0 ? ["no entities: the knowledge base is empty"] : validate(source);
      console.log(problems.length === 0 ? "ok" : problems.join("\n"));
      return problems.length === 0 ? 0 : 1;
    }
    case "builds-check": {
      const products = (flags.get("product") || "wow_classic_beta,wow_classic_era").split(",").map((p) => p.trim()).filter(Boolean);
      const path = flags.get("registry") || "data/builds.json";
      const result = await checkBuilds(loadRegistry(path), products, async (product) => {
        const res = await fetch(versionsUrl(product), { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      }, new Date());
      saveRegistry(path, result.registry);
      for (const b of result.added) console.log(`new build: ${b.product} ${b.version} (${b.buildConfig}) [${b.regions.join(" ")}]`);
      for (const e of result.errors) console.error(`${e.product}: ${e.error}`);
      console.log(`${result.added.length} new, ${result.registry.builds.length} known; registry ${path}`);
      return result.errors.length ? 1 : 0;
    }
    case "client-extract": {
      const product = flags.get("product") || "wow_classic_beta";
      const path = flags.get("registry") || "data/builds.json";
      const outDir = flags.get("out") || "data/client";
      const now = new Date();
      const { build, source } = await openCdn(product);
      const out = join(outDir, clientSnapshotName(build));
      let registry = loadRegistry(path);
      const key = `${product}:${build.buildConfig}`;
      if (!registry.builds.some((b) => b.key === key)) {
        registry = recordBuilds(registry, product, { seqn: null, rows: [{ region: "us", buildConfig: build.buildConfig, cdnConfig: "", buildId: build.buildId, version: build.version, productConfig: "" }] }, now).registry;
      }
      if (!["", "yes", "true"].includes(flags.get("refresh") ?? "no") &&registry.builds.find((b) => b.key === key)?.status === "processed" && existsSync(out)) {
        console.log(`${product} ${build.version} is already extracted: ${out}`);
        return 0;
      }
      // Every layout the library reads for this run comes from this one WoWDBDefs commit (null: GitHub was unreachable, so it reads master).
      const definitions = await pinDefinitions();
      const { tables, missing } = await extractTables(source);
      const fileStatus = probeFiles(source, iconIds(tables));
      if (fileStatus) tables.push(fileStatus);
      mkdirSync(outDir, { recursive: true });
      const manifest = writeClientSnapshot(out, { ...build, extractedAt: now.toISOString(), library: CASC_LIBRARY, definitions }, tables);
      // A table that failed to read leaves the build queued, so the next run tries it again.
      const failed = missing.filter((m) => m.reason !== NOT_IN_BUILD);
      if (!failed.length) {
        registry = { builds: registry.builds.map((b) => (b.key === key ? { ...b, status: "processed" as const } : b)) };
      }
      saveRegistry(path, registry);
      for (const t of manifest.tables) console.log(`${t.table}: ${t.rows} rows${t.encryptedBlocks ? `, ${t.encryptedBlocks} encrypted blocks skipped` : ""}`);
      for (const m of missing) (m.reason === NOT_IN_BUILD ? console.log : console.error)(`${m.table}: ${m.reason}`);
      console.log(`${product} ${build.version} -> ${out} (sha256 ${manifest.sha256.slice(0, 12)})`);
      return failed.length ? 1 : 0;
    }
    case "client-diff": {
      if (args.length < 2) break;
      const diff = diffSnapshots(args[0], args[1]);
      const out = flags.get("out");
      if (out) writeFileSync(out, `${JSON.stringify(diff, null, 2)}
`);
      console.log(`${diff.from.product} ${diff.from.version} -> ${diff.to.product} ${diff.to.version}${diff.crossProduct ? " (different products)" : ""}`);
      for (const t of diff.tables) console.log(`${t.table}: ${t.added.length} added, ${t.removed.length} removed, ${t.changed.length} changed`);
      for (const w of diff.warnings) console.log(`warning: ${w}`);
      return 0;
    }
    case "client-catalog": {
      if (!args[0]) break;
      const run = writeCatalogs(args[0], flags.get("out") || "data/catalog", flags.get("list") || "lists/raid-buffs.yaml");
      for (const c of run.index.classes) console.log(`${c.className ?? c.classId}: ${c.trees} trees, ${c.nodes} nodes`);
      for (const t of run.index.tables) console.log(`${t.table}: ${t.rows} rows${t.encryptedBlocks ? `, ${t.encryptedBlocks} encrypted blocks skipped` : ""}`);
      for (const w of run.index.warnings) console.log(`warning: ${w}`);
      if (run.raidBuffs.notFound.length) console.log(`raid buffs not found: ${run.raidBuffs.notFound.join(", ")}`);
      console.log(`-> ${run.dir}`);
      return 0;
    }
    case "client-map": {
      if (!args[0]) break;
      const data = writeWorldMapData(args[0]);
      const out = flags.get("out") || "../web/src/data/game-data/map.json";
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, `${JSON.stringify(data, null, 2)}
`);
      for (const t of data.source.tables) console.log(`${t.table}: ${t.rows} rows${t.encryptedBlocks ? `, ${t.encryptedBlocks} encrypted blocks skipped` : ""}`);
      for (const w of data.warnings) console.log(`warning: ${w}`);
      console.log(`${data.continents.length} continents, ${data.zones.length} zones, ${data.entrances.length} entrances -> ${out}`);
      return 0;
    }
    case "raid-buffs-diff": {
      if (args.length < 2) break;
      const [a, b] = args.map((p) => RaidBuffTable.parse(JSON.parse(readFileSync(p, "utf8"))));
      console.log(`${a.build.product} ${a.build.version} -> ${b.build.product} ${b.build.version}`);
      const changes = diffRaidBuffs(a, b);
      for (const c of changes) {
        console.log(`${c.label}: ${c.before ?? "none"} -> ${c.after ?? "none"}`);
        if (c.before === c.after) console.log(`  by rank: ${c.beforeRanks} -> ${c.afterRanks}`);
      }
      console.log(`${changes.length} changed`);
      return 0;
    }
    case "build-watch":
      return buildWatchCommand(flags);
    case "audit-sources": {
      if (!args.length) break;
      let clean = true;
      for (const path of args) {
        const audit = auditSources(path);
        const counts = [...Object.entries(audit.sources), ["api_cache", audit.cachedApiRows] as const]
          .map(([id, n]) => `${id}=${n}`)
          .join(" ");
        console.log(`${path}: ${counts}${audit.unexpected.length ? `  NOT PUBLISHABLE: ${audit.unexpected.join(", ")}` : ""}`);
        if (audit.unexpected.length) clean = false;
      }
      return clean ? 0 : 1;
    }
    case "snapshot":
      if (!args[0]) break;
      console.log(JSON.stringify(snapshot(openDb(requireExistingDbPath(flags, "snapshot")), args[0]), null, 2));
      return 0;
  }
  console.error(USAGE);
  return 1;
}

main().then(
  (code) => process.exit(code),
  (e: Error) => {
    console.error(e.message);
    process.exit(1);
  },
);
