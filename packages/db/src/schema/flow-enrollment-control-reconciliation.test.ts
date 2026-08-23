import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Flow enrollment control reconciliation", () => {
  it("uses the committed-lineage runtime extension fingerprint", () => {
    const source = readFileSync(
      "packages/db/scripts/flow-enrollment-control-reconciliation.ts",
      "utf8"
    );

    expect(source).toContain("c261b45862c4d4bb941914fcd4ed3a6d1036a33c75f91966acf4e86abdb3ba35");
    expect(source).not.toContain("491ceadae67019e2060ecd9820a22d2bc7e9a512d50389687ebf203d2230bbdf");
  });
});
