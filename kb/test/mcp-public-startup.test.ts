import { spawn } from "node:child_process";
import { request } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { expect, test } from "vitest";
import { openDb } from "../src/db.js";
import { replaceSourceRows } from "../src/entities.js";
import { snapshot } from "../src/snapshot.js";

test("the public service starts with an approved knowledge release without a gameplay table", async () => {
  const dir = mkdtempSync(join(tmpdir(), "everloot-startup-"));
  const db = openDb(join(dir, "source.sqlite"));
  await replaceSourceRows(db, "curated", ["lore_page"], [{ kind: "lore_page", extId: "1", name: "Dalarán", body: "Warchief",
    gameVersion: "lore", sourceUrl: "https://example.test/thrall", retrievedAt: "2023-11-13" }]);
  const release = join(dir, "release", "release.sqlite");
  snapshot(db, release);
  db.close();
  const child = spawn(process.execPath, ["--import=tsx", "src/mcp-http-main.ts"], {
    cwd: resolve(import.meta.dirname, ".."), env: { ...process.env, KB_SNAPSHOT_PATH: release, EVERLOOT_MCP_TOKEN: "test", PORT: "0" },
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const output = await new Promise<string>((done) => {
      let text = "";
      const timeout = setTimeout(() => done(text), 3000);
      child.stderr.on("data", (data) => {
        text += data.toString();
        if (text.includes("Public MCP server listening")) { clearTimeout(timeout); done(text); }
      });
      child.on("exit", () => { clearTimeout(timeout); done(text); });
    });
    expect(output).toContain("Public MCP server listening");
    expect(output).not.toContain("no such table");
    const port = Number(output.match(/localhost:(\d+)/)?.[1]);
    // A client that never finishes its body is rejected before it consumes a buffer.
    const status = await new Promise<number>((resolve, reject) => {
      const req = request({ hostname: "127.0.0.1", port, path: "/mcp", method: "POST" }, res => {
        resolve(res.statusCode!); res.resume();
      });
      req.on("error", reject);
      req.setTimeout(1500, () => { req.destroy(); reject(new Error("Unauthenticated body was awaited")); });
      req.write("{");
    });
    expect(status).toBe(401);
    // TCP chunks may split a multibyte character. Decode only the complete bounded body.
    const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: {
      name: "get_by_name", arguments: { name: "Dalarán" },
    } }));
    const split = body.indexOf(Buffer.from("á")) + 1;
    const result = await new Promise<string>((resolve, reject) => {
      const req = request({ hostname: "127.0.0.1", port, path: "/mcp", method: "POST", headers: {
        authorization: "Bearer test", "content-type": "application/json", accept: "application/json, text/event-stream",
      } }, res => { let text = ""; res.on("data", chunk => text += chunk); res.on("end", () => resolve(text)); });
      req.on("error", reject);
      req.write(body.subarray(0, split));
      setTimeout(() => req.end(body.subarray(split)), 10);
    });
    expect(result).toContain("Dalarán");
    expect(result).not.toContain("�");
  } finally { child.kill(); }
});
