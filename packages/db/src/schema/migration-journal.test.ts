import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";

describe("Drizzle migration journal", () => {
  it("contains every tracked SQL migration file", () => {
    const trackedSqlFiles = execFileSync("git", [
      "ls-files",
      "packages/db/drizzle/*.sql"
    ])
      .toString("utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((filePath) => basename(filePath, ".sql"));
    const journal = JSON.parse(
      readFileSync("packages/db/drizzle/meta/_journal.json", "utf8")
    ) as {
      readonly entries: readonly { readonly tag: string }[];
    };
    const journalTags = new Set(journal.entries.map((entry) => entry.tag));

    expect(trackedSqlFiles.filter((tag) => !journalTags.has(tag))).toEqual([]);
  });
});
