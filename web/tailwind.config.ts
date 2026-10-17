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
  ],
  theme: {
    extend: {
      colors: {
        ...tokenColors,
        // WoW-flavored palette: deep parchment dark + quality colors
        gold: {
          50: "#fffbea",
          100: "#fff3c4",
          200: "#fce588",
          300: "#fadb5f",
          400: "#f7c948",
          500: "#f0b429", // canonical WoW gold
          600: "#de911d",
          700: "#cb6e17",
          800: "#b44d12",
          900: "#8d2b0b",
        },
        parchment: {
          50: "#faf5e9",
          100: "#F4F1EA", // bone
          900: "#14141D", // raised surface
          950: "#0B0B12", // abyss canvas
        },
        // Everloot accent: arcane violet for progression/data highlights
        arcane: "#8B5CF6",
        // WoW item-quality accents (tuned for the dark canvas)
        epic: "#a335ee",
        rare: "#0070dd",
        uncommon: "#4ADE80",
        legendary: "#ff8000",
      },
      fontFamily: {
        // Tight grotesk voice: system sans for both, display gets tracking via classes
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [
    // Dark is the default; light follows the system setting.
    plugin(({ addBase }) => {
      addBase({
        ":root": cssVariables("dark"),
        "@media (prefers-color-scheme: light)": { ":root": cssVariables("light") },
      });
    }),
  ],
};
export default config;
