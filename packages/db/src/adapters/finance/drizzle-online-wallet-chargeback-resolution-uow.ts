import { randomUUID } from "node:crypto";

import {
  createOnlineWalletChargebackPlatformLossJournal,
  createOnlineWalletChargebackWonJournal,
  digestFinanceCanonicalValueV1,
  type ChargebackResolutionCommitReceipt,
  type ChargebackResolutionUnitOfWork,
  type ResolveChargebackCommand
} from "@elevenhouse/domain/finance-core";
import { eq, sql } from "drizzle-orm";

import { financeOnlineWalletChargebackCases } from "../../schema/finance/online-wallet-chargeback-cases.schema";
import { financeOnlineWalletChargebackResolutions } from "../../schema/finance/online-wallet-chargeback-resolutions.schema";
import { financeOnlineWalletHeads } from "../../schema/finance/online-sale-capture.schema";
import type { FinanceDatabase, FinanceTransaction } from "./drizzle-finance-command-store";
import { writeOnlineWalletProviderAstrologerJournal } from "./drizzle-online-wallet-journal-writer";
import { issuePersistenceTransactionBoundaryRef } from "./drizzle-sealed-wallet-journal-commit-uow";

export class OnlineWalletChargebackResolutionPersistenceError extends Error {
  readonly code = "online_wallet_chargeback_resolution_persistence_error" as const;
  constructor(readonly reason: "invalid_command" | "case_not_found" | "case_conflict" | "wallet_conflict" | "terminal_replay_conflict" | "unallocated_source_position" | "persistence_write_incomplete" | "retryable_concurrency_conflict") {
    super("Online-wallet chargeback terminal outcome could not be applied atomically");
    this.name = "OnlineWalletChargebackResolutionPersistenceError";
  }
}

/**
 * V2 terminal dispute boundary. A win reverses only provider suspense. A loss is allowed only
 * after every V2 source position has already been irreversibly consumed (the paid-payout case),
 * so it becomes an explicit ElevenHouse platform loss rather than an unapproved recoupment.
 */
