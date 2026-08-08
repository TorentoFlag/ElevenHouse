import { createHash, randomBytes } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createDrizzleAuditLogStore } from "@elevenhouse/db/audit-log";
import {
  approveOnlineWalletRefundInTransaction,
  createDrizzleOnlineWalletRefundApprovalPreparationReader,
  createFinanceArtifactRegistry,
  transactDrizzleFinanceAuthorizationCommand,
  FinanceArtifactRegistryError
} from "@elevenhouse/db/finance";
import {
  canonicalizeFinanceCommandPayload,
  consumeFinanceAuthorizationGrant,
  FinanceAuthorizationRejectedError
} from "@elevenhouse/domain";
import {
  digestFinanceCanonicalValueV1,
  issueVerifiedOnlineWalletRefundApprovalAuthority,
  resolveFinanceOperationEnvelope,
  type FinanceOperationResourcePolicyReader,
  type FinancePrivateObjectStoragePort,
  type OnlineWalletRefundApprovalPreparation,
  type OnlineWalletRefundApprovalPreparationReader
} from "@elevenhouse/domain/finance-core";
import {
  adminOnlineWalletRefundApprovalRequestSchema,
  adminOnlineWalletRefundApprovalResponseSchema,
  adminOnlineWalletRefundAuthorizationRequestSchema,
  adminOnlineWalletRefundCandidateParamsSchema,
  type AdminOnlineWalletRefundApprovalResponse,
  type BeginFinanceAuthorizationResponse
} from "@elevenhouse/contracts";
import { FinancePrivateObjectStorageError } from "@elevenhouse/finance-infrastructure";

import type { AdminApiRuntimeConfig } from "../../config/runtime-config.js";
import { SystemClock } from "../../common/system-clock.js";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { AdminFinanceAuthorizationsService } from "../finance-authorizations/finance-authorizations.service";
import type { AdminAuthenticatedAccount } from "../identity/session/identity-current-session.service";
import { ADMIN_ONLINE_WALLET_REFUND_PRIVATE_STORAGE } from "./online-wallet-refunds.tokens";

const providerIdempotencyLifetimeMs = 72 * 60 * 60 * 1_000;

@Injectable()
export class AdminOnlineWalletRefundsService {
  constructor(
    @Inject(PostgresRuntimeService) private readonly postgresRuntime: PostgresRuntimeService,
    @Inject(AdminFinanceAuthorizationsService)
    private readonly authorizations: AdminFinanceAuthorizationsService,
    @Inject("ADMIN_ONLINE_WALLET_REFUND_PREPARATION_READER")
    private readonly preparations: OnlineWalletRefundApprovalPreparationReader,
    @Inject("ADMIN_ONLINE_WALLET_REFUND_POLICY_READER")
    private readonly policies: FinanceOperationResourcePolicyReader,
    @Inject(ADMIN_ONLINE_WALLET_REFUND_PRIVATE_STORAGE)
    private readonly privateStorage: FinancePrivateObjectStoragePort | null,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(SystemClock) private readonly clock: SystemClock
  ) {}

  async beginAuthorization(
    account: AdminAuthenticatedAccount,
    candidateId: string,
    body: unknown
  ): Promise<BeginFinanceAuthorizationResponse> {
    const { candidateId: parsedCandidateId } = parseCandidate(candidateId);
    const { refundAmountMinor } = parseBegin(body);
    const preparation = await this.requirePreparation(parsedCandidateId);
    assertRefundAmount(preparation, refundAmountMinor);
    return this.authorizations.beginResolved(account, {
      actionKind: "refund_execute",
      aggregateId: preparation.refundCandidateId,
      expectedVersion: preparation.refundCandidateVersion,
      payload: authorizationPayload(preparation, refundAmountMinor)
    });
  }

