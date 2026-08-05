import {
  createProviderDispatchEnvelope,
  type ProviderDispatchEnvelope
} from "@elevenhouse/domain/finance-core";

type HostedCheckoutEnvelope = Extract<
  ProviderDispatchEnvelope,
  { readonly kind: "checkout_session_create" }
>;

export type ArcPayHostedCheckoutSession = Readonly<{
  providerCheckoutId: string;
  checkoutUrl: string;
  /** Exact private evidence bytes: the caller seals them before durable result application. */
  rawResponseBytes: Uint8Array;
}>;

export class ArcPayCheckoutSessionClientError extends Error {
  readonly code = "ARC_PAY_CHECKOUT_SESSION_CLIENT_ERROR" as const;

  constructor(
    readonly reason: "not_configured" | "invalid_input" | "transport" | "provider_rejected" | "invalid_response"
  ) {
    super("ArcPay hosted checkout session could not be created safely");
    this.name = "ArcPayCheckoutSessionClientError";
  }
}

/**
 * Worker-only ArcPay Hosted Checkout adapter. The HPP contract does not accept `merchant_inn`;
 * terminal/KKT identity is therefore an independent readiness gate, not a guessed request field.
 */
export function createArcPayCheckoutSessionClient(
  config: Readonly<{ apiBaseUrl: string; apiSecret: string | null }>,
  fetchImpl: typeof fetch = fetch
): Readonly<{
  createHostedCheckout(input: Readonly<{
    envelope: HostedCheckoutEnvelope;
    idempotencyKey: string;
  }>): Promise<ArcPayHostedCheckoutSession>;
}> {
  const apiBaseUrl = httpsBaseUrl(config.apiBaseUrl);
  return Object.freeze({
    async createHostedCheckout(input) {
      if (!config.apiSecret?.trim()) fail("not_configured");
      if (!isUuid(input.idempotencyKey)) fail("invalid_input");
      const envelope = checkoutEnvelope(input.envelope);
      const body = checkoutRequestBody(envelope);
      let response: Response;
      try {
        response = await fetchImpl(new URL("/v1/checkout/sessions", apiBaseUrl), {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiSecret}`,
            "content-type": "application/json",
            "idempotency-key": input.idempotencyKey
          },
          body: JSON.stringify(body)
        });
      } catch {
        fail("transport");
      }
      if (!response.ok) fail("provider_rejected");
      let rawResponseBytes: Uint8Array;
      try {
        rawResponseBytes = new Uint8Array(await response.arrayBuffer());
      } catch {
        fail("invalid_response");
      }
      if (rawResponseBytes.byteLength < 1 || rawResponseBytes.byteLength > 16 * 1024 * 1024) {
        fail("invalid_response");
      }
      let payload: unknown;
      try {
        payload = JSON.parse(new TextDecoder().decode(rawResponseBytes));
      } catch {
        fail("invalid_response");
      }
      return checkoutSession(payload, rawResponseBytes);
    }
  });
}

function checkoutEnvelope(value: HostedCheckoutEnvelope): HostedCheckoutEnvelope {
  const parsed = createProviderDispatchEnvelope(value);
  if (parsed.kind !== "checkout_session_create") fail("invalid_input");
  return parsed;
}

function checkoutRequestBody(envelope: HostedCheckoutEnvelope) {
  const buyer =
    envelope.fiscalSnapshot.buyerContact.kind === "email"
      ? { customer_email: envelope.fiscalSnapshot.buyerContact.value }
      : { customer_phone: envelope.fiscalSnapshot.buyerContact.value };
  return {
    amount: envelope.amount.amountMinor,
    currency: envelope.amount.currency,
    payment_methods: envelope.paymentMethods.map((method) => ({
      method: method.method,
      payment_mode: method.paymentMode
    })),
    capture_mode: envelope.captureMode,
    success_url: envelope.successUrl,
    fail_url: envelope.failureUrl,
    cancel_url: envelope.cancelUrl,
    external_id: envelope.externalId,
    ...buyer,
    fiscal_items: envelope.fiscalSnapshot.lines.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      unit_price: line.unitPriceMinor,
      vat_rate: line.vatRate,
      payment_object: line.paymentObject,
      payment_method: line.paymentMethod,
      measure: line.measure,
      item_code: line.itemCode
    })),
    metadata: {
      order_id: envelope.orderId,
      fiscal_profile: `${envelope.fiscalSnapshot.profileSeriesId}:${envelope.fiscalSnapshot.profileVersion}`
    }
  };
}

function checkoutSession(value: unknown, rawResponseBytes: Uint8Array): ArcPayHostedCheckoutSession {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("invalid_response");
  const candidate = value as Record<string, unknown>;
  if (!hasExactOwnKeys(candidate, ["id", "url"]) || !isUuid(candidate.id) || !httpsUrl(candidate.url)) {
    fail("invalid_response");
  }
  return Object.freeze({
    providerCheckoutId: candidate.id,
    checkoutUrl: candidate.url,
    rawResponseBytes
  });
}

function httpsBaseUrl(value: string): URL {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error();
    return parsed;
  } catch {
    throw new ArcPayCheckoutSessionClientError("not_configured");
  }
}

function httpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function hasExactOwnKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const normalizedExpected = [...expected].sort();
  return actual.length === normalizedExpected.length && actual.every((key, index) => key === normalizedExpected[index]);
}

function fail(reason: ArcPayCheckoutSessionClientError["reason"]): never {
  throw new ArcPayCheckoutSessionClientError(reason);
}
