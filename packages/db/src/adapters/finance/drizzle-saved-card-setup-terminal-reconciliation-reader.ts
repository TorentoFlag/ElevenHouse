/* eslint-disable no-control-regex -- Persistence boundary validation intentionally rejects ASCII control characters. */
import {
  createProviderAccountIdentityBinding,
  type ProviderOperationResultCommitReceipt,
  type SavedCardSetupTerminalReconciliationCandidate,
  type SavedCardSetupTerminalReconciliationReaderPort
} from "@elevenhouse/domain/finance-core";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { financeEconomicPaymentIntents } from "../../schema/finance/economic-payments.schema";
import {
  financeProviderOperationIntents,
  financeProviderOperationResultCommitReceipts,
  financeProviderOperationResults
} from "../../schema/finance/provider-operations.schema";
import { financeSavedCardSetupSessions } from "../../schema/finance/saved-card-setup-sessions.schema";
import { platformTariffSubscriptions } from "../../schema/platform-billing/tariff-authority.schema";

export class SavedCardSetupTerminalReconciliationReaderError extends Error {
  readonly code = "SAVED_CARD_SETUP_TERMINAL_RECONCILIATION_READER_ERROR" as const;
  constructor(readonly reason: "invalid_input" | "integrity_conflict") {
    super("Saved-card terminal reconciliation candidate could not be reloaded safely");
  }
}

/**
 * Recovery reader deliberately has no provider or browser input. It selects only a persisted
 * setup coordinator plus its latest compatible operation; the worker then obtains the fact from
 * ArcPay's canonical resources. This makes retries after each committed state transition safe.
 */
export function createDrizzleSavedCardSetupTerminalReconciliationReader(
  database: ElevenHouseDatabase
): SavedCardSetupTerminalReconciliationReaderPort {
  return Object.freeze({
    async listSavedCardSetupTerminalCandidates({ limit }) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail("invalid_input");
      const sessions = await database
        .select({
          id: financeSavedCardSetupSessions.id,
          state: financeSavedCardSetupSessions.state,
          version: financeSavedCardSetupSessions.version,
          subscriptionId: financeSavedCardSetupSessions.subscriptionId,
          expectedSubscriptionVersion: financeSavedCardSetupSessions.expectedSubscriptionVersion,
          providerSetupId: financeSavedCardSetupSessions.providerSetupId,
          providerCustomerId: financeSavedCardSetupSessions.providerCustomerId,
          savedCardCredentialId: financeSavedCardSetupSessions.savedCardCredentialId,
          savedCardCredentialVersion: financeSavedCardSetupSessions.savedCardCredentialVersion,
          subscriptionState: platformTariffSubscriptions.state
        })
        .from(financeSavedCardSetupSessions)
        .innerJoin(
          platformTariffSubscriptions,
          eq(platformTariffSubscriptions.id, financeSavedCardSetupSessions.subscriptionId)
        )
        .where(
          and(
            inArray(financeSavedCardSetupSessions.state, [
              "execution_pending",
              "requires_customer_action",
              "credential_active"
            ]),
            inArray(platformTariffSubscriptions.state, [
              "incomplete_setup",
              "awaiting_initial_payment"
            ])
          )
        )
        .orderBy(asc(financeSavedCardSetupSessions.createdAt), asc(financeSavedCardSetupSessions.id))
        .limit(limit);
      const candidates = await Promise.all(sessions.map((session) => candidateForSession(database, session)));
      return Object.freeze(candidates.filter((candidate): candidate is SavedCardSetupTerminalReconciliationCandidate => candidate !== null));
    }
  });
}

type SessionRow = Awaited<ReturnType<ElevenHouseDatabase["select"]>> extends never ? never : Readonly<{
  id: string;
  state: string;
  version: number;
  subscriptionId: string;
  expectedSubscriptionVersion: number;
  providerSetupId: string | null;
  providerCustomerId: string;
  savedCardCredentialId: string | null;
  savedCardCredentialVersion: string | null;
  subscriptionState: string;
}>;

