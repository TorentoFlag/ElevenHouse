import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { augmentSchedulingBaseline } from "./augment-scheduling-baseline";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("scheduling baseline augmenter", () => {
  it("adds the extension and named exclusion exactly once", async () => {
    const migrationPath = await createFixture(`
CREATE TABLE "schedule_reservations" (
  "owner_user_id" uuid NOT NULL,
  "lifecycle" text NOT NULL,
  "occupied_start_at" timestamp with time zone NOT NULL,
  "occupied_end_at" timestamp with time zone NOT NULL
);
`);

    await augmentSchedulingBaseline(migrationPath);
    await augmentSchedulingBaseline(migrationPath);

    const migration = await readFile(migrationPath, "utf8");
    expect(migration.match(/CREATE EXTENSION IF NOT EXISTS btree_gist;/g)).toHaveLength(1);
    expect(
      migration.match(/schedule_reservations_active_owner_range_exclude/g)
    ).toHaveLength(1);
  });

  it("fails closed when the generated reservation table is absent", async () => {
    const migrationPath = await createFixture('CREATE TABLE "users" ("id" uuid PRIMARY KEY);\n');

    await expect(augmentSchedulingBaseline(migrationPath)).rejects.toThrow(
      "schedule_reservations table"
    );
  });
});

async function createFixture(contents: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "elevenhouse-scheduling-baseline-"));
  temporaryDirectories.push(directory);
  const migrationPath = join(directory, "0000_fixture.sql");
  await writeFile(migrationPath, contents.trimStart(), "utf8");
  return migrationPath;
}
