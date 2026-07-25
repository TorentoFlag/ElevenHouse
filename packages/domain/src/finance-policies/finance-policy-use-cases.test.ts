import { describe, expect, it, vi } from "vitest";
import {
  applyEffectiveFinancePolicyToOrder,
  assignAstrologerRiskProfile,
  ensureDefaultFinancePolicy,
  FinancePolicyOrderNotApplicableError,
  updateFinancePolicy,
  type AstrologerRiskProfile,
  type CreateFinancePolicyInput,
  type EffectiveFinancePolicy,
  type FinanceOrder,
  type FinanceOrderStore,
  type FinancePolicySnapshot,
  type FinancePolicyStore,
  type RiskTier,
  type UpsertAstrologerRiskProfileInput
} from "../index";

const now = new Date("2026-07-25T10:00:00.000Z");
const adminUserId = "11111111-1111-4111-8111-111111111111";
const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const policyId = "33333333-3333-4333-8333-333333333333";
const orderId = "44444444-4444-4444-8444-444444444444";

describe("finance policy use cases", () => {
  it("creates the default standard policy with a 48 hour hold when no active policy exists", async () => {
    const store = createStore({ activePolicy: null, latestVersion: 0 });

    await expect(
      ensureDefaultFinancePolicy({
        store,
        adminUserId: null,
        now,
        idGenerator: () => policyId
      })
    ).resolves.toMatchObject({
      id: policyId,
      policyVersion: 1,
      riskTier: "standard",
      holdDurationHours: 48,
      reserveBps: 0,
      reserveReleaseDelayDays: 0,
      platformFeeBps: 1_000,
      providerSettlementRequired: true
    });

    expect(store.createPolicySnapshot).toHaveBeenCalledWith({
      id: policyId,
      policyVersion: 1,
      riskTier: "standard",
      holdDurationHours: 48,
      reserveBps: 0,
      reserveReleaseDelayDays: 0,
      platformFeeBps: 1_000,
      providerSettlementRequired: true,
      createdByUserId: null,
      now: now.toISOString()
    });
  });

  it("creates a new active policy version instead of mutating the existing snapshot", async () => {
    const existing = policySnapshot({
      id: "44444444-4444-4444-8444-444444444444",
      policyVersion: 7,
      holdDurationHours: 48,
      platformFeeBps: 1_000
    });
    const store = createStore({ activePolicy: existing, latestVersion: 12 });

    await expect(
      updateFinancePolicy({
        store,
        adminUserId,
        request: {
          riskTier: "standard",
          holdDurationHours: 72,
          reserveBps: 500,
          reserveReleaseDelayDays: 30,
          platformFeeBps: 1_200,
          providerSettlementRequired: true
        },
        now,
        idGenerator: () => policyId
      })
    ).resolves.toMatchObject({
      id: policyId,
      policyVersion: 13,
      holdDurationHours: 72,
      platformFeeBps: 1_200
    });

    expect(store.createPolicySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        policyVersion: 13,
        createdByUserId: adminUserId
      })
    );
    expect(existing).toMatchObject({
      id: "44444444-4444-4444-8444-444444444444",
      policyVersion: 7,
      holdDurationHours: 48,
      platformFeeBps: 1_000
    });
  });

  it("assigns a manual risk override with admin evidence and effective policy overrides", async () => {
    const store = createStore({ activePolicy: policySnapshot({ riskTier: "high" }) });

    await expect(
      assignAstrologerRiskProfile({
        store,
        adminUserId,
        astrologerUserId,
        request: {
          riskTier: "standard",
          manualRiskTier: "high",
          manualOverrideReason: "Chargeback risk after manual review",
          holdDurationHoursOverride: 168,
          reserveBpsOverride: 2_000,
          reserveReleaseDelayDaysOverride: 90,
          platformFeeBpsOverride: null,
          providerSettlementRequiredOverride: true
        },
        now
      })
    ).resolves.toMatchObject({
      astrologerUserId,
      riskTier: "standard",
      manualRiskTier: "high",
      manualOverrideReason: "Chargeback risk after manual review",
      holdDurationHoursOverride: 168,
      reserveBpsOverride: 2_000,
      reviewedByUserId: adminUserId,
      reviewedAt: now.toISOString()
    });

    expect(store.upsertAstrologerRiskProfile).toHaveBeenCalledWith({
      astrologerUserId,
      riskTier: "standard",
      manualRiskTier: "high",
      manualOverrideReason: "Chargeback risk after manual review",
      holdDurationHoursOverride: 168,
      reserveBpsOverride: 2_000,
      reserveReleaseDelayDaysOverride: 90,
      platformFeeBpsOverride: null,
      providerSettlementRequiredOverride: true,
      reviewedByUserId: adminUserId,
      reviewedAt: now.toISOString(),
      now: now.toISOString()
    });
  });

  it("keeps already created order policy snapshots pinned to the original policy id", async () => {
    const oldPolicy = policySnapshot({
      id: "55555555-5555-4555-8555-555555555555",
      policyVersion: 3,
      platformFeeBps: 1_000
    });
    const store = createStore({ activePolicy: oldPolicy, latestVersion: 3 });
    const orderSnapshotPolicyId = oldPolicy.id;

    await updateFinancePolicy({
      store,
      adminUserId,
      request: {
        riskTier: "standard",
        holdDurationHours: 24,
        reserveBps: 0,
        reserveReleaseDelayDays: 0,
        platformFeeBps: 2_000,
        providerSettlementRequired: true
      },
      now,
      idGenerator: () => policyId
    });

    expect(orderSnapshotPolicyId).toBe("55555555-5555-4555-8555-555555555555");
    expect(store.createPolicySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        id: policyId,
        platformFeeBps: 2_000
      })
    );
  });

  it("applies the astrologer's current effective risk policy to an active order explicitly", async () => {
    const store = createStore({
      activePolicy: policySnapshot({
        id: "55555555-5555-4555-8555-555555555555",
        riskTier: "high",
        holdDurationHours: 168,
        reserveBps: 2_000,
        reserveReleaseDelayDays: 90,
        platformFeeBps: 1_500
      })
    });
    const orderStore = createOrderStore({ order: order({ status: "paid" }) });

    await expect(
      applyEffectiveFinancePolicyToOrder({
        orderStore,
        financePolicyStore: store,
        orderId,
        now
      })
    ).resolves.toMatchObject({
      before: { id: orderId, financePolicySnapshotId: policyId },
      after: {
        id: orderId,
        financePolicySnapshotId: "55555555-5555-4555-8555-555555555555",
        financePolicyRiskTier: "high",
        financePolicyHoldDurationHours: 168,
        financePolicyReserveBps: 2_000,
        financePolicyReserveReleaseDelayDays: 90,
        financePolicyPlatformFeeBps: 1_500
      }
    });

    expect(orderStore.applyFinancePolicy).toHaveBeenCalledWith({
      orderId,
      financePolicySnapshotId: "55555555-5555-4555-8555-555555555555",
      financePolicyRiskTier: "high",
      financePolicyHoldDurationHours: 168,
      financePolicyReserveBps: 2_000,
      financePolicyReserveReleaseDelayDays: 90,
      financePolicyPlatformFeeBps: 1_500,
      financePolicyProviderSettlementRequired: true,
      now: now.toISOString()
    });
  });

  it("does not apply a new risk policy to terminal refunded orders", async () => {
    const store = createStore();
    const orderStore = createOrderStore({ order: order({ status: "refunded" }) });

    await expect(
      applyEffectiveFinancePolicyToOrder({
        orderStore,
        financePolicyStore: store,
        orderId,
        now
      })
    ).rejects.toBeInstanceOf(FinancePolicyOrderNotApplicableError);

    expect(orderStore.applyFinancePolicy).not.toHaveBeenCalled();
  });

  it("treats a status race during order policy update as not applicable", async () => {
    const store = createStore();
    const orderStore = createOrderStore({
      order: order({ status: "paid" }),
      applyResult: null
    });

    await expect(
      applyEffectiveFinancePolicyToOrder({
        orderStore,
        financePolicyStore: store,
        orderId,
        now
      })
    ).rejects.toBeInstanceOf(FinancePolicyOrderNotApplicableError);

    expect(orderStore.findById).toHaveBeenCalledTimes(2);
  });
});

