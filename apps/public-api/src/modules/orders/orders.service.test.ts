import { HttpException } from "@nestjs/common";
import {
  FinanceIdempotencyConflictError,
  OrderClientRelationshipRequiredError,
  OrderFinancePolicyUnavailableError,
  OrderProductNotAvailableError,
  type ClientAstrologerRelationshipReader,
  type CreateFinanceOrderRecordInput,
  type EffectiveFinancePolicy,
  type FinanceOrder,
  type FinanceOrderStore,
  type FinancePolicyStore,
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
const now = new Date("2026-07-24T10:00:00.000Z");

describe("OrdersService", () => {
  it("creates a contract-safe order response", async () => {
    const service = createService();

    await expect(
      service.createOrder(
        clientUserId,
        { astrologerUserId, productId, directLinkIntentId },
        "order-create:key-1"
      )
    ).resolves.toEqual({
      id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      ),
      clientUserId,
      astrologerUserId,
      productId,
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
      financePolicyPlatformFeeBps: 1_000,
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
        { astrologerUserId, productId, directLinkIntentId },
        "order-create:key-1"
      )
    ).rejects.toSatisfy(hasHttpError(403, new OrderClientRelationshipRequiredError().code));

    await expect(
      createService({ product: null }).createOrder(
        clientUserId,
        { astrologerUserId, productId, directLinkIntentId },
        "order-create:key-1"
      )
    ).rejects.toSatisfy(hasHttpError(404, new OrderProductNotAvailableError().code));

    await expect(
      createService({ hasPolicy: false }).createOrder(
        clientUserId,
        { astrologerUserId, productId, directLinkIntentId },
        "order-create:key-1"
      )
    ).rejects.toSatisfy(hasHttpError(409, new OrderFinancePolicyUnavailableError().code));
  });

  it("maps idempotency conflicts to HTTP 409", async () => {
    await expect(
      createService({ conflict: true }).createOrder(
        clientUserId,
        { astrologerUserId, productId, directLinkIntentId },
        "order-create:key-1"
      )
    ).rejects.toSatisfy(hasHttpError(409, new FinanceIdempotencyConflictError().code));
  });
});

function createService(options: {
  readonly hasRelationship?: boolean;
  readonly product?: Product | null;
  readonly hasPolicy?: boolean;
  readonly conflict?: boolean;
} = {}): OrdersService {
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
  const orderStore = createOrderStore(options.conflict);

  return new OrdersService(orderStore, relationshipReader, productStore, financePolicyStore, {
    now: () => now
  });
}

const activeProduct = {
  id: productId,
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
  includedItems: [],
  modifiers: [],
  createdAt: now.toISOString(),
  updatedAt: now.toISOString()
} satisfies Product;

function createOrderStore(conflict = false): FinanceOrderStore {
  return {
    executeCreateOrder: vi.fn(async (_command, createInput) => {
      if (conflict) throw new FinanceIdempotencyConflictError();
      const input = await createInput();
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
    platformFeeBps: 1_000,
    providerSettlementRequired: true
  };
}

function toOrder(input: CreateFinanceOrderRecordInput): FinanceOrder {
  return {
    id: input.id ?? orderId,
    clientUserId: input.clientUserId,
    astrologerUserId: input.astrologerUserId,
    productId: input.productId,
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
    financePolicyPlatformFeeBps: input.financePolicyPlatformFeeBps,
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
