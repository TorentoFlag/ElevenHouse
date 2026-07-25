import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  PaymentWebhookAmountMismatchError,
  PaymentWebhookAttemptNotFoundError,
  PaymentWebhookCurrencyMismatchError,
  PaymentWebhookOrderNotFoundError,
  PaymentWebhookProviderContextMismatchError
} from "@elevenhouse/domain";
import { ArcPayWebhookPayloadError, parseArcPayWebhook } from "../arc-pay/arc-pay-webhook";
import { verifyArcPayWebhookSignature } from "../arc-pay/arc-pay-signature";
import type { PaymentWebhookProcessor } from "./payment-webhook.processor";

type WebhookHeaders = Readonly<Record<string, string | undefined>>;
type WebhookResponse = { readonly statusCode: number; readonly body: Record<string, unknown> };

export type PaymentWebhookHandler = {
  readonly handle: (input: {
    readonly headers: WebhookHeaders;
    readonly rawBody: string;
  }) => Promise<WebhookResponse>;
};

export function createPaymentWebhookHandler(input: {
  readonly webhookSecret: string | null;
  readonly timestampToleranceSeconds: number;
  readonly now?: () => Date;
  readonly processor: PaymentWebhookProcessor;
}): PaymentWebhookHandler {
  return {
    async handle(request) {
      if (!input.webhookSecret) {
        return { statusCode: 503, body: { error: "webhook_not_configured" } };
      }
      const now = (input.now ?? (() => new Date()))();
      if (
        !verifyArcPayWebhookSignature({
          headers: request.headers,
          rawBody: request.rawBody,
          secret: input.webhookSecret,
          timestampToleranceSeconds: input.timestampToleranceSeconds,
          now
        })
      ) {
        return { statusCode: 401, body: { error: "invalid_webhook_signature" } };
      }

      try {
        const webhookId = request.headers["webhook-id"];
        if (!webhookId) throw new ArcPayWebhookPayloadError();
        const event = parseArcPayWebhook({ webhookId, rawBody: request.rawBody });
        const result = await input.processor.process(event);
        return { statusCode: 200, body: { accepted: true, duplicate: result.duplicate } };
      } catch (error) {
        return webhookErrorResponse(error);
      }
    }
  };
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

async function readRawBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_048_576) throw new PayloadTooLargeError();
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
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
