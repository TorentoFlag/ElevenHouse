import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  buildUnverifiedPayoutApprovalNoPosting,
  buildUnverifiedPayoutBankWorkInitiatedNoPosting
} from "./payout-state-no-posting";
import {
  componentBindingsFor,
  holdPayoutReceipt,
  postingDecoderEnvelope,
  receiptAuthorityBindingFor,
  receiptDecoderEnvelope
} from "./hold-payout-posting-test-fixtures";
import { payoutExposureBindingFixture } from "./payout-bank-exposure-test-fixtures";
import { expectPostingError } from "./posting-test-assertions";
import { sha } from "./posting-test-primitives";

const amount = Object.freeze({ amountMinor: 9_000, currency: "RUB" as const });
const beneficiarySnapshot = Object.freeze({
  snapshotId: "beneficiary-snapshot-1",
  schemaVersion: 1,
  fingerprint: "beneficiary-fingerprint-1",
  canonicalDigest: sha("b")
});

describe("payout state-only postings", () => {
  it("binds exact liquidity, beneficiary, authorization and null-to-committed exposure", () => {
    const authority = approvalAuthority();
    const result = buildUnverifiedPayoutApprovalNoPosting(
      approvalInput(authority),
      postingDecoderEnvelope,
      receiptDecoderEnvelope
    );
    expect(result).toEqual({
      kind: "no_posting",
      authorizationStatus: "unverified",
      atomicityStatus: "unverified",
      eventKey: { kind: "payout_state", sourceId: "receipt-payout", operation: "approved" },
      reason: "payout_state_only",
      authorityRef: {
        kind: "payout_approval_no_posting",
        authorityId: "payout-approval-1",
        version: 1,
        canonicalDigest: authority.authorizationProof.payloadHash
      },
      operationSnapshotRef: null
    });
  });

  it("rejects a payout approval backed only by a self-reported request receipt binding", () => {
    expectPostingError(
      () =>
        buildUnverifiedPayoutApprovalNoPosting(
          { authority: approvalAuthority(), previousExposureBinding: null },
          postingDecoderEnvelope,
          receiptDecoderEnvelope
        ),
      "invalid_shape"
    );
  });

  it.each([
    ["request amount", approvalAuthority({ amountMinor: 8_999 }), "amount_mismatch"],
    [
      "request astrologer",
      approvalAuthority({ astrologerUserId: "another-astrologer" }),
      "authority_mismatch"
    ],
    [
      "request identity and receipt digest",
      approvalAuthority({
        payoutRequestId: "another-payout-request",
        requestReceiptBinding: requestBindingFor("another-payout-request")
      }),
      "proof_operation_receipt_mismatch"
    ]
  ] as const)("rejects approval drift from the actual %s", (_label, authority, reason) => {
    expectPostingError(
      () =>
        buildUnverifiedPayoutApprovalNoPosting(
          approvalInput(authority),
          postingDecoderEnvelope,
          receiptDecoderEnvelope
        ),
      reason
    );
  });

  it("normalizes the receipt envelope before reading a hostile approval input", () => {
    const target = hostileProxy(approvalInput(approvalAuthority()));
    const receiptEnvelope = hostileProxy(receiptDecoderEnvelope);

    expectPostingError(
      () =>
        buildUnverifiedPayoutApprovalNoPosting(
          target.value as never,
          postingDecoderEnvelope,
          receiptEnvelope.value as never
        ),
      "proof_operation_receipt_mismatch"
    );
    expect(target.trapCalls()).toBe(0);
    expect(receiptEnvelope.trapCalls()).toBe(0);
  });

  it("advances the same immutable exposure from committed to initiated", () => {
    const approval = approvalAuthority();
    const committed = approval.exposureTransition;
    const authority = initiatedAuthority(committed);
    const result = buildUnverifiedPayoutBankWorkInitiatedNoPosting(
      { authority, previousExposureBinding: committed },
      postingDecoderEnvelope
    );
    expect(result.eventKey).toEqual({
      kind: "payout_state",
      sourceId: "receipt-payout",
      operation: "bank_work_initiated"
    });
  });

  it.each([
    [
      "payout version",
      (value: ReturnType<typeof approvalAuthority>) => ({
        ...value,
        payoutState: { ...value.payoutState, nextVersion: "5" }
      })
    ],
    [
      "liquidity version",
      (value: ReturnType<typeof approvalAuthority>) => ({
        ...value,
        liquidityDecision: rehash(
          { ...value.liquidityDecision, nextLiquidityRevision: "12" },
          "bindingDigest"
        )
      })
    ],
    [
      "beneficiary",
      (value: ReturnType<typeof approvalAuthority>) => ({
        ...value,
        beneficiarySnapshot: { ...value.beneficiarySnapshot, fingerprint: "changed" }
      })
    ],
    [
      "pool",
      (value: ReturnType<typeof approvalAuthority>) => ({
        ...value,
        bankCashPoolId: "another-pool"
      })
    ],
    [
      "proof payload",
      (value: ReturnType<typeof approvalAuthority>) => ({
        ...value,
        authorizationProof: { ...value.authorizationProof, payloadHash: sha("f") }
      })
    ]
  ] as const)("rejects stale or drifting %s", (_label, mutate) => {
    const authority = mutate(approvalAuthority());
    expect(() =>
      buildUnverifiedPayoutApprovalNoPosting(
        approvalInput(authority),
        postingDecoderEnvelope,
        receiptDecoderEnvelope
      )
    ).toThrow();
  });
});

