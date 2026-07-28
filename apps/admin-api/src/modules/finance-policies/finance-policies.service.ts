import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  adminPaymentReversalCaseReviewRequestSchema,
  adminPaymentReversalQueueResponseSchema,
  adminPayoutQueueStatusFilterSchema,
  adminReconciliationExceptionQueueResponseSchema,
  adminReconciliationExceptionEvidenceFilterSchema,
  adminPayoutQueueResponseSchema,
  adminPayoutStatusUpdateSchema,
  financePaymentProviderSchema,
  paymentProviderEnvironmentSchema,
  reconciliationRecordResponseSchema,
  resolveReconciliationExceptionRequestSchema,
  type AdminPaymentReversalCase,
  type AdminPaymentReversalCaseReviewRequest,
  type AdminPaymentReversalCaseType,
  type AdminPaymentReversalQueueResponse,
  type AdminPayoutQueueStatusFilter,
  type AdminReconciliationExceptionQueueResponse,
  astrologerRiskProfileResponseSchema,
  financePoliciesResponseSchema,
  financePolicyResponseSchema,
  orderResponseSchema,
  payoutRequestResponseSchema,
  riskTierValues,
  updateAstrologerRiskProfileRequestSchema,
  updateFinancePolicyRequestSchema,
  type AdminPayoutQueueResponse,
  type AdminPayoutStatusUpdate,
  type AstrologerRiskProfileResponse,
  type FinancePoliciesResponse,
  type FinancePolicyResponse,
  type OrderResponse,
  type PayoutRequestResponse,
  type PayoutRequestStatus,
  type ReconciliationRecordResponse
} from "@elevenhouse/contracts";
import {
  approvePayoutStatusUpdate,
  applyEffectiveFinancePolicyToOrder,
  assignAstrologerRiskProfile,
  ensureDefaultFinancePolicy,
  FinanceIdempotencyConflictError,
  FinanceIdempotencyFailedError,
  FinanceIdempotencyInProgressError,
  type FinanceIdempotentCommand,
  FinancePolicyEffectivePolicyUnavailableError,
  FinancePolicyOrderNotApplicableError,
  FinancePolicyOrderNotFoundError,
  type AdminPaymentReversalCaseRecord,
  PayoutRequestNotFoundError,
  type PayoutRequestRecord,
  PayoutStatusEvidenceError,
  PayoutStatusTransitionError,
  ReconciliationRecordNotFoundError,
  resolveProviderReconciliationException,
  type ReconciliationRecord,
  updateFinancePolicy
} from "@elevenhouse/domain";
import { SystemClock } from "../../common/system-clock.js";
import { ADMIN_FINANCE_POLICY_UNIT_OF_WORK } from "./finance-policies.tokens";
import type {
  AdminFinancePolicyUnitOfWork,
  AdminFinancePolicyUnitOfWorkContext
} from "./finance-policies.unit-of-work";

@Injectable()
export class FinancePoliciesService {
  constructor(
    @Inject(ADMIN_FINANCE_POLICY_UNIT_OF_WORK)
    private readonly unitOfWork: AdminFinancePolicyUnitOfWork,
    @Inject(SystemClock)
    private readonly clock: SystemClock
  ) {}

  async listPolicies(): Promise<FinancePoliciesResponse> {
    const policies = await this.unitOfWork.execute(async ({ store }) => {
      const result = [];
      for (const riskTier of riskTierValues) {
        result.push(await store.findActivePolicyByRiskTier(riskTier));
      }
      return result;
    });
    return financePoliciesResponseSchema.parse({
      policies: policies.filter((policy): policy is NonNullable<typeof policy> => Boolean(policy))
    });
  }

