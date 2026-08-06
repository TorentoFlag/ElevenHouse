import { and, eq, gt, sql } from "drizzle-orm";
import type {
  CurrentEligibleBankLiquiditySnapshot,
  CurrentEligibleBankLiquiditySnapshotReader,
  FinanceCurrency
} from "@elevenhouse/domain/finance-core";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  financeBankLiquidityHeads,
  financeBankLiquiditySnapshotAdoptionReceipts,
  financeBankLiquiditySnapshots
} from "../../schema/finance/bank-liquidity.schema";

export class CurrentEligibleBankLiquiditySnapshotReaderPersistenceError extends Error {
  readonly code = "current_eligible_bank_liquidity_snapshot_reader_persistence_error";

  constructor(readonly reason: "invalid_input" | "integrity_conflict" | "persistence_failure") {
    super("Current eligible bank liquidity snapshot could not be read safely");
    this.name = "CurrentEligibleBankLiquiditySnapshotReaderPersistenceError";
  }
}

/**
 * Resolves only the current, unexpired snapshot adopted by the pool-scoped liquidity head. This
 * keeps browser input out of the bank-liquidity binding used by payout approval.
 */
export function createDrizzleCurrentEligibleBankLiquiditySnapshotReader(
  database: ElevenHouseDatabase
): CurrentEligibleBankLiquiditySnapshotReader {
  return Object.freeze({
    findCurrentEligibleBankLiquiditySnapshot: (input) =>
      findCurrentEligibleBankLiquiditySnapshot(database, input)
  });
}

export async function findCurrentEligibleBankLiquiditySnapshot(
  database: Pick<ElevenHouseDatabase, "select">,
  input: Readonly<{ bankCashPoolId: string; currency: FinanceCurrency }>
): Promise<CurrentEligibleBankLiquiditySnapshot | null> {
  assertInput(input);
  try {
    const rows = await database
      .select({
        bankCashPoolId: financeBankLiquidityHeads.bankCashPoolId,
        currency: financeBankLiquidityHeads.currency,
        bankLiquidityRevision: financeBankLiquidityHeads.revision,
        availableLiquidityMinor: financeBankLiquidityHeads.availableLiquidityMinor,
        receiptId: financeBankLiquiditySnapshotAdoptionReceipts.receiptId,
        receiptVersion: financeBankLiquiditySnapshotAdoptionReceipts.receiptVersion,
        receiptDigest: financeBankLiquiditySnapshotAdoptionReceipts.canonicalDigest,
        sourceCheckpoint: financeBankLiquiditySnapshotAdoptionReceipts.sourceCheckpoint,
        expiresAt: financeBankLiquiditySnapshots.expiresAt
      })
      .from(financeBankLiquidityHeads)
      .innerJoin(
        financeBankLiquiditySnapshots,
        and(
          eq(
            financeBankLiquiditySnapshots.snapshotId,
            financeBankLiquidityHeads.currentSnapshotId
          ),
          eq(
            financeBankLiquiditySnapshots.snapshotVersion,
            financeBankLiquidityHeads.currentSnapshotVersion
          ),
          eq(
            financeBankLiquiditySnapshots.evidenceDigest,
            financeBankLiquidityHeads.currentSnapshotDigest
          ),
          eq(financeBankLiquiditySnapshots.bankCashPoolId, financeBankLiquidityHeads.bankCashPoolId),
          eq(financeBankLiquiditySnapshots.currency, financeBankLiquidityHeads.currency)
        )
      )
      .innerJoin(
        financeBankLiquiditySnapshotAdoptionReceipts,
        and(
          eq(
            financeBankLiquiditySnapshotAdoptionReceipts.snapshotId,
            financeBankLiquiditySnapshots.snapshotId
          ),
          eq(
            financeBankLiquiditySnapshotAdoptionReceipts.snapshotVersion,
            financeBankLiquiditySnapshots.snapshotVersion
          ),
          eq(
            financeBankLiquiditySnapshotAdoptionReceipts.snapshotDigest,
            financeBankLiquiditySnapshots.evidenceDigest
          ),
          eq(
            financeBankLiquiditySnapshotAdoptionReceipts.bankCashPoolId,
            financeBankLiquidityHeads.bankCashPoolId
          ),
          eq(
            financeBankLiquiditySnapshotAdoptionReceipts.currency,
            financeBankLiquidityHeads.currency
          )
        )
      )
      .where(
        and(
          eq(financeBankLiquidityHeads.bankCashPoolId, input.bankCashPoolId),
          eq(financeBankLiquidityHeads.currency, input.currency),
          eq(financeBankLiquidityHeads.snapshotState, "adopted"),
          gt(financeBankLiquiditySnapshots.expiresAt, sql`clock_timestamp()`)
        )
      )
      .limit(2);
    if (rows.length === 0) return null;
    if (rows.length !== 1) fail("integrity_conflict");
    return mapRow(rows[0]!);
  } catch (error) {
    if (error instanceof CurrentEligibleBankLiquiditySnapshotReaderPersistenceError) throw error;
    throw new CurrentEligibleBankLiquiditySnapshotReaderPersistenceError("persistence_failure");
  }
}

