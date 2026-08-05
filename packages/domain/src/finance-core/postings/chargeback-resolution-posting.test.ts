import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { createChargebackLostAuthority } from "../source-lots";
import { expectPostingError } from "./posting-test-assertions";
import { postingDecoderEnvelope } from "./posting-test-primitives";
import { receiptDecoderEnvelope } from "./chargeback-confirmed-posting-test-fixtures";
import { buildChargebackLostResolutionNoPosting } from "./chargeback-resolution-lost-posting";
import { rehashChargebackPrincipalPosition } from "./chargeback-principal-position-test-fixtures";
import {
  assertUniqueChargebackRecoveryJournalSources,
  readChargebackResolutionHistory
} from "./chargeback-resolution-history";
import { readChargebackResolutionPositionHistory } from "./chargeback-resolution-position-history";
import {
  chargebackLostResolutionFixture,
  chargebackWonResolutionFixture
} from "./chargeback-resolution-posting-test-fixtures";
import { rehashResolutionAuthority } from "./chargeback-resolution-test-primitives";
import { chargebackResolutionRevisionHistoryFixture } from "./chargeback-resolution-revision-test-fixture";
import { assertAndBuildChargebackWonResolutionComponents } from "./chargeback-resolution-proof";
import { outcomeEvidenceRef } from "./chargeback-resolution-outcome-evidence";
import {
  chargebackLostAfterProviderAdvanceFixture,
  chargebackProviderAdvanceFixture,
  chargebackWonAfterProviderAdvanceFixture
} from "./chargeback-resolution-provider-update-test-fixture";
import { buildChargebackWonResolutionPosting } from "./chargeback-resolution-won-posting";