  async ensureDefault(adminUserId: string): Promise<FinancePolicyResponse> {
    const now = this.clock.now();
    const policy = await this.unitOfWork.execute(async ({ store, auditSink }) => {
      const ensuredPolicy = await ensureDefaultFinancePolicy({
        store,
        adminUserId,
        now
      });
      await auditSink.record({
        actorUserId: adminUserId,
        action: "finance_policy.default_created",
        targetId: ensuredPolicy.id,
        occurredAt: now.toISOString(),
        metadata: { riskTier: ensuredPolicy.riskTier, policyVersion: ensuredPolicy.policyVersion }
      });
      return ensuredPolicy;
    });
    return financePolicyResponseSchema.parse(policy);
  }

  async updatePolicy(adminUserId: string, body: unknown): Promise<FinancePolicyResponse> {
    const request = parseBody(updateFinancePolicyRequestSchema, body);
    const now = this.clock.now();
    const policy = await this.unitOfWork.execute(async ({ store, auditSink }) => {
      const updatedPolicy = await updateFinancePolicy({
        store,
        adminUserId,
        request,
        now
      });
      await auditSink.record({
        actorUserId: adminUserId,
        action: "finance_policy.updated",
        targetId: updatedPolicy.id,
        occurredAt: now.toISOString(),
        metadata: {
          riskTier: updatedPolicy.riskTier,
          policyVersion: updatedPolicy.policyVersion
        }
      });
      return updatedPolicy;
    });
    return financePolicyResponseSchema.parse(policy);
  }

  async updateRiskProfile(
    adminUserId: string,
    astrologerUserId: string,
    body: unknown
  ): Promise<AstrologerRiskProfileResponse> {
    const request = parseBody(updateAstrologerRiskProfileRequestSchema, body);
    const now = this.clock.now();
    const profile = await this.unitOfWork.execute(async ({ store, auditSink }) => {
      const updatedProfile = await assignAstrologerRiskProfile({
        store,
        adminUserId,
        astrologerUserId,
        request,
        now
      });
      await auditSink.record({
        actorUserId: adminUserId,
        action: "astrologer_risk_profile.updated",
        targetId: astrologerUserId,
        occurredAt: now.toISOString(),
        metadata: {
          riskTier: updatedProfile.riskTier,
          manualRiskTier: updatedProfile.manualRiskTier
        }
      });
      return updatedProfile;
    });
    return astrologerRiskProfileResponseSchema.parse(profile);
  }

  async applyRiskPolicyToOrder(adminUserId: string, orderId: string): Promise<OrderResponse> {
    const now = this.clock.now();
    try {
      const result = await this.unitOfWork.execute(async ({ store, orderStore, auditSink }) => {
        const applied = await applyEffectiveFinancePolicyToOrder({
          financePolicyStore: store,
          orderStore,
          orderId,
          now
        });
        await auditSink.record({
          actorUserId: adminUserId,
          action: "finance_policy.applied_to_order",
          targetId: applied.after.id,
          occurredAt: now.toISOString(),
          metadata: {
            beforePolicySnapshotId: applied.before.financePolicySnapshotId,
            afterPolicySnapshotId: applied.after.financePolicySnapshotId,
            beforeRiskTier: applied.before.financePolicyRiskTier,
            afterRiskTier: applied.after.financePolicyRiskTier,
            holdDurationHours: applied.after.financePolicyHoldDurationHours,
            reserveBps: applied.after.financePolicyReserveBps,
            reserveReleaseDelayDays: applied.after.financePolicyReserveReleaseDelayDays,
            providerSettlementRequired: applied.after.financePolicyProviderSettlementRequired
          }
        });
        return applied.after;
      });
      return orderResponseSchema.parse(result);
    } catch (error) {
      if (error instanceof FinancePolicyOrderNotFoundError) {
        throw new NotFoundException(error.code);
      }
      if (
        error instanceof FinancePolicyOrderNotApplicableError ||
        error instanceof FinancePolicyEffectivePolicyUnavailableError
      ) {
        throw new ConflictException(error.code);
      }
      throw error;
    }
  }

  async listPayoutRequests(status?: string): Promise<AdminPayoutQueueResponse> {
    const statusFilter = parsePayoutQueueStatusFilter(status);
    const requests = await this.unitOfWork.execute(({ payoutStore }) =>
      payoutStore.listRequests({
        statuses: payoutStatusesForFilter(statusFilter),
        limit: 50
      })
    );
    return adminPayoutQueueResponseSchema.parse({
      summary: createPayoutQueueSummary(requests),
      requests: requests.map(toPayoutRequestResponse)
    });
  }

