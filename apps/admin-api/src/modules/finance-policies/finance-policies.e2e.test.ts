import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import type { PlatformRole } from "@elevenhouse/auth";
import { FinanceIdempotencyConflictError } from "@elevenhouse/domain";
import type {
  AuditLogStore,
  AuthSessionAuthenticationStore,
  FinanceOrder,
  FinanceOrderStore,
  FinancePolicySnapshot,
  FinancePolicyStore,
  LedgerStore,
  CreateLedgerEntryInput,
  PayoutRequestRecord,
  PayoutRequestStatus,
  PayoutStore,
  RiskTier
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemClock } from "../../common/system-clock.js";
import { AdminSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import { AUTH_SESSION_AUTHENTICATION_STORE } from "../identity/auth/identity-auth.tokens";
import { IdentityCurrentSessionService } from "../identity/session/identity-current-session.service";
import { AdminCsrfTokenService } from "../security/csrf/admin-csrf-token.service";
import { CsrfGuard } from "../security/csrf/csrf.guard";
import { FinancePoliciesController } from "./finance-policies.controller";
import { FinancePoliciesService } from "./finance-policies.service";
import { ADMIN_FINANCE_POLICY_UNIT_OF_WORK } from "./finance-policies.tokens";
import { DurableAdminFinancePolicyAuditSink } from "./finance-policies.audit";
import type { AdminFinancePolicyUnitOfWork } from "./finance-policies.unit-of-work";

const now = new Date("2026-07-25T10:00:00.000Z");
const sessionCookieName = "elevenhouse_admin_session";
const csrfCookieName = "elevenhouse_admin_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "admin-session-token";
const adminUserId = "11111111-1111-4111-8111-111111111111";
const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const orderId = "88888888-8888-4888-8888-888888888888";

let app: INestApplication;
let moduleRef: TestingModule;
let baseUrl: string;
let csrfToken: string;
let store: FinancePolicyStore;
let orderStore: Pick<FinanceOrderStore, "applyFinancePolicy" | "findById">;
let payoutStore: Pick<PayoutStore, "findRequestById" | "listRequests" | "updateRequestStatus">;
let ledgerStore: Pick<LedgerStore, "createTransaction" | "findWalletBalance">;
let auditLogStore: AuditLogStore;
let unitOfWork: AdminFinancePolicyUnitOfWork;
let roles: readonly PlatformRole[];

describe("admin finance policy HTTP flow", () => {
  beforeEach(async () => {
    roles = ["admin"];
    store = createFinancePolicyStore();
    orderStore = createOrderStore();
    payoutStore = createPayoutStore();
    ledgerStore = createLedgerStore();
    auditLogStore = createAuditLogStore();
    const completedFinanceCommands = new Map<string, Record<string, unknown>>();
    const financeCommandHashes = new Map<string, string>();
    unitOfWork = {
      execute: vi.fn(async (operation) =>
        operation({
          store,
          orderStore,
          payoutStore,
          ledgerStore,
          auditSink: new DurableAdminFinancePolicyAuditSink(auditLogStore)
        })
      ),
      executeIdempotent: async (input) => {
        const key = `${input.command.scope}:${input.command.idempotencyKey}`;
        const existingHash = financeCommandHashes.get(key);
        if (existingHash) {
          if (existingHash !== input.command.requestHash) {
            throw new FinanceIdempotencyConflictError();
          }
          const result = completedFinanceCommands.get(key);
          if (!result) throw new Error("Expected completed finance command result");
          const value = await input.replay(
            {
              store,
              orderStore,
              payoutStore,
              ledgerStore,
              auditSink: new DurableAdminFinancePolicyAuditSink(auditLogStore)
            },
            result
          );
          if (!value) throw new Error("Expected finance command replay value");
          return { kind: "replayed" as const, value };
        }

        financeCommandHashes.set(key, input.command.requestHash);
        const created = await input.create({
          store,
          orderStore,
          payoutStore,
          ledgerStore,
          auditSink: new DurableAdminFinancePolicyAuditSink(auditLogStore)
        });
        completedFinanceCommands.set(key, created.result);
        return { kind: "created" as const, value: created.value };
      }
    };

    moduleRef = await Test.createTestingModule({
      controllers: [FinancePoliciesController],
      providers: [
        FinancePoliciesService,
        AdminSessionAuthGuard,
        IdentityCurrentSessionService,
        CsrfGuard,
        AdminCsrfTokenService,
        { provide: SystemClock, useValue: { now: vi.fn(() => now) } },
        { provide: ConfigService, useValue: configService() },
        { provide: AUTH_SESSION_AUTHENTICATION_STORE, useValue: authStore() },
        { provide: ADMIN_FINANCE_POLICY_UNIT_OF_WORK, useValue: unitOfWork }
      ]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
    csrfToken = createCsrfToken(moduleRef.get(AdminCsrfTokenService));
  });

  afterEach(async () => {
    await app.close();
    await moduleRef.close();
  });

  it("lists active finance policies for authenticated internal users only", async () => {
    await expect(getJson("/admin/finance/policies")).resolves.toMatchObject({ status: 401 });

    const response = await getJson("/admin/finance/policies", authCookie());

    expect(response).toMatchObject({
      status: 200,
      body: {
        policies: [
          {
            riskTier: "standard",
            holdDurationHours: 48,
            reserveBps: 0,
            platformFeeBps: 1000,
            providerSettlementRequired: true
          }
        ]
      }
    });

    roles = ["client"];
    await expect(getJson("/admin/finance/policies", authCookie())).resolves.toMatchObject({
      status: 403
    });
  });

  it("requires authentication and CSRF before changing the default policy", async () => {
    const body = {
      riskTier: "standard",
      holdDurationHours: 72,
      reserveBps: 500,
      reserveReleaseDelayDays: 14,
      platformFeeBps: 1200,
      providerSettlementRequired: true
    };

    await expect(putJson("/admin/finance/policies/default", body)).resolves.toMatchObject({
      status: 401
    });
    await expect(
      putJson("/admin/finance/policies/default", body, authCookie())
    ).resolves.toMatchObject({ status: 403 });

    const response = await putJson(
      "/admin/finance/policies/default",
      body,
      authenticatedCookies(),
      {
        origin: "http://localhost:5175",
        [csrfHeaderName]: csrfToken
      }
    );

    expect(response).toMatchObject({
      status: 200,
      body: {
        riskTier: "standard",
        policyVersion: 2,
        holdDurationHours: 72,
        reserveBps: 500,
        reserveReleaseDelayDays: 14,
        platformFeeBps: 1200,
        providerSettlementRequired: true
      }
    });
    expect(auditLogStore.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: adminUserId,
        action: "finance_policy.updated",
        targetType: "finance_policy",
        metadata: { riskTier: "standard", policyVersion: 2 }
      })
    );
  });

  it("records manual astrologer risk overrides with required reason", async () => {
    const invalid = await putJson(
      `/admin/finance/risk-profiles/${astrologerUserId}`,
      {
        riskTier: "standard",
        manualRiskTier: "high",
        manualOverrideReason: null,
        holdDurationHoursOverride: 168,
        reserveBpsOverride: 1500,
        reserveReleaseDelayDaysOverride: 30,
        platformFeeBpsOverride: null,
        providerSettlementRequiredOverride: true
      },
      authenticatedCookies(),
      {
        origin: "http://localhost:5175",
        [csrfHeaderName]: csrfToken
      }
    );
    expect(invalid).toMatchObject({ status: 400 });

    const response = await putJson(
      `/admin/finance/risk-profiles/${astrologerUserId}`,
      {
        riskTier: "standard",
        manualRiskTier: "high",
        manualOverrideReason: "Chargeback risk review",
        holdDurationHoursOverride: 168,
        reserveBpsOverride: 1500,
        reserveReleaseDelayDaysOverride: 30,
        platformFeeBpsOverride: null,
        providerSettlementRequiredOverride: true
      },
      authenticatedCookies(),
      {
        origin: "http://localhost:5175",
        [csrfHeaderName]: csrfToken
      }
    );

    expect(response).toMatchObject({
      status: 200,
      body: {
        astrologerUserId,
        riskTier: "standard",
        manualRiskTier: "high",
        manualOverrideReason: "Chargeback risk review",
        holdDurationHoursOverride: 168,
        reserveBpsOverride: 1500,
        reserveReleaseDelayDaysOverride: 30,
        providerSettlementRequiredOverride: true,
        reviewedByUserId: adminUserId,
        reviewedAt: now.toISOString()
      }
    });
    expect(auditLogStore.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: adminUserId,
        action: "astrologer_risk_profile.updated",
        targetType: "astrologer_risk_profile",
        targetId: astrologerUserId,
        metadata: { riskTier: "standard", manualRiskTier: "high" }
      })
    );
  });

  it("applies the current risk policy to an active order with CSRF and audit evidence", async () => {
    await expect(
      postJson(`/admin/finance/orders/${orderId}/apply-risk-policy`, undefined, authCookie())
    ).resolves.toMatchObject({ status: 403 });

    const response = await postJson(
      `/admin/finance/orders/${orderId}/apply-risk-policy`,
      undefined,
      authenticatedCookies(),
      {
        origin: "http://localhost:5175",
        [csrfHeaderName]: csrfToken
      }
    );

    expect(response).toMatchObject({
      status: 201,
      body: {
        id: orderId,
        status: "paid",
        financePolicySnapshotId: "33333333-3333-4333-8333-333333333333",
        financePolicyRiskTier: "standard",
        financePolicyHoldDurationHours: 48,
        financePolicyReserveBps: 0,
        financePolicyPlatformFeeBps: 1000,
        financePolicyProviderSettlementRequired: true
      }
    });
    expect(auditLogStore.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: adminUserId,
        action: "finance_policy.applied_to_order",
        targetType: "finance_order",
        targetId: orderId,
        metadata: expect.objectContaining({
          beforePolicySnapshotId: "99999999-9999-4999-8999-999999999999",
          afterPolicySnapshotId: "33333333-3333-4333-8333-333333333333"
        })
      })
    );
  });

  it("lists manual payout requests and updates payout status with ledger and audit evidence", async () => {
    const queue = await getJson("/admin/finance/payout-requests", authCookie());

    expect(queue).toMatchObject({
      status: 200,
      body: {
        summary: {
          requestedCount: 1,
          underReviewCount: 0,
          processingCount: 1,
          readyToPayAmount: { amountMinor: 10_000_00, currency: "RUB" },
          processingAmount: { amountMinor: 15_000_00, currency: "RUB" }
        },
        requests: expect.arrayContaining([
          expect.objectContaining({
            id: "44444444-4444-4444-8444-444444444444",
            status: "requested",
            method: "manual_bank_transfer"
          })
        ])
      }
    });

    await expect(
      putJson(
        "/admin/finance/payout-requests/55555555-5555-4555-8555-555555555555/status",
        {
          status: "paid",
          externalReference: "bank-transfer-1001",
          transferredAt: now.toISOString(),
          adminNote: "Paid manually"
        },
        authCookie()
      )
    ).resolves.toMatchObject({ status: 403 });

    const paid = await putJson(
      "/admin/finance/payout-requests/55555555-5555-4555-8555-555555555555/status",
      {
        status: "paid",
        externalReference: "bank-transfer-1001",
        transferredAt: now.toISOString(),
        adminNote: "Paid manually"
      },
      authenticatedCookies(),
      {
        origin: "http://localhost:5175",
        [csrfHeaderName]: csrfToken
      }
    );

    expect(paid).toMatchObject({
      status: 200,
      body: {
        id: "55555555-5555-4555-8555-555555555555",
        status: "paid",
        externalReference: "bank-transfer-1001",
        transferredAt: now.toISOString(),
        adminUserId
      }
    });
    const replayed = await putJson(
      "/admin/finance/payout-requests/55555555-5555-4555-8555-555555555555/status",
      {
        status: "paid",
        externalReference: "bank-transfer-1001",
        transferredAt: now.toISOString(),
        adminNote: "Paid manually"
      },
      authenticatedCookies(),
      {
        origin: "http://localhost:5175",
        [csrfHeaderName]: csrfToken
      }
    );

    expect(replayed).toMatchObject({
      status: 200,
      body: {
        id: "55555555-5555-4555-8555-555555555555",
        status: "paid",
        externalReference: "bank-transfer-1001"
      }
    });
    expect(ledgerStore.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: "payout_paid",
        payoutRequestId: "55555555-5555-4555-8555-555555555555"
      })
    );
    expect(ledgerStore.createTransaction).toHaveBeenCalledTimes(1);
    expect(auditLogStore.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: adminUserId,
        action: "payout_request.status_updated",
        targetType: "payout_request",
        targetId: "55555555-5555-4555-8555-555555555555",
        metadata: expect.objectContaining({
          status: "paid",
          externalReference: "bank-transfer-1001"
        })
      })
    );
    expect(auditLogStore.createEntry).toHaveBeenCalledTimes(1);
  });
});

