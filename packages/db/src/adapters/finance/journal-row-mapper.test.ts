import {
  createFinanceJournalTransaction,
  createFinanceLedgerAccountRef,
  createFinanceSourceKey,
  digestFinanceCanonicalValueV1,
  serializeFinanceSourceKey,
  type FinanceJournalLinkProof,
  type FinanceJournalTransaction,
  type FinancePostingDecoderEnvelope
} from "@elevenhouse/domain/finance-core";
import { describe, expect, it } from "vitest";
import {
  JournalRowMappingIntegrityError,
  mapPersistedFinanceJournalBundle,
  type PersistedFinanceJournalBundleRows
} from "./journal-row-mapper";

const decoderEnvelope: FinancePostingDecoderEnvelope = Object.freeze({
  maxJournalEntries: 16,
  maxProofEdges: 16,
  maxComponentBindings: 16,
  maxAllocations: 16,
  maxDecimalDigits: 38
});

describe("finance journal row mapper", () => {
  it("strictly rehydrates one sealed transaction, proof and normalized history rows", () => {
    const fixture = validPersistedBundle();

    const mapped = mapPersistedFinanceJournalBundle(fixture.rows, decoderEnvelope);

    expect(mapped.transaction).toEqual(fixture.transaction);
    expect(mapped.proof).toEqual(fixture.proof);
    expect(mapped.normalizedRows).toEqual(
      fixture.transaction.entries.map((entry, entryIndex) => ({
        journalTransactionId: fixture.transaction.id,
        entryIndex,
        sourceKey: fixture.transaction.sourceKey,
        serializedSourceKey: serializeFinanceSourceKey(fixture.transaction.sourceKey),
        account: entry.account,
        side: entry.side,
        amountMinor: String(entry.amount.amountMinor),
        currency: "RUB",
        occurredAt: fixture.transaction.occurredAt
      }))
    );
    expect(Object.isFrozen(mapped)).toBe(true);
    expect(Object.isFrozen(mapped.normalizedRows)).toBe(true);
  });

  it.each([
    "entry_order",
    "account",
    "side",
    "amount",
    "entry_occurred_at",
    "transaction_digest",
    "journal_source",
    "original_sale_link",
    "component_link",
    "payable_lot_link",
    "payout_allocation_link"
  ] as const)("rejects persisted proof drift in %s", (counterexample) => {
    const fixture = validPersistedBundle();
    const rows = structuredClone(fixture.rows);
    const edge = rows.proofEntries[1];
    if (!edge) throw new Error("Expected proof edge fixture");

    if (counterexample === "entry_order") edge.entryIndex = 0;
    if (counterexample === "account") edge.account.code = "platform_subscription_deferred";
    if (counterexample === "side") edge.side = "debit";
    if (counterexample === "amount") edge.amountMinor = "999";
    if (counterexample === "entry_occurred_at") {
      rows.entries[1]!.occurredAt = new Date("2026-08-03T23:59:59.000Z");
    }
    if (counterexample === "transaction_digest") {
      rows.transaction.canonicalDigest = `sha256:${"9".repeat(64)}`;
    }
    if (counterexample === "journal_source") rows.proof.journalSourceId = "another-order";
    if (counterexample === "original_sale_link") edge.originalSaleId = "substituted-sale";
    if (counterexample === "component_link") edge.componentId = "substituted-component";
    if (counterexample === "payable_lot_link") edge.payableLotId = "substituted-lot";
    if (counterexample === "payout_allocation_link") {
      edge.payoutAllocationId = "substituted-allocation";
    }

    expect(() => mapPersistedFinanceJournalBundle(rows, decoderEnvelope)).toThrow(
      JournalRowMappingIntegrityError
    );
  });

  it("rejects an unsafe or non-canonical numeric amount instead of rounding it", () => {
    const fixture = validPersistedBundle();
    const rows = structuredClone(fixture.rows);
    const firstEntry = rows.entries[0];
    const firstProofEntry = rows.proofEntries[0];
    if (!firstEntry || !firstProofEntry) throw new Error("Expected entry fixture");
    firstEntry.amountMinor = "9007199254740992";
    firstProofEntry.amountMinor = "9007199254740992";

    expect(() => mapPersistedFinanceJournalBundle(rows, decoderEnvelope)).toThrow(
      JournalRowMappingIntegrityError
    );
  });

  it("rejects a persisted seal timestamp that predates posting", () => {
    const rows = structuredClone(validPersistedBundle().rows);
    rows.transaction.sealedAt = new Date("2026-08-03T23:59:59.000Z");

    expect(() => mapPersistedFinanceJournalBundle(rows, decoderEnvelope)).toThrow(
      JournalRowMappingIntegrityError
    );
  });

  it("rejects extra persisted fields and accessor-backed rows", () => {
    const extra = structuredClone(
      validPersistedBundle().rows
    ) as PersistedFinanceJournalBundleRows & {
      unexpected?: string;
    };
    extra.unexpected = "must-not-be-ignored";
    expect(() => mapPersistedFinanceJournalBundle(extra, decoderEnvelope)).toThrow(
      JournalRowMappingIntegrityError
    );

    const accessor = structuredClone(validPersistedBundle().rows);
    Object.defineProperty(accessor.transaction, "currency", {
      enumerable: true,
      get: () => "RUB"
    });
    expect(() => mapPersistedFinanceJournalBundle(accessor, decoderEnvelope)).toThrow(
      JournalRowMappingIntegrityError
    );
  });

  it("converts hostile proxy access into one typed mapper failure", () => {
    const rows = validPersistedBundle().rows;
    const hostile = new Proxy(rows, {
      ownKeys() {
        throw new Error("hostile ownKeys");
      }
    });

    expect(() => mapPersistedFinanceJournalBundle(hostile, decoderEnvelope)).toThrow(
      JournalRowMappingIntegrityError
    );
  });
});