  async listPaymentReversalCases(type?: string): Promise<AdminPaymentReversalQueueResponse> {
    const types = parseReversalCaseTypes(type);
    const cases = await this.unitOfWork.execute(({ reversalCaseStore }) =>
      reversalCaseStore.listCases({
        ...(types ? { types } : {}),
        limit: 50
      })
    );
    const responseCases = cases.map(toPaymentReversalCaseResponse);
    return adminPaymentReversalQueueResponseSchema.parse({
      summary: createPaymentReversalQueueSummary(responseCases),
      cases: responseCases
    });
  }

  async reviewPaymentReversalCase(
    adminUserId: string,
    reversalCaseId: string,
    body: unknown
  ): Promise<AdminPaymentReversalCase> {
    const request = parseBody(adminPaymentReversalCaseReviewRequestSchema, body);
    const now = this.clock.now();
    try {
      const reviewed = await this.unitOfWork.executeIdempotent({
        command: createPaymentReversalReviewCommand({
          adminUserId,
          reversalCaseId,
          request,
          now
        }),
        create: async (context) => {
          const paymentReversalCase = await reviewPaymentReversalCaseInContext({
            ...context,
            adminUserId,
            reversalCaseId,
            request,
            now: now.toISOString()
          });
          return { result: { reversalCaseId: paymentReversalCase.id }, value: paymentReversalCase };
        },
        replay: async ({ reversalCaseStore }, result) => {
          const replayReversalCaseId = result.reversalCaseId;
          if (typeof replayReversalCaseId !== "string") {
            throw new PaymentReversalReviewReplayMissingError();
          }
          const paymentReversalCase = await reversalCaseStore.findCaseById(replayReversalCaseId);
          if (!paymentReversalCase?.review) {
            throw new PaymentReversalReviewReplayMissingError();
          }
          return paymentReversalCase;
        }
      });
      return toPaymentReversalCaseResponse(reviewed.value);
    } catch (error) {
      if (error instanceof PaymentReversalCaseNotFoundError) {
        throw new NotFoundException(error.code);
      }
      if (error instanceof PaymentReversalReviewReplayMissingError) {
        throw new ConflictException(error.code);
      }
      if (
        error instanceof FinanceIdempotencyConflictError ||
        error instanceof FinanceIdempotencyInProgressError ||
        error instanceof FinanceIdempotencyFailedError
      ) {
        throw new ConflictException(error.code);
      }
      throw error;
    }
  }

  async listReconciliationExceptions(query: {
    readonly provider?: string;
    readonly environment?: string;
    readonly evidence?: string;
  }): Promise<AdminReconciliationExceptionQueueResponse> {
    const provider = parseOptionalQuery(financePaymentProviderSchema, query.provider);
    const environment = parseOptionalQuery(paymentProviderEnvironmentSchema, query.environment);
    const evidence = parseOptionalQuery(
      adminReconciliationExceptionEvidenceFilterSchema,
      query.evidence
    );
    const exceptions = await this.unitOfWork.execute(({ reconciliationStore }) =>
      reconciliationStore.listOpenExceptions({
        ...(provider ? { provider } : {}),
        ...(environment ? { environment } : {}),
        evidence: evidence ?? "all",
        limit: 50
      })
    );
    return adminReconciliationExceptionQueueResponseSchema.parse({
      summary: createReconciliationExceptionQueueSummary(exceptions),
      exceptions: exceptions.map(toReconciliationRecordResponse)
    });
  }

