import { describe, expect, it, vi } from "vitest";
import {
  FinanceIdempotencyConflictError,
  OrderClientRelationshipRequiredError,
  OrderFinancePolicyUnavailableError,
  OrderBookingHoldRequiredError,
  OrderProductFiscalLabelInvalidError,
  OrderProductNotAvailableError,
  createPlatformTariffDraft,
  createOrder,
  type ClientAstrologerRelationshipReader,
  type CreateFinanceOrderRecordInput,
  type EffectiveFinancePolicy,
  type FinanceOrder,
  type FinanceOrderStore,
  type FinancePolicyStore,
  type Product,
  type ProductStore
} from "../index";

const clientUserId = "11111111-1111-4111-8111-111111111111";
const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const productId = "33333333-3333-4333-8333-333333333333";
const directLinkIntentId = "44444444-4444-4444-8444-444444444444";
const policyId = "55555555-5555-4555-8555-555555555555";
const orderId = "66666666-6666-4666-8666-666666666666";
const bookingId = "99999999-9999-4999-8999-999999999999";
const now = new Date("2026-07-24T10:00:00.000Z");
const tariffAuthorityVersion = {
  ...createPlatformTariffDraft({
  tariffSeriesId: "pro",
  version: 1,
  name: "Pro",
  tagline: "For active practice",
  monthlyPriceMinor: 2_500,
  yearlyPriceMinor: 25_000,
  monthlyRecurringFrequencyDays: 31,
  yearlyRecurringFrequencyDays: 365,
  clientSaleCommissionBps: 800,
  seatsLimit: 1,
  bookingsLimit: null,
  aiRequestsLimit: null,
  automationLimit: null,
  isPopular: false,
  displayOrder: 0,
    features: ["products"]
  }),
  lifecycle: "published" as const
};
const tariffDigest = tariffAuthorityVersion.canonicalDigest;

