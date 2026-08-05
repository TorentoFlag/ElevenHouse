/* eslint-disable no-control-regex -- Persistence boundary validation intentionally rejects ASCII control characters. */
import {
  type PlatformTariffInvoiceCustomerActionUnitOfWork
} from "@elevenhouse/domain/finance-core";
import { and, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  financeEconomicPaymentIntents,
  financeEconomicPaymentSessions
} from "../../schema/finance/economic-payments.schema";
import { financeArtifacts } from "../../schema/finance/finance-artifacts.schema";
import { financePlatformTariffInvoiceCustomerActions } from "../../schema/finance/platform-tariff-invoice-customer-actions.schema";
import {
  financeProviderOperationIntents,
  financeProviderOperationResults
} from "../../schema/finance/provider-operations.schema";
import { platformTariffInvoices } from "../../schema/platform-billing/tariff-authority.schema";
import { decodeFinancePositiveRevision } from "./finance-row-codecs";

export type PlatformTariffInvoiceCustomerActionPersistenceReason =
  | "invalid_command"
  | "invoice_not_actionable"
  | "economic_payment_conflict"
  | "provider_operation_conflict"
  | "provider_result_conflict"
  | "response_artifact_conflict"
  | "customer_action_conflict"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class PlatformTariffInvoiceCustomerActionPersistenceError extends Error {
  readonly code = "platform_tariff_invoice_customer_action_persistence_error" as const;

  constructor(readonly reason: PlatformTariffInvoiceCustomerActionPersistenceReason) {
    super("Platform tariff invoice customer action could not be persisted atomically");
    this.name = "PlatformTariffInvoiceCustomerActionPersistenceError";
  }
}

/**
 * A `pending_3ds` canonical read turns an ambiguous MIT attempt into explicit user action.
 * It never changes the economic payment to captured and never creates a journal posting.
 */
