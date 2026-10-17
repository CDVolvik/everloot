import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

// Self-hosted from the geist package (SIL OFL 1.1); the build fetches nothing.
// Sets --font-geist-sans and --font-geist-mono, which tailwind.config.ts uses.
export const fontVariables = `${GeistSans.variable} ${GeistMono.variable}`;
