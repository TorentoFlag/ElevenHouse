import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  approvedLegacyMigrations,
  classifyBaselineHistory,
  currentBaseline,
  previousBaseline,
  schedulingBaselineDdl
} from "./production-baseline-plan";

const priorBaseline = {
  hash: "9502df7bc0155994014951df839fd556213d11e3c370cb5244d65a37a43d704e",
  createdAt: "1785010323027"
} as const;

const natalChartEngineBaseline = {
  hash: "ab1e22a3e02a0c428dfa01e90e48b5f037e66509ecf51fa5674e5e3ab2889b57",
  createdAt: "1784275401007"
} as const;

describe("production baseline transition plan", () => {
  it("matches the checked-in generated baseline hash and journal timestamp", () => {
    const migration = readFileSync("packages/db/drizzle/0000_sticky_rictor.sql");
    const journal = JSON.parse(
      readFileSync("packages/db/drizzle/meta/_journal.json", "utf8")
    ) as { entries: Array<{ when: number }> };

    expect(createHash("sha256").update(migration).digest("hex")).toBe(currentBaseline.hash);
    expect(String(journal.entries[0]?.when)).toBe(currentBaseline.createdAt);
  });

  it("accepts only explicit fresh, previous and calculation-legacy histories", () => {
    expect(classifyBaselineHistory([row(currentBaseline)])).toBe("current");
    expect(classifyBaselineHistory([row(previousBaseline), row(currentBaseline)])).toBe(
      "current"
    );
    expect(
      classifyBaselineHistory([row(priorBaseline), row(previousBaseline), row(currentBaseline)])
    ).toBe("current");
    expect(classifyBaselineHistory([row(previousBaseline)])).toBe("previous_current");
    expect(classifyBaselineHistory([row(priorBaseline), row(previousBaseline)])).toBe(
      "previous_current"
    );
    expect(
      classifyBaselineHistory([
        ...approvedLegacyMigrations.map(row),
        row(natalChartEngineBaseline)
      ])
    ).toBe("previous_current");
    expect(
      classifyBaselineHistory([
        ...approvedLegacyMigrations.map(row),
        row(natalChartEngineBaseline),
        row(currentBaseline)
      ])
    ).toBe("current");
    expect(
      classifyBaselineHistory([
        ...approvedLegacyMigrations.map(row),
        row(previousBaseline)
      ])
    ).toBe("previous_current");
    expect(classifyBaselineHistory(approvedLegacyMigrations.map(row))).toBe(
      "legacy_calculations"
    );
    expect(classifyBaselineHistory([{ hash: "f".repeat(64), created_at: "1" }])).toBe(
      "unknown"
    );
  });

  it("contains the owner-safe scheduling DDL and overlap invariant", () => {
    expect(schedulingBaselineDdl).toContain("ADD CONSTRAINT products_id_owner_unique");
    expect(schedulingBaselineDdl).toContain("CREATE TABLE IF NOT EXISTS availability_schedules");
    expect(schedulingBaselineDdl).toContain("CREATE TABLE IF NOT EXISTS manual_calendar_blocks");
    expect(schedulingBaselineDdl).toContain("CREATE TABLE IF NOT EXISTS bookings");
    expect(schedulingBaselineDdl).toContain("CREATE TABLE IF NOT EXISTS idempotency_commands");
    expect(schedulingBaselineDdl).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS idempotency_commands_scope_key_unique"
    );
    expect(schedulingBaselineDdl).toContain("conname = 'products_id_owner_unique'");
    expect(schedulingBaselineDdl).toContain(
      "schedule_reservations_active_owner_range_exclude"
    );
    expect(schedulingBaselineDdl).toContain(
      "tstzrange(occupied_start_at, occupied_end_at, '[)') WITH &&"
    );
  });
});

function row(migration: { readonly hash: string; readonly createdAt: string }): {
  readonly hash: string;
  readonly created_at: string;
} {
  return { hash: migration.hash, created_at: migration.createdAt };
}
