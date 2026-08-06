import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  astrologerFinanceOverviewResponseSchema,
  ledgerOperationListResponseSchema,
  payoutMethodResponseSchema,
  payoutRequestResponseSchema
} from "@elevenhouse/contracts";
import {
  FinanceIdempotencyConflictError,
  type AuthSessionAuthenticationStore,
  type AuthSessionRevocationUnitOfWork,
  type CreateLedgerTransactionInput,
  type FinancePeriodSummary,
  type LedgerOperationList,
  type LedgerStore,
  type PasswordlessAuthUnitOfWork,
  type PasswordlessCustomerAccountRegistrationSessionUnitOfWork,
  type PlatformTariffAuthorityStore,
  type PlatformTariffSubscriptionRecord,
  type PlatformTariffVersion,
  type PayoutMethodRecord,
  type PayoutRequestRecord,
  type PayoutStore,
  type WalletBalance
} from "@elevenhouse/domain";
import type {
  FinancePayoutDestinationVaultPort,
  OnlineWalletPayoutRequestReader,
  OnlineWalletPayoutRequestUnitOfWork
} from "@elevenhouse/domain/finance-core";
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
import {
  ASTROLOGER_FINANCE_OPTIONS,
  ASTROLOGER_FINANCE_UNIT_OF_WORK,
  ASTROLOGER_PAYOUT_DESTINATION_VAULT
} from "./finance.tokens";
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
  let ledgerStore: Pick<
    LedgerStore,
    "createTransaction" | "findWalletBalance" | "summarizePeriod" | "listOperations"
  >;
  let tariffStore: Pick<
    PlatformTariffAuthorityStore,
    "findActiveOrPendingSubscription" | "findTariffVersion"
  >;
  let onlineWalletPayoutRequests: OnlineWalletPayoutRequestUnitOfWork;

  beforeEach(async () => {
    payoutStore = createPayoutStore();
    ledgerStore = createLedgerStore();
    tariffStore = createTariffStore();
    onlineWalletPayoutRequests = createOnlineWalletPayoutRequests();
    const unitOfWork = createFinanceUnitOfWork(
      payoutStore,
      ledgerStore,
      tariffStore,
      onlineWalletPayoutRequests
    );
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
      .useValue({
        minimumPayoutAmountMinor: 1_000_00
      })
      .overrideProvider(ASTROLOGER_PAYOUT_DESTINATION_VAULT)
      .useValue(createPayoutDestinationVault())
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
      recentPayoutRequests: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          status: "requested",
          amount: { amountMinor: 5_000_00, currency: "RUB" },
          version: 1
        }
      ],
      canRequestPayout: false,
      payoutRequestUnavailableReason: "payout_method_required",
      periodSummary: {
        periodStart: "2026-07-01T00:00:00.000Z",
        periodEndExclusive: "2026-08-01T00:00:00.000Z",
        grossSalesAmount: { amountMinor: 28_450_00, currency: "RUB" },
        platformFeeAmount: { amountMinor: 2_560_50, currency: "RUB" },
        netSalesAmount: { amountMinor: 25_889_50, currency: "RUB" },
        refundsAmount: { amountMinor: 1_600_00, currency: "RUB" },
        payoutsAmount: { amountMinor: 45_000_00, currency: "RUB" },
        saleCount: 9,
        refundCount: 1,
        payoutCount: 1,
        recurringRevenueAmount: null,
        recurringRevenueUnavailableReason: "client_subscriptions_not_implemented"
      },
      currentTariff: {
        tariffSeriesId: "pro",
        tariffVersion: 2,
        name: "Pro",
        price: { amountMinor: 199_000, currency: "RUB" },
        commissionBps: 400,
        billingCycle: "month",
        state: "active",
        startsAt: "2026-07-26T10:00:00.000Z",
        endsAt: "2026-08-26T10:00:00.000Z"
      }
    });
  });

  it("returns owner-scoped ledger operations with query filters", async () => {
    const operations = await getJson(
      baseUrl,
      "/finance/operations?limit=10&operationType=sale_captured"
    );

    expect(operations.status).toBe(200);
    ledgerOperationListResponseSchema.parse(operations.body);
    expect(operations.body).toMatchObject({
      operations: [
        {
          operationType: "sale_captured",
          kind: "sale",
          direction: "inflow",
          signedAmountMinor: 5_000_00,
          amountBreakdown: {
            grossAmountMinor: 5_700_00,
            platformFeeAmountMinor: 700_00,
            netAmountMinor: 5_000_00,
            currency: "RUB"
          },
          amount: { amountMinor: 5_000_00, currency: "RUB" },
          orderId: "11111111-1111-4111-8111-111111111111"
        }
      ],
      nextCursor: null
    });
    expect(ledgerStore.listOperations).toHaveBeenCalledWith({
      astrologerUserId,
      limit: 10,
      operationType: "sale_captured"
    });
  });

  it("creates a manual payout request through the v2 wallet writer with CSRF protection", async () => {
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
    const createMethod = payoutStore.createMethod as unknown as { mock: { calls: unknown[][] } };
    const persistedMethodInput = createMethod.mock.calls[0]?.[0];
    expect(persistedMethodInput).toMatchObject({
      destination: {
        kind: "sealed_payout_destination_snapshot",
        destinationKind: "bank_account",
        redactedDisplay: "Счёт •••• 4417"
      }
    });
    expect(JSON.stringify(persistedMethodInput)).not.toContain("40817810099910004417");

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
    expect(onlineWalletPayoutRequests.createOnlineWalletPayoutRequest).toHaveBeenCalledTimes(1);
    expect(onlineWalletPayoutRequests.createOnlineWalletPayoutRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        astrologerUserId,
        walletId: "66666666-6666-4666-8666-666666666666",
        amountMinor: "500000",
        currency: "RUB",
        destination: expect.objectContaining({
          payoutMethodId: method.body.id,
          destinationKind: "bank_account"
        })
      })
    );
    expect(ledgerStore.createTransaction).not.toHaveBeenCalled();
  });

  it("rejects payout requests below the configured minimum amount", async () => {
    const method = await postJson(
      baseUrl,
      "/finance/payout-methods/manual-bank-transfer",
      validPayoutMethodBody(),
      csrfHeaders("finance-method-minimum")
    );
    expect(method.status).toBe(201);

    const payout = await postJson(
      baseUrl,
      "/finance/payout-requests",
      {
        ...validPayoutRequestBody(),
        amount: { amountMinor: 999_99, currency: "RUB" },
        idempotencyKey: "finance-request-below-minimum"
      },
      csrfHeaders("finance-request-below-minimum")
    );

    expect(payout).toMatchObject({
      status: 409,
      body: { message: "payout_amount_below_minimum" }
    });
    expect(ledgerStore.createTransaction).not.toHaveBeenCalled();
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
  ledgerStore: Pick<
    LedgerStore,
    "createTransaction" | "findWalletBalance" | "summarizePeriod" | "listOperations"
  >,
  tariffStore: Pick<
    PlatformTariffAuthorityStore,
    "findActiveOrPendingSubscription" | "findTariffVersion"
  >,
  onlineWalletPayoutRequests: OnlineWalletPayoutRequestUnitOfWork
): AstrologerFinanceUnitOfWork {
  const completedFinanceCommands = new Map<string, Record<string, unknown>>();
  const financeCommandHashes = new Map<string, string>();

  return {
    execute: vi.fn(async (operation) =>
      operation({
        payoutStore,
        ledgerStore,
        tariffStore,
        onlineWalletPayoutRequests,
        onlineWalletPayoutRequestReader: createOnlineWalletPayoutRequestReader()
      } as Parameters<AstrologerFinanceUnitOfWork["execute"]>[0] extends (
        context: infer Context
      ) => Promise<unknown>
        ? Context
        : never)
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
            payoutStore,
            ledgerStore,
            tariffStore,
            onlineWalletPayoutRequests,
            onlineWalletPayoutRequestReader: createOnlineWalletPayoutRequestReader()
          } as Parameters<AstrologerFinanceUnitOfWork["execute"]>[0] extends (
            context: infer Context
          ) => Promise<unknown>
            ? Context
            : never,
          result
        );
        if (!value) throw new Error("Expected finance command replay value");
        return { kind: "replayed" as const, value };
      }

      financeCommandHashes.set(key, input.command.requestHash);
      const created = await input.create(
        {
          payoutStore,
          ledgerStore,
          tariffStore,
          onlineWalletPayoutRequests,
          onlineWalletPayoutRequestReader: createOnlineWalletPayoutRequestReader()
        } as Parameters<AstrologerFinanceUnitOfWork["execute"]>[0] extends (
          context: infer Context
        ) => Promise<unknown>
          ? Context
          : never
      );
      completedFinanceCommands.set(key, created.result);
      return { kind: "created" as const, value: created.value };
    }
  };
}

