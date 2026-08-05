import { createHash } from "node:crypto";

import {
  type PlatformTariffInvoiceCanonicalFailureCommitReceipt,
  type PlatformTariffInvoiceCanonicalFailureState,
  type PlatformTariffInvoiceCanonicalFailureUnitOfWork,
  type ProviderOperationResultCommitReceipt
} from "@elevenhouse/domain/finance-core";
import { and, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  financeEconomicPaymentIntents,
  financeEconomicPaymentSessions,
  financePaymentTransitionFacts,
  financePlatformInvoicePaymentBindings
} from "../../schema/finance/economic-payments.schema";
import { platformTariffInvoices } from "../../schema/platform-billing/tariff-authority.schema";
import type { FinanceTransaction } from "./drizzle-finance-command-store";
import { applyProviderOperationResultInTransaction } from "./drizzle-provider-operation-result-application-uow";
import { resolvePendingPlatformTariffInvoiceCustomerActionInTransaction } from "./drizzle-platform-tariff-invoice-customer-action-terminal-resolution";
import { decodeFinancePositiveRevision } from "./finance-row-codecs";

export type PlatformTariffInvoiceCanonicalFailurePersistenceReason =
  | "invoice_not_found"
  | "invoice_correlation_conflict"
  | "invoice_state_conflict"
  | "economic_payment_not_found"
  | "economic_payment_session_not_found"
  | "economic_payment_state_conflict"
  | "persistence_write_incomplete";

export class PlatformTariffInvoiceCanonicalFailurePersistenceError extends Error {
  readonly code = "platform_tariff_invoice_canonical_failure_persistence_error" as const;

  constructor(readonly reason: PlatformTariffInvoiceCanonicalFailurePersistenceReason) {
    super("Canonical platform tariff invoice failure could not be applied atomically");
    this.name = "PlatformTariffInvoiceCanonicalFailurePersistenceError";
  }
}

const transitionableStates = new Set([
  "checkout_opened",
  "pending",
  "pending_3ds",
  "timeout",
  "provider_unknown"
]);

/**
 * A terminal decline is durable business evidence, but never a capture or a ledger event. The
 * provider result, economic heads, immutable transition fact and tariff invoice move together.
 */
