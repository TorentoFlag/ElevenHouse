import { describe, expect, expectTypeOf, it } from "vitest";

import {
  FINANCE_ECONOMIC_PAYMENT_CAPTURE_APPLIED_EVENT,
  FINANCE_PLATFORM_TARIFF_INVOICE_CHARGE_PREPARATION_REQUESTED_EVENT,
  FINANCE_PROVIDER_OPERATION_DISPATCH_REQUESTED_EVENT,
  FINANCE_SAVED_CARD_SETUP_PREPARATION_REQUESTED_EVENT,
  createFinanceEconomicPaymentCaptureAppliedPayload,
  createFinancePlatformTariffInvoiceChargePreparationRequestedPayload,
  createFinanceProviderOperationDispatchRequestedPayload,
  createFinanceSavedCardSetupPreparationRequestedPayload,
  type FinanceEconomicPaymentCaptureAppliedPayload,
  type FinancePlatformTariffInvoiceChargePreparationRequestedPayload,
  type FinanceProviderOperationDispatchRequestedPayload,
  type FinanceSavedCardSetupPreparationRequestedPayload
} from "./finance-outbox-events";

describe("finance provider dispatch outbox contract", () => {
  it("contains only the durable provider operation ID", () => {
    expect(FINANCE_PROVIDER_OPERATION_DISPATCH_REQUESTED_EVENT).toBe(
      "finance.provider_operation.dispatch_requested"
    );
    expect(
      createFinanceProviderOperationDispatchRequestedPayload({
        providerOperationIntentId: "98d6f782-725d-497d-a4ef-6ddfa3f6920a"
      })
    ).toEqual({ providerOperationIntentId: "98d6f782-725d-497d-a4ef-6ddfa3f6920a" });
    expectTypeOf<
      keyof FinanceProviderOperationDispatchRequestedPayload
    >().toEqualTypeOf<"providerOperationIntentId">();
  });

  it.each([
    {},
    { providerOperationIntentId: "not-a-uuid" },
    {
      providerOperationIntentId: "98d6f782-725d-497d-a4ef-6ddfa3f6920a",
      canonicalRequest: { amount: 1 }
    }
  ])("rejects a non-ID or expanded queue payload", (input) => {
    expect(() => createFinanceProviderOperationDispatchRequestedPayload(input)).toThrow(
      "Finance provider dispatch outbox payload is invalid"
    );
  });
});

describe("finance capture-applied outbox contract", () => {
  it("contains only the durable cross-contour capture receipt ID", () => {
    expect(FINANCE_ECONOMIC_PAYMENT_CAPTURE_APPLIED_EVENT).toBe(
      "finance.economic_payment.capture_applied"
    );
    expect(
      createFinanceEconomicPaymentCaptureAppliedPayload({
        captureApplicationReceiptId: "1581785f-a4fd-4d06-9b9e-e172ab6a1b70"
      })
    ).toEqual({
      captureApplicationReceiptId: "1581785f-a4fd-4d06-9b9e-e172ab6a1b70"
    });
    expectTypeOf<
      keyof FinanceEconomicPaymentCaptureAppliedPayload
    >().toEqualTypeOf<"captureApplicationReceiptId">();
  });

  it.each([
    {},
    { captureApplicationReceiptId: "not-a-uuid" },
    {
      captureApplicationReceiptId: "1581785f-a4fd-4d06-9b9e-e172ab6a1b70",
      amountMinor: "10000"
    }
  ])("rejects a non-ID or expanded capture payload", (input) => {
    expect(() => createFinanceEconomicPaymentCaptureAppliedPayload(input)).toThrow(
      "Finance economic payment capture outbox payload is invalid"
    );
  });
});

describe("saved-card setup preparation outbox contract", () => {
  it("contains only the durable setup-session ID", () => {
    expect(FINANCE_SAVED_CARD_SETUP_PREPARATION_REQUESTED_EVENT).toBe(
      "finance.saved_card_setup.preparation_requested"
    );
    expect(createFinanceSavedCardSetupPreparationRequestedPayload({
      setupSessionId: "6cbf64fe-633c-4fb0-af8d-d996b9976453"
    })).toEqual({ setupSessionId: "6cbf64fe-633c-4fb0-af8d-d996b9976453" });
    expectTypeOf<keyof FinanceSavedCardSetupPreparationRequestedPayload>()
      .toEqualTypeOf<"setupSessionId">();
  });

  it("rejects expanded or malformed setup preparation payloads", () => {
    expect(() => createFinanceSavedCardSetupPreparationRequestedPayload({
      setupSessionId: "not-a-uuid"
    })).toThrow("Finance saved-card setup preparation outbox payload is invalid");
    expect(() => createFinanceSavedCardSetupPreparationRequestedPayload({
      setupSessionId: "6cbf64fe-633c-4fb0-af8d-d996b9976453",
      amountMinor: 0
    })).toThrow("Finance saved-card setup preparation outbox payload is invalid");
  });
});

describe("initial tariff-invoice charge preparation outbox contract", () => {
  it("contains only the UUID preparation-request ID", () => {
    expect(FINANCE_PLATFORM_TARIFF_INVOICE_CHARGE_PREPARATION_REQUESTED_EVENT).toBe(
      "finance.platform_tariff_invoice_charge.preparation_requested"
    );
    expect(createFinancePlatformTariffInvoiceChargePreparationRequestedPayload({
      preparationRequestId: "b14b1c5b-37bc-41b5-bcb4-31f0b8565614"
    })).toEqual({ preparationRequestId: "b14b1c5b-37bc-41b5-bcb4-31f0b8565614" });
    expectTypeOf<keyof FinancePlatformTariffInvoiceChargePreparationRequestedPayload>()
      .toEqualTypeOf<"preparationRequestId">();
  });

  it("rejects an expanded or malformed charge-preparation payload", () => {
    expect(() => createFinancePlatformTariffInvoiceChargePreparationRequestedPayload({
      preparationRequestId: "not-a-uuid"
    })).toThrow("Finance platform tariff invoice charge preparation payload is invalid");
    expect(() => createFinancePlatformTariffInvoiceChargePreparationRequestedPayload({
      preparationRequestId: "b14b1c5b-37bc-41b5-bcb4-31f0b8565614",
      amountMinor: "100"
    })).toThrow("Finance platform tariff invoice charge preparation payload is invalid");
  });
});
