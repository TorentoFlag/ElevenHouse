import {
  assertFinanceJournalLinkProofMatchesTransaction,
  createFinanceJournalTransaction,
  createFinanceLedgerAccountRef,
  createFinanceSourceKey,
  digestFinanceCanonicalValueV1,
  financeLedgerChart,
  rehydrateFinanceJournalLinkProof,
  serializeFinanceSourceKey,
  type FinanceJournalLinkProof,
  type FinanceJournalTransaction,
  type FinanceLedgerAccountCode,
  type FinanceLedgerAccountRef,
  type FinancePostingDecoderEnvelope
} from "@elevenhouse/domain/finance-core";

export class JournalRowMappingIntegrityError extends Error {
  readonly code = "journal_row_mapping_integrity_error";

  constructor() {
    super("Persisted finance journal rows do not form one canonical sealed journal bundle");
    this.name = "JournalRowMappingIntegrityError";
  }
}

export type PersistedFinanceAccountRow = {
  code: string;
  arcProviderAccountId: string | null;
  bankCashPoolId: string | null;
  astrologerUserId: string | null;
  refundId: string | null;
  payoutRequestId: string | null;
  currency: string;
};

type PersistedFinanceJournalEntryCoreRow = {
  id: string;
  entryIndex: number;
  account: PersistedFinanceAccountRow;
  side: string;
  amountMinor: string;
  currency: string;
  originalSaleId: string | null;
  componentId: string | null;
  payableLotId: string | null;
  payoutAllocationId: string | null;
};

export type PersistedFinanceJournalEntryRow = PersistedFinanceJournalEntryCoreRow & {
  occurredAt: Date;
};

export type PersistedFinanceProofEntryRow = PersistedFinanceJournalEntryCoreRow & {
  journalEntryId: string;
  semanticEdgeId: string | null;
  lotAllocationId: string | null;
};

export type PersistedFinanceJournalBundleRows = {
  sourceIdentity: {
    sourceKind: string;
    sourceId: string;
    sourceOperationKey: string;
  };
  transaction: {
    id: string;
    occurredAt: Date;
    postedAt: Date;
    reversesJournalTransactionId: string | null;
    currency: string;
    entryCount: number;
    totalDebitMinor: string;
    totalCreditMinor: string;
    canonicalDigest: string;
    sealedAt: Date | null;
  };
  entries: PersistedFinanceJournalEntryRow[];
  proof: {
    proofId: string;
    version: number;
    allocationAuthorityKind: string;
    allocationAuthorityId: string;
    allocationAuthorityVersion: number;
    allocationAuthorityDigest: string;
    sourceEvidenceKind: string;
    sourceEvidenceId: string;
    sourceEvidenceDigest: string;
    journalTransactionId: string;
    journalSourceKind: string;
    journalSourceId: string;
    journalSourceOperationKey: string;
    operationId: string;
    operationSnapshotId: string | null;
    operationSnapshotOperationId: string | null;
    operationSnapshotPreviousWalletRevision: string | null;
    operationSnapshotNextWalletRevision: string | null;
    operationSnapshotPreviousLotStateDigest: string | null;
    operationSnapshotNextLotStateDigest: string | null;
    operationSnapshotHistoryRecordDigest: string | null;
    operationSnapshotDigest: string | null;
    proofDigest: string;
  };
  proofEntries: PersistedFinanceProofEntryRow[];
};

export type NormalizedPersistedFinanceJournalRow = Readonly<{
  journalTransactionId: string;
  entryIndex: number;
  sourceKey: FinanceJournalTransaction["sourceKey"];
  serializedSourceKey: string;
  account: FinanceLedgerAccountRef;
  side: FinanceJournalTransaction["entries"][number]["side"];
  amountMinor: string;
  currency: "RUB";
  occurredAt: string;
}>;

