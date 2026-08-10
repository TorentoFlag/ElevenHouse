import { randomUUID } from "node:crypto";

import {
  createSettlementCursorKey,
  resolveFinanceOperationEnvelope,
  type AcquiredSettlementPage,
  type ActiveProviderAccountReaderPort,
  type FinanceSettlementStream,
  type FinanceOperationResourcePolicyReader,
  type SettlementBatchIngestionUnitOfWork,
  type SettlementCursorLeaseUnitOfWork,
  type SettlementCursorWorkUnitOfWork,
  type SettlementProviderReadPort
} from "@elevenhouse/domain/finance-core";

export type SettlementLedgerIngestionResult =
  | Readonly<{ kind: "not_configured" }>
  | Readonly<{ kind: "concurrent_worker" }>
  | Readonly<{ kind: "idle"; cursorCreated: boolean }>
  | Readonly<{
      kind: "ingested";
      cursorCreated: boolean;
      pages: number;
      insertedEntries: number;
      replayedEntries: number;
    }>;

export class SettlementLedgerIngestionProcessorError extends Error {
  readonly code = "SETTLEMENT_LEDGER_INGESTION_PROCESSOR_ERROR" as const;

  constructor(readonly reason: "policy_not_published" | "cursor_lifecycle" | "provider_read" | "ingestion") {
    super("Settlement ledger ingestion could not complete safely");
    this.name = "SettlementLedgerIngestionProcessorError";
  }
}

/**
 * Coordinates one or more exact settlement pages. Each database transaction is short and a
 * sealed provider response is always fetched outside it; cursors make retries and replicas safe.
 */
type SettlementIngestionProcessorInput = Readonly<{
  stream: FinanceSettlementStream;
  providerAccounts: ActiveProviderAccountReaderPort;
  operationPolicies: FinanceOperationResourcePolicyReader;
  cursors: SettlementCursorWorkUnitOfWork;
  leases: SettlementCursorLeaseUnitOfWork;
  provider: SettlementProviderReadPort;
  ingestion: SettlementBatchIngestionUnitOfWork;
  workerId: string;
  initialBackfillStart: () => string;
  overlapSeconds: number;
  leaseDurationSeconds: number;
  maximumPageCount: number;
}>;

/**
 * Runs one independently checkpointed ArcPay settlement stream. Ledger rows and merchant payouts
 * intentionally never share a cursor: a delayed payout page must not block payment-ledger intake.
 */
