import { types as nodeUtilTypes } from "node:util";

import {
  assertFinanceJournalLinkProofMatchesTransaction,
  createFinanceJournalTransaction,
  digestFinanceCanonicalValueV1,
  normalizeFinancePostingDecoderEnvelope,
  normalizePayableLotReceiptDecoderEnvelope,
  rehydrateFinanceJournalLinkProof,
  rehydratePayableLotOperationReceipt,
  rehydratePayableLotPersistenceTransition,
  rehydrateWalletOperationCommitBindingRecord,
  sameFinanceCanonicalValueV1,
  type FinanceJournalLinkProof,
  type FinanceJournalTransaction,
  type FinancePostingDecoderEnvelope,
  type PayableLotOperationAuthorityRef,
  type PayableLotOperationReceipt,
  type PayableLotReceiptDecoderEnvelope,
  type PayableLotTransition,
  type SealedWalletJournalMutationCommand,
  type VerifiedWalletOperationCommitReceipt,
  type WalletOperationCommitBindingRecord
} from "@elevenhouse/domain/finance-core";

const commandKeys = [
  "operationId",
  "walletId",
  "astrologerUserId",
  "currency",
  "expectedWalletRevision",
  "sourceLotTransition",
  "sourceTransitionReceipt",
  "postingRecipe",
  "journalLinkProof",
  "commitBinding",
  "operationEnvelope"
] as const;
const operationEnvelopeKeys = [
  "kind",
  "policyId",
  "policyVersion",
  "policyDigest",
  "maximumRows",
  "maximumDecimalDigits",
  "maximumArtifactBytes",
  "walletProjection"
] as const;
const walletProjectionKeys = ["decoderEnvelope", "resolvedLimitPolicy"] as const;
const postingRecipeKeys = [
  "kind",
  "authorizationStatus",
  "atomicityStatus",
  "transaction",
  "linkProof"
] as const;
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const unsignedDecimalPattern = /^(?:0|[1-9][0-9]*)$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
declare const resolvedPersistedRootCaptureAuthorityBrand: unique symbol;

export type WalletBalanceFields = Readonly<{
  pendingMinor: string;
  availableMinor: string;
  reservedMinor: string;
  payoutPendingMinor: string;
  refundPendingMinor: string;
  recoveryReceivableMinor: string;
}>;

export type PersistedWalletHeadRow = WalletBalanceFields &
  Readonly<{
    id: string;
    astrologerUserId: string;
    currency: string;
    revision: string;
    mutationSequence: string;
    lotStateVersion: string;
    lotStateDigest: string;
    snapshotDigest: string;
    lastOperationId: string;
    lastCommitBindingId: string;
  }>;

export type PersistedPayableLotRow = Readonly<{
  lotId: string;
  walletId: string;
  astrologerUserId: string;
  currency: string;
  rootLotId: string;
  parentLotId: string | null;
  lineageDepth: number;
  originalSaleId: string;
  amountMinor: string;
  bucket: string;
  capturedAt: Date;
  createdAt: Date;
  becameAvailableAt: Date | null;
  createdByOperationId: string;
  createdByReceiptId: string;
  createdEffectId: string | null;
  componentSlotId: string | null;
  captureIntentId: string;
  captureSessionId: string;
  providerAccountSeriesId: string;
  providerAccountId: string;
  providerIdentityVersion: number;
  providerPaymentId: string;
  canonicalCaptureEvidenceId: string;
  captureAmountMinor: string;
  captureCurrency: string;
  captureEvidenceAuthorityKind: string;
  captureEvidenceAuthorityId: string;
  captureEvidenceArtifactId: string;
  captureEvidenceArtifactDigest: string;
  economicsSnapshotDigest: string;
  riskPolicyId: string;
  riskPolicyVersion: string;
  riskPolicyDigest: string;
  fulfillmentDecisionId: string;
  fulfillmentDecisionVersion: string;
  fulfillmentDecisionDigest: string;
  payoutRequestId: string | null;
  payoutAllocationId: string | null;
  refundId: string | null;
}>;

export type ResolvedPersistedRootCaptureAuthority = Readonly<{
  canonicalCaptureEvidenceId: string;
  captureIntentId: string;
  captureSessionId: string;
  providerAccountSeriesId: string;
  providerAccountId: string;
  providerIdentityVersion: number;
  providerPaymentId: string;
  captureAmountMinor: string;
  captureCurrency: "RUB";
  captureEvidenceAuthorityKind: "provider_operation_result" | "provider_semantic_fact";
  captureEvidenceAuthorityId: string;
  captureEvidenceArtifactId: string;
  captureEvidenceArtifactDigest: string;
  [resolvedPersistedRootCaptureAuthorityBrand]: true;
}>;

export function createResolvedPersistedRootCaptureAuthority(
  input: unknown
): ResolvedPersistedRootCaptureAuthority {
  return boundary(() => {
    assertExactRecordShape(input, [
      "canonicalCaptureEvidenceId",
      "captureIntentId",
      "captureSessionId",
      "providerAccountSeriesId",
      "providerAccountId",
      "providerIdentityVersion",
      "providerPaymentId",
      "captureAmountMinor",
      "captureCurrency",
      "captureEvidenceAuthorityKind",
      "captureEvidenceAuthorityId",
      "captureEvidenceArtifactId",
      "captureEvidenceArtifactDigest"
    ]);
    const row = input as Omit<
      ResolvedPersistedRootCaptureAuthority,
      typeof resolvedPersistedRootCaptureAuthorityBrand
    >;
    if (
      !identifier(row.canonicalCaptureEvidenceId, 160) ||
      !identifier(row.captureIntentId, 160) ||
      !identifier(row.captureSessionId, 160) ||
      !identifier(row.providerAccountSeriesId, 160) ||
      !identifier(row.providerAccountId, 160) ||
      !positiveInteger(row.providerIdentityVersion) ||
      !identifier(row.providerPaymentId, 160) ||
      unsignedDecimal(row.captureAmountMinor, 38) !== row.captureAmountMinor ||
      row.captureCurrency !== "RUB" ||
      (row.captureEvidenceAuthorityKind !== "provider_operation_result" &&
        row.captureEvidenceAuthorityKind !== "provider_semantic_fact") ||
      !identifier(row.captureEvidenceAuthorityId, 160) ||
      !identifier(row.captureEvidenceArtifactId, 160) ||
      !digest(row.captureEvidenceArtifactDigest)
    ) {
      fail("lot_provenance_mismatch");
    }
    return Object.freeze({ ...row }) as ResolvedPersistedRootCaptureAuthority;
  });
}

