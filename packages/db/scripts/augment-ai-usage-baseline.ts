import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const markerStart = "-- ElevenHouse AI usage integrity objects: begin";
const markerEnd = "-- ElevenHouse AI usage integrity objects: end";
const statementBreakpoint = "--> statement-breakpoint";

const aiUsageIntegritySql = `CREATE OR REPLACE FUNCTION elevenhouse_guard_ai_usage_record_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $ai_usage_record_guard$
BEGIN
  IF ROW(
      OLD.id,
      OLD.feature,
      OLD.prompt_id,
      OLD.prompt_version,
      OLD.provider,
      OLD.owner_safety_id,
      OLD.resource_type,
      OLD.resource_id,
      OLD.source_checksum,
      OLD.started_at
    ) IS DISTINCT FROM ROW(
      NEW.id,
      NEW.feature,
      NEW.prompt_id,
      NEW.prompt_version,
      NEW.provider,
      NEW.owner_safety_id,
      NEW.resource_type,
      NEW.resource_id,
      NEW.source_checksum,
      NEW.started_at
    )
    OR OLD.status <> 'started'
    OR NEW.status NOT IN ('succeeded', 'failed', 'indeterminate') THEN
    RAISE EXCEPTION 'AI usage evidence permits one started-to-terminal transition'
      USING ERRCODE = '55000', CONSTRAINT = 'ai_usage_records_one_way_lifecycle';
  END IF;
  RETURN NEW;
END;
$ai_usage_record_guard$;
${statementBreakpoint}
CREATE TRIGGER "ai_usage_records_one_way_lifecycle"
BEFORE UPDATE ON ai_usage_records
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_ai_usage_record_mutation();`;

export async function augmentAiUsageBaseline(migrationPath: string): Promise<void> {
  const source = await readFile(migrationPath, "utf8");
  const markerCount = occurrences(source, markerStart);
  const endMarkerCount = occurrences(source, markerEnd);
  const block = `${markerStart}\n${aiUsageIntegritySql}\n${markerEnd}`;
  if (markerCount === 1 && endMarkerCount === 1 && source.includes(block)) return;
  if (markerCount !== 0 || endMarkerCount !== 0 || source.includes('CREATE TRIGGER "ai_usage_records_one_way_lifecycle"')) {
    throw new Error("Baseline contains partial or divergent AI usage integrity objects");
  }
  if (!source.includes('CREATE TABLE "ai_usage_records"')) {
    throw new Error("Generated baseline is missing ai_usage_records");
  }
  await writeFile(migrationPath, `${source.trimEnd()}\n${statementBreakpoint}\n${block}\n`, "utf8");
}

function occurrences(value: string, token: string): number {
  return value.split(token).length - 1;
}

async function main(): Promise<void> {
  const migrationsDirectory = join(import.meta.dirname, "..", "drizzle");
  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();
  const latest = files.at(-1);
  if (!latest) throw new Error("No Drizzle SQL migration exists to augment");
  await augmentAiUsageBaseline(join(migrationsDirectory, latest));
}

if (process.argv[1] === import.meta.filename) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
