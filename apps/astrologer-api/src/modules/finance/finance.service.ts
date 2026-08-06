import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  astrologerFinanceOverviewResponseSchema,
  createManualBankTransferPayoutMethodSchema,
  createPayoutRequestSchema,
  ledgerOperationListQuerySchema,
  ledgerOperationListResponseSchema,
  type AstrologerFinanceCurrentTariff,
  payoutMethodResponseSchema,
  payoutRequestResponseSchema,
  type AstrologerFinanceOverviewResponse,
  type CreateManualBankTransferPayoutMethod,
  type CreatePayoutRequest,
  type LedgerOperationListResponse,
  type PayoutMethodResponse,
  type PayoutRequestResponse
} from "@elevenhouse/contracts";
import {
  createManualPayoutMethod,
  FinanceIdempotencyConflictError,
  FinanceIdempotencyFailedError,
  FinanceIdempotencyInProgressError,
  getAstrologerFinanceOverview,
  PayoutMethodAlreadyConfiguredError,
  type FinanceIdempotentCommand,
  type PlatformTariffSubscriptionRecord,
  type PlatformTariffVersion,
  type PayoutMethodRecord,
  type PayoutRequestRecord
} from "@elevenhouse/domain";
import {
  type FinancePayoutDestinationVaultPort,
  type OnlineWalletPayoutRequestProjection
} from "@elevenhouse/domain/finance-core";
import {
  OnlineWalletPayoutRequestPersistenceError,
  OnlineWalletPayoutRequestReadError
} from "@elevenhouse/db/finance";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import {
  ASTROLOGER_FINANCE_OPTIONS,
  ASTROLOGER_FINANCE_UNIT_OF_WORK,
  ASTROLOGER_PAYOUT_DESTINATION_VAULT
} from "./finance.tokens";
import type { AstrologerFinanceOptions, AstrologerFinanceUnitOfWork } from "./finance.unit-of-work";

@Injectable()
export class FinanceService {
  constructor(
    @Inject(ASTROLOGER_FINANCE_UNIT_OF_WORK)
    private readonly unitOfWork: AstrologerFinanceUnitOfWork,
    @Inject(ASTROLOGER_FINANCE_OPTIONS)
    private readonly options: AstrologerFinanceOptions,
    @Inject(ASTROLOGER_PAYOUT_DESTINATION_VAULT)
    private readonly payoutDestinationVault: FinancePayoutDestinationVaultPort | null,
    @Inject(SystemClock)
    private readonly clock: SystemClock
  ) {}

  async getCurrentFinanceOverview(
    request: AstrologerSessionRequest
  ): Promise<AstrologerFinanceOverviewResponse> {
    const astrologerUserId = requireAstrologerUserId(request);
    const now = this.clock.now().toISOString();
    let result: {
      readonly overview: Awaited<ReturnType<typeof getAstrologerFinanceOverview>>;
      readonly tariff: AstrologerFinanceCurrentTariff | null;
      readonly recentOnlinePayoutRequests: readonly OnlineWalletPayoutRequestProjection[];
    };
    try {
      result = await this.unitOfWork.execute(
        async ({ payoutStore, ledgerStore, tariffStore, onlineWalletPayoutRequestReader }) => {
          const [financeOverview, subscription, recentOnlinePayoutRequests] = await Promise.all([
            getAstrologerFinanceOverview({
              store: { ...payoutStore, ...ledgerStore },
              astrologerUserId,
              minimumPayoutAmount: {
                amountMinor: this.options.minimumPayoutAmountMinor,
                currency: "RUB"
              },
              now
            }),
            tariffStore.findActiveOrPendingSubscription(astrologerUserId),
            onlineWalletPayoutRequestReader.listPayoutRequestsForAstrologer({
              astrologerUserId,
              limit: 10
            })
          ]);
          if (!subscription) {
            return { overview: financeOverview, tariff: null, recentOnlinePayoutRequests };
          }
          const tariff = await tariffStore.findTariffVersion({
            tariffSeriesId: subscription.tariffSeriesId,
            version: subscription.tariffVersion,
            canonicalDigest: subscription.tariffVersionDigest
          });
          return {
            overview: financeOverview,
            tariff: toFinanceCurrentTariffResponse(subscription, tariff),
            recentOnlinePayoutRequests
          };
        }
      );
    } catch (error) {
      if (error instanceof OnlineWalletPayoutRequestReadError) {
        throw new ServiceUnavailableException(error.code);
      }
      throw error;
    }
    const { overview, tariff, recentOnlinePayoutRequests } = result;

    return astrologerFinanceOverviewResponseSchema.parse({
      ...overview,
      defaultPayoutMethod: overview.defaultPayoutMethod
        ? toPayoutMethodResponse(overview.defaultPayoutMethod)
        : null,
      // V2 is authoritative for payout requests. The legacy overview still owns only the
      // temporarily unmigrated wallet-period metrics; it must never supply a request fallback.
      recentPayoutRequests: recentOnlinePayoutRequests.map(toOnlinePayoutRequestResponse),
      currentTariff: tariff
    });
  }