export type PreparedWalletJournalMutation = Readonly<{
  operationId: string;
  walletId: string;
  astrologerUserId: string;
  currency: "RUB";
  expectedWalletRevision: string;
  nextWalletRevision: string;
  transition: PayableLotTransition;
  receipt: PayableLotOperationReceipt;
  transaction: FinanceJournalTransaction;
  proof: FinanceJournalLinkProof;
  binding: WalletOperationCommitBindingRecord;
  postingDecoderEnvelope: FinancePostingDecoderEnvelope;
  receiptDecoderEnvelope: PayableLotReceiptDecoderEnvelope;
  authorities: readonly PersistedAuthorityBindingRow[];
  effects: readonly PersistedEffectRow[];
  lineage: readonly PersistedLineageRow[];
  componentSlots: readonly PersistedComponentSlotRow[];
  transitions: readonly PersistedTransitionRow[];
}>;

export type PersistedAuthorityBindingRow = Readonly<{
  receiptId: string;
  ordinal: number;
  authorityKind: PayableLotOperationAuthorityRef["kind"];
  authorityId: string;
  authorityVersion: string;
  evidenceId: string | null;
  canonicalDigest: string;
}>;

export type PersistedEffectRow = Readonly<{
  receiptId: string;
  effectId: string;
  lotAllocationId: string;
  bucket: string;
  side: "debit" | "credit";
  amountMinor: string;
  originalSaleId: string;
  rootLotId: string;
  payableLotId: string;
  payoutAllocationId: string | null;
  componentSlotId: string;
}>;

export type PersistedLineageRow = Readonly<{
  receiptId: string;
  ordinal: number;
  relation: "root_created" | "created" | "consumed" | "referenced";
  lotId: string;
  rootLotId: string;
  parentLotId: string | null;
  bucket: string | null;
  amountMinor: string | null;
  economicEffectId: string | null;
}>;

export type PersistedComponentSlotRow = Readonly<{
  slotId: string;
  receiptId: string;
  effectId: string;
  field: "componentId";
  operationKind: PayableLotOperationReceipt["operationKind"];
  bucket: string;
  side: "debit" | "credit";
  originalSaleId: string;
  rootLotId: string;
  payableLotId: string;
  payoutAllocationId: string | null;
  resolvedComponentId: string;
}>;

export type PersistedTransitionRow = Readonly<{
  receiptId: string;
  operationId: string;
  relation: PersistedLineageRow["relation"];
  lotId: string;
  rootLotId: string;
  parentLotId: string | null;
  bucket: string | null;
  amountMinor: string | null;
  economicEffectId: string | null;
  occurredAt: Date;
}>;

export type DatabaseIssuedWalletCommitRow = Readonly<{
  commitReceiptId: string;
  commitReceiptVersion: string;
  commitReceiptCanonicalDigest: string;
  bindingId: string;
  bindingDigest: string;
  operationReceiptId: string;
  operationReceiptDigest: string;
  journalLinkProofId: string;
  journalLinkProofVersion: number;
  journalLinkProofDigest: string;
  walletId: string;
  previousWalletRevision: string;
  nextWalletRevision: string;
  mutationSequence: string;
  persistenceTransactionBoundaryRef: string;
  issuedAt: Date;
}>;

export type WalletRowMappingIntegrityReason =
  | "invalid_command"
  | "operation_mismatch"
  | "receipt_transition_mismatch"
  | "journal_proof_mismatch"
  | "commit_binding_mismatch"
  | "wallet_revision_conflict"
  | "wallet_state_mismatch"
  | "lot_provenance_mismatch"
  | "database_receipt_invalid";

export class WalletRowMappingIntegrityError extends Error {
  readonly code = "wallet_row_mapping_integrity_error";

  constructor(readonly reason: WalletRowMappingIntegrityReason) {
    super("Wallet mutation does not form one canonical bounded persistence graph");
    this.name = "WalletRowMappingIntegrityError";
  }
}

