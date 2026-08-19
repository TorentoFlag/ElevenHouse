import {
  createProviderDispatchEnvelope,
  type ProviderDispatchEnvelope
} from "@elevenhouse/domain/finance-core";

type RefundEnvelope = Extract<ProviderDispatchEnvelope, { kind: "refund" }>;

export type ArcPayRefund = Readonly<{
  providerRefundId: string;
  providerPaymentId: string;
  amountMinor: number;
  currency: "RUB";
  status: "pending" | "succeeded" | "failed";
  rawResponseBytes: Uint8Array;
}>;

export class ArcPayRefundClientError extends Error {
  readonly code = "ARC_PAY_REFUND_CLIENT_ERROR" as const;

  constructor(
    readonly reason:
      | "not_configured"
      | "invalid_input"
      | "transport"
      | "provider_rejected"
      | "invalid_response"
  ) {
    super("ArcPay refund could not be executed safely");
    this.name = "ArcPayRefundClientError";
  }
}

/**
 * Worker-only adapter for the documented ArcPay refund request. A 201 response only proves that
 * the provider accepted the request; the caller must still reconcile the provider's terminal
 * outcome before any refund-ledger mutation.
 */
export function createArcPayRefundClient(
  config: Readonly<{ apiBaseUrl: string; apiSecret: string | null }>,
  fetchImpl: typeof fetch = fetch
): Readonly<{
  createRefund(
    input: Readonly<{
      envelope: RefundEnvelope;
      idempotencyKey: string;
    }>
  ): Promise<ArcPayRefund>;
}> {
  const apiBaseUrl = httpsBaseUrl(config.apiBaseUrl);
  return Object.freeze({
    async createRefund(input) {
      if (!config.apiSecret?.trim()) fail("not_configured");
      const envelope = refundEnvelope(input.envelope);
      const idempotencyKey = uuid(input.idempotencyKey);
      let response: Response;
      try {
        response = await fetchImpl(
          new URL(
            `/payments/${encodeURIComponent(envelope.providerPaymentId)}/refunds`,
            apiBaseUrl
          ),
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${config.apiSecret}`,
              "content-type": "application/json",
              "idempotency-key": idempotencyKey
            },
            body: JSON.stringify({
              amount: envelope.amount.amountMinor,
              reason: envelope.externalId
            })
          }
        );
      } catch {
        fail("transport");
      }
      if (!response.ok) fail("provider_rejected");
      const rawResponseBytes = await responseBytes(response);
      return parseResponse(rawResponseBytes, envelope);
    }
  });
}

function refundEnvelope(value: RefundEnvelope): RefundEnvelope {
  const parsed = createProviderDispatchEnvelope(value);
  if (parsed.kind !== "refund") fail("invalid_input");
  if (!uuid(parsed.providerPaymentId)) fail("invalid_input");
  return parsed;
}

async function responseBytes(response: Response): Promise<Uint8Array> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > 2 * 1024 * 1024)
  ) {
    fail("invalid_response");
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    fail("invalid_response");
  }
  if (
    bytes.byteLength < 1 ||
    bytes.byteLength > 2 * 1024 * 1024 ||
    !response.headers.get("content-type")?.toLowerCase().startsWith("application/json")
  ) {
    fail("invalid_response");
  }
  return bytes;
}

function parseResponse(rawResponseBytes: Uint8Array, envelope: RefundEnvelope): ArcPayRefund {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawResponseBytes));
  } catch {
    fail("invalid_response");
  }
  if (!record(value)) fail("invalid_response");
  if (!isUuid(value.id) || !isUuid(value.payment_id)) fail("invalid_response");
  const providerRefundId = value.id;
  const providerPaymentId = value.payment_id;
  const amountMinor = minor(value.amount);
  if (
    providerPaymentId !== envelope.providerPaymentId ||
    amountMinor !== envelope.amount.amountMinor ||
    value.currency !== "RUB" ||
    !status(value.status) ||
    !instant(value.created_at)
  ) {
    fail("invalid_response");
  }
  return Object.freeze({
    providerRefundId,
    providerPaymentId,
    amountMinor,
    currency: "RUB",
    status: value.status,
    rawResponseBytes
  });
}

function httpsBaseUrl(value: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      throw new Error();
    return url;
  } catch {
    fail("invalid_input");
  }
}

function uuid(value: unknown): string {
  if (!isUuid(value)) {
    fail("invalid_input");
  }
  return value;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  );
}

function minor(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) fail("invalid_response");
  return Number(value);
}

function status(value: unknown): value is ArcPayRefund["status"] {
  return value === "pending" || value === "succeeded" || value === "failed";
}

function instant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return (
    !Number.isNaN(parsed.getTime()) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(reason: ArcPayRefundClientError["reason"]): never {
  throw new ArcPayRefundClientError(reason);
}
