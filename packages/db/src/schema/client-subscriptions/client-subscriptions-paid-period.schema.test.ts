import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("client subscription paid-period schema", () => {
  it("does not keep the recurring cancellation timestamp column in the source schema", () => {
    const schemaSource = readFileSync(
      "packages/db/src/schema/client-subscriptions/client-subscriptions.schema.ts",
      "utf8"
    );

    expect(schemaSource).not.toContain("cancellation_effective_at");
    expect(schemaSource).not.toContain("cancellationEffectiveAt");
  });
});