export function prepareWalletJournalMutation(
  input: SealedWalletJournalMutationCommand
): PreparedWalletJournalMutation {
  return boundary(() => {
    const command = exactDataRecord(input, commandKeys);
    const operationEnvelope = exactDataRecord(command.operationEnvelope, operationEnvelopeKeys);
    if (
      operationEnvelope.kind !== "resolved_finance_operation_envelope" ||
      !identifier(operationEnvelope.policyId, 160) ||
      !positiveInteger(operationEnvelope.policyVersion) ||
      !digest(operationEnvelope.policyDigest) ||
      !positiveInteger(operationEnvelope.maximumRows) ||
      !positiveInteger(operationEnvelope.maximumDecimalDigits) ||
      !positiveInteger(operationEnvelope.maximumArtifactBytes)
    ) {
      fail("invalid_command");
    }
    const walletProjection = exactDataRecord(
      operationEnvelope.walletProjection,
      walletProjectionKeys
    );
    const resolvedLimitPolicy = exactDataRecord(walletProjection.resolvedLimitPolicy, [
      "policyId",
      "version",
      "effectiveAt",
      "maxEconomicEdgesPerOperation",
      "maxAuthorityRefsPerOperation",
      "canonicalDigest"
    ]);
    if (
      resolvedLimitPolicy.policyId !== operationEnvelope.policyId ||
      resolvedLimitPolicy.version !== String(operationEnvelope.policyVersion) ||
      resolvedLimitPolicy.canonicalDigest !== operationEnvelope.policyDigest
    ) {
      fail("invalid_command");
    }
    const walletDecoderEnvelope = exactDataRecord(walletProjection.decoderEnvelope, [
      "maxEconomicEdges",
      "maxAuthorityRefs",
      "maxJournalEntries",
      "maxDecimalDigits"
    ]);
    for (const value of Object.values(walletDecoderEnvelope)) {
      if (!Number.isSafeInteger(value) || Number(value) < 0) fail("invalid_command");
    }
    if (
      Number(walletDecoderEnvelope.maxEconomicEdges) > Number(operationEnvelope.maximumRows) ||
      Number(walletDecoderEnvelope.maxAuthorityRefs) > Number(operationEnvelope.maximumRows) ||
      Number(walletDecoderEnvelope.maxJournalEntries) > Number(operationEnvelope.maximumRows) ||
      Number(walletDecoderEnvelope.maxDecimalDigits) >
        Number(operationEnvelope.maximumDecimalDigits)
    ) {
      fail("invalid_command");
    }

    const postingDecoderEnvelope = normalizeFinancePostingDecoderEnvelope({
      maxJournalEntries: Number(walletDecoderEnvelope.maxJournalEntries),
      maxProofEdges: Number(walletDecoderEnvelope.maxEconomicEdges),
      maxComponentBindings: Number(walletDecoderEnvelope.maxEconomicEdges),
      maxAllocations: Number(operationEnvelope.maximumRows),
      maxDecimalDigits: Number(walletDecoderEnvelope.maxDecimalDigits)
    });
    const receiptDecoderEnvelope = normalizePayableLotReceiptDecoderEnvelope({
      maxAuthorityRefs: Number(walletDecoderEnvelope.maxAuthorityRefs),
      maxEffects: Number(walletDecoderEnvelope.maxEconomicEdges),
      maxLineage: Number(operationEnvelope.maximumRows),
      maxComponentSlots: Number(walletDecoderEnvelope.maxEconomicEdges),
      maxDecimalDigits: Number(walletDecoderEnvelope.maxDecimalDigits)
    });

    const operationId = requiredIdentifier(command.operationId);
    const walletId = requiredUuid(command.walletId);
    const astrologerUserId = requiredIdentifier(command.astrologerUserId);
    if (command.currency !== "RUB") fail("invalid_command");
    const expectedWalletRevision = unsignedDecimal(
      command.expectedWalletRevision,
      Number(operationEnvelope.maximumDecimalDigits)
    );
    const nextWalletRevision = (BigInt(expectedWalletRevision) + 1n).toString();
    const transition = rehydratePayableLotPersistenceTransition(command.sourceLotTransition);
    if (
      transition.consumedLots.length + transition.createdLots.length >
      Number(operationEnvelope.maximumRows)
    ) {
      fail("invalid_command");
    }
    const receipt = rehydratePayableLotOperationReceipt(
      command.sourceTransitionReceipt,
      receiptDecoderEnvelope
    );

    const postingRecipe = exactDataRecord(command.postingRecipe, postingRecipeKeys);
    if (
      postingRecipe.kind !== "journal" ||
      postingRecipe.authorizationStatus !== "unverified" ||
      postingRecipe.atomicityStatus !== "unverified"
    ) {
      fail("journal_proof_mismatch");
    }
    const transactionInput = exactDataRecord(postingRecipe.transaction, [
      "id",
      "sourceKey",
      "occurredAt",
      "postedAt",
      "reversesTransactionId",
      "entries",
      "currency",
      "totalDebitMinor",
      "totalCreditMinor"
    ]);
    const transaction = createFinanceJournalTransaction({
      id: transactionInput.id as string,
      sourceKey: transactionInput.sourceKey as FinanceJournalTransaction["sourceKey"],
      occurredAt: transactionInput.occurredAt as string,
      postedAt: transactionInput.postedAt as string,
      reversesTransactionId: transactionInput.reversesTransactionId as string | null,
      entries: transactionInput.entries as FinanceJournalTransaction["entries"]
    });
    if (
      transactionInput.currency !== transaction.currency ||
      transactionInput.totalDebitMinor !== transaction.totalDebitMinor ||
      transactionInput.totalCreditMinor !== transaction.totalCreditMinor
    ) {
      fail("journal_proof_mismatch");
    }
    const recipeProof = rehydrateFinanceJournalLinkProof(
      postingRecipe.linkProof,
      postingDecoderEnvelope
    );
    const proof = rehydrateFinanceJournalLinkProof(
      command.journalLinkProof,
      postingDecoderEnvelope
    );
    assertFinanceJournalLinkProofMatchesTransaction(
      { transaction, proof: recipeProof },
      postingDecoderEnvelope
    );
    assertFinanceJournalLinkProofMatchesTransaction({ transaction, proof }, postingDecoderEnvelope);
    if (!sameFinanceCanonicalValueV1(recipeProof, proof)) fail("journal_proof_mismatch");

    const binding = rehydrateWalletOperationCommitBindingRecord(
      command.commitBinding,
      walletProjection.decoderEnvelope as Parameters<
        typeof rehydrateWalletOperationCommitBindingRecord
      >[1],
      walletProjection.resolvedLimitPolicy as Parameters<
        typeof rehydrateWalletOperationCommitBindingRecord
      >[2]
    );

    assertOperationAgreement({
      operationId,
      walletId,
      astrologerUserId,
      expectedWalletRevision,
      nextWalletRevision,
      transition,
      receipt,
      transaction,
      proof,
      binding
    });
    assertReceiptTransitionAgreement(transition, receipt);
    const normalized = normalizeReceiptGraph(receipt, proof);

    return Object.freeze({
      operationId,
      walletId,
      astrologerUserId,
      currency: "RUB" as const,
      expectedWalletRevision,
      nextWalletRevision,
      transition,
      receipt,
      transaction,
      proof,
      binding,
      postingDecoderEnvelope,
      receiptDecoderEnvelope,
      ...normalized
    });
  });
}

export function deriveNextWalletBalances(
  prepared: PreparedWalletJournalMutation,
  previous: WalletBalanceFields
): WalletBalanceFields {
  return boundary(() => {
    const balances: Record<keyof WalletBalanceFields, bigint> = {
      pendingMinor: parseBalance(previous.pendingMinor),
      availableMinor: parseBalance(previous.availableMinor),
      reservedMinor: parseBalance(previous.reservedMinor),
      payoutPendingMinor: parseBalance(previous.payoutPendingMinor),
      refundPendingMinor: parseBalance(previous.refundPendingMinor),
      recoveryReceivableMinor: parseBalance(previous.recoveryReceivableMinor)
    };
    for (const effect of prepared.receipt.effects) {
      const key = balanceKey(effect.bucket);
      const normalSide = effect.bucket === "recovery_receivable" ? "debit" : "credit";
      const delta = BigInt(effect.amount.amountMinor) * (effect.side === normalSide ? 1n : -1n);
      balances[key] += delta;
      if (balances[key] < 0n) fail("wallet_state_mismatch");
    }
    return Object.freeze({
      pendingMinor: balances.pendingMinor.toString(),
      availableMinor: balances.availableMinor.toString(),
      reservedMinor: balances.reservedMinor.toString(),
      payoutPendingMinor: balances.payoutPendingMinor.toString(),
      refundPendingMinor: balances.refundPendingMinor.toString(),
      recoveryReceivableMinor: balances.recoveryReceivableMinor.toString()
    });
  });
}

export function walletSnapshotDigest(
  prepared: PreparedWalletJournalMutation,
  revision: string,
  balances: WalletBalanceFields
): string {
  return digestFinanceCanonicalValueV1({
    walletId: prepared.walletId,
    revision,
    astrologerUserId: prepared.astrologerUserId,
    currency: "RUB",
    balances
  });
}