describe("createOrder", () => {
  it("creates a pending payment order from an active client relationship and active product", async () => {
    const harness = createHarness();

    await expect(
      createOrder({
        ...harness.dependencies,
        clientUserId,
        request: { astrologerUserId, productId, directLinkIntentId },
        idempotencyKey: "order-create:client:request-1",
        now,
        idGenerator: () => orderId
      })
    ).resolves.toMatchObject({
      id: orderId,
      status: "pending_payment",
      clientUserId,
      astrologerUserId,
      productId,
      productTitleSnapshot: "Natal reading",
      directLinkIntentId,
      grossAmount: { amountMinor: 500_00, currency: "RUB" },
      platformFee: { amountMinor: 40_00, currency: "RUB" },
      astrologerNetAmount: { amountMinor: 460_00, currency: "RUB" },
      financePolicySnapshotId: policyId,
      financePolicyRiskTier: "standard",
      financePolicyHoldDurationHours: 48,
      financePolicyReserveBps: 0,
      financePolicyReserveReleaseDelayDays: 0,
      tariffSeriesId: "pro",
      tariffVersion: 1,
      tariffVersionDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      tariffCommissionBps: 800,
      financePolicyProviderSettlementRequired: true
    });

    expect(harness.orderStore.executeCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: `orders.create:${clientUserId}`,
        idempotencyKey: "order-create:client:request-1",
        actorUserId: clientUserId,
        requestHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        now: now.toISOString()
      }),
      expect.any(Function)
    );
    expect(harness.orderStore.createdInputs[0]).toMatchObject({
      id: orderId,
      status: "pending_payment",
      grossAmount: { amountMinor: 500_00, currency: "RUB" },
      platformFee: { amountMinor: 40_00, currency: "RUB" },
      astrologerNetAmount: { amountMinor: 460_00, currency: "RUB" },
      financePolicyRiskTier: "standard",
      financePolicyHoldDurationHours: 48,
      financePolicyReserveBps: 0,
      financePolicyReserveReleaseDelayDays: 0,
      tariffCommissionBps: 800,
      financePolicyProviderSettlementRequired: true
    });
  });

  it("snapshots effective risk profile overrides on the created order", async () => {
    const harness = createHarness({
      effectivePolicy: {
        ...effectivePolicy(),
        riskTier: "high",
        holdDurationHours: 168,
        reserveBps: 2_000,
        reserveReleaseDelayDays: 90,
        providerSettlementRequired: false
      }
    });

    await createOrder({
      ...harness.dependencies,
      clientUserId,
      request: { astrologerUserId, productId, directLinkIntentId },
      idempotencyKey: "order-create:client:risk-override-1",
      now,
      idGenerator: () => orderId
    });

    expect(harness.orderStore.createdInputs[0]).toMatchObject({
      financePolicySnapshotId: policyId,
      financePolicyRiskTier: "high",
      financePolicyHoldDurationHours: 168,
      financePolicyReserveBps: 2_000,
      financePolicyReserveReleaseDelayDays: 90,
      financePolicyProviderSettlementRequired: false,
      tariffCommissionBps: 800,
      platformFee: { amountMinor: 40_00, currency: "RUB" },
      astrologerNetAmount: { amountMinor: 460_00, currency: "RUB" }
    });
  });

  it("supports repeat purchases after an existing relationship without a join intent id", async () => {
    const harness = createHarness();

    await expect(
      createOrder({
        ...harness.dependencies,
        clientUserId,
        request: { astrologerUserId, productId, directLinkIntentId: null },
        idempotencyKey: "order-create:client:request-1",
        now,
        idGenerator: () => orderId
      })
    ).resolves.toMatchObject({
      directLinkIntentId: null,
      status: "pending_payment"
    });

    expect(harness.orderStore.createdInputs[0]).toMatchObject({
      directLinkIntentId: null
    });
  });

  it("carries a paid booking hold into the created order for later payment confirmation", async () => {
    const harness = createHarness({ product: { ...activeProduct, executionMode: "live" } });

    await expect(
      createOrder({
        ...harness.dependencies,
        clientUserId,
        request: { astrologerUserId, productId, directLinkIntentId, bookingId },
        idempotencyKey: "order-create:client:booking-1",
        now,
        idGenerator: () => orderId
      })
    ).resolves.toMatchObject({
      id: orderId,
      bookingId,
      status: "pending_payment"
    });

    expect(harness.orderStore.createdInputs[0]).toMatchObject({
      bookingId,
      clientUserId,
      astrologerUserId,
      productId
    });
  });

  it("requires a paid booking hold before a live product can enter payment", async () => {
    const harness = createHarness({ product: { ...activeProduct, executionMode: "live" } });

    await expect(
      createOrder({
        ...harness.dependencies,
        clientUserId,
        request: { astrologerUserId, productId, directLinkIntentId },
        idempotencyKey: "order-create:client:live-without-hold-1",
        now
      })
    ).rejects.toBeInstanceOf(OrderBookingHoldRequiredError);

    expect(harness.orderStore.createdInputs).toHaveLength(0);
  });

  it("rejects clients without an active relationship to the astrologer", async () => {
    const harness = createHarness({ hasRelationship: false });

    await expect(
      createOrder({
        ...harness.dependencies,
        clientUserId,
        request: { astrologerUserId, productId, directLinkIntentId },
        idempotencyKey: "order-create:client:request-1",
        now
      })
    ).rejects.toBeInstanceOf(OrderClientRelationshipRequiredError);
  });

  it("checks the relationship before product availability to avoid product enumeration", async () => {
    const harness = createHarness({ hasRelationship: false, product: null });

    await expect(
      createOrder({
        ...harness.dependencies,
        clientUserId,
        request: { astrologerUserId, productId, directLinkIntentId },
        idempotencyKey: "order-create:client:request-1",
        now
      })
    ).rejects.toBeInstanceOf(OrderClientRelationshipRequiredError);
    expect(harness.productStore.findByOwnerAndId).not.toHaveBeenCalled();
  });

  it("rejects missing or inactive products without leaking unrelated products", async () => {
    const missing = createHarness({ product: null });
    await expect(
      createOrder({
        ...missing.dependencies,
        clientUserId,
        request: { astrologerUserId, productId, directLinkIntentId },
        idempotencyKey: "order-create:client:request-1",
        now
      })
    ).rejects.toBeInstanceOf(OrderProductNotAvailableError);

    const inactive = createHarness({ product: { ...activeProduct, status: "draft" } });
    await expect(
      createOrder({
        ...inactive.dependencies,
        clientUserId,
        request: { astrologerUserId, productId, directLinkIntentId },
        idempotencyKey: "order-create:client:request-1",
        now
      })
    ).rejects.toBeInstanceOf(OrderProductNotAvailableError);

    const freeProduct = createHarness({
      product: { ...activeProduct, paymentModel: "free", priceMinor: 0 }
    });
    await expect(
      createOrder({
        ...freeProduct.dependencies,
        clientUserId,
        request: { astrologerUserId, productId, directLinkIntentId },
        idempotencyKey: "order-create:client:request-1",
        now
      })
    ).rejects.toBeInstanceOf(OrderProductNotAvailableError);
  });

  it("rejects order creation when the astrologer has no effective finance policy", async () => {
    const harness = createHarness({ hasPolicy: false });

    await expect(
      createOrder({
        ...harness.dependencies,
        clientUserId,
        request: { astrologerUserId, productId, directLinkIntentId },
        idempotencyKey: "order-create:client:request-1",
        now
      })
    ).rejects.toBeInstanceOf(OrderFinancePolicyUnavailableError);
  });

  it("does not reveal an orderable product when its persisted owner has no active tariff authority", async () => {
    const harness = createHarness({ hasTariffCommission: false });

    await expect(
      createOrder({
        ...harness.dependencies,
        clientUserId,
        request: { astrologerUserId, productId, directLinkIntentId },
        idempotencyKey: "order-create:client:no-tariff-1",
        now
      })
    ).rejects.toBeInstanceOf(OrderProductNotAvailableError);
  });

  it("does not reveal or sell an active product when its persisted owner lacks products entitlement", async () => {
    const harness = createHarness();
    harness.tariffAuthorityStore.findTariffVersion.mockResolvedValue({
      ...tariffAuthorityVersion,
      features: []
    });

    await expect(
      createOrder({
        ...harness.dependencies,
        clientUserId,
        request: { astrologerUserId, productId, directLinkIntentId },
        idempotencyKey: "order-create:client:products-entitlement-1",
        now
      })
    ).rejects.toBeInstanceOf(OrderProductNotAvailableError);

    expect(harness.orderStore.createdInputs).toHaveLength(0);
  });

  it("snapshots a fiscal-safe product title and rejects labels that cannot be issued on a receipt", async () => {
    const harness = createHarness({ product: { ...activeProduct, title: "x".repeat(129) } });

    await expect(
      createOrder({
        ...harness.dependencies,
        clientUserId,
        request: { astrologerUserId, productId, directLinkIntentId },
        idempotencyKey: "order-create:client:bad-fiscal-label-1",
        now
      })
    ).rejects.toBeInstanceOf(OrderProductFiscalLabelInvalidError);
    expect(harness.orderStore.createdInputs).toHaveLength(0);
  });

  it("replays an existing order and surfaces idempotency conflicts from the store", async () => {
    const replay = createHarness({ replay: true });
    await expect(
      createOrder({
        ...replay.dependencies,
        clientUserId,
        request: { astrologerUserId, productId, directLinkIntentId },
        idempotencyKey: "order-create:client:request-1",
        now
      })
    ).resolves.toMatchObject({ id: "77777777-7777-4777-8777-777777777777" });
    expect(replay.orderStore.createdInputs).toHaveLength(0);

    const conflict = createHarness({ conflict: true });
    await expect(
      createOrder({
        ...conflict.dependencies,
        clientUserId,
        request: { astrologerUserId, productId, directLinkIntentId },
        idempotencyKey: "order-create:client:request-1",
        now
      })
    ).rejects.toBeInstanceOf(FinanceIdempotencyConflictError);
  });
});