async function getJson(path: string, cookie?: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: cookie ? { cookie } : {}
  });
  return { status: response.status, body: await response.json() };
}

async function putJson(
  path: string,
  body: unknown,
  cookie?: string,
  headers: Record<string, string> = {}
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...headers
    },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

async function postJson(
  path: string,
  body?: unknown,
  cookie?: string,
  headers: Record<string, string> = {}
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
      ...headers
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, body: await response.json() };
}

function authenticatedCookies(): string {
  return `${authCookie()}; ${csrfCookieName}=${csrfToken}`;
}

function authCookie(): string {
  return `${sessionCookieName}=${sessionToken}`;
}

function createCsrfToken(service: AdminCsrfTokenService): string {
  let token = "";
  service.setCsrfCookie({
    response: {
      cookie: (_name, value) => {
        token = value;
      }
    },
    sessionToken,
    sessionExpiresAt: "2026-07-26T10:00:00.000Z",
    now
  });
  return token;
}

function createAuditLogStore(): AuditLogStore {
  return {
    createEntry: vi.fn(async (input) => ({
      id: "77777777-7777-4777-8777-777777777777",
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      occurredAt: input.occurredAt,
      metadata: input.metadata
    }))
  };
}

function createFinancePolicyStore(): FinancePolicyStore {
  let latestVersion = 1;
  const activePolicy = policy({
    id: "33333333-3333-4333-8333-333333333333",
    policyVersion: latestVersion,
    riskTier: "standard",
    holdDurationHours: 48,
    reserveBps: 0,
    reserveReleaseDelayDays: 0,
    platformFeeBps: 1000,
    providerSettlementRequired: true
  });

  return {
    findActivePolicyByRiskTier: vi.fn(async (riskTier) =>
      riskTier === "standard" ? activePolicy : null
    ),
    findLatestPolicyVersion: vi.fn(async () => latestVersion),
    findEffectivePolicyForAstrologer: vi.fn(async () => ({
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
    })),
    createPolicySnapshot: vi.fn(async (input) => {
      latestVersion = input.policyVersion;
      return policy({
        id: input.id ?? "44444444-4444-4444-8444-444444444444",
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
      });
    }),
    upsertAstrologerRiskProfile: vi.fn(async (input) => ({
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
    }))
  };
}

