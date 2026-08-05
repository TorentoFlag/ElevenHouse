/* eslint-disable no-control-regex -- Persistence boundary validation intentionally rejects ASCII control characters. */
import {
  createProviderAccountIdentityBinding,
  type PlatformTariffInvoiceChargeTerminalReconciliationCandidate,
  type PlatformTariffInvoiceChargeTerminalReconciliationReaderPort
} from "@elevenhouse/domain/finance-core";
import { and, asc, eq, inArray } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { platformTariffInvoices } from "../../schema/platform-billing/tariff-authority.schema";
import { financeEconomicPaymentIntents } from "../../schema/finance/economic-payments.schema";
import {
  financeProviderOperationIntents,
  financeProviderOperationResults
} from "../../schema/finance/provider-operations.schema";
import { financePlatformTariffInvoiceCustomerActions } from "../../schema/finance/platform-tariff-invoice-customer-actions.schema";

export class PlatformTariffInvoiceChargeTerminalReconciliationReaderError extends Error {
  readonly code = "PLATFORM_TARIFF_INVOICE_CHARGE_TERMINAL_RECONCILIATION_READER_ERROR" as const;
  constructor(readonly reason: "invalid_input" | "persistence_failure") {
    super("Platform tariff invoice canonical reconciliation candidates could not be read safely");
  }
}

type CandidateRow = Readonly<{
  invoice: typeof platformTariffInvoices.$inferSelect;
  operation: typeof financeProviderOperationIntents.$inferSelect;
  economic: typeof financeEconomicPaymentIntents.$inferSelect;
  result: typeof financeProviderOperationResults.$inferSelect;
}>;

type RecordedActionCandidateRow = Readonly<{
  invoice: typeof platformTariffInvoices.$inferSelect;
  operation: typeof financeProviderOperationIntents.$inferSelect;
  economic: typeof financeEconomicPaymentIntents.$inferSelect;
  action: typeof financePlatformTariffInvoiceCustomerActions.$inferSelect;
}>;

/**
 * Finds only operations whose first provider observation was explicitly recorded as ambiguous.
 * `pending`/`timeout` retries must canonically poll this record, never issue a second MIT call.
 */
export function createDrizzlePlatformTariffInvoiceChargeTerminalReconciliationReader(
  database: ElevenHouseDatabase
): PlatformTariffInvoiceChargeTerminalReconciliationReaderPort {
  return Object.freeze({
    async listAwaitingCanonicalOutcome({ limit }) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail("invalid_input");
      try {
        const rows = await database
          .select({
            invoice: platformTariffInvoices,
            operation: financeProviderOperationIntents,
            economic: financeEconomicPaymentIntents,
            result: financeProviderOperationResults
          })
          .from(financeProviderOperationIntents)
          .innerJoin(
            financeProviderOperationResults,
            and(
              eq(financeProviderOperationResults.providerOperationIntentId, financeProviderOperationIntents.id),
              eq(financeProviderOperationResults.providerOperationIntentVersion, financeProviderOperationIntents.version)
            )
          )
          .innerJoin(
            financeEconomicPaymentIntents,
            eq(financeEconomicPaymentIntents.id, financeProviderOperationIntents.economicPaymentIntentId)
          )
          .innerJoin(
            platformTariffInvoices,
            eq(platformTariffInvoices.id, financeProviderOperationIntents.sourceId)
          )
          .where(and(
            eq(financeProviderOperationIntents.purpose, "platform_invoice"),
            inArray(financeProviderOperationIntents.operationKind, ["saved_card_charge", "saved_card_charge_3ds_method_complete"]),
            eq(financeProviderOperationIntents.status, "provider_unknown"),
            eq(financeProviderOperationResults.outcome, "ambiguous"),
            eq(platformTariffInvoices.state, "payment_pending")
          ))
          .orderBy(asc(financeProviderOperationIntents.providerUnknownObservedAt), asc(financeProviderOperationIntents.id))
          .limit(limit);
        const ambiguousCandidates = rows.flatMap((row) => {
          const candidate = mapPlatformTariffInvoiceChargeTerminalReconciliationCandidate(row);
          return candidate === null ? [] : [candidate];
        });
        if (ambiguousCandidates.length >= limit) return Object.freeze(ambiguousCandidates);

        const actionRows = await database
          .select({
            invoice: platformTariffInvoices,
            operation: financeProviderOperationIntents,
            economic: financeEconomicPaymentIntents,
            action: financePlatformTariffInvoiceCustomerActions
          })
          .from(financePlatformTariffInvoiceCustomerActions)
          .innerJoin(
            financeProviderOperationIntents,
            eq(
              financeProviderOperationIntents.id,
              financePlatformTariffInvoiceCustomerActions.providerOperationIntentId
            )
          )
          .innerJoin(
            financeEconomicPaymentIntents,
            eq(financeEconomicPaymentIntents.id, financeProviderOperationIntents.economicPaymentIntentId)
          )
          .innerJoin(
            platformTariffInvoices,
            eq(platformTariffInvoices.id, financePlatformTariffInvoiceCustomerActions.invoiceId)
          )
          .where(and(
            eq(financePlatformTariffInvoiceCustomerActions.status, "pending"),
            eq(financeProviderOperationIntents.purpose, "platform_invoice"),
            inArray(financeProviderOperationIntents.operationKind, ["saved_card_charge", "saved_card_charge_3ds_method_complete"]),
            eq(financeProviderOperationIntents.status, "requires_customer_action"),
            eq(platformTariffInvoices.state, "requires_customer_action")
          ))
          .orderBy(
            asc(financePlatformTariffInvoiceCustomerActions.createdAt),
            asc(financePlatformTariffInvoiceCustomerActions.id)
          )
          .limit(limit - ambiguousCandidates.length);
        return Object.freeze([
          ...ambiguousCandidates,
          ...actionRows.flatMap((row) => {
            const candidate = mapRecordedPlatformTariffInvoiceCustomerActionCandidate(row);
            return candidate === null ? [] : [candidate];
          })
        ]);
      } catch (error) {
        if (error instanceof PlatformTariffInvoiceChargeTerminalReconciliationReaderError) throw error;
        throw new PlatformTariffInvoiceChargeTerminalReconciliationReaderError("persistence_failure");
      }
    }
  } satisfies PlatformTariffInvoiceChargeTerminalReconciliationReaderPort);
}

