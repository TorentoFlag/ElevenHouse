import {
  availableBookingSlotsQuerySchema,
  availableBookingSlotsResponseSchema,
  checkoutPreparationResponseSchema,
  checkoutPreparationStateResponseSchema,
  clientPurchaseOptionsResponseSchema,
  createCheckoutRequestSchema,
  createOrderRequestSchema,
  createPaidBookingHoldRequestSchema,
  orderResponseSchema,
  paidBookingHoldResponseSchema,
  type AvailableBookingSlotsQuery,
  type AvailableBookingSlotsResponse,
  type CheckoutPreparationStateResponse,
  type ClientPurchaseOptionsResponse,
  type CreateCheckoutRequest,
  type CreateOrderRequest,
  type CreatePaidBookingHoldRequest,
  type OrderResponse,
  type PaidBookingHoldResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function getClientPurchaseOptions(
  astrologerUserId: string
): Promise<ClientPurchaseOptionsResponse> {
  return clientPurchaseOptionsResponseSchema.parse(
    await application.http.get(`/me/astrologers/${astrologerUserId}/purchase-options`)
  );
}

export async function getClientAvailableSlots(
  astrologerUserId: string,
  query: AvailableBookingSlotsQuery
): Promise<AvailableBookingSlotsResponse> {
  const parsed = availableBookingSlotsQuerySchema.parse(query);
  const search = new URLSearchParams({
    productId: parsed.productId,
    start: parsed.start,
    end: parsed.end
  });
  return availableBookingSlotsResponseSchema.parse(
    await application.http.get(
      `/me/astrologers/${astrologerUserId}/available-slots?${search.toString()}`
    )
  );
}

export async function createClientPaidBookingHold(
  input: CreatePaidBookingHoldRequest,
  idempotencyKey: string
): Promise<PaidBookingHoldResponse> {
  const request = createPaidBookingHoldRequestSchema.parse(input);
  return paidBookingHoldResponseSchema.parse(
    await application.http.post("/booking/intent", request, { csrf: true, idempotencyKey })
  );
}

export async function createClientOrder(
  input: CreateOrderRequest,
  idempotencyKey: string
): Promise<OrderResponse> {
  const request = createOrderRequestSchema.parse(input);
  return orderResponseSchema.parse(
    await application.http.post("/orders", request, { csrf: true, idempotencyKey })
  );
}

export async function prepareClientCheckout(
  input: CreateCheckoutRequest,
  idempotencyKey: string
) {
  const request = createCheckoutRequestSchema.parse(input);
  return checkoutPreparationResponseSchema.parse(
    await application.http.post("/payments/checkout", request, { csrf: true, idempotencyKey })
  );
}

export async function getClientCheckoutPreparationState(
  checkoutPreparationId: string
): Promise<CheckoutPreparationStateResponse> {
  return checkoutPreparationStateResponseSchema.parse(
    await application.http.get(`/payments/checkout-preparations/${checkoutPreparationId}`)
  );
}

export async function getClientOrder(orderId: string): Promise<OrderResponse> {
  return orderResponseSchema.parse(await application.http.get(`/orders/${orderId}`));
}
