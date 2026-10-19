import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import { cssVariables, RADIUS, SITE_MODE, tokens, WIDTH, type TokenName } from "./src/design/tokens";

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
      maxWidth: { reading: `${WIDTH.reading}px`, wide: `${WIDTH.wide}px` },
      borderRadius: { control: `${RADIUS.control}px`, card: `${RADIUS.card}px` },
      // The 72 px step of the spacing scale; the others are Tailwind's own (1 2 3 4 6 8 12).
      spacing: { 18: "4.5rem" },
      fontFamily: {
        // Geist for reading, Geist Mono for anything precise (variables set in src/app/fonts.ts).
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [
    // Dark-only: the system's light setting no longer switches the page to cream. A light theme
    // would come back as one more selector here with cssVariables("light"). Tooltip frames stay
    // dark in every mode, as in the game, so they re-declare the dark variables for their contents.
    plugin(({ addBase }) => {
      addBase({
        ":root": cssVariables(SITE_MODE),
        ".bg-tooltip": cssVariables("dark"),
      });
    }),
  ],
};
export default config;
