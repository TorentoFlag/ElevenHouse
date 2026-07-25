import { HttpException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  FinanceIdempotencyConflictError,
  FinanceIdempotencyFailedError,
  FinanceIdempotencyInProgressError,
  PaymentCheckoutOrderAccessDeniedError,
  PaymentCheckoutOrderNotFoundError,
  PaymentCheckoutOrderNotPayableError,
  PaymentCheckoutPersistenceError,
  createPaymentCheckout,
  type FinanceOrderStore,
  type PaymentProviderPort,
  type PaymentStore
} from "@elevenhouse/domain";
import {
  checkoutResponseSchema,
  createCheckoutRequestSchema,
  type CheckoutResponse
} from "@elevenhouse/contracts";
import { SystemClock } from "../../common/system-clock.js";
import {
  ArcPayCheckoutConfigurationError,
  ArcPayCheckoutProviderError
} from "./arc-pay-checkout-provider";
import { PAYMENTS_ORDER_STORE, PAYMENTS_PAYMENT_STORE, PAYMENTS_PROVIDER } from "./payments.tokens";

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PAYMENTS_ORDER_STORE)
    private readonly orderStore: Pick<FinanceOrderStore, "findById">,
    @Inject(PAYMENTS_PAYMENT_STORE)
    private readonly paymentStore: Pick<
      PaymentStore,
      "executeCreateCheckout" | "markAttemptCheckoutOpened"
    >,
    @Inject(PAYMENTS_PROVIDER) private readonly provider: PaymentProviderPort,
    private readonly clock: SystemClock,
    private readonly configService: ConfigService
  ) {}

  async createCheckout(
    clientUserId: string,
    body: unknown,
    idempotencyKey: string
  ): Promise<CheckoutResponse> {
    return mapPaymentErrors(async () => {
      const request = createCheckoutRequestSchema.safeParse(body);
      if (!request.success) {
        throw paymentHttpError(400, "invalid_request", "Invalid payment checkout request");
      }
      if (!hasAllowedReturnOrigins(request.data, this.configService)) {
        throw paymentHttpError(
          400,
          "invalid_request",
          "Payment return URLs must use an allowed origin"
        );
      }

      const checkout = await createPaymentCheckout({
        orderStore: this.orderStore,
        paymentStore: this.paymentStore,
        provider: this.provider,
        clientUserId,
        request: request.data,
        idempotencyKey,
        now: this.clock.now()
      });
      return checkoutResponseSchema.parse({
        ...checkout,
        provider: this.provider.provider,
        environment: this.provider.environment
      });
    });
  }
}

function hasAllowedReturnOrigins(
  request: { readonly successUrl: string; readonly failureUrl: string; readonly cancelUrl: string },
  configService: ConfigService
): boolean {
  const allowedOrigins = configService.getOrThrow<readonly string[]>("publicApi.allowedOrigins");
  return [request.successUrl, request.failureUrl, request.cancelUrl].every((value) =>
    allowedOrigins.includes(new URL(value).origin)
  );
}

async function mapPaymentErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HttpException) throw error;
    if (
      error instanceof PaymentCheckoutOrderNotFoundError ||
      error instanceof PaymentCheckoutOrderAccessDeniedError
    ) {
      throw paymentHttpError(404, "payment_checkout_order_not_found", "Order was not found");
    }
    if (
      error instanceof PaymentCheckoutOrderNotPayableError ||
      error instanceof FinanceIdempotencyConflictError ||
      error instanceof FinanceIdempotencyInProgressError ||
      error instanceof FinanceIdempotencyFailedError
    ) {
      throw paymentHttpError(409, error.code, error.message);
    }
    if (error instanceof ArcPayCheckoutConfigurationError) {
      throw paymentHttpError(503, error.code, "Payment checkout is temporarily unavailable");
    }
    if (
      error instanceof ArcPayCheckoutProviderError ||
      error instanceof PaymentCheckoutPersistenceError
    ) {
      throw paymentHttpError(502, error.code, "Payment checkout could not be opened");
    }
    throw error;
  }
}

function paymentHttpError(status: number, code: string, message: string): HttpException {
  return new HttpException({ statusCode: status, error: code, code, message }, status);
}
