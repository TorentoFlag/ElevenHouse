import { describe, expect, it, vi } from "vitest";
import {
  PaymentCheckoutOrderAccessDeniedError,
  PaymentCheckoutOrderNotPayableError,
  createPaymentCheckout,
  releaseTerminalPaymentProviderWebhook,
  type Booking,
  type BookingCommandStore,
  type CreatePaymentAttemptInput,
  type FinanceOrder,
  type FinanceOrderStore,
  type PaymentAttempt,
  type PaymentProviderEvent,
  type PaymentProviderPort,
  type PaymentStore,
  type TerminalPaymentUnitOfWork
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

describe("releaseTerminalPaymentProviderWebhook", () => {
  it("records terminal provider evidence and releases the paid booking hold atomically", async () => {
    const harness = createTerminalHarness({
      order: order({ bookingId: "77777777-7777-4777-8777-777777777777" })
    });

    await expect(releaseTerminalPaymentProviderWebhook(terminalWebhook(harness))).resolves.toEqual({
      kind: "created",
      event: expect.objectContaining({ type: "payment.expired" })
    });

    expect(harness.orderStore.updateStatus).toHaveBeenCalledWith({
      orderId,
      status: "expired",
      now: now.toISOString()
    });
    expect(harness.bookingStore.releasePaidBookingPaymentHold).toHaveBeenCalledWith({
      bookingId: "77777777-7777-4777-8777-777777777777",
      state: "expired",
      now: now.toISOString()
    });
  });

  it("does not replay order or booking changes for an already stored terminal webhook", async () => {
    const existingEvent = providerEvent({ type: "payment.failed" });
    const harness = createTerminalHarness({
      order: order({ bookingId: "77777777-7777-4777-8777-777777777777" }),
      existingEvent
    });

    await expect(
      releaseTerminalPaymentProviderWebhook(terminalWebhook(harness, { type: "payment.failed" }))
    ).resolves.toEqual({ kind: "replayed", event: existingEvent });

    expect(harness.orderStore.updateStatus).not.toHaveBeenCalled();
    expect(harness.bookingStore.releasePaidBookingPaymentHold).not.toHaveBeenCalled();
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

function order(overrides: Partial<FinanceOrder> = {}): FinanceOrder {
  return {
    id: orderId,
    clientUserId,
    astrologerUserId: "44444444-4444-4444-8444-444444444444",
    productId: "55555555-5555-4555-855555555555",
    productTitleSnapshot: "Natal reading",
    directLinkIntentId: null,
    bookingId: null,
    status: "pending_payment",
    grossAmount: { amountMinor: 500_00, currency: "RUB" },
    platformFee: { amountMinor: 50_00, currency: "RUB" },
    astrologerNetAmount: { amountMinor: 450_00, currency: "RUB" },
    financePolicySnapshotId: "66666666-6666-4666-8666-666666666666",
    financePolicyRiskTier: "standard",
    financePolicyHoldDurationHours: 48,
    financePolicyReserveBps: 0,
    financePolicyReserveReleaseDelayDays: 0,
    tariffSeriesId: "pro",
    tariffVersion: 1,
    tariffVersionDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    tariffCommissionBps: 1_000,
    financePolicyProviderSettlementRequired: true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides
  };
}

function attempt(overrides: Partial<PaymentAttempt> = {}): PaymentAttempt {
  return {
    id: paymentAttemptId,
    orderId,
    provider: "arc_pay",
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

function createTerminalHarness(
  options: {
    readonly order?: FinanceOrder;
    readonly existingEvent?: PaymentProviderEvent;
  } = {}
) {
  const currentOrder = options.order ?? order();
  const paymentStore = {
    findAttemptById: vi.fn(async () => attempt({ status: "checkout_opened" })),
    findProviderEventByWebhookId: vi.fn(async () => options.existingEvent ?? null),
    linkAttemptToProviderPayment: vi.fn(async (input) =>
      attempt({ status: "checkout_opened", providerPaymentId: input.providerPaymentId })
    ),
    recordProviderEvent: vi.fn(async (input) => ({
      kind: "created" as const,
      event: providerEvent({ type: input.type, providerWebhookId: input.providerWebhookId })
    }))
  } satisfies Pick<
    PaymentStore,
    | "findAttemptById"
    | "findProviderEventByWebhookId"
    | "linkAttemptToProviderPayment"
    | "recordProviderEvent"
  >;
  const orderStore = {
    findById: vi.fn(async () => currentOrder),
    updateStatus: vi.fn(async (input) => ({
      ...currentOrder,
      status: input.status,
      updatedAt: input.now
    }))
  } satisfies Pick<FinanceOrderStore, "findById" | "updateStatus">;
  const bookingStore = {
    releasePaidBookingPaymentHold: vi.fn(async (input) => booking({ state: input.state }))
  } satisfies Pick<BookingCommandStore, "releasePaidBookingPaymentHold">;
  return {
    orderStore,
    bookingStore,
    terminalPayment: {
      transact: async (operation) =>
        operation({
          ...paymentStore,
          ...orderStore,
          releasePaidBookingPaymentHold: bookingStore.releasePaidBookingPaymentHold
        })
    } satisfies TerminalPaymentUnitOfWork
  };
}

function terminalWebhook(
  harness: ReturnType<typeof createTerminalHarness>,
  overrides: {
    readonly type?: "payment.failed" | "payment.declined" | "payment.expired" | "payment.voided";
  } = {}
) {
  return {
    terminalPayment: harness.terminalPayment,
    request: {
      paymentAttemptId,
      provider: "arc_pay" as const,
      providerWebhookId: "arc-webhook-terminal-1",
      providerPaymentId: "arc-payment-1",
      type: overrides.type ?? "payment.expired",
      occurredAt: now.toISOString(),
      receivedAt: now.toISOString(),
      payload: {},
      moneyFacts: {
        kind: "exact" as const,
        amounts: [{ amountMinor: 500_00, currency: "RUB" }] as const
      }
    }
  };
}

function providerEvent(overrides: Partial<PaymentProviderEvent> = {}): PaymentProviderEvent {
  return {
    id: "provider-event-1",
    paymentAttemptId,
    provider: "arc_pay",
    providerWebhookId: "arc-webhook-terminal-1",
    providerPaymentId: "arc-payment-1",
    type: "payment.expired",
    occurredAt: now.toISOString(),
    receivedAt: now.toISOString(),
    payload: {},
    ...overrides
  };
}

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    reservationId: "88888888-8888-4888-8888-888888888888",
    ownerUserId: "44444444-4444-4444-8444-444444444444",
    clientUserId,
    productId: "55555555-5555-4555-855555555555",
    source: "client_paid",
    state: "expired",
    holdExpiresAt: null,
    startAt: "2026-07-25T09:00:00.000Z",
    endAt: "2026-07-25T10:00:00.000Z",
    productTitle: "Натальный разбор",
    durationMinutes: 60,
    deliveryFormat: "video",
    priceMinor: 500_00,
    currency: "RUB",
    timeZone: "Europe/Moscow",
    policySnapshot: {
      bufferBeforeMinutes: 10,
      bufferAfterMinutes: 10,
      minimumNoticeMinutes: 360
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
    lifecycleRevision: overrides.lifecycleRevision ?? 0,
    clientDataRequirementsSnapshot: overrides.clientDataRequirementsSnapshot ?? {
      schemaVersion: "booking-client-data-requirements.v1",
      executionMode: "live",
      participantMode: "solo",
      requiredClientData: ["chart1"],
      methods: ["natal"]
    }
  };
}