function createOnlineWalletPayoutRequests(): OnlineWalletPayoutRequestUnitOfWork {
  return {
    createOnlineWalletPayoutRequest: vi.fn(async (command) => ({
      kind: "online_wallet_payout_request_commit_receipt" as const,
      effect: "applied_once" as const,
      payoutRequestId: command.payoutRequestId,
      walletId: command.walletId,
      walletRevision: "3",
      payoutVersion: "1",
      mutationId: "77777777-7777-4777-8777-777777777777",
      journalTransactionId: "online-wallet-payout-request:finance-request-1"
    }))
  };
}

function createOnlineWalletPayoutRequestReader(): OnlineWalletPayoutRequestReader {
  const projection = ({
    payoutRequestId,
    astrologerUserId
  }: {
    payoutRequestId: string;
    astrologerUserId: string;
  }) => ({
    payoutRequestId,
    walletId: "66666666-6666-4666-8666-666666666666",
    astrologerUserId,
    amountMinor: "500000",
    currency: "RUB" as const,
    status: "requested" as const,
    version: "1",
    requestedAt: now.toISOString(),
    latestTransitionActorUserId: astrologerUserId,
    latestTransitionOccurredAt: now.toISOString(),
    latestTransitionFailureReason: null,
    latestTransitionAdminNote: null,
    paidBankReference: null,
    paidTransferredAt: null
  });

  return {
    findWalletId: vi.fn(async () => "66666666-6666-4666-8666-666666666666"),
    findPayoutRequest: vi.fn(async (input) => projection(input)),
    findPayoutRequestById: vi.fn(async () => null),
    listPayoutRequests: vi.fn(async () => []),
    listPayoutRequestsForAstrologer: vi.fn(async (input) => [
      projection({
        payoutRequestId: "55555555-5555-4555-8555-555555555555",
        astrologerUserId: input.astrologerUserId
      })
    ])
  };
}