export function createDrizzlePlatformTariffInvoiceCanonicalFailureUnitOfWork(input: Readonly<{
  database: ElevenHouseDatabase;
}>): PlatformTariffInvoiceCanonicalFailureUnitOfWork {
  return Object.freeze({
    async applyCanonicalFailure(command) {
      try {
        return await input.database.transaction(async (transaction) => {
          const invoice = await lockInvoice(transaction, command.providerResult.evidence.sourceId);
          assertInvoice(command, invoice);
          await resolvePendingPlatformTariffInvoiceCustomerActionInTransaction(transaction, {
            invoiceId: invoice.id,
            providerOperationIntentId: command.providerResult.providerOperationIntentId,
            providerOperationIntentVersion: command.providerResult.expectedProviderOperationIntentVersion,
            terminalStatus: "expired"
          });
          const result = await applyProviderOperationResultInTransaction(
            transaction,
            command.providerResult
          );
          if (result.outcome !== "failed") fail("invoice_correlation_conflict");

          const replay = await readReplay(transaction, invoice.id, result, command.targetState);
          if (replay) return replay;

          const intent = await lockEconomicIntent(transaction, result, invoice.id);
          const session = await lockEconomicSession(transaction, result, intent.id);
          if (!transitionableStates.has(session.state) || !transitionableStates.has(intent.state)) {
            fail("economic_payment_state_conflict");
          }
          const intentVersion = revision(intent.version);
          const sessionVersion = revision(session.version);
          if (
            intentVersion !== result.correlatedEconomicPaymentVersion ||
            !Number.isSafeInteger(intentVersion + 1) ||
            !Number.isSafeInteger(sessionVersion + 1)
          ) {
            fail("economic_payment_state_conflict");
          }
          const observedAt = new Date(result.observedAt);
          if (Number.isNaN(observedAt.getTime())) fail("invoice_correlation_conflict");
          const transitionId = failureTransitionId(result.providerOperationResultId);
          const transition = await transaction
            .insert(financePaymentTransitionFacts)
            .values({
              id: transitionId,
              economicPaymentIntentId: intent.id,
              economicPaymentSessionId: session.id,
              seriesId: result.providerAccount.seriesId,
              providerAccountId: result.providerAccount.providerAccountId,
              providerIdentityVersion: result.providerAccount.identityVersion,
              fromState: session.state,
              toState: command.targetState,
              evidenceKind: "canonical_provider_result",
              authorityKind: "provider_operation_result",
              authorityId: result.providerOperationResultId,
              evidenceArtifactId: result.evidenceArtifactId,
              evidenceArtifactDigest: result.evidenceArtifactDigest,
              intentVersionFrom: String(intentVersion),
              intentVersionTo: String(intentVersion + 1),
              sessionVersionFrom: String(sessionVersion),
              sessionVersionTo: String(sessionVersion + 1),
              observedAt
            })
            .returning({ id: financePaymentTransitionFacts.id });
          if (transition.length !== 1 || transition[0]?.id !== transitionId) {
            fail("persistence_write_incomplete");
          }

          const updatedSession = await transaction
            .update(financeEconomicPaymentSessions)
            .set({ state: command.targetState, version: String(sessionVersion + 1), terminalAt: observedAt })
            .where(
              and(
                eq(financeEconomicPaymentSessions.id, session.id),
                eq(financeEconomicPaymentSessions.version, String(sessionVersion))
              )
            )
            .returning({ id: financeEconomicPaymentSessions.id });
          if (updatedSession.length !== 1) fail("economic_payment_state_conflict");

          const updatedIntent = await transaction
            .update(financeEconomicPaymentIntents)
            .set({ state: command.targetState, version: String(intentVersion + 1) })
            .where(
              and(
                eq(financeEconomicPaymentIntents.id, intent.id),
                eq(financeEconomicPaymentIntents.version, String(intentVersion))
              )
            )
            .returning({ id: financeEconomicPaymentIntents.id });
          if (updatedIntent.length !== 1) fail("economic_payment_state_conflict");

          const invoiceVersion = integerRevision(invoice.version);
          const updatedInvoice = await transaction
            .update(platformTariffInvoices)
            .set({ state: command.targetState, version: invoiceVersion + 1 })
            .where(
              and(
                eq(platformTariffInvoices.id, invoice.id),
                eq(platformTariffInvoices.version, invoiceVersion),
                eq(platformTariffInvoices.state, invoice.state)
              )
            )
            .returning({ id: platformTariffInvoices.id });
          if (updatedInvoice.length !== 1) fail("invoice_state_conflict");
          return receipt(invoice.id, result, command.targetState);
        });
      } catch (error) {
        if (error instanceof PlatformTariffInvoiceCanonicalFailurePersistenceError) throw error;
        throw error;
      }
    }
  } satisfies PlatformTariffInvoiceCanonicalFailureUnitOfWork);
}

async function lockInvoice(transaction: FinanceTransaction, invoiceId: string) {
  const [invoice] = await transaction
    .select()
    .from(platformTariffInvoices)
    .where(eq(platformTariffInvoices.id, invoiceId))
    .limit(1)
    .for("update");
  if (!invoice) fail("invoice_not_found");
  return invoice;
}

function assertInvoice(
  command: Parameters<PlatformTariffInvoiceCanonicalFailureUnitOfWork["applyCanonicalFailure"]>[0],
  invoice: typeof platformTariffInvoices.$inferSelect
): void {
  if (
    command.providerResult.evidence.purpose !== "platform_invoice" ||
    (command.providerResult.evidence.operationKind !== "saved_card_charge" &&
      command.providerResult.evidence.operationKind !== "saved_card_charge_3ds_method_complete") ||
    command.providerResult.evidence.sourceId !== invoice.id ||
    ![
      "payment_pending",
      "requires_customer_action",
      "provider_unknown",
      command.targetState
    ].includes(invoice.state)
  ) {
    fail("invoice_correlation_conflict");
  }
}