async function candidateForSession(
  database: ElevenHouseDatabase,
  session: SessionRow
): Promise<SavedCardSetupTerminalReconciliationCandidate | null> {
  if (session.state === "credential_active") {
    const savedCardCredentialId = identifier(session.savedCardCredentialId);
    const savedCardCredentialVersion = revisionText(session.savedCardCredentialVersion, true);
    return Object.freeze({
      state: "credential_active",
      setupSessionId: uuid(session.id),
      subscriptionId: uuid(session.subscriptionId),
      expectedSubscriptionVersion: positive(session.expectedSubscriptionVersion),
      savedCardCredentialId,
      savedCardCredentialVersion
    });
  }
  if (session.state !== "execution_pending" && session.state !== "requires_customer_action") {
    fail("integrity_conflict");
  }
  const providerSetupId = uuid(session.providerSetupId);
  const [row] = await database
    .select({
      operation: financeProviderOperationIntents,
      economic: financeEconomicPaymentIntents
    })
    .from(financeProviderOperationIntents)
    .innerJoin(
      financeEconomicPaymentIntents,
      eq(financeEconomicPaymentIntents.id, financeProviderOperationIntents.economicPaymentIntentId)
    )
    .where(
      and(
        eq(financeProviderOperationIntents.sourceId, session.id),
        eq(financeProviderOperationIntents.purpose, "platform_card_setup"),
        inArray(financeProviderOperationIntents.operationKind, [
          "card_setup_execute",
          "card_setup_3ds_method_complete"
        ]),
        inArray(financeProviderOperationIntents.status, [
          "pending_dispatch",
          "requires_customer_action",
          "provider_unknown",
          "succeeded"
        ])
      )
    )
    .orderBy(desc(financeProviderOperationIntents.createdAt), desc(financeProviderOperationIntents.id))
    .limit(1);
  if (!row) return null;
  const operation = row.operation;
  if (
    row.economic.purpose !== "platform_card_setup" ||
    row.economic.sourceId !== session.id ||
    row.economic.amountMinor !== "0" ||
    row.economic.currency !== "RUB" ||
    operation.economicPaymentSessionId === null ||
    operation.seriesId !== row.economic.seriesId ||
    operation.providerAccountId !== row.economic.providerAccountId ||
    operation.providerIdentityVersion !== row.economic.providerIdentityVersion
  ) {
    fail("integrity_conflict");
  }
  if (operation.status === "succeeded") {
    const result = await succeededResult(database, operation.id, revision(operation.version, true));
    if (!result) fail("integrity_conflict");
    return Object.freeze({
      state: "awaiting_credential_activation",
      setupSessionId: uuid(session.id),
      setupSessionVersion: positive(session.version),
      subscriptionId: uuid(session.subscriptionId),
      expectedSubscriptionVersion: positive(session.expectedSubscriptionVersion),
      providerSetupId,
      providerCustomerId: identifier(session.providerCustomerId),
      providerResult: result
    });
  }
  return Object.freeze({
    state: "awaiting_provider_terminal",
    setupSessionId: uuid(session.id),
    setupSessionVersion: positive(session.version),
    subscriptionId: uuid(session.subscriptionId),
    expectedSubscriptionVersion: positive(session.expectedSubscriptionVersion),
    providerSetupId,
    providerCustomerId: identifier(session.providerCustomerId),
    providerOperation: Object.freeze({
      economicPaymentIntentId: identifier(operation.economicPaymentIntentId),
      expectedEconomicPaymentVersion: revision(row.economic.version, false),
      providerOperationIntentId: uuid(operation.id),
      expectedProviderOperationIntentVersion: revision(operation.version, true),
      operationKind: operationKind(operation.operationKind),
      providerAccount: createProviderAccountIdentityBinding({
        seriesId: operation.seriesId,
        providerAccountId: operation.providerAccountId,
        identityVersion: operation.providerIdentityVersion
      }),
      economicPaymentSessionId: identifier(operation.economicPaymentSessionId),
      sourceId: uuid(operation.sourceId),
      purpose: "platform_card_setup",
      canonicalRequestDigest: digest(operation.canonicalRequestDigest),
      idempotencyKey: identifier(operation.idempotencyKey),
      operationEnvelope: Object.freeze({
        kind: "resolved_finance_operation_envelope" as const,
        policyId: identifier(operation.operationPolicyId),
        policyVersion: positive(operation.operationPolicyVersion),
        policyDigest: digest(operation.operationPolicyDigest),
        maximumRows: positive(operation.operationMaximumRows),
        maximumDecimalDigits: positive(operation.operationMaximumDecimalDigits),
        maximumArtifactBytes: positive(operation.operationMaximumArtifactBytes)
      }) as never
    })
  });
}

