import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  astrologerFinanceOverviewResponseSchema,
  payoutMethodResponseSchema,
  payoutRequestResponseSchema
} from "@elevenhouse/contracts";
import {
  FinanceIdempotencyConflictError,
  type AuthSessionAuthenticationStore,
  type AuthSessionRevocationUnitOfWork,
  type CreateLedgerTransactionInput,
  type LedgerStore,
  type PasswordlessAuthUnitOfWork,
  type PasswordlessCustomerAccountRegistrationSessionUnitOfWork,
  type PayoutMethodRecord,
  type PayoutRequestRecord,
  type PayoutStore,
  type WalletBalance
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemClock } from "../clock/system-clock.service";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import {
  AUTH_SESSION_AUTHENTICATION_STORE,
  AUTH_SESSION_REVOCATION_UNIT_OF_WORK
} from "../identity/auth/identity-auth.tokens";
import { IdentityModule } from "../identity/identity.module";
import { ASTROLOGER_AUTH_CODE_GENERATOR } from "../identity/passwordless/identity-passwordless.handler";
import {
  PASSWORDLESS_AUTH_UNIT_OF_WORK,
  PASSWORDLESS_RATE_LIMITER
} from "../identity/passwordless/identity-passwordless.tokens";
import { ASTROLOGER_REGISTRATION_SESSION_UNIT_OF_WORK } from "../identity/registration/identity-registration.tokens";
import { createIdentityConfigServiceStub } from "../identity/testing/identity-config-service.stub";
import { TestPasswordlessRateLimiter } from "../identity/testing/test-passwordless-rate-limiter";
import { RedisRuntimeService } from "../redis/redis-runtime.service";
import { AstrologerCsrfTokenService } from "../security/csrf/astrologer-csrf-token.service";
import { FinanceModule } from "./finance.module";
import { ASTROLOGER_FINANCE_OPTIONS, ASTROLOGER_FINANCE_UNIT_OF_WORK } from "./finance.tokens";
import type { AstrologerFinanceUnitOfWork } from "./finance.unit-of-work";

const now = new Date("2026-07-26T10:00:00.000Z");
const sessionCookieName = "elevenhouse_astrologer_session";
const csrfCookieName = "elevenhouse_astrologer_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "raw-session-token";
const astrologerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
let currentCsrfToken = "";

const defaultPasswordlessRateLimits = {
  requestCodeIdentifier: { limit: 5, windowSeconds: 3600 },
  requestCodeIp: { limit: 30, windowSeconds: 3600 },
  requestCodeIdentifierIp: { limit: 3, windowSeconds: 3600 },
  verifyChallenge: { limit: 5, windowSeconds: 900 },
  verifyIp: { limit: 60, windowSeconds: 900 }
};

