import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import type { PlatformRole } from "@elevenhouse/auth";
import { FinanceIdempotencyConflictError } from "@elevenhouse/domain";
import type {
  AdminPaymentReversalCaseStore,
  AuditLogStore,
  AuthSessionAuthenticationStore,
  FinanceOrder,
  FinanceOrderStore,
  FinancePolicySnapshot,
  FinancePolicyStore,
  LedgerStore,
  ReconciliationRecord,
  ReconciliationStore,
  CreateLedgerEntryInput,
  PayoutRequestRecord,
  PayoutRequestStatus,
  PayoutStore
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
let reversalCaseStore: AdminPaymentReversalCaseStore;
let reconciliationStore: ReconciliationStore;
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
    reversalCaseStore = createReversalCaseStore();
    reconciliationStore = createReconciliationStore();
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
          reversalCaseStore,
          reconciliationStore,
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
              reversalCaseStore,
              reconciliationStore,
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
          reversalCaseStore,
          reconciliationStore,
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
          chargebackBlockedCount: 0,
          readyToPayAmount: { amountMinor: 10_000_00, currency: "RUB" },
          processingAmount: { amountMinor: 15_000_00, currency: "RUB" },
          chargebackBlockedAmount: { amountMinor: 0, currency: "RUB" }
        },
        requests: expect.arrayContaining([
          expect.objectContaining({
            id: "44444444-4444-4444-8444-444444444444",
            status: "requested",
            method: "manual_bank_transfer",
            blockedByChargeback: false
          })
        ])
      }
    });
    await expect(
      getJson("/admin/finance/payout-requests?status=processing", authCookie())
    ).resolves.toMatchObject({
      status: 200,
      body: {
        summary: { requestedCount: 0, processingCount: 1 },
        requests: [expect.objectContaining({ status: "processing_manual" })]
      }
    });
    await expect(
      getJson("/admin/finance/payout-requests?status=terminal", authCookie())
    ).resolves.toMatchObject({
      status: 200,
      body: {
        summary: {
          chargebackBlockedCount: 1,
          chargebackBlockedAmount: { amountMinor: 7_000_00, currency: "RUB" }
        },
        requests: [
          expect.objectContaining({
            id: "66666666-6666-4666-8666-666666666666",
            status: "cancelled",
            blockedByChargeback: true,
            failureReason: "Provider chargeback blocked payout before paid confirmation"
          })
        ]
      }
    });
    await expect(
      getJson("/admin/finance/payout-requests?status=paid_manually", authCookie())
    ).resolves.toMatchObject({ status: 400 });

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

  it("rejects manual payout requests with completion, ledger reversal and audit evidence", async () => {
    const rejected = await putJson(
      "/admin/finance/payout-requests/44444444-4444-4444-8444-444444444444/status",
      {
        status: "rejected",
        failureReason: "Bank details do not match recipient",
        adminNote: "Astrologer must update payout method"
      },
      authenticatedCookies(),
      {
        origin: "http://localhost:5175",
        [csrfHeaderName]: csrfToken
      }
    );

    expect(rejected).toMatchObject({
      status: 200,
      body: {
        id: "44444444-4444-4444-8444-444444444444",
        status: "rejected",
        completedAt: now.toISOString(),
        failureReason: "Bank details do not match recipient",
        adminUserId
      }
    });
    expect(ledgerStore.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: "payout_failed",
        payoutRequestId: "44444444-4444-4444-8444-444444444444",
        entries: [
          expect.objectContaining({
            side: "debit",
            account: expect.objectContaining({ accountType: "astrologer_payout_pending" })
          }),
          expect.objectContaining({
            side: "credit",
            account: expect.objectContaining({ accountType: "astrologer_available" })
          })
        ]
      })
    );
    expect(auditLogStore.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: adminUserId,
        action: "payout_request.status_updated",
        targetType: "payout_request",
        targetId: "44444444-4444-4444-8444-444444444444",
        metadata: expect.objectContaining({
          status: "rejected"
        })
      })
    );
  });

  it("lists payment reversal cases for authenticated internal users with optional type filtering", async () => {
    await expect(getJson("/admin/finance/reversal-cases")).resolves.toMatchObject({ status: 401 });

    const queue = await getJson("/admin/finance/reversal-cases", authCookie());
    expect(queue).toMatchObject({
      status: 200,
      body: {
        summary: {
          refundCount: 1,
          chargebackCount: 1,
          criticalCount: 1,
          totalAmount: { amountMinor: 100_000, currency: "RUB" },
          negativeBalanceAmount: { amountMinor: 45_000, currency: "RUB" }
        },
        cases: expect.arrayContaining([
          expect.objectContaining({
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            type: "chargeback",
            severity: "critical",
            providerRefundId: null,
            orderStatus: "chargeback",
            ledgerOperationType: "chargeback_recorded",
            walletBalance: expect.objectContaining({
              negativeBalance: { amountMinor: 45_000, currency: "RUB" }
            })
          }),
          expect.objectContaining({
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            type: "refund",
            providerRefundId: "provider-refund-1",
            ledgerOperationType: "refund_recorded"
          })
        ])
      }
    });

    await expect(
      getJson("/admin/finance/reversal-cases?type=chargeback", authCookie())
    ).resolves.toMatchObject({
      status: 200,
      body: {
        summary: { refundCount: 0, chargebackCount: 1 },
        cases: [expect.objectContaining({ type: "chargeback" })]
      }
    });
    await expect(
      getJson("/admin/finance/reversal-cases?type=pending", authCookie())
    ).resolves.toMatchObject({ status: 400 });
  });

  it("reviews payment reversal cases with CSRF, idempotency and audit evidence", async () => {
    await expect(
      putJson(
        "/admin/finance/reversal-cases/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/review",
        {
          resolution: "provider_follow_up_required",
          adminNote: "Chargeback evidence requested from Arc Pay support"
        },
        authCookie()
      )
    ).resolves.toMatchObject({ status: 403 });

    await expect(
      putJson(
        "/admin/finance/reversal-cases/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/review",
        { resolution: "ledger_verified", adminNote: " " },
        authenticatedCookies(),
        {
          origin: "http://localhost:5175",
          [csrfHeaderName]: csrfToken
        }
      )
    ).resolves.toMatchObject({ status: 400 });

    const reviewed = await putJson(
      "/admin/finance/reversal-cases/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/review",
      {
        resolution: "provider_follow_up_required",
        adminNote: "Chargeback evidence requested from Arc Pay support"
      },
      authenticatedCookies(),
      {
        origin: "http://localhost:5175",
        [csrfHeaderName]: csrfToken
      }
    );

    expect(reviewed).toMatchObject({
      status: 200,
      body: {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        review: {
          resolution: "provider_follow_up_required",
          adminNote: "Chargeback evidence requested from Arc Pay support",
          reviewedByUserId: adminUserId,
          reviewedAt: now.toISOString()
        }
      }
    });
    expect(auditLogStore.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: adminUserId,
        action: "payment_reversal_case.reviewed",
        targetType: "payment_reversal_case",
        targetId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        metadata: expect.objectContaining({
          resolution: "provider_follow_up_required",
          type: "chargeback",
          providerWebhookId: "wh_chargeback_1"
        })
      })
    );

    const replayed = await putJson(
      "/admin/finance/reversal-cases/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/review",
      {
        resolution: "provider_follow_up_required",
        adminNote: "Chargeback evidence requested from Arc Pay support"
      },
      authenticatedCookies(),
      {
        origin: "http://localhost:5175",
        [csrfHeaderName]: csrfToken
      }
    );
    expect(replayed).toMatchObject({ status: 200, body: reviewed.body });
    expect(auditLogStore.createEntry).toHaveBeenCalledTimes(1);

    const persistedCase = await reversalCaseStore.findCaseById(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    );
    expect(persistedCase).not.toBeNull();
    vi.mocked(reversalCaseStore.findCaseById).mockResolvedValueOnce({
      ...persistedCase!,
      review: null
    });
    const inconsistentReplay = await putJson(
      "/admin/finance/reversal-cases/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/review",
      {
        resolution: "provider_follow_up_required",
        adminNote: "Chargeback evidence requested from Arc Pay support"
      },
      authenticatedCookies(),
      {
        origin: "http://localhost:5175",
        [csrfHeaderName]: csrfToken
      }
    );
    expect(inconsistentReplay).toMatchObject({
      status: 409,
      body: { message: "payment_reversal_review_replay_missing" }
    });
    expect(auditLogStore.createEntry).toHaveBeenCalledTimes(1);
  });

  it("lists and resolves reconciliation exceptions with CSRF and audit evidence", async () => {
    await expect(getJson("/admin/finance/reconciliation/exceptions")).resolves.toMatchObject({
      status: 401
    });

    const queue = await getJson("/admin/finance/reconciliation/exceptions", authCookie());
    expect(queue).toMatchObject({
      status: 200,
      body: {
        summary: {
          openCount: 1,
          oldestOpenAt: "2026-07-25T08:00:00.000Z"
        },
        exceptions: [
          expect.objectContaining({
            id: "12121212-1212-4121-8121-121212121212",
            provider: "arc_pay",
            environment: "sandbox",
            providerPaymentId: "provider-payment-reconciliation-1",
            status: "exception",
            exceptionCode: "missing_on_bank",
            resolvedAt: null
          })
        ]
      }
    });
    await expect(
      getJson("/admin/finance/reconciliation/exceptions?evidence=settlement", authCookie())
    ).resolves.toMatchObject({
      status: 200,
      body: {
        summary: { openCount: 1 },
        exceptions: [expect.objectContaining({ providerSettlementId: "settlement-2026-07-25" })]
      }
    });
    await expect(
      getJson("/admin/finance/reconciliation/exceptions?evidence=card", authCookie())
    ).resolves.toMatchObject({ status: 400 });

    await expect(
      putJson(
        "/admin/finance/reconciliation/exceptions/12121212-1212-4121-8121-121212121212",
        { resolution: "waived", adminNote: "Below audit threshold after finance review" },
        authCookie()
      )
    ).resolves.toMatchObject({ status: 403 });

    const resolved = await putJson(
      "/admin/finance/reconciliation/exceptions/12121212-1212-4121-8121-121212121212",
      { resolution: "waived", adminNote: "Below audit threshold after finance review" },
      authenticatedCookies(),
      {
        origin: "http://localhost:5175",
        [csrfHeaderName]: csrfToken
      }
    );

    expect(resolved).toMatchObject({
      status: 200,
      body: {
        id: "12121212-1212-4121-8121-121212121212",
        status: "ignored",
        resolvedAt: now.toISOString()
      }
    });
    expect(auditLogStore.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: adminUserId,
        action: "reconciliation_exception.resolved",
        targetType: "reconciliation_record",
        targetId: "12121212-1212-4121-8121-121212121212",
        metadata: expect.objectContaining({ resolution: "waived" })
      })
    );
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
    }),
    payoutRequest({
      id: "66666666-6666-4666-8666-666666666666",
      status: "cancelled",
      amountMinor: 7_000_00,
      reviewedAt: now.toISOString(),
      adminUserId: null,
      completedAt: now.toISOString(),
      adminNote:
        "Blocked automatically by provider chargeback wh_chargeback_1 for order 88888888-8888-4888-8888-888888888888",
      failureReason: "Provider chargeback blocked payout before paid confirmation"
    })
  ];

  return {
    findRequestById: vi.fn(
      async (payoutRequestId) => requests.find((request) => request.id === payoutRequestId) ?? null
    ),
    listRequests: vi.fn(async (input = {}) =>
      requests
        .filter((request) =>
          input.statuses?.length ? input.statuses.includes(request.status) : true
        )
        .slice(0, input.limit ?? requests.length)
    ),
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
        completedAt: isTerminalPayoutStatus(input.status) ? input.now : existing.completedAt,
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

function createReversalCaseStore(): AdminPaymentReversalCaseStore {
  let cases: Awaited<ReturnType<AdminPaymentReversalCaseStore["listCases"]>> = [
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      type: "chargeback",
      severity: "critical",
      provider: "arc_pay",
      environment: "sandbox",
      providerWebhookId: "wh_chargeback_1",
      providerPaymentId: "provider-payment-2",
      providerRefundId: null,
      paymentAttemptId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      orderId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      clientUserId: "99999999-9999-4999-8999-999999999990",
      astrologerUserId,
      orderStatus: "chargeback",
      paymentAttemptStatus: "chargeback",
      amount: { amountMinor: 50_000, currency: "RUB" },
      refundStatus: null,
      ledgerOperationType: "chargeback_recorded",
      ledgerTransactionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      review: null,
      walletBalance: {
        astrologerUserId,
        pending: { amountMinor: 0, currency: "RUB" },
        available: { amountMinor: 0, currency: "RUB" },
        reserved: { amountMinor: 0, currency: "RUB" },
        payoutPending: { amountMinor: 0, currency: "RUB" },
        negativeBalance: { amountMinor: 45_000, currency: "RUB" },
        updatedAt: now.toISOString()
      },
      occurredAt: "2026-07-25T09:00:00.000Z",
      receivedAt: "2026-07-25T09:01:00.000Z"
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      type: "refund",
      severity: "attention",
      provider: "arc_pay",
      environment: "sandbox",
      providerWebhookId: "wh_refund_1",
      providerPaymentId: "provider-payment-1",
      providerRefundId: "provider-refund-1",
      paymentAttemptId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      orderId,
      clientUserId: "99999999-9999-4999-8999-999999999990",
      astrologerUserId,
      orderStatus: "refunded",
      paymentAttemptStatus: "refunded",
      amount: { amountMinor: 50_000, currency: "RUB" },
      refundStatus: "succeeded",
      ledgerOperationType: "refund_recorded",
      ledgerTransactionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeef",
      review: null,
      walletBalance: {
        astrologerUserId,
        pending: { amountMinor: 0, currency: "RUB" },
        available: { amountMinor: 0, currency: "RUB" },
        reserved: { amountMinor: 0, currency: "RUB" },
        payoutPending: { amountMinor: 0, currency: "RUB" },
        negativeBalance: { amountMinor: 45_000, currency: "RUB" },
        updatedAt: now.toISOString()
      },
      occurredAt: "2026-07-25T08:00:00.000Z",
      receivedAt: "2026-07-25T08:01:00.000Z"
    }
  ];

  return {
    findCaseById: vi.fn(
      async (id) => cases.find((paymentReversalCase) => paymentReversalCase.id === id) ?? null
    ),
    listCases: vi.fn(async (input) =>
      cases
        .filter((paymentReversalCase) =>
          input.types?.length ? input.types.includes(paymentReversalCase.type) : true
        )
        .filter((paymentReversalCase) =>
          input.reviewStatus === "all" ? true : paymentReversalCase.review === null
        )
        .slice(0, input.limit)
    ),
    recordReview: vi.fn(async (input) => {
      const existing = cases.find((paymentReversalCase) => paymentReversalCase.id === input.caseId);
      if (!existing) return null;
      const updated = {
        ...existing,
        review: {
          resolution: input.resolution,
          adminNote: input.adminNote,
          reviewedByUserId: input.adminUserId,
          reviewedAt: input.reviewedAt
        }
      };
      cases = cases.map((paymentReversalCase) =>
        paymentReversalCase.id === updated.id ? updated : paymentReversalCase
      );
      return updated;
    })
  };
}

