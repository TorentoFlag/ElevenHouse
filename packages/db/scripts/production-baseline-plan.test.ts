import { describe, expect, it } from "vitest";

import { approvedLineage, isCurrentBaselineHistory } from "./production-baseline-plan";

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
});