describe("astrologer finance HTTP routes", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let baseUrl: string;
  let payoutStore: PayoutStore;
  let ledgerStore: Pick<LedgerStore, "createTransaction" | "findWalletBalance">;

  beforeEach(async () => {
    payoutStore = createPayoutStore();
    ledgerStore = createLedgerStore();
    const unitOfWork = createFinanceUnitOfWork(payoutStore, ledgerStore);
    const passwordlessAuth: PasswordlessAuthUnitOfWork = {
      transact: async () => raise("Unexpected passwordless auth unit of work call")
    };
    const authSessionRevocation: AuthSessionRevocationUnitOfWork = {
      transact: async () => raise("Unexpected auth session revocation unit of work call")
    };
    const astrologerRegistration: PasswordlessCustomerAccountRegistrationSessionUnitOfWork = {
      transact: async () => raise("Unexpected astrologer registration unit of work call")
    };

    moduleRef = await Test.createTestingModule({
      imports: [IdentityModule, FinanceModule]
    })
      .overrideProvider(PostgresRuntimeService)
      .useValue({ database: {} })
      .overrideProvider(ConfigService)
      .useValue(
        createIdentityConfigServiceStub({
          sessionCookieName,
          csrfCookieName,
          csrfHeaderName,
          passwordlessRateLimits: defaultPasswordlessRateLimits
        })
      )
      .overrideProvider(PASSWORDLESS_AUTH_UNIT_OF_WORK)
      .useValue(passwordlessAuth)
      .overrideProvider(AUTH_SESSION_AUTHENTICATION_STORE)
      .useValue(createAuthStore())
      .overrideProvider(AUTH_SESSION_REVOCATION_UNIT_OF_WORK)
      .useValue(authSessionRevocation)
      .overrideProvider(ASTROLOGER_REGISTRATION_SESSION_UNIT_OF_WORK)
      .useValue(astrologerRegistration)
      .overrideProvider(PASSWORDLESS_RATE_LIMITER)
      .useValue(new TestPasswordlessRateLimiter(defaultPasswordlessRateLimits, () => now))
      .overrideProvider(RedisRuntimeService)
      .useValue({
        eval: vi.fn(async () => 0),
        quit: vi.fn(async () => undefined)
      })
      .overrideProvider(ASTROLOGER_AUTH_CODE_GENERATOR)
      .useValue({
        generateCode: vi.fn(() => "123456")
      })
      .overrideProvider(SystemClock)
      .useValue({
        now: vi.fn(() => now)
      })
      .overrideProvider(ASTROLOGER_FINANCE_UNIT_OF_WORK)
      .useValue(unitOfWork)
      .overrideProvider(ASTROLOGER_FINANCE_OPTIONS)
      .useValue({ minimumPayoutAmountMinor: 1_000_00 })
      .compile();

    currentCsrfToken = moduleRef.get(AstrologerCsrfTokenService).setCsrfCookie({
      response: { cookie: vi.fn() },
      sessionToken,
      sessionExpiresAt: "2026-08-02T00:00:00.000Z",
      now
    });
    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    await app?.close();
    await moduleRef?.close();
  });

  it("returns current wallet balance and blocks payout request until payout method exists", async () => {
    const unauthenticated = await fetch(`${baseUrl}/finance/me`);
    const overview = await getJson(baseUrl, "/finance/me");

    expect(unauthenticated.status).toBe(401);
    expect(overview.status).toBe(200);
    astrologerFinanceOverviewResponseSchema.parse(overview.body);
    expect(overview.body).toMatchObject({
      balance: {
        astrologerUserId,
        available: { amountMinor: 15_000_00, currency: "RUB" }
      },
      defaultPayoutMethod: null,
      canRequestPayout: false,
      payoutRequestUnavailableReason: "payout_method_required"
    });
  });

  it("creates manual payout method and idempotent payout request with CSRF protection", async () => {
    await expect(
      postJson(baseUrl, "/finance/payout-requests", validPayoutRequestBody(), {
        cookie: sessionCookieHeader(),
        "idempotency-key": "finance-request-1"
      })
    ).resolves.toMatchObject({ status: 403 });

    const method = await postJson(
      baseUrl,
      "/finance/payout-methods/manual-bank-transfer",
      validPayoutMethodBody(),
      csrfHeaders("finance-method-1")
    );
    expect(method.status).toBe(201);
    payoutMethodResponseSchema.parse(method.body);
    expect(method.body).toMatchObject({
      astrologerUserId,
      method: "manual_bank_transfer",
      displayName: "Основной счет",
      isDefault: true
    });

    const payout = await postJson(
      baseUrl,
      "/finance/payout-requests",
      validPayoutRequestBody(),
      csrfHeaders("finance-request-1")
    );
    const replay = await postJson(
      baseUrl,
      "/finance/payout-requests",
      validPayoutRequestBody(),
      csrfHeaders("finance-request-1")
    );

    expect(payout.status).toBe(201);
    payoutRequestResponseSchema.parse(payout.body);
    expect(payout.body).toMatchObject({
      astrologerUserId,
      status: "requested",
      amount: { amountMinor: 5_000_00, currency: "RUB" },
      method: "manual_bank_transfer"
    });
    expect(replay).toMatchObject({
      status: 201,
      body: {
        id: payout.body.id,
        status: "requested"
      }
    });
    expect(ledgerStore.createTransaction).toHaveBeenCalledTimes(1);
    expect(ledgerStore.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: "payout_reserved",
        payoutRequestId: payout.body.id
      })
    );
  });
});

