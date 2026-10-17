import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import { cssVariables, tokens, type TokenName } from "./src/design/tokens";

// Every token except the gradient stops, which only the primary pill's outline uses.
const tokenColors = Object.fromEntries(
  (Object.keys(tokens.dark) as TokenName[])
    .filter((name) => name !== "grad-from" && name !== "grad-to")
    .map((name) => [name, `rgb(var(--${name}) / <alpha-value>)`]),
);

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: tokenColors,
      fontFamily: {
        // Geist for reading, Geist Mono for anything precise (variables set in src/app/fonts.ts).
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [
    // Dark is the default; light follows the system setting. Tooltip frames stay dark in both
    // modes, as in the game, so they re-declare the dark variables for everything inside them.
    plugin(({ addBase }) => {
      addBase({
        ":root": cssVariables("dark"),
        "@media (prefers-color-scheme: light)": { ":root": cssVariables("light") },
        ".bg-tooltip": cssVariables("dark"),
      });
    }),
  ],
};
export default config;
