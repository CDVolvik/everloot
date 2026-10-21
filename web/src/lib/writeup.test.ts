import { expect, test } from "vitest";
import { inlineParts, writeupBlocks, writeupText } from "./writeup";

test("paragraphs and lists, in order", () => {
  expect(writeupBlocks("One line\nsame paragraph.\n\n- a\n- b\nAfter the list.")).toEqual([
    { kind: "p", parts: ["One line same paragraph."] },
    { kind: "ul", items: [["a"], ["b"]] },
    { kind: "p", parts: ["After the list."] },
  ]);
});

test("links go to a site path or an https address; anything else keeps only its words", () => {
  expect(inlineParts("See [the list](/changes) and [Blizzard](https://worldofwarcraft.blizzard.com/x).")).toEqual([
    "See ", { text: "the list", href: "/changes" }, " and ", { text: "Blizzard", href: "https://worldofwarcraft.blizzard.com/x" }, ".",
  ]);
  for (const bad of ["javascript:void", "//evil.example", "http://plain.example", "data:text/html,x"]) {
    expect(inlineParts(`a [b](${bad}) c`), bad).toEqual(["a b c"]);
  }
  expect(writeupText("Read [this](/x).\n\n- one")).toBe("Read this. one");
});