const activeProduct = {
  id: productId,
  ownerUserId: astrologerUserId,
  type: "async",
  status: "active",
  title: "Natal reading",
  subtitle: null,
  priceMinor: 500_00,
  currency: "RUB",
  coverMediaId: null,
  introVideoUrl: null,
  executionMode: "async",
  paymentModel: "once",
  durationMinutes: 60,
  durationLabel: null,
  slaLabel: null,
  packageSessionCount: null,
  packageDiscountPercent: null,
  subscriptionPeriod: null,
  trialDays: null,
  participantMode: "solo",
  groupSize: null,
  deliveryFormats: [],
  requiredClientData: [],
  methods: [],
  accessGrants: [],
  includedItems: [],
  modifiers: [],
  createdAt: now.toISOString(),
  updatedAt: now.toISOString()
} satisfies Product;

function createHarness(options: {
  readonly hasRelationship?: boolean;
  readonly product?: Product | null;
  readonly hasPolicy?: boolean;
  readonly hasTariffCommission?: boolean;
  readonly effectivePolicy?: EffectiveFinancePolicy;
  readonly replay?: boolean;
  readonly conflict?: boolean;
} = {}) {
  const relationshipReader: ClientAstrologerRelationshipReader = {
    hasActiveRelationship: vi.fn(async () => options.hasRelationship ?? true)
  };
  const productStore = {
    findByOwnerAndId: vi.fn(async () =>
      Object.hasOwn(options, "product") ? (options.product ?? null) : activeProduct
    )
  } satisfies Pick<ProductStore, "findByOwnerAndId">;
  const financePolicyStore = {
    findEffectivePolicyForAstrologer: vi.fn(async () =>
      options.hasPolicy === false ? null : (options.effectivePolicy ?? effectivePolicy())
    )
  } satisfies Pick<FinancePolicyStore, "findEffectivePolicyForAstrologer">;
  const tariffAuthorityStore = {
    findCurrentSubscription: vi.fn(async () => options.hasTariffCommission === false ? null : ({
      subscriptionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ownerUserId: astrologerUserId,
      tariffSeriesId: "pro",
      tariffVersion: 1,
      tariffVersionDigest: tariffDigest,
      commissionBpsSnapshot: 800,
      version: 1,
      state: "active" as const,
      startsAt: "2026-07-01T00:00:00.000Z",
      endsAt: "2026-08-01T00:00:00.000Z"
    })),
    findTariffVersion: vi.fn(async () => tariffAuthorityVersion),
    findLatestHistoricalCapabilityGrant: vi.fn(async () => null)
  };
  const orderStore = createOrderStore({ replay: options.replay, conflict: options.conflict });

  return {
    dependencies: {
      relationshipReader,
      productStore,
      financePolicyStore,
      tariffAuthorityStore,
      orderStore
    },
    orderStore,
    productStore,
    tariffAuthorityStore
  };
}