export function assertWalletHeadMatchesCommand(
  prepared: PreparedWalletJournalMutation,
  row: PersistedWalletHeadRow | null
): WalletBalanceFields {
  return boundary(() => {
    if (!row) {
      if (prepared.expectedWalletRevision !== "0") fail("wallet_revision_conflict");
      const zero = zeroWalletBalances();
      if (
        prepared.binding.previousWalletRevision !== "0" ||
        prepared.binding.previousWalletSnapshotDigest !== walletSnapshotDigest(prepared, "0", zero)
      ) {
        fail("wallet_state_mismatch");
      }
      return zero;
    }
    assertExactRecordShape(row, [
      "id",
      "astrologerUserId",
      "currency",
      "revision",
      "mutationSequence",
      "pendingMinor",
      "availableMinor",
      "reservedMinor",
      "payoutPendingMinor",
      "refundPendingMinor",
      "recoveryReceivableMinor",
      "lotStateVersion",
      "lotStateDigest",
      "snapshotDigest",
      "lastOperationId",
      "lastCommitBindingId"
    ]);
    if (
      row.id !== prepared.walletId ||
      row.astrologerUserId !== prepared.astrologerUserId ||
      row.currency !== "RUB"
    ) {
      fail("wallet_state_mismatch");
    }
    if (
      row.revision !== prepared.expectedWalletRevision ||
      row.mutationSequence !== prepared.expectedWalletRevision
    ) {
      fail("wallet_revision_conflict");
    }
    if (
      row.lotStateVersion !== prepared.receipt.previousLotState.version ||
      row.lotStateDigest !== prepared.receipt.previousLotState.digest ||
      row.snapshotDigest !== prepared.binding.previousWalletSnapshotDigest
    ) {
      fail("wallet_state_mismatch");
    }
    const balances = Object.freeze({
      pendingMinor: balance(row.pendingMinor),
      availableMinor: balance(row.availableMinor),
      reservedMinor: balance(row.reservedMinor),
      payoutPendingMinor: balance(row.payoutPendingMinor),
      refundPendingMinor: balance(row.refundPendingMinor),
      recoveryReceivableMinor: balance(row.recoveryReceivableMinor)
    });
    if (
      prepared.binding.previousWalletSnapshotDigest !==
      walletSnapshotDigest(prepared, prepared.expectedWalletRevision, balances)
    ) {
      fail("wallet_state_mismatch");
    }
    return balances;
  });
}

export function mapCreatedPayableLotRows(
  prepared: PreparedWalletJournalMutation,
  context: Readonly<{
    rootCaptureAuthority: ResolvedPersistedRootCaptureAuthority | null;
    lockedLots: readonly PersistedPayableLotRow[];
  }>
): readonly PersistedPayableLotRow[] {
  return boundary(() => {
    const rootCreations = prepared.lineage.filter((entry) => entry.relation === "root_created");
    if (
      (prepared.receipt.operationKind === "sale_capture" &&
        (rootCreations.length !== 1 || context.rootCaptureAuthority === null)) ||
      (prepared.receipt.operationKind !== "sale_capture" && context.rootCaptureAuthority !== null)
    ) {
      fail("lot_provenance_mismatch");
    }
    const lockedById = new Map(context.lockedLots.map((row) => [row.lotId, row] as const));
    const createdById = new Map<string, PersistedPayableLotRow>();
    const rows: PersistedPayableLotRow[] = [];
    for (const lot of [...prepared.transition.createdLots].sort(
      (left, right) =>
        left.lineageDepth - right.lineageDepth || left.lotId.localeCompare(right.lotId)
    )) {
      const lineage = prepared.lineage.find(
        (entry) =>
          entry.lotId === lot.lotId &&
          (entry.relation === "root_created" || entry.relation === "created")
      );
      if (!lineage) fail("receipt_transition_mismatch");
      const effect =
        lineage.economicEffectId === null
          ? null
          : prepared.effects.find((candidate) => candidate.effectId === lineage.economicEffectId);
      if (lineage.economicEffectId !== null && !effect) fail("receipt_transition_mismatch");
      const provider = lot.captureSource.paymentIntent.providerAccount;
      if (
        provider.providerAccountId !== lot.captureSource.providerAccountId ||
        provider.providerAccountId !==
          lot.captureSource.paymentIntent.capture?.providerAccount.providerAccountId ||
        provider.seriesId !== lot.captureSource.paymentIntent.capture?.providerAccount.seriesId ||
        provider.identityVersion !==
          lot.captureSource.paymentIntent.capture?.providerAccount.identityVersion
      ) {
        fail("lot_provenance_mismatch");
      }
      const inheritedAuthority =
        lot.parentLotId === null
          ? context.rootCaptureAuthority
          : captureAuthorityFromPersistedLot(
              lockedById.get(lot.parentLotId) ?? createdById.get(lot.parentLotId) ?? null
            );
      if (!inheritedAuthority) fail("lot_provenance_mismatch");
      assertCaptureAuthorityMatchesStructuralLot(inheritedAuthority, lot);
      const row = Object.freeze({
        lotId: lot.lotId,
        walletId: prepared.walletId,
        astrologerUserId: lot.astrologerUserId,
        currency: lot.amount.currency,
        rootLotId: lot.rootLotId,
        parentLotId: lot.parentLotId,
        lineageDepth: lot.lineageDepth,
        originalSaleId: lot.sourceId,
        amountMinor: String(lot.amount.amountMinor),
        bucket: lot.bucket,
        capturedAt: instant(lot.capturedAt),
        createdAt: instant(lot.createdAt),
        becameAvailableAt: lot.becameAvailableAt === null ? null : instant(lot.becameAvailableAt),
        createdByOperationId: lot.createdByOperationId,
        createdByReceiptId: prepared.receipt.receiptId,
        createdEffectId: lineage.economicEffectId,
        componentSlotId: effect?.componentSlotId ?? null,
        captureIntentId: lot.captureSource.intentId,
        captureSessionId: inheritedAuthority.captureSessionId,
        providerAccountSeriesId: provider.seriesId,
        providerAccountId: provider.providerAccountId,
        providerIdentityVersion: provider.identityVersion,
        providerPaymentId: lot.captureSource.providerPaymentId,
        canonicalCaptureEvidenceId: lot.captureSource.canonicalEvidenceId,
        captureAmountMinor: inheritedAuthority.captureAmountMinor,
        captureCurrency: inheritedAuthority.captureCurrency,
        captureEvidenceAuthorityKind: inheritedAuthority.captureEvidenceAuthorityKind,
        captureEvidenceAuthorityId: inheritedAuthority.captureEvidenceAuthorityId,
        captureEvidenceArtifactId: inheritedAuthority.captureEvidenceArtifactId,
        captureEvidenceArtifactDigest: inheritedAuthority.captureEvidenceArtifactDigest,
        economicsSnapshotDigest: digestFinanceCanonicalValueV1(lot.economics),
        riskPolicyId: lot.riskPolicy.id,
        riskPolicyVersion: String(lot.riskPolicy.policyVersion),
        riskPolicyDigest: digestFinanceCanonicalValueV1(lot.riskPolicy),
        fulfillmentDecisionId: lot.fulfillment.registryKey,
        fulfillmentDecisionVersion: String(lot.fulfillment.registryRevision),
        fulfillmentDecisionDigest: digestFinanceCanonicalValueV1(lot.fulfillment),
        payoutRequestId: lot.payoutRequestId,
        payoutAllocationId: lot.payoutAllocationId,
        refundId: lot.refundId
      });
      rows.push(row);
      createdById.set(row.lotId, row);
    }
    return Object.freeze(rows);
  });
}

