import { describe, expect, it } from "vitest";

import {
  FinanceOperationResourcePolicyError,
  createFinanceOperationResourcePolicyDraft,
  publishFinanceOperationResourcePolicyDraft,
  resolveFinanceOperationEnvelope,
  reviseFinanceOperationResourcePolicyDraft,
  verifyFinanceOperationResourcePolicyVersion
} from "./finance-operation-resource-policy";

function draftInput() {
  return {
    policyId: "client-checkout-limits",
    version: 1,
    operationKind: "client_checkout_prepare" as const,
    maximumRows: 100,
    maximumDecimalDigits: 38,
    maximumArtifactBytes: 2_097_152
  };
}

describe("finance operation resource policy", () => {
  it("seals an operation-specific, versioned safety envelope before it can be resolved", () => {
    const draft = createFinanceOperationResourcePolicyDraft(draftInput());
    const published = publishFinanceOperationResourcePolicyDraft(draft);
    const envelope = resolveFinanceOperationEnvelope({
      policy: published,
      operationKind: "client_checkout_prepare"
    });

    expect(draft.lifecycle).toBe("draft");
    expect(published.lifecycle).toBe("published");
    expect(published.policy.canonicalDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(envelope).toMatchObject({
      kind: "resolved_finance_operation_envelope",
      policyId: "client-checkout-limits",
      policyVersion: 1,
      policyDigest: published.policy.canonicalDigest,
      maximumRows: 100,
      maximumDecimalDigits: 38,
      maximumArtifactBytes: 2_097_152
    });
    expect(Object.isFrozen(envelope)).toBe(true);
  });

  it("rejects an unpublished, wrong-operation, or tampered policy instead of choosing limits implicitly", () => {
    const draft = createFinanceOperationResourcePolicyDraft(draftInput());
    const published = publishFinanceOperationResourcePolicyDraft(draft);
    const tampered = {
      ...published,
      policy: { ...published.policy, maximumArtifactBytes: 4_194_304 }
    };

    expect(() =>
      resolveFinanceOperationEnvelope({
        policy: draft,
        operationKind: "client_checkout_prepare"
      })
    ).toThrow(FinanceOperationResourcePolicyError);
    expect(() =>
      resolveFinanceOperationEnvelope({
        policy: published,
        operationKind: "refund_execute"
      })
    ).toThrow(FinanceOperationResourcePolicyError);
    expect(() => verifyFinanceOperationResourcePolicyVersion(tampered)).toThrow(
      FinanceOperationResourcePolicyError
    );
  });

  it("uses an optimistic draft revision and refuses invalid resource bounds", () => {
    const draft = createFinanceOperationResourcePolicyDraft(draftInput());
    const revised = reviseFinanceOperationResourcePolicyDraft({
      current: draft,
      expectedDraftRevision: 1,
      next: { ...draftInput(), maximumRows: 200 }
    });

    expect(revised.draftRevision).toBe(2);
    expect(revised.policy.maximumRows).toBe(200);
    expect(() =>
      createFinanceOperationResourcePolicyDraft({ ...draftInput(), maximumArtifactBytes: 0 })
    ).toThrow(FinanceOperationResourcePolicyError);
    expect(() =>
      reviseFinanceOperationResourcePolicyDraft({
        current: revised,
        expectedDraftRevision: 1,
        next: draftInput()
      })
    ).toThrow(FinanceOperationResourcePolicyError);
  });
});
