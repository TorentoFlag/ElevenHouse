import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import type { PlatformRole } from "@elevenhouse/auth";
import type {
  AuditLogStore,
  AuthSessionAuthenticationStore,
  FinancePolicySnapshot,
  FinancePolicyStore,
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

let app: INestApplication;
let moduleRef: TestingModule;
let baseUrl: string;
let csrfToken: string;
let store: FinancePolicyStore;
let auditLogStore: AuditLogStore;
let unitOfWork: AdminFinancePolicyUnitOfWork;
let roles: readonly PlatformRole[];

describe("admin finance policy HTTP flow", () => {
  beforeEach(async () => {
    roles = ["admin"];
    store = createFinancePolicyStore();
    auditLogStore = createAuditLogStore();
    unitOfWork = {
      execute: vi.fn(async (operation) =>
        operation({
          store,
          auditSink: new DurableAdminFinancePolicyAuditSink(auditLogStore)
        })
      )
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

    const response = await putJson("/admin/finance/policies/default", body, authenticatedCookies(), {
      origin: "http://localhost:5175",
      [csrfHeaderName]: csrfToken
    });

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
    findEffectivePolicyForAstrologer: vi.fn(async () => null),
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
