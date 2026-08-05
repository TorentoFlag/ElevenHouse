import {
  digestFinanceCanonicalValueV1,
  type ResolvedFinanceWalletOperationEnvelope,
  type SealedWalletJournalMutationCommand
} from "@elevenhouse/domain/finance-core";
import { describe, expect, it } from "vitest";

import { hashFinanceCommandPayload } from "../../../../domain/src/finance-authorization/canonical-command-payload";
import { createPayableLotOperationReceipt } from "../../../../domain/src/finance-core/source-lot-operation-receipt";
import { buildReceiptTransitionCases } from "../../../../domain/src/finance-core/source-lot-operation-receipt-test-fixtures";
import { buildClientSaleCapturePosting } from "../../../../domain/src/finance-core/postings/sale-capture-posting";
import {
  createUnverifiedWalletOperationComparisonSnapshot,
  createUnverifiedWalletProjectionLimitPolicySnapshot,
  createWalletOperationCommitBindingRecord
} from "../../../../domain/src/finance-core/wallet-operation-projection";
import {
  assertCreatedLotPreservesLockedParent,
  assertLockedLotMatchesTransition,
  assertWalletHeadMatchesCommand,
  createResolvedPersistedRootCaptureAuthority,
  deriveNextWalletBalances,
  mapCreatedPayableLotRows,
  mapDatabaseIssuedWalletCommitReceipt,
  prepareWalletJournalMutation,
  WalletRowMappingIntegrityError,
  zeroWalletBalances
} from "./wallet-row-mapper";

const walletId = "11111111-1111-4111-8111-111111111111";
const walletDecoderEnvelope = Object.freeze({
  maxEconomicEdges: 64,
  maxAuthorityRefs: 16,
  maxJournalEntries: 16,
  maxDecimalDigits: 38
});
const postingDecoderEnvelope = Object.freeze({
  maxJournalEntries: 16,
  maxProofEdges: 64,
  maxComponentBindings: 64,
  maxAllocations: 64,
  maxDecimalDigits: 38
});
const receiptDecoderEnvelope = Object.freeze({
  maxAuthorityRefs: 16,
  maxEffects: 64,
  maxLineage: 64,
  maxComponentSlots: 64,
  maxDecimalDigits: 38
});

