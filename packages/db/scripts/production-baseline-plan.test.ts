import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { currentBaseline, isCurrentBaselineHistory } from "./production-baseline-plan";

describe("pre-launch production baseline identity", () => {
  it("matches the checked-in single baseline and accepts no predecessor ledger", () => {
    const migration = readFileSync("packages/db/drizzle/0000_sticky_rictor.sql");

    expect(createHash("sha256").update(migration).digest("hex")).toBe(currentBaseline.hash);
    expect(
      isCurrentBaselineHistory([
        { hash: currentBaseline.hash, created_at: currentBaseline.createdAt }
      ])
    ).toBe(true);
    expect(isCurrentBaselineHistory([])).toBe(false);
  });
});
