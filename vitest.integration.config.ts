import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@elevenhouse/chart-engine-client": fileURLToPath(
        new URL("./packages/chart-engine-client/src/index.ts", import.meta.url)
      ),
      "@elevenhouse/db/charts": fileURLToPath(
        new URL("./packages/db/src/adapters/charts/index.ts", import.meta.url)
      ),
      "@elevenhouse/db/connection": fileURLToPath(
        new URL("./packages/db/src/connection/index.ts", import.meta.url)
      ),
      "@elevenhouse/auth/roles": fileURLToPath(
        new URL("./packages/auth/src/roles.ts", import.meta.url)
      ),
      "@elevenhouse/validation/phone": fileURLToPath(
        new URL("./packages/validation/src/phone/index.ts", import.meta.url)
      ),
      "@elevenhouse/validation/media": fileURLToPath(
        new URL("./packages/validation/src/media/index.ts", import.meta.url)
      ),
      "@elevenhouse/validation/products": fileURLToPath(
        new URL("./packages/validation/src/products/index.ts", import.meta.url)
      ),
      "@elevenhouse/contracts": fileURLToPath(
        new URL("./packages/contracts/src/index.ts", import.meta.url)
      ),
      "@elevenhouse/db/connection": fileURLToPath(
        new URL("./packages/db/src/connection/index.ts", import.meta.url)
      ),
      "@elevenhouse/db/finance": fileURLToPath(
        new URL("./packages/db/src/adapters/finance/index.ts", import.meta.url)
      ),
      "@elevenhouse/db/runtime": fileURLToPath(
        new URL("./packages/db/src/runtime/index.ts", import.meta.url)
      ),
      "@elevenhouse/domain/finance-core/reconciliation": fileURLToPath(
        new URL("./packages/domain/src/finance-core/reconciliation.ts", import.meta.url)
      ),
      "@elevenhouse/domain/finance-core": fileURLToPath(
        new URL("./packages/domain/src/finance-core/index.ts", import.meta.url)
      ),
      "@elevenhouse/domain": fileURLToPath(
        new URL("./packages/domain/src/index.ts", import.meta.url)
      ),
      "@elevenhouse/auth": fileURLToPath(new URL("./packages/auth/src/index.ts", import.meta.url)),
      "@elevenhouse/validation": fileURLToPath(
        new URL("./packages/validation/src/index.ts", import.meta.url)
      )
    }
  },
  test: {
    include: ["{apps,packages}/**/*.integration.{ts,tsx}"],
    passWithNoTests: false,
    testTimeout: 30000,
    // Integration suites create and reset isolated PostgreSQL databases. Running the
    // DDL-heavy files concurrently exhausts local PostgreSQL shared memory and
    // turns one environmental failure into a misleading cascade of skipped tests.
    fileParallelism: false,
    maxWorkers: 1
  }
});