describe("wallet row mapper", () => {
  it("strictly prepares the first canonical sale and preserves its exact provenance", () => {
    const command = firstSaleCommand();

    const prepared = prepareWalletJournalMutation(command);
    const previous = assertWalletHeadMatchesCommand(prepared, null);
    const next = deriveNextWalletBalances(prepared, previous);
    const lots = mapCreatedPayableLotRows(prepared, {
      rootCaptureAuthority: rootCaptureAuthority(prepared),
      lockedLots: []
    });

    expect(previous).toEqual(zeroWalletBalances());
    expect(next).toEqual({
      pendingMinor: "9600",
      availableMinor: "0",
      reservedMinor: "0",
      payoutPendingMinor: "0",
      refundPendingMinor: "0",
      recoveryReceivableMinor: "0"
    });
    expect(prepared.expectedWalletRevision).toBe("0");
    expect(prepared.nextWalletRevision).toBe("1");
    expect(prepared.receipt.previousLotState.version).toBe("1");
    expect(prepared.receipt.nextLotState.version).toBe("2");
    expect(prepared.authorities).toEqual([
      expect.objectContaining({
        receiptId: prepared.receipt.receiptId,
        authorityKind: "canonical_capture",
        authorityId: "intent-order-receipt-payout",
        authorityVersion: "3"
      })
    ]);
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({
      walletId,
      originalSaleId: "order-receipt-payout",
      amountMinor: "9600",
      providerAccountSeriesId: "arc-series-live",
      providerAccountId: "arc-account-live",
      providerIdentityVersion: 1,
      captureSessionId: "session-order-receipt-payout",
      captureAmountMinor: "10000",
      captureCurrency: "RUB",
      captureEvidenceAuthorityKind: "provider_operation_result",
      captureEvidenceAuthorityId: "provider-result-order-receipt-payout",
      captureEvidenceArtifactId: "artifact-order-receipt-payout",
      captureEvidenceArtifactDigest: sha("9"),
      fulfillmentDecisionId: "single.once.live.solo",
      fulfillmentDecisionVersion: "1"
    });
    expect(lots[0]?.economicsSnapshotDigest).toBe(
      digestFinanceCanonicalValueV1(command.sourceLotTransition.createdLots[0]!.economics)
    );
    expect(() =>
      mapCreatedPayableLotRows(prepared, { rootCaptureAuthority: null, lockedLots: [] })
    ).toThrow(WalletRowMappingIntegrityError);
    expect(lots[0]?.riskPolicyDigest).toBe(
      digestFinanceCanonicalValueV1(command.sourceLotTransition.createdLots[0]!.riskPolicy)
    );
    expect(lots[0]?.fulfillmentDecisionDigest).toBe(
      digestFinanceCanonicalValueV1(command.sourceLotTransition.createdLots[0]!.fulfillment)
    );
  });

  it("rejects proof substitution, transition drift, caller extras and accessor-backed input", () => {
    const proofSubstitution = structuredClone(firstSaleCommand());
    (
      proofSubstitution.journalLinkProof as {
        proofDigest: `sha256:${string}`;
      }
    ).proofDigest = sha("f");
    expect(() => prepareWalletJournalMutation(proofSubstitution)).toThrow(
      WalletRowMappingIntegrityError
    );

    const transitionDrift = structuredClone(firstSaleCommand());
    (
      transitionDrift.sourceLotTransition.createdLots[0]!.amount as {
        amountMinor: number;
      }
    ).amountMinor = 9_599;
    expect(() => prepareWalletJournalMutation(transitionDrift)).toThrow(
      WalletRowMappingIntegrityError
    );

    const extra = firstSaleCommand() as SealedWalletJournalMutationCommand & {
      trustedReceipt?: string;
    };
    (extra as { trustedReceipt?: string }).trustedReceipt = "caller-issued";
    expect(() => prepareWalletJournalMutation(extra)).toThrow(WalletRowMappingIntegrityError);

    const accessor = firstSaleCommand();
    let getterCalls = 0;
    Object.defineProperty(accessor, "operationId", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return "must-not-run";
      }
    });
    expect(() => prepareWalletJournalMutation(accessor)).toThrow(WalletRowMappingIntegrityError);
    expect(getterCalls).toBe(0);
  });

  it("copies the full persisted capture authority from a locked parent into a child lot", () => {
    const prepared = prepareWalletJournalMutation(firstSaleCommand());
    const [root] = mapCreatedPayableLotRows(prepared, {
      rootCaptureAuthority: rootCaptureAuthority(prepared),
      lockedLots: []
    });
    const source = prepared.transition.createdLots[0];
    const rootLineage = prepared.lineage.find((entry) => entry.relation === "root_created");
    if (!root || !source || !rootLineage) throw new Error("Missing canonical root lot fixture");
    const childLot = {
      ...source,
      lotId: "child-lot-inherited-authority",
      parentLotId: root.lotId,
      lineageDepth: root.lineageDepth + 1
    };
    const childPrepared = {
      ...prepared,
      receipt: { ...prepared.receipt, operationKind: "hold_release" },
      transition: { ...prepared.transition, createdLots: [childLot] },
      lineage: [
        {
          ...rootLineage,
          relation: "created",
          lotId: childLot.lotId,
          parentLotId: root.lotId
        }
      ]
    } as unknown as typeof prepared;

    const [child] = mapCreatedPayableLotRows(childPrepared, {
      rootCaptureAuthority: null,
      lockedLots: [root]
    });

    expect(child).toMatchObject({
      captureSessionId: root.captureSessionId,
      captureAmountMinor: root.captureAmountMinor,
      captureCurrency: root.captureCurrency,
      captureEvidenceAuthorityKind: root.captureEvidenceAuthorityKind,
      captureEvidenceAuthorityId: root.captureEvidenceAuthorityId,
      captureEvidenceArtifactId: root.captureEvidenceArtifactId,
      captureEvidenceArtifactDigest: root.captureEvidenceArtifactDigest
    });
  });

  it("rejects an outer operation-envelope policy that does not bind the resolved policy", () => {
    const policyDrift = structuredClone(firstSaleCommand());
    (policyDrift.operationEnvelope as { policyDigest: `sha256:${string}` }).policyDigest = sha("e");

    expect(() => prepareWalletJournalMutation(policyDrift)).toThrow(WalletRowMappingIntegrityError);
  });

  it("compares a locked consumed lot against exact immutable capture provenance", () => {
    const prepared = prepareWalletJournalMutation(firstSaleCommand());
    const source = prepared.transition.createdLots[0];
    const persisted = mapCreatedPayableLotRows(prepared, {
      rootCaptureAuthority: rootCaptureAuthority(prepared),
      lockedLots: []
    })[0];
    if (!source || !persisted) throw new Error("Missing canonical sale lot");
    const consumed = {
      ...source,
      status: "consumed" as const,
      consumedByOperationId: "later-operation",
      consumedAt: "2026-08-02T09:00:00Z"
    };

    expect(() => assertLockedLotMatchesTransition(prepared, consumed, persisted)).not.toThrow();
    expect(() =>
      assertLockedLotMatchesTransition(prepared, consumed, {
        ...persisted,
        createdByOperationId: "substituted-origin-operation"
      })
    ).toThrow(WalletRowMappingIntegrityError);

    const child = {
      ...persisted,
      lotId: "child-lot",
      parentLotId: persisted.lotId,
      lineageDepth: persisted.lineageDepth + 1
    };
    expect(() => assertCreatedLotPreservesLockedParent(child, persisted)).not.toThrow();
    for (const [field, value] of [
      ["captureSessionId", "other-session"],
      ["captureAmountMinor", "9999"],
      ["captureCurrency", "USD"],
      ["captureEvidenceAuthorityKind", "provider_semantic_fact"],
      ["captureEvidenceAuthorityId", "other-authority"],
      ["captureEvidenceArtifactId", "other-artifact"],
      ["captureEvidenceArtifactDigest", sha("8")]
    ] as const) {
      expect(() =>
        assertCreatedLotPreservesLockedParent({ ...child, [field]: value }, persisted)
      ).toThrow(WalletRowMappingIntegrityError);
    }
  });

  it("maps only a database-issued commit digest and timestamp into the nominal receipt", () => {
    const prepared = prepareWalletJournalMutation(firstSaleCommand());
    const receipt = mapDatabaseIssuedWalletCommitReceipt(prepared, {
      commitReceiptId: "22222222-2222-4222-8222-222222222222",
      commitReceiptVersion: "1",
      commitReceiptCanonicalDigest: sha("a"),
      bindingId: prepared.binding.bindingId,
      bindingDigest: prepared.binding.bindingDigest,
      operationReceiptId: prepared.receipt.receiptId,
      operationReceiptDigest: prepared.receipt.canonicalDigest,
      journalLinkProofId: prepared.proof.proofId,
      journalLinkProofVersion: 1,
      journalLinkProofDigest: prepared.proof.proofDigest,
      walletId,
      previousWalletRevision: "0",
      nextWalletRevision: "1",
      mutationSequence: "1",
      persistenceTransactionBoundaryRef: "postgres-xid:2048",
      issuedAt: new Date("2026-08-01T09:00:01.000Z")
    });

    expect(receipt).toMatchObject({
      kind: "verified_wallet_operation_commit_receipt",
      receiptId: "22222222-2222-4222-8222-222222222222",
      bindingRecordId: prepared.binding.bindingId,
      canonicalDigest: sha("a"),
      walletId,
      previousWalletRevision: "0",
      nextWalletRevision: "1"
    });
    expect(receipt.receiptId).not.toBe(receipt.bindingRecordId);
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it.each([
    ["a caller-shaped receipt identity", "wallet-receipt-1", "postgres-xid:2048"],
    ["the binding identity reused as the receipt identity", null, "postgres-xid:2048"],
    [
      "a caller-issued transaction boundary",
      "22222222-2222-4222-8222-222222222222",
      "wallet-boundary-1"
    ]
  ])("rejects %s", (_case, receiptId, boundaryRef) => {
    const prepared = prepareWalletJournalMutation(firstSaleCommand());

    expect(() =>
      mapDatabaseIssuedWalletCommitReceipt(prepared, {
        commitReceiptId: receiptId ?? prepared.binding.bindingId,
        commitReceiptVersion: "1",
        commitReceiptCanonicalDigest: sha("a"),
        bindingId: prepared.binding.bindingId,
        bindingDigest: prepared.binding.bindingDigest,
        operationReceiptId: prepared.receipt.receiptId,
        operationReceiptDigest: prepared.receipt.canonicalDigest,
        journalLinkProofId: prepared.proof.proofId,
        journalLinkProofVersion: 1,
        journalLinkProofDigest: prepared.proof.proofDigest,
        walletId,
        previousWalletRevision: "0",
        nextWalletRevision: "1",
        mutationSequence: "1",
        persistenceTransactionBoundaryRef: boundaryRef,
        issuedAt: new Date("2026-08-01T09:00:01.000Z")
      })
    ).toThrow(WalletRowMappingIntegrityError);
  });
});