function createOrderStore(): Pick<FinanceOrderStore, "applyFinancePolicy" | "findById"> {
  let currentOrder = order();
  return {
    findById: vi.fn(async (id) => (id === currentOrder.id ? currentOrder : null)),
    applyFinancePolicy: vi.fn(async (input) => {
      if (input.orderId !== currentOrder.id) return null;
      currentOrder = {
        ...currentOrder,
        financePolicySnapshotId: input.financePolicySnapshotId,
        financePolicyRiskTier: input.financePolicyRiskTier,
        financePolicyHoldDurationHours: input.financePolicyHoldDurationHours,
        financePolicyReserveBps: input.financePolicyReserveBps,
        financePolicyReserveReleaseDelayDays: input.financePolicyReserveReleaseDelayDays,
        financePolicyPlatformFeeBps: input.financePolicyPlatformFeeBps,
        financePolicyProviderSettlementRequired: input.financePolicyProviderSettlementRequired,
        updatedAt: input.now
      };
      return currentOrder;
    })
  };
}

function policy(
  overrides: Partial<FinancePolicySnapshot> & Pick<FinancePolicySnapshot, "id" | "riskTier">
): FinancePolicySnapshot {
  return {
    id: overrides.id,
    policyVersion: overrides.policyVersion ?? 1,
    riskTier: overrides.riskTier,
    holdDurationHours: overrides.holdDurationHours ?? 48,
    reserveBps: overrides.reserveBps ?? 0,
    reserveReleaseDelayDays: overrides.reserveReleaseDelayDays ?? 0,
    platformFeeBps: overrides.platformFeeBps ?? 1000,
    providerSettlementRequired: overrides.providerSettlementRequired ?? true,
    isActive: overrides.isActive ?? true,
    createdByUserId: overrides.createdByUserId ?? null,
    snapshottedAt: overrides.snapshottedAt ?? now.toISOString(),
    createdAt: overrides.createdAt ?? now.toISOString()
  };
}

