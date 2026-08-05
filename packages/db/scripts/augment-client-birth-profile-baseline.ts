import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const markerStart = "-- ElevenHouse client birth-profile integrity objects: begin";
const markerEnd = "-- ElevenHouse client birth-profile integrity objects: end";
const statementBreakpoint = "--> statement-breakpoint";

const birthProfileIntegritySql = `CREATE OR REPLACE FUNCTION elevenhouse_reject_client_birth_data_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $client_birth_data_history_guard$
BEGIN
  RAISE EXCEPTION 'Client birth-data history is immutable'
    USING ERRCODE = '55000', CONSTRAINT = 'client_birth_data_history_append_only';
END;
$client_birth_data_history_guard$;
${statementBreakpoint}
CREATE TRIGGER "client_birth_data_history_append_only"
BEFORE UPDATE OR DELETE ON client_birth_data_history
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_reject_client_birth_data_history_mutation();
${statementBreakpoint}
CREATE TRIGGER "client_birth_data_history_reject_truncate"
BEFORE TRUNCATE ON client_birth_data_history
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_reject_client_birth_data_history_mutation();`;

export async function augmentClientBirthProfileBaseline(migrationPath: string): Promise<void> {
  const source = await readFile(migrationPath, "utf8");
  const markerCount = occurrences(source, markerStart);
  const endMarkerCount = occurrences(source, markerEnd);
  const block = `${markerStart}\n${birthProfileIntegritySql}\n${markerEnd}`;
  if (markerCount === 1 && endMarkerCount === 1 && source.includes(block)) return;
  if (
    markerCount !== 0 ||
    endMarkerCount !== 0 ||
    source.includes('CREATE TRIGGER "client_birth_data_history_append_only"')
  ) {
    throw new Error("Baseline contains partial or divergent client birth-profile integrity objects");
  }
  if (!source.includes('CREATE TABLE "client_birth_data_history"')) {
    throw new Error("Generated baseline is missing client_birth_data_history");
  }
  await writeFile(migrationPath, `${source.trimEnd()}\n${statementBreakpoint}\n${block}\n`, "utf8");
}

function occurrences(value: string, token: string): number {
  return value.split(token).length - 1;
}

async function main(): Promise<void> {
  const migrationsDirectory = join(fileURLToPath(new URL("..", import.meta.url)), "drizzle");
  const baselines = (await readdir(migrationsDirectory))
    .filter((file) => /^0000_.+\.sql$/.test(file))
    .sort();
  if (baselines.length !== 1 || !baselines[0]) {
    throw new Error(`Expected exactly one generated 0000 baseline, found ${baselines.length}`);
  }
  await augmentClientBirthProfileBaseline(join(migrationsDirectory, baselines[0]));
}

if (process.argv[1]?.endsWith("augment-client-birth-profile-baseline.ts")) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
