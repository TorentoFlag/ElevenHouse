import { describe, expect, it } from "vitest";

import {
  approvedLineage,
  isApprovedBaselinePrefix,
  isCurrentBaselineHistory
} from "./production-baseline-plan";

describe("pre-launch production baseline identity", () => {
  it("accepts exactly the checked-in ordered lineage", () => {
    expect(
      isCurrentBaselineHistory(
        approvedLineage.map((migration) => ({ hash: migration.hash, created_at: migration.createdAt }))
      )
    ).toBe(true);
    expect(
      isCurrentBaselineHistory([
        { hash: "0".repeat(64), created_at: approvedLineage[0]!.createdAt },
        ...approvedLineage.slice(1).map((migration) => ({ hash: migration.hash, created_at: migration.createdAt }))
      ])
    ).toBe(false);
    expect(isCurrentBaselineHistory([])).toBe(false);
  });

  it("accepts non-empty checked-in lineage prefixes without weakening exact current checks", () => {
    const prefix = approvedLineage
      .slice(0, 17)
      .map((migration) => ({ hash: migration.hash, created_at: migration.createdAt }));

    expect(isApprovedBaselinePrefix(prefix)).toBe(true);
    expect(isCurrentBaselineHistory(prefix)).toBe(false);
    expect(isApprovedBaselinePrefix([])).toBe(false);
    expect(
      isApprovedBaselinePrefix([
        { hash: "0".repeat(64), created_at: approvedLineage[0]!.createdAt },
        ...prefix.slice(1)
      ])
    ).toBe(false);
  });
});
