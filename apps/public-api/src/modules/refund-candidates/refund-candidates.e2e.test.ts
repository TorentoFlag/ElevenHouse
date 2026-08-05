import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import type {
  AuthSessionAuthenticationStore,
  FinanceOrder,
  FinanceOrderStore,
  RefundCandidate,
  RefundCandidateStore
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SystemClock } from "../../common/system-clock.js";
import { PublicSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import { AUTH_SESSION_AUTHENTICATION_STORE } from "../identity/auth/identity-auth.tokens";
import { IdentityCurrentSessionService } from "../identity/session/identity-current-session.service";
import { PublicCsrfTokenService } from "../security/csrf/public-csrf-token.service";
import { CsrfGuard } from "../security/csrf/csrf.guard";
import { IdempotencyGuard } from "../security/idempotency/idempotency.guard";
import { RefundCandidatesController } from "./refund-candidates.controller";
import { RefundCandidatesService } from "./refund-candidates.service";
import { REFUND_CANDIDATES_ORDER_STORE, REFUND_CANDIDATES_STORE } from "./refund-candidates.tokens";

const now = new Date("2026-08-05T12:00:00.000Z");
const sessionCookieName = "elevenhouse_public_session";
const csrfCookieName = "elevenhouse_public_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "refund-candidate-e2e-session";
const clientUserId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";

let app: INestApplication;
let moduleRef: TestingModule;
let baseUrl: string;
let csrfToken: string;

describe("refund candidates public HTTP flow", () => {
  beforeEach(async () => {
    const candidates: RefundCandidate[] = [];
    const candidateStore: Pick<RefundCandidateStore, "executeSubmitCandidate" | "listByOrderAndClient"> = {
      executeSubmitCandidate: vi.fn(async (_command, create) => {
        const candidate = await create();
        candidates.push(candidate);
        return { kind: "created" as const, value: candidate };
      }),
      listByOrderAndClient: vi.fn(async ({ orderId: requestedOrderId, clientUserId: requestedClientUserId }) =>
        candidates.filter(
          (candidate) =>
            candidate.orderId === requestedOrderId && candidate.clientUserId === requestedClientUserId
        )
      )
    };
    moduleRef = await Test.createTestingModule({
      controllers: [RefundCandidatesController],
      providers: [
        RefundCandidatesService,
        PublicSessionAuthGuard,
        IdentityCurrentSessionService,
        CsrfGuard,
        IdempotencyGuard,
        PublicCsrfTokenService,
        { provide: SystemClock, useValue: { now: () => now } },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: vi.fn((key: string) => {
              if (key === "publicApi.sessionCookieName") return sessionCookieName;
              if (key === "publicApi.csrfSecret") return "test-csrf-secret-with-enough-entropy";
              if (key === "publicApi.csrfCookieName") return csrfCookieName;
              if (key === "publicApi.csrfHeaderName") return csrfHeaderName;
              if (key === "publicApi.csrfTokenTtlSeconds") return 604800;
              if (key === "publicApi.sessionCookieSecure") return false;
              if (key === "publicApi.allowedOrigins") return ["http://localhost:3000"];
              throw new Error(`Unexpected config key: ${key}`);
            })
          }
        },
        { provide: AUTH_SESSION_AUTHENTICATION_STORE, useValue: authStore() },
        {
          provide: REFUND_CANDIDATES_ORDER_STORE,
          useValue: { findById: vi.fn(async () => paidOrder()) } satisfies Pick<
            FinanceOrderStore,
            "findById"
          >
        },
        { provide: REFUND_CANDIDATES_STORE, useValue: candidateStore }
      ]
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
    csrfToken = createCsrfToken(moduleRef.get(PublicCsrfTokenService));
  });

  afterEach(async () => {
    await app.close();
    await moduleRef.close();
  });

  it("requires client auth, CSRF and idempotency, then creates and reads a non-monetary candidate", async () => {
    const path = `/client/orders/${orderId}/disputes`;
    const body = { statement: "Service was not provided as agreed." };

    await expect(postJson(path, body)).resolves.toMatchObject({ status: 401 });
    await expect(postJson(path, body, authCookie(), { "idempotency-key": "dispute-1" })).resolves.toMatchObject({ status: 403 });
    await expect(postJson(path, body, authenticatedCookies(), { [csrfHeaderName]: csrfToken })).resolves.toMatchObject({ status: 400 });

    const created = await postJson(path, body, authenticatedCookies(), {
      origin: "http://localhost:3000",
      [csrfHeaderName]: csrfToken,
      "idempotency-key": "dispute-1"
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ orderId, clientUserId, status: "submitted", statement: body.statement });
    expect(created.body).not.toHaveProperty("amountMinor");
    expect(created.body).not.toHaveProperty("providerRefundId");

    const read = await getJson(path, authCookie());
    expect(read.status).toBe(200);
    expect(read.body).toEqual([created.body]);
  });
});

async function postJson(path: string, body: unknown, cookie?: string, headers: Record<string, string> = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

async function getJson(path: string, cookie?: string) {
  const response = await fetch(`${baseUrl}${path}`, { headers: cookie ? { cookie } : {} });
  return { status: response.status, body: await response.json() };
}

function authenticatedCookies(): string { return `${authCookie()}; ${csrfCookieName}=${csrfToken}`; }
function authCookie(): string { return `${sessionCookieName}=${sessionToken}`; }

function createCsrfToken(service: PublicCsrfTokenService): string {
  let token = "";
  service.setCsrfCookie({
    response: { cookie: (_name, value) => { token = value; } },
    sessionToken,
    sessionExpiresAt: "2026-09-01T00:00:00.000Z",
    now
  });
  return token;
}

function authStore(): AuthSessionAuthenticationStore {
  return {
    findByTokenHash: vi.fn(async (tokenHash: string) => ({
      session: { id: "33333333-3333-4333-8333-333333333333", userId: clientUserId, tokenHash, status: "active" as const, createdAt: now.toISOString(), expiresAt: "2026-09-01T00:00:00.000Z" },
      user: { id: clientUserId, status: "active" as const, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      roleAssignments: [{ id: "44444444-4444-4444-8444-444444444444", userId: clientUserId, role: "client" as const, assignedAt: now.toISOString() }]
    }))
  };
}

function paidOrder(): FinanceOrder {
  return {
    id: orderId, clientUserId, astrologerUserId: "55555555-5555-4555-8555-555555555555", productId: "66666666-6666-4666-8666-666666666666", productTitleSnapshot: "Natal consultation", directLinkIntentId: null, bookingId: null, status: "paid", grossAmount: { amountMinor: 10_000, currency: "RUB" }, platformFee: { amountMinor: 800, currency: "RUB" }, astrologerNetAmount: { amountMinor: 9_200, currency: "RUB" }, financePolicySnapshotId: "77777777-7777-4777-8777-777777777777", financePolicyRiskTier: "standard", financePolicyHoldDurationHours: 48, financePolicyReserveBps: 0, financePolicyReserveReleaseDelayDays: 0, tariffSeriesId: "pro", tariffVersion: 1, tariffVersionDigest: `sha256:${"a".repeat(64)}`, tariffCommissionBps: 800, financePolicyProviderSettlementRequired: true, createdAt: now.toISOString(), updatedAt: now.toISOString()
  };
}
