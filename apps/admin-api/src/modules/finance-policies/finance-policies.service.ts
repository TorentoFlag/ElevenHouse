import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import {
  adminPaymentReversalCaseReviewRequestSchema,
  adminPaymentReversalQueueResponseSchema,
  adminPayoutQueueStatusFilterSchema,
  adminReconciliationExceptionQueueResponseSchema,
  adminReconciliationExceptionEvidenceFilterSchema,
  adminPayoutRequestResponseSchema,
  adminPayoutQueueResponseSchema,
  adminPayoutStatusUpdateSchema,
  adminOnlinePayoutApprovalRequestSchema,
  adminOnlinePayoutManualExecutionRequestSchema,
  adminOnlinePayoutPaidAuthorizationRequestSchema,
  adminOnlinePayoutPaidRequestSchema,
  type BeginFinanceAuthorizationResponse,
  type FinanceAuthorizationCanonicalPayload,
  financePaymentProviderSchema,
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
  type AdminPayoutRequestResponse,
  type AdminPayoutStatusUpdate,
  type AdminOnlinePayoutPaidAuthorizationRequest,
  type AdminOnlinePayoutPaidRequest,
  type AstrologerRiskProfileResponse,
  type FinancePoliciesResponse,
  type FinancePolicyResponse,
  type OrderResponse,
  type PayoutRequestResponse,
  type ReconciliationRecordResponse
} from "@elevenhouse/contracts";
import {
  applyEffectiveFinancePolicyToOrder,
  assignAstrologerRiskProfile,
  ensureDefaultFinancePolicy,
  FinanceIdempotencyConflictError,
  FinanceIdempotencyFailedError,
  FinanceIdempotencyInProgressError,
  FinanceAuthorizationRejectedError,
  type FinanceIdempotentCommand,
  FinancePolicyEffectivePolicyUnavailableError,
  FinancePolicyOrderNotApplicableError,
  FinancePolicyOrderNotFoundError,
  type AdminPaymentReversalCaseRecord,
  ReconciliationRecordNotFoundError,
  resolveProviderReconciliationException,
  type ReconciliationRecord,
  updateFinancePolicy
} from "@elevenhouse/domain";
import { resolveFinanceOperationEnvelope } from "@elevenhouse/domain/finance-core";
import type {
  OnlineWalletPayoutExecutionPreparation,
  OnlineWalletPayoutApprovalPreparation,
  OnlineWalletPayoutRequestProjection,
  OnlineWalletPayoutTransitionAuthority
} from "@elevenhouse/domain/finance-core";
import { SystemClock } from "../../common/system-clock.js";
import type { AdminApiRuntimeConfig } from "../../config/runtime-config.js";
import { AdminFinanceAuthorizationsService } from "../finance-authorizations/finance-authorizations.service";
import type { AdminAuthenticatedAccount } from "../identity/session/identity-current-session.service";
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
    @Inject(AdminFinanceAuthorizationsService)
    private readonly authorizations: AdminFinanceAuthorizationsService,
    @Inject(ConfigService)
    private readonly configService: ConfigService,
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
      return orderResponseSchema.parse(toAdminOrderResponse(result));
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
    const requests = await this.unitOfWork.execute(({ onlineWalletPayoutRequestReader }) =>
      onlineWalletPayoutRequestReader.listPayoutRequests({
        statuses: payoutStatusesForFilter(statusFilter),
        limit: 50
      })
    );
    return adminPayoutQueueResponseSchema.parse({
      summary: createOnlinePayoutQueueSummary(requests),
      requests: requests.map(toAdminOnlinePayoutRequestResponse)
    });
  }

  async beginOnlinePayoutApprovalAuthorization(
    account: AdminAuthenticatedAccount,
    payoutRequestId: string
  ): Promise<BeginFinanceAuthorizationResponse> {
    const prepared = await this.readOnlinePayoutApprovalPreparation(payoutRequestId);
    return this.authorizations.beginResolved(account, {
      actionKind: "payout_approve",
      aggregateId: prepared.payout.authorizationAggregateId,
      expectedVersion: numberFromRevision(prepared.payout.payoutVersion),
      payload: payoutApprovalAuthorizationPayload(prepared)
    });
  }

  async approveOnlinePayout(
    account: AdminAuthenticatedAccount,
    payoutRequestId: string,
    body: unknown
  ): Promise<PayoutRequestResponse> {
    const request = parseBody(adminOnlinePayoutApprovalRequestSchema, body);
    const prepared = await this.readOnlinePayoutApprovalPreparation(payoutRequestId);
    const now = this.clock.now().toISOString();
    try {
      const updated = await this.unitOfWork.executeAuthorized({
        authorization: {
          actorUserId: account.id,
          sessionId: account.sessionId,
          actionKind: "payout_approve",
          aggregateId: prepared.payout.authorizationAggregateId,
          expectedVersion: numberFromRevision(prepared.payout.payoutVersion),
          payload: payoutApprovalAuthorizationPayload(prepared),
          authorizationId: request.authorizationId,
          occurredAt: now
        },
        operation: async (context, proof) => {
          const current = await readOnlinePayoutApprovalPreparation(context, this.bankCashPoolId(), payoutRequestId);
          assertSameApprovalPreparation(prepared, current);
          await context.onlineWalletPayoutReview.approveOnlineWalletPayout({
            payoutRequestId: current.payout.payoutRequestId,
            expectedPayoutVersion: current.payout.payoutVersion,
            expectedBeneficiaryFingerprint: current.payout.beneficiaryFingerprint,
            actorUserId: account.id,
            authority: {
              authorityId: proof.authorizationId,
              authorityVersion: String(proof.expectedVersion),
              authorityDigest: proof.payloadHash
            },
            bankCashPoolId: current.snapshot.bankCashPoolId,
            currency: current.snapshot.currency,
            expectedBankLiquidityRevision: current.snapshot.bankLiquidityRevision,
            adoptedLiquiditySnapshot: current.snapshot.adoptedSnapshot,
            occurredAt: now,
            operationEnvelope: current.operationEnvelope
          });
          const result = await context.onlineWalletPayoutRequestReader.findPayoutRequestById(
            payoutRequestId
          );
          if (!result) throw new NotFoundException("online_payout_not_found");
          return result;
        }
      });
      return toOnlinePayoutRequestResponse(updated);
    } catch (error) {
      throwOnlinePayoutExecutionError(error);
    }
  }

  async beginOnlinePayoutManualExecutionAuthorization(
    account: AdminAuthenticatedAccount,
    payoutRequestId: string
  ): Promise<BeginFinanceAuthorizationResponse> {
    const preparation = await this.readOnlinePayoutExecutionPreparation(payoutRequestId, "approved");
    return this.authorizations.beginResolved(account, {
      actionKind: "payout_start_processing",
      aggregateId: preparation.authorizationAggregateId,
      expectedVersion: numberFromRevision(preparation.payoutVersion),
      payload: manualExecutionAuthorizationPayload(preparation)
    });
  }

  async startOnlinePayoutManualExecution(
    account: AdminAuthenticatedAccount,
    payoutRequestId: string,
    body: unknown
  ): Promise<PayoutRequestResponse> {
    const request = parseBody(adminOnlinePayoutManualExecutionRequestSchema, body);
    const preparation = await this.readOnlinePayoutExecutionPreparation(payoutRequestId, "approved");
    const now = this.clock.now().toISOString();
    try {
      const updated = await this.unitOfWork.executeAuthorized({
        authorization: {
          actorUserId: account.id,
          sessionId: account.sessionId,
          actionKind: "payout_start_processing",
          aggregateId: preparation.authorizationAggregateId,
          expectedVersion: numberFromRevision(preparation.payoutVersion),
          payload: manualExecutionAuthorizationPayload(preparation),
          authorizationId: request.authorizationId,
          occurredAt: now
        },
        operation: async (context, proof) => {
          const current = await requireOnlinePayoutExecutionPreparation(
            context,
            payoutRequestId,
            "approved"
          );
          assertSamePreparation(preparation, current);
          await context.onlineWalletPayoutExecution.startOnlineWalletPayoutManualExecution({
            payoutRequestId: current.payoutRequestId,
            expectedPayoutVersion: current.payoutVersion,
            expectedBankExposureVersion: current.bankExposureVersion,
            approval: current.approval,
            executorActorUserId: account.id,
            authority: {
              authorityId: proof.authorizationId,
              authorityVersion: String(proof.expectedVersion),
              authorityDigest: proof.payloadHash
            },
            occurredAt: now
          });
          const result = await context.onlineWalletPayoutRequestReader.findPayoutRequestById(
            payoutRequestId
          );
          if (!result) throw new NotFoundException("online_payout_not_found");
          return result;
        }
      });
      return toOnlinePayoutRequestResponse(updated);
    } catch (error) {
      throwOnlinePayoutExecutionError(error);
    }
  }

  async beginOnlinePayoutPaidAuthorization(
    account: AdminAuthenticatedAccount,
    payoutRequestId: string,
    body: unknown
  ): Promise<BeginFinanceAuthorizationResponse> {
    const request = parseBody(adminOnlinePayoutPaidAuthorizationRequestSchema, body);
    const prepared = await this.readOnlinePayoutPaidAuthorizationPreparation(payoutRequestId, request);
    return this.authorizations.beginResolved(account, {
      actionKind: "payout_confirm_paid",
      aggregateId: prepared.preparation.authorizationAggregateId,
      expectedVersion: numberFromRevision(prepared.preparation.payoutVersion),
      payload: paidAuthorizationPayload(prepared.preparation, request, prepared.evidence.sha256Digest)
    });
  }

  async confirmOnlinePayoutPaid(
    account: AdminAuthenticatedAccount,
    payoutRequestId: string,
    body: unknown
  ): Promise<PayoutRequestResponse> {
    const request = parseBody(adminOnlinePayoutPaidRequestSchema, body);
    const prepared = await this.readOnlinePayoutPaidAuthorizationPreparation(payoutRequestId, request);
    const now = this.clock.now().toISOString();
    try {
      const updated = await this.unitOfWork.executeAuthorized({
        authorization: {
          actorUserId: account.id,
          sessionId: account.sessionId,
          actionKind: "payout_confirm_paid",
          aggregateId: prepared.preparation.authorizationAggregateId,
          expectedVersion: numberFromRevision(prepared.preparation.payoutVersion),
          payload: paidAuthorizationPayload(
            prepared.preparation,
            request,
            prepared.evidence.sha256Digest
          ),
          authorizationId: request.authorizationId,
          occurredAt: now
        },
        operation: async (context, proof) => {
          const current = await requireOnlinePayoutExecutionPreparation(
            context,
            payoutRequestId,
            "processing_manual"
          );
          const evidence = await context.onlineWalletPayoutExecutionPreparationReader.findBankTransferEvidence({
            artifactId: request.evidenceArtifactId,
            bankCashPoolId: current.bankCashPoolId,
            currency: current.currency
          });
          if (!evidence) throw new ConflictException("online_payout_paid_evidence_invalid");
          assertSamePreparation(prepared.preparation, current);
          if (evidence.sha256Digest !== prepared.evidence.sha256Digest) {
            throw new ConflictException("online_payout_paid_evidence_changed");
          }
          await context.onlineWalletPayoutExecution.confirmOnlineWalletPayoutPaid({
            payoutRequestId: current.payoutRequestId,
            expectedPayoutVersion: current.payoutVersion,
            expectedWalletRevision: current.walletRevision,
            expectedBankExposureVersion: current.bankExposureVersion,
            approval: current.approval,
            bankReference: request.bankReference,
            transferredAt: request.transferredAt,
            evidenceArtifactId: evidence.artifactId,
            evidenceArtifactDigest: evidence.sha256Digest,
            confirmerActorUserId: account.id,
            authority: {
              authorityId: proof.authorizationId,
              authorityVersion: String(proof.expectedVersion),
              authorityDigest: proof.payloadHash
            },
            occurredAt: now
          });
          const result = await context.onlineWalletPayoutRequestReader.findPayoutRequestById(
            payoutRequestId
          );
          if (!result) throw new NotFoundException("online_payout_not_found");
          return result;
        }
      });
      return toOnlinePayoutRequestResponse(updated);
    } catch (error) {
      throwOnlinePayoutExecutionError(error);
    }
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
    readonly evidence?: string;
  }): Promise<AdminReconciliationExceptionQueueResponse> {
    const provider = parseOptionalQuery(financePaymentProviderSchema, query.provider);
    const evidence = parseOptionalQuery(
      adminReconciliationExceptionEvidenceFilterSchema,
      query.evidence
    );
    const exceptions = await this.unitOfWork.execute(({ reconciliationStore }) =>
      reconciliationStore.listOpenExceptions({
        ...(provider ? { provider } : {}),
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
    adminAccount: AdminAuthenticatedAccount,
    payoutRequestId: string,
    body: unknown
  ): Promise<PayoutRequestResponse> {
    const update = parseBody(adminPayoutStatusUpdateSchema, body);
    const nowIso = this.clock.now().toISOString();
    try {
      return await this.updateOnlineWalletPayoutStatus({
        adminUserId: adminAccount.id,
        adminSessionId: adminAccount.sessionId,
        payoutRequestId,
        update,
        now: nowIso
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error.code === "online_wallet_payout_review_persistence_error" ||
          error.code === "online_wallet_payout_release_persistence_error")
      ) {
        throw new ConflictException(String(error.code));
      }
      if (error instanceof FinanceAuthorizationRejectedError) {
        throw new ConflictException("finance_authorization_rejected");
      }
      throw error;
    }
  }

  private async updateOnlineWalletPayoutStatus(input: {
    readonly adminUserId: string;
    readonly adminSessionId: string;
    readonly payoutRequestId: string;
    readonly update: AdminPayoutStatusUpdate;
    readonly now: string;
  }): Promise<PayoutRequestResponse> {
    const requestedStatus = input.update.status;
    if (
      requestedStatus === "approved" ||
      requestedStatus === "processing_manual" ||
      requestedStatus === "paid"
    ) {
      throw new ConflictException("online_payout_requires_v2_bank_evidence_command");
    }
    const transition = async (
      context: AdminFinancePolicyUnitOfWorkContext,
      authority: OnlineWalletPayoutTransitionAuthority
    ) => {
      if (requestedStatus === "under_review") {
        await context.onlineWalletPayoutReview.transitionOnlineWalletPayout({
          payoutRequestId: input.payoutRequestId,
          expectedPayoutVersion: String(input.update.expectedVersion),
          nextStatus: requestedStatus,
          actorUserId: input.adminUserId,
          adminNote: input.update.adminNote ?? null,
          authority,
          occurredAt: input.now
        });
      } else {
        await context.onlineWalletPayoutRelease.releaseOnlineWalletPayout({
          payoutRequestId: input.payoutRequestId,
          expectedPayoutVersion: String(input.update.expectedVersion),
          nextStatus: requestedStatus,
          failureReason:
            requestedStatus === "rejected" || requestedStatus === "failed"
              ? input.update.failureReason
              : null,
          adminNote: input.update.adminNote ?? null,
          actorUserId: input.adminUserId,
          authority,
          occurredAt: input.now
        });
      }
      const updated = await context.onlineWalletPayoutRequestReader.findPayoutRequestById(
        input.payoutRequestId
      );
      if (!updated) throw new ConflictException("online_payout_projection_missing");
      await context.auditSink.record({
        actorUserId: input.adminUserId,
        action: "payout_request.status_updated",
        targetId: updated.payoutRequestId,
        occurredAt: input.now,
        metadata: {
          ledgerAuthority: "finance_online_wallet_v2",
          status: updated.status,
          amountMinor: updated.amountMinor,
          currency: updated.currency,
          version: updated.version
        }
      });
      return updated;
    };
    const defaultAuthority = () => onlinePayoutTransitionAuthority({
        adminUserId: input.adminUserId,
        payoutRequestId: input.payoutRequestId,
        update: input.update
      });
    const projection: OnlineWalletPayoutRequestProjection = await this.unitOfWork.execute((context) =>
      transition(context, defaultAuthority())
    );
    return toOnlinePayoutRequestResponse(projection);
  }

  private async readOnlinePayoutExecutionPreparation(
    payoutRequestId: string,
    expectedStatus: OnlineWalletPayoutExecutionPreparation["payoutStatus"]
  ): Promise<OnlineWalletPayoutExecutionPreparation> {
    return this.unitOfWork.execute((context) =>
      requireOnlinePayoutExecutionPreparation(context, payoutRequestId, expectedStatus)
    );
  }

  private async readOnlinePayoutApprovalPreparation(payoutRequestId: string) {
    return this.unitOfWork.execute((context) =>
      readOnlinePayoutApprovalPreparation(context, this.bankCashPoolId(), payoutRequestId)
    );
  }

  private bankCashPoolId(): string {
    const configuration =
      this.configService.getOrThrow<AdminApiRuntimeConfig>("adminApi").financePayoutEvidence;
    if (!configuration) {
      throw new ConflictException("online_payout_bank_cash_pool_not_configured");
    }
    return configuration.bankCashPoolId;
  }

  private async readOnlinePayoutPaidAuthorizationPreparation(
    payoutRequestId: string,
    request: AdminOnlinePayoutPaidAuthorizationRequest | AdminOnlinePayoutPaidRequest
  ) {
    return this.unitOfWork.execute(async (context) => {
      const preparation = await requireOnlinePayoutExecutionPreparation(
        context,
        payoutRequestId,
        "processing_manual"
      );
      const evidence = await context.onlineWalletPayoutExecutionPreparationReader.findBankTransferEvidence({
        artifactId: request.evidenceArtifactId,
        bankCashPoolId: preparation.bankCashPoolId,
        currency: preparation.currency
      });
      if (!evidence) throw new ConflictException("online_payout_paid_evidence_invalid");
      return Object.freeze({ preparation, evidence });
    });
  }
}

async function requireOnlinePayoutExecutionPreparation(
  context: AdminFinancePolicyUnitOfWorkContext,
  payoutRequestId: string,
  expectedStatus: OnlineWalletPayoutExecutionPreparation["payoutStatus"]
): Promise<OnlineWalletPayoutExecutionPreparation> {
  const preparation =
    await context.onlineWalletPayoutExecutionPreparationReader.findPayoutExecutionPreparation({
      payoutRequestId
    });
  if (!preparation) throw new ConflictException("online_payout_execution_facts_unavailable");
  if (preparation.payoutStatus !== expectedStatus) {
    throw new ConflictException("online_payout_execution_state_conflict");
  }
  return preparation;
}

type OnlinePayoutApprovalPreparation = Readonly<{
  payout: OnlineWalletPayoutApprovalPreparation;
  snapshot: NonNullable<Awaited<
    ReturnType<
      AdminFinancePolicyUnitOfWorkContext["currentEligibleBankLiquiditySnapshotReader"]["findCurrentEligibleBankLiquiditySnapshot"]
    >
  >>;
  operationEnvelope: ReturnType<typeof resolveFinanceOperationEnvelope>;
}>;

async function readOnlinePayoutApprovalPreparation(
  context: AdminFinancePolicyUnitOfWorkContext,
  bankCashPoolId: string,
  payoutRequestId: string
): Promise<OnlinePayoutApprovalPreparation> {
  const payout = await context.onlineWalletPayoutApprovalPreparationReader.findPayoutApprovalPreparation({
    payoutRequestId
  });
  if (!payout) throw new ConflictException("online_payout_approval_facts_unavailable");
  const snapshot =
    await context.currentEligibleBankLiquiditySnapshotReader.findCurrentEligibleBankLiquiditySnapshot({
      bankCashPoolId,
      currency: payout.currency
    });
  if (!snapshot) throw new ConflictException("online_payout_eligible_liquidity_snapshot_unavailable");
  const policy = await context.financeOperationResourcePolicyReader.findPublishedForOperation({
    operationKind: "payout_approve"
  });
  if (!policy) throw new ConflictException("online_payout_approval_operation_policy_unavailable");
  return Object.freeze({
    payout,
    snapshot,
    operationEnvelope: resolveFinanceOperationEnvelope({ policy, operationKind: "payout_approve" })
  });
}

function payoutApprovalAuthorizationPayload(
  preparation: OnlinePayoutApprovalPreparation
): FinanceAuthorizationCanonicalPayload {
  return {
    kind: "online_wallet_payout_approval_v2",
    payoutRequestId: preparation.payout.payoutRequestId,
    payoutVersion: preparation.payout.payoutVersion,
    amountMinor: preparation.payout.amountMinor,
    currency: preparation.payout.currency,
    beneficiaryFingerprint: preparation.payout.beneficiaryFingerprint,
    bankCashPoolId: preparation.snapshot.bankCashPoolId,
    bankLiquidityRevision: preparation.snapshot.bankLiquidityRevision,
    snapshotAdoptionReceiptId: preparation.snapshot.adoptedSnapshot.receiptId,
    snapshotAdoptionReceiptDigest: preparation.snapshot.adoptedSnapshot.canonicalDigest,
    operationPolicyId: preparation.operationEnvelope.policyId,
    operationPolicyVersion: preparation.operationEnvelope.policyVersion,
    operationPolicyDigest: preparation.operationEnvelope.policyDigest
  };
}

function assertSameApprovalPreparation(
  expected: OnlinePayoutApprovalPreparation,
  actual: OnlinePayoutApprovalPreparation
): void {
  if (
    expected.payout.payoutRequestId !== actual.payout.payoutRequestId ||
    expected.payout.authorizationAggregateId !== actual.payout.authorizationAggregateId ||
    expected.payout.payoutVersion !== actual.payout.payoutVersion ||
    expected.payout.beneficiaryFingerprint !== actual.payout.beneficiaryFingerprint ||
    expected.snapshot.bankCashPoolId !== actual.snapshot.bankCashPoolId ||
    expected.snapshot.bankLiquidityRevision !== actual.snapshot.bankLiquidityRevision ||
    expected.snapshot.adoptedSnapshot.receiptId !== actual.snapshot.adoptedSnapshot.receiptId ||
    expected.snapshot.adoptedSnapshot.canonicalDigest !== actual.snapshot.adoptedSnapshot.canonicalDigest ||
    expected.operationEnvelope.policyId !== actual.operationEnvelope.policyId ||
    expected.operationEnvelope.policyVersion !== actual.operationEnvelope.policyVersion ||
    expected.operationEnvelope.policyDigest !== actual.operationEnvelope.policyDigest
  ) {
    throw new ConflictException("online_payout_approval_facts_changed");
  }
}

function manualExecutionAuthorizationPayload(
  preparation: OnlineWalletPayoutExecutionPreparation
): FinanceAuthorizationCanonicalPayload {
  return {
    kind: "online_wallet_payout_manual_execution_v2",
    payoutRequestId: preparation.payoutRequestId,
    payoutVersion: preparation.payoutVersion,
    amountMinor: preparation.amountMinor,
    currency: preparation.currency,
    approvalReceiptId: preparation.approval.receiptId,
    approvalDigest: preparation.approval.canonicalDigest,
    bankExposureId: preparation.bankExposureId,
    bankExposureVersion: preparation.bankExposureVersion,
    bankCashPoolId: preparation.bankCashPoolId
  };
}

function paidAuthorizationPayload(
  preparation: OnlineWalletPayoutExecutionPreparation,
  request: AdminOnlinePayoutPaidAuthorizationRequest | AdminOnlinePayoutPaidRequest,
  evidenceArtifactDigest: string
): FinanceAuthorizationCanonicalPayload {
  return {
    kind: "online_wallet_payout_paid_v2",
    payoutRequestId: preparation.payoutRequestId,
    payoutVersion: preparation.payoutVersion,
    amountMinor: preparation.amountMinor,
    currency: preparation.currency,
    approvalReceiptId: preparation.approval.receiptId,
    approvalDigest: preparation.approval.canonicalDigest,
    bankExposureId: preparation.bankExposureId,
    bankExposureVersion: preparation.bankExposureVersion,
    bankCashPoolId: preparation.bankCashPoolId,
    bankReference: request.bankReference,
    transferredAt: request.transferredAt,
    evidenceArtifactId: request.evidenceArtifactId,
    evidenceArtifactDigest
  };
}

function assertSamePreparation(
  expected: OnlineWalletPayoutExecutionPreparation,
  actual: OnlineWalletPayoutExecutionPreparation
): void {
  if (
    expected.payoutRequestId !== actual.payoutRequestId ||
    expected.authorizationAggregateId !== actual.authorizationAggregateId ||
    expected.payoutVersion !== actual.payoutVersion ||
    expected.payoutStatus !== actual.payoutStatus ||
    expected.walletId !== actual.walletId ||
    expected.walletRevision !== actual.walletRevision ||
    expected.approval.receiptId !== actual.approval.receiptId ||
    expected.approval.canonicalDigest !== actual.approval.canonicalDigest ||
    expected.bankExposureId !== actual.bankExposureId ||
    expected.bankExposureVersion !== actual.bankExposureVersion ||
    expected.bankCashPoolId !== actual.bankCashPoolId
  ) {
    throw new ConflictException("online_payout_execution_facts_changed");
  }
}

function throwOnlinePayoutExecutionError(error: unknown): never {
  if (error instanceof FinanceAuthorizationRejectedError) {
    throw new ConflictException("finance_authorization_rejected");
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "online_wallet_payout_execution_persistence_error"
  ) {
    throw new ConflictException(String(error.code));
  }
  throw error;
}

function toAdminOrderResponse(order: Awaited<ReturnType<typeof applyEffectiveFinancePolicyToOrder>>["after"]) {
  const {
    tariffSeriesId: _tariffSeriesId,
    tariffVersion: _tariffVersion,
    tariffVersionDigest: _tariffVersionDigest,
    tariffCommissionBps: _tariffCommissionBps,
    ...response
  } = order;
  void _tariffSeriesId;
  void _tariffVersion;
  void _tariffVersionDigest;
  void _tariffCommissionBps;
  return response;
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
): readonly OnlineWalletPayoutRequestProjection["status"][] | undefined {
  switch (filter) {
    case "open":
      return [
        "requested",
        "under_review",
        "approved",
        "processing_manual",
        "failed"
      ];
    case "ready":
      return ["requested", "under_review", "approved"];
    case "processing":
      return ["processing_manual"];
    case "failed":
      return ["failed"];
    case "terminal":
      return ["paid", "failed", "rejected", "cancelled"];
    case "all":
      return undefined;
  }
}

function toOnlinePayoutRequestResponse(
  request: OnlineWalletPayoutRequestProjection
): PayoutRequestResponse {
  const status = request.status;
  const transitionOccurredAt = request.latestTransitionOccurredAt;
  return payoutRequestResponseSchema.parse({
    id: request.payoutRequestId,
    astrologerUserId: request.astrologerUserId,
    status,
    amount: { amountMinor: Number(request.amountMinor), currency: request.currency },
    method: "manual_bank_transfer",
    requestedAt: request.requestedAt,
    reviewedAt: status === "requested" ? null : transitionOccurredAt,
    completedAt:
      status === "cancelled" || status === "rejected" || status === "failed" || status === "paid"
        ? transitionOccurredAt
        : null,
    adminUserId: request.version === "1" ? null : request.latestTransitionActorUserId,
    adminNote: request.latestTransitionAdminNote,
    failureReason: request.latestTransitionFailureReason,
    externalReference: request.paidBankReference,
    transferredAt: request.paidTransferredAt,
    version: numberFromRevision(request.version)
  });
}

function toAdminOnlinePayoutRequestResponse(
  request: OnlineWalletPayoutRequestProjection
): AdminPayoutRequestResponse {
  return adminPayoutRequestResponseSchema.parse({
    ...toOnlinePayoutRequestResponse(request),
    blockedByChargeback: false
  });
}

function createOnlinePayoutQueueSummary(
  requests: readonly OnlineWalletPayoutRequestProjection[]
): AdminPayoutQueueResponse["summary"] {
  const responseRequests = requests.map(toOnlinePayoutRequestResponse);
  const readyStatuses = new Set(["requested", "under_review", "approved"]);
  const processingStatuses = new Set(["processing_manual"]);
  return {
    requestedCount: responseRequests.filter((request) => request.status === "requested").length,
    underReviewCount: responseRequests.filter((request) => request.status === "under_review").length,
    processingCount: responseRequests.filter((request) => processingStatuses.has(request.status)).length,
    chargebackBlockedCount: 0,
    readyToPayAmount: {
      amountMinor: sumByStatus(responseRequests, readyStatuses),
      currency: "RUB" as const
    },
    processingAmount: {
      amountMinor: sumByStatus(responseRequests, processingStatuses),
      currency: "RUB" as const
    },
    chargebackBlockedAmount: { amountMinor: 0, currency: "RUB" as const }
  };
}

function numberFromRevision(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new ConflictException("online_payout_revision_invalid");
  }
  return parsed;
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

function onlinePayoutTransitionAuthority(input: {
  readonly adminUserId: string;
  readonly payoutRequestId: string;
  readonly update: AdminPayoutStatusUpdate;
}) {
  const digest = `sha256:${createHash("sha256")
    .update(stableStringify(input))
    .digest("hex")}` as const;
  return Object.freeze({
    authorityId: `admin-online-payout:${input.payoutRequestId}:${input.update.status}:${input.update.expectedVersion}:${input.adminUserId}`,
    authorityVersion: "1",
    authorityDigest: digest
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

function sumByStatus<T extends Readonly<{ status: string; amount: Readonly<{ amountMinor: number }> }>>(
  requests: readonly T[],
  statuses: ReadonlySet<string>
): number {
  return requests.reduce(
    (sum, request) => sum + (statuses.has(request.status) ? request.amount.amountMinor : 0),
    0
  );
}
