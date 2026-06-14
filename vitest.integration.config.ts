import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{apps,packages}/**/*.integration.{ts,tsx}"],
    passWithNoTests: false,
    testTimeout: 30000
  }
});