describe("chargeback won resolution posting", () => {
  it("derives current O/H/E/U and reverses the provider principal exactly once", () => {
    const input = chargebackWonResolutionFixture();
    const result = buildWon(input);

    expect(result).toMatchObject({
      kind: "journal",
      authorizationStatus: "unverified",
      atomicityStatus: "unverified"
    });
    expect(
      result.transaction.entries.map((entry) => [
        entry.account.code,
        entry.side,
        entry.amount.amountMinor
      ])
    ).toEqual([
      ["arc_provider_clearing", "debit", 5_000],
      ["astrologer_recovery_receivable", "credit", 300],
      ["astrologer_reserved", "credit", 2_000],
      ["astrologer_reserved", "credit", 200],
      ["platform_commission_revenue", "credit", 500],
      ["chargeback_principal_suspense", "credit", 2_000]
    ]);
    expect(result.transaction.totalDebitMinor).toBe("5000");
    expect(result.transaction.entries.filter((entry) => entry.side === "debit")).toHaveLength(1);
    expect(result.linkProof.edges.filter((edge) => edge.semanticEdgeId !== null)).toHaveLength(2);
  });

  it("rejects drifted cumulative recovery and platform components even when B still balances", () => {
    const input = chargebackWonResolutionFixture();
    const authority = rehashResolutionAuthority({
      ...input.authority,
      outstandingRecovery: { amountMinor: 400, currency: "RUB" },
      platformReversal: { amountMinor: 400, currency: "RUB" }
    });
    expectPostingError(() => buildWon({ ...input, authority }), "amount_mismatch");
  });

  it("requires exact latest allocation/recovery journals and current provider scope", () => {
    const input = chargebackWonResolutionFixture();
    const recoveryJournals = structuredClone(input.recoveryJournals) as unknown as {
      entries: { links: { componentId: string | null } }[];
    }[];
    recoveryJournals[0]!.entries[0]!.links.componentId = "foreign-component";
    expectPostingError(
      () => buildWon({ ...input, recoveryJournals }),
      "proof_transaction_mismatch"
    );
    const authority = rehashResolutionAuthority({
      ...input.authority,
      providerPaymentId: "foreign-provider-payment"
    });
    expectPostingError(() => buildWon({ ...input, authority }), "scope_mismatch");

    const duplicateSource = structuredClone(input.recoveryJournals[0]!) as unknown as {
      id: string;
    } & (typeof input.recoveryJournals)[number];
    duplicateSource.id = "duplicate-recovery-journal-id";
    expectPostingError(
      () =>
        assertUniqueChargebackRecoveryJournalSources([input.recoveryJournals[0]!, duplicateSource]),
      "proof_transaction_mismatch"
    );
  });

  it("accepts only explicit internal audited outcome evidence, not a webhook claim", () => {
    const input = chargebackWonResolutionFixture();
    expectPostingError(
      () =>
        buildWon({
          ...input,
          outcomeEvidence: { ...input.outcomeEvidence, auditSource: "arc_webhook" } as never
        }),
      "evidence_mismatch"
    );
  });

  it("uses the contiguous receipt-backed B1 -> C2 -> C3 provider basis at won", () => {
    const input = chargebackWonAfterProviderAdvanceFixture();
    const result = buildWon(input);

    expect(result.transaction.entries[0]).toMatchObject({
      account: { code: "arc_provider_clearing" },
      side: "debit",
      amount: { amountMinor: 5_500 }
    });
    expect(result.transaction.entries.at(-1)).toMatchObject({
      account: { code: "chargeback_principal_suspense" },
      side: "credit",
      amount: { amountMinor: 2_500 }
    });

    const provider = chargebackProviderAdvanceFixture();
    expectPostingError(
      () =>
        buildWon({ ...input, resolvedProviderConfirmationChain: [provider.first, provider.third] }),
      "authority_mismatch"
    );
    expectPostingError(
      () =>
        buildWon({
          ...input,
          resolvedProviderConfirmationChain: [provider.first, provider.second]
        }),
      "evidence_mismatch"
    );
    const forged = structuredClone(provider.chain) as unknown as {
      providerEvidenceBinding: { providerEvidence: { amount: { amountMinor: number } } };
    }[];
    forged[1]!.providerEvidenceBinding.providerEvidence.amount.amountMinor = 201;
    expectPostingError(
      () => buildWon({ ...input, resolvedProviderConfirmationChain: forged }),
      "authority_mismatch"
    );
  });

  it("rehydrates A1 -> R1 -> A2 and aggregates the won position by cumulative identity", () => {
    const revision = chargebackResolutionRevisionHistoryFixture("2026-08-09T12:00:00Z");
    const base = chargebackWonResolutionFixture();
    const authority = rehashResolutionAuthority({
      ...base.authority,
      allocationRefs: [revision.first.allocationRef, revision.allocationRef],
      recoveryRefs: base.authority.recoveryRefs,
      unallocatedSuspense: { amountMinor: 1_200, currency: "RUB" },
      outstandingRecovery: { amountMinor: 600, currency: "RUB" },
      restoredPayable: { amountMinor: 2_200, currency: "RUB" },
      platformReversal: { amountMinor: 1_000, currency: "RUB" }
    });
    const history = readChargebackResolutionHistory(
      authority as never,
      base.resolvedProviderConfirmationChain,
      [revision.first.allocationAuthority, revision.allocationAuthority],
      [revision.first.principalPositionTransitionBinding, revision.position],
      [revision.first.allocationTransaction, revision.allocationTransaction],
      base.authority.recoveryRefs,
      base.resolvedRecoveryAuthorities,
      base.recoveryJournals,
      postingDecoderEnvelope,
      receiptDecoderEnvelope
    );

    expect(assertAndBuildChargebackWonResolutionComponents(authority as never, history)).toEqual({
      recovery: [
        {
          originalSaleId: "order-chargeback",
          componentId: "component-astrologer-recovery",
          payableLotId: "paid-payable-lot-1",
          payoutAllocationId: "payout-allocation-1",
          amountMinor: 600
        }
      ],
      platform: [
        {
          originalSaleId: "order-chargeback",
          componentId: "component-platform-commission",
          accountCode: "platform_commission_revenue",
          amount: { amountMinor: 1_000, currency: "RUB" }
        }
      ]
    });
  });

  it("rejects gaps, resets, identity rebinds, over-capacity and missing position revisions", () => {
    const revision = chargebackResolutionRevisionHistoryFixture();
    const allocations = [revision.first.allocationAuthority, revision.allocationAuthority];
    const first = revision.first.principalPositionTransitionBinding;
    const second = revision.position;
    const read = (positions: readonly unknown[]) =>
      readChargebackResolutionPositionHistory(
        allocations as never,
        positions,
        postingDecoderEnvelope
      );

    expect(read([first, second])).toHaveLength(2);
    expectPostingError(() => read([first]), "authority_mismatch");

    const gap = rehashChargebackPrincipalPosition({
      ...second,
      expectedPositionVersion: "2",
      nextPositionVersion: "3",
      previousBindingRef: { ...second.previousBindingRef!, nextPositionVersion: "2" }
    });
    expectPostingError(() => read([first, gap]), "authority_mismatch");

    const recovery = second.recoveryPositions[0]!;
    const platform = second.platformPositions[0]!;
    if (platform.kind !== "platform_commission_reversal") throw new Error("missing platform row");
    const reset = rehashChargebackPrincipalPosition({
      ...second,
      expectedPositionVersion: "0",
      nextPositionVersion: "1",
      previousBindingRef: null,
      caseExposure: {
        ...second.caseExposure,
        allocatedBefore: { amountMinor: 0, currency: "RUB" },
        allocatedAfter: { amountMinor: 800, currency: "RUB" },
        unallocatedAfter: { amountMinor: 4_200, currency: "RUB" }
      },
      recoveryPositions: [
        {
          ...recovery,
          consumedBefore: { amountMinor: 0, currency: "RUB" },
          consumedAfter: { amountMinor: 300, currency: "RUB" },
          remainingAfter: { amountMinor: 500, currency: "RUB" }
        }
      ],
      platformPositions: [
        {
          ...platform,
          revenueRemainingBefore: { amountMinor: 1_000, currency: "RUB" },
          reversedBefore: { amountMinor: 0, currency: "RUB" },
          revenueRemainingAfter: { amountMinor: 500, currency: "RUB" },
          reversedAfter: { amountMinor: 500, currency: "RUB" }
        }
      ]
    });
    expectPostingError(() => read([first, reset]), "authority_mismatch");

    const identityRebind = rehashChargebackPrincipalPosition({
      ...second,
      recoveryPositions: [{ ...recovery, componentId: "foreign-recovery-component" }]
    });
    expectPostingError(() => read([first, identityRebind]), "authority_mismatch");

    const overCapacity = rehashChargebackPrincipalPosition({
      ...second,
      caseExposure: {
        ...second.caseExposure,
        recoveryDelta: { amountMinor: 301, currency: "RUB" },
        allocationDelta: { amountMinor: 801, currency: "RUB" },
        allocatedAfter: { amountMinor: 3_801, currency: "RUB" },
        unallocatedAfter: { amountMinor: 1_199, currency: "RUB" }
      },
      recoveryPositions: [
        {
          ...recovery,
          currentDelta: { amountMinor: 301, currency: "RUB" },
          consumedAfter: { amountMinor: 801, currency: "RUB" },
          remainingAfter: { amountMinor: 0, currency: "RUB" }
        }
      ]
    });
    expectPostingError(() => read([first, overCapacity]), "amount_mismatch");
  });

  it("normalizes both OOB envelopes before hostile input and rejects sparse histories", () => {
    const hostile = hostileProxy({});
    expectPostingError(
      () =>
        buildChargebackWonResolutionPosting(
          hostile.value as never,
          undefined as never,
          receiptDecoderEnvelope
        ),
      "decoder_envelope_required"
    );
    expect(hostile.trapCalls()).toBe(0);
    const input = chargebackWonResolutionFixture();
    expectPostingError(
      () => buildWon({ ...input, resolvedRecoveryAuthorities: new Array(1) }),
      "invalid_shape"
    );
  });
});