/** A recorded action is polled for its same provider payment, never dispatched anew. */
export function mapRecordedPlatformTariffInvoiceCustomerActionCandidate(
  row: RecordedActionCandidateRow
): PlatformTariffInvoiceChargeTerminalReconciliationCandidate | null {
  try {
    const { invoice, operation, economic, action } = row;
    const invoiceVersion = revision(String(invoice.version), false);
    const operationVersion = revision(operation.version, true);
    const economicVersion = revision(economic.version, false);
    if (
      invoice.state !== "requires_customer_action" || invoice.currency !== "RUB" || invoice.amountMinor <= 0 ||
      operation.status !== "requires_customer_action" || operation.purpose !== "platform_invoice" ||
      (operation.operationKind !== "saved_card_charge" && operation.operationKind !== "saved_card_charge_3ds_method_complete") ||
      operation.sourceId !== invoice.id || operation.economicPaymentIntentId !== economic.id || operation.economicPaymentSessionId === null ||
      economic.purpose !== "platform_invoice" || economic.sourceId !== invoice.id || economic.currency !== "RUB" || economic.amountMinor !== String(invoice.amountMinor) ||
      economic.seriesId !== operation.seriesId || economic.providerAccountId !== operation.providerAccountId || economic.providerIdentityVersion !== operation.providerIdentityVersion ||
      action.status !== "pending" || action.invoiceId !== invoice.id || revision(action.invoiceVersion, false) !== invoiceVersion ||
      action.economicPaymentIntentId !== economic.id || action.economicPaymentSessionId !== operation.economicPaymentSessionId ||
      action.providerOperationIntentId !== operation.id || revision(action.providerOperationIntentVersion, false) !== operationVersion ||
      (action.actionType !== "three_ds_method" && action.actionType !== "three_ds_challenge") ||
      (action.phase !== "method" && action.phase !== "challenge") ||
      !uuid(operation.id) || !uuid(operation.economicPaymentSessionId) || !uuid(action.providerPaymentId) ||
      !digest(operation.canonicalRequestDigest) || !identifier(operation.idempotencyKey) ||
      !identifier(operation.operationPolicyId) || !integerAtLeastOne(operation.operationPolicyVersion) || !digest(operation.operationPolicyDigest) ||
      !integerAtLeastOne(operation.operationMaximumRows) || !integerAtLeastOne(operation.operationMaximumDecimalDigits) || !integerAtLeastOne(operation.operationMaximumArtifactBytes)
    ) return null;
    return Object.freeze({
      invoiceId: invoice.id,
      expectedInvoiceVersion: invoiceVersion,
      providerPaymentId: action.providerPaymentId,
      customerActionState: "recorded" as const,
      providerOperation: Object.freeze({
        operationKind: operation.operationKind,
        economicPaymentIntentId: economic.id,
        expectedEconomicPaymentVersion: economicVersion,
        providerOperationIntentId: operation.id,
        expectedProviderOperationIntentVersion: operationVersion,
        economicPaymentSessionId: operation.economicPaymentSessionId,
        providerAccount: createProviderAccountIdentityBinding({
          seriesId: operation.seriesId,
          providerAccountId: operation.providerAccountId,
          identityVersion: operation.providerIdentityVersion
        }),
        canonicalRequestDigest: operation.canonicalRequestDigest as `sha256:${string}`,
        idempotencyKey: operation.idempotencyKey,
        operationEnvelope: Object.freeze({
          kind: "resolved_finance_operation_envelope" as const,
          policyId: operation.operationPolicyId,
          policyVersion: operation.operationPolicyVersion,
          policyDigest: operation.operationPolicyDigest as `sha256:${string}`,
          maximumRows: operation.operationMaximumRows,
          maximumDecimalDigits: operation.operationMaximumDecimalDigits,
          maximumArtifactBytes: operation.operationMaximumArtifactBytes
        }) as never
      })
    });
  } catch {
    return null;
  }
}

