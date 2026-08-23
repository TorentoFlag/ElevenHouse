import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { flowEnrollmentRuntimeExtensionReviewReceivedUpgradeDdl } from "../../scripts/flow-enrollment-control-reconciliation";

describe("Flow enrollment control reconciliation", () => {
  it("recognizes the production review_received runtime extension predecessor", () => {
    const source = readFileSync(
      "packages/db/scripts/flow-enrollment-control-reconciliation.ts",
      "utf8"
    );

    expect(source).toContain("c261b45862c4d4bb941914fcd4ed3a6d1036a33c75f91966acf4e86abdb3ba35");
  });

  it("upgrades the runtime event shape check to review_first_published", () => {
    expect(flowEnrollmentRuntimeExtensionReviewReceivedUpgradeDdl).toContain(
      "DROP CONSTRAINT flow_runtime_events_normalized_shape_check"
    );
    expect(flowEnrollmentRuntimeExtensionReviewReceivedUpgradeDdl).toContain("'review_first_published'");
    expect(flowEnrollmentRuntimeExtensionReviewReceivedUpgradeDdl).not.toContain("'review_received'");
    expect(flowEnrollmentRuntimeExtensionReviewReceivedUpgradeDdl).toContain(
      "VALIDATE CONSTRAINT flow_runtime_events_normalized_shape_check"
    );
  });
});
