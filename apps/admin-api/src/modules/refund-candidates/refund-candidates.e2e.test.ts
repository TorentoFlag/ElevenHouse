import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { Test, type TestingModule } from "@nestjs/testing";
import type { PlatformRole } from "@elevenhouse/auth";
import type { AuthSessionAuthenticationStore, RefundCandidateStore } from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SystemClock } from "../../common/system-clock.js";
import { AdminSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import { AUTH_SESSION_AUTHENTICATION_STORE } from "../identity/auth/identity-auth.tokens";
import { IdentityCurrentSessionService } from "../identity/session/identity-current-session.service";
import { AdminCsrfTokenService } from "../security/csrf/admin-csrf-token.service";
import { CsrfGuard } from "../security/csrf/csrf.guard";
import { AdminIdempotencyGuard } from "../security/idempotency/admin-idempotency.guard";
import { AdminRefundCandidatesController } from "./refund-candidates.controller";
import { AdminRefundCandidatesService } from "./refund-candidates.service";
import { ADMIN_REFUND_CANDIDATE_STORE } from "./refund-candidates.tokens";

const now = new Date("2026-08-05T12:10:00.000Z");
const sessionCookieName = "elevenhouse_admin_session";
const csrfCookieName = "elevenhouse_admin_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "admin-refund-candidate-e2e-session";
const adminUserId = "11111111-1111-4111-8111-111111111111";
const candidateId = "22222222-2222-4222-8222-222222222222";
let roles: readonly PlatformRole[];
let app: INestApplication;
let moduleRef: TestingModule;
let baseUrl: string;
let csrfToken: string;

describe("admin refund candidate review HTTP flow", () => {
  beforeEach(async () => {
    roles = ["admin"];
    const store = reviewStore();
    moduleRef = await Test.createTestingModule({
      controllers: [AdminRefundCandidatesController],
      providers: [
        AdminRefundCandidatesService,
        AdminSessionAuthGuard,
        IdentityCurrentSessionService,
        CsrfGuard,
        AdminIdempotencyGuard,
        AdminCsrfTokenService,
        Reflector,
        { provide: SystemClock, useValue: { now: () => now } },
        { provide: ConfigService, useValue: configService() },
        { provide: AUTH_SESSION_AUTHENTICATION_STORE, useValue: authStore() },
        { provide: ADMIN_REFUND_CANDIDATE_STORE, useValue: store }
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

  it("requires an internal session, CSRF and idempotency before a versioned non-monetary review", async () => {
    const path = `/admin/finance/refund-candidates/${candidateId}/review`;
    const body = { expectedVersion: 1, action: "claimed", note: "Investigating delivery history." };
    await expect(putJson(path, body)).resolves.toMatchObject({ status: 401 });
    await expect(putJson(path, body, authCookie(), { "idempotency-key": "review-command-1" })).resolves.toMatchObject({ status: 403 });
    await expect(putJson(path, body, authenticatedCookies(), { [csrfHeaderName]: csrfToken })).resolves.toMatchObject({ status: 400 });
    const response = await putJson(path, body, authenticatedCookies(), {
      origin: "http://localhost:5175",
      [csrfHeaderName]: csrfToken,
      "idempotency-key": "review-command-1"
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      candidate: { id: candidateId, status: "under_review", version: 2 },
      review: { actorUserId: adminUserId, action: "claimed", candidateVersion: 2 }
    });
    expect(response.body).not.toHaveProperty("amountMinor");
    expect(response.body).not.toHaveProperty("providerRefundId");
  });

  it("exposes the bounded queue only to an internal session", async () => {
    await expect(getJson("/admin/finance/refund-candidates")).resolves.toMatchObject({ status: 401 });
    await expect(getJson("/admin/finance/refund-candidates?status=submitted&limit=10", authCookie())).resolves.toMatchObject({
      status: 200,
      body: { candidates: [] }
    });
    roles = ["client"];
    await expect(getJson("/admin/finance/refund-candidates", authCookie())).resolves.toMatchObject({ status: 403 });
  });
});

async function putJson(path: string, body: unknown, cookie?: string, headers: Record<string, string> = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method: "PUT", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
async function getJson(path: string, cookie?: string) {
  const response = await fetch(`${baseUrl}${path}`, { headers: cookie ? { cookie } : {} });
  return { status: response.status, body: await response.json() };
}
function authCookie(): string { return `${sessionCookieName}=${sessionToken}`; }
function authenticatedCookies(): string { return `${authCookie()}; ${csrfCookieName}=${csrfToken}`; }
function createCsrfToken(service: AdminCsrfTokenService): string {
  let token = "";
  service.setCsrfCookie({ response: { cookie: (_name, value) => { token = value; } }, sessionToken, sessionExpiresAt: "2026-09-01T00:00:00.000Z", now });
  return token;
}
function authStore(): AuthSessionAuthenticationStore {
  return { findByTokenHash: vi.fn(async (tokenHash: string) => ({ session: { id: "33333333-3333-4333-8333-333333333333", userId: adminUserId, tokenHash, status: "active" as const, createdAt: now.toISOString(), expiresAt: "2026-09-01T00:00:00.000Z" }, user: { id: adminUserId, status: "active" as const, createdAt: now.toISOString(), updatedAt: now.toISOString() }, roleAssignments: roles.map((role, index) => ({ id: `44444444-4444-4444-8444-44444444444${index}`, userId: adminUserId, role, assignedAt: now.toISOString() })) })) };
}
function configService(): Pick<ConfigService, "get" | "getOrThrow"> {
  return { get: vi.fn(() => undefined), getOrThrow: vi.fn((key: string) => {
    if (key === "adminApi.sessionCookieName") return sessionCookieName;
    if (key === "adminApi.csrfSecret") return "test-admin-csrf-secret-with-enough-entropy";
    if (key === "adminApi.csrfCookieName") return csrfCookieName;
    if (key === "adminApi.csrfHeaderName") return csrfHeaderName;
    if (key === "adminApi.csrfTokenTtlSeconds") return 604800;
    if (key === "adminApi.sessionCookieSecure") return false;
    if (key === "adminApi.allowedOrigins") return ["http://localhost:5175"];
    throw new Error(`Unexpected config key: ${key}`);
  }) };
}
function reviewStore(): Pick<RefundCandidateStore, "executeReviewCandidate" | "listForAdmin"> {
  return { executeReviewCandidate: vi.fn(async (_command, input) => ({ kind: "created" as const, value: { candidate: { id: candidateId, orderId: "55555555-5555-4555-8555-555555555555", clientUserId: "66666666-6666-4666-8666-666666666666", statement: "Service was not delivered.", status: "under_review" as const, version: 2, submittedAt: "2026-08-05T12:00:00.000Z", resolvedRefundCaseId: null, resolvedAt: null, updatedAt: now.toISOString() }, review: { id: input.reviewId, candidateId, candidateVersion: 2, actorUserId: adminUserId, action: "claimed" as const, note: input.note, refundCaseId: null, reviewedAt: now.toISOString() } } })), listForAdmin: vi.fn(async () => []) };
}
