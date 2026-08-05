import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { expectPostingError } from "./posting-test-assertions";
import { postingDecoderEnvelope } from "./posting-test-primitives";
import { receiptDecoderEnvelope } from "./chargeback-confirmed-posting-test-fixtures";
import { rehashChargebackAllocation } from "./chargeback-allocation-posting-test-fixtures";
import { rehashChargebackPrincipalPosition } from "./chargeback-principal-position-test-fixtures";
import { chargebackRecoveryRevisionPostingFixture } from "./chargeback-resolution-revision-test-fixture";
import {
  chargebackRecoveryPostingFixtures,
  rehashRecoveryAuthority,
  withWonRecoveryOutcome
} from "./chargeback-recovery-posting-test-fixtures";
import { buildChargebackRecoveryCollectionPosting } from "./chargeback-recovery-posting";

describe("chargeback recovery collection posting", () => {
  it("posts exact receipt-backed payable Y against the bounded recovery exposure", () => {
    const input = chargebackRecoveryPostingFixtures().first;
    const result = build(input);

    expect(result).toMatchObject({
      kind: "journal",
      authorizationStatus: "unverified",
      atomicityStatus: "unverified"
    });
    expect(result.transaction.sourceKey).toEqual({
      kind: "chargeback",
      sourceId: "recovery-collection-1",
      operation: "recovery_collected"
    });
    expect(result.transaction.entries).toMatchObject([
      {
        account: {
          code: "astrologer_available",
          astrologerUserId: "astrologer-1",
          currency: "RUB"
        },
        side: "debit",
        amount: { amountMinor: 200, currency: "RUB" },
        links: {
          originalSaleId: "order-receipt-recovery",
          componentId: "component-future-payable"
        }
      },
      {
        account: {
          code: "astrologer_recovery_receivable",
          astrologerUserId: "astrologer-1",
          currency: "RUB"
        },
        side: "credit",
        amount: { amountMinor: 200, currency: "RUB" },
        links: {
          originalSaleId: "order-receipt-recovery",
          componentId: "component-recovery-collection"
        }
      }
    ]);
    expect(result.linkProof.edges.map((edge) => edge.semanticEdgeId)).toEqual(
      input.operationReceipt.effects.map((effect) => effect.effectId)
    );
    expect(result.linkProof.allocationAuthorityRef).toMatchObject({
      authorityId: "recovery-collection-1",
      version: 1,
      canonicalDigest: input.authority.canonicalDigest
    });
  });

  it("posts one bounded exposure from two exact Task5 payable lots", () => {
    const input = chargebackRecoveryPostingFixtures().multiLot;
    const result = build(input);

    expect(result.transaction.totalDebitMinor).toBe("200");
    expect(result.transaction.entries.map((entry) => [entry.account.code, entry.side])).toEqual([
      ["astrologer_available", "debit"],
      ["astrologer_recovery_receivable", "credit"],
      ["astrologer_reserved", "debit"],
      ["astrologer_recovery_receivable", "credit"]
    ]);
  });

  it("requires complete unique collection-row allocation without sum or exposure drift", () => {
    const input = chargebackRecoveryPostingFixtures().multiLot;
    const first = input.authority.collectionRows[0]!;
    const second = input.authority.collectionRows[1]!;

    expectPostingError(
      () =>
        build({
          ...input,
          authority: rehashRecoveryAuthority({
            ...input.authority,
            collectionRows: [first]
          })
        }),
      "amount_mismatch"
    );
    expectPostingError(
      () =>
        build({
          ...input,
          authority: rehashRecoveryAuthority({
            ...input.authority,
            collectionRows: [first, first]
          })
        }),
      "authority_mismatch"
    );
    expectPostingError(
      () =>
        build({
          ...input,
          authority: rehashRecoveryAuthority({
            ...input.authority,
            collectionRows: [{ ...first, exposureId: "foreign-recovery-exposure" }, second]
          })
        }),
      "authority_mismatch"
    );
    expectPostingError(
      () =>
        build({
          ...input,
          authority: rehashRecoveryAuthority({
            ...input.authority,
            collectionRows: [first, { ...second, amount: { amountMinor: 50, currency: "RUB" } }]
          })
        }),
      "amount_mismatch"
    );
  });

  it("requires the exact original recovery debit journal entry and component", () => {
    const input = chargebackRecoveryPostingFixtures().first;
    const forgedJournal = structuredClone(input.originalAllocationJournals[0]) as unknown as {
      entries: { side: "debit" | "credit" }[];
    };
    const index = input.authority.tranches[0]!.originalJournalEntry.entryIndex;
    forgedJournal.entries[index]!.side = "credit";
    expectPostingError(
      () =>
        build({
          ...input,
          originalAllocationJournals: [forgedJournal]
        }),
      "proof_transaction_mismatch"
    );

    const exposures = [
      {
        ...input.authority.exposures[0]!,
        originalComponentId: "foreign-component"
      }
    ];
    expectPostingError(
      () =>
        build({ ...input, authority: rehashRecoveryAuthority({ ...input.authority, exposures }) }),
      "proof_transaction_mismatch"
    );
  });

  it("enforces cumulative prior -> delta -> next exposure without replay or over-collection", () => {
    const { first, second } = chargebackRecoveryPostingFixtures();
    expect(first.authority.sourceAuthority.version).toBe(1);
    expect(second.authority.sourceAuthority.version).toBe(1);
    expect(second.authority.version).toBe(2);
    expect(build(second).transaction.totalDebitMinor).toBe("150");
    expectPostingError(
      () => build({ ...second, resolvedPriorAuthorities: [] }),
      "authority_mismatch"
    );
    const replayedExposure = {
      ...second.authority.exposures[0]!,
      priorCollectedAmount: { amountMinor: 0, currency: "RUB" },
      nextCollectedAmount: { amountMinor: 150, currency: "RUB" }
    };
    expectPostingError(
      () =>
        build({
          ...second,
          authority: rehashRecoveryAuthority({
            ...second.authority,
            exposures: [replayedExposure]
          })
        }),
      "authority_mismatch"
    );
    const over = {
      ...first.authority.exposures[0]!,
      collectionDelta: { amountMinor: 600, currency: "RUB" },
      nextCollectedAmount: { amountMinor: 600, currency: "RUB" }
    };
    expectPostingError(
      () =>
        build({
          ...first,
          authority: rehashRecoveryAuthority({
            ...first.authority,
            collectionTotal: over.collectionDelta,
            exposures: [over]
          })
        }),
      "amount_mismatch"
    );
    expectPostingError(
      () =>
        build({
          ...second,
          authority: rehashRecoveryAuthority({ ...second.authority, version: 3 })
        }),
      "authority_mismatch"
    );
  });

  it("cannot rebind a cumulative exposure to a replacement allocation and journal", () => {
    const { second } = chargebackRecoveryPostingFixtures();
    const originalAllocation = second.resolvedAllocationAuthorities[0]!;
    const replacementRevisionId = "replacement-recovery-allocation-revision";
    const replacementSource = Object.freeze({
      ...originalAllocation.sourceAuthority,
      accountingAllocationId: "replacement-recovery-allocation",
      accountingAllocationRevisionId: replacementRevisionId
    });
    const originalPosition = second.resolvedPrincipalPositionTransitionBindings[0]!;
    const replacementPosition = rehashChargebackPrincipalPosition({
      ...originalPosition,
      bindingId: "replacement-recovery-position-transition",
      accountingAllocationId: replacementSource.accountingAllocationId,
      accountingAllocationRevisionId: replacementRevisionId
    });
    const replacementAllocation = rehashChargebackAllocation({
      ...originalAllocation,
      authorityId: replacementRevisionId,
      sourceAuthority: replacementSource,
      positionTransitionRef: {
        kind: replacementPosition.kind,
        bindingId: replacementPosition.bindingId,
        nextPositionVersion: replacementPosition.nextPositionVersion,
        bindingDigest: replacementPosition.bindingDigest
      }
    });
    const originalJournal = second.originalAllocationJournals[0]!;
    const replacementJournal = Object.freeze({
      ...originalJournal,
      id: "replacement-recovery-allocation-journal",
      sourceKey: Object.freeze({
        ...originalJournal.sourceKey,
        sourceId: replacementRevisionId
      })
    });
    const originalTranche = second.authority.tranches[0]!;
    const replacementTranche = Object.freeze({
      ...originalTranche,
      allocationAuthorityId: replacementRevisionId,
      accountingAllocationRevisionId: replacementRevisionId,
      positionTransitionBindingId: replacementPosition.bindingId,
      originalJournalEntry: Object.freeze({
        ...originalTranche.originalJournalEntry,
        transactionId: replacementJournal.id
      })
    });
    const replacementRef = Object.freeze({
      ...second.authority.allocationRefs[0]!,
      authorityId: replacementRevisionId,
      accountingAllocationId: replacementSource.accountingAllocationId,
      canonicalDigest: replacementAllocation.canonicalDigest,
      journalTransactionId: replacementJournal.id,
      journalDigest: hashFinanceCommandPayload(replacementJournal)
    });

    expectPostingError(
      () =>
        build({
          ...second,
          authority: rehashRecoveryAuthority({
            ...second.authority,
            allocationRefs: [replacementRef],
            tranches: [replacementTranche]
          }),
          resolvedAllocationAuthorities: [replacementAllocation],
          resolvedPrincipalPositionTransitionBindings: [replacementPosition],
          originalAllocationJournals: [replacementJournal]
        }),
      "authority_mismatch"
    );
  });

  it("accepts adjacent recovery tranches on one position and rejects missing or duplicate revisions", () => {
    const input = chargebackRecoveryRevisionPostingFixture();
    expect(build(input).transaction.totalDebitMinor).toBe("200");
    expect(input.authority.exposures[0]).toMatchObject({
      sourceCapacity: { amountMinor: 800 },
      allocatedAmount: { amountMinor: 800 }
    });

    expectPostingError(
      () =>
        build({
          ...input,
          authority: rehashRecoveryAuthority({
            ...input.authority,
            tranches: [input.authority.tranches[0]!]
          })
        }),
      "amount_mismatch"
    );
    expectPostingError(
      () =>
        build({
          ...input,
          authority: rehashRecoveryAuthority({
            ...input.authority,
            tranches: [
              input.authority.tranches[0]!,
              input.authority.tranches[1]!,
              input.authority.tranches[1]!
            ]
          })
        }),
      "authority_mismatch"
    );
  });

  it("rejects foreign provider/case scope and invented receipt components", () => {
    const input = chargebackRecoveryPostingFixtures().first;
    expectPostingError(
      () =>
        build({
          ...input,
          authority: rehashRecoveryAuthority({
            ...input.authority,
            providerPaymentId: "foreign-payment"
          })
        }),
      "scope_mismatch"
    );
    const bindings = structuredClone(input.componentBindings);
    bindings[1]!.componentId = "invented-component";
    const core = { ...bindings[1]! };
    delete (core as { bindingDigest?: unknown }).bindingDigest;
    bindings[1]!.bindingDigest = hashFinanceCommandPayload(core);
    expectPostingError(
      () => build({ ...input, componentBindings: bindings }),
      "authority_mismatch"
    );
  });

  it("allows outstanding recovery after lost but rejects any collection after won", () => {
    const afterLost = chargebackRecoveryPostingFixtures().afterLost;
    expect(build(afterLost).transaction.totalDebitMinor).toBe("200");
    expect(afterLost.authority.latestOutcomeEvidenceRef).toMatchObject({ outcome: "lost" });
    expectPostingError(() => build(withWonRecoveryOutcome(afterLost)), "source_mismatch");
  });

  it("normalizes both OOB envelopes before target and rejects nested/sparse input", () => {
    const hostile = hostileProxy({});
    expectPostingError(
      () =>
        buildChargebackRecoveryCollectionPosting(
          hostile.value as never,
          undefined as never,
          receiptDecoderEnvelope
        ),
      "decoder_envelope_required"
    );
    expect(hostile.trapCalls()).toBe(0);
    const input = chargebackRecoveryPostingFixtures().first;
    const nested = hostileProxy(input.authority.exposures[0]!);
    expectPostingError(
      () =>
        build({
          ...input,
          authority: { ...input.authority, exposures: [nested.value] }
        }),
      "invalid_shape"
    );
    expect(nested.trapCalls()).toBe(0);
    expectPostingError(
      () => build({ ...input, resolvedAllocationAuthorities: new Array(1) }),
      "invalid_shape"
    );
    const multiLot = chargebackRecoveryPostingFixtures().multiLot;
    expectPostingError(
      () =>
        buildChargebackRecoveryCollectionPosting(
          multiLot,
          { ...postingDecoderEnvelope, maxAllocations: 1 },
          receiptDecoderEnvelope
        ),
      "decoder_envelope_exceeded"
    );
    const collectionRow = hostileProxy(multiLot.authority.collectionRows[0]!);
    expectPostingError(
      () =>
        build({
          ...multiLot,
          authority: { ...multiLot.authority, collectionRows: [collectionRow.value] }
        }),
      "invalid_shape"
    );
    expect(collectionRow.trapCalls()).toBe(0);
  });
});

function build(input: unknown) {
  return buildChargebackRecoveryCollectionPosting(
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
