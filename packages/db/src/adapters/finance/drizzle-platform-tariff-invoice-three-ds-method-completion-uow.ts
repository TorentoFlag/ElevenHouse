/* eslint-disable no-control-regex -- Persistence boundary validation intentionally rejects ASCII control characters. */
import {
  createProviderDispatchEnvelope,
  digestFinanceCanonicalValueV1,
  type CompletePlatformTariffInvoiceThreeDsMethodCommand,
  type PlatformTariffInvoiceThreeDsMethodCompletionUnitOfWork
} from "@elevenhouse/domain/finance-core";
import { and, eq, isNull, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  financeEconomicPaymentIntents,
  financeEconomicPaymentSessions
} from "../../schema/finance/economic-payments.schema";
import { financePlatformTariffInvoiceCustomerActions } from "../../schema/finance/platform-tariff-invoice-customer-actions.schema";
import { financeTransientSecretRefs } from "../../schema/finance/provider-credentials.schema";
import { financeProviderOperationIntents } from "../../schema/finance/provider-operations.schema";
import { platformTariffInvoices } from "../../schema/platform-billing/tariff-authority.schema";
import { registerSealedArtifactInTransaction } from "./finance-artifact-registry";
import { persistProviderOperationBeforeIoInTransaction } from "./drizzle-provider-operation-intent-creation-uow";
import { decodeFinancePositiveRevision } from "./finance-row-codecs";

export type PlatformTariffInvoiceThreeDsMethodCompletionPersistenceReason =
  | "invalid_command"
  | "invoice_not_awaiting_method"
  | "customer_action_conflict"
  | "provider_operation_conflict"
  | "economic_payment_conflict"
  | "three_ds_context_not_available"
  | "dispatch_artifact_conflict"
  | "retryable_concurrency_conflict";

export class PlatformTariffInvoiceThreeDsMethodCompletionPersistenceError extends Error {
  readonly code = "platform_tariff_invoice_three_ds_method_completion_persistence_error" as const;

  constructor(readonly reason: PlatformTariffInvoiceThreeDsMethodCompletionPersistenceReason) {
    super("Platform tariff invoice 3DS Method completion could not be committed safely");
  }
}

/**
 * A 3DS Method completion continues the existing provider payment. It locks and consumes the
 * exact pending action, seals the *current* browser context, and writes one outbox operation
 * before any ArcPay I/O. It neither charges a card nor creates a second economic session.
 */