function validPersistedBundle(): {
  readonly transaction: FinanceJournalTransaction;
  readonly proof: FinanceJournalLinkProof;
  readonly rows: PersistedFinanceJournalBundleRows;
} {
  const provider = createFinanceLedgerAccountRef({
    code: "arc_provider_clearing",
    arcProviderAccountId: "arc-account-1",
    currency: "RUB"
  });
  const deferred = createFinanceLedgerAccountRef({
    code: "platform_commission_deferred",
    currency: "RUB"
  });
  const sourceKey = createFinanceSourceKey({
    kind: "order",
    sourceId: "order-1",
    operation: "sale_captured"
  });
  const transaction = createFinanceJournalTransaction({
    id: "11111111-1111-4111-8111-111111111111",
    sourceKey,
    occurredAt: "2026-08-04T00:00:00.000Z",
    postedAt: "2026-08-04T00:00:01.000Z",
    reversesTransactionId: null,
    entries: [
      {
        account: provider,
        side: "debit",
        amount: { amountMinor: 1_000, currency: "RUB" },
        links: {
          originalSaleId: null,
          componentId: null,
          payableLotId: null,
          payoutAllocationId: null
        }
      },
      {
        account: deferred,
        side: "credit",
        amount: { amountMinor: 1_000, currency: "RUB" },
        links: {
          originalSaleId: "sale-1",
          componentId: "component-1",
          payableLotId: "lot-1",
          payoutAllocationId: "allocation-1"
        }
      }
    ]
  });
  const authorityDigest = digestFinanceCanonicalValueV1({ authority: "sale-capture-1" });
  const evidenceDigest = digestFinanceCanonicalValueV1({ evidence: "provider-capture-1" });
  const proofCore = Object.freeze({
    kind: "finance_allocation_link_proof" as const,
    proofId: "proof-1",
    version: 1 as const,
    allocationAuthorityRef: Object.freeze({
      kind: "verified_capture",
      authorityId: "capture-authority-1",
      version: 1,
      canonicalDigest: authorityDigest
    }),
    sourceEvidenceRef: Object.freeze({
      kind: "provider_capture",
      evidenceId: "capture-evidence-1",
      canonicalDigest: evidenceDigest
    }),
    journalTransactionId: transaction.id,
    journalSourceKey: transaction.sourceKey,
    operationId: "operation-1",
    operationSnapshotRef: null,
    edges: Object.freeze(
      transaction.entries.map((entry, entryIndex) =>
        Object.freeze({
          entryIndex,
          account: entry.account,
          side: entry.side,
          amount: entry.amount,
          links: entry.links,
          semanticEdgeId: null,
          lotAllocationId: null
        })
      )
    )
  });
  const proof = Object.freeze({
    ...proofCore,
    proofDigest: digestFinanceCanonicalValueV1(proofCore)
  });
  const accountRow = (account: FinanceJournalTransaction["entries"][number]["account"]) => ({
    code: account.code,
    arcProviderAccountId: "arcProviderAccountId" in account ? account.arcProviderAccountId : null,
    bankCashPoolId: "bankCashPoolId" in account ? account.bankCashPoolId : null,
    astrologerUserId: "astrologerUserId" in account ? account.astrologerUserId : null,
    refundId: "refundId" in account ? account.refundId : null,
    payoutRequestId: "payoutRequestId" in account ? account.payoutRequestId : null,
    currency: account.currency
  });
  const entries = transaction.entries.map((entry, entryIndex) => ({
    id: `entry-${entryIndex}`,
    occurredAt: new Date(transaction.occurredAt),
    entryIndex,
    account: accountRow(entry.account),
    side: entry.side,
    amountMinor: String(entry.amount.amountMinor),
    currency: entry.amount.currency,
    ...entry.links
  }));
  const proofEntries = proof.edges.map((edge, entryIndex) => ({
    id: `proof-entry-${entryIndex}`,
    journalEntryId: entries[entryIndex]?.id ?? "missing-entry",
    entryIndex: edge.entryIndex,
    account: accountRow(edge.account),
    side: edge.side,
    amountMinor: String(edge.amount.amountMinor),
    currency: edge.amount.currency,
    ...edge.links,
    semanticEdgeId: edge.semanticEdgeId,
    lotAllocationId: edge.lotAllocationId
  }));

  return {
    transaction,
    proof,
    rows: {
      sourceIdentity: {
        sourceKind: sourceKey.kind,
        sourceId: sourceKey.sourceId,
        sourceOperationKey: sourceKey.operation
      },
      transaction: {
        id: transaction.id,
        occurredAt: new Date(transaction.occurredAt),
        postedAt: new Date(transaction.postedAt),
        reversesJournalTransactionId: transaction.reversesTransactionId,
        currency: transaction.currency,
        entryCount: transaction.entries.length,
        totalDebitMinor: transaction.totalDebitMinor,
        totalCreditMinor: transaction.totalCreditMinor,
        canonicalDigest: digestFinanceCanonicalValueV1(transaction),
        sealedAt: new Date("2026-08-04T00:00:02.000Z")
      },
      entries,
      proof: {
        proofId: proof.proofId,
        version: proof.version,
        allocationAuthorityKind: proof.allocationAuthorityRef.kind,
        allocationAuthorityId: proof.allocationAuthorityRef.authorityId,
        allocationAuthorityVersion: proof.allocationAuthorityRef.version,
        allocationAuthorityDigest: proof.allocationAuthorityRef.canonicalDigest,
        sourceEvidenceKind: proof.sourceEvidenceRef.kind,
        sourceEvidenceId: proof.sourceEvidenceRef.evidenceId,
        sourceEvidenceDigest: proof.sourceEvidenceRef.canonicalDigest,
        journalTransactionId: proof.journalTransactionId,
        journalSourceKind: proof.journalSourceKey.kind,
        journalSourceId: proof.journalSourceKey.sourceId,
        journalSourceOperationKey: proof.journalSourceKey.operation,
        operationId: proof.operationId,
        operationSnapshotId: null,
        operationSnapshotOperationId: null,
        operationSnapshotPreviousWalletRevision: null,
        operationSnapshotNextWalletRevision: null,
        operationSnapshotPreviousLotStateDigest: null,
        operationSnapshotNextLotStateDigest: null,
        operationSnapshotHistoryRecordDigest: null,
        operationSnapshotDigest: null,
        proofDigest: proof.proofDigest
      },
      proofEntries
    }
  };
}
