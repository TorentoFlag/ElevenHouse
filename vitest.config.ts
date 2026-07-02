import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@elevenhouse/design-system/components/Modal": fileURLToPath(
        new URL("./packages/design-system/src/components/Modal/index.ts", import.meta.url)
      )
    }
  },
  test: {
    include: ["{apps,packages}/**/*.test.{ts,tsx}"],
    passWithNoTests: false
  }
});
