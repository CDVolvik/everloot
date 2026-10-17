import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/args.js";

describe("parseArgs", () => {
  it("reads flags with values and plain arguments", () => {
    const { flags, args } = parseArgs(["file.sqlite", "--product", "wow_classic_beta", "--out", "data/x"]);
    expect(args).toEqual(["file.sqlite"]);
    expect(Object.fromEntries(flags)).toEqual({ product: "wow_classic_beta", out: "data/x" });
  });
  it("gives a bare --refresh an empty value, last or not", () => {
    expect(parseArgs(["--refresh"]).flags.get("refresh")).toBe("");
    const { flags, args } = parseArgs(["--refresh", "--product", "p", "a.sqlite"]);
    expect(flags.get("refresh")).toBe("");
    expect(flags.get("product")).toBe("p");
    expect(args).toEqual(["a.sqlite"]);
  });
  it("does not let a flag take another flag as its value", () => {
    const { flags } = parseArgs(["--token", "--x", "1"]);
    expect(flags.get("token")).toBe("");
    expect(flags.get("x")).toBe("1");
  });
  it("still takes an explicit value for --refresh", () => {
    expect(parseArgs(["--refresh", "yes"]).flags.get("refresh")).toBe("yes");
  });
});
