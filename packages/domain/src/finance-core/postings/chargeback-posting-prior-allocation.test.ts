import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  FinancePostingIntegrityError,
  readChargebackPrincipalPostingAllocationAuthority
} from "./chargeback-posting-allocation";
import { allocationInput, sourceAuthority } from "./chargeback-posting-allocation-test-fixtures";
import { assertChargebackPrincipalPostingPriorAuthorityResolved } from "./chargeback-posting-prior-allocation";
import { postingDecoderEnvelope } from "./posting-test-primitives";

function decodedVersionTwo() {
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
  const current = readChargebackPrincipalPostingAllocationAuthority(
    allocationInput({
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
    }),
    postingDecoderEnvelope
  );
  return { current, prior };
}

describe("chargeback principal posting prior allocation resolution", () => {
  it("matches the adjacent independently decoded prior allocation", () => {
    const { current, prior } = decodedVersionTwo();
    expect(() =>
      assertChargebackPrincipalPostingPriorAuthorityResolved(current, prior)
    ).not.toThrow();
  });

  it("rejects an absent or drifted resolved prior allocation", () => {
    const { current, prior } = decodedVersionTwo();
    expect(() =>
      assertChargebackPrincipalPostingPriorAuthorityResolved(current, null)
    ).toThrowError(FinancePostingIntegrityError);
    expect(() =>
      assertChargebackPrincipalPostingPriorAuthorityResolved(current, {
        ...prior,
        canonicalDigest: "f".repeat(64) as typeof prior.canonicalDigest
      })
    ).toThrowError(FinancePostingIntegrityError);
  });

  it("rejects a foreign prior case even when both adjacent digests are reissued", () => {
    const { current, prior } = decodedVersionTwo();
    const foreignCore: Record<string, unknown> = {
      ...prior,
      chargebackCaseId: "foreign-chargeback"
    };
    Reflect.deleteProperty(foreignCore, "canonicalDigest");
    const foreignPrior = {
      ...foreignCore,
      canonicalDigest: hashFinanceCommandPayload(foreignCore)
    } as typeof prior;
    const forgedCurrent = {
      ...current,
      priorAllocationAuthorityRef: {
        ...current.priorAllocationAuthorityRef,
        canonicalDigest: foreignPrior.canonicalDigest
      }
    } as typeof current;
    expect(() =>
      assertChargebackPrincipalPostingPriorAuthorityResolved(forgedCurrent, foreignPrior)
    ).toThrowError(FinancePostingIntegrityError);
  });

  it("requires no prior authority for the first revision", () => {
    const first = readChargebackPrincipalPostingAllocationAuthority(
      allocationInput(),
      postingDecoderEnvelope
    );
    expect(() => assertChargebackPrincipalPostingPriorAuthorityResolved(first, null)).not.toThrow();
    expect(() => assertChargebackPrincipalPostingPriorAuthorityResolved(first, first)).toThrowError(
      FinancePostingIntegrityError
    );
  });

  it("rejects a revision timestamp earlier than its resolved predecessor", () => {
    const { current, prior } = decodedVersionTwo();
    expect(() =>
      assertChargebackPrincipalPostingPriorAuthorityResolved(
        { ...current, approvedAt: "2026-08-04T00:59:59Z" },
        prior
      )
    ).toThrowError(
      expect.objectContaining<Partial<FinancePostingIntegrityError>>({
        reason: "invalid_chronology"
      })
    );
  });
});
