import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `@/` is a tsconfig path alias; the app bundler resolves it, vitest needs it too.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});