async function lockEconomicIntent(
  transaction: FinanceTransaction,
  result: ProviderOperationResultCommitReceipt,
  invoiceId: string
) {
  const [binding] = await transaction
    .select()
    .from(financePlatformInvoicePaymentBindings)
    .where(eq(financePlatformInvoicePaymentBindings.invoiceId, invoiceId))
    .limit(1)
    .for("share");
  const [intent] = await transaction
    .select()
    .from(financeEconomicPaymentIntents)
    .where(eq(financeEconomicPaymentIntents.id, result.economicPaymentIntentId))
    .limit(1)
    .for("update");
  if (
    !binding ||
    binding.economicPaymentIntentId !== result.economicPaymentIntentId ||
    !intent ||
    intent.purpose !== "platform_invoice" ||
    intent.sourceId !== invoiceId ||
    intent.seriesId !== result.providerAccount.seriesId ||
    intent.providerAccountId !== result.providerAccount.providerAccountId ||
    intent.providerIdentityVersion !== result.providerAccount.identityVersion
  ) {
    fail("economic_payment_not_found");
  }
  return intent;
}

async function lockEconomicSession(
  transaction: FinanceTransaction,
  result: ProviderOperationResultCommitReceipt,
  economicPaymentIntentId: string
) {
  if (result.economicPaymentSessionId === null) fail("economic_payment_session_not_found");
  const [session] = await transaction
    .select()
    .from(financeEconomicPaymentSessions)
    .where(eq(financeEconomicPaymentSessions.id, result.economicPaymentSessionId))
    .limit(1)
    .for("update");
  if (
    !session ||
    session.economicPaymentIntentId !== economicPaymentIntentId ||
    session.seriesId !== result.providerAccount.seriesId ||
    session.providerAccountId !== result.providerAccount.providerAccountId ||
    session.providerIdentityVersion !== result.providerAccount.identityVersion
  ) {
    fail("economic_payment_session_not_found");
  }
  return session;
}

async function readReplay(
  transaction: FinanceTransaction,
  invoiceId: string,
  result: ProviderOperationResultCommitReceipt,
  targetState: PlatformTariffInvoiceCanonicalFailureState
): Promise<PlatformTariffInvoiceCanonicalFailureCommitReceipt | null> {
  const [transition] = await transaction
    .select()
    .from(financePaymentTransitionFacts)
    .where(
      and(
        eq(financePaymentTransitionFacts.authorityKind, "provider_operation_result"),
        eq(financePaymentTransitionFacts.authorityId, result.providerOperationResultId)
      )
    )
    .limit(1)
    .for("share");
  if (!transition) return null;
  if (
    transition.economicPaymentIntentId !== result.economicPaymentIntentId ||
    transition.economicPaymentSessionId !== result.economicPaymentSessionId ||
    transition.toState !== targetState ||
    transition.evidenceKind !== "canonical_provider_result" ||
    transition.evidenceArtifactId !== result.evidenceArtifactId ||
    transition.evidenceArtifactDigest !== result.evidenceArtifactDigest
  ) {
    fail("economic_payment_state_conflict");
  }
  const [invoice] = await transaction
    .select({ state: platformTariffInvoices.state })
    .from(platformTariffInvoices)
    .where(eq(platformTariffInvoices.id, invoiceId))
    .limit(1)
    .for("share");
  if (!invoice || invoice.state !== targetState) fail("invoice_state_conflict");
  return receipt(invoiceId, result, targetState);
}

function receipt(
  invoiceId: string,
  result: ProviderOperationResultCommitReceipt,
  targetState: PlatformTariffInvoiceCanonicalFailureState
): PlatformTariffInvoiceCanonicalFailureCommitReceipt {
  if (result.economicPaymentSessionId === null) fail("economic_payment_session_not_found");
  return Object.freeze({
    kind: "platform_tariff_invoice_canonical_failure_commit_receipt",
    invoiceId,
    economicPaymentIntentId: result.economicPaymentIntentId,
    economicPaymentSessionId: result.economicPaymentSessionId,
    targetState,
    committedAt: result.committedAt
  });
}

function failureTransitionId(providerOperationResultId: string): string {
  return `failure-transition:${createHash("sha256").update(providerOperationResultId, "utf8").digest("hex")}`;
}

function revision(value: string): number {
  try {
    const parsed = Number(decodeFinancePositiveRevision(value));
    if (!Number.isSafeInteger(parsed)) fail("persistence_write_incomplete");
    return parsed;
  } catch {
    fail("persistence_write_incomplete");
  }
}

function integerRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    fail("persistence_write_incomplete");
  }
  return value;
}

function fail(reason: PlatformTariffInvoiceCanonicalFailurePersistenceReason): never {
  throw new PlatformTariffInvoiceCanonicalFailurePersistenceError(reason);
}