export function createSettlementIngestionProcessor(
  input: SettlementIngestionProcessorInput
): Readonly<{ tick(): Promise<SettlementLedgerIngestionResult> }> {
  return Object.freeze({
    async tick() {
      const providerAccount = await input.providerAccounts.findActiveProviderAccount({
        provider: "arc_pay"
      });
      if (!providerAccount) return Object.freeze({ kind: "not_configured" as const });
      const publishedPolicy = await input.operationPolicies.findPublishedForOperation({
        operationKind: "settlement_ingestion"
      });
      if (!publishedPolicy) fail("policy_not_published");
      let operationEnvelope: ReturnType<typeof resolveFinanceOperationEnvelope>;
      try {
        operationEnvelope = resolveFinanceOperationEnvelope({
          policy: publishedPolicy,
          operationKind: "settlement_ingestion"
        });
      } catch {
        fail("policy_not_published");
      }
      const cursorKey = createSettlementCursorKey({ providerAccount, stream: input.stream });
      let provision;
      try {
        provision = await input.cursors.ensureCursor({
          cursorKey,
          initialBackfillStart: input.initialBackfillStart(),
          overlapSeconds: input.overlapSeconds
        });
      } catch {
        fail("cursor_lifecycle");
      }

      let pages = 0;
      let insertedEntries = 0;
      let replayedEntries = 0;
      while (pages < input.maximumPageCount) {
        const acquired = await acquirePage(input, cursorKey);
        if (acquired === "concurrent_worker") {
          if (pages === 0) return Object.freeze({ kind: "concurrent_worker" as const });
          break;
        }
        if (acquired === null) break;

        let receipt;
        let hasNextPage = false;
        try {
          const pageBundle = await input.provider.fetchVerifiedPage({
            cursorKey,
            checkpointIdentity: acquired.checkpointIdentity,
            windowStart: acquired.windowStart,
            windowEnd: acquired.windowEnd,
            lease: acquired.lease,
            operationEnvelope
          });
          hasNextPage = pageBundle.normalizedEntries.nextCursor !== null;
          receipt = await input.ingestion.ingestVerifiedPage({
            expectedCursorVersion: acquired.lease.cursorVersion,
            lease: acquired.lease,
            pageBundle
          });
        } catch (error) {
          await releaseAfterFailure(input, acquired.lease);
          if (error instanceof SettlementLedgerIngestionProcessorError) throw error;
          fail("provider_read");
        }
        try {
          await input.leases.releaseLease({
            cursorKey,
            expectedCursorVersion: receipt.cursorVersion,
            leaseOwnerId: acquired.lease.leaseOwnerId,
            leaseToken: acquired.lease.leaseToken,
            fencingToken: acquired.lease.fencingToken
          });
        } catch {
          fail("ingestion");
        }
        pages += 1;
        insertedEntries += receipt.insertedEntryCount;
        replayedEntries += receipt.replayedEntryCount;
        if (!hasNextPage) break;
      }

      if (pages === 0) return Object.freeze({ kind: "idle" as const, cursorCreated: provision.created });
      return Object.freeze({
        kind: "ingested" as const,
        cursorCreated: provision.created,
        pages,
        insertedEntries,
        replayedEntries
      });
    }
  });
}

/** Preserves the original payment-ledger entry point for its existing caller and tests. */
export function createSettlementLedgerIngestionProcessor(
  input: Omit<SettlementIngestionProcessorInput, "stream">
): Readonly<{ tick(): Promise<SettlementLedgerIngestionResult> }> {
  return createSettlementIngestionProcessor({ ...input, stream: "settlement_ledger" });
}

export function startSettlementLedgerIngestionInterval(input: Readonly<{
  processor: Readonly<{ tick(): Promise<SettlementLedgerIngestionResult> }>;
  intervalMs: number;
  onResult?(result: SettlementLedgerIngestionResult): void;
  onError(error: unknown): void;
}>): () => void {
  if (!Number.isSafeInteger(input.intervalMs) || input.intervalMs <= 0) return () => undefined;
  const run = async () => {
    try {
      input.onResult?.(await input.processor.tick());
    } catch (error) {
      input.onError(error);
    }
  };
  const timer = setInterval(() => void run(), input.intervalMs);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}

async function acquirePage(
  input: Parameters<typeof createSettlementLedgerIngestionProcessor>[0],
  cursorKey: ReturnType<typeof createSettlementCursorKey>
) {
  try {
    return await input.cursors.acquireNextPage({
      cursorKey,
      leaseOwnerId: input.workerId,
      leaseToken: randomUUID(),
      leaseDurationSeconds: input.leaseDurationSeconds,
      maximumPageCount: input.maximumPageCount
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "reason" in error &&
      (error as Readonly<{ reason?: unknown }>).reason === "lease_already_active"
    ) {
      return "concurrent_worker" as const;
    }
    fail("cursor_lifecycle");
  }
}

async function releaseAfterFailure(
  input: Parameters<typeof createSettlementLedgerIngestionProcessor>[0],
  lease: AcquiredSettlementPage["lease"]
): Promise<void> {
  try {
    await input.leases.releaseLease({
      cursorKey: lease.cursorKey,
      expectedCursorVersion: lease.cursorVersion,
      leaseOwnerId: lease.leaseOwnerId,
      leaseToken: lease.leaseToken,
      fencingToken: lease.fencingToken
    });
  } catch {
    // The database lease is bounded. The original failure is more useful than a cleanup failure.
  }
}

function fail(reason: SettlementLedgerIngestionProcessorError["reason"]): never {
  throw new SettlementLedgerIngestionProcessorError(reason);
}
