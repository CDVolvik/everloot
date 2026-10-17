import { expect, test } from "vitest";
import config from "../../tailwind.config";
import { channels, cssVariables, TEXT_TOKENS, tokens } from "./tokens";

// WCAG 2.x relative luminance and contrast ratio.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("the values are the spec's", () => {
  expect([tokens.dark.canvas, tokens.light.canvas]).toEqual(["#0E0F0D", "#FBF8EC"]);
  expect([tokens.dark.accent, tokens.light.accent]).toEqual(["#9CF03A", "#2F7A0A"]);
  expect(tokens.dark["q-rare"]).toBe("#4C9BFF");
  expect(tokens.light["class-rogue"]).toBe("#746500");
  expect(tokens.light["chat-whisper"]).toBe("#A3218F");
  for (const m of ["dark", "light"] as const)
    expect([tokens[m].tooltip, tokens[m]["tooltip-border"], tokens[m]["tooltip-inner"]])
      .toEqual(["#080C18", "#5B6B8C", "#26324F"]);
});

test.each(["dark", "light"] as const)("every text token reaches 4.5:1 on canvas and panel (%s)", (m) => {
  for (const t of TEXT_TOKENS) for (const bg of ["canvas", "panel"] as const)
    expect(contrast(tokens[m][t], tokens[m][bg]), `${t} on ${bg}`).toBeGreaterThanOrEqual(4.5);
});

test("dark text tokens read inside the tooltip frame", () => {
  for (const t of TEXT_TOKENS) expect(contrast(tokens.dark[t], tokens.dark.tooltip), t).toBeGreaterThanOrEqual(4.5);
});

test.each(["dark", "light"] as const)("the primary outline stops reach 3:1 on the canvas (%s)", (m) => {
  for (const t of ["grad-from", "grad-to"] as const)
    expect(contrast(tokens[m][t], tokens[m].canvas)).toBeGreaterThanOrEqual(3);
});

test("channels", () => expect(channels("#0E0F0D")).toBe("14 15 13"));

test("css variables cover every token in both modes", () => {
  expect(cssVariables("dark")["--canvas"]).toBe("14 15 13");
  expect(Object.keys(cssVariables("light"))).toHaveLength(Object.keys(tokens.light).length);
});

test("Tailwind exposes the tokens as variables", () => {
  const colors = config.theme!.extend!.colors as Record<string, unknown>;
  expect(colors.fg).toBe("rgb(var(--fg) / <alpha-value>)");
  expect(Object.keys(colors)).toEqual(expect.arrayContaining(["canvas", "fg-2", "q-legendary", "class-druid", "chat-guild", "tooltip-border"]));
  expect(colors).not.toHaveProperty("grad-from");
});
