import { HttpException } from "@nestjs/common";
import {
  FinanceIdempotencyConflictError,
  OrderClientRelationshipRequiredError,
  OrderFinancePolicyUnavailableError,
  OrderProductNotAvailableError,
  OrderProductRevisionConflictError,
  OrderPurchaseAuthorityChangedError,
  createPlatformTariffDraft,
  type ClientAstrologerRelationshipReader,
  type CreateFinanceOrderRecordInput,
  type EffectiveFinancePolicy,
  type FinanceOrder,
  type FinanceOrderStore,
  type FinancePolicyStore,
  type PlatformTariffEntitlementStore,
  type Product,
  type ProductStore
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import { OrdersService } from "./orders.service";

const clientUserId = "11111111-1111-4111-8111-111111111111";
const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const productId = "33333333-3333-4333-8333-333333333333";
const directLinkIntentId = "44444444-4444-4444-8444-444444444444";
const policyId = "55555555-5555-4555-8555-555555555555";
const orderId = "66666666-6666-4666-8666-666666666666";
const bookingId = "77777777-7777-4777-8777-777777777777";
const now = new Date("2026-07-24T10:00:00.000Z");
const tariff = {
  ...createPlatformTariffDraft({
    tariffSeriesId: "pro",
    version: 1,
    name: "Pro",
    tagline: "For active practice",
    monthlyPriceMinor: 2_500,
    yearlyPriceMinor: 25_000,
    clientSaleCommissionBps: 800,
    monthlyRecurringFrequencyDays: 30,
    yearlyRecurringFrequencyDays: 365,
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

describe("OrdersService", () => {
  it("creates a contract-safe order response", async () => {
    const service = createService();

    await expect(
      service.createOrder(
        clientUserId,
        { astrologerUserId, productId, expectedProductRevision: 1, directLinkIntentId, bookingId },
        "order-create:key-1"
      )
    ).resolves.toEqual({
      id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      ),
      clientUserId,
      astrologerUserId,
      productId,
      productTitleSnapshot: "Natal reading",
      directLinkIntentId,
      bookingId,
      status: "pending_payment",
      grossAmount: { amountMinor: 500_00, currency: "RUB" },
      platformFee: { amountMinor: 40_00, currency: "RUB" },
      astrologerNetAmount: { amountMinor: 460_00, currency: "RUB" },
      financePolicySnapshotId: policyId,
      financePolicyRiskTier: "standard",
      financePolicyHoldDurationHours: 48,
      financePolicyReserveBps: 0,
      financePolicyReserveReleaseDelayDays: 0,
      financePolicyProviderSettlementRequired: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });
  });

  it("maps invalid requests and domain order guards to stable HTTP errors", async () => {
    await expect(
      createService().createOrder(clientUserId, { productId }, "order-create:key-1")
    ).rejects.toSatisfy(hasHttpError(400, "invalid_request"));

    await expect(
      createService({ hasRelationship: false }).createOrder(
        clientUserId,
        { astrologerUserId, productId, expectedProductRevision: 1, directLinkIntentId, bookingId },
        "order-create:key-1"
      )
    ).rejects.toSatisfy(hasHttpError(403, new OrderClientRelationshipRequiredError().code));

    await expect(
      createService({ product: null }).createOrder(
        clientUserId,
        { astrologerUserId, productId, expectedProductRevision: 1, directLinkIntentId, bookingId },
        "order-create:key-1"
      )
    ).rejects.toSatisfy(hasHttpError(404, new OrderProductNotAvailableError().code));

    await expect(
      createService({ hasPolicy: false }).createOrder(
        clientUserId,
        { astrologerUserId, productId, expectedProductRevision: 1, directLinkIntentId, bookingId },
        "order-create:key-1"
      )
    ).rejects.toSatisfy(hasHttpError(409, new OrderFinancePolicyUnavailableError().code));

    await expect(
      createService({ product: { ...activeProduct, revision: 2 } }).createOrder(
        clientUserId,
        { astrologerUserId, productId, expectedProductRevision: 1, directLinkIntentId, bookingId },
        "order-create:key-1"
      )
    ).rejects.toSatisfy(hasHttpError(409, new OrderProductRevisionConflictError(1, 2).code));

    await expect(
      createService({ orderError: new OrderPurchaseAuthorityChangedError() }).createOrder(
        clientUserId,
        { astrologerUserId, productId, expectedProductRevision: 1, directLinkIntentId, bookingId },
        "order-create:key-1"
      )
    ).rejects.toSatisfy(hasHttpError(409, new OrderPurchaseAuthorityChangedError().code));
  });

  it("maps idempotency conflicts to HTTP 409", async () => {
    await expect(
      createService({ conflict: true }).createOrder(
        clientUserId,
        { astrologerUserId, productId, expectedProductRevision: 1, directLinkIntentId, bookingId },
        "order-create:key-1"
      )
    ).rejects.toSatisfy(hasHttpError(409, new FinanceIdempotencyConflictError().code));
  });
});

function createService(
  options: {
    readonly hasRelationship?: boolean;
    readonly product?: Product | null;
    readonly hasPolicy?: boolean;
    readonly conflict?: boolean;
    readonly orderError?: Error;
  } = {}
): OrdersService {
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
      options.hasPolicy === false ? null : effectivePolicy()
    )
  } satisfies Pick<FinancePolicyStore, "findEffectivePolicyForAstrologer">;
  const orderStore = createOrderStore(options.conflict, options.orderError);
  const tariffAuthorityStore = {
    findCurrentSubscription: vi.fn(async () => ({
      subscriptionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ownerUserId: astrologerUserId,
      tariffSeriesId: tariff.tariffSeriesId,
      tariffVersion: tariff.version,
      tariffVersionDigest: tariff.canonicalDigest,
      commissionBpsSnapshot: tariff.clientSaleCommissionBps,
      version: 1,
      state: "active" as const,
      startsAt: "2026-07-01T00:00:00.000Z",
      endsAt: "2026-08-01T00:00:00.000Z"
    })),
    findTariffVersion: vi.fn(async () => tariff),
    findLatestHistoricalCapabilityGrant: vi.fn(async () => null)
  } satisfies PlatformTariffEntitlementStore;

  return new OrdersService(
    orderStore,
    relationshipReader,
    productStore,
    financePolicyStore,
    tariffAuthorityStore,
    {
      now: () => now
    }
  );
}

const activeProduct = {
  id: productId,
  revision: 1,
  ownerUserId: astrologerUserId,
  type: "single",
  status: "active",
  title: "Natal reading",
  subtitle: null,
  priceMinor: 500_00,
  currency: "RUB",
  coverMediaId: null,
  introVideoUrl: null,
  executionMode: "live",
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
  astroDiaryConfig: null,
  includedItems: [],
  modifiers: [],
  createdAt: now.toISOString(),
  updatedAt: now.toISOString()
} satisfies Product;

function createOrderStore(conflict = false, orderError?: Error): FinanceOrderStore {
  return {
    executeCreateOrder: vi.fn(async (_command, createInput) => {
      if (conflict) throw new FinanceIdempotencyConflictError();
      const input = await createInput();
      if (orderError) throw orderError;
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

function hasHttpError(status: number, code: string) {
  return (error: unknown) =>
    error instanceof HttpException &&
    error.getStatus() === status &&
    (error.getResponse() as { code?: string }).code === code;
}