describe("chargeback lost resolution", () => {
  it("returns typed no_posting and keeps nonzero U allocation_blocked", () => {
    const input = chargebackLostResolutionFixture();
    const result = buildLost(input);

    expect(input.authority.resultingRestrictionStatus).toBe("allocation_blocked");
    expect(result).toEqual({
      kind: "no_posting",
      authorizationStatus: "unverified",
      atomicityStatus: "unverified",
      eventKey: {
        kind: "chargeback_state",
        sourceId: "chargeback-1",
        operation: "lost_outcome_recorded"
      },
      reason: "chargeback_outcome_only",
      authorityRef: {
        kind: input.authority.kind,
        authorityId: input.authority.authorityId,
        version: input.authority.version,
        canonicalDigest: input.authority.canonicalDigest
      },
      operationSnapshotRef: null
    });
  });

  it("allows exact closure only when the latest allocation has U = 0", () => {
    const input = chargebackLostResolutionFixture(true);
    expect(input.authority).toMatchObject({
      unallocatedSuspense: { amountMinor: 0 },
      resultingRestrictionStatus: "closed_lost"
    });
    expect(buildLost(input).kind).toBe("no_posting");

    const blocked = chargebackLostResolutionFixture();
    const authority = rehashResolutionAuthority({
      ...blocked.authority,
      resultingRestrictionStatus: "closed_lost"
    });
    expectPostingError(() => buildLost({ ...blocked, authority }), "amount_mismatch");
  });

  it("binds lost to exact current allocation journal and internal outcome evidence", () => {
    const input = chargebackLostResolutionFixture();
    const allocationJournals = structuredClone(input.allocationJournals) as unknown as {
      entries: { links: { componentId: string | null } }[];
    }[];
    allocationJournals[0]!.entries[0]!.links.componentId = "foreign-component";
    expectPostingError(
      () => buildLost({ ...input, allocationJournals }),
      "proof_transaction_mismatch"
    );
    expectPostingError(
      () =>
        buildLost({
          ...input,
          outcomeEvidence: { ...input.outcomeEvidence, auditSource: "arc_webhook" } as never
        }),
      "evidence_mismatch"
    );
  });

  it("rehydrates the interleaved A1 -> R1 -> A2 recovery DAG before lost", () => {
    const revision = chargebackResolutionRevisionHistoryFixture("2026-08-09T12:00:00Z");
    const recovery = chargebackWonResolutionFixture();
    const base = chargebackLostResolutionFixture();
    const source = createChargebackLostAuthority({
      ...base.authority.sourceAuthority,
      unallocatedSuspense: { amountMinor: 1_200, currency: "RUB" }
    });
    const evidenceCore = {
      ...base.outcomeEvidence,
      sourceAuthority: source,
      sourceAuthorityDigest: hashFinanceCommandPayload(source)
    };
    Reflect.deleteProperty(evidenceCore, "canonicalDigest");
    const outcomeEvidence = Object.freeze({
      ...evidenceCore,
      canonicalDigest: hashFinanceCommandPayload(evidenceCore)
    });
    const authority = rehashResolutionAuthority({
      ...base.authority,
      sourceAuthority: source,
      sourceAuthorityDigest: hashFinanceCommandPayload(source),
      outcomeEvidenceRef: outcomeEvidenceRef(outcomeEvidence as never),
      allocationRefs: [revision.first.allocationRef, revision.allocationRef],
      recoveryRefs: recovery.authority.recoveryRefs,
      unallocatedSuspense: { amountMinor: 1_200, currency: "RUB" }
    });

    expect(
      buildLost({
        authority,
        resolvedProviderConfirmationChain: base.resolvedProviderConfirmationChain,
        resolvedAllocationAuthorities: [
          revision.first.allocationAuthority,
          revision.allocationAuthority
        ],
        resolvedPrincipalPositionTransitionBindings: [
          revision.first.principalPositionTransitionBinding,
          revision.position
        ],
        allocationJournals: [revision.first.allocationTransaction, revision.allocationTransaction],
        resolvedRecoveryAuthorities: recovery.resolvedRecoveryAuthorities,
        recoveryJournals: recovery.recoveryJournals,
        outcomeEvidence
      }).kind
    ).toBe("no_posting");
  });

  it("uses the contiguous current provider basis independently of the latest allocation at lost", () => {
    const input = chargebackLostAfterProviderAdvanceFixture();
    expect(input.authority).toMatchObject({
      disputedPrincipal: { amountMinor: 5_500 },
      unallocatedSuspense: { amountMinor: 2_500 },
      resultingRestrictionStatus: "allocation_blocked"
    });
    expect(buildLost(input).kind).toBe("no_posting");
  });
});

function buildWon(input: unknown) {
  return buildChargebackWonResolutionPosting(input, postingDecoderEnvelope, receiptDecoderEnvelope);
}

function buildLost(input: unknown) {
  return buildChargebackLostResolutionNoPosting(
    input,
    postingDecoderEnvelope,
    receiptDecoderEnvelope
  );
}

function hostileProxy<T extends object>(target: T) {
  let trapCalls = 0;
  const trap = () => {
    trapCalls += 1;
    throw new Error("must not execute Proxy trap");
  };
  return {
    value: new Proxy(target, {
      get: trap,
      getPrototypeOf: trap,
      ownKeys: trap,
      getOwnPropertyDescriptor: trap
    }),
    trapCalls: () => trapCalls
  };
}
