import { describe, expect, test } from "vitest";
import { playerStoreProblem, type PlayerUpsert } from "./player-pages";

/**
 * The players table's own rules, checked before a row is sent to it. A realm with a space is the case that
 * broke: the table's key forbids spaces and the write function stored them, so every player row failed.
 */
const row = (realm: string): PlayerUpsert => ({
  name: "Thrallina", realm, race: "Orc", class: "SHAMAN", level: 24, guild: "Night Watch", seen: "2026-10-21",
});

describe("a player row the table could not store", () => {
  test("a realm with a space is fine: the key is the normalised realm", () => {
    expect(playerStoreProblem(row("Classic Beta PvP 2"))).toBeNull();
    expect(playerStoreProblem(row("Forever Pioneer"))).toBeNull();
    expect(playerStoreProblem(row("Everald"))).toBeNull();
  });

  test("a realm spelled two ways is one realm, so both are fine", () => {
    expect(playerStoreProblem(row("Forever-Pioneer"))).toBeNull();
    expect(playerStoreProblem(row("forever  pioneer"))).toBeNull();
    expect(playerStoreProblem(row("Darkmoon Faire"))).toBeNull();
  });

  test("a realm the table would refuse is refused, with a reason", () => {
    expect(playerStoreProblem(row("x"))).toMatch(/cannot be stored/);
    expect(playerStoreProblem(row("r".repeat(41)))).toMatch(/cannot be stored/);
    expect(playerStoreProblem(row("r".repeat(40)))).toBeNull();
  });

  test("the realm is read trimmed, so a stray space is not a problem", () => {
    expect(playerStoreProblem(row("  Everald  "))).toBeNull();
  });
});
