import { HttpException, Inject, Injectable } from "@nestjs/common";
import {
  FinanceIdempotencyConflictError,
  FinanceIdempotencyFailedError,
  FinanceIdempotencyInProgressError,
  OrderBookingHoldNotClaimableError,
  OrderClientRelationshipRequiredError,
  OrderFinancePolicyUnavailableError,
  OrderProductNotAvailableError,
  createOrder,
  type ClientAstrologerRelationshipReader,
  type FinanceOrderStore,
  type FinancePolicyStore,
  type ProductStore
} from "@elevenhouse/domain";
import {
  createOrderRequestSchema,
  orderResponseSchema,
  type OrderResponse
} from "@elevenhouse/contracts";
import { SystemClock } from "../../common/system-clock.js";
import {
  ORDERS_FINANCE_POLICY_STORE,
  ORDERS_ORDER_STORE,
  ORDERS_PRODUCT_STORE,
  ORDERS_RELATIONSHIP_READER
} from "./orders.tokens";

@Injectable()
export class OrdersService {
  constructor(
    @Inject(ORDERS_ORDER_STORE)
    private readonly orderStore: Pick<FinanceOrderStore, "executeCreateOrder">,
    @Inject(ORDERS_RELATIONSHIP_READER)
    private readonly relationshipReader: ClientAstrologerRelationshipReader,
    @Inject(ORDERS_PRODUCT_STORE)
    private readonly productStore: Pick<ProductStore, "findByOwnerAndId">,
    @Inject(ORDERS_FINANCE_POLICY_STORE)
    private readonly financePolicyStore: Pick<FinancePolicyStore, "findEffectivePolicyForAstrologer">,
    @Inject(SystemClock)
    private readonly clock: SystemClock
  ) {}

  async createOrder(
    clientUserId: string,
    body: unknown,
    idempotencyKey: string
  ): Promise<OrderResponse> {
    return mapOrderErrors(async () => {
      const request = createOrderRequestSchema.safeParse(body);
      if (!request.success) {
        throw orderHttpError(400, "invalid_request", "Invalid order creation request");
      }

      const order = await createOrder({
        orderStore: this.orderStore,
        relationshipReader: this.relationshipReader,
        productStore: this.productStore,
        financePolicyStore: this.financePolicyStore,
        clientUserId,
        request: request.data,
        idempotencyKey,
        now: this.clock.now()
      });

      return orderResponseSchema.parse(order);
    });
  }
}

async function mapOrderErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HttpException) throw error;
    if (error instanceof OrderClientRelationshipRequiredError) {
      throw orderHttpError(403, error.code, error.message);
    }
    if (error instanceof OrderProductNotAvailableError) {
      throw orderHttpError(404, error.code, error.message);
    }
    if (
      error instanceof OrderFinancePolicyUnavailableError ||
      error instanceof OrderBookingHoldNotClaimableError ||
      error instanceof FinanceIdempotencyInProgressError ||
      error instanceof FinanceIdempotencyFailedError
    ) {
      throw orderHttpError(409, error.code, error.message);
    }
    if (error instanceof FinanceIdempotencyConflictError) {
      throw orderHttpError(409, error.code, error.message);
    }
    throw error;
  }
}

function orderHttpError(status: number, code: string, message: string): HttpException {
  return new HttpException({ statusCode: status, error: code, code, message }, status);
}
