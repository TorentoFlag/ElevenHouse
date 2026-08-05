import { describe, expect, it } from "vitest";

import {
  assessProductionBaselinePreflight,
  type ProductionBaselinePreflightInput
} from "./production-baseline-preflight";
import {
  currentBaseline,
} from "./production-baseline-plan";

describe("production baseline read-only preflight", () => {
  it("accepts a fresh database and the exact current ledger", () => {
    expect(
      assessProductionBaselinePreflight(input({ ledgerExists: false, usersExists: false }))
    ).toEqual({ kind: "fresh" });
    expect(
      assessProductionBaselinePreflight(input({ migrations: [row(currentBaseline)] }))
    ).toEqual({ kind: "current" });
  });

  it("rejects every non-current ledger before the maintenance window", () => {
    expect(() =>
      assessProductionBaselinePreflight(
        input({ migrations: [{ hash: "f".repeat(64), created_at: "1" }] })
      )
    ).toThrow("PRODUCTION_BASELINE_PREFLIGHT_UNKNOWN_HISTORY");
  });

  it("rejects a database with application tables but no migration ledger", () => {
    expect(() =>
      assessProductionBaselinePreflight(input({ ledgerExists: false, usersExists: true }))
    ).toThrow("PRODUCTION_BASELINE_PREFLIGHT_LEDGER_MISSING");
  });
});

function input(
  overrides: Partial<ProductionBaselinePreflightInput>
): ProductionBaselinePreflightInput {
  return {
    ledgerExists: true,
    usersExists: true,
    migrations: [],
    ...overrides
  };
}

function row(identity: { readonly hash: string; readonly createdAt: string }) {
  return { hash: identity.hash, created_at: identity.createdAt };
}