function firstSaleCommand(): SealedWalletJournalMutationCommand {
  const receiptCase = buildReceiptTransitionCases().find(({ kind }) => kind === "sale_capture");
  if (!receiptCase) throw new Error("Missing canonical sale fixture");
  const receipt = createPayableLotOperationReceipt(receiptCase.transition);
  const policy = createUnverifiedWalletProjectionLimitPolicySnapshot(
    {
      policyId: "wallet-projection-standard",
      version: "1",
      effectiveAt: "2026-07-01T00:00:00Z",
      maxEconomicEdgesPerOperation: "64",
      maxAuthorityRefsPerOperation: "16"
    },
    walletDecoderEnvelope
  );
  const componentBindings = receipt.requiredExternalLinkSlots.map((slot) => {
    const core = {
      kind: "finance_component_slot_resolution_binding" as const,
      bindingId: `binding-${slot.slotId}`,
      version: "1",
      authorizationStatus: "unverified" as const,
      digestPurpose: "drift_detection_only" as const,
      operationReceiptId: receipt.receiptId,
      operationReceiptDigest: receipt.canonicalDigest,
      slotId: slot.slotId,
      effectId: slot.effectId,
      componentId: "component-payable",
      requiredAuthorityDigest: hashFinanceCommandPayload(slot.requiredAuthority)
    };
    return Object.freeze({ ...core, bindingDigest: hashFinanceCommandPayload(core) });
  });
  const economicEdges = receipt.effects.map((effect) => ({
    edgeId: effect.effectId,
    bucket: effect.bucket,
    side: effect.side,
    amount: effect.amount,
    links: {
      originalSaleId: effect.knownLinks.originalSaleId,
      componentId: "component-payable",
      payableLotId: effect.knownLinks.payableLotId,
      payoutAllocationId: effect.knownLinks.payoutAllocationId
    }
  }));
  const capture = receipt.authorityRefs[0];
  if (capture?.kind !== "canonical_capture") throw new Error("Missing capture authority");
  const operationSnapshot = createUnverifiedWalletOperationComparisonSnapshot(
    {
      schemaVersion: 1,
      authorizationStatus: "unverified",
      snapshotId: "snapshot-sale-1",
      operationId: receipt.operationId,
      sourceKey: receipt.sourceKey,
      occurredAt: receipt.occurredAt,
      astrologerUserId: receipt.astrologerUserId,
      currency: "RUB",
      unverifiedLimitPolicy: policy,
      previousLotStateDigest: receipt.previousLotState.digest,
      nextLotStateDigest: receipt.nextLotState.digest,
      historyRecordDigest: receipt.historyRecord.canonicalDigest,
      previousWalletRevision: "0",
      nextWalletRevision: "1",
      authorityRefs: [
        {
          kind: capture.kind,
          authorityId: capture.intentId,
          version: capture.intentVersion,
          canonicalDigest: capture.canonicalDigest
        }
      ],
      economicEdges
    },
    walletDecoderEnvelope,
    policy
  );
  const snapshotRef = {
    snapshotId: operationSnapshot.snapshotId,
    operationId: operationSnapshot.operationId,
    sourceKey: operationSnapshot.sourceKey,
    previousWalletRevision: operationSnapshot.previousWalletRevision,
    nextWalletRevision: operationSnapshot.nextWalletRevision,
    previousLotStateDigest: operationSnapshot.previousLotStateDigest,
    nextLotStateDigest: operationSnapshot.nextLotStateDigest,
    historyRecordDigest: operationSnapshot.historyRecordDigest,
    snapshotDigest: operationSnapshot.snapshotDigest
  };
  const lot = receiptCase.transition.createdLots[0];
  if (!lot) throw new Error("Missing canonical sale lot");
  const authorityCore = {
    kind: "sale_capture_posting_authority" as const,
    schemaVersion: 1 as const,
    authorityId: "sale-authority-1",
    version: 1,
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    operationId: receipt.operationId,
    operationReceiptId: receipt.receiptId,
    operationReceiptDigest: receipt.canonicalDigest as `sha256:${string}`,
    componentBindingsDigest: hashFinanceCommandPayload(componentBindings),
    providerClearingComponentId: "component-provider-clearing",
    platformCommissionComponentId: "component-platform-commission",
    orderEconomics: lot.economics
  };
  const postingRecipe = buildClientSaleCapturePosting(
    {
      context: {
        journalTransactionId: "journal-sale-1",
        linkProofId: "proof-sale-1",
        operationId: receipt.operationId,
        sourceKey: receipt.sourceKey,
        occurredAt: receipt.occurredAt,
        postedAt: receipt.occurredAt
      },
      authority: {
        ...authorityCore,
        canonicalDigest: hashFinanceCommandPayload(authorityCore)
      },
      operationReceipt: receipt,
      componentBindings,
      operationSnapshotRef: snapshotRef
    },
    postingDecoderEnvelope,
    receiptDecoderEnvelope
  );
  const previousWallet = {
    walletId,
    revision: "0",
    astrologerUserId: receipt.astrologerUserId,
    currency: "RUB" as const,
    balances: zeroWalletBalances()
  };
  const nextWallet = {
    ...previousWallet,
    revision: "1",
    balances: { ...zeroWalletBalances(), pendingMinor: "9600" }
  };
  const commitBinding = createWalletOperationCommitBindingRecord(
    {
      schemaVersion: 1,
      bindingId: "wallet-binding-sale-1",
      operationSnapshot,
      journalTransaction: postingRecipe.transaction,
      previousWallet,
      nextWallet,
      boundAt: receipt.occurredAt
    },
    walletDecoderEnvelope,
    policy
  );
  const operationEnvelope = {
    kind: "resolved_finance_operation_envelope",
    policyId: policy.policyId,
    policyVersion: 1,
    policyDigest: policy.canonicalDigest as `sha256:${string}`,
    maximumRows: 64,
    maximumDecimalDigits: 38,
    maximumArtifactBytes: 1_000_000,
    walletProjection: {
      decoderEnvelope: walletDecoderEnvelope,
      resolvedLimitPolicy: policy
    }
  } as unknown as ResolvedFinanceWalletOperationEnvelope;
  return {
    operationId: receipt.operationId,
    walletId,
    astrologerUserId: receipt.astrologerUserId,
    currency: "RUB",
    expectedWalletRevision: "0",
    sourceLotTransition: {
      operationId: receiptCase.transition.operationId,
      consumedLots: receiptCase.transition.consumedLots,
      createdLots: receiptCase.transition.createdLots
    },
    sourceTransitionReceipt: receipt,
    postingRecipe,
    journalLinkProof: postingRecipe.linkProof,
    commitBinding,
    operationEnvelope
  };
}

function rootCaptureAuthority(prepared: ReturnType<typeof prepareWalletJournalMutation>) {
  const lot = prepared.transition.createdLots[0];
  const capture = lot?.captureSource.paymentIntent.capture;
  const captureSessionId = lot?.captureSource.paymentIntent.captureSessionId;
  if (!lot || !capture || !captureSessionId) throw new Error("Missing canonical capture fixture");
  return createResolvedPersistedRootCaptureAuthority({
    canonicalCaptureEvidenceId: lot.captureSource.canonicalEvidenceId,
    captureIntentId: lot.captureSource.intentId,
    captureSessionId,
    providerAccountSeriesId: capture.providerAccount.seriesId,
    providerAccountId: capture.providerAccount.providerAccountId,
    providerIdentityVersion: capture.providerAccount.identityVersion,
    providerPaymentId: capture.providerPaymentId,
    captureAmountMinor: String(capture.amount.amountMinor),
    captureCurrency: capture.amount.currency,
    captureEvidenceAuthorityKind: "provider_operation_result",
    captureEvidenceAuthorityId: "provider-result-order-receipt-payout",
    captureEvidenceArtifactId: "artifact-order-receipt-payout",
    captureEvidenceArtifactDigest: sha("9")
  });
}

function sha(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}