function createPayoutStore(): Pick<
  PayoutStore,
  "findRequestById" | "listRequests" | "updateRequestStatus"
> {
  let requests: PayoutRequestRecord[] = [
    payoutRequest({
      id: "44444444-4444-4444-8444-444444444444",
      status: "requested",
      amountMinor: 10_000_00
    }),
    payoutRequest({
      id: "55555555-5555-4555-8555-555555555555",
      status: "processing_manual",
      amountMinor: 15_000_00,
      reviewedAt: now.toISOString(),
      adminUserId
    })
  ];

  return {
    findRequestById: vi.fn(
      async (payoutRequestId) => requests.find((request) => request.id === payoutRequestId) ?? null
    ),
    listRequests: vi.fn(async () => requests),
    updateRequestStatus: vi.fn(async (input) => {
      const existing = requests.find((request) => request.id === input.payoutRequestId);
      if (!existing) return null;
      const updated = {
        ...existing,
        status: input.status,
        adminUserId: input.adminUserId,
        adminNote: input.adminNote ?? null,
        failureReason: input.failureReason ?? null,
        externalReference: input.externalReference ?? null,
        transferredAt: input.transferredAt ?? null,
        providerPayoutId: input.providerPayoutId ?? null,
        reviewedAt: input.adminUserId ? input.now : existing.reviewedAt,
        completedAt:
          input.status === "paid" || input.status === "failed" ? input.now : existing.completedAt,
        updatedAt: input.now
      };
      requests = requests.map((request) => (request.id === updated.id ? updated : request));
      return updated;
    })
  };
}

