import { expect, test } from "vitest";
import { ago, esc, gold, kb, msg, sparkline, statusText } from "../src/renderer/format";

test("gold reads as gold, silver and copper, with the dash for unknown", () => {
  expect(gold(null)).toBe("–");
  expect(gold(0)).toBe("0c");
  expect(gold(57)).toBe("57c");
  expect(gold(1234)).toBe("12s 34c");
  expect(gold(12345678)).toBe(`${(1234).toLocaleString()}g 56s`);
});

test("sizes and ages are short", () => {
  expect(kb(512)).toBe("512 B");
  expect(kb(20480)).toBe("20 KB");
  expect(kb(1572864)).toBe("1.5 MB");
  const now = Date.parse("2026-10-18T12:00:00Z");
  expect(ago(null, now)).toBe("never");
  expect(ago("2026-10-18T11:59:50Z", now)).toBe("just now");
  expect(ago("2026-10-18T11:15:00Z", now)).toBe("45 min ago");
  expect(ago("2026-10-18T07:00:00Z", now)).toBe("5 h ago");
  expect(ago("2026-10-15T12:00:00Z", now)).toBe("3 d ago");
});

test("an IPC error shows only its reason", () => {
  expect(msg(new Error("Error invoking remote method 'restoreBackup': Error: not a backup"))).toBe("not a backup");
  expect(msg(new TypeError("TypeError: bad"))).toBe("bad");
  expect(msg("plain")).toBe("plain");
});

test("job status text follows the state", () => {
  expect(statusText({ state: "off", message: "", at: null })).toBe("Off");
  expect(statusText({ state: "idle", message: "", at: null })).toBe("Waiting for the next write");
  expect(statusText({ state: "ok", message: "", at: null })).toBe("Done");
  expect(statusText({ state: "ok", message: "sent 3", at: null })).toBe("sent 3");
  expect(statusText({ state: "error", message: "boom", at: null })).toBe("boom");
});

test("the sparkline needs two points, escapes its dates and spans the box", () => {
  expect(sparkline([])).toBe("");
  expect(sparkline([{ at: "2026-10-01", copper: 5 }])).toBe("");
  const svg = sparkline([{ at: "2026-10-01T00:00:00Z", copper: 100 }, { at: "2026-10-02T00:00:00Z", copper: 300 }, { at: "2026-10-03T00:00:00Z", copper: 200 }]);
  expect(svg).toContain('aria-label="gold from 2026-10-01 to 2026-10-03"');
  expect(svg).toContain("<title>3 snapshots, 2026-10-01 to 2026-10-03</title>");
  expect(svg).toContain('d="M0.0,23.0 L47.5,1.0 L95.0,12.0"');
  // A flat line sits in the middle.
  expect(sparkline([{ at: "a", copper: 7 }, { at: "b", copper: 7 }])).toContain('d="M0.0,12.0 L95.0,12.0"');
  expect(sparkline([{ at: '<"x">', copper: 1 }, { at: "b", copper: 2 }])).not.toContain('<"x">');
  expect(esc("<a href='x'>&</a>")).toBe("&lt;a href=&#39;x&#39;&gt;&amp;&lt;/a&gt;");
});
