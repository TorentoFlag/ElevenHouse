import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Test-only SQL view of the deployable, journal-ordered migration lineage. */
export function readCurrentMigrationSql(): string {
  const directory = join(process.cwd(), "packages/db/drizzle");
  return readdirSync(directory)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort()
    .map((file) => readFileSync(join(directory, file), "utf8"))
    .join("\n");
}
