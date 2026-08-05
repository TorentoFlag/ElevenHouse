import { describe, expect, it } from "vitest";
import {
  exposureBindingReadInput,
  payoutExposureBindingFixture,
  rehashPayoutExposureBinding
} from "./payout-bank-exposure-test-fixtures";
import { readUnverifiedPayoutBankExposureTransitionBinding } from "./payout-bank-exposure-binding";
import { FinancePostingIntegrityError, type FinancePostingIntegrityReason } from "./posting-codec";
import { postingDecoderEnvelope, sha } from "./posting-test-primitives";

function expectExposureError(action: () => unknown, reason: FinancePostingIntegrityReason): void {
  expect(action).toThrowError(
    expect.objectContaining<Partial<FinancePostingIntegrityError>>({
      code: "finance_posting_integrity_error",
      reason
    })
  );
}

const committed = payoutExposureBindingFixture();
const initiated = payoutExposureBindingFixture({
  previous: committed,
  transitionKind: "bank_work_initiated",
  exposureVersion: "2",
  status: "initiated_unreflected",
  occurredAt: "2026-08-03T11:00:00Z"
});
const paid = payoutExposureBindingFixture({
  previous: initiated,
  transitionKind: "paid_proven",
  exposureVersion: "3",
  status: "paid_unreflected",
  occurredAt: "2026-08-03T12:00:00Z"
});
const statementReflected = payoutExposureBindingFixture({
  previous: paid,
  transitionKind: "statement_debit_reflected",
  exposureVersion: "4",
  status: "statement_reflected",
  occurredAt: "2026-08-03T13:00:00Z"
});

