import { and, eq, sql } from "drizzle-orm";

import type { FinanceTransaction } from "./drizzle-finance-command-store";
import { financePlatformTariffInvoiceCustomerActions } from "../../schema/finance/platform-tariff-invoice-customer-actions.schema";

/**
 * A canonical terminal provider outcome consumes any displayed 3DS action in the same database
 * transaction. This prevents an already-captured or refused invoice from retaining actionable
 * browser state.
 */
export async function resolvePendingPlatformTariffInvoiceCustomerActionInTransaction(
  transaction: FinanceTransaction,
  input: Readonly<{
    invoiceId: string;
    providerOperationIntentId: string;
    providerOperationIntentVersion: number;
    terminalStatus: "completed" | "expired";
  }>
): Promise<void> {
  const [action] = await transaction
    .select()
    .from(financePlatformTariffInvoiceCustomerActions)
    .where(
      and(
        eq(financePlatformTariffInvoiceCustomerActions.invoiceId, input.invoiceId),
        eq(financePlatformTariffInvoiceCustomerActions.status, "pending")
      )
    )
    .limit(1)
    .for("update");
  if (!action) return;
  if (
    action.providerOperationIntentId !== input.providerOperationIntentId ||
    action.providerOperationIntentVersion !== String(input.providerOperationIntentVersion)
  ) {
    throw new PlatformTariffInvoiceCustomerActionTerminalResolutionError(
      "customer_action_operation_conflict"
    );
  }
  const [updated] = await transaction
    .update(financePlatformTariffInvoiceCustomerActions)
    .set({ status: input.terminalStatus, resolvedAt: sql`clock_timestamp()` })
    .where(
      and(
        eq(financePlatformTariffInvoiceCustomerActions.id, action.id),
        eq(financePlatformTariffInvoiceCustomerActions.status, "pending")
      )
    )
    .returning({ id: financePlatformTariffInvoiceCustomerActions.id });
  if (!updated) {
    throw new PlatformTariffInvoiceCustomerActionTerminalResolutionError(
      "customer_action_concurrency_conflict"
    );
  }
}

export class PlatformTariffInvoiceCustomerActionTerminalResolutionError extends Error {
  readonly code = "platform_tariff_invoice_customer_action_terminal_resolution_error" as const;

  constructor(
    readonly reason: "customer_action_operation_conflict" | "customer_action_concurrency_conflict"
  ) {
    super("Platform tariff invoice customer action cannot be resolved safely");
    this.name = "PlatformTariffInvoiceCustomerActionTerminalResolutionError";
  }
}
