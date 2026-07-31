import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const productionCompose = readFileSync("deployment/compose/compose.production.yml", "utf8");
const deployWorkflow = readFileSync(".github/workflows/deploy.yml", "utf8");
const productionBaselineReconciler =
  "packages/db/scripts/reconcile-production-baseline.ts";

describe("production database seed deployment", () => {
  it("reconciles an approved legacy baseline before running migrations", () => {
    const reconcilerRun = "run --rm -T db-baseline-reconciler";
    const migratorRun = "run --rm -T db-migrator";

    expect(existsSync(productionBaselineReconciler)).toBe(true);
    expect(productionCompose).toContain("db-baseline-reconciler:");
    expect(productionCompose).toContain(
      'command: ["pnpm", "--filter", "@elevenhouse/db", "db:reconcile-production-baseline"]'
    );
    expect(deployWorkflow).toContain(reconcilerRun);
    expect(deployWorkflow.indexOf(reconcilerRun)).toBeLessThan(
      deployWorkflow.indexOf(migratorRun)
    );
  });

  it("runs the idempotent database seed step after migrations", () => {
    const migratorRun = "run --rm -T db-migrator";
    const seederRun = "run --rm -T db-seeder";

    expect(productionCompose).toContain("db-seeder:");
    expect(productionCompose).toContain('command: ["pnpm", "db:seed"]');
    expect(deployWorkflow).toContain(seederRun);
    expect(deployWorkflow.indexOf(seederRun)).toBeGreaterThan(deployWorkflow.indexOf(migratorRun));
  });

  it("waits for every production healthcheck before declaring the deploy successful", () => {
    const upAndWait = "up -d --wait --wait-timeout 180";

    expect(deployWorkflow).toContain(upAndWait);
    expect(deployWorkflow.indexOf(upAndWait)).toBeLessThan(
      deployWorkflow.lastIndexOf("docker compose --env-file env/.env.deploy -f compose/compose.production.yml ps")
    );
  });

  it("cleans production Docker artifacts only after successful smoke checks while retaining one rollback set", () => {
    const uploadCleanupScript = "deployment/server/cleanup-docker-retention.sh";
    const captureRollbackSet = "./cleanup-docker-retention.sh capture-rollback-set";
    const smokeCheck = "https://admin.elevenhouse.ai/api/health";
    const cleanupAfterSuccess = "./cleanup-docker-retention.sh cleanup-after-success";

    expect(deployWorkflow).toContain(uploadCleanupScript);
    expect(deployWorkflow).toContain(captureRollbackSet);
    expect(deployWorkflow).toContain("if: success()");
    expect(deployWorkflow).toContain(cleanupAfterSuccess);
    expect(deployWorkflow.indexOf(captureRollbackSet)).toBeLessThan(
      deployWorkflow.indexOf("docker compose --env-file env/.env.deploy -f compose/compose.production.yml pull")
    );
    expect(deployWorkflow.lastIndexOf(smokeCheck)).toBeLessThan(
      deployWorkflow.indexOf(cleanupAfterSuccess)
    );
  });
});
