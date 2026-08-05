import { describe, expect, it } from "vitest";
import {
  buildUnverifiedPayoutReturnDirectCreditPosting,
  buildUnverifiedPayoutReturnWithoutDebitPosting
} from "./payout-return-posting";
import {
  buildApprovedPayoutReturnSuspenseReclassificationPosting,
  buildUnverifiedPayoutReturnSuspenseReclassificationPosting
} from "./payout-return-reclassification-posting";
import {
  componentBindingsFor,
  holdPayoutReceipt,
  holdPayoutTransitionCase,
  postingDecoderEnvelope,
  receiptDecoderEnvelope,
  receiptPostingInput
} from "./hold-payout-posting-test-fixtures";
import {
  payoutCoverageFixture,
  returnedPostingBase,
  returnedReceipt
} from "./payout-return-posting-test-fixtures";
import { payoutExposureBindingFixture } from "./payout-bank-exposure-test-fixtures";
import { suspenseReclassificationAuthority } from "./bank-suspense-reclassification-test-fixtures";
import { sha } from "./posting-test-primitives";

describe("payout returns", () => {
  it("returns without debit through outbound clearing and never touches bank cash", () => {
    const fixture = noDebitFixture();
    const recipe = buildUnverifiedPayoutReturnWithoutDebitPosting(
      fixture.input,
      postingDecoderEnvelope,
      receiptDecoderEnvelope
    );
    expect(recipe.transaction.entries.map(codeSide)).toEqual([
      ["bank_outbound_clearing", "debit"],
      ["astrologer_reserved", "credit"],
      ["astrologer_reserved", "credit"]
    ]);
    expect(recipe.transaction.entries.some((entry) => entry.account.code === "bank_cash")).toBe(
      false
    );
  });

  it("direct matched return debits bank cash once and preserves reserved receipt links", () => {
    const fixture = reflectedFixture("direct_match");
    const recipe = buildUnverifiedPayoutReturnDirectCreditPosting(
      fixture.input,
      postingDecoderEnvelope,
      receiptDecoderEnvelope
    );
    expect(recipe.transaction.sourceKey).toEqual({
      kind: "bank",
      sourceId: "returned-credit-statement-1",
      operation: "payout_return_credit_matched"
    });
    expect(recipe.transaction.entries.map(codeSide)).toEqual([
      ["bank_cash", "debit"],
      ["astrologer_reserved", "credit"],
      ["astrologer_reserved", "credit"]
    ]);
    expect(
      recipe.transaction.entries.filter((entry) => entry.account.code === "bank_cash")
    ).toHaveLength(1);
  });

  it("unknown-credit reclassification debits suspense, not cash, under the original statement source", () => {
    const fixture = reflectedFixture("unknown_credit_reclassification");
    const recipe = buildUnverifiedPayoutReturnSuspenseReclassificationPosting(
      fixture.input,
      postingDecoderEnvelope,
      receiptDecoderEnvelope
    );
    expect(recipe.transaction.sourceKey).toEqual({
      kind: "bank",
      sourceId: "unknown-return-validation-operation-statement-entry",
      operation: "suspense_reclassified"
    });
    expect(recipe.transaction.entries.map(codeSide)).toEqual([
      ["bank_unmatched_credit_suspense", "debit"],
      ["astrologer_reserved", "credit"],
      ["astrologer_reserved", "credit"]
    ]);
    expect(recipe.transaction.entries.some((entry) => entry.account.code === "bank_cash")).toBe(
      false
    );
    expect(() =>
      buildApprovedPayoutReturnSuspenseReclassificationPosting(
        fixture.input,
        postingDecoderEnvelope,
        receiptDecoderEnvelope
      )
    ).toThrowError(
      expect.objectContaining({ reason: "trusted_reclassification_commit_receipt_required" })
    );
  });

  it("rejects partial returns and proposed-allocation drift", () => {
    const direct = reflectedFixture("direct_match");
    if (direct.input.authority.kind !== "payout_return_direct_credit_posting") {
      throw new Error("direct fixture");
    }
    const partialDirectInput = {
      ...direct.input,
      authority: {
        ...direct.input.authority,
        evidence: {
          ...direct.input.authority.evidence,
          amount: { amountMinor: 8_999, currency: "RUB" }
        }
      }
    };
    expect(() =>
      buildUnverifiedPayoutReturnDirectCreditPosting(
        partialDirectInput,
        postingDecoderEnvelope,
        receiptDecoderEnvelope
      )
    ).toThrowError(expect.objectContaining({ reason: "amount_mismatch" }));

    const reclass = reflectedFixture("unknown_credit_reclassification");
    if (reclass.input.authority.kind !== "payout_return_suspense_reclassification_posting") {
      throw new Error("reclassification fixture");
    }
    const target = reclass.input.authority.reclassificationBinding.target;
    if (target.kind !== "returned_payout_credit") throw new Error("fixture target");
    const driftedReclassificationInput = {
      ...reclass.input,
      authority: {
        ...reclass.input.authority,
        reclassificationBinding: {
          ...reclass.input.authority.reclassificationBinding,
          target: {
            ...target,
            proposedAllocations: target.proposedAllocations.map((row, index) =>
              index === 0 ? { ...row, componentId: "forged-component" } : row
            )
          }
        }
      }
    };
    expect(() =>
      buildUnverifiedPayoutReturnSuspenseReclassificationPosting(
        driftedReclassificationInput,
        postingDecoderEnvelope,
        receiptDecoderEnvelope
      )
    ).toThrow();
  });
});

