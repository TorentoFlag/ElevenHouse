import { ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { createDrizzleFinanceOperationResourcePolicyReader, createDrizzleOnlineWalletChargebackResolutionPreparationReader, resolveOnlineWalletChargebackInTransaction, transactDrizzleFinanceAuthorizationCommand } from "@elevenhouse/db/finance";
import { createDrizzleAuditLogStore } from "@elevenhouse/db/audit-log";
import { consumeFinanceAuthorizationGrant, FinanceAuthorizationRejectedError } from "@elevenhouse/domain";
import { digestFinanceCanonicalValueV1, issueVerifiedChargebackResolutionAuthority, resolveFinanceOperationEnvelope, type OnlineWalletChargebackResolutionPreparation } from "@elevenhouse/domain/finance-core";
import { adminChargebackResolutionAuthorizationRequestSchema, adminChargebackResolutionExecuteRequestSchema, adminChargebackResolutionResponseSchema, type AdminChargebackResolutionResponse, type BeginFinanceAuthorizationResponse } from "@elevenhouse/contracts";
import { AdminFinanceAuthorizationsService } from "../finance-authorizations/finance-authorizations.service";
import type { AdminAuthenticatedAccount } from "../identity/session/identity-current-session.service";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { SystemClock } from "../../common/system-clock.js";

@Injectable()
export class AdminChargebackResolutionsService {
  constructor(@Inject(PostgresRuntimeService) private readonly postgres: PostgresRuntimeService, @Inject(AdminFinanceAuthorizationsService) private readonly authorizations: AdminFinanceAuthorizationsService, @Inject(SystemClock) private readonly clock: SystemClock) {}

  async beginAuthorization(account: AdminAuthenticatedAccount, chargebackCaseId: string, body: unknown): Promise<BeginFinanceAuthorizationResponse> {
    const request = adminChargebackResolutionAuthorizationRequestSchema.safeParse(body);
    if (!request.success) throw new ConflictException("invalid_chargeback_resolution_request");
    const preparation = await this.preparation(chargebackCaseId, request.data.outcomeWebhookEventId);
    return this.authorizations.beginResolved(account, { actionKind: "chargeback_resolution", aggregateId: preparation.chargebackCaseId, expectedVersion: preparation.chargebackCaseVersion, payload: payload(preparation, request.data.resolution) });
  }

  async resolve(account: AdminAuthenticatedAccount, chargebackCaseId: string, body: unknown): Promise<AdminChargebackResolutionResponse> {
    const request = adminChargebackResolutionExecuteRequestSchema.safeParse(body);
    if (!request.success) throw new ConflictException("invalid_chargeback_resolution_request");
    const before = await this.preparation(chargebackCaseId, request.data.outcomeWebhookEventId);
    const policy = await createDrizzleFinanceOperationResourcePolicyReader(this.postgres.database).findPublishedForOperation({ operationKind: "chargeback_resolution" });
    if (!policy) throw new ServiceUnavailableException("chargeback_resolution_policy_unavailable");
    const envelope = resolveFinanceOperationEnvelope({ policy, operationKind: "chargeback_resolution" });
    const now = this.clock.now();
    try {
      const receipt = await transactDrizzleFinanceAuthorizationCommand({ database: this.postgres.database, operation: async ({ transaction, authorizationStore }) => {
        const current = await createDrizzleOnlineWalletChargebackResolutionPreparationReader(transaction).findForResolution({ chargebackCaseId: before.chargebackCaseId, outcomeWebhookEventId: before.outcomeWebhookEventId });
        if (!current || !same(before, current)) throw new ConflictException("chargeback_resolution_preparation_changed");
        const proof = await consumeFinanceAuthorizationGrant({ actorUserId: account.id, sessionId: account.sessionId, sessionKind: "standard", actionKind: "chargeback_resolution", aggregateId: current.chargebackCaseId, expectedVersion: current.chargebackCaseVersion, payload: payload(current, request.data.resolution), authorizationId: request.data.authorizationId, store: authorizationStore, clock: { now: () => now.toISOString() } });
        const authority = issueVerifiedChargebackResolutionAuthority({ authorization: proof, chargebackCaseId: current.chargebackCaseId, chargebackCaseVersion: current.chargebackCaseVersion, outcomeWebhookEventId: current.outcomeWebhookEventId, resolution: request.data.resolution, providerAccount: current.providerAccount, providerPaymentId: current.providerPaymentId, cumulativePrincipalMinor: current.cumulativePrincipalMinor, outcomeArtifact: current.outcomeArtifact, observedAt: current.outcomeObservedAt, decidedAt: now.toISOString() });
        const result = await resolveOnlineWalletChargebackInTransaction(transaction, { chargebackCaseId: current.chargebackCaseId, expectedChargebackVersion: current.chargebackCaseVersion, walletId: current.walletId, expectedWalletRevision: current.walletRevision, expectedPrincipalPositionVersion: "1", expectedRecoveryPositionVersion: "1", resolutionAuthority: authority, operationEnvelope: envelope });
        await createDrizzleAuditLogStore(transaction).createEntry({ actorUserId: account.id, action: "finance.chargeback.resolved", targetType: "finance_online_wallet_chargeback_case", targetId: result.chargebackCaseId, occurredAt: now.toISOString(), metadata: { outcomeWebhookEventId: current.outcomeWebhookEventId, resolution: result.resolution, evidenceDigest: current.outcomeArtifact.sha256Digest } });
        return result;
      }});
      return adminChargebackResolutionResponseSchema.parse({ chargebackCaseId: receipt.chargebackCaseId, resolution: receipt.resolution, status: "resolved" });
    } catch (error) { if (error instanceof FinanceAuthorizationRejectedError) throw new ConflictException("finance_authorization_rejected"); throw error; }
  }
  private async preparation(caseId: string, eventId: string): Promise<OnlineWalletChargebackResolutionPreparation> { const p = await createDrizzleOnlineWalletChargebackResolutionPreparationReader(this.postgres.database).findForResolution({ chargebackCaseId: caseId, outcomeWebhookEventId: eventId }); if (!p) throw new NotFoundException("chargeback_resolution_not_approvable"); return p; }
}
function payload(p: OnlineWalletChargebackResolutionPreparation, resolution: "won" | "lost") { return { chargebackCaseId: p.chargebackCaseId, chargebackCaseVersion: p.chargebackCaseVersion, outcomeWebhookEventId: p.outcomeWebhookEventId, resolution, currency: "RUB" as const }; }
function same(a: OnlineWalletChargebackResolutionPreparation, b: OnlineWalletChargebackResolutionPreparation) { return digestFinanceCanonicalValueV1(a) === digestFinanceCanonicalValueV1(b); }