function approvalAuthority(
  options: Readonly<{
    payoutRequestId?: string;
    astrologerUserId?: string;
    amountMinor?: number;
    requestReceiptBinding?: ReturnType<typeof receiptAuthorityBindingFor>;
  }> = {}
) {
  const payoutRequestId = options.payoutRequestId ?? "receipt-payout";
  const astrologerUserId = options.astrologerUserId ?? "astrologer-1";
  const requestAmount = Object.freeze({
    amountMinor: options.amountMinor ?? amount.amountMinor,
    currency: "RUB" as const
  });
  const receiptBinding =
    options.requestReceiptBinding ??
    receiptAuthorityBindingFor(holdPayoutReceipt("payout_requested"));
  const liquidityCore = {
    kind: "unverified_payout_bank_liquidity_decision_binding" as const,
    schemaVersion: 1 as const,
    bindingId: "liquidity-binding-1",
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    decisionId: "liquidity-decision-1",
    decisionVersion: "1",
    payoutRequestId,
    bankCashPoolId: "bank-cash-pool-1",
    amount: requestAmount,
    balanceBasis: "unrestricted_available" as const,
    snapshotId: "bank-snapshot-1",
    snapshotVersion: "1",
    snapshotDigest: sha("c"),
    sourceCheckpointId: "bank-checkpoint-1",
    expectedLiquidityRevision: "10",
    nextLiquidityRevision: "11",
    decision: "sufficient" as const,
    decidedAt: "2026-09-04T00:30:00Z"
  };
  const liquidityDecision = {
    ...liquidityCore,
    bindingDigest: hashFinanceCommandPayload(liquidityCore)
  };
  const commandCore = {
    kind: "payout_approval_no_posting" as const,
    authorityId: "payout-approval-1",
    version: 1,
    payoutRequestId,
    astrologerUserId,
    amount: requestAmount,
    beneficiarySnapshot,
    bankCashPoolId: "bank-cash-pool-1",
    payoutState: {
      expectedVersion: "3",
      from: "under_review" as const,
      nextVersion: "4",
      to: "approved" as const
    },
    requestReceiptBinding: receiptBinding,
    liquidityDecision,
    approvedAt: "2026-09-04T01:00:00Z"
  };
  const digest = hashFinanceCommandPayload(commandCore);
  const exposureTransition = payoutExposureBindingFixture({
    overrides: {
      payoutRequestId: commandCore.payoutRequestId,
      astrologerUserId: commandCore.astrologerUserId,
      beneficiarySnapshot,
      amount: requestAmount,
      transitionAuthorityRef: {
        kind: commandCore.kind,
        authorityId: commandCore.authorityId,
        version: commandCore.version,
        canonicalDigest: digest
      },
      occurredAt: commandCore.approvedAt
    }
  });
  return Object.freeze({
    ...commandCore,
    exposureTransition,
    authorizationProof: proof("payout_approve", "finance-approver-1", 3, digest, payoutRequestId)
  });
}

