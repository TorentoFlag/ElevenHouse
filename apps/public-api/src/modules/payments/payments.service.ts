import { HttpException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  PaymentCheckoutOrderNotFoundError,
  type FinanceOrderStore
} from "@elevenhouse/domain";
import { ClientOrderCheckoutCommandFactoryError } from "@elevenhouse/domain/finance-core";
import {
  createCheckoutRequestSchema,
  type CheckoutPreparationResponse
} from "@elevenhouse/contracts";
import { ClientCheckoutPreparationService } from "./client-checkout-preparation.service";
import {
  PAYMENTS_CHECKOUT_PREPARATION_SERVICE,
  PAYMENTS_ORDER_STORE
} from "./payments.tokens";

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PAYMENTS_ORDER_STORE)
    private readonly orderStore: Pick<FinanceOrderStore, "findById">,
    @Inject(PAYMENTS_CHECKOUT_PREPARATION_SERVICE)
    private readonly checkoutPreparation: ClientCheckoutPreparationService | null,
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  async createCheckout(
    clientUserId: string,
    body: unknown,
    _idempotencyKey: string
  ): Promise<CheckoutPreparationResponse> {
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
      const order = await this.orderStore.findById(request.data.orderId);
      if (!order || order.clientUserId !== clientUserId) {
        throw new PaymentCheckoutOrderNotFoundError();
      }

      if (!this.checkoutPreparation) throw new LegacySynchronousCheckoutDisabledError();
      return this.checkoutPreparation.accept({
        order,
        clientUserId,
        request: request.data,
        idempotencyKey: _idempotencyKey
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
    if (error instanceof PaymentCheckoutOrderNotFoundError) {
      throw paymentHttpError(404, "payment_checkout_order_not_found", "Order was not found");
    }
    if (error instanceof ClientOrderCheckoutCommandFactoryError) {
      if (error.reason === "buyer_contact_unverified") {
        throw paymentHttpError(
          422,
          "payment_checkout_buyer_contact_unverified",
          "Buyer contact must be verified before checkout"
        );
      }
      if (error.reason === "order_not_payable") {
        throw paymentHttpError(
          409,
          "payment_checkout_order_not_payable",
          "Order is not available for checkout"
        );
      }
      throw paymentHttpError(
        503,
        "payment_checkout_unavailable",
        "Payment checkout is temporarily unavailable"
      );
    }
    if (error instanceof LegacySynchronousCheckoutDisabledError) {
      throw paymentHttpError(503, error.code, "Payment checkout is preparing through the secure payment service");
    }
    throw error;
  }
}

class LegacySynchronousCheckoutDisabledError extends Error {
  readonly code = "payment_checkout_worker_preparation_required";

  constructor() {
    super("Legacy synchronous payment checkout is disabled");
  }
}

function paymentHttpError(status: number, code: string, message: string): HttpException {
  return new HttpException({ statusCode: status, error: code, code, message }, status);
}
