import {
  createPlatformTariffInvoiceCaptureMutation,
  type PlatformTariffInvoiceCanonicalCaptureUnitOfWork,
  type ProviderOperationResultCommitReceipt
} from "@elevenhouse/domain/finance-core";
import { eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { platformTariffInvoices } from "../../schema/platform-billing/tariff-authority.schema";
import { applyProviderOperationResultInTransaction } from "./drizzle-provider-operation-result-application-uow";
import { resolvePendingPlatformTariffInvoiceCustomerActionInTransaction } from "./drizzle-platform-tariff-invoice-customer-action-terminal-resolution";
import { applyVerifiedCaptureInTransaction } from "./drizzle-verified-capture-application-uow";

export class PlatformTariffInvoiceCanonicalCapturePersistenceError extends Error {
  readonly code = "PLATFORM_TARIFF_INVOICE_CANONICAL_CAPTURE_PERSISTENCE_ERROR" as const;

  constructor(readonly reason: "invoice_not_found" | "invoice_correlation_conflict") {
    super("Canonical platform tariff invoice capture could not be applied atomically");
  }
}

/**
 * The canonical ArcPay observation is the first durable evidence here. Provider-result, tariff
 * invoice/subscription transition and journal commit share one PostgreSQL transaction, preventing
 * a crash from creating an active payment result without the corresponding entitlement.
 */
export function createDrizzlePlatformTariffInvoiceCanonicalCaptureUnitOfWork(
  input: Readonly<{ database: ElevenHouseDatabase }>
): PlatformTariffInvoiceCanonicalCaptureUnitOfWork {
  return Object.freeze({
    async applyCanonicalCapture(command) {
      return input.database.transaction(async (transaction) => {
        const sourceId = command.providerResult.evidence.sourceId;
        const [invoice] = await transaction
          .select()
          .from(platformTariffInvoices)
          .where(eq(platformTariffInvoices.id, sourceId))
          .limit(1)
          .for("update");
        if (!invoice) fail("invoice_not_found");
        if (
          invoice.ownerUserId.length < 1 ||
          invoice.tariffSeriesId.length < 1 ||
          !Number.isSafeInteger(invoice.tariffVersion) ||
          invoice.tariffVersion < 1
        ) fail("invoice_correlation_conflict");

        await resolvePendingPlatformTariffInvoiceCustomerActionInTransaction(transaction, {
          invoiceId: invoice.id,
          providerOperationIntentId: command.providerResult.providerOperationIntentId,
          providerOperationIntentVersion: command.providerResult.expectedProviderOperationIntentVersion,
          terminalStatus: "completed"
        });

        const providerResult = await applyProviderOperationResultInTransaction(
          transaction,
          command.providerResult
        );
        if (!isSucceededMoneyResult(providerResult)) fail("invoice_correlation_conflict");
        const financialMutation = createPlatformTariffInvoiceCaptureMutation({
          invoice: {
            invoiceId: invoice.id,
            ownerUserId: invoice.ownerUserId,
            tariffSeriesId: invoice.tariffSeriesId,
            tariffVersion: invoice.tariffVersion
          },
          providerResult,
          capturedAt: command.capturedAt,
          postedAt: command.postedAt,
          operationEnvelope: command.providerResult.operationEnvelope
        });
        return applyVerifiedCaptureInTransaction(transaction, {
          economicPaymentIntentId: command.providerResult.economicPaymentIntentId,
          expectedEconomicPaymentVersion: command.providerResult.expectedEconomicPaymentVersion,
          providerOperationIntentId: command.providerResult.providerOperationIntentId,
          expectedProviderOperationIntentVersion: providerResult.providerOperationIntentVersion,
          financialMutation,
          providerResult,
          operationEnvelope: command.providerResult.operationEnvelope
        });
      });
    }
  } satisfies PlatformTariffInvoiceCanonicalCaptureUnitOfWork);
}

function isSucceededMoneyResult(
  value: ProviderOperationResultCommitReceipt
): value is ProviderOperationResultCommitReceipt & Readonly<{
  outcome: "succeeded";
  providerPaymentId: string;
  amountMinor: string;
  currency: "RUB";
}> {
  return (
    value.outcome === "succeeded" &&
    typeof value.providerPaymentId === "string" &&
    typeof value.amountMinor === "string" &&
    value.currency === "RUB"
  );
}

function fail(
  reason: PlatformTariffInvoiceCanonicalCapturePersistenceError["reason"]
): never {
  throw new PlatformTariffInvoiceCanonicalCapturePersistenceError(reason);
}
