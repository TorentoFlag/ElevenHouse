import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const productionCompose = readFileSync("deployment/compose/compose.production.yml", "utf8");
const deployWorkflow = readFileSync(".github/workflows/deploy.yml", "utf8");
describe("production database seed deployment", () => {
  it("migrates the one pre-launch baseline before seeding without a legacy reconciler", () => {
    const migratorRun = "run --rm -T db-migrator";
    const seederRun = "run --rm -T db-seeder";
    const migrator = deployWorkflow.indexOf(migratorRun);
    const seeder = deployWorkflow.indexOf(seederRun);

    expect(productionCompose).not.toContain("db-baseline-reconciler:");
    expect(deployWorkflow).not.toContain("db-baseline-reconciler");
    expect(migrator).toBeGreaterThan(-1);
    expect(seeder).toBeGreaterThan(migrator);
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
      deployWorkflow.lastIndexOf(
        "docker compose --env-file env/.env.deploy -f compose/compose.production.yml ps"
      )
    );
  });

  it("records successful release evidence after smoke and retains the last two successful sets", () => {
    const uploadCleanupScript = "deployment/server/cleanup-docker-retention.sh";
    const bootstrapSuccessfulRelease = "./cleanup-docker-retention.sh bootstrap-successful-release";
    const smokeCheck = "https://admin.elevenhouse.ai/api/health";
    const recordSuccessfulRelease =
      './cleanup-docker-retention.sh record-successful-release "${RELEASE_ID}"';
    const cleanupAfterSuccess = "./cleanup-docker-retention.sh cleanup-after-success";

    expect(deployWorkflow).toContain(uploadCleanupScript);
    expect(deployWorkflow).toContain(bootstrapSuccessfulRelease);
    expect(deployWorkflow).toContain(recordSuccessfulRelease);
    expect(deployWorkflow).toContain("if: success()");
    expect(deployWorkflow).toContain(cleanupAfterSuccess);
    expect(deployWorkflow.indexOf(bootstrapSuccessfulRelease)).toBeLessThan(
      deployWorkflow.indexOf(
        "docker compose --env-file env/.env.deploy.next -f compose/compose.production.yml.next pull"
      )
    );
    expect(deployWorkflow.lastIndexOf(smokeCheck)).toBeLessThan(
      deployWorkflow.indexOf(recordSuccessfulRelease)
    );
    expect(deployWorkflow.indexOf(recordSuccessfulRelease)).toBeLessThan(
      deployWorkflow.indexOf(cleanupAfterSuccess)
    );
  });
});