export function assertLockedLotMatchesTransition(
  prepared: PreparedWalletJournalMutation,
  expected: PayableLotTransition["consumedLots"][number],
  row: PersistedPayableLotRow
): void {
  boundary(() => {
    assertExactRecordShape(row, [
      "lotId",
      "walletId",
      "astrologerUserId",
      "currency",
      "rootLotId",
      "parentLotId",
      "lineageDepth",
      "originalSaleId",
      "amountMinor",
      "bucket",
      "capturedAt",
      "createdAt",
      "becameAvailableAt",
      "createdByOperationId",
      "createdByReceiptId",
      "createdEffectId",
      "componentSlotId",
      "captureIntentId",
      "captureSessionId",
      "providerAccountSeriesId",
      "providerAccountId",
      "providerIdentityVersion",
      "providerPaymentId",
      "canonicalCaptureEvidenceId",
      "captureAmountMinor",
      "captureCurrency",
      "captureEvidenceAuthorityKind",
      "captureEvidenceAuthorityId",
      "captureEvidenceArtifactId",
      "captureEvidenceArtifactDigest",
      "economicsSnapshotDigest",
      "riskPolicyId",
      "riskPolicyVersion",
      "riskPolicyDigest",
      "fulfillmentDecisionId",
      "fulfillmentDecisionVersion",
      "fulfillmentDecisionDigest",
      "payoutRequestId",
      "payoutAllocationId",
      "refundId"
    ]);
    const provider = expected.captureSource.paymentIntent.providerAccount;
    const captureAuthority = captureAuthorityFromPersistedLot(row);
    if (!captureAuthority) fail("lot_provenance_mismatch");
    assertCaptureAuthorityMatchesStructuralLot(captureAuthority, expected);
    if (
      row.lotId !== expected.lotId ||
      row.walletId !== prepared.walletId ||
      row.astrologerUserId !== expected.astrologerUserId ||
      row.currency !== expected.amount.currency ||
      row.rootLotId !== expected.rootLotId ||
      row.parentLotId !== expected.parentLotId ||
      row.lineageDepth !== expected.lineageDepth ||
      row.originalSaleId !== expected.sourceId ||
      row.amountMinor !== String(expected.amount.amountMinor) ||
      row.bucket !== expected.bucket ||
      row.capturedAt.toISOString() !== instant(expected.capturedAt).toISOString() ||
      row.createdAt.toISOString() !== instant(expected.createdAt).toISOString() ||
      (expected.becameAvailableAt === null
        ? row.becameAvailableAt !== null
        : row.becameAvailableAt === null ||
          row.becameAvailableAt.getTime() !== instant(expected.becameAvailableAt).getTime()) ||
      row.createdByOperationId !== expected.createdByOperationId ||
      row.captureIntentId !== expected.captureSource.intentId ||
      row.providerAccountSeriesId !== provider.seriesId ||
      row.providerAccountId !== provider.providerAccountId ||
      row.providerIdentityVersion !== provider.identityVersion ||
      row.providerPaymentId !== expected.captureSource.providerPaymentId ||
      row.canonicalCaptureEvidenceId !== expected.captureSource.canonicalEvidenceId ||
      row.economicsSnapshotDigest !== digestFinanceCanonicalValueV1(expected.economics) ||
      row.riskPolicyId !== expected.riskPolicy.id ||
      row.riskPolicyVersion !== String(expected.riskPolicy.policyVersion) ||
      row.riskPolicyDigest !== digestFinanceCanonicalValueV1(expected.riskPolicy) ||
      row.fulfillmentDecisionId !== expected.fulfillment.registryKey ||
      row.fulfillmentDecisionVersion !== String(expected.fulfillment.registryRevision) ||
      row.fulfillmentDecisionDigest !== digestFinanceCanonicalValueV1(expected.fulfillment) ||
      row.payoutRequestId !== expected.payoutRequestId ||
      row.payoutAllocationId !== expected.payoutAllocationId ||
      row.refundId !== expected.refundId
    ) {
      fail("lot_provenance_mismatch");
    }
  });
}

export function assertCreatedLotPreservesLockedParent(
  created: PersistedPayableLotRow,
  parent: PersistedPayableLotRow
): void {
  boundary(() => {
    if (
      created.parentLotId !== parent.lotId ||
      created.walletId !== parent.walletId ||
      created.astrologerUserId !== parent.astrologerUserId ||
      created.currency !== parent.currency ||
      created.rootLotId !== parent.rootLotId ||
      created.lineageDepth !== parent.lineageDepth + 1 ||
      created.originalSaleId !== parent.originalSaleId ||
      created.capturedAt.getTime() !== parent.capturedAt.getTime() ||
      created.createdAt.getTime() < parent.createdAt.getTime() ||
      created.captureIntentId !== parent.captureIntentId ||
      created.providerAccountSeriesId !== parent.providerAccountSeriesId ||
      created.providerAccountId !== parent.providerAccountId ||
      created.providerIdentityVersion !== parent.providerIdentityVersion ||
      created.providerPaymentId !== parent.providerPaymentId ||
      created.canonicalCaptureEvidenceId !== parent.canonicalCaptureEvidenceId ||
      created.captureSessionId !== parent.captureSessionId ||
      created.captureAmountMinor !== parent.captureAmountMinor ||
      created.captureCurrency !== parent.captureCurrency ||
      created.captureEvidenceAuthorityKind !== parent.captureEvidenceAuthorityKind ||
      created.captureEvidenceAuthorityId !== parent.captureEvidenceAuthorityId ||
      created.captureEvidenceArtifactId !== parent.captureEvidenceArtifactId ||
      created.captureEvidenceArtifactDigest !== parent.captureEvidenceArtifactDigest ||
      created.economicsSnapshotDigest !== parent.economicsSnapshotDigest ||
      created.riskPolicyId !== parent.riskPolicyId ||
      created.riskPolicyVersion !== parent.riskPolicyVersion ||
      created.riskPolicyDigest !== parent.riskPolicyDigest ||
      created.fulfillmentDecisionId !== parent.fulfillmentDecisionId ||
      created.fulfillmentDecisionVersion !== parent.fulfillmentDecisionVersion ||
      created.fulfillmentDecisionDigest !== parent.fulfillmentDecisionDigest
    ) {
      fail("lot_provenance_mismatch");
    }
  });
}

