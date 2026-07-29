import type {
  PaymentCheckoutRequest,
  PaymentCheckoutSession,
  PaymentProviderPort
} from "@elevenhouse/domain";
import type { PublicApiRuntimeConfig } from "../../config/runtime-config";

export class ArcPayCheckoutConfigurationError extends Error {
  readonly code = "arc_pay_checkout_not_configured";

  constructor() {
    super("Arc Pay checkout is not configured");
    this.name = "ArcPayCheckoutConfigurationError";
  }
}

export class ArcPayCheckoutProviderError extends Error {
  readonly code = "arc_pay_checkout_request_failed";

  constructor() {
    super("Arc Pay checkout request failed");
    this.name = "ArcPayCheckoutProviderError";
  }
}

type FetchLike = typeof fetch;

export class ArcPayCheckoutProvider implements PaymentProviderPort {
  readonly provider = "arc_pay" as const;
  readonly environment;

  constructor(
    private readonly config: PublicApiRuntimeConfig["arcPay"],
    private readonly fetchImpl: FetchLike = fetch
  ) {
    this.environment = config.environment;
  }

  async openCheckout(input: PaymentCheckoutRequest): Promise<PaymentCheckoutSession> {
    if (
      !this.config.secret ||
      !this.config.captureMode ||
      this.config.paymentMethods.length === 0
    ) {
      throw new ArcPayCheckoutConfigurationError();
    }

    let response: Response;
    try {
      response = await this.fetchImpl(new URL("/v1/checkout/sessions", this.config.apiBaseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.secret}`,
          "content-type": "application/json",
          "idempotency-key": input.paymentAttemptId
        },
        body: JSON.stringify({
          amount: input.amount.amountMinor,
          currency: input.amount.currency,
          payment_methods: this.config.paymentMethods.map((method) => ({
            method: method.method,
            payment_mode: method.paymentMode
          })),
          capture_mode: this.config.captureMode,
          success_url: input.successUrl,
          fail_url: input.failureUrl,
          cancel_url: input.cancelUrl,
          external_id: input.paymentAttemptId,
          metadata: {
            order_id: input.orderId,
            payment_attempt_id: input.paymentAttemptId
          }
        })
      });
    } catch {
      throw new ArcPayCheckoutProviderError();
    }
    if (!response.ok) throw new ArcPayCheckoutProviderError();

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ArcPayCheckoutProviderError();
    }
    if (!isCheckoutSession(body)) throw new ArcPayCheckoutProviderError();
    return { providerCheckoutId: body.id, checkoutUrl: body.url };
  }
}

function isCheckoutSession(value: unknown): value is { readonly id: string; readonly url: string } {
  if (typeof value !== "object" || value === null || !("id" in value) || !("url" in value)) {
    return false;
  }
  if (
    typeof value.id !== "string" ||
    value.id.trim().length === 0 ||
    typeof value.url !== "string"
  ) {
    return false;
  }
  try {
    return new URL(value.url).protocol === "https:";
  } catch {
    return false;
  }
}
