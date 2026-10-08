import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `@/` is a tsconfig path alias; the app bundler resolves it, vitest needs it too.
export default defineConfig({
  // Next preserves JSX for its own compiler; component tests need a transform.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
