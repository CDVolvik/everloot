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
      colors: tokenColors,
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
