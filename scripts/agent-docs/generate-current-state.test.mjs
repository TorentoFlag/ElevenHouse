import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { renderCurrentState } from "./generate-current-state.mjs";

test("renders deployable apps, API modules and worker ports from source directories", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "elevenhouse-current-state-"));
  for (const directory of [
    "apps/public-api/src/modules/identity",
    "apps/astrologer-api/src/modules/flows",
    "apps/admin-api/src/modules/finance-policies",
    "apps/workers/src",
    "packages/domain"
  ]) {
    await mkdir(path.join(rootDir, directory), { recursive: true });
  }
  await writeFile(
    path.join(rootDir, "apps/workers/src/runtime-config.ts"),
    "WORKERS_HEALTH_PORT: z.coerce.number().int().positive().default(3010),\n",
    "utf8"
  );

  const currentState = await renderCurrentState({ rootDir });

  assert.match(currentState, /`public-api`/);
  assert.match(currentState, /`domain`/);
  assert.match(currentState, /\| public-api \| `identity` \|/);
  assert.match(currentState, /\| workers \| `WORKERS_HEALTH_PORT` \| 3010 \|/);
});
