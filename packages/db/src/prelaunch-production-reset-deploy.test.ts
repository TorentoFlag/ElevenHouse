import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(resolve(".github/workflows/deploy.yml"), "utf8");

describe("one-time pre-launch production reset deploy control", () => {
  it("exposes reset only as a default-false manual dispatch input", () => {
    expect(workflow).toMatch(/workflow_dispatch:\n(?:.|\n)*?prelaunch_reset:/u);
    expect(workflow).toContain("type: boolean");
    expect(workflow).toContain("default: false");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
  });

  it("runs destructive reset after backup and before the fresh baseline migrator", () => {
    const backup = "./backup-postgres.sh";
    const reset = "db:reset-production-prelaunch";
    const migrator = "run --rm -T db-migrator </dev/null";

    expect(workflow).toContain(reset);
    expect(workflow).toContain("PRELAUNCH_RESET_EXPECTED_DATABASE_HOST=postgres");
    expect(workflow).toContain("PRELAUNCH_RESET_EXPECTED_DATABASE_NAME=elevenhouse");
    expect(workflow.indexOf(backup)).toBeLessThan(workflow.indexOf(reset));
    expect(workflow.indexOf(reset)).toBeLessThan(workflow.indexOf(migrator));
  });

  it("skips normal baseline preflight only for the explicitly requested reset", () => {
    const preflight = "run --rm -T db-baseline-preflight </dev/null";

    expect(workflow).toContain('if [[ "${PRELAUNCH_RESET}" != "true" ]]');
    expect(workflow).toContain(preflight);
  });
});
