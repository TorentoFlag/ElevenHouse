import { describe, expect, it } from "vitest";
import {
  canonicalizeFinanceOperationResourcePolicy,
  createFinanceOperationResourcePolicyDraft,
  publishFinanceOperationResourcePolicyDraft
} from "@elevenhouse/domain/finance-core";

import {
  FinanceOperationResourcePolicyReaderPersistenceError,
  mapFinanceOperationResourcePolicyVersion
} from "./drizzle-finance-operation-resource-policy-reader";

function publishedRow() {
  const version = publishFinanceOperationResourcePolicyDraft(
    createFinanceOperationResourcePolicyDraft({
      policyId: "client-checkout-limits",
      version: 1,
      operationKind: "client_checkout_prepare",
      maximumRows: 100,
      maximumDecimalDigits: 38,
      maximumArtifactBytes: 2_097_152
    })
  );
  return {
    policyId: version.policy.policyId,
    version: version.policy.version,
    operationKind: version.policy.operationKind,
    draftRevision: version.draftRevision,
    lifecycle: "published",
    maximumRows: version.policy.maximumRows,
    maximumDecimalDigits: version.policy.maximumDecimalDigits,
    maximumArtifactBytes: version.policy.maximumArtifactBytes,
    canonicalPreimage: canonicalizeFinanceOperationResourcePolicy(version.policy),
    canonicalDigest: version.policy.canonicalDigest,
    publishedAt: new Date("2026-08-04T10:00:00.000Z"),
    retiredAt: null
  };
}

describe("Drizzle finance operation resource policy reader", () => {
  it("rehydrates only an exact published envelope", () => {
    const row = publishedRow();
    expect(mapFinanceOperationResourcePolicyVersion(row as never)).toMatchObject({
      lifecycle: "published",
      policy: { policyId: "client-checkout-limits", maximumArtifactBytes: 2_097_152 }
    });
  });

  it("fails closed when the persisted canonical preimage or lifecycle is inconsistent", () => {
    expect(() =>
      mapFinanceOperationResourcePolicyVersion({ ...publishedRow(), canonicalPreimage: "{}" } as never)
    ).toThrow(FinanceOperationResourcePolicyReaderPersistenceError);
    expect(() =>
      mapFinanceOperationResourcePolicyVersion({
        ...publishedRow(),
        lifecycle: "published",
        publishedAt: null
      } as never)
    ).toThrow(FinanceOperationResourcePolicyReaderPersistenceError);
  });
});