function createPayoutStore(): PayoutStore {
  let defaultMethod: PayoutMethodRecord | null = null;
  const requests: PayoutRequestRecord[] = [];

  return {
    createMethod: vi.fn(async (input) => {
      const method: PayoutMethodRecord = {
        id: input.id ?? "33333333-3333-4333-8333-333333333333",
        astrologerUserId: input.astrologerUserId,
        method: input.method,
        currency: input.currency,
        displayName: input.displayName,
        destination: input.destination,
        isDefault: input.isDefault,
        createdAt: input.now,
        updatedAt: input.now
      };
      defaultMethod = method;
      return method;
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

function createLedgerStore(): Pick<
  LedgerStore,
  "createTransaction" | "findWalletBalance" | "summarizePeriod" | "listOperations"
> {
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
    summarizePeriod: vi.fn(
      async (input): Promise<FinancePeriodSummary> => ({
        periodStart: input.periodStart,
        periodEndExclusive: input.periodEndExclusive,
        grossSalesAmount: { amountMinor: 28_450_00, currency: "RUB" },
        platformFeeAmount: { amountMinor: 2_560_50, currency: "RUB" },
        netSalesAmount: { amountMinor: 25_889_50, currency: "RUB" },
        refundsAmount: { amountMinor: 1_600_00, currency: "RUB" },
        payoutsAmount: { amountMinor: 45_000_00, currency: "RUB" },
        saleCount: 9,
        refundCount: 1,
        payoutCount: 1,
        recurringRevenueAmount: null,
        recurringRevenueUnavailableReason: "client_subscriptions_not_implemented"
      })
    ),
    listOperations: vi.fn(
      async (input): Promise<LedgerOperationList> => ({
        operations:
          input.astrologerUserId === astrologerUserId
            ? [
                {
                  id: "99999999-9999-4999-8999-999999999999",
                  operationType: "sale_captured",
                  kind: "sale",
                  direction: "inflow",
                  amount: { amountMinor: 5_000_00, currency: "RUB" },
                  signedAmountMinor: 5_000_00,
                  amountBreakdown: {
                    grossAmountMinor: 5_700_00,
                    platformFeeAmountMinor: 700_00,
                    netAmountMinor: 5_000_00,
                    currency: "RUB"
                  },
                  balanceBucket: "pending",
                  orderId: "11111111-1111-4111-8111-111111111111",
                  payoutRequestId: null,
                  occurredAt: now.toISOString(),
                  postedAt: now.toISOString(),
                  metadata: { providerPaymentId: "arc-pay-1" }
                }
              ]
            : [],
        nextCursor: null
      })
    ),
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

function createTariffStore(): Pick<
  PlatformTariffAuthorityStore,
  "findActiveOrPendingSubscription" | "findTariffVersion"
> {
  const digest = `sha256:${"a".repeat(64)}` as `sha256:${string}`;
  const tariff: PlatformTariffVersion = {
    tariffSeriesId: "pro",
    version: 2,
    draftRevision: 1,
    lifecycle: "published",
    name: "Pro",
    tagline: "For active practices",
    monthlyPriceMinor: 199_000,
    yearlyPriceMinor: 1_990_000,
    monthlyRecurringFrequencyDays: 30,
    yearlyRecurringFrequencyDays: 365,
    clientSaleCommissionBps: 400,
    seatsLimit: null,
    bookingsLimit: null,
    aiRequestsLimit: null,
    automationLimit: null,
    isPopular: false,
    displayOrder: 0,
    features: [],
    canonicalDigest: digest
  };
  const subscription: PlatformTariffSubscriptionRecord = {
    subscriptionId: "12121212-1212-4121-8121-121212121212",
    ownerUserId: astrologerUserId,
    tariffSeriesId: tariff.tariffSeriesId,
    tariffVersion: tariff.version,
    tariffVersionDigest: digest,
    commissionBpsSnapshot: tariff.clientSaleCommissionBps,
    version: 3,
    billingCycle: "month",
    state: "active",
    startsAt: "2026-07-26T10:00:00.000Z",
    endsAt: "2026-08-26T10:00:00.000Z"
  };
  return {
    findActiveOrPendingSubscription: vi.fn(async () => subscription),
    findTariffVersion: vi.fn(async () => tariff)
  };
}

function validPayoutMethodBody(): Record<string, unknown> {
  return {
    displayName: "Основной счет",
    destinationKind: "bank_account",
    recipientName: "Alisa Vega",
    bankName: "T-Bank",
    destinationValue: "40817810099910004417",
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
    payoutMethodVersion: 1,
    destination: sealedDestination(input.payoutMethodId),
    status: "requested",
    amount: { amountMinor: input.amountMinor, currency: "RUB" },
    method: "manual_bank_transfer",
    requestedAt: input.now,
    reviewedAt: null,
    completedAt: null,
    adminUserId: null,
    adminNote: null,
    failureReason: null,
    externalReference: null,
    transferredAt: null,
    paidProofArtifact: null,
    version: 1,
    metadata: { source: "astrologer_finance" },
    createdAt: input.now,
    updatedAt: input.now
  };
}

function sealedDestination(payoutMethodId: string) {
  return {
    kind: "sealed_payout_destination_snapshot" as const,
    payoutMethodId,
    payoutMethodVersion: 1,
    destinationKind: "bank_account" as const,
    beneficiaryFingerprint:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
    redactedDisplay: "Счёт •••• 4417",
    sealedDestinationRef: "kms://test/payout-destination"
  };
}

function createPayoutDestinationVault(): FinancePayoutDestinationVaultPort {
  return {
    sealPayoutDestination: async (input) => ({
      kind: "sealed_payout_destination_snapshot",
      payoutMethodId: input.payoutMethodId,
      payoutMethodVersion: input.payoutMethodVersion,
      destinationKind: input.destinationKind,
      beneficiaryFingerprint:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      redactedDisplay: `${input.destinationKind === "bank_card" ? "Карта" : "Счёт"} •••• ${input.destinationValue.slice(-4)}`,
      sealedDestinationRef: "kms://test/payout-destination"
    }),
    resolvePayoutDestination: async () => raise("Unexpected payout destination resolve")
  };
}

function raise(message: string): never {
  throw new Error(message);
}
