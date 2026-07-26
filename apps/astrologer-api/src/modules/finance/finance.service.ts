import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  astrologerFinanceOverviewResponseSchema,
  createManualBankTransferPayoutMethodSchema,
  createPayoutRequestSchema,
  payoutMethodResponseSchema,
  payoutRequestResponseSchema,
  type AstrologerFinanceOverviewResponse,
  type CreateManualBankTransferPayoutMethod,
  type CreatePayoutRequest,
  type PayoutMethodResponse,
  type PayoutRequestResponse
} from "@elevenhouse/contracts";
import {
  createManualPayoutMethod,
  FinanceIdempotencyConflictError,
  FinanceIdempotencyFailedError,
  FinanceIdempotencyInProgressError,
  getAstrologerFinanceOverview,
  PayoutInsufficientAvailableBalanceError,
  PayoutMethodAlreadyConfiguredError,
  PayoutMethodMismatchError,
  PayoutMethodMissingError,
  requestAstrologerPayout,
  type FinanceIdempotentCommand,
  type PayoutMethodRecord,
  type PayoutRequestRecord
} from "@elevenhouse/domain";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { ASTROLOGER_FINANCE_OPTIONS, ASTROLOGER_FINANCE_UNIT_OF_WORK } from "./finance.tokens";
import type { AstrologerFinanceOptions, AstrologerFinanceUnitOfWork } from "./finance.unit-of-work";

@Injectable()
export class FinanceService {
  constructor(
    @Inject(ASTROLOGER_FINANCE_UNIT_OF_WORK)
    private readonly unitOfWork: AstrologerFinanceUnitOfWork,
    @Inject(ASTROLOGER_FINANCE_OPTIONS)
    private readonly options: AstrologerFinanceOptions,
    @Inject(SystemClock)
    private readonly clock: SystemClock
  ) {}

  async getCurrentFinanceOverview(
    request: AstrologerSessionRequest
  ): Promise<AstrologerFinanceOverviewResponse> {
    const astrologerUserId = requireAstrologerUserId(request);
    const now = this.clock.now().toISOString();
    const overview = await this.unitOfWork.execute(({ payoutStore, ledgerStore }) =>
      getAstrologerFinanceOverview({
        store: { ...payoutStore, ...ledgerStore },
        astrologerUserId,
        minimumPayoutAmount: {
          amountMinor: this.options.minimumPayoutAmountMinor,
          currency: "RUB"
        },
        now
      })
    );

    return astrologerFinanceOverviewResponseSchema.parse({
      ...overview,
      defaultPayoutMethod: overview.defaultPayoutMethod
        ? toPayoutMethodResponse(overview.defaultPayoutMethod)
        : null,
      recentPayoutRequests: overview.recentPayoutRequests.map(toPayoutRequestResponse)
    });
  }

  async createManualBankTransferPayoutMethod(
    request: AstrologerSessionRequest,
    body: unknown
  ): Promise<PayoutMethodResponse> {
    const astrologerUserId = requireAstrologerUserId(request);
    const parsedBody = parseFinanceBody(createManualBankTransferPayoutMethodSchema, body);
    const now = this.clock.now();

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
            astrologerUserId,
            displayName: parsedBody.displayName,
            recipientName: parsedBody.recipientName,
            bankName: parsedBody.bankName,
            accountNumberLast4: parsedBody.accountNumberLast4,
            details: parsedBody.details ?? {},
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

    try {
      const result = await this.unitOfWork.executeIdempotent({
        command: createAstrologerFinanceCommand({
          scope: "astrologer.finance.payout-request",
          idempotencyKey: parsedBody.idempotencyKey,
          actorUserId: astrologerUserId,
          body: parsedBody,
          now
        }),
        create: async ({ payoutStore, ledgerStore }) => {
          const payoutRequest = await requestAstrologerPayout({
            store: { ...payoutStore, ...ledgerStore },
            astrologerUserId,
            amount: parsedBody.amount,
            method: parsedBody.method,
            metadata: { source: "astrologer_finance" },
            now: now.toISOString()
          });
          return { result: { payoutRequestId: payoutRequest.id }, value: payoutRequest };
        },
        replay: async ({ payoutStore }, persistedResult) => {
          const payoutRequestId = persistedResult.payoutRequestId;
          if (typeof payoutRequestId !== "string") return null;
          const payoutRequest = await payoutStore.findRequestById(payoutRequestId);
          return payoutRequest?.astrologerUserId === astrologerUserId ? payoutRequest : null;
        }
      });

      return toPayoutRequestResponse(result.value);
    } catch (error) {
      if (
        error instanceof PayoutMethodMissingError ||
        error instanceof PayoutInsufficientAvailableBalanceError ||
        error instanceof PayoutMethodMismatchError
      ) {
        throw new ConflictException(error.code);
      }
      mapFinanceIdempotencyErrors(error);
      throw error;
    }
  }
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
    providerPayoutId: request.providerPayoutId
  });
}

function parseFinanceBody<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch {
    throw new BadRequestException("Invalid finance request");
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
