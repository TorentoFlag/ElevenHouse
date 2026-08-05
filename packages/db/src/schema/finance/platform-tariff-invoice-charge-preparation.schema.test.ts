import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { financePlatformTariffInvoiceChargePreparationRequests } from "./platform-tariff-invoice-charge-preparation.schema";

describe("platform tariff invoice charge-preparation request schema", () => {
  it("gives the worker a UUID outbox aggregate without replacing the immutable invoice source ID", () => {
    expect(getTableName(financePlatformTariffInvoiceChargePreparationRequests)).toBe(
      "finance_platform_tariff_invoice_charge_preparation_requests"
    );
    expect(Object.keys(getTableColumns(financePlatformTariffInvoiceChargePreparationRequests))).toEqual([
      "id",
      "invoiceId",
      "subscriptionId",
      "attemptNumber",
      "expectedInvoiceVersion",
      "expectedSubscriptionVersion",
      "state",
      "version",
      "economicPaymentIntentId",
      "economicPaymentSessionId",
      "providerOperationIntentId",
      "createdAt",
      "updatedAt"
    ]);
    const config = getTableConfig(financePlatformTariffInvoiceChargePreparationRequests);
    expect(config.foreignKeys.map((key) => key.getName())).toEqual(expect.arrayContaining([
      "finance_platform_tariff_invoice_charge_preparation_invoice_fk",
      "finance_platform_tariff_invoice_charge_preparation_subscription_fk"
    ]));
    expect(config.checks.map((check) => check.name)).toContain(
      "finance_platform_tariff_invoice_charge_preparation_state_check"
    );
  });
});
