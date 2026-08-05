/* eslint-disable no-control-regex -- Persistence boundary validation intentionally rejects ASCII control characters. */
import type {
  PlatformTariffInvoiceCustomerActionForOwner,
  PlatformTariffInvoiceCustomerActionReaderPort,
  PlatformTariffInvoicePaymentForOwner
} from "@elevenhouse/domain/finance-core";
import { and, eq, inArray } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { financeArtifacts } from "../../schema/finance/finance-artifacts.schema";
import { financePlatformTariffInvoiceCustomerActions } from "../../schema/finance/platform-tariff-invoice-customer-actions.schema";
import { financeProviderOperationIntents } from "../../schema/finance/provider-operations.schema";
import { platformTariffInvoices } from "../../schema/platform-billing/tariff-authority.schema";

/**
 * Reads only a pending action bound to its owner, invoice version and exact provider operation.
 * The protected provider payload remains in private storage and is never returned by this port.
 */
export function createDrizzlePlatformTariffInvoiceCustomerActionReader(
  database: ElevenHouseDatabase
): PlatformTariffInvoiceCustomerActionReaderPort {
  return Object.freeze({
    async findInvoiceForOwner(input) {
      if (!identifier(input.invoiceId) || !uuid(input.ownerUserId)) return null;
      const [invoice] = await database
        .select()
        .from(platformTariffInvoices)
        .where(eq(platformTariffInvoices.id, input.invoiceId))
        .limit(1);
      if (!invoice || invoice.ownerUserId !== input.ownerUserId) return null;
      return mapInvoice(invoice);
    },
    async findCurrentActionableInvoiceForSubscriptionOwner(input) {
      if (!uuid(input.subscriptionId) || !uuid(input.ownerUserId)) return null;
      const [invoice] = await database
        .select()
        .from(platformTariffInvoices)
        .where(and(
          eq(platformTariffInvoices.subscriptionId, input.subscriptionId),
          eq(platformTariffInvoices.ownerUserId, input.ownerUserId),
          inArray(platformTariffInvoices.state, [
            "open",
            "payment_pending",
            "requires_customer_action",
            "provider_unknown"
          ])
        ))
        .limit(1);
      return invoice ? mapInvoice(invoice) : null;
    },
    async findPendingForOwner(input) {
      if (!identifier(input.invoiceId) || !uuid(input.ownerUserId)) return null;
      const [row] = await database
        .select({
          invoice: platformTariffInvoices,
          action: financePlatformTariffInvoiceCustomerActions,
          operation: financeProviderOperationIntents,
          artifact: financeArtifacts
        })
        .from(financePlatformTariffInvoiceCustomerActions)
        .innerJoin(
          platformTariffInvoices,
          eq(platformTariffInvoices.id, financePlatformTariffInvoiceCustomerActions.invoiceId)
        )
        .innerJoin(
          financeProviderOperationIntents,
          eq(
            financeProviderOperationIntents.id,
            financePlatformTariffInvoiceCustomerActions.providerOperationIntentId
          )
        )
        .innerJoin(
          financeArtifacts,
          eq(financeArtifacts.id, financePlatformTariffInvoiceCustomerActions.providerResponseArtifactId)
        )
        .where(and(
          eq(financePlatformTariffInvoiceCustomerActions.invoiceId, input.invoiceId),
          eq(financePlatformTariffInvoiceCustomerActions.status, "pending")
        ))
        .limit(1);
      if (!row || row.invoice.ownerUserId !== input.ownerUserId) return null;
      return mapPlatformTariffInvoiceCustomerActionForOwner(row);
    }
  } satisfies PlatformTariffInvoiceCustomerActionReaderPort);
}

function mapInvoice(
  invoice: typeof platformTariffInvoices.$inferSelect
): PlatformTariffInvoicePaymentForOwner | null {
  if (
    !identifier(invoice.id) ||
    !uuid(invoice.subscriptionId) ||
    !uuid(invoice.ownerUserId) ||
    !Number.isSafeInteger(invoice.version) || invoice.version < 1 ||
    !["open", "payment_pending", "requires_customer_action", "captured", "declined", "failed", "provider_unknown", "void", "uncollectible"].includes(invoice.state)
  ) return null;
  return Object.freeze({
    invoiceId: invoice.id,
    subscriptionId: invoice.subscriptionId,
    ownerUserId: invoice.ownerUserId,
    invoiceVersion: invoice.version,
    state: invoice.state as "open" | "payment_pending" | "requires_customer_action" | "captured" | "declined" | "failed" | "provider_unknown" | "void" | "uncollectible"
  });
}

export function mapPlatformTariffInvoiceCustomerActionForOwner(row: Readonly<{
  invoice: typeof platformTariffInvoices.$inferSelect;
  action: typeof financePlatformTariffInvoiceCustomerActions.$inferSelect;
  operation: typeof financeProviderOperationIntents.$inferSelect;
  artifact: typeof financeArtifacts.$inferSelect;
}>): PlatformTariffInvoiceCustomerActionForOwner | null {
  const { invoice, action, operation, artifact } = row;
  const artifactByteLength = Number(artifact.byteLength);
  if (
    invoice.state !== "requires_customer_action" ||
    invoice.version < 1 ||
    action.status !== "pending" ||
    action.invoiceId !== invoice.id ||
    action.invoiceVersion !== String(invoice.version) ||
    action.providerOperationIntentId !== operation.id ||
    action.providerOperationIntentVersion !== operation.version ||
    operation.status !== "requires_customer_action" ||
    operation.purpose !== "platform_invoice" ||
    operation.operationKind !== "saved_card_charge" ||
    operation.sourceId !== invoice.id ||
    operation.economicPaymentIntentId !== action.economicPaymentIntentId ||
    operation.economicPaymentSessionId !== action.economicPaymentSessionId ||
    artifact.artifactClass !== "provider_canonical_read" ||
    artifact.bindingKind !== "provider" ||
    artifact.id !== action.providerResponseArtifactId ||
    artifact.sha256Digest !== action.providerResponseArtifactDigest ||
    artifact.seriesId !== operation.seriesId ||
    artifact.providerAccountId !== operation.providerAccountId ||
    artifact.providerIdentityVersion !== operation.providerIdentityVersion ||
    !uuid(action.id) || !uuid(action.providerPaymentId) ||
    !/^sha256:[a-f0-9]{64}$/.test(artifact.sha256Digest) ||
    !Number.isSafeInteger(artifactByteLength) || artifactByteLength < 1 ||
    (action.actionType !== "three_ds_method" && action.actionType !== "three_ds_challenge") ||
    (action.phase !== "method" && action.phase !== "challenge")
  ) return null;
  return Object.freeze({
    invoiceId: invoice.id,
    invoiceVersion: invoice.version,
    subscriptionId: invoice.subscriptionId,
    ownerUserId: invoice.ownerUserId,
    customerActionId: action.id,
    providerPaymentId: action.providerPaymentId,
    providerAccount: Object.freeze({
      seriesId: operation.seriesId,
      providerAccountId: operation.providerAccountId,
      identityVersion: operation.providerIdentityVersion
    }),
    actionType: action.actionType,
    phase: action.phase,
    providerResponseArtifact: Object.freeze({
      artifactId: artifact.id,
      sha256Digest: artifact.sha256Digest as `sha256:${string}`,
      byteLength: artifactByteLength
    })
  });
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 160 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}
function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