function mapRow(row: {
  readonly bankCashPoolId: string;
  readonly currency: string;
  readonly bankLiquidityRevision: string;
  readonly availableLiquidityMinor: string | null;
  readonly receiptId: string;
  readonly receiptVersion: number;
  readonly receiptDigest: string;
  readonly sourceCheckpoint: string;
  readonly expiresAt: Date;
}): CurrentEligibleBankLiquiditySnapshot {
  if (
    row.currency !== "RUB" ||
    !nonNegativeRevision(row.bankLiquidityRevision) ||
    row.availableLiquidityMinor === null ||
    !numeric(row.availableLiquidityMinor) ||
    !identifier(row.bankCashPoolId, 160) ||
    !identifier(row.receiptId, 200) ||
    row.receiptVersion !== 1 ||
    !digest(row.receiptDigest) ||
    !identifier(row.sourceCheckpoint, 320) ||
    !Number.isFinite(row.expiresAt.getTime())
  ) {
    fail("integrity_conflict");
  }
  return Object.freeze({
    bankCashPoolId: row.bankCashPoolId,
    currency: "RUB",
    bankLiquidityRevision: row.bankLiquidityRevision,
    adoptedSnapshot: {
      kind: "bank_liquidity_snapshot_adoption_receipt",
      receiptId: row.receiptId,
      version: 1,
      canonicalDigest: row.receiptDigest as `sha256:${string}`
    } as CurrentEligibleBankLiquiditySnapshot["adoptedSnapshot"],
    sourceCheckpoint: row.sourceCheckpoint,
    expiresAt: row.expiresAt.toISOString(),
    availableLiquidityMinor: row.availableLiquidityMinor
  });
}

function assertInput(input: Readonly<{ bankCashPoolId: string; currency: FinanceCurrency }>): void {
  if (input.currency !== "RUB" || !identifier(input.bankCashPoolId, 160)) fail("invalid_input");
}

function identifier(value: string, maximum: number): boolean {
  return value.trim() === value && value.length > 0 && value.length <= maximum;
}

function nonNegativeRevision(value: string): boolean {
  return /^(0|[1-9][0-9]*)$/.test(value);
}

function numeric(value: string): boolean {
  return /^-?(0|[1-9][0-9]*)$/.test(value);
}

function digest(value: string): boolean {
  return /^sha256:[a-f0-9]{64}$/.test(value);
}

function fail(
  reason: CurrentEligibleBankLiquiditySnapshotReaderPersistenceError["reason"]
): never {
  throw new CurrentEligibleBankLiquiditySnapshotReaderPersistenceError(reason);
}