async function succeededResult(
  database: ElevenHouseDatabase,
  operationId: string,
  operationVersion: number
): Promise<ProviderOperationResultCommitReceipt | null> {
  const [row] = await database
    .select({ result: financeProviderOperationResults, receipt: financeProviderOperationResultCommitReceipts })
    .from(financeProviderOperationResults)
    .innerJoin(
      financeProviderOperationResultCommitReceipts,
      eq(
        financeProviderOperationResultCommitReceipts.providerOperationResultId,
        financeProviderOperationResults.id
      )
    )
    .where(
      and(
        eq(financeProviderOperationResults.providerOperationIntentId, operationId),
        eq(financeProviderOperationResults.providerOperationIntentVersion, String(operationVersion)),
        eq(financeProviderOperationResults.outcome, "succeeded")
      )
    )
    .limit(1);
  if (!row) return null;
  const result = row.result;
  const receipt = row.receipt;
  if (
    receipt.providerOperationResultId !== result.id ||
    receipt.providerOperationIntentId !== result.providerOperationIntentId ||
    receipt.providerOperationIntentVersion !== result.providerOperationIntentVersion ||
    receipt.outcome !== "succeeded" ||
    receipt.providerOperationId !== result.providerOperationId ||
    receipt.evidenceArtifactId !== result.evidenceArtifactId ||
    receipt.evidenceArtifactDigest !== result.evidenceArtifactDigest ||
    receipt.operationKind !== "card_setup_execute" && receipt.operationKind !== "card_setup_3ds_method_complete"
  ) fail("integrity_conflict");
  return Object.freeze({
    kind: "provider_operation_result_commit_receipt" as const,
    providerOperationResultId: result.id,
    providerOperationIntentId: receipt.providerOperationIntentId,
    providerOperationIntentVersion: revision(receipt.providerOperationIntentVersion, true),
    providerOperationId: receipt.providerOperationId,
    operationKind: receipt.operationKind,
    economicPaymentIntentId: receipt.economicPaymentIntentId,
    correlatedEconomicPaymentVersion: revision(receipt.correlatedEconomicPaymentVersion, false),
    economicPaymentSessionId: receipt.economicPaymentSessionId,
    sourceId: receipt.sourceId,
    purpose: "platform_card_setup",
    providerAccount: createProviderAccountIdentityBinding({
      seriesId: receipt.seriesId,
      providerAccountId: receipt.providerAccountId,
      identityVersion: receipt.providerIdentityVersion
    }),
    outcome: "succeeded" as const,
    providerPaymentId: receipt.providerPaymentId,
    amountMinor: receipt.amountMinor,
    currency: receipt.currency as "RUB" | null,
    evidenceArtifactId: receipt.evidenceArtifactId,
    evidenceArtifactDigest: digest(receipt.evidenceArtifactDigest),
    canonicalRequestDigest: digest(receipt.canonicalRequestDigest),
    observedAt: instant(receipt.observedAt),
    persistenceTransactionBoundaryRef: receipt.persistenceTransactionBoundaryRef,
    committedAt: instant(receipt.committedAt)
  }) as ProviderOperationResultCommitReceipt;
}

function uuid(value: unknown): string { if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) fail("integrity_conflict"); return value; }
function identifier(value: unknown): string { if (typeof value !== "string" || value.length < 1 || value.length > 160 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) fail("integrity_conflict"); return value; }
function positive(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 1) fail("integrity_conflict"); return value as number; }
function revision(value: unknown, zeroAllowed: boolean): number { if (typeof value !== "string" || !(zeroAllowed ? /^(0|[1-9][0-9]*)$/ : /^[1-9][0-9]*$/).test(value)) fail("integrity_conflict"); const parsed = Number(value); if (!Number.isSafeInteger(parsed)) fail("integrity_conflict"); return parsed; }
function revisionText(value: unknown, zeroAllowed: boolean): string { revision(value, zeroAllowed); return value as string; }
function digest(value: unknown): `sha256:${string}` { if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) fail("integrity_conflict"); return value as `sha256:${string}`; }
function instant(value: unknown): string { if (!(value instanceof Date) || Number.isNaN(value.getTime())) fail("integrity_conflict"); return value.toISOString(); }
function operationKind(value: unknown): "card_setup_execute" | "card_setup_3ds_method_complete" { if (value === "card_setup_execute" || value === "card_setup_3ds_method_complete") return value; fail("integrity_conflict"); }
function fail(reason: SavedCardSetupTerminalReconciliationReaderError["reason"]): never { throw new SavedCardSetupTerminalReconciliationReaderError(reason); }