function createStore(
  options: {
    readonly activePolicy?: FinancePolicySnapshot | null;
    readonly latestVersion?: number;
  } = {}
): FinancePolicyStore {
  const activePolicy = options.activePolicy === undefined ? policySnapshot() : options.activePolicy;
  return {
    findActivePolicyByRiskTier: vi.fn(async () => activePolicy),
    findLatestPolicyVersion: vi.fn(
      async () => options.latestVersion ?? activePolicy?.policyVersion ?? 0
    ),
    findEffectivePolicyForAstrologer: vi.fn(async (): Promise<EffectiveFinancePolicy | null> => {
      if (!activePolicy) return null;
      return {
        policyId: activePolicy.id,
        policyVersion: activePolicy.policyVersion,
        riskTier: activePolicy.riskTier,
        baseRiskTier: activePolicy.riskTier,
        profile: null,
        holdDurationHours: activePolicy.holdDurationHours,
        reserveBps: activePolicy.reserveBps,
        reserveReleaseDelayDays: activePolicy.reserveReleaseDelayDays,
        platformFeeBps: activePolicy.platformFeeBps,
        providerSettlementRequired: activePolicy.providerSettlementRequired
      };
    }),
    createPolicySnapshot: vi.fn(async (input: CreateFinancePolicyInput) =>
      policySnapshot({
        id: input.id ?? policyId,
        policyVersion: input.policyVersion,
        riskTier: input.riskTier,
        holdDurationHours: input.holdDurationHours,
        reserveBps: input.reserveBps,
        reserveReleaseDelayDays: input.reserveReleaseDelayDays,
        platformFeeBps: input.platformFeeBps,
        providerSettlementRequired: input.providerSettlementRequired,
        createdByUserId: input.createdByUserId,
        snapshottedAt: input.now,
        createdAt: input.now
      })
    ),
    upsertAstrologerRiskProfile: vi.fn(async (input: UpsertAstrologerRiskProfileInput) =>
      riskProfile(input)
    )
  };
}