function noDebitFixture() {
  const receipt = holdPayoutReceipt("payout_returned_reserved");
  const sourceAuthority = holdPayoutTransitionCase("payout_returned_reserved").transition
    .historyRecord.authority;
  if (sourceAuthority?.kind !== "payout_return") throw new Error("missing return authority");
  const chain = exposureChain("bank-cash-pool-1");
  const returned = payoutExposureBindingFixture({
    previous: chain.paid,
    transitionKind: "returned_without_debit",
    exposureVersion: "4",
    status: "returned_without_debit",
    occurredAt: sourceAuthority.returnedAt,
    overrides: {
      ...chain.scope,
      transitionAuthorityRef: sourceRef(sourceAuthority, receipt)
    }
  });
  const base = receiptPostingInput(receipt);
  return {
    input: {
      ...base,
      authority: {
        kind: "payout_return_without_debit_posting" as const,
        sourceAuthority,
        receiptBinding: base.receiptBinding,
        exposureTransition: returned,
        priorClearingCoverage: payoutCoverageFixture(chain.paid, holdPayoutReceipt("payout_paid")),
        noDebitEvidenceRef: {
          kind: "payout_no_debit_outcome",
          evidenceId: sourceAuthority.evidenceId,
          canonicalDigest: sha("e")
        }
      },
      previousExposureBinding: chain.paid
    }
  };
}

