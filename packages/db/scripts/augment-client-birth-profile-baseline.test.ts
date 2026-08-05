import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { augmentClientBirthProfileBaseline } from "./augment-client-birth-profile-baseline";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("client birth-profile baseline augmenter", () => {
  it("adds one append-only history trigger and is idempotent", async () => {
    const path = await fixture('CREATE TABLE "client_birth_data_history" ("id" uuid PRIMARY KEY);');
    await augmentClientBirthProfileBaseline(path);
    await augmentClientBirthProfileBaseline(path);
    expect((await readFile(path, "utf8")).split('CREATE TRIGGER "client_birth_data_history_append_only"')).toHaveLength(2);
  });

  it("fails closed for a partial history integrity block", async () => {
    const path = await fixture('CREATE TABLE "client_birth_data_history" ("id" uuid PRIMARY KEY);\nCREATE TRIGGER "client_birth_data_history_append_only" BEFORE UPDATE ON client_birth_data_history;');
    await expect(augmentClientBirthProfileBaseline(path)).rejects.toThrow("partial or divergent");
  });
});

async function fixture(contents: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "elevenhouse-client-birth-profile-baseline-"));
  directories.push(directory);
  const path = join(directory, "0000_fixture.sql");
  await writeFile(path, contents, "utf8");
  return path;
}