export function mapPersistedFinanceJournalBundle(
  rows: PersistedFinanceJournalBundleRows,
  decoderEnvelope: FinancePostingDecoderEnvelope
): Readonly<{
  transaction: FinanceJournalTransaction;
  proof: FinanceJournalLinkProof;
  normalizedRows: readonly NormalizedPersistedFinanceJournalRow[];
}> {
  try {
    assertBundleShape(rows, decoderEnvelope);
    assertDecoderEnvelope(decoderEnvelope);
    if (
      rows.transaction.currency !== "RUB" ||
      rows.transaction.sealedAt === null ||
      !isValidDate(rows.transaction.occurredAt) ||
      !isValidDate(rows.transaction.sealedAt) ||
      !isValidDate(rows.transaction.postedAt) ||
      rows.transaction.sealedAt.getTime() < rows.transaction.postedAt.getTime() ||
      rows.entries.length < 2 ||
      rows.entries.length > decoderEnvelope.maxJournalEntries ||
      rows.entries.length !== rows.transaction.entryCount ||
      rows.proofEntries.length !== rows.entries.length ||
      rows.proofEntries.length > decoderEnvelope.maxProofEdges
    ) {
      fail();
    }

    const sourceKey = createFinanceSourceKey({
      kind: rows.sourceIdentity.sourceKind,
      sourceId: rows.sourceIdentity.sourceId,
      operation: rows.sourceIdentity.sourceOperationKey
    });
    const seenEntryIds = new Set<string>();
    const entries = rows.entries.map((entryRow, entryIndex) => {
      if (
        entryRow.entryIndex !== entryIndex ||
        !boundedIdentifier(entryRow.id, 200) ||
        seenEntryIds.has(entryRow.id) ||
        !isValidDate(entryRow.occurredAt) ||
        entryRow.occurredAt.getTime() !== rows.transaction.occurredAt.getTime() ||
        entryRow.currency !== "RUB"
      ) {
        fail();
      }
      seenEntryIds.add(entryRow.id);
      const amountMinor = positiveSafeAmount(entryRow.amountMinor, decoderEnvelope);
      return {
        account: mapAccount(entryRow.account),
        side: mapSide(entryRow.side),
        amount: { amountMinor, currency: "RUB" as const },
        links: mapLinks(entryRow)
      };
    });

    const transaction = createFinanceJournalTransaction({
      id: rows.transaction.id,
      sourceKey,
      occurredAt: instant(rows.transaction.occurredAt),
      postedAt: instant(rows.transaction.postedAt),
      reversesTransactionId: rows.transaction.reversesJournalTransactionId,
      entries
    });
    if (
      rows.transaction.totalDebitMinor !== transaction.totalDebitMinor ||
      rows.transaction.totalCreditMinor !== transaction.totalCreditMinor ||
      rows.transaction.canonicalDigest !== digestFinanceCanonicalValueV1(transaction) ||
      !canonicalUnsignedDecimal(rows.transaction.totalDebitMinor, 38) ||
      !canonicalUnsignedDecimal(rows.transaction.totalCreditMinor, 38)
    ) {
      fail();
    }

    const seenProofEntryIds = new Set<string>();
    const edges = rows.proofEntries.map((proofEntry, entryIndex) => {
      const journalEntry = rows.entries[entryIndex];
      if (
        !journalEntry ||
        proofEntry.entryIndex !== entryIndex ||
        proofEntry.journalEntryId !== journalEntry.id ||
        !boundedIdentifier(proofEntry.id, 200) ||
        seenProofEntryIds.has(proofEntry.id) ||
        proofEntry.currency !== "RUB"
      ) {
        fail();
      }
      seenProofEntryIds.add(proofEntry.id);
      return {
        entryIndex,
        account: mapAccount(proofEntry.account),
        side: mapSide(proofEntry.side),
        amount: {
          amountMinor: positiveSafeAmount(proofEntry.amountMinor, decoderEnvelope),
          currency: "RUB" as const
        },
        links: mapLinks(proofEntry),
        semanticEdgeId: proofEntry.semanticEdgeId,
        lotAllocationId: proofEntry.lotAllocationId
      };
    });

    const operationSnapshotRef = mapOperationSnapshot(rows, sourceKey, decoderEnvelope);
    if (
      rows.proof.journalSourceKind !== sourceKey.kind ||
      rows.proof.journalSourceId !== sourceKey.sourceId ||
      rows.proof.journalSourceOperationKey !== sourceKey.operation
    ) {
      fail();
    }
    const proof = rehydrateFinanceJournalLinkProof(
      {
        kind: "finance_allocation_link_proof",
        proofId: rows.proof.proofId,
        version: rows.proof.version,
        allocationAuthorityRef: {
          kind: rows.proof.allocationAuthorityKind,
          authorityId: rows.proof.allocationAuthorityId,
          version: rows.proof.allocationAuthorityVersion,
          canonicalDigest: rows.proof.allocationAuthorityDigest
        },
        sourceEvidenceRef: {
          kind: rows.proof.sourceEvidenceKind,
          evidenceId: rows.proof.sourceEvidenceId,
          canonicalDigest: rows.proof.sourceEvidenceDigest
        },
        journalTransactionId: rows.proof.journalTransactionId,
        journalSourceKey: sourceKey,
        operationId: rows.proof.operationId,
        operationSnapshotRef,
        edges,
        proofDigest: rows.proof.proofDigest
      },
      decoderEnvelope
    );
    assertFinanceJournalLinkProofMatchesTransaction({ proof, transaction }, decoderEnvelope);

    const serializedSourceKey = serializeFinanceSourceKey(sourceKey);
    const normalizedRows = Object.freeze(
      transaction.entries.map((entry, entryIndex) =>
        Object.freeze({
          journalTransactionId: transaction.id,
          entryIndex,
          sourceKey,
          serializedSourceKey,
          account: entry.account,
          side: entry.side,
          amountMinor: String(entry.amount.amountMinor),
          currency: "RUB" as const,
          occurredAt: transaction.occurredAt
        })
      )
    );
    return Object.freeze({ transaction, proof, normalizedRows });
  } catch (error) {
    if (error instanceof JournalRowMappingIntegrityError) throw error;
    throw new JournalRowMappingIntegrityError();
  }
}