  async approve(
    account: AdminAuthenticatedAccount,
    candidateId: string,
    body: unknown
  ): Promise<AdminOnlineWalletRefundApprovalResponse> {
    const { candidateId: parsedCandidateId } = parseCandidate(candidateId);
    const request = parseApproval(body);
    const preparation = await this.requirePreparation(parsedCandidateId);
    assertRefundAmount(preparation, request.refundAmountMinor);
    const policy = await this.policies.findPublishedForOperation({ operationKind: "refund_execute" });
    if (!policy) throw unavailable("refund_operation_policy_unavailable");
    const operationEnvelope = resolveFinanceOperationEnvelope({ policy, operationKind: "refund_execute" });
    const now = this.clock.now();
    if (Number.isNaN(now.getTime())) throw unavailable("refund_clock_unavailable");
    const artifacts = this.requireArtifactConfiguration();
    const providerDispatch = await this.sealProviderDispatch({
      preparation,
      refundAmountMinor: request.refundAmountMinor,
      operationEnvelope,
      retention: artifacts.retentionPolicy,
      now
    });

    try {
      const result = await transactDrizzleFinanceAuthorizationCommand({
        database: this.postgresRuntime.database,
        operation: async ({ transaction, authorizationStore }) => {
          const currentReader = createDrizzleOnlineWalletRefundApprovalPreparationReader(transaction);
          const current = await currentReader.findForApproval({ refundCandidateId: preparation.refundCandidateId });
          if (!current || !samePreparation(preparation, current)) {
            throw new RefundApprovalUnavailableError("refund_preparation_changed");
          }
          assertRefundAmount(current, request.refundAmountMinor);
          const proof = await consumeFinanceAuthorizationGrant({
            actorUserId: account.id,
            sessionId: account.sessionId,
            sessionKind: "standard",
            actionKind: "refund_execute",
            aggregateId: current.refundCandidateId,
            expectedVersion: current.refundCandidateVersion,
            payload: authorizationPayload(current, request.refundAmountMinor),
            authorizationId: request.authorizationId,
            store: authorizationStore,
            clock: { now: () => now.toISOString() }
          });
          const authority = issueVerifiedOnlineWalletRefundApprovalAuthority({
            authorization: proof,
            refundCaseId: refundCaseId(current),
            refundCandidateId: current.refundCandidateId,
            refundCandidateReviewId: current.refundCandidateReviewId,
            refundCandidateVersion: current.refundCandidateVersion,
            orderId: current.orderId,
            captureApplicationId: current.captureApplicationId,
            walletId: current.walletId,
            economicPaymentIntentId: current.economicPaymentIntentId,
            providerAccount: current.providerAccount,
            providerPaymentId: current.providerPaymentId,
            previousCumulativeRefundedMinor: current.previousCumulativeRefundedMinor,
            approvedCumulativeRefundedMinor: cumulativeAmount(current, request.refundAmountMinor),
            approvedAt: now.toISOString()
          });
          const receipt = await approveOnlineWalletRefundInTransaction(transaction, {
            authority,
            expectedWalletRevision: current.walletRevision,
            providerDispatch
          });
          await createDrizzleAuditLogStore(transaction).createEntry({
            actorUserId: account.id,
            action: "finance.online_wallet_refund.approved",
            targetType: "finance_online_wallet_refund_case",
            targetId: receipt.refundCaseId,
            occurredAt: now.toISOString(),
            metadata: {
              refundCandidateId: current.refundCandidateId,
              candidateReviewId: current.refundCandidateReviewId,
              refundAmountMinor: request.refundAmountMinor,
              approvedCumulativeRefundedMinor: cumulativeAmount(current, request.refundAmountMinor),
              providerOperationIntentId: receipt.providerOperationIntentId,
              walletId: receipt.walletId,
              walletRevision: receipt.walletRevision
            }
          });
          return receipt;
        }
      });
      return adminOnlineWalletRefundApprovalResponseSchema.parse({
        refundCaseId: result.refundCaseId,
        walletId: result.walletId,
        walletRevision: result.walletRevision,
        providerOperationIntentId: result.providerOperationIntentId,
        status: "approved"
      });
    } catch (error) {
      if (error instanceof FinanceAuthorizationRejectedError) {
        throw new ConflictException("finance_authorization_rejected");
      }
      if (error instanceof RefundApprovalUnavailableError) {
        throw new ConflictException(error.code);
      }
      throw error;
    }
  }

  private async requirePreparation(candidateId: string): Promise<OnlineWalletRefundApprovalPreparation> {
    const preparation = await this.preparations.findForApproval({ refundCandidateId: candidateId });
    if (!preparation) throw new NotFoundException("online_wallet_refund_candidate_not_approvable");
    return preparation;
  }

