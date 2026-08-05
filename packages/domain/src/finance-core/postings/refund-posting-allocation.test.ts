import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { FinancePostingIntegrityError } from "./posting-codec";
import {
  assertRefundPostingAllocationMatchesApprovalAuthority,
  readRefundPostingAllocationAuthority
} from "./refund-posting-allocation-codec";
import { assertRefundPostingPriorAllocationAuthorityResolved } from "./refund-posting-prior-allocation";
import {
  buildRefundPostingAllocationInput,
  buildSecondRefundPostingAllocationInput,
  refundApprovalAuthority,
  refundPostingDecoderEnvelope,
  withAllocationDigest
} from "./refund-posting-test-fixtures";

describe("refund posting allocation authority", () => {
  it("rehydrates the literal cumulative allocation without choosing policy", () => {
    const input = buildRefundPostingAllocationInput();

    const allocation = readRefundPostingAllocationAuthority(input, refundPostingDecoderEnvelope);

    expect(allocation).toMatchObject({
      authorityId: "refund-allocation-1",
      refundAmount: { amountMinor: 2_500, currency: "RUB" },
      payableLotAmount: { amountMinor: 1_200, currency: "RUB" },
      alreadyPaidAmount: { amountMinor: 600, currency: "RUB" },
      inFlightPayoutAmount: { amountMinor: 600, currency: "RUB" },
      platformCommissionAmount: { amountMinor: 100, currency: "RUB" },
      authorizationStatus: "unverified",
      digestPurpose: "drift_detection_only"
    });
    expect(allocation).not.toBe(input);
    expect(allocation.payableComponents).not.toBe(input.payableComponents);
    expect(Object.isFrozen(allocation)).toBe(true);
    expect(Object.isFrozen(allocation.inFlightPayoutComponents[0]?.paidOutcomeTreatment)).toBe(
      true
    );
  });

  it("matches the exact Task 5 refund approval authority", () => {
    expect(() =>
      assertRefundPostingAllocationMatchesApprovalAuthority(
        {
          allocation: buildRefundPostingAllocationInput(),
          approvalAuthority: refundApprovalAuthority
        },
        refundPostingDecoderEnvelope
      )
    ).not.toThrow();

    const mismatched = { ...refundApprovalAuthority, payableAmount: money(1_199) };
    const allocation = mutableRecord(structuredClone(buildRefundPostingAllocationInput()));
    record(allocation.refundApprovalAuthorityRef).canonicalDigest =
      hashFinanceCommandPayload(mismatched);
    expectFinanceError(
      () =>
        assertRefundPostingAllocationMatchesApprovalAuthority(
          { allocation: withAllocationDigest(allocation), approvalAuthority: mismatched },
          refundPostingDecoderEnvelope
        ),
      "amount_mismatch"
    );
  });

  it("requires the exact adjacent resolved allocation for a cumulative revision", () => {
    const prior = readRefundPostingAllocationAuthority(
      buildRefundPostingAllocationInput(),
      refundPostingDecoderEnvelope
    );
    const current = readRefundPostingAllocationAuthority(
      buildSecondRefundPostingAllocationInput(prior),
      refundPostingDecoderEnvelope
    );

    expect(() => assertRefundPostingPriorAllocationAuthorityResolved(current, prior)).not.toThrow();

    const forgedPrior = {
      ...prior,
      authorityId: "different-prior-allocation"
    };
    expectFinanceError(
      () => assertRefundPostingPriorAllocationAuthorityResolved(current, forgedPrior),
      "authority_mismatch"
    );

    const wrongProviderPrior = {
      ...prior,
      providerAccount: {
        ...prior.providerAccount,
        merchantTenantId: "other-merchant-tenant"
      }
    };
    expectFinanceError(
      () => assertRefundPostingPriorAllocationAuthorityResolved(current, wrongProviderPrior),
      "authority_mismatch"
    );

    const staleReference = mutableRecord(
      structuredClone(buildSecondRefundPostingAllocationInput(prior))
    );
    record(staleReference.priorAllocationAuthorityRef).version = 2;
    expectFinanceError(
      () =>
        readRefundPostingAllocationAuthority(
          withAllocationDigest(staleReference),
          refundPostingDecoderEnvelope
        ),
      "authority_mismatch"
    );
  });

  const integrityMutations: readonly [string, (value: Record<string, unknown>) => void][] = [
    ["R equation", (value) => (value.alreadyPaidAmount = money(599))],
    [
      "cumulative half-up allocation",
      (value) => (value.nextCumulativePlatformReversed = money(99))
    ],
    [
      "source allocation cap",
      (value) =>
        (record(firstRecord(value.alreadyPaidComponents).sourceAllocation).nextAllocatedAmount =
          money(599))
    ],
    ["canonical component order", (value) => array(value.payableComponents).reverse()],
    [
      "unique component identity",
      (value) => (firstRecord(value.platformCommissionComponents).componentId = "component-a-1")
    ],
    [
      "unique funding reservation",
      (value) =>
        (record(firstRecord(value.inFlightPayoutComponents).fundingReservationRef).reservationId =
          "reservation-d-1")
    ]
  ];

  it.each(integrityMutations)("rejects drift in %s", (_label, mutate) => {
    const input = mutableRecord(structuredClone(buildRefundPostingAllocationInput()));
    mutate(input);
    const resigned = withAllocationDigest(input);

    expectFinanceError(
      () => readRefundPostingAllocationAuthority(resigned, refundPostingDecoderEnvelope),
      "authority_mismatch"
    );
  });

  it("rejects allocation cardinality before reading array elements", () => {
    let trapCount = 0;
    const hostile = new Proxy(buildRefundPostingAllocationInput().payableComponents, {
      ownKeys() {
        trapCount += 1;
        throw new Error("must not execute");
      },
      getPrototypeOf() {
        trapCount += 1;
        throw new Error("must not execute");
      }
    });
    const input = { ...buildRefundPostingAllocationInput(), payableComponents: hostile };

    expectFinanceError(
      () => readRefundPostingAllocationAuthority(input, refundPostingDecoderEnvelope),
      "invalid_shape"
    );
    expect(trapCount).toBe(0);

    expectFinanceError(
      () =>
        readRefundPostingAllocationAuthority(buildRefundPostingAllocationInput(), {
          ...refundPostingDecoderEnvelope,
          maxAllocations: 5
        }),
      "decoder_envelope_exceeded"
    );
  });

  it("rejects accessors, sparse arrays, unknown keys and stale self-digests", () => {
    const accessor = mutableRecord(structuredClone(buildRefundPostingAllocationInput()));
    Object.defineProperty(firstRecord(accessor.alreadyPaidComponents), "amount", {
      enumerable: true,
      get: () => money(600)
    });
    expectFinanceError(
      () => readRefundPostingAllocationAuthority(accessor, refundPostingDecoderEnvelope),
      "invalid_shape"
    );

    const sparse = mutableRecord(structuredClone(buildRefundPostingAllocationInput()));
    sparse.payableComponents = new Array(2);
    expectFinanceError(
      () => readRefundPostingAllocationAuthority(sparse, refundPostingDecoderEnvelope),
      "invalid_shape"
    );

    const unknown = { ...buildRefundPostingAllocationInput(), hiddenPolicy: "write_off" };
    expectFinanceError(
      () => readRefundPostingAllocationAuthority(unknown, refundPostingDecoderEnvelope),
      "invalid_shape"
    );

    const stale = { ...buildRefundPostingAllocationInput(), providerPaymentId: "other-payment" };
    expectFinanceError(
      () => readRefundPostingAllocationAuthority(stale, refundPostingDecoderEnvelope),
      "authority_mismatch"
    );
  });
});

function money(amountMinor: number) {
  return { amountMinor, currency: "RUB" as const };
}

function mutableRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  return value as unknown[];
}

function firstRecord(value: unknown): Record<string, unknown> {
  return record(array(value)[0]);
}

function expectFinanceError(action: () => unknown, reason: string): void {
  try {
    action();
    throw new Error("expected finance error");
  } catch (error) {
    expect(error).toBeInstanceOf(FinancePostingIntegrityError);
    expect((error as FinancePostingIntegrityError).reason).toBe(reason);
  }
}