function mapOperationSnapshot(
  rows: PersistedFinanceJournalBundleRows,
  sourceKey: FinanceJournalTransaction["sourceKey"],
  decoderEnvelope: FinancePostingDecoderEnvelope
): FinanceJournalLinkProof["operationSnapshotRef"] {
  const values = [
    rows.proof.operationSnapshotId,
    rows.proof.operationSnapshotOperationId,
    rows.proof.operationSnapshotPreviousWalletRevision,
    rows.proof.operationSnapshotNextWalletRevision,
    rows.proof.operationSnapshotPreviousLotStateDigest,
    rows.proof.operationSnapshotNextLotStateDigest,
    rows.proof.operationSnapshotHistoryRecordDigest,
    rows.proof.operationSnapshotDigest
  ];
  if (values.every((value) => value === null)) return null;
  if (values.some((value) => value === null)) fail();
  const snapshotId = values[0] as string;
  const operationId = values[1] as string;
  const previousWalletRevision = values[2] as string;
  const nextWalletRevision = values[3] as string;
  const previousLotStateDigest = values[4] as string;
  const nextLotStateDigest = values[5] as string;
  const historyRecordDigest = values[6] as string;
  const snapshotDigest = values[7] as string;
  if (
    !canonicalUnsignedDecimal(previousWalletRevision, decoderEnvelope.maxDecimalDigits) ||
    !canonicalUnsignedDecimal(nextWalletRevision, decoderEnvelope.maxDecimalDigits)
  ) {
    fail();
  }
  return {
    snapshotId,
    operationId,
    sourceKey,
    previousWalletRevision,
    nextWalletRevision,
    previousLotStateDigest,
    nextLotStateDigest,
    historyRecordDigest,
    snapshotDigest
  } as FinanceJournalLinkProof["operationSnapshotRef"];
}

function mapAccount(row: PersistedFinanceAccountRow): FinanceLedgerAccountRef {
  assertExactOwnDataRecord(row, [
    "code",
    "arcProviderAccountId",
    "bankCashPoolId",
    "astrologerUserId",
    "refundId",
    "payoutRequestId",
    "currency"
  ]);
  const chart = financeLedgerChart[row.code as FinanceLedgerAccountCode];
  if (!chart || row.currency !== "RUB") fail();
  const values = {
    provider: row.arcProviderAccountId,
    bank: row.bankCashPoolId,
    astrologer: row.astrologerUserId,
    refund: row.refundId,
    payout: row.payoutRequestId
  };
  switch (chart.scopeKind) {
    case "arc_provider_account":
      exactDimensions(values, ["provider"]);
      return createFinanceLedgerAccountRef({
        code: row.code,
        arcProviderAccountId: row.arcProviderAccountId,
        currency: "RUB"
      });
    case "arc_provider_account_and_bank_cash_pool":
      exactDimensions(values, ["provider", "bank"]);
      return createFinanceLedgerAccountRef({
        code: row.code,
        arcProviderAccountId: row.arcProviderAccountId,
        bankCashPoolId: row.bankCashPoolId,
        currency: "RUB"
      });
    case "bank_cash_pool":
      exactDimensions(values, ["bank"]);
      return createFinanceLedgerAccountRef({
        code: row.code,
        bankCashPoolId: row.bankCashPoolId,
        currency: "RUB"
      });
    case "astrologer":
      exactDimensions(values, ["astrologer"]);
      return createFinanceLedgerAccountRef({
        code: row.code,
        astrologerUserId: row.astrologerUserId,
        currency: "RUB"
      });
    case "refund_and_payout":
      exactDimensions(values, ["refund", "payout"]);
      return createFinanceLedgerAccountRef({
        code: row.code,
        refundId: row.refundId,
        payoutRequestId: row.payoutRequestId,
        currency: "RUB"
      });
    case "platform":
      exactDimensions(values, []);
      return createFinanceLedgerAccountRef({ code: row.code, currency: "RUB" });
  }
}

function exactDimensions(
  values: Record<"provider" | "bank" | "astrologer" | "refund" | "payout", string | null>,
  required: readonly (keyof typeof values)[]
): void {
  const requiredSet = new Set(required);
  for (const [key, value] of Object.entries(values) as [keyof typeof values, string | null][]) {
    if (requiredSet.has(key)) {
      if (!boundedIdentifier(value, 160)) fail();
    } else if (value !== null) {
      fail();
    }
  }
}

