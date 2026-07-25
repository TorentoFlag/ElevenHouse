import { describe, expect, it, vi } from "vitest";
import {
  PaymentCheckoutOrderAccessDeniedError,
  PaymentCheckoutOrderNotPayableError,
  createPaymentCheckout,
  type CreatePaymentAttemptInput,
  type FinanceOrder,
  type FinanceOrderStore,
  type PaymentAttempt,
  type PaymentProviderPort,
  type PaymentStore
} from "../index";

const clientUserId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const paymentAttemptId = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-07-24T12:00:00.000Z");

describe("createPaymentCheckout", () => {
  it("commits the local attempt before opening the provider checkout and propagates order facts", async () => {
    const harness = createHarness();

    await expect(createCheckout(harness)).resolves.toEqual({
      paymentAttemptId,
      providerCheckoutId: "arc-checkout-1",
      checkoutUrl: "https://checkout.arcpay.space/session/arc-checkout-1"
    });

    expect(harness.provider.openCheckout).toHaveBeenCalledWith({
      paymentAttemptId,
      orderId,
      amount: { amountMinor: 500_00, currency: "RUB" },
      successUrl: "https://client.elevenhouse.test/payments/success",
      failureUrl: "https://client.elevenhouse.test/payments/failure",
      cancelUrl: "https://client.elevenhouse.test/payments/cancel"
    });
    expect(harness.paymentStore.createdInputs).toMatchObject([
      {
        id: paymentAttemptId,
        orderId,
        amount: { amountMinor: 500_00, currency: "RUB" },
        idempotencyKey: "checkout:request-1"
      }
    ]);
    expect(harness.paymentStore.markAttemptCheckoutOpened).toHaveBeenCalledWith({
      paymentAttemptId,
      providerCheckoutId: "arc-checkout-1",
      checkoutUrl: "https://checkout.arcpay.space/session/arc-checkout-1",
      now: now.toISOString()
    });
  });

  it("replays a persisted hosted checkout without another provider call", async () => {
    const harness = createHarness({
      replayedAttempt: attempt({
        status: "checkout_opened",
        providerCheckoutId: "arc-checkout-1",
        metadata: { checkoutUrl: "https://checkout.arcpay.space/session/arc-checkout-1" }
      })
    });

    await expect(createCheckout(harness)).resolves.toMatchObject({ paymentAttemptId });
    expect(harness.provider.openCheckout).not.toHaveBeenCalled();
  });

  it("recovers a committed attempt without provider checkout data using its stable attempt id", async () => {
    const harness = createHarness({ replayedAttempt: attempt() });

    await createCheckout(harness);
    expect(harness.provider.openCheckout).toHaveBeenCalledTimes(1);
    expect(harness.provider.openCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ paymentAttemptId })
    );
  });

  it("rejects an order owned by a different client and an order no longer pending payment", async () => {
    await expect(
      createCheckout(createHarness({ order: { ...order(), clientUserId: "foreign-client" } }))
    ).rejects.toBeInstanceOf(PaymentCheckoutOrderAccessDeniedError);
    await expect(
      createCheckout(createHarness({ order: { ...order(), status: "paid" } }))
    ).rejects.toBeInstanceOf(PaymentCheckoutOrderNotPayableError);
  });
});

function createCheckout(harness: ReturnType<typeof createHarness>) {
  return createPaymentCheckout({
    orderStore: harness.orderStore,
    paymentStore: harness.paymentStore,
    provider: harness.provider,
    clientUserId,
    request: {
      orderId,
      successUrl: "https://client.elevenhouse.test/payments/success",
      failureUrl: "https://client.elevenhouse.test/payments/failure",
      cancelUrl: "https://client.elevenhouse.test/payments/cancel"
    },
    idempotencyKey: "checkout:request-1",
    now,
    idGenerator: () => paymentAttemptId
  });
}

function createHarness(
  options: {
    readonly order?: FinanceOrder;
    readonly replayedAttempt?: PaymentAttempt;
  } = {}
) {
  const createdInputs: CreatePaymentAttemptInput[] = [];
  let persistedAttempt = options.replayedAttempt ?? null;
  const paymentStore = {
    createdInputs,
    executeCreateCheckout: vi.fn(async (_command, createInput) => {
      if (persistedAttempt) return { kind: "replayed" as const, value: persistedAttempt };
      const input = await createInput();
      createdInputs.push(input);
      persistedAttempt = attempt(input);
      return { kind: "created" as const, value: persistedAttempt };
    }),
    markAttemptCheckoutOpened: vi.fn(async (input) => {
      persistedAttempt = attempt({
        ...persistedAttempt!,
        status: "checkout_opened",
        providerCheckoutId: input.providerCheckoutId,
        metadata: { ...persistedAttempt!.metadata, checkoutUrl: input.checkoutUrl },
        updatedAt: input.now
      });
      return persistedAttempt;
    })
  } satisfies Pick<PaymentStore, "executeCreateCheckout" | "markAttemptCheckoutOpened"> & {
    readonly createdInputs: CreatePaymentAttemptInput[];
  };
  const provider = {
    provider: "arc_pay",
    environment: "sandbox",
    openCheckout: vi.fn(async () => ({
      providerCheckoutId: "arc-checkout-1",
      checkoutUrl: "https://checkout.arcpay.space/session/arc-checkout-1"
    }))
  } satisfies PaymentProviderPort;
  return {
    orderStore: {
      findById: vi.fn(async () => options.order ?? order())
    } satisfies Pick<FinanceOrderStore, "findById">,
    paymentStore,
    provider
  };
}

function order(): FinanceOrder {
  return {
    id: orderId,
    clientUserId,
    astrologerUserId: "44444444-4444-4444-8444-444444444444",
    productId: "55555555-5555-4555-855555555555",
    directLinkIntentId: null,
    status: "pending_payment",
    grossAmount: { amountMinor: 500_00, currency: "RUB" },
    platformFee: { amountMinor: 50_00, currency: "RUB" },
    astrologerNetAmount: { amountMinor: 450_00, currency: "RUB" },
    financePolicySnapshotId: "66666666-6666-4666-8666-666666666666",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function attempt(overrides: Partial<PaymentAttempt> = {}): PaymentAttempt {
  return {
    id: paymentAttemptId,
    orderId,
    provider: "arc_pay",
    environment: "sandbox",
    status: "created",
    amount: { amountMinor: 500_00, currency: "RUB" },
    providerPaymentId: null,
    providerCheckoutId: null,
    idempotencyKey: "checkout:request-1",
    metadata: {},
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides
  };
}
