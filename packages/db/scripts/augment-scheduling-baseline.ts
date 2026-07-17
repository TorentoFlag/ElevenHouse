import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const extensionStatement = "CREATE EXTENSION IF NOT EXISTS btree_gist;";
const exclusionConstraintName = "schedule_reservations_active_owner_range_exclude";
const statementBreakpoint = "--> statement-breakpoint";
const exclusionStatement = `ALTER TABLE "schedule_reservations"
  ADD CONSTRAINT "${exclusionConstraintName}"
  EXCLUDE USING gist (
    "owner_user_id" WITH =,
    tstzrange("occupied_start_at", "occupied_end_at", '[)') WITH &&
  ) WHERE ("lifecycle" = 'active');`;

export async function augmentSchedulingBaseline(migrationPath: string): Promise<void> {
  const source = await readFile(migrationPath, "utf8");
  assertReservationShape(source);

  const extensionCount = countOccurrences(source, extensionStatement);
  const constraintCount = countOccurrences(source, exclusionConstraintName);
  if (extensionCount > 1) throw new Error("Scheduling baseline contains duplicate btree_gist setup");
  if (constraintCount > 1) {
    throw new Error("Scheduling baseline contains duplicate active-range exclusion constraints");
  }

  let augmented = source;
  if (extensionCount === 0) {
    augmented = `${extensionStatement}\n${statementBreakpoint}\n${augmented}`;
  }
  if (constraintCount === 0) {
    augmented = `${augmented.trimEnd()}\n${statementBreakpoint}\n${exclusionStatement}\n`;
  }

  if (augmented !== source) await writeFile(migrationPath, augmented, "utf8");
}

function assertReservationShape(source: string): void {
  const requiredFragments = [
    'CREATE TABLE "schedule_reservations"',
    '"owner_user_id" uuid NOT NULL',
    '"lifecycle" text',
    '"occupied_start_at" timestamp with time zone NOT NULL',
    '"occupied_end_at" timestamp with time zone NOT NULL'
  ];
  for (const fragment of requiredFragments) {
    if (!source.includes(fragment)) {
      throw new Error(`Cannot augment scheduling baseline: missing schedule_reservations table shape (${fragment})`);
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
  await augmentSchedulingBaseline(migrationPath);
  console.log(`Scheduling constraints verified in ${migrationPath}`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