function mapLinks(row: {
  originalSaleId: string | null;
  componentId: string | null;
  payableLotId: string | null;
  payoutAllocationId: string | null;
}) {
  for (const value of [
    row.originalSaleId,
    row.componentId,
    row.payableLotId,
    row.payoutAllocationId
  ]) {
    if (value !== null && !boundedIdentifier(value, 200)) fail();
  }
  return {
    originalSaleId: row.originalSaleId,
    componentId: row.componentId,
    payableLotId: row.payableLotId,
    payoutAllocationId: row.payoutAllocationId
  };
}

function mapSide(value: string): "debit" | "credit" {
  if (value !== "debit" && value !== "credit") fail();
  return value;
}

function positiveSafeAmount(value: string, decoderEnvelope: FinancePostingDecoderEnvelope): number {
  if (!canonicalUnsignedDecimal(value, decoderEnvelope.maxDecimalDigits) || value === "0") fail();
  const parsed = BigInt(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) fail();
  return Number(parsed);
}

function canonicalUnsignedDecimal(value: string, maxDigits: number): boolean {
  return /^(0|[1-9][0-9]*)$/.test(value) && value.length <= maxDigits;
}

function boundedIdentifier(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    value.length <= maxLength
  );
}

function instant(value: Date): string {
  if (!isValidDate(value)) fail();
  return value.toISOString();
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function assertDecoderEnvelope(value: FinancePostingDecoderEnvelope): void {
  for (const candidate of Object.values(value)) {
    if (!Number.isSafeInteger(candidate) || candidate <= 0) fail();
  }
}

function assertBundleShape(
  rows: PersistedFinanceJournalBundleRows,
  decoderEnvelope: FinancePostingDecoderEnvelope
): void {
  assertExactOwnDataRecord(decoderEnvelope, [
    "maxJournalEntries",
    "maxProofEdges",
    "maxComponentBindings",
    "maxAllocations",
    "maxDecimalDigits"
  ]);
  assertExactOwnDataRecord(rows, [
    "sourceIdentity",
    "transaction",
    "entries",
    "proof",
    "proofEntries"
  ]);
  assertExactOwnDataRecord(rows.sourceIdentity, ["sourceKind", "sourceId", "sourceOperationKey"]);
  assertExactOwnDataRecord(rows.transaction, [
    "id",
    "occurredAt",
    "postedAt",
    "reversesJournalTransactionId",
    "currency",
    "entryCount",
    "totalDebitMinor",
    "totalCreditMinor",
    "canonicalDigest",
    "sealedAt"
  ]);
  assertDenseDataArray(rows.entries);
  assertDenseDataArray(rows.proofEntries);
  const entryKeys = [
    "id",
    "occurredAt",
    "entryIndex",
    "account",
    "side",
    "amountMinor",
    "currency",
    "originalSaleId",
    "componentId",
    "payableLotId",
    "payoutAllocationId"
  ] as const;
  for (const entry of rows.entries) assertExactOwnDataRecord(entry, entryKeys);
  for (const proofEntry of rows.proofEntries) {
    assertExactOwnDataRecord(proofEntry, [
      "id",
      "entryIndex",
      "account",
      "side",
      "amountMinor",
      "currency",
      "originalSaleId",
      "componentId",
      "payableLotId",
      "payoutAllocationId",
      "journalEntryId",
      "semanticEdgeId",
      "lotAllocationId"
    ]);
  }
  assertExactOwnDataRecord(rows.proof, [
    "proofId",
    "version",
    "allocationAuthorityKind",
    "allocationAuthorityId",
    "allocationAuthorityVersion",
    "allocationAuthorityDigest",
    "sourceEvidenceKind",
    "sourceEvidenceId",
    "sourceEvidenceDigest",
    "journalTransactionId",
    "journalSourceKind",
    "journalSourceId",
    "journalSourceOperationKey",
    "operationId",
    "operationSnapshotId",
    "operationSnapshotOperationId",
    "operationSnapshotPreviousWalletRevision",
    "operationSnapshotNextWalletRevision",
    "operationSnapshotPreviousLotStateDigest",
    "operationSnapshotNextLotStateDigest",
    "operationSnapshotHistoryRecordDigest",
    "operationSnapshotDigest",
    "proofDigest"
  ]);
}

function assertExactOwnDataRecord(value: unknown, expectedKeys: readonly string[]): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
  ) {
    fail();
  }
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail();
  }
}

function assertDenseDataArray(value: unknown): asserts value is unknown[] {
  if (!Array.isArray(value)) fail();
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) fail();
  }
}

function fail(): never {
  throw new JournalRowMappingIntegrityError();
}
