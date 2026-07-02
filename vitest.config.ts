import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@elevenhouse/ai": fileURLToPath(
        new URL("./packages/ai/src/index.ts", import.meta.url)
      ),
      "@elevenhouse/contracts": fileURLToPath(
        new URL("./packages/contracts/src/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/components/Modal": fileURLToPath(
        new URL("./packages/design-system/src/components/Modal/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/icons/Check": fileURLToPath(
        new URL("./packages/design-system/src/icons/Check/index.ts", import.meta.url)
      ),
      "@elevenhouse/validation/phone": fileURLToPath(
        new URL("./packages/validation/src/phone/index.ts", import.meta.url)
      ),
      "@elevenhouse/validation": fileURLToPath(
        new URL("./packages/validation/src/index.ts", import.meta.url)
      )
    }
  },
  test: {
    include: ["{apps,packages}/**/*.test.{ts,tsx}"],
    passWithNoTests: false
  }
});