function createOrderStore(input: {
  readonly order: FinanceOrder | null;
  readonly applyResult?: FinanceOrder | null;
}) {
  return {
    findById: vi.fn(async () => input.order),
    applyFinancePolicy: vi.fn(async (policyInput) => {
      if (input.applyResult !== undefined) return input.applyResult;
      if (!input.order) return null;
      return {
        ...input.order,
        financePolicySnapshotId: policyInput.financePolicySnapshotId,
        financePolicyRiskTier: policyInput.financePolicyRiskTier,
        financePolicyHoldDurationHours: policyInput.financePolicyHoldDurationHours,
        financePolicyReserveBps: policyInput.financePolicyReserveBps,
        financePolicyReserveReleaseDelayDays: policyInput.financePolicyReserveReleaseDelayDays,
        financePolicyPlatformFeeBps: policyInput.financePolicyPlatformFeeBps,
        financePolicyProviderSettlementRequired:
          policyInput.financePolicyProviderSettlementRequired,
        updatedAt: policyInput.now
      };
    })
  } satisfies Pick<FinanceOrderStore, "findById" | "applyFinancePolicy">;
}

function order(overrides: Partial<FinanceOrder> = {}): FinanceOrder {
  return {
    id: orderId,
    clientUserId: "55555555-5555-4555-8555-555555555555",
    astrologerUserId,
    productId: "66666666-6666-4666-8666-666666666666",
    directLinkIntentId: null,
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
    createdAt: "2026-07-24T10:00:00.000Z",
    updatedAt: "2026-07-24T10:00:00.000Z",
    ...overrides
  };
}

function policySnapshot(overrides: Partial<FinancePolicySnapshot> = {}): FinancePolicySnapshot {
  return {
    id: policyId,
    policyVersion: 1,
    riskTier: "standard",
    holdDurationHours: 48,
    reserveBps: 0,
    reserveReleaseDelayDays: 0,
    platformFeeBps: 1_000,
    providerSettlementRequired: true,
    isActive: true,
    createdByUserId: null,
    snapshottedAt: "2026-07-24T10:00:00.000Z",
    createdAt: "2026-07-24T10:00:00.000Z",
    ...overrides
  };
}

function riskProfile(input: UpsertAstrologerRiskProfileInput): AstrologerRiskProfile {
  return {
    astrologerUserId: input.astrologerUserId,
    riskTier: input.riskTier,
    manualRiskTier: input.manualRiskTier,
    manualOverrideReason: input.manualOverrideReason,
    holdDurationHoursOverride: input.holdDurationHoursOverride,
    reserveBpsOverride: input.reserveBpsOverride,
    reserveReleaseDelayDaysOverride: input.reserveReleaseDelayDaysOverride,
    platformFeeBpsOverride: input.platformFeeBpsOverride,
    providerSettlementRequiredOverride: input.providerSettlementRequiredOverride,
    reviewedByUserId: input.reviewedByUserId,
    reviewedAt: input.reviewedAt,
    updatedAt: input.now
  };
}