  private requireArtifactConfiguration(): NonNullable<AdminApiRuntimeConfig["financeRefundDispatch"]> {
    const configuration = this.configService.getOrThrow<AdminApiRuntimeConfig>("adminApi").financeRefundDispatch;
    if (!configuration || !this.privateStorage) throw unavailable("refund_dispatch_not_configured");
    return configuration;
  }

  private async sealProviderDispatch(input: {
    readonly preparation: OnlineWalletRefundApprovalPreparation;
    readonly refundAmountMinor: string;
    readonly operationEnvelope: ReturnType<typeof resolveFinanceOperationEnvelope>;
    readonly retention: Readonly<{ policyId: string; policyVersion: string }>;
    readonly now: Date;
  }) {
    const amountMinor = safeMinorNumber(input.refundAmountMinor);
    const refundCase = refundCaseId(input.preparation);
    const providerOperationIntentId = deterministicId(
      `online-wallet-refund-provider-operation:${input.preparation.refundCandidateId}:${input.refundAmountMinor}`
    );
    const idempotencyKey = uuidV7(input.now);
    const envelope = Object.freeze({
      kind: "refund" as const,
      providerPaymentId: input.preparation.providerPaymentId,
      amount: Object.freeze({ amountMinor, currency: "RUB" as const }),
      externalId: refundCase
    });
    const bytes = canonicalizeFinanceCommandPayload(envelope);
    const digest = sha256(bytes);
    if (
      bytes.byteLength > input.operationEnvelope.maximumArtifactBytes ||
      digest !== digestFinanceCanonicalValueV1(envelope)
    ) {
      throw unavailable("refund_dispatch_artifact_invalid");
    }
    const artifactId = `arc-online-wallet-refund-request:${input.preparation.refundCandidateId}:${input.refundAmountMinor}`;
    try {
      const privateObject = await this.privateStorage!.writeImmutable({
        artifactId,
        contentType: "application/json",
        bytes,
        expectedSha256Digest: digest
      });
      if (
        privateObject.sha256Digest !== digest ||
        privateObject.byteLength !== bytes.byteLength ||
        privateObject.contentType !== "application/json"
      ) {
        throw unavailable("refund_dispatch_artifact_invalid");
      }
      const artifact = await createFinanceArtifactRegistry(this.postgresRuntime.database).registerSealedArtifact({
        artifact: { artifactId, sha256Digest: digest, byteLength: bytes.byteLength },
        artifactClass: "provider_request",
        binding: { kind: "provider", providerAccount: input.preparation.providerAccount },
        contentType: "application/json",
        privateObject,
        retentionPolicyId: input.retention.policyId,
        retentionPolicyVersion: input.retention.policyVersion
      });
      if ("bankCashPoolId" in artifact || artifact.sha256Digest !== digest) {
        throw unavailable("refund_dispatch_artifact_invalid");
      }
      return Object.freeze({
        providerOperationIntentId,
        economicPaymentIntentId: input.preparation.economicPaymentIntentId,
        expectedEconomicPaymentVersion: input.preparation.economicPaymentVersion,
        expectedProviderOperationSourceVersion: input.preparation.providerOperationSourceVersion,
        economicPaymentSessionId: null,
        providerAccount: input.preparation.providerAccount,
        dispatchArtifact: artifact,
        replacementAuthority: null,
        idempotencyKey,
        idempotencyRetentionDeadline: new Date(
          input.now.getTime() + providerIdempotencyLifetimeMs
        ).toISOString(),
        operationKind: "refund" as const,
        dispatchEnvelope: envelope,
        operationEnvelope: input.operationEnvelope
      });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      if (
        error instanceof FinancePrivateObjectStorageError ||
        error instanceof FinanceArtifactRegistryError
      ) {
        throw unavailable("refund_dispatch_unavailable");
      }
      throw error;
    }
  }
}

class RefundApprovalUnavailableError extends Error {
  constructor(readonly code: string) {
    super("Online-wallet refund approval is unavailable");
  }
}

function parseCandidate(value: string) {
  const parsed = adminOnlineWalletRefundCandidateParamsSchema.safeParse({ candidateId: value });
  if (!parsed.success) throw invalidRequest();
  return parsed.data;
}

function parseBegin(value: unknown) {
  const parsed = adminOnlineWalletRefundAuthorizationRequestSchema.safeParse(value);
  if (!parsed.success) throw invalidRequest();
  return parsed.data;
}