  async resolveReconciliationException(
    adminUserId: string,
    reconciliationRecordId: string,
    body: unknown
  ): Promise<ReconciliationRecordResponse> {
    const request = parseBody(resolveReconciliationExceptionRequestSchema, body);
    const now = this.clock.now();
    try {
      const record = await this.unitOfWork.execute(async ({ reconciliationStore, auditSink }) => {
        const resolved = await resolveProviderReconciliationException({
          store: reconciliationStore,
          reconciliationRecordId,
          resolution: request.resolution,
          adminNote: request.adminNote,
          resolvedAt: now
        });
        await auditSink.record({
          actorUserId: adminUserId,
          action: "reconciliation_exception.resolved",
          targetId: resolved.id,
          occurredAt: now.toISOString(),
          metadata: {
            resolution: request.resolution,
            adminNote: request.adminNote,
            previousStatus: "exception",
            status: resolved.status
          }
        });
        return resolved;
      });
      return toReconciliationRecordResponse(record);
    } catch (error) {
      if (error instanceof ReconciliationRecordNotFoundError) {
        throw new NotFoundException(error.code);
      }
      throw error;
    }
  }

  async updatePayoutRequestStatus(
    adminUserId: string,
    payoutRequestId: string,
    body: unknown
  ): Promise<PayoutRequestResponse> {
    const update = parseBody(adminPayoutStatusUpdateSchema, body);
    const now = this.clock.now();
    const nowIso = now.toISOString();
    try {
      const request = isTerminalPayoutStatus(update.status)
        ? (
            await this.unitOfWork.executeIdempotent({
              command: createTerminalPayoutStatusCommand({
                adminUserId,
                payoutRequestId,
                update,
                now
              }),
              create: async (context) => {
                const updated = await updatePayoutStatusInContext({
                  ...context,
                  adminUserId,
                  payoutRequestId,
                  update,
                  now: nowIso
                });
                return { result: { payoutRequestId: updated.id }, value: updated };
              },
              replay: async ({ payoutStore }, result) => {
                const replayPayoutRequestId = result.payoutRequestId;
                if (typeof replayPayoutRequestId !== "string") return null;
                return payoutStore.findRequestById(replayPayoutRequestId);
              }
            })
          ).value
        : await this.unitOfWork.execute((context) =>
            updatePayoutStatusInContext({
              ...context,
              adminUserId,
              payoutRequestId,
              update,
              now: nowIso
            })
          );
      return toPayoutRequestResponse(request);
    } catch (error) {
      if (error instanceof PayoutRequestNotFoundError) {
        throw new NotFoundException(error.code);
      }
      if (error instanceof PayoutStatusTransitionError) {
        throw new ConflictException(error.code);
      }
      if (error instanceof PayoutStatusEvidenceError) {
        throw new BadRequestException(error.code);
      }
      if (
        error instanceof FinanceIdempotencyConflictError ||
        error instanceof FinanceIdempotencyInProgressError ||
        error instanceof FinanceIdempotencyFailedError
      ) {
        throw new ConflictException(error.code);
      }
      throw error;
    }
  }
}

function parseReversalCaseTypes(
  type: string | undefined
): readonly AdminPaymentReversalCaseType[] | undefined {
  if (!type || type === "all") return undefined;
  if (type === "refund" || type === "chargeback") return [type];
  throw new BadRequestException("Invalid payment reversal case type");
}

function parsePayoutQueueStatusFilter(status: string | undefined): AdminPayoutQueueStatusFilter {
  return parseOptionalQuery(adminPayoutQueueStatusFilterSchema, status) ?? "open";
}

function parseOptionalQuery<T>(
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
  value: string | undefined
): T | undefined {
  if (!value) return undefined;
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException("Invalid admin finance query");
  }
  return parsed.data;
}

function payoutStatusesForFilter(
  filter: AdminPayoutQueueStatusFilter
): readonly PayoutRequestStatus[] | undefined {
  switch (filter) {
    case "open":
      return [
        "requested",
        "under_review",
        "approved",
        "processing_manual",
        "processing_provider",
        "failed"
      ];
    case "ready":
      return ["requested", "under_review", "approved"];
    case "processing":
      return ["processing_manual", "processing_provider"];
    case "failed":
      return ["failed"];
    case "terminal":
      return ["paid", "failed", "rejected", "cancelled"];
    case "all":
      return undefined;
  }
}