export function createDrizzlePlatformTariffInvoiceThreeDsMethodCompletionUnitOfWork(input: Readonly<{
  database: ElevenHouseDatabase;
}>): PlatformTariffInvoiceThreeDsMethodCompletionUnitOfWork {
  return Object.freeze({
    async completeThreeDsMethod(command) {
      const normalized = normalize(command);
      try {
        return await input.database.transaction(async (transaction) => {
          const [invoice] = await transaction.select().from(platformTariffInvoices)
            .where(eq(platformTariffInvoices.id, normalized.invoiceId)).limit(1).for("update");
          if (!invoice || invoice.state !== "requires_customer_action" || invoice.version !== normalized.expectedInvoiceVersion) {
            fail("invoice_not_awaiting_method");
          }

          const [action] = await transaction.select().from(financePlatformTariffInvoiceCustomerActions)
            .where(and(
              eq(financePlatformTariffInvoiceCustomerActions.id, normalized.customerActionId),
              eq(financePlatformTariffInvoiceCustomerActions.invoiceId, invoice.id)
            )).limit(1).for("update");
          if (
            !action || action.status !== "pending" || action.actionType !== "three_ds_method" ||
            action.phase !== "method" || action.invoiceVersion !== String(invoice.version) ||
            action.threeDsMethodContextSecretRefId !== null
          ) fail("customer_action_conflict");

          const [priorOperation] = await transaction.select().from(financeProviderOperationIntents)
            .where(eq(financeProviderOperationIntents.id, action.providerOperationIntentId)).limit(1).for("update");
          if (
            !priorOperation || priorOperation.status !== "requires_customer_action" ||
            priorOperation.version !== action.providerOperationIntentVersion ||
            priorOperation.operationKind !== "saved_card_charge" || priorOperation.dispatchStep !== null ||
            priorOperation.purpose !== "platform_invoice" || priorOperation.sourceId !== invoice.id ||
            priorOperation.economicPaymentIntentId !== action.economicPaymentIntentId ||
            priorOperation.economicPaymentSessionId !== action.economicPaymentSessionId
          ) fail("provider_operation_conflict");

          const [economic] = await transaction.select().from(financeEconomicPaymentIntents)
            .where(eq(financeEconomicPaymentIntents.id, action.economicPaymentIntentId)).limit(1).for("share");
          const economicVersion = economic ? revisionNumber(economic.version) : null;
          if (
            !economic || economicVersion === null || economic.purpose !== "platform_invoice" ||
            economic.sourceId !== invoice.id || economic.amountMinor !== String(invoice.amountMinor) ||
            economic.currency !== invoice.currency || economic.seriesId !== priorOperation.seriesId ||
            economic.providerAccountId !== priorOperation.providerAccountId ||
            economic.providerIdentityVersion !== priorOperation.providerIdentityVersion
          ) fail("economic_payment_conflict");
          const [session] = await transaction.select().from(financeEconomicPaymentSessions)
            .where(eq(financeEconomicPaymentSessions.id, action.economicPaymentSessionId)).limit(1).for("share");
          if (
            !session || session.economicPaymentIntentId !== economic.id || session.seriesId !== economic.seriesId ||
            session.providerAccountId !== economic.providerAccountId ||
            session.providerIdentityVersion !== economic.providerIdentityVersion ||
            ["captured", "declined", "failed", "expired", "voided"].includes(session.state)
          ) fail("economic_payment_conflict");

          const databaseNow = new Date();
          const contextExpiresAt = new Date(normalized.sealedThreeDsMethodContext.providerExpiresAt);
          if (Number.isNaN(contextExpiresAt.getTime()) || contextExpiresAt.getTime() <= databaseNow.getTime()) {
            fail("three_ds_context_not_available");
          }
          const insertedContext = await transaction.insert(financeTransientSecretRefs).values({
            secretRefId: normalized.threeDsMethodContextSecretRefId,
            seriesId: priorOperation.seriesId,
            providerAccountId: priorOperation.providerAccountId,
            providerIdentityVersion: priorOperation.providerIdentityVersion,
            providerSetupId: action.providerPaymentId,
            sealedSecretRef: normalized.sealedThreeDsMethodContext.secretRef,
            providerExpiresAt: contextExpiresAt
          }).returning({ secretRefId: financeTransientSecretRefs.secretRefId });
          if (insertedContext.length !== 1 || insertedContext[0]?.secretRefId !== normalized.threeDsMethodContextSecretRefId) {
            fail("three_ds_context_not_available");
          }

          const envelope = createProviderDispatchEnvelope({
            kind: "saved_card_charge_3ds_method",
            providerPaymentId: action.providerPaymentId,
            invoiceId: invoice.id,
            customerActionId: action.id,
            completionIndicator: normalized.completionIndicator,
            threeDsMethodContextSecret: normalized.sealedThreeDsMethodContext
          });
          if (envelope.kind !== "saved_card_charge_3ds_method") fail("dispatch_artifact_conflict");
          const artifact = await registerSealedArtifactInTransaction(transaction as never, {
            artifact: normalized.dispatchArtifact,
            artifactClass: "provider_request",
            binding: { kind: "provider", providerAccount: {
              seriesId: priorOperation.seriesId,
              providerAccountId: priorOperation.providerAccountId,
              identityVersion: priorOperation.providerIdentityVersion
            } },
            contentType: normalized.dispatchPrivateObject.contentType,
            privateObject: normalized.dispatchPrivateObject,
            retentionPolicyId: normalized.retentionPolicyId,
            retentionPolicyVersion: normalized.retentionPolicyVersion
          });
          if ("bankCashPoolId" in artifact || artifact.sha256Digest !== digestFinanceCanonicalValueV1(envelope)) {
            fail("dispatch_artifact_conflict");
          }

          const authorizationCore = {
            invoiceId: invoice.id,
            invoiceVersion: invoice.version,
            subscriptionId: invoice.subscriptionId,
            customerActionId: action.id,
            customerActionResponseDigest: action.providerResponseArtifactDigest,
            providerPaymentId: action.providerPaymentId,
            completionIndicator: normalized.completionIndicator,
            contextSecretRefId: normalized.threeDsMethodContextSecretRefId
          };
          const receipt = await persistProviderOperationBeforeIoInTransaction(transaction, {
            providerOperationIntentId: normalized.providerOperationIntentId,
            economicPaymentIntentId: economic.id,
            expectedEconomicPaymentVersion: economicVersion,
            expectedProviderOperationSourceVersion: 0,
            economicPaymentSessionId: session.id,
            providerAccount: {
              seriesId: priorOperation.seriesId,
              providerAccountId: priorOperation.providerAccountId,
              identityVersion: priorOperation.providerIdentityVersion
            },
            operationKind: "saved_card_charge_3ds_method_complete",
            dispatchEnvelope: envelope,
            dispatchAuthorization: {
              kind: "platform_invoice_3ds_method_authorization",
              authorityId: `platform-invoice-method:${invoice.id}:${action.id}`,
              authorityVersion: "1",
              authorityDigest: digestFinanceCanonicalValueV1(authorizationCore),
              sourceId: invoice.id,
              ...authorizationCore
            } as never,
            dispatchArtifact: artifact,
            replacementAuthority: null,
            idempotencyKey: normalized.idempotencyKey,
            idempotencyRetentionDeadline: normalized.idempotencyRetentionDeadline,
            operationEnvelope: normalized.operationEnvelope
          });

          const [resolvedAction] = await transaction.update(financePlatformTariffInvoiceCustomerActions)
            .set({ status: "completed", threeDsMethodContextSecretRefId: normalized.threeDsMethodContextSecretRefId, resolvedAt: sql`clock_timestamp()` })
            .where(and(
              eq(financePlatformTariffInvoiceCustomerActions.id, action.id),
              eq(financePlatformTariffInvoiceCustomerActions.status, "pending"),
              isNull(financePlatformTariffInvoiceCustomerActions.threeDsMethodContextSecretRefId)
            )).returning({ id: financePlatformTariffInvoiceCustomerActions.id });
          if (!resolvedAction) fail("customer_action_conflict");
          const [updatedInvoice] = await transaction.update(platformTariffInvoices)
            .set({ state: "payment_pending", version: invoice.version + 1 })
            .where(and(
              eq(platformTariffInvoices.id, invoice.id),
              eq(platformTariffInvoices.state, "requires_customer_action"),
              eq(platformTariffInvoices.version, invoice.version)
            )).returning({ id: platformTariffInvoices.id });
          if (!updatedInvoice) fail("invoice_not_awaiting_method");
          return receipt;
        });
      } catch (error) {
        if (error instanceof PlatformTariffInvoiceThreeDsMethodCompletionPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("customer_action_conflict");
        throw error;
      }
    }
  } satisfies PlatformTariffInvoiceThreeDsMethodCompletionUnitOfWork);
}

type Command = CompletePlatformTariffInvoiceThreeDsMethodCommand;

function normalize(value: Command): Command {
  if (
    !identifier(value.invoiceId) || !positive(value.expectedInvoiceVersion) || !uuid(value.customerActionId) ||
    (value.completionIndicator !== "Y" && value.completionIndicator !== "N" && value.completionIndicator !== "U") ||
    !uuid(value.providerOperationIntentId) || !identifier(value.threeDsMethodContextSecretRefId) ||
    !sealedSecret(value.sealedThreeDsMethodContext) || !idempotency(value.idempotencyKey) ||
    !instant(value.idempotencyRetentionDeadline) || !identifier(value.dispatchArtifact.artifactId) ||
    !/^sha256:[a-f0-9]{64}$/.test(value.dispatchArtifact.sha256Digest) || !positive(value.dispatchArtifact.byteLength) ||
    !identifier(value.retentionPolicyId) || !identifier(value.retentionPolicyVersion)
  ) fail("invalid_command");
  return value;
}

function revisionNumber(value: string): number | null {
  try {
    const parsed = Number(decodeFinancePositiveRevision(value));
    return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
  } catch {
    return null;
  }
}
function uuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function identifier(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 160 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value); }
function positive(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 1; }
function instant(value: unknown): value is string { return typeof value === "string" && !Number.isNaN(Date.parse(value)); }
function idempotency(value: unknown): value is string { return identifier(value) && value.length >= 8 && /^[A-Za-z0-9._:-]+$/.test(value); }
function sealedSecret(value: Command["sealedThreeDsMethodContext"]): boolean {
  return value.kind === "sealed_one_time_provider_secret_ref" && identifier(value.secretRef) && instant(value.providerExpiresAt) && value.providerConsumption === "one_time";
}
function postgresCode(error: unknown): string | null { return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : null; }
function fail(reason: PlatformTariffInvoiceThreeDsMethodCompletionPersistenceReason): never { throw new PlatformTariffInvoiceThreeDsMethodCompletionPersistenceError(reason); }