  async listOperations(
    request: AstrologerSessionRequest,
    query: unknown
  ): Promise<LedgerOperationListResponse> {
    const astrologerUserId = requireAstrologerUserId(request);
    const parsedQuery = parseFinanceQuery(ledgerOperationListQuerySchema, query);
    const result = await this.unitOfWork.execute(({ ledgerStore }) =>
      ledgerStore.listOperations({
        astrologerUserId,
        limit: parsedQuery.limit ?? 25,
        ...(parsedQuery.cursor ? { cursor: parsedQuery.cursor } : {}),
        ...(parsedQuery.operationType ? { operationType: parsedQuery.operationType } : {}),
        ...(parsedQuery.balanceBucket ? { balanceBucket: parsedQuery.balanceBucket } : {})
      })
    );

    return ledgerOperationListResponseSchema.parse(result);
  }

  async createManualBankTransferPayoutMethod(
    request: AstrologerSessionRequest,
    body: unknown
  ): Promise<PayoutMethodResponse> {
    const astrologerUserId = requireAstrologerUserId(request);
    const parsedBody = parseFinanceBody(createManualBankTransferPayoutMethodSchema, body);
    const now = this.clock.now();
    if (!this.payoutDestinationVault) {
      throw new ServiceUnavailableException("payout_destination_vault_unavailable");
    }
    const payoutMethodId = deterministicPayoutMethodId({
      astrologerUserId,
      idempotencyKey: parsedBody.idempotencyKey,
      request: parsedBody
    });
    const destination = await this.payoutDestinationVault.sealPayoutDestination({
      payoutMethodId,
      payoutMethodVersion: 1,
      astrologerUserId,
      destinationKind: parsedBody.destinationKind,
      recipientName: parsedBody.recipientName,
      bankName: parsedBody.bankName,
      destinationValue: parsedBody.destinationValue
    });

    try {
      const result = await this.unitOfWork.executeIdempotent({
        command: createAstrologerFinanceCommand({
          scope: "astrologer.finance.payout-method.manual-bank-transfer",
          idempotencyKey: parsedBody.idempotencyKey,
          actorUserId: astrologerUserId,
          body: parsedBody,
          now
        }),
        create: async ({ payoutStore }) => {
          const method = await createManualPayoutMethod({
            store: payoutStore,
            payoutMethodId,
            astrologerUserId,
            displayName: parsedBody.displayName,
            destination,
            now: now.toISOString()
          });
          return { result: { payoutMethodId: method.id }, value: method };
        },
        replay: async ({ payoutStore }, persistedResult) => {
          const payoutMethodId = persistedResult.payoutMethodId;
          if (typeof payoutMethodId !== "string") return null;
          const method = await payoutStore.findDefaultMethod(astrologerUserId);
          return method?.id === payoutMethodId ? method : null;
        }
      });

      return toPayoutMethodResponse(result.value);
    } catch (error) {
      if (error instanceof PayoutMethodAlreadyConfiguredError) {
        throw new ConflictException(error.code);
      }
      mapFinanceIdempotencyErrors(error);
      throw error;
    }
  }