function createOrderStore(options: {
  readonly replay?: boolean;
  readonly conflict?: boolean;
} = {}): FinanceOrderStore & { readonly createdInputs: CreateFinanceOrderRecordInput[] } {
  const createdInputs: CreateFinanceOrderRecordInput[] = [];
  return {
    createdInputs,
    executeCreateOrder: vi.fn(async (_command, createInput) => {
      if (options.conflict) throw new FinanceIdempotencyConflictError();
      if (options.replay) {
        return {
          kind: "replayed" as const,
          value: toOrder(
            createOrderRecordInput({ id: "77777777-7777-4777-8777-777777777777" })
          )
        };
      }

      const input = await createInput();
      createdInputs.push(input);
      return { kind: "created" as const, value: toOrder(input) };
    }),
    create: vi.fn(),
    updateStatus: vi.fn(),
    applyFinancePolicy: vi.fn(),
    findById: vi.fn()
  };
}

function effectivePolicy(): EffectiveFinancePolicy {
  return {
    policyId,
    policyVersion: 1,
    riskTier: "standard",
    baseRiskTier: "standard",
    profile: null,
    holdDurationHours: 48,
    reserveBps: 0,
    reserveReleaseDelayDays: 0,
    providerSettlementRequired: true
  };
}

function createOrderRecordInput(
  overrides: Partial<CreateFinanceOrderRecordInput> = {}
): CreateFinanceOrderRecordInput {
  return {
    id: orderId,
    clientUserId,
    astrologerUserId,
    productId,
    productTitleSnapshot: "Индивидуальная консультация",
    directLinkIntentId,
    bookingId: null,
    status: "pending_payment",
    grossAmount: { amountMinor: 500_00, currency: "RUB" },
    platformFee: { amountMinor: 50_00, currency: "RUB" },
    astrologerNetAmount: { amountMinor: 450_00, currency: "RUB" },
    financePolicySnapshotId: policyId,
    financePolicyRiskTier: "standard",
    financePolicyHoldDurationHours: 48,
    financePolicyReserveBps: 0,
    financePolicyReserveReleaseDelayDays: 0,
    tariffSeriesId: "pro",
    tariffVersion: 1,
    tariffVersionDigest: tariffDigest,
    tariffCommissionBps: 800,
    financePolicyProviderSettlementRequired: true,
    now: now.toISOString(),
    ...overrides
  };
}

function toOrder(input: CreateFinanceOrderRecordInput): FinanceOrder {
  return {
    id: input.id ?? orderId,
    clientUserId: input.clientUserId,
    astrologerUserId: input.astrologerUserId,
    productId: input.productId,
    productTitleSnapshot: input.productTitleSnapshot,
    directLinkIntentId: input.directLinkIntentId,
    bookingId: input.bookingId ?? null,
    status: input.status ?? "pending_payment",
    grossAmount: input.grossAmount,
    platformFee: input.platformFee,
    astrologerNetAmount: input.astrologerNetAmount,
    financePolicySnapshotId: input.financePolicySnapshotId,
    financePolicyRiskTier: input.financePolicyRiskTier,
    financePolicyHoldDurationHours: input.financePolicyHoldDurationHours,
    financePolicyReserveBps: input.financePolicyReserveBps,
    financePolicyReserveReleaseDelayDays: input.financePolicyReserveReleaseDelayDays,
    tariffSeriesId: input.tariffSeriesId,
    tariffVersion: input.tariffVersion,
    tariffVersionDigest: input.tariffVersionDigest,
    tariffCommissionBps: input.tariffCommissionBps,
    financePolicyProviderSettlementRequired: input.financePolicyProviderSettlementRequired,
    createdAt: input.now,
    updatedAt: input.now
  };
}
