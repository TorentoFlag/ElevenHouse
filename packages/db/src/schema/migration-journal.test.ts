import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";

describe("Drizzle migration journal", () => {
  it("contains every tracked SQL migration file", () => {
    const trackedSqlFiles = execFileSync("git", ["ls-files", "packages/db/drizzle/*.sql"])
      .toString("utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((filePath) => basename(filePath, ".sql"));
    const journal = JSON.parse(readFileSync("packages/db/drizzle/meta/_journal.json", "utf8")) as {
      readonly entries: readonly { readonly tag: string }[];
    };
    const journalTags = new Set(journal.entries.map((entry) => entry.tag));

    expect(trackedSqlFiles.filter((tag) => !journalTags.has(tag))).toEqual([]);
  });

  it("keeps WhatsApp provider schema in every snapshot after the provider migration", () => {
    for (const snapshotPath of [
      "packages/db/drizzle/meta/0060_snapshot.json",
      "packages/db/drizzle/meta/0061_snapshot.json",
      "packages/db/drizzle/meta/0062_snapshot.json"
    ]) {
      const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as {
        readonly tables: Record<string, unknown>;
      };

      expect(snapshot.tables).toHaveProperty("public.messaging_whatsapp_cloud_accounts");
      expect(snapshot.tables).toHaveProperty("public.messaging_provider_webhook_events");
    }
  });

  it("archives the legacy recurring AstroDiary product template without touching the paid-period template", () => {
    const migration = readFileSync(
      "packages/db/drizzle/0063_archive_legacy_astro_diary_subscription_template.sql",
      "utf8"
    );

    expect(migration).toContain(`where "code" = 'astro_diary_subscription'`);
    expect(migration).toContain(`and "status" = 'active'`);
    expect(migration).not.toContain("astro_diary_paid_period");
  });
});