  async createPayoutRequest(
    request: AstrologerSessionRequest,
    body: unknown
  ): Promise<PayoutRequestResponse> {
    const astrologerUserId = requireAstrologerUserId(request);
    const parsedBody = parseFinanceBody(createPayoutRequestSchema, body);
    const now = this.clock.now();
    if (parsedBody.amount.amountMinor < this.options.minimumPayoutAmountMinor) {
      throw new ConflictException("payout_amount_below_minimum");
    }
    const command = createAstrologerFinanceCommand({
      scope: "astrologer.finance.payout-request",
      idempotencyKey: parsedBody.idempotencyKey,
      actorUserId: astrologerUserId,
      body: parsedBody,
      now
    });
    const payoutRequestId = deterministicPayoutRequestId({
      astrologerUserId,
      idempotencyKey: parsedBody.idempotencyKey
    });

    try {
      const result = await this.unitOfWork.executeIdempotent({
        command,
        create: async ({
          payoutStore,
          onlineWalletPayoutRequests,
          onlineWalletPayoutRequestReader
        }) => {
          const method = await payoutStore.findDefaultMethod(astrologerUserId);
          if (!method) throw new ConflictException("payout_method_missing");
          if (method.method !== parsedBody.method) {
            throw new ConflictException("payout_method_mismatch");
          }
          const walletId = await onlineWalletPayoutRequestReader.findWalletId({
            astrologerUserId,
            currency: "RUB"
          });
          if (!walletId) throw new ConflictException("payout_insufficient_available_balance");
          await onlineWalletPayoutRequests.createOnlineWalletPayoutRequest({
            payoutRequestId,
            walletId,
            astrologerUserId,
            amountMinor: String(parsedBody.amount.amountMinor),
            currency: "RUB",
            destination: method.destination,
            requestAuthority: {
              authorityId: `astrologer-finance-payout-request:${payoutRequestId}`,
              authorityVersion: "1",
              authorityDigest: command.requestHash
            },
            occurredAt: now.toISOString()
          });
          const payoutRequest = await onlineWalletPayoutRequestReader.findPayoutRequest({
            payoutRequestId,
            astrologerUserId
          });
          if (!payoutRequest) throw new ServiceUnavailableException("payout_request_read_unavailable");
          return { result: { payoutRequestId }, value: payoutRequest };
        },
        replay: async ({ onlineWalletPayoutRequestReader }, persistedResult) => {
          const persistedPayoutRequestId = persistedResult.payoutRequestId;
          if (persistedPayoutRequestId !== payoutRequestId) return null;
          return onlineWalletPayoutRequestReader.findPayoutRequest({
            payoutRequestId,
            astrologerUserId
          });
        }
      });

      return toOnlinePayoutRequestResponse(result.value);
    } catch (error) {
      if (error instanceof OnlineWalletPayoutRequestPersistenceError) {
        throw new ConflictException(mapOnlineWalletPayoutRequestError(error));
      }
      if (error instanceof OnlineWalletPayoutRequestReadError) {
        throw new ServiceUnavailableException(error.code);
      }
      mapFinanceIdempotencyErrors(error);
      throw error;
    }
  }
}

/**
 * The immutable vault write happens before the database transaction. A stable, request-content
 * address makes retry recover the same S3 object rather than creating another beneficiary copy.
 */
