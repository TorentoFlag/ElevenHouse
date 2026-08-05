import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  FinancePostingIntegrityError,
  readChargebackSourceAuthority
} from "./chargeback-source-authority";
import { postingDecoderEnvelope } from "./posting-test-primitives";

const confirmed = Object.freeze({
  kind: "chargeback_confirmed" as const,
  authorityId: "chargeback-confirmed-authority",
  version: 2,
  confirmationId: "chargeback-confirmation-2",
  restrictionId: "chargeback-restriction-1",
  confirmationKind: "cumulative_update" as const,
  amountBasis: "cumulative" as const,
  priorRestrictionVersion: 1,
  chargebackCaseId: "chargeback-1",
  orderId: "order-1",
  astrologerUserId: "astrologer-1",
  providerAccount: Object.freeze({
    seriesId: "arc-series-live",
    providerAccountId: "arc-live-1",
    identityVersion: 1
  }),
  providerPaymentId: "payment-1",
  priorCumulativeDisputedAmount: { amountMinor: 2_000, currency: "RUB" as const },
  nextCumulativeDisputedAmount: { amountMinor: 5_000, currency: "RUB" as const },
  disputedDelta: { amountMinor: 3_000, currency: "RUB" as const },
  canonicalEvidenceId: "chargeback-evidence-2",
  confirmedAt: "2026-08-03T10:00:00Z"
});

const principalAllocation = Object.freeze({
  kind: "chargeback_principal_allocation" as const,
  authorityId: "chargeback-principal-authority",
  version: 1,
  chargebackCaseId: "chargeback-1",
  orderId: "order-1",
  astrologerUserId: "astrologer-1",
  payableAmount: { amountMinor: 2_000, currency: "RUB" as const },
  accountingAllocationId: "chargeback-allocation-1",
  accountingAllocationRevisionId: "chargeback-allocation-1-revision-1",
  accountingAllocationVersion: 1,
  allocationStatus: "approved" as const,
  confirmedBasis: Object.freeze({
    restrictionId: confirmed.restrictionId,
    restrictionVersion: 2,
    confirmationAuthorityId: confirmed.authorityId,
    confirmationAuthorityVersion: confirmed.version,
    confirmationId: confirmed.confirmationId,
    confirmationAuthorityDigest: hashFinanceCommandPayload(confirmed),
    canonicalEvidenceId: confirmed.canonicalEvidenceId,
    providerAccount: confirmed.providerAccount,
    providerPaymentId: confirmed.providerPaymentId,
    cumulativeDisputedAmount: confirmed.nextCumulativeDisputedAmount,
    confirmedAt: confirmed.confirmedAt
  })
});

const recoveryCollection = Object.freeze({
  kind: "chargeback_recovery_collection" as const,
  authorityId: "chargeback-recovery-authority",
  version: 1,
  recoveryCollectionId: "chargeback-recovery-1",
  chargebackCaseId: "chargeback-1",
  astrologerUserId: "astrologer-1",
  collectionSource: Object.freeze({
    kind: "returned_payout" as const,
    sourceOrderId: "order-1",
    payoutRequestId: "payout-1",
    payoutAllocationId: "payout-allocation-1",
    payoutReturnAuthorityId: "payout-return-authority-1",
    payoutReturnAuthorityVersion: 1,
    payoutReturnEvidenceId: "payout-return-evidence-1"
  }),
  collectedPayableAmount: { amountMinor: 500, currency: "RUB" as const },
  accountingAllocationId: "chargeback-recovery-allocation-1",
  accountingAllocationVersion: 1,
  allocationStatus: "approved" as const,
  canonicalEvidenceId: "chargeback-recovery-evidence-1",
  collectedAt: "2026-08-04T10:00:00Z"
});

const won = Object.freeze({
  kind: "chargeback_won" as const,
  authorityId: "chargeback-won-authority",
  version: 1,
  chargebackCaseId: "chargeback-1",
  restoredPayableAmount: { amountMinor: 1_500, currency: "RUB" as const },
  suspenseClearedAmount: { amountMinor: 500, currency: "RUB" as const },
  accountingAllocationId: "chargeback-win-allocation-1",
  accountingAllocationVersion: 1,
  allocationStatus: "approved" as const,
  canonicalEvidenceId: "chargeback-won-evidence-1",
  wonAt: "2026-08-05T10:00:00Z"
});

const lost = Object.freeze({
  kind: "chargeback_lost" as const,
  authorityId: "chargeback-lost-authority",
  version: 1,
  chargebackCaseId: "chargeback-1",
  unallocatedSuspense: { amountMinor: 3_000, currency: "RUB" as const },
  accountingAllocationId: "chargeback-loss-allocation-1",
  accountingAllocationVersion: 1,
  allocationStatus: "approved" as const,
  canonicalEvidenceId: "chargeback-lost-evidence-1",
  lostAt: "2026-08-06T10:00:00Z"
});