export function createDrizzleOnlineWalletChargebackResolutionUnitOfWork(input: Readonly<{ database: FinanceDatabase }>): ChargebackResolutionUnitOfWork {
  return Object.freeze({
    async resolveChargeback(command) {
      try { return await input.database.transaction((tx) => resolveOnlineWalletChargebackInTransaction(tx, command)); }
      catch (error) {
        if (error instanceof OnlineWalletChargebackResolutionPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("terminal_replay_conflict");
        if (code === "23503" || code === "23514" || code === "55000") fail("persistence_write_incomplete");
        throw error;
      }
    }
  } satisfies ChargebackResolutionUnitOfWork);
}

/**
 * Transaction-composable variant for an admin authorization flow. The caller must consume the
 * passkey grant and invoke this function in the same database transaction.
 */
export async function resolveOnlineWalletChargebackInTransaction(
  tx: FinanceTransaction,
  command: ResolveChargebackCommand
): Promise<ChargebackResolutionCommitReceipt> {
  const authority = command.resolutionAuthority;
  if (authority.kind !== "verified_chargeback_resolution_authority" || authority.chargebackCaseId !== command.chargebackCaseId || authority.expectedChargebackVersion !== command.expectedChargebackVersion || !valid(command.operationEnvelope) || !identifier(authority.allocationAuthorityId) || !revision(authority.allocationAuthorityVersion) || !digest(authority.allocationAuthorityDigest)) fail("invalid_command");
  const [caseRow] = await tx.select().from(financeOnlineWalletChargebackCases).where(eq(financeOnlineWalletChargebackCases.chargebackCaseId, command.chargebackCaseId)).limit(2).for("update");
  if (!caseRow) fail("case_not_found");
  const [existing] = await tx.select().from(financeOnlineWalletChargebackResolutions).where(eq(financeOnlineWalletChargebackResolutions.chargebackCaseId, caseRow.chargebackCaseId)).limit(2).for("share");
  if (existing) return replay(existing, command);
  if (caseRow.caseVersion !== command.expectedChargebackVersion || caseRow.status !== "provisional_loss" || caseRow.walletId !== command.walletId || caseRow.disputedPrincipalMinor !== authority.cumulativePrincipalMinor) fail("case_conflict");
  const evidence = authority.providerEvidence;
  if (evidence.kind !== "verified_chargeback_provider_evidence" || evidence.chargebackCaseId !== caseRow.chargebackCaseId || evidence.providerPaymentId !== caseRow.providerPaymentId || evidence.currency !== "RUB" || evidence.cumulativePrincipalMinor !== caseRow.disputedPrincipalMinor || evidence.providerAccount.seriesId !== caseRow.providerAccountSeriesId || evidence.providerAccount.providerAccountId !== caseRow.providerAccountId || evidence.providerAccount.identityVersion !== caseRow.providerIdentityVersion || evidence.lifecycleFact !== authority.resolution || evidence.artifact.byteLength > command.operationEnvelope.maximumArtifactBytes) fail("case_conflict");
  const [head] = await tx.select().from(financeOnlineWalletHeads).where(eq(financeOnlineWalletHeads.id, caseRow.walletId)).limit(2).for("share");
  if (!head || head.revision !== command.expectedWalletRevision || head.currency !== "RUB") fail("wallet_conflict");
  if (authority.resolution === "lost" && await hasUnconsumedV2Source(tx, caseRow.rootLotId)) fail("unallocated_source_position");
  const provider = await providerIdentity(tx, caseRow.providerAccountSeriesId, caseRow.providerAccountId, caseRow.providerIdentityVersion);
  const occurredAt = instant(authority.decidedAt);
  const journal = authority.resolution === "won"
    ? createOnlineWalletChargebackWonJournal({ chargebackCaseId: caseRow.chargebackCaseId, orderId: caseRow.orderId, providerAccountId: caseRow.providerAccountId, occurredAt, postedAt: occurredAt, grossPrincipalMinor: minor(caseRow.disputedPrincipalMinor) })
    : createOnlineWalletChargebackPlatformLossJournal({ chargebackCaseId: caseRow.chargebackCaseId, orderId: caseRow.orderId, providerAccountId: caseRow.providerAccountId, occurredAt, postedAt: occurredAt, grossPrincipalMinor: minor(caseRow.disputedPrincipalMinor) });
  const journalReceipt = await writeOnlineWalletProviderAstrologerJournal(tx, { journal, astrologerUserId: caseRow.astrologerUserId, providerAccount: provider });
  const boundary = await issuePersistenceTransactionBoundaryRef(tx);
  const resolution = authority.resolution === "won" ? "won_reversed" as const : "lost_after_paid_platform_loss" as const;
  const canonical = { kind: "online_wallet_chargeback_resolution", version: 2, chargebackCaseId: caseRow.chargebackCaseId, resolution, expectedCaseVersion: caseRow.caseVersion, providerEvidence: { lifecycleFact: evidence.lifecycleFact, providerPaymentId: evidence.providerPaymentId, cumulativePrincipalMinor: evidence.cumulativePrincipalMinor, artifact: evidence.artifact }, allocationAuthority: { id: authority.allocationAuthorityId, version: authority.allocationAuthorityVersion, digest: authority.allocationAuthorityDigest }, journalTransactionId: journalReceipt.journalTransactionId, journalCanonicalDigest: journalReceipt.canonicalDigest, boundary, decidedAt: occurredAt } as const;
  await tx.insert(financeOnlineWalletChargebackResolutions).values({ resolutionId: `online-chargeback-resolution:${randomUUID()}`, chargebackCaseId: caseRow.chargebackCaseId, expectedCaseVersion: caseRow.caseVersion, resolution, providerLifecycleFact: evidence.lifecycleFact, providerPaymentId: evidence.providerPaymentId, cumulativePrincipalMinor: evidence.cumulativePrincipalMinor, evidenceArtifactId: evidence.artifact.artifactId, evidenceArtifactDigest: evidence.artifact.sha256Digest, allocationAuthorityId: authority.allocationAuthorityId, allocationAuthorityVersion: authority.allocationAuthorityVersion, allocationAuthorityDigest: authority.allocationAuthorityDigest, decidedByActorId: authority.decidedByActorId, journalTransactionId: journalReceipt.journalTransactionId, journalCanonicalDigest: journalReceipt.canonicalDigest, canonicalPreimage: JSON.stringify(canonical), canonicalDigest: digestFinanceCanonicalValueV1(canonical), persistenceTransactionBoundaryRef: boundary, decidedAt: new Date(occurredAt), committedAt: new Date(occurredAt) });
  return Object.freeze({ kind: "chargeback_resolution_commit_receipt", chargebackCaseId: caseRow.chargebackCaseId, chargebackVersion: 2, resolution, walletRevision: head.revision, journalTransactionId: journalReceipt.journalTransactionId, journalCanonicalDigest: journalReceipt.canonicalDigest, persistenceTransactionBoundaryRef: boundary, committedAt: occurredAt }) as ChargebackResolutionCommitReceipt;
}

async function hasUnconsumedV2Source(tx: FinanceTransaction, rootLotId: string): Promise<boolean> {
  const result = await tx.execute<{ active: boolean }>(sql`
    select exists (
      select 1 from finance_online_sale_capture_root_lots root where root.lot_id = ${rootLotId}
        and not exists (select 1 from finance_online_payable_source_consumptions c where c.source_kind = 'root' and c.root_lot_id = root.lot_id)
      union all
      select 1 from finance_online_payable_source_allocations allocation where allocation.root_lot_id = ${rootLotId}
        and not exists (select 1 from finance_online_payable_source_consumptions c where c.source_kind = 'allocation' and c.source_allocation_id = allocation.allocation_id)
    ) as active`);
  return result.rows[0]?.active === true;
}
async function providerIdentity(tx: FinanceTransaction, seriesId: string, providerAccountId: string, identityVersion: number) {
  const result = await tx.execute<{ versionId: string }>(sql`select id as "versionId" from finance_provider_accounts where series_id = ${seriesId} and provider_account_id = ${providerAccountId} and identity_version = ${identityVersion} for share`);
  const row = result.rows[0];
  if (!row || result.rows.length !== 1) fail("case_conflict");
  return Object.freeze({ versionId: row.versionId, seriesId, providerAccountId, identityVersion });
}
function replay(row: typeof financeOnlineWalletChargebackResolutions.$inferSelect, command: ResolveChargebackCommand): ChargebackResolutionCommitReceipt {
  const authority = command.resolutionAuthority;
  const expected = authority.resolution === "won" ? "won_reversed" : "lost_after_paid_platform_loss";
  if (row.expectedCaseVersion !== command.expectedChargebackVersion || row.resolution !== expected || row.providerPaymentId !== authority.providerEvidence.providerPaymentId || row.cumulativePrincipalMinor !== authority.cumulativePrincipalMinor || row.allocationAuthorityId !== authority.allocationAuthorityId || row.allocationAuthorityVersion !== authority.allocationAuthorityVersion || row.allocationAuthorityDigest !== authority.allocationAuthorityDigest) fail("terminal_replay_conflict");
  return Object.freeze({ kind: "chargeback_resolution_commit_receipt", chargebackCaseId: row.chargebackCaseId, chargebackVersion: 2, resolution: row.resolution as "won_reversed" | "lost_after_paid_platform_loss", walletRevision: command.expectedWalletRevision, journalTransactionId: row.journalTransactionId, journalCanonicalDigest: row.journalCanonicalDigest, persistenceTransactionBoundaryRef: row.persistenceTransactionBoundaryRef, committedAt: row.committedAt.toISOString() }) as ChargebackResolutionCommitReceipt;
}
function valid(v: ResolveChargebackCommand["operationEnvelope"]) { return v.kind === "resolved_finance_operation_envelope" && Number.isSafeInteger(v.maximumArtifactBytes) && v.maximumArtifactBytes >= 0; }
function identifier(v: unknown): v is string { return typeof v === "string" && v.length > 0 && v.length <= 200 && v.trim() === v; }
function revision(v: unknown): boolean { return typeof v === "string" && /^[1-9][0-9]*$/.test(v); }
function digest(v: unknown): boolean { return typeof v === "string" && /^sha256:[a-f0-9]{64}$/.test(v); }
function instant(v: unknown): string { const date = new Date(typeof v === "string" ? v : ""); if (!Number.isFinite(date.getTime())) fail("invalid_command"); return date.toISOString(); }
function minor(v: unknown): number { const n = Number(v); if (!Number.isSafeInteger(n) || n <= 0) fail("case_conflict"); return n; }
function postgresCode(error: unknown) { return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : null; }
function fail(reason: ConstructorParameters<typeof OnlineWalletChargebackResolutionPersistenceError>[0]): never { throw new OnlineWalletChargebackResolutionPersistenceError(reason); }