function captureAuthorityFromPersistedLot(
  row: PersistedPayableLotRow | null
): ResolvedPersistedRootCaptureAuthority | null {
  if (!row) return null;
  return createResolvedPersistedRootCaptureAuthority({
    canonicalCaptureEvidenceId: row.canonicalCaptureEvidenceId,
    captureIntentId: row.captureIntentId,
    captureSessionId: row.captureSessionId,
    providerAccountSeriesId: row.providerAccountSeriesId,
    providerAccountId: row.providerAccountId,
    providerIdentityVersion: row.providerIdentityVersion,
    providerPaymentId: row.providerPaymentId,
    captureAmountMinor: row.captureAmountMinor,
    captureCurrency: row.captureCurrency,
    captureEvidenceAuthorityKind: row.captureEvidenceAuthorityKind,
    captureEvidenceAuthorityId: row.captureEvidenceAuthorityId,
    captureEvidenceArtifactId: row.captureEvidenceArtifactId,
    captureEvidenceArtifactDigest: row.captureEvidenceArtifactDigest
  });
}

function assertCaptureAuthorityMatchesStructuralLot(
  authority: ResolvedPersistedRootCaptureAuthority,
  lot: PayableLotTransition["createdLots"][number] | PayableLotTransition["consumedLots"][number]
): void {
  const capture = lot.captureSource.paymentIntent.capture;
  const captureSessionId = lot.captureSource.paymentIntent.captureSessionId;
  if (
    !capture ||
    !captureSessionId ||
    authority.canonicalCaptureEvidenceId !== lot.captureSource.canonicalEvidenceId ||
    authority.captureIntentId !== lot.captureSource.intentId ||
    authority.captureSessionId !== captureSessionId ||
    authority.providerAccountSeriesId !== capture.providerAccount.seriesId ||
    authority.providerAccountId !== capture.providerAccount.providerAccountId ||
    authority.providerIdentityVersion !== capture.providerAccount.identityVersion ||
    authority.providerPaymentId !== capture.providerPaymentId ||
    authority.captureAmountMinor !== String(capture.amount.amountMinor) ||
    authority.captureCurrency !== capture.amount.currency
  ) {
    fail("lot_provenance_mismatch");
  }
}

export function mapDatabaseIssuedWalletCommitReceipt(
  prepared: PreparedWalletJournalMutation,
  row: DatabaseIssuedWalletCommitRow
): VerifiedWalletOperationCommitReceipt {
  return boundary(() => {
    assertExactRecordShape(row, [
      "commitReceiptId",
      "commitReceiptVersion",
      "commitReceiptCanonicalDigest",
      "bindingId",
      "bindingDigest",
      "operationReceiptId",
      "operationReceiptDigest",
      "journalLinkProofId",
      "journalLinkProofVersion",
      "journalLinkProofDigest",
      "walletId",
      "previousWalletRevision",
      "nextWalletRevision",
      "mutationSequence",
      "persistenceTransactionBoundaryRef",
      "issuedAt"
    ]);
    if (
      row.commitReceiptVersion !== "1" ||
      row.journalLinkProofVersion !== 1 ||
      row.nextWalletRevision !== row.mutationSequence ||
      BigInt(row.nextWalletRevision) !== BigInt(row.previousWalletRevision) + 1n ||
      !digest(row.commitReceiptCanonicalDigest) ||
      !digest(row.bindingDigest) ||
      !digest(row.operationReceiptDigest) ||
      !digest(row.journalLinkProofDigest) ||
      !isValidDate(row.issuedAt) ||
      !uuidPattern.test(row.commitReceiptId) ||
      row.commitReceiptId === row.bindingId ||
      !/^postgres-xid:[0-9]+$/.test(row.persistenceTransactionBoundaryRef) ||
      row.bindingId !== prepared.binding.bindingId ||
      row.bindingDigest !== prepared.binding.bindingDigest ||
      row.operationReceiptId !== prepared.receipt.receiptId ||
      row.operationReceiptDigest !== prepared.receipt.canonicalDigest ||
      row.journalLinkProofId !== prepared.proof.proofId ||
      row.journalLinkProofDigest !== prepared.proof.proofDigest ||
      row.walletId !== prepared.walletId ||
      row.previousWalletRevision !== prepared.expectedWalletRevision ||
      row.nextWalletRevision !== prepared.nextWalletRevision
    ) {
      fail("database_receipt_invalid");
    }
    for (const value of [
      row.commitReceiptId,
      row.bindingId,
      row.operationReceiptId,
      row.journalLinkProofId,
      row.persistenceTransactionBoundaryRef
    ]) {
      if (!identifier(value, 200)) fail("database_receipt_invalid");
    }
    return Object.freeze({
      kind: "verified_wallet_operation_commit_receipt" as const,
      receiptId: row.commitReceiptId,
      version: row.commitReceiptVersion,
      canonicalDigest: row.commitReceiptCanonicalDigest,
      bindingRecordId: row.bindingId,
      bindingDigest: row.bindingDigest,
      payableLotOperationReceiptRef: Object.freeze({
        kind: "payable_lot_operation_receipt" as const,
        receiptId: row.operationReceiptId,
        schemaVersion: 1 as const,
        canonicalDigest: row.operationReceiptDigest
      }),
      financeJournalLinkProofRef: Object.freeze({
        kind: "finance_allocation_link_proof" as const,
        proofId: row.journalLinkProofId,
        version: 1 as const,
        proofDigest: row.journalLinkProofDigest as `sha256:${string}`
      }),
      walletId: row.walletId,
      previousWalletRevision: row.previousWalletRevision,
      nextWalletRevision: row.nextWalletRevision,
      mutationSequence: row.mutationSequence,
      persistenceTransactionBoundaryRef: row.persistenceTransactionBoundaryRef,
      issuedAt: row.issuedAt.toISOString()
    }) as VerifiedWalletOperationCommitReceipt;
  });
}

export function zeroWalletBalances(): WalletBalanceFields {
  return Object.freeze({
    pendingMinor: "0",
    availableMinor: "0",
    reservedMinor: "0",
    payoutPendingMinor: "0",
    refundPendingMinor: "0",
    recoveryReceivableMinor: "0"
  });
}