function createLedgerStore(): Pick<LedgerStore, "createTransaction" | "findWalletBalance"> {
  return {
    createTransaction: vi.fn(async (input) => ({
      ...input,
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      entries: input.entries.map((entry: CreateLedgerEntryInput, index: number) => ({
        ...entry,
        id: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${index}`,
        ledgerAccountId: `cccccccc-cccc-4ccc-8ccc-ccccccccccc${index}`
      }))
    })),
    findWalletBalance: vi.fn(async () => ({
      astrologerUserId,
      pending: { amountMinor: 0, currency: "RUB" as const },
      available: { amountMinor: 25_000_00, currency: "RUB" as const },
      reserved: { amountMinor: 0, currency: "RUB" as const },
      payoutPending: { amountMinor: 15_000_00, currency: "RUB" as const },
      negativeBalance: { amountMinor: 0, currency: "RUB" as const },
      updatedAt: now.toISOString()
    }))
  };
}

function payoutRequest(overrides: {
  readonly id: string;
  readonly status: PayoutRequestStatus;
  readonly amountMinor: number;
  readonly reviewedAt?: string | null;
  readonly adminUserId?: string | null;
}) {
  return {
    id: overrides.id,
    astrologerUserId,
    payoutMethodId: "33333333-3333-4333-8333-333333333333",
    status: overrides.status,
    amount: { amountMinor: overrides.amountMinor, currency: "RUB" as const },
    method: "manual_bank_transfer" as const,
    provider: null,
    environment: null,
    requestedAt: now.toISOString(),
    reviewedAt: overrides.reviewedAt ?? null,
    completedAt: null,
    adminUserId: overrides.adminUserId ?? null,
    adminNote: null,
    failureReason: null,
    externalReference: null,
    transferredAt: null,
    providerPayoutId: null,
    metadata: {},
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function order(overrides: Partial<FinanceOrder> = {}): FinanceOrder {
  return {
    id: orderId,
    clientUserId: "99999999-9999-4999-8999-999999999990",
    astrologerUserId,
    productId: "99999999-9999-4999-8999-999999999991",
    directLinkIntentId: null,
    bookingId: null,
    status: "paid",
    grossAmount: { amountMinor: 500_00, currency: "RUB" },
    platformFee: { amountMinor: 50_00, currency: "RUB" },
    astrologerNetAmount: { amountMinor: 450_00, currency: "RUB" },
    financePolicySnapshotId: "99999999-9999-4999-8999-999999999999",
    financePolicyRiskTier: "low",
    financePolicyHoldDurationHours: 24,
    financePolicyReserveBps: 0,
    financePolicyReserveReleaseDelayDays: 0,
    financePolicyPlatformFeeBps: 1000,
    financePolicyProviderSettlementRequired: true,
    createdAt: "2026-07-24T10:00:00.000Z",
    updatedAt: "2026-07-24T10:00:00.000Z",
    ...overrides
  };
}

function authStore(): AuthSessionAuthenticationStore {
  return {
    findByTokenHash: vi.fn(async (tokenHash: string) => ({
      session: {
        id: "55555555-5555-4555-8555-555555555555",
        userId: adminUserId,
        tokenHash,
        status: "active" as const,
        createdAt: now.toISOString(),
        expiresAt: "2026-07-26T10:00:00.000Z"
      },
      user: {
        id: adminUserId,
        status: "active" as const,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      },
      roleAssignments: roles.map((role, index) => ({
        id: `66666666-6666-4666-8666-66666666666${index}`,
        userId: adminUserId,
        role,
        assignedAt: now.toISOString()
      }))
    }))
  };
}

function configService(): Pick<ConfigService, "get" | "getOrThrow"> {
  return {
    get: vi.fn(() => undefined),
    getOrThrow: vi.fn((key: string) => {
      if (key === "adminApi.sessionCookieName") return sessionCookieName;
      if (key === "adminApi.csrfSecret") return "test-admin-csrf-secret-with-enough-entropy";
      if (key === "adminApi.csrfCookieName") return csrfCookieName;
      if (key === "adminApi.csrfHeaderName") return csrfHeaderName;
      if (key === "adminApi.csrfTokenTtlSeconds") return 604800;
      if (key === "adminApi.sessionCookieSecure") return false;
      if (key === "adminApi.allowedOrigins") return ["http://localhost:5175"];
      throw new Error(`Unexpected config key: ${key}`);
    })
  };
}