function parseApproval(value: unknown) {
  const parsed = adminOnlineWalletRefundApprovalRequestSchema.safeParse(value);
  if (!parsed.success) throw invalidRequest();
  return parsed.data;
}

function authorizationPayload(preparation: OnlineWalletRefundApprovalPreparation, refundAmountMinor: string) {
  return Object.freeze({
    candidateId: preparation.refundCandidateId,
    candidateReviewId: preparation.refundCandidateReviewId,
    candidateVersion: preparation.refundCandidateVersion,
    refundAmountMinor,
    currency: "RUB" as const
  });
}

function assertRefundAmount(preparation: OnlineWalletRefundApprovalPreparation, refundAmountMinor: string): void {
  const requested = BigInt(refundAmountMinor);
  const previous = BigInt(preparation.previousCumulativeRefundedMinor);
  const gross = BigInt(preparation.grossAmountMinor);
  if (requested < 1n || previous + requested > gross) {
    throw new ConflictException("refund_amount_exceeds_current_refundable_position");
  }
}

function cumulativeAmount(preparation: OnlineWalletRefundApprovalPreparation, refundAmountMinor: string): string {
  return (BigInt(preparation.previousCumulativeRefundedMinor) + BigInt(refundAmountMinor)).toString();
}

function samePreparation(
  expected: OnlineWalletRefundApprovalPreparation,
  actual: OnlineWalletRefundApprovalPreparation
): boolean {
  return (
    expected.refundCandidateId === actual.refundCandidateId &&
    expected.refundCandidateVersion === actual.refundCandidateVersion &&
    expected.refundCandidateReviewId === actual.refundCandidateReviewId &&
    expected.orderId === actual.orderId &&
    expected.captureApplicationId === actual.captureApplicationId &&
    expected.walletId === actual.walletId &&
    expected.walletRevision === actual.walletRevision &&
    expected.economicPaymentIntentId === actual.economicPaymentIntentId &&
    expected.economicPaymentVersion === actual.economicPaymentVersion &&
    expected.providerAccount.seriesId === actual.providerAccount.seriesId &&
    expected.providerAccount.providerAccountId === actual.providerAccount.providerAccountId &&
    expected.providerAccount.identityVersion === actual.providerAccount.identityVersion &&
    expected.providerPaymentId === actual.providerPaymentId &&
    expected.grossAmountMinor === actual.grossAmountMinor &&
    expected.previousCumulativeRefundedMinor === actual.previousCumulativeRefundedMinor &&
    expected.providerOperationSourceVersion === actual.providerOperationSourceVersion
  );
}

function refundCaseId(preparation: OnlineWalletRefundApprovalPreparation): string {
  return `online-wallet-refund:${preparation.refundCandidateId}`;
}

function deterministicId(value: string): string {
  const bytes = createHash("sha256").update(value).digest();
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return `${bytes.subarray(0, 4).toString("hex")}-${bytes.subarray(4, 6).toString("hex")}-${bytes.subarray(6, 8).toString("hex")}-${bytes.subarray(8, 10).toString("hex")}-${bytes.subarray(10, 16).toString("hex")}`;
}

function uuidV7(now: Date): string {
  const milliseconds = now.getTime();
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) throw unavailable("refund_clock_unavailable");
  const bytes = randomBytes(16);
  bytes[0] = Math.floor(milliseconds / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(milliseconds / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(milliseconds / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(milliseconds / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(milliseconds / 2 ** 8) & 0xff;
  bytes[5] = milliseconds & 0xff;
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return `${bytes.subarray(0, 4).toString("hex")}-${bytes.subarray(4, 6).toString("hex")}-${bytes.subarray(6, 8).toString("hex")}-${bytes.subarray(8, 10).toString("hex")}-${bytes.subarray(10, 16).toString("hex")}`;
}

function safeMinorNumber(value: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw invalidRequest();
  return result;
}

function sha256(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function invalidRequest(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: "invalid_request",
    code: "invalid_request",
    message: "Invalid online-wallet refund approval request"
  });
}

function unavailable(code: string): ServiceUnavailableException {
  return new ServiceUnavailableException({ statusCode: 503, error: code, code, message: "Refund dispatch is unavailable" });
}