type HttpJsonResponse = {
  readonly status: number;
  readonly body: Record<string, unknown>;
};

async function getJson(baseUrl: string, path: string): Promise<HttpJsonResponse> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { cookie: sessionCookieHeader() }
  });
  return readJsonResponse(response);
}

async function postJson(
  baseUrl: string,
  path: string,
  body: unknown,
  headers: Record<string, string>
): Promise<HttpJsonResponse> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
  return readJsonResponse(response);
}

async function readJsonResponse(response: Response): Promise<HttpJsonResponse> {
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>
  };
}

function sessionCookieHeader(): string {
  return `${sessionCookieName}=${sessionToken}`;
}

function authenticatedCookieHeader(): string {
  return `${sessionCookieHeader()}; ${csrfCookieName}=${currentCsrfToken}`;
}

function csrfHeaders(idempotencyKey: string): Record<string, string> {
  return {
    cookie: authenticatedCookieHeader(),
    origin: "http://localhost:3000",
    [csrfHeaderName]: currentCsrfToken,
    "idempotency-key": idempotencyKey
  };
}

function createAuthStore(): AuthSessionAuthenticationStore {
  const tokenHash = hashSessionToken(sessionToken);

  return {
    findByTokenHash: vi.fn(async (candidateTokenHash: string) => {
      if (candidateTokenHash !== tokenHash) return null;

      return {
        session: {
          id: "8624104d-6f9b-4983-958e-9dbec6f0473c",
          userId: astrologerUserId,
          tokenHash,
          status: "active" as const,
          createdAt: now.toISOString(),
          expiresAt: "2026-08-02T00:00:00.000Z"
        },
        user: {
          id: astrologerUserId,
          status: "active" as const,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        },
        roleAssignments: [
          {
            id: "f7e4d8ea-7d14-4e54-a19a-9412307b3e8d",
            userId: astrologerUserId,
            role: "astrologer" as const,
            assignedAt: now.toISOString()
          }
        ]
      };
    })
  };
}

function createFinanceUnitOfWork(
  payoutStore: PayoutStore,
  ledgerStore: Pick<LedgerStore, "createTransaction" | "findWalletBalance">
): AstrologerFinanceUnitOfWork {
  const completedFinanceCommands = new Map<string, Record<string, unknown>>();
  const financeCommandHashes = new Map<string, string>();

  return {
    execute: vi.fn(async (operation) => operation({ payoutStore, ledgerStore })),
    executeIdempotent: async (input) => {
      const key = `${input.command.scope}:${input.command.idempotencyKey}`;
      const existingHash = financeCommandHashes.get(key);
      if (existingHash) {
        if (existingHash !== input.command.requestHash) {
          throw new FinanceIdempotencyConflictError();
        }
        const result = completedFinanceCommands.get(key);
        if (!result) throw new Error("Expected completed finance command result");
        const value = await input.replay({ payoutStore, ledgerStore }, result);
        if (!value) throw new Error("Expected finance command replay value");
        return { kind: "replayed" as const, value };
      }

      financeCommandHashes.set(key, input.command.requestHash);
      const created = await input.create({ payoutStore, ledgerStore });
      completedFinanceCommands.set(key, created.result);
      return { kind: "created" as const, value: created.value };
    }
  };
}

