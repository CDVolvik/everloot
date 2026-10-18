import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { DEFAULT_SIZE, MIN_SIZE, fitWindow, readWindowState, writeWindowState } from "../src/main/window-state";

const dirs: string[] = [];
const dir = () => { const d = mkdtempSync(join(tmpdir(), "everloot-desktop-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const laptop = { x: 0, y: 0, width: 1920, height: 1040 };
const second = { x: 1920, y: 0, width: 2560, height: 1400 };

test("no remembered state opens at the default size, centered", () => {
  expect(fitWindow(null, [laptop])).toEqual(DEFAULT_SIZE);
  expect(fitWindow({}, [laptop])).toEqual(DEFAULT_SIZE);
});

test("a remembered position on a connected display is kept", () => {
  expect(fitWindow({ x: 2000, y: 100, width: 900, height: 600 }, [laptop, second])).toEqual({ x: 2000, y: 100, width: 900, height: 600 });
});

test("a position on a display that is gone drops back to centered at the remembered size", () => {
  expect(fitWindow({ x: 2000, y: 100, width: 900, height: 600 }, [laptop])).toEqual({ width: 900, height: 600 });
  // Only a sliver left on screen counts as off screen too.
  expect(fitWindow({ x: 1850, y: 100, width: 900, height: 600 }, [laptop])).toEqual({ width: 900, height: 600 });
});

test("the size is clamped to the minimum and to the largest display", () => {
  expect(fitWindow({ width: 100, height: 100 }, [laptop])).toEqual(MIN_SIZE);
  expect(fitWindow({ width: 9000, height: 9000 }, [laptop, second])).toEqual({ width: 2560, height: 1400 });
  expect(fitWindow({ width: 9000, height: 9000 }, [])).toEqual(MIN_SIZE);
});

test("window.json round-trips, ignores junk fields and survives a broken file", () => {
  const path = join(dir(), "window.json");
  expect(readWindowState(path)).toBeNull();
  writeWindowState(path, { x: 10, y: 20, width: 800, height: 600 });
  expect(readWindowState(path)).toEqual({ x: 10, y: 20, width: 800, height: 600 });
  writeFileSync(path, JSON.stringify({ x: "left", y: 20.4, width: NaN, height: 600 }));
  expect(readWindowState(path)).toEqual({ y: 20, height: 600 });
  writeFileSync(path, "{not json");
  expect(readWindowState(path)).toBeNull();
});