async function updatePayoutStatusInContext(
  input: AdminFinancePolicyUnitOfWorkContext & {
    readonly adminUserId: string;
    readonly payoutRequestId: string;
    readonly update: AdminPayoutStatusUpdate;
    readonly now: string;
  }
): Promise<PayoutRequestRecord> {
  const updated = await approvePayoutStatusUpdate({
    store: {
      ...input.payoutStore,
      ...input.ledgerStore
    },
    payoutRequestId: input.payoutRequestId,
    adminUserId: input.adminUserId,
    update: toDomainPayoutStatusUpdate(input.update),
    now: input.now
  });
  await input.auditSink.record({
    actorUserId: input.adminUserId,
    action: "payout_request.status_updated",
    targetId: updated.id,
    occurredAt: input.now,
    metadata: {
      status: updated.status,
      amountMinor: updated.amount.amountMinor,
      currency: updated.amount.currency,
      method: updated.method,
      externalReference: updated.externalReference,
      providerPayoutId: updated.providerPayoutId
    }
  });
  return updated;
}

async function reviewPaymentReversalCaseInContext(
  input: AdminFinancePolicyUnitOfWorkContext & {
    readonly adminUserId: string;
    readonly reversalCaseId: string;
    readonly request: AdminPaymentReversalCaseReviewRequest;
    readonly now: string;
  }
): Promise<AdminPaymentReversalCaseRecord> {
  const reviewed = await input.reversalCaseStore.recordReview({
    caseId: input.reversalCaseId,
    resolution: input.request.resolution,
    adminUserId: input.adminUserId,
    adminNote: input.request.adminNote,
    reviewedAt: input.now
  });
  if (!reviewed) throw new PaymentReversalCaseNotFoundError();
  await input.auditSink.record({
    actorUserId: input.adminUserId,
    action: "payment_reversal_case.reviewed",
    targetId: reviewed.id,
    occurredAt: input.now,
    metadata: {
      resolution: input.request.resolution,
      adminNote: input.request.adminNote,
      type: reviewed.type,
      provider: reviewed.provider,
      environment: reviewed.environment,
      providerWebhookId: reviewed.providerWebhookId,
      providerPaymentId: reviewed.providerPaymentId,
      providerRefundId: reviewed.providerRefundId,
      orderId: reviewed.orderId,
      ledgerTransactionId: reviewed.ledgerTransactionId,
      negativeBalanceAmountMinor: reviewed.walletBalance?.negativeBalance.amountMinor ?? 0
    }
  });
  return reviewed;
}

function parseBody<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch {
    throw new BadRequestException("Invalid finance policy request");
  }
}

function toDomainPayoutStatusUpdate(update: AdminPayoutStatusUpdate) {
  return update;
}

function createReconciliationExceptionQueueSummary(
  exceptions: readonly ReconciliationRecord[]
): AdminReconciliationExceptionQueueResponse["summary"] {
  return {
    openCount: exceptions.length,
    oldestOpenAt: exceptions[0]?.checkedAt ?? null
  };
}

function toReconciliationRecordResponse(
  record: ReconciliationRecord
): ReconciliationRecordResponse {
  return reconciliationRecordResponseSchema.parse(record);
}

