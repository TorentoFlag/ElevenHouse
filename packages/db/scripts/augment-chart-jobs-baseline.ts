import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const statementBreakpoint = "--> statement-breakpoint";
const markerStart = "-- ElevenHouse chart job result checksum integrity: begin";
const markerEnd = "-- ElevenHouse chart job result checksum integrity: end";
const triggerSignature = 'CREATE TRIGGER "chart_calculation_jobs_result_checksum_immutable"';

export const chartJobResultChecksumGuardDdl = `CREATE OR REPLACE FUNCTION elevenhouse_guard_chart_job_result_checksum_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $chart_job_result_checksum_guard$
BEGIN
  IF OLD.result_checksum IS NOT NULL
     AND OLD.result_checksum IS DISTINCT FROM NEW.result_checksum THEN
    RAISE EXCEPTION 'succeeded chart job result checksum is immutable'
      USING ERRCODE = '55000',
            CONSTRAINT = 'chart_calculation_jobs_result_checksum_immutable';
  END IF;

  RETURN NEW;
END;
$chart_job_result_checksum_guard$;

CREATE TRIGGER "chart_calculation_jobs_result_checksum_immutable"
BEFORE UPDATE OF result_checksum ON chart_calculation_jobs
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_chart_job_result_checksum_mutation();`;

const baselineIntegritySql = chartJobResultChecksumGuardDdl.replace(
  "\n\nCREATE TRIGGER",
  `\n${statementBreakpoint}\nCREATE TRIGGER`
);

export async function augmentChartJobsBaseline(migrationPath: string): Promise<void> {
  const source = await readFile(migrationPath, "utf8");
  assertCanonicalShape(source);

  const markerCount = countOccurrences(source, markerStart);
  const endMarkerCount = countOccurrences(source, markerEnd);
  if (markerCount > 0 || endMarkerCount > 0) {
    const expectedBlock = `${markerStart}\n${baselineIntegritySql}\n${markerEnd}`;
    if (
      markerCount !== 1 ||
      endMarkerCount !== 1 ||
      !source.includes(expectedBlock) ||
      countOccurrences(source, triggerSignature) !== 1
    ) {
      throw new Error("Cannot augment baseline: partial or divergent chart job integrity objects");
    }
    return;
  }

  if (source.includes(triggerSignature)) {
    throw new Error("Cannot augment baseline: partial or divergent chart job integrity objects");
  }

  const augmented = `${source.trimEnd()}\n${statementBreakpoint}\n${markerStart}\n${baselineIntegritySql}\n${markerEnd}\n`;
  await writeFile(migrationPath, augmented, "utf8");
}

function assertCanonicalShape(source: string): void {
  const requiredFragments = [
    'CREATE TABLE "chart_calculation_jobs"',
    '"result_checksum" text',
    'CONSTRAINT "chart_calculation_jobs_result_checksum_check"',
    'CONSTRAINT "chart_calculation_jobs_lease_state_check"',
    '"chart_calculation_jobs"."schema_version" = \'chart-result.v1\'',
    '"chart_calculation_jobs"."result_checksum" is not null'
  ];
  for (const fragment of requiredFragments) {
    if (!source.includes(fragment)) {
      const reason =
        fragment === '"result_checksum" text'
          ? "canonical chart job result checksum"
          : `required generated shape (${fragment})`;
      throw new Error(`Cannot augment baseline: missing ${reason}`);
    }
  }
}

function countOccurrences(source: string, fragment: string): number {
  return source.split(fragment).length - 1;
}

async function findCurrentBaseline(): Promise<string> {
  const migrationDirectory = join(__dirname, "../drizzle");
  const baselines = (await readdir(migrationDirectory))
    .filter((entry) => /^0000_.+\.sql$/.test(entry))
    .sort();
  if (baselines.length !== 1) {
    throw new Error(`Expected exactly one generated 0000 baseline, found ${baselines.length}`);
  }
  return join(migrationDirectory, baselines[0]!);
}

async function main(): Promise<void> {
  const migrationPath = await findCurrentBaseline();
  await augmentChartJobsBaseline(migrationPath);
  console.log(`Chart job result checksum integrity verified in ${migrationPath}`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
