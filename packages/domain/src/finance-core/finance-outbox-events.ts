export const FINANCE_PROVIDER_OPERATION_DISPATCH_REQUESTED_EVENT =
  "finance.provider_operation.dispatch_requested" as const;
export const FINANCE_ECONOMIC_PAYMENT_CAPTURE_APPLIED_EVENT =
  "finance.economic_payment.capture_applied" as const;
export const FINANCE_SAVED_CARD_SETUP_PREPARATION_REQUESTED_EVENT =
  "finance.saved_card_setup.preparation_requested" as const;
export const FINANCE_PLATFORM_TARIFF_INVOICE_CHARGE_PREPARATION_REQUESTED_EVENT =
  "finance.platform_tariff_invoice_charge.preparation_requested" as const;

export type FinanceProviderOperationDispatchRequestedPayload = Readonly<{
  providerOperationIntentId: string;
}>;

export type FinanceEconomicPaymentCaptureAppliedPayload = Readonly<{
  captureApplicationReceiptId: string;
}>;

/** IDs-only handoff from consent/session creation to the payment worker's pre-I/O preparation. */
export type FinanceSavedCardSetupPreparationRequestedPayload = Readonly<{
  setupSessionId: string;
}>;

/** IDs-only handoff from the opened first invoice to worker-owned saved-card charge preparation. */
export type FinancePlatformTariffInvoiceChargePreparationRequestedPayload = Readonly<{
  preparationRequestId: string;
}>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class FinanceProviderOperationDispatchPayloadError extends Error {
  readonly code = "FINANCE_PROVIDER_OPERATION_DISPATCH_PAYLOAD_INVALID";

  constructor() {
    super("Finance provider dispatch outbox payload is invalid");
    this.name = "FinanceProviderOperationDispatchPayloadError";
  }
}

export class FinanceEconomicPaymentCapturePayloadError extends Error {
  readonly code = "FINANCE_ECONOMIC_PAYMENT_CAPTURE_PAYLOAD_INVALID";

  constructor() {
    super("Finance economic payment capture outbox payload is invalid");
    this.name = "FinanceEconomicPaymentCapturePayloadError";
  }
}

export class FinanceSavedCardSetupPreparationPayloadError extends Error {
  readonly code = "FINANCE_SAVED_CARD_SETUP_PREPARATION_PAYLOAD_INVALID";

  constructor() {
    super("Finance saved-card setup preparation outbox payload is invalid");
  }
}

export class FinancePlatformTariffInvoiceChargePreparationPayloadError extends Error {
  readonly code = "FINANCE_PLATFORM_TARIFF_INVOICE_CHARGE_PREPARATION_PAYLOAD_INVALID";

  constructor() {
    super("Finance platform tariff invoice charge preparation payload is invalid");
  }
}

export function createFinanceProviderOperationDispatchRequestedPayload(
  input: unknown
): FinanceProviderOperationDispatchRequestedPayload {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
  ) {
    throw new FinanceProviderOperationDispatchPayloadError();
  }

  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== 1 || !("providerOperationIntentId" in descriptors)) {
    throw new FinanceProviderOperationDispatchPayloadError();
  }
  const descriptor = descriptors.providerOperationIntentId;
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    !descriptor.enumerable ||
    typeof descriptor.value !== "string" ||
    !uuidPattern.test(descriptor.value)
  ) {
    throw new FinanceProviderOperationDispatchPayloadError();
  }

  return Object.freeze({ providerOperationIntentId: descriptor.value });
}

export function createFinanceEconomicPaymentCaptureAppliedPayload(
  input: unknown
): FinanceEconomicPaymentCaptureAppliedPayload {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
  ) {
    throw new FinanceEconomicPaymentCapturePayloadError();
  }

  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (
    Reflect.ownKeys(descriptors).length !== 1 ||
    !("captureApplicationReceiptId" in descriptors)
  ) {
    throw new FinanceEconomicPaymentCapturePayloadError();
  }
  const descriptor = descriptors.captureApplicationReceiptId;
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    !descriptor.enumerable ||
    typeof descriptor.value !== "string" ||
    !uuidPattern.test(descriptor.value)
  ) {
    throw new FinanceEconomicPaymentCapturePayloadError();
  }

  return Object.freeze({ captureApplicationReceiptId: descriptor.value });
}

export function createFinanceSavedCardSetupPreparationRequestedPayload(
  input: unknown
): FinanceSavedCardSetupPreparationRequestedPayload {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
  ) {
    throw new FinanceSavedCardSetupPreparationPayloadError();
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== 1 || !("setupSessionId" in descriptors)) {
    throw new FinanceSavedCardSetupPreparationPayloadError();
  }
  const descriptor = descriptors.setupSessionId;
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    !descriptor.enumerable ||
    typeof descriptor.value !== "string" ||
    !uuidPattern.test(descriptor.value)
  ) {
    throw new FinanceSavedCardSetupPreparationPayloadError();
  }
  return Object.freeze({ setupSessionId: descriptor.value });
}

export function createFinancePlatformTariffInvoiceChargePreparationRequestedPayload(
  input: unknown
): FinancePlatformTariffInvoiceChargePreparationRequestedPayload {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
  ) {
    throw new FinancePlatformTariffInvoiceChargePreparationPayloadError();
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== 1 || !("preparationRequestId" in descriptors)) {
    throw new FinancePlatformTariffInvoiceChargePreparationPayloadError();
  }
  const descriptor = descriptors.preparationRequestId;
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    !descriptor.enumerable ||
    typeof descriptor.value !== "string" ||
    !uuidPattern.test(descriptor.value)
  ) {
    throw new FinancePlatformTariffInvoiceChargePreparationPayloadError();
  }
  return Object.freeze({ preparationRequestId: descriptor.value });
}
