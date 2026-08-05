import { describe, expect, it, vi } from "vitest";

import { PaymentsController } from "./payments.controller";

const checkoutPreparationId = "11111111-1111-4111-8111-111111111111";
const clientUserId = "22222222-2222-4222-8222-222222222222";
const checkoutUrl = "https://checkout.arcpay.space/session/33333333-3333-4333-8333-333333333333";

describe("PaymentsController checkout action delivery", () => {
  it("uses a no-store owner-scoped 303 redirect rather than returning the Hosted Checkout URL as JSON", async () => {
    const resolveAction = vi.fn(async () => ({
      kind: "checkout_action_ready" as const,
      checkoutUrl
    }));
    const controller = new PaymentsController(
      undefined as never,
      { resolveAction } as never
    );
    const response = responseRecorder();

    await controller.resolveCheckoutAction(clientRequest(), checkoutPreparationId, response);

    expect(resolveAction).toHaveBeenCalledWith({
      checkoutPreparationId,
      clientUserId,
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/i)
    });
    expect(response.headers).toEqual({
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer"
    });
    expect(response.redirect).toHaveBeenCalledWith(303, checkoutUrl);
    expect(response.status).not.toHaveBeenCalled();
  });

  it("returns a retryable preparation state without loading or exposing a Hosted Checkout URL", async () => {
    const controller = new PaymentsController(
      undefined as never,
      { resolveAction: vi.fn(async () => ({ kind: "checkout_preparing" as const })) } as never
    );
    const response = responseRecorder();

    await controller.resolveCheckoutAction(clientRequest(), checkoutPreparationId, response);

    expect(response.redirect).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.json).toHaveBeenCalledWith({ state: "checkout_requested" });
    expect(response.headers).toEqual({
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer"
    });
  });

  it("reads an owner-scoped preparation state without returning provider data", async () => {
    const resolveState = vi.fn(async () => "checkout_ready" as const);
    const controller = new PaymentsController(
      undefined as never,
      { resolveState } as never
    );

    await expect(
      controller.getCheckoutPreparationState(clientRequest(), checkoutPreparationId)
    ).resolves.toEqual({ checkoutPreparationId, state: "checkout_ready" });
    expect(resolveState).toHaveBeenCalledWith({ checkoutPreparationId, clientUserId });
  });
});

function clientRequest() {
  return {
    headers: {},
    currentCustomerAccount: {
      account: { id: clientUserId, status: "active" as const, roles: ["client" as const] }
    }
  };
}

function responseRecorder() {
  const headers: Record<string, string> = {};
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return {
    headers,
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    redirect: vi.fn(),
    status,
    json
  };
}