function assertOperationAgreement(input: {
  operationId: string;
  walletId: string;
  astrologerUserId: string;
  expectedWalletRevision: string;
  nextWalletRevision: string;
  transition: PayableLotTransition;
  receipt: PayableLotOperationReceipt;
  transaction: FinanceJournalTransaction;
  proof: FinanceJournalLinkProof;
  binding: WalletOperationCommitBindingRecord;
}): void {
  const { receipt, transition, transaction, proof, binding } = input;
  const snapshot = proof.operationSnapshotRef;
  const touchedLots = [...transition.consumedLots, ...transition.createdLots];
  if (
    transition.operationId !== input.operationId ||
    receipt.operationId !== input.operationId ||
    proof.operationId !== input.operationId ||
    binding.operationId !== input.operationId ||
    receipt.astrologerUserId !== input.astrologerUserId ||
    binding.astrologerUserId !== input.astrologerUserId ||
    binding.previousWalletId !== input.walletId ||
    binding.nextWalletId !== input.walletId ||
    receipt.currency !== "RUB" ||
    binding.currency !== "RUB" ||
    !sameFinanceCanonicalValueV1(receipt.sourceKey, transaction.sourceKey) ||
    !sameFinanceCanonicalValueV1(receipt.sourceKey, proof.journalSourceKey) ||
    !sameFinanceCanonicalValueV1(receipt.sourceKey, binding.sourceKey) ||
    receipt.occurredAt !== transaction.occurredAt ||
    receipt.occurredAt !== binding.occurredAt ||
    proof.journalTransactionId !== transaction.id ||
    binding.journalTransactionId !== transaction.id ||
    binding.journalTransactionDigest !== digestFinanceCanonicalValueV1(transaction) ||
    proof.sourceEvidenceRef.kind !== "payable_lot_operation_receipt" ||
    proof.sourceEvidenceRef.evidenceId !== receipt.receiptId ||
    proof.sourceEvidenceRef.canonicalDigest !== receipt.canonicalDigest ||
    binding.previousWalletRevision !== input.expectedWalletRevision ||
    binding.nextWalletRevision !== input.nextWalletRevision ||
    BigInt(receipt.previousLotState.version) !== BigInt(input.expectedWalletRevision) + 1n ||
    BigInt(receipt.nextLotState.version) !== BigInt(input.nextWalletRevision) + 1n ||
    binding.historyRecordDigest !== receipt.historyRecord.canonicalDigest ||
    binding.previousLotStateDigest !== receipt.previousLotState.digest ||
    binding.nextLotStateDigest !== receipt.nextLotState.digest ||
    snapshot === null ||
    snapshot.snapshotId !== binding.operationSnapshotId ||
    snapshot.snapshotDigest !== binding.operationSnapshotDigest ||
    snapshot.operationId !== input.operationId ||
    snapshot.previousWalletRevision !== input.expectedWalletRevision ||
    snapshot.nextWalletRevision !== input.nextWalletRevision ||
    snapshot.previousLotStateDigest !== receipt.previousLotState.digest ||
    snapshot.nextLotStateDigest !== receipt.nextLotState.digest ||
    snapshot.historyRecordDigest !== receipt.historyRecord.canonicalDigest ||
    touchedLots.some(
      (lot) => lot.astrologerUserId !== input.astrologerUserId || lot.amount.currency !== "RUB"
    )
  ) {
    fail("operation_mismatch");
  }
}

function assertReceiptTransitionAgreement(
  transition: PayableLotTransition,
  receipt: PayableLotOperationReceipt
): void {
  const expected = new Map<string, (typeof receipt.lineage)[number]>();
  for (const entry of receipt.lineage) {
    if (entry.relation === "referenced") continue;
    expected.set(`${entry.relation}:${entry.lotId}`, entry);
  }
  const touched = [...transition.consumedLots, ...transition.createdLots];
  if (expected.size !== touched.length) fail("receipt_transition_mismatch");
  for (const lot of transition.consumedLots) {
    const entry = expected.get(`consumed:${lot.lotId}`);
    if (!entry || entry.relation === "referenced") fail("receipt_transition_mismatch");
    if (
      lot.consumedAt !== receipt.occurredAt ||
      entry.rootLotId !== lot.rootLotId ||
      entry.parentLotId !== lot.parentLotId ||
      entry.bucket !== lot.bucket ||
      entry.amount.amountMinor !== lot.amount.amountMinor ||
      entry.amount.currency !== lot.amount.currency
    ) {
      fail("receipt_transition_mismatch");
    }
  }
  for (const lot of transition.createdLots) {
    const relation = lot.parentLotId === null ? "root_created" : "created";
    const entry = expected.get(`${relation}:${lot.lotId}`);
    if (!entry || entry.relation === "referenced") fail("receipt_transition_mismatch");
    if (
      lot.createdAt !== receipt.occurredAt ||
      entry.rootLotId !== lot.rootLotId ||
      entry.parentLotId !== lot.parentLotId ||
      entry.bucket !== lot.bucket ||
      entry.amount.amountMinor !== lot.amount.amountMinor ||
      entry.amount.currency !== lot.amount.currency
    ) {
      fail("receipt_transition_mismatch");
    }
  }
}

function normalizeReceiptGraph(
  receipt: PayableLotOperationReceipt,
  proof: FinanceJournalLinkProof
) {
  const usedProofIndexes = new Set<number>();
  const effects = Object.freeze(
    receipt.effects.map((effect) => {
      const matches = proof.edges
        .map((edge, index) => ({ edge, index }))
        .filter(
          ({ edge }) =>
            edge.semanticEdgeId === effect.effectId &&
            edge.lotAllocationId === effect.lotAllocationId
        );
      if (matches.length !== 1 || !matches[0]) fail("journal_proof_mismatch");
      const { edge, index } = matches[0];
      if (
        usedProofIndexes.has(index) ||
        edge.account.code !== accountCodeForBucket(effect.bucket) ||
        !("astrologerUserId" in edge.account) ||
        edge.account.astrologerUserId !== receipt.astrologerUserId ||
        edge.side !== effect.side ||
        edge.amount.amountMinor !== effect.amount.amountMinor ||
        edge.amount.currency !== effect.amount.currency ||
        edge.links.componentId === null ||
        !sameFinanceCanonicalValueV1(edge.links, {
          originalSaleId: effect.knownLinks.originalSaleId,
          componentId: edge.links.componentId,
          payableLotId: effect.knownLinks.payableLotId,
          payoutAllocationId: effect.knownLinks.payoutAllocationId
        })
      ) {
        fail("journal_proof_mismatch");
      }
      usedProofIndexes.add(index);
      return Object.freeze({
        receiptId: receipt.receiptId,
        effectId: effect.effectId,
        lotAllocationId: effect.lotAllocationId,
        bucket: effect.bucket,
        side: effect.side,
        amountMinor: String(effect.amount.amountMinor),
        originalSaleId: effect.knownLinks.originalSaleId,
        rootLotId: effect.knownLinks.rootLotId,
        payableLotId: effect.knownLinks.payableLotId,
        payoutAllocationId: effect.knownLinks.payoutAllocationId,
        componentSlotId: effect.componentSlotId
      });
    })
  );
  if (
    proof.edges.some((edge, index) => edge.semanticEdgeId !== null && !usedProofIndexes.has(index))
  ) {
    fail("journal_proof_mismatch");
  }
  const componentSlots = Object.freeze(
    receipt.requiredExternalLinkSlots.map((slot) => {
      const effect = receipt.effects.find((candidate) => candidate.effectId === slot.effectId);
      const proofEdge = proof.edges.find(
        (edge) =>
          edge.semanticEdgeId === slot.effectId && edge.lotAllocationId === effect?.lotAllocationId
      );
      if (!effect || !proofEdge?.links.componentId) fail("journal_proof_mismatch");
      return Object.freeze({
        slotId: slot.slotId,
        receiptId: receipt.receiptId,
        effectId: slot.effectId,
        field: slot.field,
        operationKind: slot.requiredAuthority.operationKind,
        bucket: slot.requiredAuthority.bucket,
        side: slot.requiredAuthority.side,
        originalSaleId: slot.requiredAuthority.originalSaleId,
        rootLotId: slot.requiredAuthority.rootLotId,
        payableLotId: slot.requiredAuthority.payableLotId,
        payoutAllocationId: slot.requiredAuthority.payoutAllocationId,
        resolvedComponentId: proofEdge.links.componentId
      });
    })
  );
  const lineage = Object.freeze(
    receipt.lineage.map((entry, ordinal) =>
      Object.freeze({
        receiptId: receipt.receiptId,
        ordinal,
        relation: entry.relation,
        lotId: entry.lotId,
        rootLotId: entry.rootLotId,
        parentLotId: entry.relation === "referenced" ? null : entry.parentLotId,
        bucket: entry.relation === "referenced" ? null : entry.bucket,
        amountMinor: entry.relation === "referenced" ? null : String(entry.amount.amountMinor),
        economicEffectId: entry.economicEffectId
      })
    )
  );
  return Object.freeze({
    authorities: Object.freeze(
      receipt.authorityRefs.map((reference, ordinal) =>
        mapAuthority(receipt.receiptId, reference, ordinal)
      )
    ),
    effects,
    lineage,
    componentSlots,
    transitions: Object.freeze(
      lineage.map((entry) =>
        Object.freeze({
          receiptId: entry.receiptId,
          operationId: receipt.operationId,
          relation: entry.relation,
          lotId: entry.lotId,
          rootLotId: entry.rootLotId,
          parentLotId: entry.parentLotId,
          bucket: entry.bucket,
          amountMinor: entry.amountMinor,
          economicEffectId: entry.economicEffectId,
          occurredAt: instant(receipt.occurredAt)
        })
      )
    )
  });
}

