import { expect, test } from "vitest";
import { safeReturnTo, signInPath } from "./auth/return-to";
import { codeClass, editPath, LIMITS, parseBuildInput, parseCharacterInput, savedBuildsOn, toBuild, type BuildRow } from "./saved-builds";

const MAGE = "EL1-mage-0-1.60.1.70450-MTE6NQ";
const MAGE2 = "EL1-mage-1482-1.60.1.70450-MjE6MQ";
const WARRIOR = "EL1-warrior-0-1.60.1.70450-MTE6NQ";
const ID = "0b6f1c1e-3f43-4a4e-9a51-3d2a1f0c9e11";

test("the switch is on only for exactly 1", () => {
  expect(savedBuildsOn({ EVERLOOT_SAVED_BUILDS: "1" })).toBe(true);
  for (const value of [undefined, "", "0", "true", " 1", "yes"]) expect(savedBuildsOn({ EVERLOOT_SAVED_BUILDS: value })).toBe(false);
});

test("a share code must be shaped right, decode and name a calculator class", () => {
  expect(codeClass(MAGE)).toBe("mage");
  expect(codeClass(WARRIOR)).toBe("warrior");
  expect(codeClass("EL1-monk-0-1.60-MTE6NQ")).toBeNull();
  expect(codeClass("EL2-mage-0-1.60-MTE6NQ")).toBeNull();
  expect(codeClass("EL1-mage-0-1.60-")).toBeNull();
  expect(codeClass("EL1-mage-0-1..60-MTE6NQ")).toBeNull();
  expect(codeClass("EL1-mage-0-1.60-!!")).toBeNull();
  expect(codeClass(`EL1-mage-0-1.60-${"A".repeat(400)}`)).toBeNull();
});

test("a build needs a name of 1 to 60 characters, counted as whole characters", () => {
  expect(parseBuildInput({ name: "  ", code: MAGE })).toMatchObject({ ok: false });
  expect(parseBuildInput({ name: "x".repeat(61), code: MAGE })).toMatchObject({ ok: false });
  expect(parseBuildInput({ name: "🐉".repeat(60), code: MAGE })).toMatchObject({ ok: true });
  expect(parseBuildInput({ name: 42, code: MAGE })).toMatchObject({ ok: false });
  const parsed = parseBuildInput({ name: "  Fire\u0007 raid  ", code: ` ${MAGE} `, notes: "line one\r\nline two\u0000" });
  expect(parsed).toEqual({ ok: true, value: {
    id: null, name: "Fire raid", notes: "line one\nline two", characterId: null, code: MAGE, code2: null, shared: null, active: null, showName: null,
  } });
});

test("notes are optional, plain and up to 1,000 characters", () => {
  expect(parseBuildInput({ name: "a", code: MAGE, notes: "" })).toMatchObject({ ok: true, value: { notes: null } });
  expect(parseBuildInput({ name: "a", code: MAGE, notes: "x".repeat(LIMITS.notes) })).toMatchObject({ ok: true });
  expect(parseBuildInput({ name: "a", code: MAGE, notes: "x".repeat(LIMITS.notes + 1) })).toMatchObject({ ok: false });
  expect(parseBuildInput({ name: "a", code: MAGE, notes: ["no"] })).toMatchObject({ ok: false });
});

test("both talent sets must be valid codes of the same class", () => {
  expect(parseBuildInput({ name: "a", code: MAGE, code2: MAGE2 })).toMatchObject({ ok: true, value: { code2: MAGE2 } });
  expect(parseBuildInput({ name: "a", code: MAGE, code2: "" })).toMatchObject({ ok: true, value: { code2: null } });
  expect(parseBuildInput({ name: "a", code: MAGE, code2: WARRIOR })).toEqual({ ok: false, error: "Both talent sets must be for the same class." });
  expect(parseBuildInput({ name: "a", code: "nope" })).toMatchObject({ ok: false });
  expect(parseBuildInput({ name: "a" })).toMatchObject({ ok: false });
});

test("ids are uuids and the switches are booleans", () => {
  expect(parseBuildInput({ id: ID, characterId: ID, name: "a", code: MAGE, shared: false, active: true, showName: true }))
    .toMatchObject({ ok: true, value: { id: ID, characterId: ID, shared: false, active: true, showName: true } });
  expect(parseBuildInput({ id: "1", name: "a", code: MAGE })).toMatchObject({ ok: false });
  expect(parseBuildInput({ characterId: "x'; drop table", name: "a", code: MAGE })).toMatchObject({ ok: false });
  expect(parseBuildInput({ name: "a", code: MAGE, shared: "yes" })).toMatchObject({ ok: false });
  expect(parseBuildInput(null)).toMatchObject({ ok: false });
});

test("a character label: a name of 1 to 24, a class, optional realm and note", () => {
  expect(parseCharacterInput({ name: " Jaina ", classSlug: "mage", realm: " ", note: "" }))
    .toEqual({ ok: true, value: { id: null, name: "Jaina", classSlug: "mage", realm: null, note: null } });
  expect(parseCharacterInput({ name: "x".repeat(25), classSlug: "mage" })).toMatchObject({ ok: false });
  expect(parseCharacterInput({ name: "Jaina", classSlug: "monk" })).toMatchObject({ ok: false });
  expect(parseCharacterInput({ name: "Jaina", classSlug: "mage", realm: "x".repeat(33) })).toMatchObject({ ok: false });
  expect(parseCharacterInput({ name: "Jaina", classSlug: "mage", note: "x".repeat(141) })).toMatchObject({ ok: false });
  expect(parseCharacterInput({ id: "nope", name: "Jaina", classSlug: "mage" })).toMatchObject({ ok: false });
});

test("a stored row becomes the API's shape, with the short link only while shared", () => {
  const row: BuildRow = {
    id: ID, slug: "AbCd1234", name: "Fire", notes: null, class_slug: "mage", character_id: null, code: MAGE, code2: null,
    game_build: "1.60.1.70450", shared: true, show_name: false, active: false, updated_at: "2026-10-20T12:00:00.123456+00:00",
  };
  expect(toBuild(row, "https://everloot.app")).toEqual({
    id: ID, slug: "AbCd1234", name: "Fire", notes: null, classSlug: "mage", characterId: null, code: MAGE, code2: null,
    gameBuild: "1.60.1.70450", shared: true, active: false, link: "https://everloot.app/b/AbCd1234", updatedAt: "2026-10-20T12:00:00.123Z", showName: false,
  });
  expect(toBuild({ ...row, shared: false }, "https://everloot.app").link).toBeNull();
});

test("opening a saved build marks the calculator as editing it, with both sets in the address", () => {
  expect(editPath({ id: ID, classSlug: "mage", code: MAGE, code2: MAGE2 })).toBe(`/tools/talents/mage?saved=${ID}#plan=${MAGE}&plan2=${MAGE2}`);
  expect(editPath({ id: ID, classSlug: "mage", code: MAGE, code2: null })).toBe(`/tools/talents/mage?saved=${ID}#plan=${MAGE}`);
});

test("after sign-in the visitor returns only to a path on this site", () => {
  expect(safeReturnTo("/tools/talents/mage?save=1")).toBe("/tools/talents/mage?save=1");
  for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "me", "/a\nb", 7, null, `/${"a".repeat(600)}`]) expect(safeReturnTo(bad)).toBeNull();
  expect(signInPath("/tools/talents/mage?save=1")).toBe("/sign-in?returnTo=%2Ftools%2Ftalents%2Fmage%3Fsave%3D1");
  expect(signInPath("//evil.example")).toBe("/sign-in");
});