function createPayoutStore(): PayoutStore {
  let defaultMethod: PayoutMethodRecord | null = null;
  const requests: PayoutRequestRecord[] = [];

  return {
    createMethod: vi.fn(async (input) => {
      defaultMethod = {
        id: "33333333-3333-4333-8333-333333333333",
        astrologerUserId: input.astrologerUserId,
        method: input.method,
        currency: input.currency,
        displayName: input.displayName,
        manualBankTransferDetails: input.manualBankTransferDetails,
        provider: input.provider,
        environment: input.environment,
        providerPayoutAccountId: input.providerPayoutAccountId,
        isDefault: input.isDefault,
        createdAt: input.now,
        updatedAt: input.now
      };
      return defaultMethod;
    }),
    findDefaultMethod: vi.fn(async (userId) =>
      defaultMethod?.astrologerUserId === userId ? defaultMethod : null
    ),
    createRequest: vi.fn(async (input) => {
      const request = payoutRequest({
        id: `44444444-4444-4444-8444-44444444444${requests.length}`,
        astrologerUserId: input.astrologerUserId,
        payoutMethodId: input.payoutMethodId,
        amountMinor: input.amount.amountMinor,
        now: input.now
      });
      requests.unshift(request);
      return request;
    }),
    updateRequestStatus: vi.fn(async () => raise("Astrologer finance should not update statuses")),
    findRequestById: vi.fn(async (id) => requests.find((request) => request.id === id) ?? null),
    listRequests: vi.fn(async (input = {}) =>
      requests
        .filter((request) =>
          input.astrologerUserId ? request.astrologerUserId === input.astrologerUserId : true
        )
        .slice(0, input.limit ?? 50)
    )
  };
}

function createLedgerStore(): Pick<LedgerStore, "createTransaction" | "findWalletBalance"> {
  const balance: WalletBalance = {
    astrologerUserId,
    pending: { amountMinor: 0, currency: "RUB" },
    available: { amountMinor: 15_000_00, currency: "RUB" },
    reserved: { amountMinor: 0, currency: "RUB" },
    payoutPending: { amountMinor: 0, currency: "RUB" },
    negativeBalance: { amountMinor: 0, currency: "RUB" },
    updatedAt: now.toISOString()
  };

  return {
    findWalletBalance: vi.fn(async (userId) => (userId === astrologerUserId ? balance : null)),
    createTransaction: vi.fn(async (transaction: CreateLedgerTransactionInput) => ({
      ...transaction,
      id: "77777777-7777-4777-8777-777777777777",
      entries: transaction.entries.map((entry, index) => ({
        ...entry,
        id: `88888888-8888-4888-8888-88888888888${index}`,
        ledgerAccountId: `99999999-9999-4999-8999-99999999999${index}`
      }))
    }))
  };
}

function validPayoutMethodBody(): Record<string, unknown> {
  return {
    displayName: "Основной счет",
    recipientName: "Alisa Vega",
    bankName: "T-Bank",
    accountNumberLast4: "4417",
    details: { bik: "044525974" },
    idempotencyKey: "finance-method-1"
  };
}

function validPayoutRequestBody(): Record<string, unknown> {
  return {
    amount: { amountMinor: 5_000_00, currency: "RUB" },
    method: "manual_bank_transfer",
    idempotencyKey: "finance-request-1"
  };
}

function payoutRequest(input: {
  readonly id: string;
  readonly astrologerUserId: string;
  readonly payoutMethodId: string;
  readonly amountMinor: number;
  readonly now: string;
}): PayoutRequestRecord {
  return {
    id: input.id,
    astrologerUserId: input.astrologerUserId,
    payoutMethodId: input.payoutMethodId,
    status: "requested",
    amount: { amountMinor: input.amountMinor, currency: "RUB" },
    method: "manual_bank_transfer",
    provider: null,
    environment: null,
    requestedAt: input.now,
    reviewedAt: null,
    completedAt: null,
    adminUserId: null,
    adminNote: null,
    failureReason: null,
    externalReference: null,
    transferredAt: null,
    providerPayoutId: null,
    metadata: { source: "astrologer_finance" },
    createdAt: input.now,
    updatedAt: input.now
  };
}

function raise(message: string): never {
  throw new Error(message);
}