function createReconciliationStore(): ReconciliationStore {
  let records: ReconciliationRecord[] = [
    {
      id: "12121212-1212-4121-8121-121212121212",
      provider: "arc_pay",
      environment: "sandbox",
      providerPaymentId: "provider-payment-reconciliation-1",
      providerPayoutId: null,
      providerSettlementId: "settlement-2026-07-25",
      providerEventId: "34343434-3434-4343-8343-343434343434",
      status: "exception",
      exceptionCode: "missing_on_bank",
      exceptionMessage: "Capture is absent from bank settlement file",
      providerOccurredAt: "2026-07-25T07:30:00.000Z",
      checkedAt: "2026-07-25T08:00:00.000Z",
      resolvedAt: null,
      payload: { source: "reconciliation.exception" }
    }
  ];
  return {
    findAttemptById: vi.fn(),
    findAttemptByProviderPaymentId: vi.fn(),
    createRecord: vi.fn(),
    listOpenExceptions: vi.fn(async (input) =>
      records
        .filter((record) => (input.provider ? record.provider === input.provider : true))
        .filter((record) => (input.environment ? record.environment === input.environment : true))
        .filter((record) => {
          switch (input.evidence ?? "all") {
            case "payment":
              return Boolean(record.providerPaymentId);
            case "payout":
              return Boolean(record.providerPayoutId);
            case "settlement":
              return Boolean(record.providerSettlementId);
            case "provider_event":
              return Boolean(record.providerEventId);
            case "all":
              return true;
          }
        })
        .slice(0, input.limit)
    ),
    resolveException: vi.fn(async (input) => {
      const existing = records.find((record) => record.id === input.reconciliationRecordId);
      if (!existing) return null;
      const updated: ReconciliationRecord = {
        ...existing,
        status: input.resolution === "resolved" ? "matched" : "ignored",
        resolvedAt: input.resolvedAt,
        payload: {
          ...existing.payload,
          resolution: input.resolution,
          adminNote: input.adminNote
        }
      };
      records = records.map((record) => (record.id === updated.id ? updated : record));
      return updated;
    })
  };
}

function isTerminalPayoutStatus(status: PayoutRequestStatus): boolean {
  return (
    status === "paid" || status === "failed" || status === "rejected" || status === "cancelled"
  );
}

function payoutRequest(overrides: {
  readonly id: string;
  readonly status: PayoutRequestStatus;
  readonly amountMinor: number;
  readonly reviewedAt?: string | null;
  readonly adminUserId?: string | null;
  readonly completedAt?: string | null;
  readonly adminNote?: string | null;
  readonly failureReason?: string | null;
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
    completedAt: overrides.completedAt ?? null,
    adminUserId: overrides.adminUserId ?? null,
    adminNote: overrides.adminNote ?? null,
    failureReason: overrides.failureReason ?? null,
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
