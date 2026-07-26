import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  adminPayoutQueueResponseSchema,
  adminPayoutStatusUpdateSchema,
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
  type PayoutRequestResponse
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
  PayoutRequestNotFoundError,
  type PayoutRequestRecord,
  PayoutStatusEvidenceError,
  PayoutStatusTransitionError,
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

  async listPayoutRequests(): Promise<AdminPayoutQueueResponse> {
    const requests = await this.unitOfWork.execute(({ payoutStore }) =>
      payoutStore.listRequests({
        statuses: [
          "requested",
          "under_review",
          "approved",
          "processing_manual",
          "processing_provider",
          "failed"
        ],
        limit: 50
      })
    );
    return adminPayoutQueueResponseSchema.parse({
      summary: createPayoutQueueSummary(requests),
      requests: requests.map(toPayoutRequestResponse)
    });
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