function deterministicPayoutMethodId(input: {
  readonly astrologerUserId: string;
  readonly idempotencyKey: string;
  readonly request: CreateManualBankTransferPayoutMethod;
}): string {
  const digest = createHash("sha256")
    .update(`elevenhouse:payout-method:v1\u0000${input.astrologerUserId}\u0000${input.idempotencyKey}\u0000${stableStringify(input.request)}`)
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function deterministicPayoutRequestId(input: {
  readonly astrologerUserId: string;
  readonly idempotencyKey: string;
}): string {
  const digest = createHash("sha256")
    .update(`elevenhouse:online-wallet-payout-request:v2\u0000${input.astrologerUserId}\u0000${input.idempotencyKey}`)
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function requireAstrologerUserId(request: AstrologerSessionRequest): string {
  const userId = request.currentAstrologerAccount?.account.id;
  if (!userId) throw new UnauthorizedException("Valid astrologer session is required");
  return userId;
}

function createAstrologerFinanceCommand(input: {
  readonly scope: string;
  readonly idempotencyKey: string;
  readonly actorUserId: string;
  readonly body: CreateManualBankTransferPayoutMethod | CreatePayoutRequest;
  readonly now: Date;
}): FinanceIdempotentCommand {
  return {
    scope: input.scope,
    idempotencyKey: input.idempotencyKey,
    actorUserId: input.actorUserId,
    requestHash: `sha256:${createHash("sha256").update(stableStringify(input.body)).digest("hex")}`,
    now: input.now.toISOString(),
    expiresAt: new Date(input.now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()
  };
}

function toPayoutMethodResponse(method: PayoutMethodRecord): PayoutMethodResponse {
  return payoutMethodResponseSchema.parse({
    id: method.id,
    astrologerUserId: method.astrologerUserId,
    method: method.method,
    currency: method.currency,
    displayName: method.displayName,
    isDefault: method.isDefault,
    createdAt: method.createdAt,
    updatedAt: method.updatedAt
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Retained until the legacy payout reader is removed in its owning release.
function toPayoutRequestResponse(request: PayoutRequestRecord): PayoutRequestResponse {
  return payoutRequestResponseSchema.parse({
    id: request.id,
    astrologerUserId: request.astrologerUserId,
    status: request.status,
    amount: request.amount,
    method: request.method,
    requestedAt: request.requestedAt,
    reviewedAt: request.reviewedAt,
    completedAt: request.completedAt,
    adminUserId: request.adminUserId,
    adminNote: request.adminNote,
    failureReason: request.failureReason,
    externalReference: request.externalReference,
    transferredAt: request.transferredAt,
    version: request.version
  });
}

function toOnlinePayoutRequestResponse(
  request: OnlineWalletPayoutRequestProjection
): PayoutRequestResponse {
  return payoutRequestResponseSchema.parse({
    id: request.payoutRequestId,
    astrologerUserId: request.astrologerUserId,
    status: request.status,
    amount: { amountMinor: Number(request.amountMinor), currency: request.currency },
    method: "manual_bank_transfer",
    requestedAt: request.requestedAt,
    reviewedAt: request.status === "requested" ? null : request.latestTransitionOccurredAt,
    completedAt:
      request.status === "cancelled" ||
      request.status === "rejected" ||
      request.status === "failed" ||
      request.status === "paid"
        ? request.latestTransitionOccurredAt
        : null,
    adminUserId: null,
    adminNote: null,
    failureReason: null,
    externalReference: request.paidBankReference,
    transferredAt: request.paidTransferredAt,
    version: Number(request.version)
  });
}

function mapOnlineWalletPayoutRequestError(
  error: OnlineWalletPayoutRequestPersistenceError
): string {
  switch (error.reason) {
    case "insufficient_available_balance":
    case "wallet_scope_mismatch":
      return "payout_insufficient_available_balance";
    case "payout_method_mismatch":
      return "payout_method_mismatch";
    case "payout_request_conflict":
      return "finance_idempotency_key_reused_with_different_request";
    case "retryable_concurrency_conflict":
    case "wallet_commit_conflict":
      return "payout_request_concurrent_update";
    case "invalid_command":
    case "persistence_write_incomplete":
      return error.code;
  }
}

function toFinanceCurrentTariffResponse(
  subscription: PlatformTariffSubscriptionRecord,
  tariff: PlatformTariffVersion | null
): AstrologerFinanceCurrentTariff {
  if (
    !tariff ||
    (tariff.lifecycle !== "published" && tariff.lifecycle !== "retired") ||
    subscription.tariffSeriesId !== tariff.tariffSeriesId ||
    subscription.tariffVersion !== tariff.version ||
    subscription.tariffVersionDigest !== tariff.canonicalDigest ||
    subscription.commissionBpsSnapshot !== tariff.clientSaleCommissionBps
  ) {
    throw new ConflictException("tariff_subscription_snapshot_unavailable");
  }

  return {
    tariffSeriesId: subscription.tariffSeriesId,
    tariffVersion: subscription.tariffVersion,
    name: tariff.name,
    price: {
      amountMinor:
        subscription.billingCycle === "month" ? tariff.monthlyPriceMinor : tariff.yearlyPriceMinor,
      currency: "RUB"
    },
    commissionBps: subscription.commissionBpsSnapshot,
    billingCycle: subscription.billingCycle,
    state: subscription.state,
    startsAt: subscription.startsAt,
    endsAt: subscription.endsAt
  };
}

function parseFinanceBody<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch {
    throw new BadRequestException("Invalid finance request");
  }
}

function parseFinanceQuery<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch {
    throw new BadRequestException("Invalid finance query");
  }
}

function mapFinanceIdempotencyErrors(error: unknown): never | void {
  if (
    error instanceof FinanceIdempotencyConflictError ||
    error instanceof FinanceIdempotencyInProgressError ||
    error instanceof FinanceIdempotencyFailedError
  ) {
    throw new ConflictException(error.code);
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