describe("payout bank exposure transition binding", () => {
  it.each([
    ["approval commits one exposure", committed, null, "committed", "1"],
    ["bank work advances the commitment", initiated, committed, "initiated_unreflected", "2"],
    ["paid evidence advances initiated work", paid, initiated, "paid_unreflected", "3"],
    [
      "a statement debit marks paid clearing reflected",
      statementReflected,
      paid,
      "statement_reflected",
      "4"
    ],
    [
      "a return credit marks the reflected debit returned",
      payoutExposureBindingFixture({
        previous: statementReflected,
        transitionKind: "return_credit_reflected",
        exposureVersion: "5",
        status: "returned_reflected",
        occurredAt: "2026-08-03T14:00:00Z"
      }),
      statementReflected,
      "returned_reflected",
      "5"
    ],
    [
      "pre-initiation failure releases a commitment",
      payoutExposureBindingFixture({
        previous: committed,
        transitionKind: "pre_transfer_released",
        exposureVersion: "2",
        status: "released",
        occurredAt: "2026-08-03T11:00:00Z"
      }),
      committed,
      "released",
      "2"
    ],
    [
      "definitive post-initiation no-transfer releases exposure",
      payoutExposureBindingFixture({
        previous: initiated,
        transitionKind: "pre_transfer_released",
        exposureVersion: "3",
        status: "released",
        occurredAt: "2026-08-03T12:00:00Z"
      }),
      initiated,
      "released",
      "3"
    ],
    [
      "definitive no-debit return closes paid clearing",
      payoutExposureBindingFixture({
        previous: paid,
        transitionKind: "returned_without_debit",
        exposureVersion: "4",
        status: "returned_without_debit",
        occurredAt: "2026-08-03T13:00:00Z"
      }),
      paid,
      "returned_without_debit",
      "4"
    ]
  ] as const)("accepts %s", (_label, binding, previousBinding, status, version) => {
    const result = readUnverifiedPayoutBankExposureTransitionBinding(
      exposureBindingReadInput(binding, previousBinding),
      postingDecoderEnvelope
    );

    expect(result).toMatchObject({
      status,
      exposureVersion: version,
      authorizationStatus: "unverified",
      atomicityStatus: "unverified"
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.beneficiarySnapshot)).toBe(true);
    expect(Object.isFrozen(result.transitionAuthorityRef)).toBe(true);
    if (result.previousBindingRef) expect(Object.isFrozen(result.previousBindingRef)).toBe(true);
  });

  it.each([
    ["approval with prior exposure", committed, "approval_committed", "committed", "2"],
    ["paid directly from committed", committed, "paid_proven", "paid_unreflected", "2"],
    [
      "statement debit before paid",
      initiated,
      "statement_debit_reflected",
      "statement_reflected",
      "3"
    ],
    ["release after paid", paid, "pre_transfer_released", "released", "4"],
    [
      "return credit before statement debit",
      paid,
      "return_credit_reflected",
      "returned_reflected",
      "4"
    ],
    [
      "bank work after terminal release",
      payoutExposureBindingFixture({
        previous: committed,
        transitionKind: "pre_transfer_released",
        exposureVersion: "2",
        status: "released",
        occurredAt: "2026-08-03T11:00:00Z"
      }),
      "bank_work_initiated",
      "initiated_unreflected",
      "3"
    ]
  ] as const)("rejects %s", (_label, previous, transitionKind, status, exposureVersion) => {
    const binding = payoutExposureBindingFixture({
      previous,
      transitionKind,
      status,
      exposureVersion,
      occurredAt: "2026-08-03T15:00:00Z"
    });
    expectExposureError(
      () =>
        readUnverifiedPayoutBankExposureTransitionBinding(
          exposureBindingReadInput(binding, previous),
          postingDecoderEnvelope
        ),
      "authority_mismatch"
    );
  });

  it("requires the exact previous full binding for a non-initial transition", () => {
    expectExposureError(
      () =>
        readUnverifiedPayoutBankExposureTransitionBinding(
          exposureBindingReadInput(initiated, null),
          postingDecoderEnvelope
        ),
      "authority_mismatch"
    );
  });

  it.each([
    ["bank exposure", { bankExposureId: "another-exposure" }, "scope_mismatch"],
    ["payout", { payoutRequestId: "another-payout" }, "scope_mismatch"],
    ["astrologer", { astrologerUserId: "another-astrologer" }, "scope_mismatch"],
    ["bank pool", { bankCashPoolId: "another-pool" }, "scope_mismatch"],
    ["approver", { approvedByActorUserId: "another-approver" }, "scope_mismatch"],
    [
      "beneficiary",
      {
        beneficiarySnapshot: {
          snapshotId: "another-snapshot",
          schemaVersion: 1,
          fingerprint: "beneficiary-fingerprint-1",
          canonicalDigest: sha("b")
        }
      },
      "scope_mismatch"
    ],
    ["amount", { amount: { amountMinor: 899_999, currency: "RUB" } }, "amount_mismatch"]
  ] as const)("rejects immutable %s drift", (_label, overrides, reason) => {
    const binding = payoutExposureBindingFixture({
      previous: committed,
      transitionKind: "bank_work_initiated",
      exposureVersion: "2",
      status: "initiated_unreflected",
      occurredAt: "2026-08-03T11:00:00Z",
      overrides
    });
    expectExposureError(
      () =>
        readUnverifiedPayoutBankExposureTransitionBinding(
          exposureBindingReadInput(binding, committed),
          postingDecoderEnvelope
        ),
      reason
    );
  });

  it.each([
    ["skipped version", { exposureVersion: "3" }],
    [
      "forged previous reference",
      {
        previousBindingRef: {
          bindingId: committed.bindingId,
          exposureVersion: committed.exposureVersion,
          status: committed.status,
          bindingDigest: sha("f")
        }
      }
    ],
    ["reused binding id", { bindingId: committed.bindingId }]
  ] as const)("rejects %s", (_label, overrides) => {
    const binding = rehashPayoutExposureBinding({ ...initiated, ...overrides });
    expectExposureError(
      () =>
        readUnverifiedPayoutBankExposureTransitionBinding(
          exposureBindingReadInput(binding, committed),
          postingDecoderEnvelope
        ),
      "authority_mismatch"
    );
  });

  it("rejects transition chronology before the previous binding", () => {
    const binding = payoutExposureBindingFixture({
      previous: committed,
      transitionKind: "bank_work_initiated",
      exposureVersion: "2",
      status: "initiated_unreflected",
      occurredAt: "2026-08-03T09:59:59Z"
    });
    expectExposureError(
      () =>
        readUnverifiedPayoutBankExposureTransitionBinding(
          exposureBindingReadInput(binding, committed),
          postingDecoderEnvelope
        ),
      "invalid_chronology"
    );
  });

  it.each([
    ["authorization", { authorizationStatus: "verified" }],
    ["atomicity", { atomicityStatus: "verified" }],
    ["digest purpose", { digestPurpose: "authority" }]
  ])("never accepts claimed %s authority", (_label, overrides) => {
    const binding = rehashPayoutExposureBinding({ ...committed, ...overrides });
    expectExposureError(
      () =>
        readUnverifiedPayoutBankExposureTransitionBinding(
          exposureBindingReadInput(binding, null),
          postingDecoderEnvelope
        ),
      "evidence_mismatch"
    );
  });

  it("rejects binding digest drift", () => {
    expectExposureError(
      () =>
        readUnverifiedPayoutBankExposureTransitionBinding(
          exposureBindingReadInput({ ...committed, bindingDigest: sha("0") }, null),
          postingDecoderEnvelope
        ),
      "evidence_mismatch"
    );
  });

  it("applies the decimal envelope before BigInt version comparison", () => {
    const binding = rehashPayoutExposureBinding({ ...committed, exposureVersion: "1".repeat(33) });
    expectExposureError(
      () =>
        readUnverifiedPayoutBankExposureTransitionBinding(
          exposureBindingReadInput(binding, null),
          postingDecoderEnvelope
        ),
      "decoder_envelope_exceeded"
    );
  });

  it("normalizes the out-of-band envelope before touching hostile target input", () => {
    let trapCalls = 0;
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          trapCalls += 1;
          throw new Error("must not inspect target");
        }
      }
    );
    expectExposureError(
      () => readUnverifiedPayoutBankExposureTransitionBinding(hostile, undefined as never),
      "decoder_envelope_required"
    );
    expect(trapCalls).toBe(0);
  });

  it.each(["proxy", "accessor", "sparse_array"] as const)(
    "rejects nested hostile %s without invoking it",
    (kind) => {
      let touches = 0;
      let hostile: unknown;
      if (kind === "proxy") {
        hostile = new Proxy(
          {},
          {
            ownKeys() {
              touches += 1;
              throw new Error("must not inspect proxy");
            }
          }
        );
      } else if (kind === "accessor") {
        hostile = {};
        Object.defineProperty(hostile, "snapshotId", {
          enumerable: true,
          get() {
            touches += 1;
            throw new Error("must not invoke accessor");
          }
        });
      } else {
        const sparse: unknown[] = [];
        Object.defineProperty(sparse, "9", {
          enumerable: true,
          get() {
            touches += 1;
            throw new Error("must not inspect sparse element");
          }
        });
        sparse.length = 10;
        hostile = sparse;
      }
      const binding = {
        ...committed,
        beneficiarySnapshot: hostile
      };
      expectExposureError(
        () =>
          readUnverifiedPayoutBankExposureTransitionBinding(
            exposureBindingReadInput(binding as never, null),
            postingDecoderEnvelope
          ),
        "invalid_shape"
      );
      expect(touches).toBe(0);
    }
  );
});
