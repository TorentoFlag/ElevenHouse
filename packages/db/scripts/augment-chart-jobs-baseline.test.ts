import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { augmentChartJobsBaseline } from "./augment-chart-jobs-baseline";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("chart calculation jobs baseline augmenter", () => {
  it("adds the historical result checksum guard exactly once", async () => {
    const migrationPath = await createFixture(canonicalFixture);

    await augmentChartJobsBaseline(migrationPath);
    await augmentChartJobsBaseline(migrationPath);

    const migration = await readFile(migrationPath, "utf8");
    expect(
      migration.split('CREATE TRIGGER "chart_calculation_jobs_result_checksum_immutable"')
    ).toHaveLength(2);
    expect(migration).toContain("OLD.result_checksum IS NOT NULL");
    expect(migration).toContain("OLD.result_checksum IS DISTINCT FROM NEW.result_checksum");
  });

  it("fails closed when the generated checksum column is absent", async () => {
    const migrationPath = await createFixture(
      canonicalFixture.replace('  "result_checksum" text,\n', "")
    );

    await expect(augmentChartJobsBaseline(migrationPath)).rejects.toThrow(
      "canonical chart job result checksum"
    );
  });

  it("rejects a partial or divergent owned integrity block", async () => {
    const migrationPath = await createFixture(
      `${canonicalFixture}\nCREATE TRIGGER "chart_calculation_jobs_result_checksum_immutable" BEFORE UPDATE ON chart_calculation_jobs;`
    );

    await expect(augmentChartJobsBaseline(migrationPath)).rejects.toThrow(
      "partial or divergent chart job integrity objects"
    );
  });
});

const canonicalFixture = `
CREATE TABLE "chart_calculation_jobs" (
  "id" uuid PRIMARY KEY NOT NULL,
  "schema_version" text NOT NULL,
  "status" text NOT NULL,
  "result_checksum" text,
  CONSTRAINT "chart_calculation_jobs_result_checksum_check" CHECK ("chart_calculation_jobs"."result_checksum" is null or "chart_calculation_jobs"."result_checksum" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT "chart_calculation_jobs_lease_state_check" CHECK (("chart_calculation_jobs"."schema_version" = 'chart-result.v1' or "chart_calculation_jobs"."result_checksum" is not null))
);
`;

async function createFixture(contents: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "elevenhouse-chart-jobs-baseline-"));
  temporaryDirectories.push(directory);
  const migrationPath = join(directory, "0000_fixture.sql");
  await writeFile(migrationPath, contents.trimStart(), "utf8");
  return migrationPath;
}
