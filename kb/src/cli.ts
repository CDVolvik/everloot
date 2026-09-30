import { existsSync } from "node:fs";
import { BlizzardClient } from "./blizzard/client.js";
import type { Game, NsKind, Region } from "./blizzard/namespaces.js";
import { openDb, type DB } from "./db.js";
import { importCurated } from "./importers/curated.js";
import { importWikiDump } from "./importers/wiki-dump.js";
import { startHttpBridge } from "./mcp-http.js";
import { serveStdio } from "./mcp-server.js";
import { search } from "./search.js";
import { snapshot } from "./snapshot.js";
import { validate } from "./validate.js";

const GAMES: Game[] = ["retail", "classic", "classic1x", "forever"];
const KINDS: NsKind[] = ["static", "dynamic", "profile"];
const REGIONS: Region[] = ["us", "eu", "kr", "tw"];

const USAGE = `usage: npm run kb -- <command> [--db data/everloot-kb.sqlite]
  import-wiki <dump.xml|dump.xml.zst> [--limit N]   (reads the dump twice; --limit still costs one full pass;
    a limited import REPLACES all wiki rows in the target DB — use --db <scratch> for trials)
  import-curated [dir=curated]
  blizzard-get <data/wow/...|profile/wow/...> --game retail|classic|classic1x|forever --kind static|dynamic|profile [--region us]
    (path has no leading slash; works unchanged in Git Bash and PowerShell)
  search <words...>
  serve-mcp        (stdio MCP: everloot-knowledge)
  serve-mcp-http   (loopback HTTP MCP on 127.0.0.1:8787, POST /mcp; --port N; --token or EVERLOOT_MCP_TOKEN)
  stats
  validate
  snapshot <out.sqlite>   (outside the database's own folder, e.g. data/release/kb.sqlite)`;

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
      for (const h of search(db(), args.join(" "))) console.log(`${h.kind}  ${h.name}\n  ${h.snippet}\n  ${h.sourceUrl} (${h.licence})`);
      return 0;
    case "serve-mcp":
      await serveStdio(flags.get("db") ?? "data/everloot-kb.sqlite");
      return 0;
    case "serve-mcp-http": {
      const port = Number(flags.get("port") ?? 8787);
      const token = flags.get("token") || process.env.EVERLOOT_MCP_TOKEN;
      const http = await startHttpBridge(db(), port, token ? { token } : {});
      const addr = http.address();
      const bound = typeof addr === "object" && addr ? addr.port : port;
      console.log(
        `everloot-knowledge HTTP MCP on http://127.0.0.1:${bound}/mcp (${token ? "bearer required" : "open on loopback"})`,
      );
      await new Promise<never>(() => {});
    }
    case "stats":
      console.table(db().prepare("SELECT source_id, kind, count(*) AS rows FROM entities GROUP BY source_id, kind").all());
      return 0;
    case "validate": {
      const problems = validate(db());
      console.log(problems.length === 0 ? "ok" : problems.join("\n"));
      return problems.length === 0 ? 0 : 1;
    }
    case "snapshot":
      if (!args[0]) break;
      console.log(JSON.stringify(snapshot(db(), args[0]), null, 2));
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
