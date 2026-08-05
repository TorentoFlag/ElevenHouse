import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import {
  completeTariffInvoiceThreeDsMethodRequestSchema,
  completeTariffInvoiceThreeDsMethodResponseSchema,
  type CompleteTariffInvoiceThreeDsMethodResponse
} from "@elevenhouse/contracts";
import {
  createProviderDispatchEnvelope,
  hashFinanceCommandPayload,
  resolveFinanceOperationEnvelope,
  type FinanceOperationResourcePolicyReader,
  type FinancePrivateObjectStoragePort,
  type FinanceTransientSecretVaultPort,
  type PlatformTariffInvoiceCustomerActionReaderPort
} from "@elevenhouse/domain/finance-core";
import { PlatformTariffInvoiceThreeDsMethodCompletionPersistenceError } from "@elevenhouse/db/finance";
import { createHash, randomUUID } from "node:crypto";

import type { AstrologerApiRuntimeConfig } from "../../config/runtime-config";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import {
  ASTROLOGER_FINANCE_OPERATION_RESOURCE_POLICY_READER,
  ASTROLOGER_FINANCE_PRIVATE_OBJECT_STORAGE,
  ASTROLOGER_FINANCE_TRANSIENT_SECRET_VAULT,
  ASTROLOGER_TARIFF_INVOICE_CUSTOMER_ACTION_READER,
  ASTROLOGER_TARIFF_UNIT_OF_WORK
} from "./platform-tariffs.tokens";
import type { AstrologerTariffUnitOfWork } from "./platform-tariffs.unit-of-work";
import { ConfigService } from "@nestjs/config";

/**
 * Finishes the browser-side Method handoff for one tariff invoice. The client never receives
 * ArcPay's server transaction ID, payment ID or the sealed current-browser context.
 */
@Injectable()
export class TariffInvoiceThreeDsMethodService {
  constructor(
    @Inject(ASTROLOGER_TARIFF_INVOICE_CUSTOMER_ACTION_READER)
    private readonly actions: PlatformTariffInvoiceCustomerActionReaderPort,
    @Inject(ASTROLOGER_TARIFF_UNIT_OF_WORK)
    private readonly unitOfWork: AstrologerTariffUnitOfWork,
    @Inject(ASTROLOGER_FINANCE_OPERATION_RESOURCE_POLICY_READER)
    private readonly operationPolicies: FinanceOperationResourcePolicyReader,
    @Inject(ASTROLOGER_FINANCE_PRIVATE_OBJECT_STORAGE)
    private readonly privateStorage: FinancePrivateObjectStoragePort | null,
    @Inject(ASTROLOGER_FINANCE_TRANSIENT_SECRET_VAULT)
    private readonly transientSecretVault: FinanceTransientSecretVaultPort | null,
    @Inject(SystemClock) private readonly clock: SystemClock,
    private readonly configService: ConfigService
  ) {}