function initiatedAuthority(committed: ReturnType<typeof payoutExposureBindingFixture>) {
  const commandCore = {
    kind: "payout_bank_work_initiated_no_posting" as const,
    authorityId: "payout-initiation-1",
    version: 1,
    payoutRequestId: "receipt-payout",
    amount,
    beneficiarySnapshot,
    bankCashPoolId: "bank-cash-pool-1",
    payoutState: {
      expectedVersion: "4",
      from: "approved" as const,
      nextVersion: "5",
      to: "processing_manual" as const
    },
    initiatedAt: "2026-09-04T01:30:00Z"
  };
  const digest = hashFinanceCommandPayload(commandCore);
  const exposureTransition = payoutExposureBindingFixture({
    previous: committed,
    transitionKind: "bank_work_initiated",
    exposureVersion: "2",
    status: "initiated_unreflected",
    occurredAt: commandCore.initiatedAt,
    overrides: {
      payoutRequestId: commandCore.payoutRequestId,
      astrologerUserId: "astrologer-1",
      beneficiarySnapshot,
      amount,
      transitionAuthorityRef: {
        kind: commandCore.kind,
        authorityId: commandCore.authorityId,
        version: commandCore.version,
        canonicalDigest: digest
      }
    }
  });
  return Object.freeze({
    ...commandCore,
    exposureTransition,
    authorizationProof: proof("payout_start_processing", "bank-operator-1", 4, digest)
  });
}

function proof(
  actionKind: "payout_approve" | "payout_start_processing",
  actorUserId: string,
  expectedVersion: number,
  payloadHash: ReturnType<typeof hashFinanceCommandPayload>,
  aggregateId = "receipt-payout"
) {
  return Object.freeze({
    authorizationId: `authorization-${actionKind}`,
    actorUserId,
    sessionId: `session-${actionKind}`,
    actionKind,
    aggregateId,
    expectedVersion,
    payloadHash,
    verifiedAt: "2026-09-04T00:20:00Z",
    expiresAt: "2026-09-04T02:00:00Z",
    status: "consumed" as const
  });
}

function approvalInput(authority: unknown) {
  const requestReceipt = holdPayoutReceipt("payout_requested");
  return Object.freeze({
    authority,
    previousExposureBinding: null,
    requestReceipt: Object.freeze({
      operationReceipt: requestReceipt,
      componentBindings: componentBindingsFor(requestReceipt)
    })
  });
}

function requestBindingFor(payoutRequestId: string) {
  const binding = receiptAuthorityBindingFor(holdPayoutReceipt("payout_requested"));
  return rehash(
    {
      ...binding,
      sourceKey: {
        kind: "payout" as const,
        sourceId: payoutRequestId,
        operation: "requested" as const
      }
    },
    "bindingDigest"
  );
}

function hostileProxy<T extends object>(target: T) {
  let trapCalls = 0;
  const value = new Proxy(target, {
    ownKeys() {
      trapCalls += 1;
      throw new Error("hostile proxy trap executed");
    },
    getOwnPropertyDescriptor() {
      trapCalls += 1;
      throw new Error("hostile proxy trap executed");
    }
  });
  return { value, trapCalls: () => trapCalls };
}

function rehash<T extends Record<string, unknown>>(value: T, digestKey: string): T {
  const core = Object.fromEntries(Object.entries(value).filter(([key]) => key !== digestKey));
  return { ...value, [digestKey]: hashFinanceCommandPayload(core) };
}