export function mapPlatformTariffInvoiceChargeTerminalReconciliationCandidate(
  row: CandidateRow
): PlatformTariffInvoiceChargeTerminalReconciliationCandidate | null {
  try {
    const { invoice, operation, economic, result } = row;
    const invoiceVersion = revision(String(invoice.version), false);
    const operationVersion = revision(operation.version, true);
    const economicVersion = revision(economic.version, false);
    if (
      invoice.state !== "payment_pending" || invoice.currency !== "RUB" || invoice.amountMinor <= 0 ||
      operation.status !== "provider_unknown" || operation.purpose !== "platform_invoice" ||
      (operation.operationKind !== "saved_card_charge" && operation.operationKind !== "saved_card_charge_3ds_method_complete") ||
      operation.sourceId !== invoice.id || operation.economicPaymentIntentId !== economic.id || operation.economicPaymentSessionId === null ||
      economic.purpose !== "platform_invoice" || economic.sourceId !== invoice.id || economic.currency !== "RUB" || economic.amountMinor !== String(invoice.amountMinor) ||
      economic.seriesId !== operation.seriesId || economic.providerAccountId !== operation.providerAccountId || economic.providerIdentityVersion !== operation.providerIdentityVersion ||
      result.providerOperationIntentId !== operation.id || revision(result.providerOperationIntentVersion, false) !== operationVersion ||
      revision(result.correlatedEconomicPaymentVersion, false) !== economicVersion || result.outcome !== "ambiguous" ||
      result.providerPaymentId === null || result.amountMinor !== null || result.currency !== null ||
      !uuid(operation.id) || !uuid(operation.economicPaymentSessionId) || !uuid(result.providerPaymentId) ||
      !digest(operation.canonicalRequestDigest) || !identifier(operation.idempotencyKey) ||
      !identifier(operation.operationPolicyId) || !integerAtLeastOne(operation.operationPolicyVersion) || !digest(operation.operationPolicyDigest) ||
      !integerAtLeastOne(operation.operationMaximumRows) || !integerAtLeastOne(operation.operationMaximumDecimalDigits) || !integerAtLeastOne(operation.operationMaximumArtifactBytes)
    ) return null;
    return Object.freeze({
      invoiceId: invoice.id,
      expectedInvoiceVersion: invoiceVersion,
      providerPaymentId: result.providerPaymentId,
      customerActionState: "not_recorded" as const,
      providerOperation: Object.freeze({
        operationKind: operation.operationKind,
        economicPaymentIntentId: economic.id,
        expectedEconomicPaymentVersion: economicVersion,
        providerOperationIntentId: operation.id,
        expectedProviderOperationIntentVersion: operationVersion,
        economicPaymentSessionId: operation.economicPaymentSessionId,
        providerAccount: createProviderAccountIdentityBinding({
          seriesId: operation.seriesId,
          providerAccountId: operation.providerAccountId,
          identityVersion: operation.providerIdentityVersion
        }),
        canonicalRequestDigest: operation.canonicalRequestDigest as `sha256:${string}`,
        idempotencyKey: operation.idempotencyKey,
        operationEnvelope: Object.freeze({
          kind: "resolved_finance_operation_envelope" as const,
          policyId: operation.operationPolicyId,
          policyVersion: operation.operationPolicyVersion,
          policyDigest: operation.operationPolicyDigest as `sha256:${string}`,
          maximumRows: operation.operationMaximumRows,
          maximumDecimalDigits: operation.operationMaximumDecimalDigits,
          maximumArtifactBytes: operation.operationMaximumArtifactBytes
        }) as never
      })
    });
  } catch {
    return null;
  }
}

function revision(value: unknown, zeroAllowed: boolean): number {
  if (typeof value !== "string" || !(zeroAllowed ? /^(0|[1-9][0-9]*)$/ : /^[1-9][0-9]*$/.test(value))) throw new Error("revision");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("revision");
  return parsed;
}
function integerAtLeastOne(value: unknown): boolean { return Number.isSafeInteger(value) && (value as number) >= 1; }
function digest(value: unknown): boolean { return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value); }
function identifier(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 160 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value); }
function uuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function fail(reason: PlatformTariffInvoiceChargeTerminalReconciliationReaderError["reason"]): never { throw new PlatformTariffInvoiceChargeTerminalReconciliationReaderError(reason); }
