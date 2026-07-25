import "reflect-metadata";
import { BadRequestException, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  csrfRequiredMetadataKey,
  idempotencyRequiredMetadataKey
} from "../security/route-policy/route-security-metadata";
import { OrdersController } from "./orders.controller";
import type { OrdersService } from "./orders.service";

const clientUserId = "11111111-1111-4111-8111-111111111111";
const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const productId = "33333333-3333-4333-8333-333333333333";
const directLinkIntentId = "44444444-4444-4444-8444-444444444444";

describe("OrdersController", () => {
  it("declares CSRF and Idempotency-Key requirements for POST /orders", () => {
    const handler = OrdersController.prototype.createOrder;

    expect(Reflect.getMetadata(csrfRequiredMetadataKey, handler)).toBe(true);
    expect(Reflect.getMetadata(idempotencyRequiredMetadataKey, handler)).toEqual({
      scope: "orders.create"
    });
  });

  it("requires the client role and passes the Idempotency-Key header to the service", async () => {
    const service = {
      createOrder: vi.fn(async () => ({ id: "order_1" }))
    } as unknown as OrdersService;
    const controller = new OrdersController(service);
    const body = { astrologerUserId, productId, directLinkIntentId };

    await expect(
      controller.createOrder(clientRequest(["client", "astrologer"]), body, "order-create:key-1")
    ).resolves.toEqual({ id: "order_1" });

    expect(service.createOrder).toHaveBeenCalledWith(clientUserId, body, "order-create:key-1");
  });

  it("rejects missing sessions, non-client sessions and missing idempotency headers", async () => {
    const controller = new OrdersController({
      createOrder: vi.fn()
    } as unknown as OrdersService);
    const body = { astrologerUserId, productId, directLinkIntentId };

    expect(() => controller.createOrder({ headers: {} }, body, "order-create:key-1")).toThrow(
      UnauthorizedException
    );
    expect(() =>
      controller.createOrder(clientRequest(["astrologer"]), body, "order-create:key-1")
    ).toThrow(ForbiddenException);
    expect(() => controller.createOrder(clientRequest(["client"]), body, undefined)).toThrow(
      BadRequestException
    );
  });
});

function clientRequest(roles: readonly string[]) {
  return {
    headers: {},
    currentCustomerAccount: {
      account: {
        id: clientUserId,
        status: "active",
        roles
      }
    }
  } as never;
}