export function createDrizzlePlatformTariffInvoiceCustomerActionUnitOfWork(input: Readonly<{
  database: ElevenHouseDatabase;
}>): PlatformTariffInvoiceCustomerActionUnitOfWork {
  return Object.freeze({
    async recordCustomerAction(command) {
      const normalized = normalize(command);
      try {
        return await input.database.transaction(async (transaction) => {
          const [invoice] = await transaction
            .select()
            .from(platformTariffInvoices)
            .where(eq(platformTariffInvoices.id, normalized.invoiceId))
            .limit(1)
            .for("update");
          if (
            !invoice ||
            invoice.state !== "payment_pending" ||
            invoice.version !== normalized.expectedInvoiceVersion
          ) {
            fail("invoice_not_actionable");
          }

          const [economic] = await transaction
            .select()
            .from(financeEconomicPaymentIntents)
            .where(eq(financeEconomicPaymentIntents.id, normalized.economicPaymentIntentId))
            .limit(1)
            .for("update");
          if (
            !economic ||
            economic.purpose !== "platform_invoice" ||
            economic.sourceId !== invoice.id ||
            revision(economic.version) !== normalized.expectedEconomicPaymentVersion ||
            economic.seriesId !== normalized.providerAccount.seriesId ||
            economic.providerAccountId !== normalized.providerAccount.providerAccountId ||
            economic.providerIdentityVersion !== normalized.providerAccount.identityVersion
          ) {
            fail("economic_payment_conflict");
          }
          const [session] = await transaction
            .select()
            .from(financeEconomicPaymentSessions)
            .where(eq(financeEconomicPaymentSessions.id, normalized.economicPaymentSessionId))
            .limit(1)
            .for("update");
          if (
            !session ||
            session.economicPaymentIntentId !== economic.id ||
            session.seriesId !== economic.seriesId ||
            session.providerAccountId !== economic.providerAccountId ||
            session.providerIdentityVersion !== economic.providerIdentityVersion ||
            ["captured", "declined", "failed", "expired", "voided"].includes(session.state)
          ) {
            fail("economic_payment_conflict");
          }

          const [operation] = await transaction
            .select()
            .from(financeProviderOperationIntents)
            .where(eq(financeProviderOperationIntents.id, normalized.providerOperationIntentId))
            .limit(1)
            .for("update");
          if (
            !operation ||
            !(
              (operation.operationKind === "saved_card_charge" && operation.status === "provider_unknown") ||
              (operation.operationKind === "saved_card_charge_3ds_method_complete" && operation.status === "pending_dispatch")
            ) ||
            revision(operation.version) !== normalized.expectedProviderOperationIntentVersion ||
            operation.purpose !== "platform_invoice" ||
            operation.sourceId !== invoice.id ||
            operation.economicPaymentIntentId !== economic.id ||
            operation.economicPaymentSessionId !== session.id ||
            operation.seriesId !== economic.seriesId ||
            operation.providerAccountId !== economic.providerAccountId ||
            operation.providerIdentityVersion !== economic.providerIdentityVersion
          ) {
            fail("provider_operation_conflict");
          }
          if (operation.operationKind === "saved_card_charge") {
            const [result] = await transaction
              .select()
              .from(financeProviderOperationResults)
              .where(
                and(
                  eq(financeProviderOperationResults.providerOperationIntentId, operation.id),
                  eq(financeProviderOperationResults.providerOperationIntentVersion, operation.version)
                )
              )
              .limit(1)
              .for("share");
            if (
              !result || result.outcome !== "ambiguous" ||
              result.providerPaymentId !== normalized.providerPaymentId ||
              result.evidenceArtifactId !== normalized.providerResponseArtifact.artifactId ||
              result.evidenceArtifactDigest !== normalized.providerResponseArtifact.sha256Digest
            ) fail("provider_result_conflict");
          } else if (normalized.actionType !== "three_ds_challenge") {
            // ArcPay Method can yield a browser challenge but never another Method handoff.
            fail("provider_operation_conflict");
          }
          const [artifact] = await transaction
            .select()
            .from(financeArtifacts)
            .where(eq(financeArtifacts.id, normalized.providerResponseArtifact.artifactId))
            .limit(1)
            .for("share");
          if (
            !artifact ||
            artifact.artifactClass !== (
              operation.operationKind === "saved_card_charge"
                ? "provider_canonical_read"
                : "provider_response"
            ) ||
            artifact.bindingKind !== "provider" ||
            artifact.sha256Digest !== normalized.providerResponseArtifact.sha256Digest ||
            artifact.byteLength !== String(normalized.providerResponseArtifact.byteLength) ||
            artifact.seriesId !== economic.seriesId ||
            artifact.providerAccountId !== economic.providerAccountId ||
            artifact.providerIdentityVersion !== economic.providerIdentityVersion
          ) {
            fail("response_artifact_conflict");
          }

          const nextOperationVersion = normalized.expectedProviderOperationIntentVersion + 1;
          const nextInvoiceVersion = normalized.expectedInvoiceVersion + 1;
          const [action] = await transaction
            .insert(financePlatformTariffInvoiceCustomerActions)
            .values({
              invoiceId: invoice.id,
              invoiceVersion: String(nextInvoiceVersion),
              economicPaymentIntentId: economic.id,
              economicPaymentSessionId: session.id,
              providerOperationIntentId: operation.id,
              providerOperationIntentVersion: String(nextOperationVersion),
              providerPaymentId: normalized.providerPaymentId,
              providerResponseArtifactId: artifact.id,
              providerResponseArtifactDigest: artifact.sha256Digest,
              actionType: normalized.actionType,
              phase: normalized.phase,
              status: "pending"
            })
            .returning({ id: financePlatformTariffInvoiceCustomerActions.id });
          if (!action) fail("persistence_write_incomplete");

          const [updatedOperation] = await transaction
            .update(financeProviderOperationIntents)
            .set({
              status: "requires_customer_action",
              version: String(nextOperationVersion),
              providerUnknownObservedAt: null,
              terminalAt: null
            })
            .where(
              and(
                eq(financeProviderOperationIntents.id, operation.id),
                eq(financeProviderOperationIntents.status, operation.status),
                eq(financeProviderOperationIntents.version, operation.version)
              )
            )
            .returning({ id: financeProviderOperationIntents.id });
          if (!updatedOperation) fail("provider_operation_conflict");

          const [updatedInvoice] = await transaction
            .update(platformTariffInvoices)
            .set({ state: "requires_customer_action", version: nextInvoiceVersion })
            .where(
              and(
                eq(platformTariffInvoices.id, invoice.id),
                eq(platformTariffInvoices.state, "payment_pending"),
                eq(platformTariffInvoices.version, invoice.version)
              )
            )
            .returning({ id: platformTariffInvoices.id });
          if (!updatedInvoice) fail("invoice_not_actionable");
          return Object.freeze({
            kind: "platform_tariff_invoice_customer_action_commit_receipt" as const,
            customerActionId: action.id,
            invoiceId: invoice.id,
            invoiceVersion: nextInvoiceVersion,
            providerOperationIntentId: operation.id,
            providerOperationIntentVersion: nextOperationVersion,
            actionType: normalized.actionType
          });
        });
      } catch (error) {
        if (error instanceof PlatformTariffInvoiceCustomerActionPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("customer_action_conflict");
        if (code === "23503" || code === "23514") fail("persistence_write_incomplete");
        throw error;
      }
    }
  } satisfies PlatformTariffInvoiceCustomerActionUnitOfWork);
}

type Command = Parameters<PlatformTariffInvoiceCustomerActionUnitOfWork["recordCustomerAction"]>[0];

function normalize(value: Command): Command {
  if (
    !identifier(value.invoiceId) ||
    !identifier(value.economicPaymentIntentId) ||
    !identifier(value.economicPaymentSessionId) ||
    !identifier(value.providerOperationIntentId) ||
    !identifier(value.providerPaymentId) ||
    !positive(value.expectedInvoiceVersion) ||
    !positive(value.expectedEconomicPaymentVersion) ||
    !nonNegative(value.expectedProviderOperationIntentVersion) ||
    !identifier(value.providerAccount.seriesId) ||
    !identifier(value.providerAccount.providerAccountId) ||
    !positive(value.providerAccount.identityVersion) ||
    !identifier(value.providerResponseArtifact.artifactId) ||
    !/^sha256:[a-f0-9]{64}$/.test(value.providerResponseArtifact.sha256Digest) ||
    !positive(value.providerResponseArtifact.byteLength) ||
    (value.actionType !== "three_ds_method" && value.actionType !== "three_ds_challenge") ||
    (value.phase !== "method" && value.phase !== "challenge") ||
    (value.actionType === "three_ds_method" && value.phase !== "method") ||
    (value.actionType === "three_ds_challenge" && value.phase !== "challenge")
  ) {
    fail("invalid_command");
  }
  return value;
}

function revision(value: unknown): number {
  try {
    const parsed = Number(decodeFinancePositiveRevision(value));
    if (!Number.isSafeInteger(parsed)) throw new Error();
    return parsed;
  } catch {
    fail("persistence_write_incomplete");
  }
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 160 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}
function positive(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 1; }
function nonNegative(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function postgresCode(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 6; depth += 1) {
    if (typeof current !== "object" || current === null) return undefined;
    const record = current as Readonly<{ code?: unknown; cause?: unknown }>;
    if (typeof record.code === "string") return record.code;
    current = record.cause;
  }
  return undefined;
}
function fail(reason: PlatformTariffInvoiceCustomerActionPersistenceReason): never {
  throw new PlatformTariffInvoiceCustomerActionPersistenceError(reason);
}
