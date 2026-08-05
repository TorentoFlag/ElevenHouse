import { describe, expect, it } from "vitest";
import {
  FinancePostingIntegrityError,
  readChargebackPrincipalPostingAllocationAuthority
} from "./chargeback-posting-allocation";
import {
  allocationInput,
  platformAllocation,
  recoveryAllocation,
  sourceAuthority
} from "./chargeback-posting-allocation-test-fixtures";
import { postingDecoderEnvelope, sha } from "./posting-test-primitives";

function expectPostingError(action: () => unknown, reason: string): void {
  try {
    action();
    throw new Error("expected posting integrity error");
  } catch (error) {
    expect(error).toBeInstanceOf(FinancePostingIntegrityError);
    expect((error as FinancePostingIntegrityError).reason).toBe(reason);
  }
}

describe("chargeback principal posting allocation", () => {
  it("decodes an approved exact B = H + O + E + U allocation", () => {
    const input = allocationInput();
    const decoded = readChargebackPrincipalPostingAllocationAuthority(
      input,
      postingDecoderEnvelope
    );
    expect(decoded).toEqual(input);
    expect(Object.isFrozen(decoded)).toBe(true);
    expect(Object.isFrozen(decoded.recoveryAllocations)).toBe(true);
    expect(Object.isFrozen(decoded.platformAllocations)).toBe(true);
  });

  it("posts only delta X for a later revision while carrying prior cumulative X", () => {
    const prior = readChargebackPrincipalPostingAllocationAuthority(
      allocationInput(),
      postingDecoderEnvelope
    );
    const nextSource = Object.freeze({
      ...sourceAuthority,
      payableAmount: { amountMinor: 100, currency: "RUB" as const },
      accountingAllocationRevisionId: "chargeback-allocation-1-revision-2",
      accountingAllocationVersion: 2
    });
    const input = allocationInput({
      authorityId: nextSource.accountingAllocationRevisionId,
      version: nextSource.accountingAllocationVersion,
      sourceAuthority: nextSource,
      priorAllocationAuthorityRef: {
        kind: "chargeback_principal_posting_allocation",
        authorityId: prior.authorityId,
        accountingAllocationId: sourceAuthority.accountingAllocationId,
        version: prior.version,
        nextAllocatedPrincipal: prior.nextAllocatedPrincipal,
        canonicalDigest: prior.canonicalDigest
      },
      payablePrincipal: { amountMinor: 100, currency: "RUB" },
      recoveryPrincipal: { amountMinor: 0, currency: "RUB" },
      platformPrincipal: { amountMinor: 0, currency: "RUB" },
      principalAllocationDelta: { amountMinor: 100, currency: "RUB" },
      nextAllocatedPrincipal: { amountMinor: 3_100, currency: "RUB" },
      unallocatedSuspense: { amountMinor: 1_900, currency: "RUB" },
      recoveryAllocations: [],
      platformAllocations: []
    });

    expect(
      readChargebackPrincipalPostingAllocationAuthority(input, postingDecoderEnvelope)
    ).toEqual(input);
  });

  it.each([
    ["allocation delta", { principalAllocationDelta: { amountMinor: 3_001, currency: "RUB" } }],
    [
      "next allocated principal",
      { nextAllocatedPrincipal: { amountMinor: 3_001, currency: "RUB" } }
    ],
    ["unallocated suspense", { unallocatedSuspense: { amountMinor: 1_999, currency: "RUB" } }],
    ["recovery total", { recoveryPrincipal: { amountMinor: 499, currency: "RUB" } }],
    ["platform total", { platformPrincipal: { amountMinor: 499, currency: "RUB" } }]
  ])("rejects a mismatched %s", (_label, override) => {
    expectPostingError(
      () =>
        readChargebackPrincipalPostingAllocationAuthority(
          allocationInput(override),
          postingDecoderEnvelope
        ),
      "amount_mismatch"
    );
  });

  it("binds identity and payable amount to the exact Task5 source authority", () => {
    expectPostingError(
      () =>
        readChargebackPrincipalPostingAllocationAuthority(
          allocationInput({ payablePrincipal: { amountMinor: 1_999, currency: "RUB" } }),
          postingDecoderEnvelope
        ),
      "authority_mismatch"
    );
    expectPostingError(
      () =>
        readChargebackPrincipalPostingAllocationAuthority(
          allocationInput({ authorityId: "caller-selected-id" }),
          postingDecoderEnvelope
        ),
      "authority_mismatch"
    );
  });

  it("binds B and provider scope to the exact confirmed provider authority", () => {
    expectPostingError(
      () =>
        readChargebackPrincipalPostingAllocationAuthority(
          allocationInput({
            disputedPrincipal: { amountMinor: 6_000, currency: "RUB" },
            unallocatedSuspense: { amountMinor: 3_000, currency: "RUB" }
          }),
          postingDecoderEnvelope
        ),
      "evidence_mismatch"
    );
    expectPostingError(
      () =>
        readChargebackPrincipalPostingAllocationAuthority(
          allocationInput({ arcProviderAccountId: "arc-caller-selected" }),
          postingDecoderEnvelope
        ),
      "evidence_mismatch"
    );
  });

  it("cannot approve principal allocation before the bound provider confirmation", () => {
    expectPostingError(
      () =>
        readChargebackPrincipalPostingAllocationAuthority(
          allocationInput({ approvedAt: "2026-08-03T09:59:59Z" }),
          postingDecoderEnvelope
        ),
      "invalid_chronology"
    );
  });

  it("rejects zero allocation and cross-order component attribution", () => {
    expectPostingError(
      () =>
        readChargebackPrincipalPostingAllocationAuthority(
          allocationInput({
            payablePrincipal: { amountMinor: 0, currency: "RUB" },
            recoveryPrincipal: { amountMinor: 0, currency: "RUB" },
            platformPrincipal: { amountMinor: 0, currency: "RUB" },
            principalAllocationDelta: { amountMinor: 0, currency: "RUB" },
            nextAllocatedPrincipal: { amountMinor: 0, currency: "RUB" },
            unallocatedSuspense: { amountMinor: 5_000, currency: "RUB" },
            recoveryAllocations: [],
            platformAllocations: [],
            sourceAuthority: {
              ...sourceAuthority,
              payableAmount: { amountMinor: 0, currency: "RUB" }
            }
          }),
          postingDecoderEnvelope
        ),
      "amount_mismatch"
    );
    expectPostingError(
      () =>
        readChargebackPrincipalPostingAllocationAuthority(
          allocationInput({
            recoveryAllocations: [{ ...recoveryAllocation, originalSaleId: "foreign-order" }]
          }),
          postingDecoderEnvelope
        ),
      "authority_mismatch"
    );
  });

  it("requires an exact adjacent prior revision reference after version one", () => {
    const versionTwoSource = {
      ...sourceAuthority,
      accountingAllocationRevisionId: "chargeback-allocation-1-revision-2",
      accountingAllocationVersion: 2
    };
    expectPostingError(
      () =>
        readChargebackPrincipalPostingAllocationAuthority(
          allocationInput({
            authorityId: versionTwoSource.accountingAllocationRevisionId,
            version: 2,
            sourceAuthority: versionTwoSource
          }),
          postingDecoderEnvelope
        ),
      "authority_mismatch"
    );
    expectPostingError(
      () =>
        readChargebackPrincipalPostingAllocationAuthority(
          allocationInput({
            priorAllocationAuthorityRef: {
              kind: "chargeback_principal_posting_allocation",
              authorityId: "unexpected-prior-revision",
              accountingAllocationId: sourceAuthority.accountingAllocationId,
              version: 1,
              nextAllocatedPrincipal: { amountMinor: 1, currency: "RUB" },
              canonicalDigest: sha("a")
            }
          }),
          postingDecoderEnvelope
        ),
      "authority_mismatch"
    );
  });

  it("does not attribute one payable lot to two recovery components", () => {
    expectPostingError(
      () =>
        readChargebackPrincipalPostingAllocationAuthority(
          allocationInput({
            recoveryAllocations: [
              { ...recoveryAllocation, amount: { amountMinor: 250, currency: "RUB" } },
              {
                ...recoveryAllocation,
                allocationId: "recovery-allocation-2",
                componentId: "component-astrologer-recovery-2",
                payoutAllocationId: "payout-allocation-2",
                amount: { amountMinor: 250, currency: "RUB" }
              }
            ]
          }),
          { ...postingDecoderEnvelope, maxAllocations: 3 }
        ),
      "authority_mismatch"
    );
  });

  it("requires canonical globally unique component and allocation identities", () => {
    expectPostingError(
      () =>
        readChargebackPrincipalPostingAllocationAuthority(
          allocationInput({
            platformAllocations: [
              {
                ...platformAllocation,
                componentId: recoveryAllocation.componentId
              }
            ]
          }),
          postingDecoderEnvelope
        ),
      "authority_mismatch"
    );
    expectPostingError(
      () =>
        readChargebackPrincipalPostingAllocationAuthority(
          allocationInput({
            recoveryAllocations: [
              { ...recoveryAllocation, componentId: "component-z" },
              { ...recoveryAllocation, componentId: "component-a", allocationId: "allocation-a" }
            ]
          }),
          { ...postingDecoderEnvelope, maxAllocations: 3 }
        ),
      "authority_mismatch"
    );
  });

  it("requires treatment-specific authority kinds", () => {
    expectPostingError(
      () =>
        readChargebackPrincipalPostingAllocationAuthority(
          allocationInput({
            recoveryAllocations: [
              {
                ...recoveryAllocation,
                treatmentAuthorityRef: {
                  ...recoveryAllocation.treatmentAuthorityRef,
                  kind: "chargeback_platform_loss_treatment"
                }
              }
            ]
          }),
          postingDecoderEnvelope
        ),
      "authority_mismatch"
    );
  });

  it("enforces the combined out-of-band allocation cap before row mapping", () => {
    expectPostingError(
      () =>
        readChargebackPrincipalPostingAllocationAuthority(allocationInput(), {
          ...postingDecoderEnvelope,
          maxAllocations: 1
        }),
      "decoder_envelope_exceeded"
    );
  });

  it("rejects nested Proxy rows without executing their get trap", () => {
    let trapCalls = 0;
    const row = new Proxy(recoveryAllocation, {
      get(target, property, receiver) {
        trapCalls += 1;
        return Reflect.get(target, property, receiver);
      }
    });
    expectPostingError(
      () =>
        readChargebackPrincipalPostingAllocationAuthority(
          allocationInput({ recoveryAllocations: [row] }),
          postingDecoderEnvelope
        ),
      "invalid_shape"
    );
    expect(trapCalls).toBe(0);
  });

  it("detects drift in the canonical authority digest", () => {
    expectPostingError(
      () =>
        readChargebackPrincipalPostingAllocationAuthority(
          { ...allocationInput(), canonicalDigest: sha("f") },
          postingDecoderEnvelope
        ),
      "evidence_mismatch"
    );
  });
});
