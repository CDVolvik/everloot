import { expect, test, vi } from "vitest";
import { debounce, defaultStatePath, parseArgs } from "../src/cli";

test("arguments name a command, a file or a game folder, and an endpoint", () => {
  expect(parseArgs(["upload", "--file", "Everloot.lua"])).toEqual({ command: "upload", file: "Everloot.lua", endpoint: "https://everloot.app" });
  expect(parseArgs(["watch", "--game", "C:/Games/WoW", "--endpoint", "http://localhost:3000"]))
    .toEqual({ command: "watch", game: "C:/Games/WoW", endpoint: "http://localhost:3000" });
  expect(parseArgs(["upload", "--file", "x", "--state", "s.json"]).state).toBe("s.json");
  expect(() => parseArgs(["upload"])).toThrow(/--file or --game/);
  expect(() => parseArgs(["dance", "--file", "x"])).toThrow(/upload, watch or bridge/);
  expect(() => parseArgs(["upload", "--file", "x", "--endpoint", "ftp://nope"])).toThrow(/http/);
});

test("sent state lives in the user's app data folder, never the addon folder", () => {
  expect(defaultStatePath({ platform: "win32", env: { APPDATA: "C:\\Users\\p\\AppData\\Roaming" }, home: "C:\\Users\\p" }))
    .toMatch(/AppData[\\/]Roaming[\\/]Everloot[\\/]sent\.json$/);
  expect(defaultStatePath({ platform: "darwin", env: {}, home: "/Users/p" })).toBe("/Users/p/Library/Application Support/Everloot/sent.json");
  expect(defaultStatePath({ platform: "linux", env: {}, home: "/home/p" })).toBe("/home/p/.config/everloot/sent.json");
});

test("a burst of file events during a save runs the upload once, after it settles", () => {
  vi.useFakeTimers();
  try {
    const run = vi.fn();
    const trigger = debounce(run, 5000);
    trigger(); trigger(); vi.advanceTimersByTime(4000); trigger();
    vi.advanceTimersByTime(4999);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});

test("bridge needs the game folder, an MCP URL and a token file", () => {
  expect(parseArgs(["bridge", "--game", "C:/WoW", "--mcp", "https://everloot.app/mcp", "--token-file", "t.txt"]))
    .toEqual({ command: "bridge", game: "C:/WoW", endpoint: "https://everloot.app", mcp: "https://everloot.app/mcp", tokenFile: "t.txt" });
  expect(() => parseArgs(["bridge", "--file", "x.lua", "--mcp", "https://e/mcp", "--token-file", "t"])).toThrow(/--game/);
  expect(() => parseArgs(["bridge", "--game", "C:/WoW", "--token-file", "t"])).toThrow(/--mcp/);
  expect(() => parseArgs(["bridge", "--game", "C:/WoW", "--mcp", "https://e/mcp"])).toThrow(/--token-file/);
});
