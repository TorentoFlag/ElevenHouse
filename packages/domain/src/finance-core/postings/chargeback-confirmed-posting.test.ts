import { describe, expect, it } from "vitest";
import {
  buildChargebackPrincipalConfirmedPosting,
  FinancePostingIntegrityError
} from "./chargeback-confirmed-posting";
import {
  chargebackCumulativeUpdatePostingFixture,
  chargebackConfirmedPostingFixture,
  receiptDecoderEnvelope,
  rehashChargebackProviderBinding
} from "./chargeback-confirmed-posting-test-fixtures";
import { postingDecoderEnvelope } from "./posting-test-primitives";

function build(overrides: Record<string, unknown> = {}) {
  return buildChargebackPrincipalConfirmedPosting(
    { ...chargebackConfirmedPostingFixture(), ...overrides } as never,
    postingDecoderEnvelope,
    receiptDecoderEnvelope
  );
}

function expectPostingError(action: () => unknown, reason: string): void {
  try {
    action();
    throw new Error("expected posting integrity error");
  } catch (error) {
    expect(error).toBeInstanceOf(FinancePostingIntegrityError);
    expect((error as FinancePostingIntegrityError).reason).toBe(reason);
  }
}

describe("chargeback principal confirmation posting", () => {
  it("posts only the provider-confirmed principal delta into suspense", () => {
    const fixture = chargebackConfirmedPostingFixture();
    const result = build();
    const amount = fixture.providerEvidenceBinding.providerEvidence.amount;
    expect(result).toMatchObject({
      kind: "journal",
      authorizationStatus: "unverified",
      atomicityStatus: "unverified",
      transaction: {
        sourceKey: fixture.operationReceipt.sourceKey,
        entries: [
          {
            account: {
              code: "chargeback_principal_suspense",
              arcProviderAccountId:
                fixture.providerEvidenceBinding.providerEvidence.providerAccountId,
              currency: "RUB"
            },
            side: "debit",
            amount
          },
          {
            account: {
              code: "arc_provider_clearing",
              arcProviderAccountId:
                fixture.providerEvidenceBinding.providerEvidence.providerAccountId,
              currency: "RUB"
            },
            side: "credit",
            amount
          }
        ]
      }
    });
    expect(
      result.transaction.entries.every((entry) => entry.links.originalSaleId === "order-chargeback")
    ).toBe(true);
    expect(
      result.transaction.entries.every(
        (entry) => entry.links.componentId === "component-chargeback-principal"
      )
    ).toBe(true);
    expect(result.linkProof.operationSnapshotRef).toEqual(fixture.operationSnapshotRef);
    expect(result.linkProof.sourceEvidenceRef).toEqual({
      kind: "payable_lot_operation_receipt",
      evidenceId: fixture.operationReceipt.receiptId,
      canonicalDigest: fixture.operationReceipt.canonicalDigest
    });
  });

  it("posts only disputedDelta for a cumulative chargeback update", () => {
    const fixture = chargebackCumulativeUpdatePostingFixture();
    const result = buildChargebackPrincipalConfirmedPosting(
      fixture,
      postingDecoderEnvelope,
      receiptDecoderEnvelope
    );
    expect(fixture.providerEvidenceBinding.sourceAuthority).toMatchObject({
      priorCumulativeDisputedAmount: { amountMinor: 5_000 },
      nextCumulativeDisputedAmount: { amountMinor: 5_500 },
      disputedDelta: { amountMinor: 500 }
    });
    expect(result.transaction.entries.map((entry) => entry.amount.amountMinor)).toEqual([500, 500]);
  });

  it("rejects a locally rehashed binding that names another receipt", () => {
    const fixture = chargebackConfirmedPostingFixture();
    const providerEvidenceBinding = rehashChargebackProviderBinding({
      ...fixture.providerEvidenceBinding,
      operationReceiptId: "another-receipt"
    });
    expectPostingError(
      () => build({ providerEvidenceBinding }),
      "proof_operation_receipt_mismatch"
    );
  });

  it("rejects a receipt without the exact confirmed authority reference", () => {
    const fixture = chargebackConfirmedPostingFixture();
    const operationReceipt = structuredClone(fixture.operationReceipt) as unknown as {
      authorityRefs: Record<string, unknown>[];
    };
    const authorityRef = operationReceipt.authorityRefs[0];
    if (!authorityRef) throw new Error("missing authority ref");
    authorityRef.authorityId = "another-authority";
    expectPostingError(() => build({ operationReceipt }), "proof_operation_receipt_mismatch");
  });

  it("rejects provider/account scope drift even when the binding is rehashed", () => {
    const fixture = chargebackConfirmedPostingFixture();
    const providerEvidenceBinding = rehashChargebackProviderBinding({
      ...fixture.providerEvidenceBinding,
      providerEvidence: {
        ...fixture.providerEvidenceBinding.providerEvidence,
        providerAccountId: "arc-another-account"
      }
    });
    expectPostingError(() => build({ providerEvidenceBinding }), "evidence_mismatch");
  });

  it("requires the journal economic time to equal the confirmed provider receipt time", () => {
    const fixture = chargebackConfirmedPostingFixture();
    expectPostingError(
      () =>
        build({
          context: {
            ...fixture.context,
            occurredAt: "2026-08-03T10:00:01Z",
            postedAt: "2026-08-03T10:00:02Z"
          }
        }),
      "proof_operation_receipt_mismatch"
    );
  });

  it("normalizes both trusted envelopes before touching hostile input", () => {
    let trapCalls = 0;
    const input = new Proxy(chargebackConfirmedPostingFixture(), {
      get(target, property, receiver) {
        trapCalls += 1;
        return Reflect.get(target, property, receiver);
      }
    });
    expectPostingError(
      () =>
        buildChargebackPrincipalConfirmedPosting(
          input as never,
          { ...postingDecoderEnvelope, maxAllocations: 0 },
          receiptDecoderEnvelope
        ),
      "decoder_envelope_required"
    );
    expect(trapCalls).toBe(0);
  });

  it("rejects a hostile receipt decoder envelope without executing its get trap", () => {
    let trapCalls = 0;
    const receiptEnvelope = new Proxy(receiptDecoderEnvelope, {
      get(target, property, receiver) {
        trapCalls += 1;
        return Reflect.get(target, property, receiver);
      },
      getPrototypeOf(target) {
        trapCalls += 1;
        return Reflect.getPrototypeOf(target);
      },
      ownKeys(target) {
        trapCalls += 1;
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, property) {
        trapCalls += 1;
        return Reflect.getOwnPropertyDescriptor(target, property);
      }
    });
    expectPostingError(
      () =>
        buildChargebackPrincipalConfirmedPosting(
          chargebackConfirmedPostingFixture(),
          postingDecoderEnvelope,
          receiptEnvelope
        ),
      "proof_operation_receipt_mismatch"
    );
    expect(trapCalls).toBe(0);
  });
});