function mapAuthority(
  receiptId: string,
  reference: PayableLotOperationAuthorityRef,
  ordinal: number
): PersistedAuthorityBindingRow {
  let authorityId: string;
  let authorityVersion: string;
  let evidenceId: string | null;
  switch (reference.kind) {
    case "canonical_capture":
      authorityId = reference.intentId;
      authorityVersion = reference.intentVersion;
      evidenceId = reference.evidenceId;
      break;
    case "reserve_allocation":
      authorityId = reference.authorityId;
      authorityVersion = reference.authorityVersion;
      evidenceId = reference.decisionId;
      break;
    case "payment_capture_integrity":
      authorityId = reference.authorityId;
      authorityVersion = reference.authorityVersion;
      evidenceId = reference.evidenceId;
      break;
    case "release_blocks":
      authorityId = reference.snapshotId;
      authorityVersion = reference.snapshotVersion;
      evidenceId = null;
      break;
    case "hold_release_evidence":
      authorityId = reference.lotId;
      authorityVersion = reference.bookingContractVersion;
      evidenceId = reference.bookingCompletionEvidenceId;
      break;
    default:
      authorityId = reference.authorityId;
      authorityVersion = reference.authorityVersion;
      evidenceId = reference.evidenceId;
  }
  return Object.freeze({
    receiptId,
    ordinal,
    authorityKind: reference.kind,
    authorityId,
    authorityVersion,
    evidenceId,
    canonicalDigest: reference.canonicalDigest
  });
}

function accountCodeForBucket(bucket: string): string {
  switch (bucket) {
    case "pending":
      return "astrologer_pending";
    case "available":
      return "astrologer_available";
    case "reserved":
      return "astrologer_reserved";
    case "payout_pending":
      return "astrologer_payout_pending";
    case "refund_pending":
      return "astrologer_refund_pending";
    case "recovery_receivable":
      return "astrologer_recovery_receivable";
    default:
      fail("journal_proof_mismatch");
  }
}

function balanceKey(bucket: string): keyof WalletBalanceFields {
  switch (bucket) {
    case "pending":
      return "pendingMinor";
    case "available":
      return "availableMinor";
    case "reserved":
      return "reservedMinor";
    case "payout_pending":
      return "payoutPendingMinor";
    case "refund_pending":
      return "refundPendingMinor";
    case "recovery_receivable":
      return "recoveryReceivableMinor";
    default:
      fail("wallet_state_mismatch");
  }
}

function exactDataRecord<const Keys extends readonly string[]>(
  value: unknown,
  keys: Keys
): Readonly<Record<Keys[number], unknown>> {
  assertExactRecordShape(value, keys);
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) fail("invalid_command");
    result[key] = descriptor.value;
  }
  return result as Readonly<Record<Keys[number], unknown>>;
}

function assertExactRecordShape(value: unknown, keys: readonly string[]): asserts value is object {
  try {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      nodeUtilTypes.isProxy(value)
    ) {
      fail("invalid_command");
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail("invalid_command");
    const actualKeys = Reflect.ownKeys(value);
    if (
      actualKeys.length !== keys.length ||
      actualKeys.some((key) => typeof key !== "string" || !keys.includes(key))
    ) {
      fail("invalid_command");
    }
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        fail("invalid_command");
      }
    }
  } catch (error) {
    if (error instanceof WalletRowMappingIntegrityError) throw error;
    fail("invalid_command");
  }
}

function parseBalance(value: string): bigint {
  return BigInt(balance(value));
}

function balance(value: unknown): string {
  if (typeof value !== "string" || !unsignedDecimalPattern.test(value) || value.length > 38) {
    fail("wallet_state_mismatch");
  }
  return value;
}

function unsignedDecimal(value: unknown, maximumDigits: number): string {
  if (
    typeof value !== "string" ||
    value.length > maximumDigits ||
    !unsignedDecimalPattern.test(value)
  ) {
    fail("invalid_command");
  }
  return value;
}

function identifier(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximumLength &&
    value.trim() === value &&
    Array.from(value).every((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint === undefined || (codePoint > 0x1f && codePoint !== 0x7f);
    })
  );
}

function requiredIdentifier(value: unknown): string {
  if (!identifier(value, 200)) fail("invalid_command");
  return value;
}

function requiredUuid(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) fail("invalid_command");
  return value;
}

function digest(value: unknown): value is string {
  return typeof value === "string" && digestPattern.test(value);
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function instant(value: string): Date {
  const parsed = new Date(value);
  if (
    !isValidDate(parsed) ||
    parsed.toISOString().replace(".000Z", "Z") !== value.replace(".000Z", "Z")
  ) {
    fail("invalid_command");
  }
  return parsed;
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function boundary<T>(action: () => T): T {
  try {
    return action();
  } catch (error) {
    if (error instanceof WalletRowMappingIntegrityError) throw error;
    fail("invalid_command");
  }
}

function fail(reason: WalletRowMappingIntegrityReason): never {
  throw new WalletRowMappingIntegrityError(reason);
}