function createTerminalPayoutStatusCommand(input: {
  readonly adminUserId: string;
  readonly payoutRequestId: string;
  readonly update: AdminPayoutStatusUpdate;
  readonly now: Date;
}): FinanceIdempotentCommand {
  return {
    scope: "admin.finance.payout-status.terminal",
    idempotencyKey: `${input.payoutRequestId}:terminal`,
    actorUserId: input.adminUserId,
    requestHash: `sha256:${createHash("sha256")
      .update(stableStringify({ payoutRequestId: input.payoutRequestId, update: input.update }))
      .digest("hex")}`,
    now: input.now.toISOString(),
    expiresAt: new Date(input.now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()
  };
}

function createPaymentReversalReviewCommand(input: {
  readonly adminUserId: string;
  readonly reversalCaseId: string;
  readonly request: AdminPaymentReversalCaseReviewRequest;
  readonly now: Date;
}): FinanceIdempotentCommand {
  return {
    scope: "admin.finance.payment-reversal-review",
    idempotencyKey: `${input.reversalCaseId}:review`,
    actorUserId: input.adminUserId,
    requestHash: `sha256:${createHash("sha256")
      .update(
        stableStringify({
          reversalCaseId: input.reversalCaseId,
          request: input.request
        })
      )
      .digest("hex")}`,
    now: input.now.toISOString(),
    expiresAt: new Date(input.now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()
  };
}

class PaymentReversalCaseNotFoundError extends Error {
  readonly code = "payment_reversal_case_not_found";

  constructor() {
    super("Payment reversal case was not found");
    this.name = "PaymentReversalCaseNotFoundError";
  }
}

class PaymentReversalReviewReplayMissingError extends Error {
  readonly code = "payment_reversal_review_replay_missing";

  constructor() {
    super("Completed payment reversal review command is missing durable review evidence");
    this.name = "PaymentReversalReviewReplayMissingError";
  }
}

function isTerminalPayoutStatus(status: AdminPayoutStatusUpdate["status"]): boolean {
  return (
    status === "paid" || status === "failed" || status === "rejected" || status === "cancelled"
  );
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

function toPaymentReversalCaseResponse(
  paymentReversalCase: AdminPaymentReversalCaseRecord
): AdminPaymentReversalCase {
  return paymentReversalCase;
}

function createPaymentReversalQueueSummary(
  cases: readonly AdminPaymentReversalCase[]
): AdminPaymentReversalQueueResponse["summary"] {
  const negativeBalanceByAstrologer = new Map<string, number>();
  for (const paymentReversalCase of cases) {
    const negativeBalanceMinor =
      paymentReversalCase.walletBalance?.negativeBalance.amountMinor ?? 0;
    const current = negativeBalanceByAstrologer.get(paymentReversalCase.astrologerUserId) ?? 0;
    if (negativeBalanceMinor > current) {
      negativeBalanceByAstrologer.set(paymentReversalCase.astrologerUserId, negativeBalanceMinor);
    }
  }
  return {
    refundCount: cases.filter((paymentReversalCase) => paymentReversalCase.type === "refund")
      .length,
    chargebackCount: cases.filter(
      (paymentReversalCase) => paymentReversalCase.type === "chargeback"
    ).length,
    criticalCount: cases.filter(
      (paymentReversalCase) => paymentReversalCase.severity === "critical"
    ).length,
    totalAmount: {
      amountMinor: cases.reduce(
        (sum, paymentReversalCase) => sum + paymentReversalCase.amount.amountMinor,
        0
      ),
      currency: "RUB" as const
    },
    negativeBalanceAmount: {
      amountMinor: [...negativeBalanceByAstrologer.values()].reduce(
        (sum, amountMinor) => sum + amountMinor,
        0
      ),
      currency: "RUB" as const
    }
  };
}

function createPayoutQueueSummary(requests: readonly PayoutRequestRecord[]) {
  const readyStatuses = new Set(["requested", "under_review", "approved"]);
  const processingStatuses = new Set(["processing_manual", "processing_provider"]);
  return {
    requestedCount: requests.filter((request) => request.status === "requested").length,
    underReviewCount: requests.filter((request) => request.status === "under_review").length,
    processingCount: requests.filter((request) => processingStatuses.has(request.status)).length,
    readyToPayAmount: {
      amountMinor: sumByStatus(requests, readyStatuses),
      currency: "RUB" as const
    },
    processingAmount: {
      amountMinor: sumByStatus(requests, processingStatuses),
      currency: "RUB" as const
    }
  };
}

function sumByStatus(
  requests: readonly PayoutRequestRecord[],
  statuses: ReadonlySet<string>
): number {
  return requests.reduce(
    (sum, request) => sum + (statuses.has(request.status) ? request.amount.amountMinor : 0),
    0
  );
}