function expectPostingError(action: () => unknown, reason: string): void {
  try {
    action();
    throw new Error("expected posting integrity error");
  } catch (error) {
    expect(error).toBeInstanceOf(FinancePostingIntegrityError);
    expect((error as FinancePostingIntegrityError).reason).toBe(reason);
  }
}

describe("chargeback source authority posting decoder", () => {
  it.each([confirmed, principalAllocation, recoveryCollection, won, lost])(
    "rehydrates $kind and binds its full canonical digest",
    (authority) => {
      const decoded = readChargebackSourceAuthority(authority, postingDecoderEnvelope);
      expect(decoded).toEqual({
        authority,
        canonicalDigest: hashFinanceCommandPayload(authority)
      });
      expect(Object.isFrozen(decoded)).toBe(true);
      expect(Object.isFrozen(decoded.authority)).toBe(true);
    }
  );

  it("preserves cumulative provider principal arithmetic", () => {
    expectPostingError(
      () =>
        readChargebackSourceAuthority(
          {
            ...confirmed,
            nextCumulativeDisputedAmount: { amountMinor: 5_001, currency: "RUB" }
          },
          postingDecoderEnvelope
        ),
      "authority_mismatch"
    );
  });

  it("preserves source-authority zero amounts where Task5 explicitly permits them", () => {
    const initial = {
      ...confirmed,
      version: 1,
      confirmationId: "chargeback-confirmation-1",
      confirmationKind: "initial",
      priorRestrictionVersion: null,
      priorCumulativeDisputedAmount: { amountMinor: 0, currency: "RUB" },
      disputedDelta: { amountMinor: 5_000, currency: "RUB" }
    };
    expect(readChargebackSourceAuthority(initial, postingDecoderEnvelope).authority).toEqual(
      initial
    );
    expect(
      readChargebackSourceAuthority(
        {
          ...principalAllocation,
          payableAmount: { amountMinor: 0, currency: "RUB" }
        },
        postingDecoderEnvelope
      ).authority
    ).toMatchObject({ payableAmount: { amountMinor: 0, currency: "RUB" } });
    expect(
      readChargebackSourceAuthority(
        {
          ...won,
          restoredPayableAmount: { amountMinor: 0, currency: "RUB" },
          suspenseClearedAmount: { amountMinor: 0, currency: "RUB" }
        },
        postingDecoderEnvelope
      ).authority
    ).toMatchObject({
      restoredPayableAmount: { amountMinor: 0, currency: "RUB" },
      suspenseClearedAmount: { amountMinor: 0, currency: "RUB" }
    });
    expect(
      readChargebackSourceAuthority(
        { ...lost, unallocatedSuspense: { amountMinor: 0, currency: "RUB" } },
        postingDecoderEnvelope
      ).authority
    ).toMatchObject({ unallocatedSuspense: { amountMinor: 0, currency: "RUB" } });
  });

  it("rejects nested getter proxies without executing the get trap", () => {
    let trapCalls = 0;
    const amount = new Proxy(
      { amountMinor: 3_000, currency: "RUB" },
      {
        get(target, property, receiver) {
          trapCalls += 1;
          return Reflect.get(target, property, receiver);
        }
      }
    );
    expectPostingError(
      () =>
        readChargebackSourceAuthority(
          { ...confirmed, disputedDelta: amount },
          postingDecoderEnvelope
        ),
      "invalid_shape"
    );
    expect(trapCalls).toBe(0);
  });

  it("normalizes the out-of-band envelope before touching business input", () => {
    let trapCalls = 0;
    const input = new Proxy(confirmed, {
      get(target, property, receiver) {
        trapCalls += 1;
        return Reflect.get(target, property, receiver);
      }
    });
    expectPostingError(
      () =>
        readChargebackSourceAuthority(input, {
          ...postingDecoderEnvelope,
          maxAllocations: 0
        }),
      "decoder_envelope_required"
    );
    expect(trapCalls).toBe(0);
  });

  it("rejects collection-source drift and unknown authority shapes", () => {
    expectPostingError(
      () =>
        readChargebackSourceAuthority(
          {
            ...recoveryCollection,
            collectionSource: {
              ...recoveryCollection.collectionSource,
              payoutReturnEvidenceId: ""
            }
          },
          postingDecoderEnvelope
        ),
      "invalid_identifier"
    );
    expectPostingError(
      () =>
        readChargebackSourceAuthority(
          { kind: "chargeback_unknown", authorityId: "unknown" },
          postingDecoderEnvelope
        ),
      "authority_mismatch"
    );
  });
});
