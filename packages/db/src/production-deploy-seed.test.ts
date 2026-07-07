import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const productionCompose = readFileSync("deployment/compose/compose.production.yml", "utf8");
const deployWorkflow = readFileSync(".github/workflows/deploy.yml", "utf8");

describe("production database seed deployment", () => {
  it("runs the idempotent database seed step after migrations", () => {
    const migratorRun = "run --rm -T db-migrator";
    const seederRun = "run --rm -T db-seeder";

    expect(productionCompose).toContain("db-seeder:");
    expect(productionCompose).toContain('command: ["pnpm", "db:seed"]');
    expect(deployWorkflow).toContain(seederRun);
    expect(deployWorkflow.indexOf(seederRun)).toBeGreaterThan(deployWorkflow.indexOf(migratorRun));
  });
});
