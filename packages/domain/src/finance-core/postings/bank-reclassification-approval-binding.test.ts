import { describe, expect, it } from "vitest";
import { buildUnverifiedBankCreditSuspenseReclassificationRecipe as buildUnverifiedBankCreditSuspenseReclassificationRecipeWithEnvelope } from "./bank-suspense-reclassification";
import { expectPostingError, rehashApprovalBinding } from "./bank-posting-test-assertions";
import { validCreditMerchantReclassificationInput } from "./bank-suspense-reclassification-test-fixtures";
import { sha, withPostingDecoderEnvelope } from "./posting-test-primitives";

const buildUnverifiedBankCreditSuspenseReclassificationRecipe = withPostingDecoderEnvelope(
  buildUnverifiedBankCreditSuspenseReclassificationRecipeWithEnvelope
);

describe("bank reclassification approval binding", () => {
  it("binds reclassification approval to the exact prior unknown operation", () => {
    const input = validCreditMerchantReclassificationInput();
    expectPostingError(
      () =>
        buildUnverifiedBankCreditSuspenseReclassificationRecipe({
          ...input,
          authority: {
            ...input.authority,
            originalUnknown: {
              ...input.authority.originalUnknown,
              operationId: "substituted-unknown-operation",
              sourceKey: {
                kind: "bank",
                sourceId: "substituted-unknown-operation",
                operation: "unknown_credit_recorded"
              }
            }
          }
        } as never),
      "source_mismatch"
    );
  });

  it("uses the immutable original bank statement entry as reclassification source identity", () => {
    const input = validCreditMerchantReclassificationInput();
    const recipe = buildUnverifiedBankCreditSuspenseReclassificationRecipe(input);

    expect(recipe.transaction.sourceKey).toEqual({
      kind: "bank",
      sourceId: input.authority.originalUnknown.bankStatementEntryId,
      operation: "suspense_reclassified"
    });
    expect(recipe.linkProof.sourceEvidenceRef).toEqual({
      kind: "bank_reclassification_approval_binding",
      evidenceId: input.authority.approvalBinding.bindingId,
      canonicalDigest: input.authority.approvalBinding.bindingDigest
    });
  });

  it("rejects substitution of both context and original bank-statement IDs under the old binding", () => {
    const input = validCreditMerchantReclassificationInput();
    const substitutedId = "substituted-statement-entry";
    expectPostingError(
      () =>
        buildUnverifiedBankCreditSuspenseReclassificationRecipe({
          ...input,
          context: {
            ...input.context,
            sourceKey: { ...input.context.sourceKey, sourceId: substitutedId }
          },
          authority: {
            ...input.authority,
            originalUnknown: {
              ...input.authority.originalUnknown,
              bankStatementEntryId: substitutedId,
              sourceKey: {
                ...input.authority.originalUnknown.sourceKey,
                sourceId: substitutedId
              }
            }
          }
        } as never),
      "authority_mismatch"
    );
  });

  it.each([
    ["invalid journal digest", { journalTransactionDigest: "sha256:bad" }, "invalid_digest"],
    [
      "original journal time inversion",
      { occurredAt: "2026-08-05T08:04:00Z", postedAt: "2026-08-05T08:03:00Z" },
      "invalid_chronology"
    ],
    [
      "original journal posted after approval",
      { postedAt: "2026-08-06T09:00:01Z" },
      "invalid_chronology"
    ]
  ] as const)("rejects %s in the original unknown journal reference", (_name, patch, reason) => {
    const input = validCreditMerchantReclassificationInput();
    expectPostingError(
      () =>
        buildUnverifiedBankCreditSuspenseReclassificationRecipe({
          ...input,
          authority: {
            ...input.authority,
            originalUnknown: { ...input.authority.originalUnknown, ...patch }
          }
        } as never),
      reason
    );
  });

  it("binds the exact original unknown journal digest into the approval payload", () => {
    const input = validCreditMerchantReclassificationInput();
    expectPostingError(
      () =>
        buildUnverifiedBankCreditSuspenseReclassificationRecipe({
          ...input,
          authority: {
            ...input.authority,
            originalUnknown: {
              ...input.authority.originalUnknown,
              journalTransactionDigest: sha("9")
            }
          }
        } as never),
      "authority_mismatch"
    );
  });

  it("binds reclassification approval to the exact closed-union target", () => {
    const input = validCreditMerchantReclassificationInput();
    if (input.authority.target.kind !== "merchant_payout_credit") {
      throw new Error("expected merchant payout fixture");
    }
    const target = input.authority.target;
    expectPostingError(
      () =>
        buildUnverifiedBankCreditSuspenseReclassificationRecipe({
          ...input,
          authority: {
            ...input.authority,
            target: {
              ...target,
              exposureBinding: {
                ...target.exposureBinding,
                merchantPayoutId: "substituted-merchant-payout"
              }
            }
          }
        } as never),
      "evidence_mismatch"
    );
  });

  it.each([
    ["payload hash", { payloadHash: sha("2") }],
    ["binding digest", { bindingDigest: sha("3") }],
    ["issued time", { issuedAt: "2026-08-06T08:59:59Z" }]
  ])("rejects a mismatched unverified approval binding %s", (_name, patch) => {
    const input = validCreditMerchantReclassificationInput();
    expectPostingError(
      () =>
        buildUnverifiedBankCreditSuspenseReclassificationRecipe({
          ...input,
          authority: {
            ...input.authority,
            approvalBinding: { ...input.authority.approvalBinding, ...patch }
          }
        } as never),
      "evidence_mismatch"
    );
  });

  it.each(["actor", "authorization"] as const)(
    "rejects identical maker/checker %s identity",
    (identity) => {
      const input = validCreditMerchantReclassificationInput();
      const maker = input.authority.approvalBinding.makerBinding;
      const checker = input.authority.approvalBinding.checkerBinding;
      const checkerBinding = {
        ...checker,
        ...(identity === "actor"
          ? { actorUserId: maker.actorUserId }
          : { authorizationId: maker.authorizationId })
      };
      const approvalBinding = rehashApprovalBinding({
        ...input.authority.approvalBinding,
        checkerBinding
      });

      expectPostingError(
        () =>
          buildUnverifiedBankCreditSuspenseReclassificationRecipe({
            ...input,
            authority: { ...input.authority, approvalBinding }
          } as never),
        "authority_mismatch"
      );
    }
  );

  it.each([
    ["action", { actionKind: "payout_approve" }],
    ["aggregate", { aggregateId: "another-statement-entry" }],
    ["version", { expectedVersion: 2 }],
    ["payload", { payloadHash: sha("4") }]
  ])("binds consumed maker authorization to exact %s", (_name, authorizationPatch) => {
    const input = validCreditMerchantReclassificationInput();
    const approvalBinding = rehashApprovalBinding({
      ...input.authority.approvalBinding,
      makerBinding: {
        ...input.authority.approvalBinding.makerBinding,
        ...authorizationPatch
      }
    });

    expectPostingError(
      () =>
        buildUnverifiedBankCreditSuspenseReclassificationRecipe({
          ...input,
          authority: { ...input.authority, approvalBinding }
        } as never),
      "authority_mismatch"
    );
  });

  it("rejects the old self-authored maker-checker evidence shape", () => {
    const input = validCreditMerchantReclassificationInput();
    expectPostingError(
      () =>
        buildUnverifiedBankCreditSuspenseReclassificationRecipe({
          ...input,
          authority: {
            ...input.authority,
            approvalBinding: {
              kind: "maker_checker_bank_reclassification_approval",
              evidenceId: "plain-evidence",
              evidenceDigest: sha("5")
            }
          }
        } as never),
      "invalid_shape"
    );
  });
});
