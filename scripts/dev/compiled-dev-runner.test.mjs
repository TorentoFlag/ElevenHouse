import assert from "node:assert/strict";
import test from "node:test";

import { createCompiledDevPlan } from "./compiled-dev-runner.mjs";

test("builds workspace package dependencies before starting a compiled app runtime", () => {
  const plan = createCompiledDevPlan({ packageName: "@elevenhouse/chart-worker" });

  assert.deepEqual(plan.initialBuild, {
    command: "pnpm",
    args: ["--filter", "@elevenhouse/chart-worker...", "build"],
    exitOnFailure: true
  });
  assert.deepEqual(plan.watch, {
    command: "pnpm",
    args: ["exec", "tsc", "-p", "tsconfig.build.json", "--watch", "--preserveWatchOutput"],
    exitOnFailure: false
  });
  assert.deepEqual(plan.runtime, {
    command: "node",
    args: ["--watch", "dist/main.js"],
    exitOnFailure: true
  });
});
