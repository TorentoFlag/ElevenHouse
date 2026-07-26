import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
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
import type { AdminFinancePolicyUnitOfWork } from "./finance-policies.unit-of-work";

@Injectable()
export class FinancePoliciesService {
  constructor(
    @Inject(ADMIN_FINANCE_POLICY_UNIT_OF_WORK)
    private readonly unitOfWork: AdminFinancePolicyUnitOfWork,
    private readonly clock: SystemClock
  ) {}

  async listPolicies(): Promise<FinancePoliciesResponse> {
    const policies = await this.unitOfWork.execute(({ store }) =>
      Promise.all(riskTierValues.map((riskTier) => store.findActivePolicyByRiskTier(riskTier)))
    );
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
    try {
      const request = await this.unitOfWork.execute(async ({ payoutStore, ledgerStore, auditSink }) => {
        const updated = await approvePayoutStatusUpdate({
          store: {
            ...payoutStore,
            ...ledgerStore
          },
          payoutRequestId,
          adminUserId,
          update: toDomainPayoutStatusUpdate(update),
          now: now.toISOString()
        });
        await auditSink.record({
          actorUserId: adminUserId,
          action: "payout_request.status_updated",
          targetId: updated.id,
          occurredAt: now.toISOString(),
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
      });
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
      throw error;
    }
  }
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

function sumByStatus(requests: readonly PayoutRequestRecord[], statuses: ReadonlySet<string>): number {
  return requests.reduce(
    (sum, request) => sum + (statuses.has(request.status) ? request.amount.amountMinor : 0),
    0
  );
}