  async complete(
    request: AstrologerSessionRequest,
    invoiceId: string,
    idempotencyKey: string,
    body: unknown
  ): Promise<CompleteTariffInvoiceThreeDsMethodResponse> {
    const ownerUserId = requireAstrologerUserId(request);
    const parsed = parseRequest(body);
    const billing = this.configService.getOrThrow<AstrologerApiRuntimeConfig["billing"]>(
      "astrologerApi.billing"
    );
    if (!billing.arcPayConfigured || !billing.financeArtifactStorage || !this.privateStorage || !this.transientSecretVault) {
      throw new ServiceUnavailableException("tariff_invoice_method_completion_not_configured");
    }
    const policy = await this.operationPolicies.findPublishedForOperation({
      operationKind: "platform_invoice_complete_3ds_method"
    });
    if (!policy) throw new ServiceUnavailableException("tariff_invoice_method_completion_policy_unavailable");
    const operationEnvelope = resolveFinanceOperationEnvelope({
      policy,
      operationKind: "platform_invoice_complete_3ds_method"
    });
    const now = this.clock.now();
    try {
      const result = await this.unitOfWork.executeIdempotent({
        command: {
          scope: "astrologer.tariff_invoice.complete_3ds_method",
          idempotencyKey,
          actorUserId: ownerUserId,
          requestHash: hashFinanceCommandPayload({
            actorUserId: ownerUserId,
            operation: "astrologer.tariff_invoice.complete_3ds_method",
            invoiceId,
            request: parsed
          }),
          now: now.toISOString(),
          expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()
        },
        create: async ({ tariffInvoiceThreeDsMethodCompletion, auditLogStore }) => {
          const action = await this.actions.findPendingForOwner({ invoiceId, ownerUserId });
          if (
            !action || action.invoiceVersion !== parsed.expectedInvoiceVersion ||
            action.actionType !== "three_ds_method" || action.phase !== "method"
          ) throw new ConflictException("tariff_invoice_method_action_not_available");
          const providerOperationIntentId = randomUUID();
          // This is explicitly fresh browser data from the Method handoff, never card-setup data.
          const sealedContext = await this.transientSecretVault!.sealArcPayThreeDsMethodContext({
            secretId: `platform-tariff-invoice-method:${providerOperationIntentId}`,
            providerSetupId: action.providerPaymentId,
            browserInfo: parsed.browserInfo,
            providerExpiresAt: new Date(now.getTime() + 4 * 60 * 1000).toISOString()
          });
          const dispatchEnvelope = createProviderDispatchEnvelope({
            kind: "saved_card_charge_3ds_method",
            providerPaymentId: action.providerPaymentId,
            invoiceId: action.invoiceId,
            customerActionId: action.customerActionId,
            completionIndicator: parsed.completionIndicator,
            threeDsMethodContextSecret: sealedContext
          });
          const bytes = new TextEncoder().encode(JSON.stringify(dispatchEnvelope));
          if (bytes.byteLength > operationEnvelope.maximumArtifactBytes) {
            throw new ServiceUnavailableException("tariff_invoice_method_request_too_large");
          }
          const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;
          const artifactId = `arc-platform-tariff-invoice-method-request:${providerOperationIntentId}`;
          const privateObject = await this.privateStorage!.writeImmutable({
            artifactId,
            contentType: "application/json",
            bytes,
            expectedSha256Digest: digest
          });
          if (
            privateObject.contentType !== "application/json" ||
            privateObject.sha256Digest !== digest ||
            privateObject.byteLength !== bytes.byteLength
          ) throw new ServiceUnavailableException("tariff_invoice_method_artifact_integrity");
          const receipt = await tariffInvoiceThreeDsMethodCompletion.completeThreeDsMethod({
            invoiceId: action.invoiceId,
            expectedInvoiceVersion: action.invoiceVersion,
            customerActionId: action.customerActionId,
            completionIndicator: parsed.completionIndicator,
            threeDsMethodContextSecretRefId: `platform-tariff-invoice-method:${providerOperationIntentId}`,
            sealedThreeDsMethodContext: sealedContext,
            providerOperationIntentId,
            idempotencyKey: `platform-tariff-invoice-method:${providerOperationIntentId}`,
            idempotencyRetentionDeadline: new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString(),
            dispatchArtifact: { artifactId, sha256Digest: digest, byteLength: bytes.byteLength },
            dispatchPrivateObject: privateObject,
            retentionPolicyId: billing.financeArtifactStorage!.requestRetention.policyId,
            retentionPolicyVersion: billing.financeArtifactStorage!.requestRetention.policyVersion,
            operationEnvelope
          });
          const value = completeTariffInvoiceThreeDsMethodResponseSchema.parse({
            invoiceId: action.invoiceId,
            subscriptionId: action.subscriptionId,
            invoiceVersion: action.invoiceVersion + 1,
            state: "payment_pending"
          });
          await auditLogStore.createEntry({
            actorUserId: ownerUserId,
            action: "platform_tariff.invoice_three_ds_method_requested",
            targetType: "platform_tariff_invoice",
            targetId: action.invoiceId,
            occurredAt: now.toISOString(),
            metadata: {
              providerOperationIntentId: receipt.providerOperationIntentId,
              customerActionId: action.customerActionId,
              completionIndicator: parsed.completionIndicator
            }
          });
          return { result: value, value };
        },
        replay: async (result) => completeTariffInvoiceThreeDsMethodResponseSchema.parse(result)
      });
      return result.value;
    } catch (error) {
      throw mapError(error);
    }
  }
}

function mapError(error: unknown): ConflictException | ServiceUnavailableException {
  if (
    error instanceof BadRequestException || error instanceof ConflictException ||
    error instanceof ServiceUnavailableException || error instanceof UnauthorizedException
  ) throw error;
  if (error instanceof PlatformTariffInvoiceThreeDsMethodCompletionPersistenceError) {
    if (
      error.reason === "retryable_concurrency_conflict" ||
      error.reason === "dispatch_artifact_conflict" ||
      error.reason === "invalid_command"
    ) {
      return new ServiceUnavailableException(error.reason);
    }
    return new ConflictException(error.reason);
  }
  throw error;
}

function parseRequest(value: unknown) {
  const result = completeTariffInvoiceThreeDsMethodRequestSchema.safeParse(value);
  if (!result.success) throw new BadRequestException("Invalid tariff invoice 3DS Method completion request");
  return result.data;
}

function requireAstrologerUserId(request: AstrologerSessionRequest): string {
  const userId = request.currentAstrologerAccount?.account.id;
  if (!userId) throw new UnauthorizedException("Valid astrologer session is required");
  return userId;
}