function reflectedFixture(path: "direct_match" | "unknown_credit_reclassification") {
  const { receipt, sourceAuthority } = returnedReceipt(path);
  const pool = path === "direct_match" ? "bank-cash-pool-1" : "bank-pool-rub-1";
  const unknownPath = path === "unknown_credit_reclassification";
  const chain = exposureChain(pool, unknownPath);
  const statement = payoutExposureBindingFixture({
    previous: chain.paid,
    transitionKind: "statement_debit_reflected",
    exposureVersion: "4",
    status: "statement_reflected",
    occurredAt: unknownPath ? "2026-08-05T09:00:00Z" : "2026-09-04T03:00:00Z",
    overrides: chain.scope
  });
  const returned = payoutExposureBindingFixture({
    previous: statement,
    transitionKind: "return_credit_reflected",
    exposureVersion: "5",
    status: "returned_reflected",
    occurredAt: sourceAuthority.returnedAt,
    overrides: {
      ...chain.scope,
      transitionAuthorityRef: sourceRef(sourceAuthority, receipt)
    }
  });
  const base = returnedPostingBase(receipt);
  const common = {
    sourceAuthority,
    receiptBinding: base.receiptBinding,
    exposureTransition: returned,
    priorClearingCoverage: payoutCoverageFixture(
      chain.paid,
      holdPayoutReceipt("payout_paid"),
      9_000,
      unknownPath ? "2026-08-05T07:01:00Z" : "2026-09-04T02:01:00Z"
    )
  };
  if (path === "direct_match") {
    return {
      input: {
        ...base,
        authority: {
          kind: "payout_return_direct_credit_posting" as const,
          ...common,
          evidence: {
            kind: "bank_statement_entry" as const,
            classificationPath: "direct_match" as const,
            classificationAuthorityId: sourceAuthority.authorityId,
            classificationVersion: sourceAuthority.version,
            evidenceId: sourceAuthority.evidenceId,
            evidenceDigest: sha("f"),
            bankStatementEntryId: sourceAuthority.bankStatementEntryId,
            bankCashPoolId: pool,
            direction: "credit" as const,
            amount: chain.scope.amount,
            bookedAt: sourceAuthority.returnedAt,
            observedAt: sourceAuthority.returnedAt,
            sourceCheckpointId: "return-credit-checkpoint-1"
          }
        },
        previousExposureBinding: statement
      }
    };
  }
  const bindings = componentBindingsFor(receipt);
  const proposedAllocations = receipt.effects.map((effect, index) => ({
    astrologerUserId: receipt.astrologerUserId,
    amount: effect.amount,
    originalSaleId: effect.knownLinks.originalSaleId,
    componentId: bindings[index]?.componentId ?? "missing",
    payableLotId: effect.knownLinks.payableLotId,
    payoutAllocationId: effect.knownLinks.payoutAllocationId ?? "missing"
  }));
  const reclassificationBinding = suspenseReclassificationAuthority({
    direction: "credit",
    authorityId: sourceAuthority.suspenseReclassificationId as string,
    operationId: receipt.operationId,
    amountMinor: chain.scope.amount.amountMinor,
    originalAuthorityId: "unknown-return-validation-authority",
    originalOperationId: "unknown-return-validation-operation",
    target: {
      kind: "returned_payout_credit",
      payoutRequestId: sourceAuthority.payoutRequestId,
      proposedAllocations
    }
  });
  return {
    input: {
      ...base,
      authority: {
        kind: "payout_return_suspense_reclassification_posting" as const,
        ...common,
        reclassificationBinding
      },
      previousExposureBinding: statement
    }
  };
}

function exposureChain(bankCashPoolId: string, early = false) {
  const scope = {
    payoutRequestId: "receipt-payout",
    bankCashPoolId,
    amount: { amountMinor: 9_000, currency: "RUB" }
  } as const;
  const committed = payoutExposureBindingFixture({ overrides: scope });
  const initiated = payoutExposureBindingFixture({
    previous: committed,
    transitionKind: "bank_work_initiated",
    exposureVersion: "2",
    status: "initiated_unreflected",
    occurredAt: early ? "2026-08-05T06:00:00Z" : "2026-09-04T01:00:00Z",
    overrides: scope
  });
  const paid = payoutExposureBindingFixture({
    previous: initiated,
    transitionKind: "paid_proven",
    exposureVersion: "3",
    status: "paid_unreflected",
    occurredAt: early ? "2026-08-05T07:00:00Z" : "2026-09-04T02:00:00Z",
    overrides: scope
  });
  return { scope, paid };
}

function sourceRef(
  source: { kind: string; authorityId: string; version: number },
  receipt: { authorityRefs: readonly { canonicalDigest: string }[] }
) {
  return {
    kind: source.kind,
    authorityId: source.authorityId,
    version: source.version,
    canonicalDigest: receipt.authorityRefs[0]?.canonicalDigest
  };
}

function codeSide(entry: { account: { code: string }; side: string }) {
  return [entry.account.code, entry.side];
}
