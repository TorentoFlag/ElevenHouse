import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  PaymentWebhookAmountMismatchError,
  PaymentWebhookAttemptNotFoundError,
  PaymentWebhookCurrencyMismatchError,
  PaymentWebhookOrderNotFoundError,
  PaymentWebhookProviderContextMismatchError
} from "@elevenhouse/domain";
import {
  ArcPayWebhookPayloadError,
  parseArcPayWebhook,
  parseArcPayWebhookTransportEnvelope
} from "../arc-pay/arc-pay-webhook";
import { inspectArcPayWebhookSignature } from "../arc-pay/arc-pay-signature";
import type { FinanceWebhookIngress } from "./finance-reversal-webhook-ingress";
import type { PaymentWebhookProcessor } from "./payment-webhook.processor";

type WebhookHeaders = Readonly<Record<string, string | undefined>>;
type WebhookResponse = { readonly statusCode: number; readonly body: Record<string, unknown> };

export type PaymentWebhookHandler = {
  readonly handle: (input: {
    readonly headers: WebhookHeaders;
    /** Untouched HTTP bytes when invoked from the real server. */
    readonly rawBody: string | Uint8Array;
  }) => Promise<WebhookResponse>;
};

export function createPaymentWebhookHandler(input: {
  readonly webhookSecret: string | null;
  readonly timestampToleranceSeconds: number;
  readonly now?: () => Date;
  readonly processor: PaymentWebhookProcessor;
  /** Receives names only: never values, the body, or the signing secret. */
  readonly onSignatureRejected?: (input: Readonly<{ headerNames: readonly string[] }>) => void;
  /**
   * Captures, partial/full refunds and chargebacks are acknowledged only after durable ingress. Their
   * canonical workers apply V2 accounting effects later; this boundary must never run a legacy
   * projector for client money.
   */
  readonly financeIngress?: FinanceWebhookIngress;
}): PaymentWebhookHandler {
  return {
    async handle(request) {
      if (!input.webhookSecret) {
        return { statusCode: 503, body: { error: "webhook_not_configured" } };
      }
      const now = (input.now ?? (() => new Date()))();
      const signature = inspectArcPayWebhookSignature({
        headers: request.headers,
        rawBody: request.rawBody,
        secret: input.webhookSecret,
        timestampToleranceSeconds: input.timestampToleranceSeconds,
        now
      });
      if (signature.kind !== "verified") {
        input.onSignatureRejected?.({ headerNames: Object.keys(request.headers).sort() });
        return { statusCode: 401, body: { error: "invalid_webhook_signature" } };
      }

      try {
        const rawBody = decodeWebhookJsonBody(request.rawBody);
        const transport = parseArcPayWebhookTransportEnvelope({
          webhookId: signature.webhookId,
          rawBody
        });
        if (transport.providerEventType === "webhook.test") {
          return { statusCode: 200, body: { accepted: true, test: true } };
        }
        if (
          transport.providerEventType === "payment.captured" ||
          transport.providerEventType === "payment.refunded" ||
          transport.providerEventType === "payment.partially_refunded" ||
          transport.providerEventType === "payment.chargeback"
        ) {
          if (!input.financeIngress) {
            return {
              statusCode: 503,
              body: {
                error: canonicalIngressConfigurationError(transport.providerEventType)
              }
            };
          }
          const result = await input.financeIngress.store({
            signature,
            transport,
            rawBody: exactRawBytes(request.rawBody)
          });
          return { statusCode: 200, body: { accepted: true, duplicate: result.duplicate } };
        }
        const event = parseArcPayWebhook({
          webhookId: signature.webhookId,
          rawBody
        });
        const result = await input.processor.process(event);
        return { statusCode: 200, body: { accepted: true, duplicate: result.duplicate } };
      } catch (error) {
        return webhookErrorResponse(error);
      }
    }
  };
}

function canonicalIngressConfigurationError(
  eventType: "payment.captured" | "payment.refunded" | "payment.partially_refunded" | "payment.chargeback"
): "canonical_capture_not_configured" | "canonical_refund_not_configured" | "canonical_chargeback_not_configured" {
  if (eventType === "payment.captured") return "canonical_capture_not_configured";
  if (eventType === "payment.refunded" || eventType === "payment.partially_refunded") {
    return "canonical_refund_not_configured";
  }
  return "canonical_chargeback_not_configured";
}

function exactRawBytes(rawBody: string | Uint8Array): Uint8Array {
  return typeof rawBody === "string" ? new TextEncoder().encode(rawBody) : rawBody;
}

export function createPaymentWebhookServer(input: {
  readonly handler: PaymentWebhookHandler;
}): Server {
  return createServer(async (request, response) => {
    if (request.method !== "POST" || requestPathname(request) !== "/webhooks/arc-pay") {
      writeJson(response, 404, { error: "not_found" });
      return;
    }
    try {
      const rawBody = await readRawBody(request);
      const result = await input.handler.handle({ headers: requestHeaders(request), rawBody });
      writeJson(response, result.statusCode, result.body);
    } catch (error) {
      writeJson(response, error instanceof PayloadTooLargeError ? 413 : 400, {
        error:
          error instanceof PayloadTooLargeError ? "payload_too_large" : "invalid_webhook_payload"
      });
    }
  });
}

function webhookErrorResponse(error: unknown): WebhookResponse {
  if (error instanceof ArcPayWebhookPayloadError) {
    return { statusCode: 400, body: { error: "invalid_webhook_payload" } };
  }
  if (
    error instanceof PaymentWebhookAttemptNotFoundError ||
    error instanceof PaymentWebhookOrderNotFoundError
  ) {
    return { statusCode: 500, body: { error: error.code } };
  }
  if (
    error instanceof PaymentWebhookAmountMismatchError ||
    error instanceof PaymentWebhookCurrencyMismatchError ||
    error instanceof PaymentWebhookProviderContextMismatchError
  ) {
    return { statusCode: 422, body: { error: error.code } };
  }
  return { statusCode: 500, body: { error: "webhook_processing_failed" } };
}

function requestHeaders(request: IncomingMessage): WebhookHeaders {
  return Object.fromEntries(
    Object.entries(request.headers).map(([name, value]) => [
      name,
      typeof value === "string" ? value : undefined
    ])
  );
}

function requestPathname(request: IncomingMessage): string {
  return new URL(request.url ?? "/", "http://127.0.0.1").pathname;
}

async function readRawBody(request: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_048_576) throw new PayloadTooLargeError();
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function decodeWebhookJsonBody(rawBody: string | Uint8Array): string {
  if (typeof rawBody === "string") return rawBody;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(rawBody);
  } catch {
    throw new ArcPayWebhookPayloadError();
  }
}

class PayloadTooLargeError extends Error {}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>
): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
