/* eslint-disable no-control-regex -- Boundary validation intentionally rejects ASCII control characters. */
import {
  createProviderDispatchEnvelope,
  type ProviderDispatchEnvelope
} from "@elevenhouse/domain/finance-core";

type SavedCardChargeEnvelope = Extract<ProviderDispatchEnvelope, { kind: "saved_card_charge" }>;

export type ArcPaySavedCardCharge = Readonly<{
  providerPaymentId: string;
  status: "authorized" | "captured" | "pending" | "pending_3ds" | "failed" | "declined";
  /** Exact private provider evidence; only the dispatcher may seal it before a durable transition. */
  rawResponseBytes: Uint8Array;
}>;

export class ArcPaySavedCardChargeClientError extends Error {
  readonly code = "ARC_PAY_SAVED_CARD_CHARGE_CLIENT_ERROR" as const;

  constructor(
    readonly reason: "not_configured" | "invalid_input" | "transport" | "provider_rejected" | "invalid_response"
  ) {
    super("ArcPay saved-card charge could not be executed safely");
  }
}

/**
 * Worker-only ArcPay MIT adapter. It accepts a credential only transiently from the restricted
 * vault, serializes the immutable server-issued recurring schedule, and never records the raw
 * token in its return value, logs, database or queue payload.
 */
export function createArcPaySavedCardChargeClient(
  config: Readonly<{ apiBaseUrl: string; apiSecret: string | null }>,
  fetchImpl: typeof fetch = fetch
): Readonly<{
  chargeSavedCard(input: Readonly<{
    envelope: SavedCardChargeEnvelope;
    providerCustomerId: string;
    cardTokenId: string;
    idempotencyKey: string;
  }>): Promise<ArcPaySavedCardCharge>;
}> {
  const apiBaseUrl = httpsBaseUrl(config.apiBaseUrl);
  return Object.freeze({
    async chargeSavedCard(input) {
      if (!config.apiSecret?.trim()) fail("not_configured");
      const envelope = savedCardChargeEnvelope(input.envelope);
      const providerCustomerId = customerId(input.providerCustomerId);
      const cardTokenId = uuid(input.cardTokenId);
      const idempotencyKey = idempotency(input.idempotencyKey);
      let response: Response;
      try {
        response = await fetchImpl(new URL("/v1/payments/saved-card", apiBaseUrl), {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiSecret}`,
            "content-type": "application/json",
            "idempotency-key": idempotencyKey
          },
          body: JSON.stringify({
            amount: envelope.amount.amountMinor,
            currency: "RUB",
            card_token_id: cardTokenId,
            customer_id: providerCustomerId,
            external_id: envelope.externalId,
            stored_credential_reason: "recurring",
            recurring_frequency_days: envelope.recurringFrequencyDays,
            merchant_inn: envelope.fiscalSnapshot.merchantTaxId,
            ...(envelope.fiscalSnapshot.buyerContact.kind === "email"
              ? { customer_email: envelope.fiscalSnapshot.buyerContact.value }
              : { customer_phone: envelope.fiscalSnapshot.buyerContact.value }),
            fiscal_items: envelope.fiscalSnapshot.lines.map((line) => ({
              name: line.name,
              quantity: line.quantity,
              unit_price: line.unitPriceMinor,
              vat_rate: line.vatRate,
              payment_object: line.paymentObject,
              payment_method: line.paymentMethod,
              measure: line.measure,
              item_code: line.itemCode
            }))
          })
        });
      } catch {
        fail("transport");
      }
      if (!response.ok) fail("provider_rejected");
      const rawResponseBytes = await responseBytes(response);
      return parseResponse(rawResponseBytes);
    }
  });
}

function savedCardChargeEnvelope(value: SavedCardChargeEnvelope): SavedCardChargeEnvelope {
  const parsed = createProviderDispatchEnvelope(value);
  if (parsed.kind !== "saved_card_charge") fail("invalid_input");
  return parsed;
}

async function responseBytes(response: Response): Promise<Uint8Array> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    fail("invalid_response");
  }
  if (bytes.byteLength < 1 || bytes.byteLength > 16 * 1024 * 1024) fail("invalid_response");
  return bytes;
}

function parseResponse(rawResponseBytes: Uint8Array): ArcPaySavedCardCharge {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawResponseBytes));
  } catch {
    fail("invalid_response");
  }
  if (!record(value) || !identifier(value.payment_id) || !status(value.status)) fail("invalid_response");
  return Object.freeze({
    providerPaymentId: value.payment_id,
    status: value.status,
    rawResponseBytes
  });
}

function httpsBaseUrl(value: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error();
    return url;
  } catch {
    fail("invalid_input");
  }
}

function customerId(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 255 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
    fail("invalid_input");
  }
  return value;
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) fail("invalid_input");
  return value;
}

function idempotency(value: unknown): string {
  // ArcPay requires Idempotency-Key to be an RFC UUID for saved-card charges.
  // The persisted provider-operation UUID is stable across outbox redelivery.
  return uuid(value);
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 255 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}

function status(value: unknown): value is ArcPaySavedCardCharge["status"] {
  return value === "authorized" || value === "captured" || value === "pending" || value === "pending_3ds" || value === "failed" || value === "declined";
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(reason: ArcPaySavedCardChargeClientError["reason"]): never {
  throw new ArcPaySavedCardChargeClientError(reason);
}
