import { existsSync } from "node:fs";
import { BlizzardClient } from "./blizzard/client.js";
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
  const flags = new Map<string, string>();
  const args: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith("--")) flags.set(rest[i].slice(2), rest[++i] ?? "");
    else args.push(rest[i]);
  }
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
