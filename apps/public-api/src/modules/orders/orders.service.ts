import { HttpException, Inject, Injectable } from "@nestjs/common";
import {
  FinanceIdempotencyConflictError,
  FinanceIdempotencyFailedError,
  FinanceIdempotencyInProgressError,
  OrderBookingHoldNotClaimableError,
  OrderBookingHoldRequiredError,
  OrderClientRelationshipRequiredError,
  OrderFinancePolicyUnavailableError,
  OrderProductNotAvailableError,
  OrderTariffCommissionUnavailableError,
  createOrder,
  type ClientAstrologerRelationshipReader,
  type FinanceOrderStore,
  type FinancePolicyStore,
  type PlatformTariffEntitlementStore,
  type ProductStore
} from "@elevenhouse/domain";
import {
  createOrderRequestSchema,
  orderParamsSchema,
  orderResponseSchema,
  type OrderResponse
} from "@elevenhouse/contracts";
import { SystemClock } from "../../common/system-clock.js";
import {
  ORDERS_FINANCE_POLICY_STORE,
  ORDERS_ORDER_STORE,
  ORDERS_PRODUCT_STORE,
  ORDERS_RELATIONSHIP_READER,
  ORDERS_TARIFF_AUTHORITY_STORE
} from "./orders.tokens";

@Injectable()
export class OrdersService {
  constructor(
    @Inject(ORDERS_ORDER_STORE)
    private readonly orderStore: Pick<FinanceOrderStore, "executeCreateOrder" | "findById">,
    @Inject(ORDERS_RELATIONSHIP_READER)
    private readonly relationshipReader: ClientAstrologerRelationshipReader,
    @Inject(ORDERS_PRODUCT_STORE)
    private readonly productStore: Pick<ProductStore, "findByOwnerAndId">,
    @Inject(ORDERS_FINANCE_POLICY_STORE)
    private readonly financePolicyStore: Pick<FinancePolicyStore, "findEffectivePolicyForAstrologer">,
    @Inject(ORDERS_TARIFF_AUTHORITY_STORE)
    private readonly tariffAuthorityStore: PlatformTariffEntitlementStore,
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
        tariffAuthorityStore: this.tariffAuthorityStore,
        clientUserId,
        request: request.data,
        idempotencyKey,
        now: this.clock.now()
      });

      return orderResponseSchema.parse(toPublicOrderResponse(order));
    });
  }

  async getOrder(clientUserId: string, orderId: string): Promise<OrderResponse | null> {
    const params = orderParamsSchema.safeParse({ orderId });
    if (!params.success) {
      throw orderHttpError(400, "invalid_request", "Invalid order identifier");
    }
    const order = await this.orderStore.findById(params.data.orderId);
    if (!order || order.clientUserId !== clientUserId) return null;
    return orderResponseSchema.parse(toPublicOrderResponse(order));
  }
}

function toPublicOrderResponse(order: Awaited<ReturnType<typeof createOrder>>): OrderResponse {
  const {
    tariffSeriesId,
    tariffVersion,
    tariffVersionDigest,
    tariffCommissionBps,
    ...response
  } = order;
  void tariffSeriesId;
  void tariffVersion;
  void tariffVersionDigest;
  void tariffCommissionBps;
  return response;
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
      error instanceof OrderTariffCommissionUnavailableError ||
      error instanceof OrderBookingHoldRequiredError ||
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
