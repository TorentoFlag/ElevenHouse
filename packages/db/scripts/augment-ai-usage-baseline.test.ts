import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { augmentAiUsageBaseline } from "./augment-ai-usage-baseline";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("AI usage baseline augmenter", () => {
  it("adds one immutable usage trigger and is idempotent", async () => {
    const path = await fixture('CREATE TABLE "ai_usage_records" ("id" uuid PRIMARY KEY);');
    await augmentAiUsageBaseline(path);
    await augmentAiUsageBaseline(path);
    expect((await readFile(path, "utf8")).split('CREATE TRIGGER "ai_usage_records_one_way_lifecycle"')).toHaveLength(2);
  });

  it("fails closed for a partial integrity block", async () => {
    const path = await fixture('CREATE TABLE "ai_usage_records" ("id" uuid PRIMARY KEY);\nCREATE TRIGGER "ai_usage_records_one_way_lifecycle" BEFORE UPDATE ON ai_usage_records;');
    await expect(augmentAiUsageBaseline(path)).rejects.toThrow("partial or divergent AI usage integrity objects");
  });
});

async function fixture(contents: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "elevenhouse-ai-usage-baseline-"));
  directories.push(directory);
  const path = join(directory, "0000_fixture.sql");
  await writeFile(path, contents, "utf8");
  return path;
}
